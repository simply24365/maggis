#!/usr/bin/env tsx

import { promises as fs } from 'fs';
import path from 'path';
import sharp from 'sharp';
import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';

// =================================================================
// SECTION 1: CENTRALIZED TYPES (No changes)
// =================================================================

type VertexId = number;

interface ProjectedBounds {
  minX: number; maxX: number;
  minY: number; maxY: number;
  minZ: number; maxZ: number;
}

interface Vertex { id: VertexId; x: number; y: number; z: number; }
interface Triangle { id: number; vertexIds: [VertexId, VertexId, VertexId]; }

interface PolygonData {
  vertexCount: number;
  triangleCount: number;
  vertices: Vertex[];
  triangles: Triangle[];
  bounds: ProjectedBounds;
}

interface TimeSeriesRecord {
  nodeId: VertexId;
  timestamp: number;
  velocityX: number;
  velocityY: number;
  waterDepth: number;
  velocityMagnitude: number;
  waterElevation: number;
  inflowRate: number;
}
type TimeSeriesData = TimeSeriesRecord[];

interface ArrayWithMinMax {
  array: Float32Array;
  min?: number;
  max?: number;
}

interface FlowData {
  u: ArrayWithMinMax;
  v: ArrayWithMinMax;
  speed?: ArrayWithMinMax;
  width: number;
  height: number;
  bounds: {
    west: number;
    south: number;
    east: number;
    north: number;
  };
}


// =================================================================
// SECTION 2: SPATIAL ACCELERATION STRUCTURE (New)
// =================================================================

class SpatialGrid {
    private grid: number[][][];
    private bounds: ProjectedBounds;
    private gridResolution: number;
    private cellWidth: number;
    private cellHeight: number;
    private triangles: Triangle[];
    private vertexMap: Map<number, Vertex>;

    constructor(polygon: PolygonData, gridResolution: number = 64) {
        this.bounds = polygon.bounds;
        this.triangles = polygon.triangles;
        this.vertexMap = new Map(polygon.vertices.map(v => [v.id, v]));
        this.gridResolution = gridResolution;
        
        this.cellWidth = (this.bounds.maxX - this.bounds.minX) / gridResolution;
        this.cellHeight = (this.bounds.maxY - this.bounds.minY) / gridResolution;

        // 그리드 초기화
        this.grid = Array.from({ length: gridResolution }, () =>
            Array.from({ length: gridResolution }, () => [])
        );

        this.buildIndex();
    }

    private buildIndex() {
        for (let i = 0; i < this.triangles.length; i++) {
            const tri = this.triangles[i];
            const v1 = this.vertexMap.get(tri.vertexIds[0])!;
            const v2 = this.vertexMap.get(tri.vertexIds[1])!;
            const v3 = this.vertexMap.get(tri.vertexIds[2])!;
            
            // 삼각형의 경계 상자 계산
            const triBounds = {
                minX: Math.min(v1.x, v2.x, v3.x),
                maxX: Math.max(v1.x, v2.x, v3.x),
                minY: Math.min(v1.y, v2.y, v3.y),
                maxY: Math.max(v1.y, v2.y, v3.y),
            };

            // 경계 상자가 겹치는 그리드 셀 찾기
            const startCol = Math.floor((triBounds.minX - this.bounds.minX) / this.cellWidth);
            const endCol = Math.floor((triBounds.maxX - this.bounds.minX) / this.cellWidth);
            const startRow = Math.floor((triBounds.minY - this.bounds.minY) / this.cellHeight);
            const endRow = Math.floor((triBounds.maxY - this.bounds.minY) / this.cellHeight);
            
            // 해당 셀에 삼각형 인덱스 추가
            for (let row = Math.max(0, startRow); row <= Math.min(this.gridResolution - 1, endRow); row++) {
                for (let col = Math.max(0, startCol); col <= Math.min(this.gridResolution - 1, endCol); col++) {
                    this.grid[row][col].push(i);
                }
            }
        }
    }

    /** 특정 좌표에 대한 후보 삼각형들의 인덱스를 반환합니다. */
    public getCandidateTriangles(x: number, y: number): number[] {
        if (x < this.bounds.minX || x > this.bounds.maxX || y < this.bounds.minY || y > this.bounds.maxY) {
            return [];
        }

        const col = Math.floor((x - this.bounds.minX) / this.cellWidth);
        const row = Math.floor((y - this.bounds.minY) / this.cellHeight);
        
        // 경계 값 처리
        const safeCol = Math.max(0, Math.min(this.gridResolution - 1, col));
        const safeRow = Math.max(0, Math.min(this.gridResolution - 1, row));
        
        return this.grid[safeRow][safeCol];
    }
}


// =================================================================
// SECTION 3: RAW FILE PARSERS (No changes)
// =================================================================

function calculateSpatialBounds(vertices: Vertex[]): ProjectedBounds { /* ... same as before ... */ return vertices.reduce((acc,v)=>({minX:Math.min(acc.minX,v.x),maxX:Math.max(acc.maxX,v.x),minY:Math.min(acc.minY,v.y),maxY:Math.max(acc.maxY,v.y),minZ:Math.min(acc.minZ,v.z),maxZ:Math.max(acc.maxZ,v.z)}),{minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity,minZ:Infinity,maxZ:-Infinity}); }
function parsePolygonText(text: string): PolygonData { /* ... same as before ... */ const lines=text.trim().split(/\r?\n/),header=lines[0].trim().split(/\s+/);if(header.length<3)throw new Error("Malformed polygon header");const vertexCount=Number(header[1]),triangleCount=Number(header[2]),vertices:Vertex[]=[],triangles:Triangle[]=[];for(const line of lines.slice(1)){const parts=line.trim().split(/\s+/);if(parts.length<2)continue;const[type,...rest]=parts;if(type==="GN"&&rest.length>=4){const[idStr,xStr,yStr,zStr]=rest;vertices.push({id:Number(idStr),x:Number(xStr),y:Number(yStr),z:Number(zStr)})}else if(type==="GE"&&rest.length>=4){const[idStr,v1Str,v2Str,v3Str]=rest;triangles.push({id:Number(idStr),vertexIds:[Number(v1Str)as VertexId,Number(v2Str)as VertexId,Number(v3Str)as VertexId]})}}const bounds=calculateSpatialBounds(vertices);return{vertexCount,triangleCount,vertices,triangles,bounds}}
function parseTimeSeriesCsv(text: string): TimeSeriesData { /* ... same as before ... */ return text.trim().split("\n").slice(1).map(line=>{const trimmedLine=line.trim();if(!trimmedLine)return null;const[nodeId,timestamp,velocityX,velocityY,waterDepth,velocityMagnitude,waterElevation,inflowRate]=trimmedLine.split(",").map(Number);return{nodeId:nodeId as VertexId,timestamp,velocityX,velocityY,waterDepth,velocityMagnitude,waterElevation,inflowRate}}).filter((item):item is TimeSeriesRecord=>item!==null)}
async function deserializePolygonFromFile(filePath: string): Promise<PolygonData> { const fileContent = await fs.readFile(filePath, 'utf-8'); return parsePolygonText(fileContent); }
async function deserializeTimeSeriesFromFile(filePath: string): Promise<TimeSeriesData> { const fileContent = await fs.readFile(filePath, 'utf-8'); return parseTimeSeriesCsv(fileContent); }


// =================================================================
// SECTION 4: CORE GENERATION LOGIC (Updated with SpatialGrid)
// =================================================================

function isPointInTriangle(px: number, py: number, v1: Vertex, v2: Vertex, v3: Vertex): boolean { /* ... same as before ... */ const d1=(px-v2.x)*(v1.y-v2.y)-(v1.x-v2.x)*(py-v2.y),d2=(px-v3.x)*(v2.y-v3.y)-(v2.x-v3.x)*(py-v3.y),d3=(px-v1.x)*(v3.y-v1.y)-(v3.x-v1.x)*(py-v1.y),has_neg=d1<0||d2<0||d3<0,has_pos=d1>0||d2>0||d3>0;return!(has_neg&&has_pos)}

/** 폴리곤 영역을 나타내는 흑백 마스크 PNG를 생성합니다. (가속화 적용) */
async function generatePolygonMaskPng(polygon: PolygonData, size: number, grid: SpatialGrid): Promise<Buffer> {
    const { bounds, vertices, triangles } = polygon;
    const buffer = Buffer.alloc(size * size);
    const vertexMap = new Map(vertices.map(v => [v.id, v]));

    for (let j = 0; j < size; j++) {
        for (let i = 0; i < size; i++) {
            const x = bounds.minX + (i / (size - 1)) * (bounds.maxX - bounds.minX);
            const y = bounds.minY + (j / (size - 1)) * (bounds.maxY - bounds.minY);

            const candidateIndices = grid.getCandidateTriangles(x, y);
            let isInside = false;
            for (const triIndex of candidateIndices) {
                const tri = triangles[triIndex];
                const v1 = vertexMap.get(tri.vertexIds[0])!;
                const v2 = vertexMap.get(tri.vertexIds[1])!;
                const v3 = vertexMap.get(tri.vertexIds[2])!;
                if (isPointInTriangle(x, y, v1, v2, v3)) {
                    isInside = true;
                    break;
                }
            }
            buffer[j * size + i] = isInside ? 255 : 0;
        }
    }
    return sharp(buffer, { raw: { width: size, height: size, channels: 1 } }).png().toBuffer();
}

// =================================================================
// SECTION 5: CLI HANDLERS
// =================================================================

async function handleMaskTexture(argv: any) {
    const { size, outputDir, polygonPath } = argv;
    console.log(`🎭 마스크 텍스처 생성을 시작합니다...`);
    console.log(`   - 폴리곤 파일: ${polygonPath}`);
    console.log(`   - 텍스처 크기: ${size}x${size}`);
    console.log(`   - 출력 디렉토리: ${outputDir}`);
    
    await fs.mkdir(outputDir, { recursive: true });

    const polygon = await deserializePolygonFromFile(polygonPath);
    console.log(`⚡ 공간 그리드 인덱스 생성 중...`);
    const grid = new SpatialGrid(polygon); // 그리드 생성
    console.log(`   - ✅ 그리드 인덱스 생성 완료.`);

    const maskBuffer = await generatePolygonMaskPng(polygon, size, grid); // 그리드 전달
    const outputPath = path.join(outputDir, 'mask.png');
    await fs.writeFile(outputPath, maskBuffer);

    console.log(`🎉 마스크 텍스처가 ${outputPath}에 저장되었습니다.`);
}

async function handleGenerateFlowJsonAllTime(argv: any) {
    const { inputDir, textureSize = 1024, outputDir = inputDir, polygonPath } = argv;
    console.log(`🌊 모든 시계열에 대한 FlowData JSON 생성을 시작합니다...`);
    console.log(`   - 입력 디렉토리: ${inputDir}`);
    console.log(`   - 텍스처 크기: ${textureSize}x${textureSize}`);
    console.log(`   - 출력 디렉토리: ${outputDir}`);
    console.log(`   - 폴리곤 파일: ${polygonPath}`);

    try {
        await fs.mkdir(outputDir, { recursive: true });

        // Find all CSV files with digit pattern
        const csvFiles = (await fs.readdir(inputDir))
            .filter(f => f.endsWith('.csv') && /^\d+\.csv$/.test(f))
            .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

        if (csvFiles.length === 0) {
            throw new Error('입력 디렉토리에서 숫자 패턴의 CSV 파일을 찾을 수 없습니다.');
        }

        console.log(`   - 발견된 CSV 파일: ${csvFiles.length}개`);

        // Load polygon data from specified path
        const polygon = await deserializePolygonFromFile(polygonPath);
        console.log(`   - 폴리곤 데이터 로드 완료`);

        // Create spatial grid for acceleration
        const grid = new SpatialGrid(polygon);

        // Process each CSV file
        for (let i = 0; i < csvFiles.length; i++) {
            const csvFile = csvFiles[i];
            const timeStep = path.basename(csvFile, '.csv');
            console.log(`\n[${i + 1}/${csvFiles.length}] 처리 중: ${csvFile}`);

            // Load time series data
            const timeSeriesData = await deserializeTimeSeriesFromFile(path.join(inputDir, csvFile));
            
            // Generate velocity field
            const flowData = await generateFlowDataFromTimeSeries(
                polygon, 
                timeSeriesData, 
                textureSize, 
                grid
            );

            // Save FlowData JSON
            const outputPath = path.join(outputDir, `flow_${timeStep}.json`);
            await fs.writeFile(outputPath, JSON.stringify(flowData, null, 2));
            console.log(`   - ✅ flow_${timeStep}.json 저장 완료`);
        }

        console.log(`\n🎉 모든 FlowData JSON 파일 생성이 완료되었습니다!`);

    } catch (error: any) {
        console.error(`❌ 오류 발생: ${error.message}`);
        process.exit(1);
    }
}

async function generateFlowDataFromTimeSeries(
    polygon: PolygonData,
    timeSeriesData: TimeSeriesData,
    size: number,
    grid: SpatialGrid
): Promise<FlowData> {
    const { bounds, vertices, triangles } = polygon;
    const totalPixels = size * size;
    
    // Initialize arrays
    const uArray = new Float32Array(totalPixels);
    const vArray = new Float32Array(totalPixels);
    const speedArray = new Float32Array(totalPixels);
    
    const vertexMap = new Map(vertices.map(v => [v.id, v]));
    const velocityMap = new Map(timeSeriesData.map(v => [v.nodeId, v]));

    let uMin = Infinity, uMax = -Infinity;
    let vMin = Infinity, vMax = -Infinity;
    let speedMin = Infinity, speedMax = -Infinity;

    // Generate velocity field for each pixel
    for (let j = 0; j < size; j++) {
        for (let i = 0; i < size; i++) {
            const x = bounds.minX + (i / (size - 1)) * (bounds.maxX - bounds.minX);
            const y = bounds.minY + (j / (size - 1)) * (bounds.maxY - bounds.minY);
            const arrayIndex = j * size + i;

            let interpolated: { vx: number, vy: number } | null = null;
            const candidateIndices = grid.getCandidateTriangles(x, y);

            // Find triangle containing this point and interpolate velocity
            for (const triIndex of candidateIndices) {
                const tri = triangles[triIndex];
                const v1 = vertexMap.get(tri.vertexIds[0])!;
                const v2 = vertexMap.get(tri.vertexIds[1])!;
                const v3 = vertexMap.get(tri.vertexIds[2])!;

                if (isPointInTriangle(x, y, v1, v2, v3)) {
                    // Get velocity data for triangle vertices
                    const vel1 = velocityMap.get(tri.vertexIds[0]);
                    const vel2 = velocityMap.get(tri.vertexIds[1]);
                    const vel3 = velocityMap.get(tri.vertexIds[2]);

                    if (vel1 && vel2 && vel3) {
                        // Perform barycentric interpolation
                        const denom = (v2.y - v3.y) * (v1.x - v3.x) + (v3.x - v2.x) * (v1.y - v3.y);
                        if (Math.abs(denom) > 1e-10) {
                            const w1 = ((v2.y - v3.y) * (x - v3.x) + (v3.x - v2.x) * (y - v3.y)) / denom;
                            const w2 = ((v3.y - v1.y) * (x - v3.x) + (v1.x - v3.x) * (y - v3.y)) / denom;
                            const w3 = 1 - w1 - w2;

                            interpolated = {
                                vx: w1 * vel1.velocityX + w2 * vel2.velocityX + w3 * vel3.velocityX,
                                vy: w1 * vel1.velocityY + w2 * vel2.velocityY + w3 * vel3.velocityY
                            };
                        }
                    }
                    break;
                }
            }

            if (interpolated) {
                // Store velocity components (no normalization needed)
                uArray[arrayIndex] = interpolated.vx;
                vArray[arrayIndex] = interpolated.vy;
                const speed = Math.sqrt(interpolated.vx * interpolated.vx + interpolated.vy * interpolated.vy);
                speedArray[arrayIndex] = speed;

                // Update min/max values
                uMin = Math.min(uMin, interpolated.vx);
                uMax = Math.max(uMax, interpolated.vx);
                vMin = Math.min(vMin, interpolated.vy);
                vMax = Math.max(vMax, interpolated.vy);
                speedMin = Math.min(speedMin, speed);
                speedMax = Math.max(speedMax, speed);
            } else {
                // No data - set to zero
                uArray[arrayIndex] = 0;
                vArray[arrayIndex] = 0;
                speedArray[arrayIndex] = 0;
            }
        }
    }

    // Handle case where no valid data was found
    if (uMin === Infinity) {
        uMin = uMax = vMin = vMax = speedMin = speedMax = 0;
    }

    // Create FlowData object
    const flowData: FlowData = {
        u: {
            array: uArray,
            min: uMin,
            max: uMax
        },
        v: {
            array: vArray,
            min: vMin,
            max: vMax
        },
        speed: {
            array: speedArray,
            min: speedMin,
            max: speedMax
        },
        width: size,
        height: size,
        bounds: {
            west: bounds.minX,
            south: bounds.minY,
            east: bounds.maxX,
            north: bounds.maxY
        }
    };

    return flowData;
}

// =================================================================
// SECTION 6: YARGS CLI SETUP
// =================================================================

yargs(hideBin(process.argv))
  .command(
    'mask-texture',
    '폴리곤 마스크 텍스처를 생성합니다',
    (y) => y
      .option('polygon-path', {
        type: 'string',
        demandOption: true,
        describe: '폴리곤 파일(.raw) 경로'
      })
      .option('output-dir', {
        type: 'string',
        demandOption: true,
        describe: '출력 디렉토리 경로'
      })
      .option('size', {
        type: 'number',
        default: 512,
        describe: '텍스처 크기 (픽셀)'
      }),
    handleMaskTexture
  )
  .command(
    'generate-flow-json-all-time',
    '모든 시계열에 대한 FlowData JSON 파일을 생성합니다',
    (y) => y
      .option('input-dir', {
        type: 'string',
        demandOption: true,
        describe: 'CSV 파일들이 있는 입력 디렉토리 경로'
      })
      .option('polygon-path', {
        type: 'string',
        demandOption: true,
        describe: '폴리곤 파일(.raw) 경로'
      })
      .option('texture-size', {
        type: 'number',
        default: 1024,
        describe: '텍스처 크기 (픽셀, 기본값: 1024)'
      })
      .option('output-dir', {
        type: 'string',
        describe: '출력 디렉토리 경로 (기본값: 입력 디렉토리와 동일)'
      }),
    handleGenerateFlowJsonAllTime
  )
  .demandCommand(1, '하나의 명령어를 선택해야 합니다.')
  .strict()
  .help()
  .alias('h', 'help')
  .argv;