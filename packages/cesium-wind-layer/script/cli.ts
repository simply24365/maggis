#!/usr/bin/env tsx

import { promises as fs } from 'fs';
import path from 'path';
import sharp from 'sharp';
import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import proj4 from 'proj4';

proj4.defs(
  "EPSG:5186",
  "+proj=tmerc +lat_0=38 +lon_0=127 +k=1 "
  +"+x_0=200000 +y_0=600000 "
  +"+ellps=GRS80 +towgs84=0,0,0,0,0,0,0 "
  +"+units=m +no_defs +type=crs"
);

// =================================================================
// SECTION 1: CENTRALIZED TYPES (No changes)
// =================================================================

type VertexId = number;

interface ProjectedBounds {
  minLon: number; maxLon: number;
  minLat: number; maxLat: number;
  minZ: number; maxZ: number;
}

interface Vertex { id: VertexId; lon: number; lat: number; z: number; }
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
  array: number[];
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
        
        this.cellWidth = (this.bounds.maxLon - this.bounds.minLon) / gridResolution;
        this.cellHeight = (this.bounds.maxLat - this.bounds.minLat) / gridResolution;

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
                minLon: Math.min(v1.lon, v2.lon, v3.lon),
                maxLon: Math.max(v1.lon, v2.lon, v3.lon),
                minLat: Math.min(v1.lat, v2.lat, v3.lat),
                maxLat: Math.max(v1.lat, v2.lat, v3.lat),
            };

            // 경계 상자가 겹치는 그리드 셀 찾기
            const startCol = Math.floor((triBounds.minLon - this.bounds.minLon) / this.cellWidth);
            const endCol = Math.floor((triBounds.maxLon - this.bounds.minLon) / this.cellWidth);
            const startRow = Math.floor((triBounds.minLat - this.bounds.minLat) / this.cellHeight);
            const endRow = Math.floor((triBounds.maxLat - this.bounds.minLat) / this.cellHeight);
            
            // 해당 셀에 삼각형 인덱스 추가
            for (let row = Math.max(0, startRow); row <= Math.min(this.gridResolution - 1, endRow); row++) {
                for (let col = Math.max(0, startCol); col <= Math.min(this.gridResolution - 1, endCol); col++) {
                    this.grid[row][col].push(i);
                }
            }
        }
    }

    /** 특정 좌표에 대한 후보 삼각형들의 인덱스를 반환합니다. */
    public getCandidateTriangles(lon: number, lat: number): number[] {
        if (lon < this.bounds.minLon || lon > this.bounds.maxLon || lat < this.bounds.minLat || lat > this.bounds.maxLat) {
            return [];
        }

        const col = Math.floor((lon - this.bounds.minLon) / this.cellWidth);
        const row = Math.floor((lat - this.bounds.minLat) / this.cellHeight);
        
        // 경계 값 처리
        const safeCol = Math.max(0, Math.min(this.gridResolution - 1, col));
        const safeRow = Math.max(0, Math.min(this.gridResolution - 1, row));
        
        return this.grid[safeRow][safeCol];
    }
}


// =================================================================
// SECTION 3: RAW FILE PARSERS (No changes)
// =================================================================

function calculateSpatialBounds(vertices: Vertex[]): ProjectedBounds { 
    return vertices.reduce((acc,v)=>({
        minLon:Math.min(acc.minLon,v.lon),
        maxLon:Math.max(acc.maxLon,v.lon),
        minLat:Math.min(acc.minLat,v.lat),
        maxLat:Math.max(acc.maxLat,v.lat),
        minZ:Math.min(acc.minZ,v.z),
        maxZ:Math.max(acc.maxZ,v.z)
    }),{
        minLon:Infinity,maxLon:-Infinity,
        minLat:Infinity,maxLat:-Infinity,
        minZ:Infinity,maxZ:-Infinity
    }); 
}
function parsePolygonText(text: string): PolygonData {
    const lines = text.trim().split(/\r?\n/);
    const header = lines[0].trim().split(/\s+/);
    if (header.length < 3) throw new Error("Malformed polygon header");
    
    const vertexCount = Number(header[1]);
    const triangleCount = Number(header[2]);
    const vertices: Vertex[] = [];
    const triangles: Triangle[] = [];
    
    for (const line of lines.slice(1)) {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 2) continue;
        const [type, ...rest] = parts;
        
        if (type === "GN" && rest.length >= 4) {
            const [idStr, xStr, yStr, zStr] = rest;
            const [lon, lat] = proj4('EPSG:5186', 'EPSG:4326', [Number(xStr), Number(yStr)]);
            vertices.push({
                id: Number(idStr),
                lon: lon,
                lat: lat,
                z: Number(zStr)
            });
        } else if (type === "GE" && rest.length >= 4) {
            const [idStr, v1Str, v2Str, v3Str] = rest;
            triangles.push({
                id: Number(idStr),
                vertexIds: [Number(v1Str) as VertexId, Number(v2Str) as VertexId, Number(v3Str) as VertexId]
            });
        }
    }
    
    const bounds = calculateSpatialBounds(vertices);
    return { vertexCount, triangleCount, vertices, triangles, bounds };
}
function parseTimeSeriesCsv(text: string): TimeSeriesData { /* ... same as before ... */ return text.trim().split("\n").slice(1).map(line=>{const trimmedLine=line.trim();if(!trimmedLine)return null;const[nodeId,timestamp,velocityX,velocityY,waterDepth,velocityMagnitude,waterElevation,inflowRate]=trimmedLine.split(",").map(Number);return{nodeId:nodeId as VertexId,timestamp,velocityX,velocityY,waterDepth,velocityMagnitude,waterElevation,inflowRate}}).filter((item):item is TimeSeriesRecord=>item!==null)}
async function deserializePolygonFromFile(filePath: string): Promise<PolygonData> { const fileContent = await fs.readFile(filePath, 'utf-8'); return parsePolygonText(fileContent); }
async function deserializeTimeSeriesFromFile(filePath: string): Promise<TimeSeriesData> { const fileContent = await fs.readFile(filePath, 'utf-8'); return parseTimeSeriesCsv(fileContent); }


// =================================================================
// SECTION 4: CORE GENERATION LOGIC (Updated with SpatialGrid)
// =================================================================

function isPointInTriangle(pLon: number, pLat: number, v1: Vertex, v2: Vertex, v3: Vertex): boolean {
    const d1 = (pLon - v2.lon) * (v1.lat - v2.lat) - (v1.lon - v2.lon) * (pLat - v2.lat);
    const d2 = (pLon - v3.lon) * (v2.lat - v3.lat) - (v2.lon - v3.lon) * (pLat - v3.lat);
    const d3 = (pLon - v1.lon) * (v3.lat - v1.lat) - (v3.lon - v1.lon) * (pLat - v1.lat);
    const has_neg = d1 < 0 || d2 < 0 || d3 < 0;
    const has_pos = d1 > 0 || d2 > 0 || d3 > 0;
    return !(has_neg && has_pos);
}

/** 폴리곤 영역을 나타내는 흑백 마스크 PNG를 생성합니다. (가속화 적용) */
async function generatePolygonMaskPng(polygon: PolygonData, size: number, grid: SpatialGrid): Promise<Buffer> {
    const { bounds, vertices, triangles } = polygon;
    const buffer = Buffer.alloc(size * size);
    const vertexMap = new Map(vertices.map(v => [v.id, v]));

    for (let j = 0; j < size; j++) {
        for (let i = 0; i < size; i++) {
            const lon = bounds.minLon + (i / (size - 1)) * (bounds.maxLon - bounds.minLon);
            const lat = bounds.minLat + (j / (size - 1)) * (bounds.maxLat - bounds.minLat);

            const candidateIndices = grid.getCandidateTriangles(lon, lat);
            let isInside = false;
            for (const triIndex of candidateIndices) {
                const tri = triangles[triIndex];
                const v1 = vertexMap.get(tri.vertexIds[0])!;
                const v2 = vertexMap.get(tri.vertexIds[1])!;
                const v3 = vertexMap.get(tri.vertexIds[2])!;
                if (isPointInTriangle(lon, lat, v1, v2, v3)) {
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

async function handleGenerateFlowJson(argv: any) {
    const { inputFile, textureSize = 1024, outputFile, polygonPath } = argv;
    console.log(`🌊 단일 시점 FlowData JSON 생성을 시작합니다...`);
    console.log(`   - 입력 파일: ${inputFile}`);
    console.log(`   - 텍스처 크기: ${textureSize}x${textureSize}`);
    console.log(`   - 출력 파일: ${outputFile}`);
    console.log(`   - 폴리곤 파일: ${polygonPath}`);

    try {
        // Load polygon data from specified path
        const polygon = await deserializePolygonFromFile(polygonPath);
        console.log(`   - 폴리곤 데이터 로드 완료`);

        // Load time series data
        const timeSeriesData = await deserializeTimeSeriesFromFile(inputFile);
        console.log(`   - 시계열 데이터 로드 완료 (${timeSeriesData.length}개 레코드)`);

        // Create spatial grid for acceleration
        const grid = new SpatialGrid(polygon);

        // Generate velocity field
        const flowData = await generateFlowDataFromTimeSeries(
            polygon, 
            timeSeriesData, 
            textureSize, 
            grid
        );

        // Save FlowData JSON
        await fs.writeFile(outputFile, JSON.stringify(flowData, null, 2));
        console.log(`🎉 FlowData JSON 파일이 ${outputFile}에 저장되었습니다!`);

    } catch (error: any) {
        console.error(`❌ 오류 발생: ${error.message}`);
        process.exit(1);
    }
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
            const lon = bounds.minLon + (i / (size - 1)) * (bounds.maxLon - bounds.minLon);
            const lat = bounds.minLat + (j / (size - 1)) * (bounds.maxLat - bounds.minLat);
            const arrayIndex = j * size + i;

            let interpolated: { vx: number, vy: number } | null = null;
            const candidateIndices = grid.getCandidateTriangles(lon, lat);

            // Find triangle containing this point and interpolate velocity
            for (const triIndex of candidateIndices) {
                const tri = triangles[triIndex];
                const v1 = vertexMap.get(tri.vertexIds[0])!;
                const v2 = vertexMap.get(tri.vertexIds[1])!;
                const v3 = vertexMap.get(tri.vertexIds[2])!;

                if (isPointInTriangle(lon, lat, v1, v2, v3)) {
                    // Get velocity data for triangle vertices
                    const vel1 = velocityMap.get(tri.vertexIds[0]);
                    const vel2 = velocityMap.get(tri.vertexIds[1]);
                    const vel3 = velocityMap.get(tri.vertexIds[2]);

                    if (vel1 && vel2 && vel3) {
                        // Perform barycentric interpolation
                        const denom = (v2.lat - v3.lat) * (v1.lon - v3.lon) + (v3.lon - v2.lon) * (v1.lat - v3.lat);
                        if (Math.abs(denom) > 1e-10) {
                            const w1 = ((v2.lat - v3.lat) * (lon - v3.lon) + (v3.lon - v2.lon) * (lat - v3.lat)) / denom;
                            const w2 = ((v3.lat - v1.lat) * (lon - v3.lon) + (v1.lon - v3.lon) * (lat - v3.lat)) / denom;
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
            array: Array.from(uArray),
            min: uMin,
            max: uMax
        },
        v: {
            array: Array.from(vArray),
            min: vMin,
            max: vMax
        },
        speed: {
            array: Array.from(speedArray),
            min: speedMin,
            max: speedMax
        },
        width: size,
        height: size,
        bounds: {
            west: bounds.minLon,
            south: bounds.minLat,
            east: bounds.maxLon,
            north: bounds.maxLat
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
    'generate-flow-json',
    '단일 시점에 대한 FlowData JSON 파일을 생성합니다',
    (y) => y
      .option('input-file', {
        type: 'string',
        demandOption: true,
        describe: 'CSV 파일 경로'
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
      .option('output-file', {
        type: 'string',
        demandOption: true,
        describe: '출력 JSON 파일 경로'
      }),
    handleGenerateFlowJson
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