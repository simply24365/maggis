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

interface VelocityStats { vxMax: number; vyMax: number; }

interface MetaJson {
  vxMax: number;
  vyMax: number;
  num_time: number;
  size: number;
  bounds: ProjectedBounds;
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

function normalizeAndEncode(v: number, vMax: number): number { /* ... same as before ... */ if(vMax===0)return 128;const normalized=Math.max(-1,Math.min(1,v/vMax));return(normalized+1)*127.5}

/** 속도 데이터를 R, G 채널에 인코딩한 PNG를 생성합니다. (가속화 적용) */
async function generateVelocityPng(
  polygon: PolygonData,
  timeStepData: TimeSeriesData,
  stats: VelocityStats,
  size: number,
  grid: SpatialGrid
): Promise<Buffer> {
    const { bounds, vertices, triangles } = polygon;
    const buffer = Buffer.alloc(size * size * 4);
    const vertexMap = new Map(vertices.map(v => [v.id, v]));
    const velocityMap = new Map(timeStepData.map(v => [v.nodeId, v]));

    for (let j = 0; j < size; j++) {
        for (let i = 0; i < size; i++) {
            const x = bounds.minX + (i / (size - 1)) * (bounds.maxX - bounds.minX);
            const y = bounds.minY + (j / (size - 1)) * (bounds.maxY - bounds.minY);
            const pixelIndex = (j * size + i) * 4;

            let interpolated: { vx: number, vy: number } | null = null;
            const candidateIndices = grid.getCandidateTriangles(x, y);

            for (const triIndex of candidateIndices) {
                const tri = triangles[triIndex];
                const v1 = vertexMap.get(tri.vertexIds[0])!;
                const v2 = vertexMap.get(tri.vertexIds[1])!;
                const v3 = vertexMap.get(tri.vertexIds[2])!;

                if (isPointInTriangle(x, y, v1, v2, v3)) {
                    const vel1 = velocityMap.get(v1.id);
                    const vel2 = velocityMap.get(v2.id);
                    const vel3 = velocityMap.get(v3.id);
                    if (!vel1 || !vel2 || !vel3) continue;

                    const den = ((v2.y - v3.y) * (v1.x - v3.x) + (v3.x - v2.x) * (v1.y - v3.y));
                    if (Math.abs(den) > 1e-10) {
                        const w1 = ((v2.y - v3.y) * (x - v3.x) + (v3.x - v2.x) * (y - v3.y)) / den;
                        const w2 = ((v3.y - v1.y) * (x - v3.x) + (v1.x - v3.x) * (y - v3.y)) / den;
                        const w3 = 1.0 - w1 - w2;
                        interpolated = {
                            vx: w1 * vel1.velocityX + w2 * vel2.velocityX + w3 * vel3.velocityX,
                            vy: w1 * vel1.velocityY + w2 * vel2.velocityY + w3 * vel3.velocityY,
                        };
                    }
                    break; // 첫 번째 삼각형을 찾으면 중단
                }
            }

            if (interpolated) {
                buffer[pixelIndex] = normalizeAndEncode(interpolated.vx, stats.vxMax);
                buffer[pixelIndex + 1] = normalizeAndEncode(interpolated.vy, stats.vyMax);
                buffer[pixelIndex + 2] = 0;
                buffer[pixelIndex + 3] = 255;
            } else {
                buffer[pixelIndex + 3] = 0; // Transparent
            }
        }
    }
    return sharp(buffer, { raw: { width: size, height: size, channels: 4 } }).png().toBuffer();
}


// =================================================================
// SECTION 5: PNG DESERIALIZER AND CLI HANDLERS (Updated to use SpatialGrid)
// =================================================================

function decodeToVelocity(encodedValue: number, vMax: number): number { /* ... same as before ... */ if(vMax===0)return 0;const normalized=(encodedValue/127.5)-1;return normalized*vMax}
async function deserializeVelocityFromPng(dir: string, t: number): Promise<(x: number, y: number) => { vx: number, vy: number } | null> { /* ... same as before ... */ const metaPath=path.join(dir,"meta.json"),pngPath=path.join(dir,`${t}.png`),meta:MetaJson=JSON.parse(await fs.readFile(metaPath,"utf-8")),{bounds,vxMax,vyMax}=meta,image=sharp(pngPath),{width,height}=await image.metadata();if(!width||!height)throw new Error("이미지 크기를 읽을 수 없습니다.");const rawData=await image.raw().toBuffer();return(x:number,y:number):{vx:number,vy:number}|null=>{if(x<bounds.minX||x>bounds.maxX||y<bounds.minY||y>bounds.maxY)return null;const i=Math.round((x-bounds.minX)/(bounds.maxX-bounds.minX)*(width-1)),j=Math.round((y-bounds.minY)/(bounds.maxY-bounds.minY)*(height-1)),pixelIndex=(j*width+i)*4;if(rawData[pixelIndex+3]<255)return null;const vx=decodeToVelocity(rawData[pixelIndex],vxMax),vy=decodeToVelocity(rawData[pixelIndex+1],vyMax);return{vx,vy}}}

async function handleVelocityTextureAllTime(argv: any) {
    const { dir, size, outputDir, polygonPath } = argv;
    console.log(`🚀 모든 시계열에 대한 속도 텍스처 생성을 시작합니다...`);
    // ... (logging)
    await fs.mkdir(outputDir, { recursive: true });

    const polygon = await deserializePolygonFromFile(polygonPath);
    console.log(`\n[1/4] ⚡ 공간 그리드 인덱스 생성 중...`);
    const grid = new SpatialGrid(polygon); // 그리드 생성
    console.log(`   - ✅ 그리드 인덱스 생성 완료.`);

    // ... (rest of the logic)
    const csvFiles = (await fs.readdir(dir)).filter(f => f.endsWith('.csv') && !isNaN(parseInt(path.basename(f, '.csv'), 10)));
    csvFiles.sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

    console.log(`\n[2/4] 📂 ${csvFiles.length}개의 CSV 파일에서 전역 최소/최대 속도 계산 중...`);
    let allTimeSeries: TimeSeriesData[] = [];
    for (const file of csvFiles) {
        allTimeSeries.push(await deserializeTimeSeriesFromFile(path.join(dir, file)));
    }
    const globalStats = allTimeSeries.flat().reduce((stats, record) => ({
        vxMax: Math.max(stats.vxMax, Math.abs(record.velocityX)),
        vyMax: Math.max(stats.vyMax, Math.abs(record.velocityY)),
    }), { vxMax: 0, vyMax: 0 });
    console.log(`   - 계산된 전역 최대 속도: vxMax=${globalStats.vxMax.toFixed(4)}, vyMax=${globalStats.vyMax.toFixed(4)}`);

    console.log(`\n[3/4] 🖼️  각 시점에 대한 속도 텍스처 생성 중 (가속화 적용)...`);
    const generationPromises = csvFiles.map(async (file, index) => {
        const timeStep = path.basename(file, '.csv');
        const outputPath = path.join(outputDir, `${timeStep}.png`);
        const pngBuffer = await generateVelocityPng(polygon, allTimeSeries[index], globalStats, size, grid); // 그리드 전달
        await fs.writeFile(outputPath, pngBuffer);
        process.stdout.write(`   - ✅ ${timeStep}.png 저장 완료.\r`);
    });
    await Promise.all(generationPromises);
    console.log(`\n   - 모든 텍스처 생성이 완료되었습니다.`);

    console.log(`\n[4/4] 📝 메타데이터(meta.json) 파일 생성 중...`);
    const metaData: MetaJson = {
        vxMax: globalStats.vxMax,
        vyMax: globalStats.vyMax,
        num_time: csvFiles.length,
        size: size,
        bounds: polygon.bounds,
    };
    await fs.writeFile(path.join(outputDir, 'meta.json'), JSON.stringify(metaData, null, 2));
    console.log(`   - ✅ meta.json 저장 완료.`);
    console.log(`\n🎉 작업이 성공적으로 완료되었습니다.`);
}

async function handleMaskTexture(argv: any) {
    const { size, outputDir, polygonPath } = argv;
    console.log(`🎭 마스크 텍스처 생성을 시작합니다...`);
    // ... (logging)
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

async function handleTestRead(argv: any) { /* ... same as before ... */ const{dir,t}=argv;console.log("🔍 PNG에서 속도 데이터 읽기 테스트...");console.log(`   - 디렉토리: ${dir}`);console.log(`   - 시간 스텝: ${t}`);try{const velocityProvider=await deserializeVelocityFromPng(dir,t),meta=JSON.parse(await fs.readFile(path.join(dir,"meta.json"),"utf-8")),testX=meta.bounds.minX+(meta.bounds.maxX-meta.bounds.minX)*.5,testY=meta.bounds.minY+(meta.bounds.maxY-meta.bounds.minY)*.5,velocity=velocityProvider(testX,testY);if(velocity){console.log(`   - 좌표 (${testX.toFixed(2)}, ${testY.toFixed(2)}) 에서의 속도:`);console.log(`     vx = ${velocity.vx.toFixed(4)}, vy = ${velocity.vy.toFixed(4)}`)}else console.log("   - 해당 좌표에 유효한 데이터가 없습니다.")}catch(e:any){console.error("❌ 테스트 중 오류 발생:",e.message)}}

// =================================================================
// SECTION 6: YARGS CLI SETUP
// =================================================================

yargs(hideBin(process.argv))
  .command(
    'velocity-texture-all-time',
    '모든 시계열에 대한 속도 텍스처를 생성합니다',
    (y) => y
      .option('dir', {
        type: 'string',
        demandOption: true,
        describe: 'CSV 파일들이 있는 디렉토리 경로'
      })
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
    handleVelocityTextureAllTime
  )
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
    'test-read-velocity',
    'PNG에서 속도 데이터 읽기 테스트',
    (y) => y
      .option('dir', {
        type: 'string',
        demandOption: true,
        describe: '속도 텍스처가 있는 디렉토리 경로'
      })
      .option('t', {
        type: 'number',
        demandOption: true,
        describe: '테스트할 시간 스텝'
      }),
    handleTestRead
  )
  .demandCommand(1, '하나의 명령어를 선택해야 합니다.')
  .strict()
  .help()
  .alias('h', 'help')
  .argv;