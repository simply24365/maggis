// dataLoader.ts
import { readFile } from 'fs/promises';
import path from 'path';
import proj4 from 'proj4';

// Proj4 좌표계 정의
proj4.defs(
  "EPSG:5186",
  "+proj=tmerc +lat_0=38 +lon_0=127 +k=1 "
  +"+x_0=200000 +y_0=600000 "
  +"+ellps=GRS80 +towgs84=0,0,0,0,0,0,0 "
  +"+units=m +no_defs +type=crs"
);

export type VertexId = number;

export interface Vertex {
  id: VertexId;
  x: number;
  y: number;
  z: number;
}

export interface Triangle {
  id: number;
  vertexIds: [VertexId, VertexId, VertexId];
}

export interface PolygonData {
  vertexCount: number;
  triangleCount: number;
  vertices: Vertex[];
  triangles: Triangle[];
  bounds: SpatialBounds; // 폴리곤의 공간 경계 정보
}

export interface LoadedData {
  polygon: PolygonData;
  timeSeries?: VelocityData;
}

export interface Velocity {
  u: number;
  v: number;
}

export type VelocityData = Map<VertexId, Velocity>;

export interface VertexTimeInfo {
  nodeId: VertexId;      // corresponding Vertex.id
  timestamp: number;      // simulation time or timestep
  velocityX: number;      // velocity component along X axis
  velocityY: number;      // velocity component along Y axis
  waterDepth: number;     // depth of water at that node
  velocityMagnitude: number; // computed magnitude of velocity vector
  waterElevation: number; // elevation of water surface
  inflowRate: number;     // inflow value at this node/time
}

export interface SpatialBounds {
  west: number;   // 최소 경도 (X 좌표)
  east: number;   // 최대 경도 (X 좌표)
  south: number;  // 최소 위도 (Y 좌표)
  north: number;  // 최대 위도 (Y 좌표)
  minZ: number;   // 최소 고도 (Z 좌표)
  maxZ: number;   // 최대 고도 (Z 좌표)
}

export interface VelocityMetadata {
  globalMin: { u: number; v: number };
  globalMax: { u: number; v: number };
  timeSteps: number[];
  totalVertices: number;
  encoding: string; // 인코딩 방식 설명
  bounds?: SpatialBounds; // 공간 경계 정보 (EPSG:5186)
  boundsInWGS84?: SpatialBounds; // WGS84 변환된 공간 경계 정보
}

/**
 * 정점 배열에서 공간 경계를 계산
 */
function calculateSpatialBounds(vertices: Vertex[]): SpatialBounds {
  if (vertices.length === 0) {
    throw new Error('Cannot calculate bounds from empty vertices array');
  }

  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;

  for (const vertex of vertices) {
    minX = Math.min(minX, vertex.x);
    maxX = Math.max(maxX, vertex.x);
    minY = Math.min(minY, vertex.y);
    maxY = Math.max(maxY, vertex.y);
    minZ = Math.min(minZ, vertex.z);
    maxZ = Math.max(maxZ, vertex.z);
  }

  return {
    west: minX,
    east: maxX,
    south: minY,
    north: maxY,
    minZ,
    maxZ
  };
}

/**
 * EPSG:5186을 WGS84로 변환하는 함수
 */
function convertToWGS84(x: number, y: number): { longitude: number, latitude: number } {
  try {
    const [lon, lat] = proj4('EPSG:5186', 'EPSG:4326', [x, y]);
    return { longitude: lon, latitude: lat };
  } catch (error) {
    console.error(`Proj4 transformation failed for EPSG:5186:`, error);
    // 대략적인 변환 (한국 중부 지역 기준)
    const metersPerDegreeX = 88740;
    const metersPerDegreeY = 111320;
    const longitude = 127.0 + ((x - 200000) / metersPerDegreeX);
    const latitude = 38.0 + ((y - 600000) / metersPerDegreeY);
    return { longitude, latitude };
  }
}

/**
 * 폴리곤 텍스트 (.txt) 파싱
 */
function parsePolygonText(text: string): PolygonData {
  const lines = text.trim().split(/\r?\n/);
  const header = lines[0].trim().split(/\s+/);
  if (header.length < 3) throw new Error('Malformed polygon header');
  const vertexCount = Number(header[1]);
  const triangleCount = Number(header[2]);

  const vertices: Vertex[] = [];
  const triangles: Triangle[] = [];

  for (const line of lines.slice(1)) {
    const parts = line.trim().split(/\s+/);
    if (!parts.length) continue;
    const [type, ...rest] = parts;
    if (type === 'GN') {
      const [idStr, xStr, yStr, zStr] = rest;
      vertices.push({
        id: Number(idStr),
        x: Number(xStr),
        y: Number(yStr),
        z: Number(zStr),
      });
    } else if (type === 'GE') {
      const [idStr, v1Str, v2Str, v3Str] = rest;
      triangles.push({
        id: Number(idStr),
        vertexIds: [Number(v1Str) as VertexId, Number(v2Str) as VertexId, Number(v3Str) as VertexId],
      });
    }
  }

  // 공간 경계 계산
  const bounds = calculateSpatialBounds(vertices);

  return { vertexCount, triangleCount, vertices, triangles, bounds };
}

/**
 * CSV 파일에서 시점별 시계열 데이터를 파싱
 */
function parseTimeSeriesCsv(text: string): VertexTimeInfo[] {
  return text
    .trim()
    .split('\n')
    .slice(1) // 헤더 제거
    .map((line) => {
      const [nodeId, timestamp, velocityX, velocityY, waterDepth, velocityMagnitude, waterElevation, inflowRate] =
        line.split(',').map(Number);
      return { 
        nodeId: nodeId as VertexId, 
        timestamp, 
        velocityX, 
        velocityY, 
        waterDepth, 
        velocityMagnitude, 
        waterElevation, 
        inflowRate 
      };
    });
}

/**
 * CSV 파일에서 시점별 velocity 데이터를 로드
 */
export async function loadVelocityDataFromCSV(timeStep: number, basePath = path.join(process.cwd(), 'lib', 'data')): Promise<VelocityData> {
  const csvPath = path.join(basePath, 'vertices_info_by_time', `${timeStep}.csv`);
  
  try {
    const csvContent = await readFile(csvPath, { encoding: 'utf-8' });
    const timeSeriesData = parseTimeSeriesCsv(csvContent);
    const velocityData: VelocityData = new Map();
    
    // VertexTimeInfo를 Velocity 형식으로 변환
    for (const info of timeSeriesData) {
      velocityData.set(info.nodeId, {
        u: info.velocityX,
        v: info.velocityY
      });
    }
    
    return velocityData;
  } catch (error) {
    console.error(`❌ Error loading velocity data for time ${timeStep}:`, error);
    throw error;
  }
}

/**
 * CSV 파일에서 시점별 전체 시계열 데이터를 로드 (더 상세한 정보 포함)
 */
export async function loadTimeSeriesDataFromCSV(timeStep: number, basePath = path.join(process.cwd(), 'lib', 'data')): Promise<VertexTimeInfo[]> {
  const csvPath = path.join(basePath, 'vertices_info_by_time', `${timeStep}.csv`);
  
  try {
    const csvContent = await readFile(csvPath, { encoding: 'utf-8' });
    return parseTimeSeriesCsv(csvContent);
  } catch (error) {
    console.error(`❌ Error loading time series data for time ${timeStep}:`, error);
    throw error;
  }
}

/**
 * 사용 가능한 모든 시점을 스캔
 */
export async function getAvailableTimeSteps(basePath = path.join(process.cwd(), 'lib', 'data')): Promise<number[]> {
  const velocityDir = path.join(basePath, 'vertices_info_by_time');
  const fs = await import('fs/promises');
  
  try {
    const files = await fs.readdir(velocityDir);
    const timeSteps = files
      .filter(file => file.endsWith('.csv'))
      .map(file => parseInt(file.replace('.csv', '')))
      .filter(num => !isNaN(num))
      .sort((a, b) => a - b);
    
    return timeSteps;
  } catch (error) {
    console.error('❌ Error scanning time steps:', error);
    return [];
  }
}

/**
 * 모든 시점의 velocity 데이터를 스캔하여 글로벌 최대/최소값 계산
 */
export async function calculateGlobalVelocityRange(timeSteps: number[]): Promise<{ min: { u: number; v: number }, max: { u: number; v: number } }> {
  console.log('📊 Calculating global velocity range from all time steps...');
  
  let globalMin = { u: Infinity, v: Infinity };
  let globalMax = { u: -Infinity, v: -Infinity };
  
  for (const timeStep of timeSteps) {
    try {
      const velocityData = await loadVelocityDataFromCSV(timeStep);
      
      for (const velocity of velocityData.values()) {
        globalMin.u = Math.min(globalMin.u, velocity.u);
        globalMin.v = Math.min(globalMin.v, velocity.v);
        
        globalMax.u = Math.max(globalMax.u, velocity.u);
        globalMax.v = Math.max(globalMax.v, velocity.v);
      }
      
      if (timeSteps.length > 10 && timeStep % Math.ceil(timeSteps.length / 10) === 0) {
        console.log(`  ...Processed ${timeStep}/${timeSteps[timeSteps.length - 1]} time steps`);
      }
    } catch (error) {
      console.warn(`⚠️  Skipping time step ${timeStep} due to error:`, error);
    }
  }
  
  console.log(`✅ Global velocity range calculated:`);
  console.log(`  U: ${globalMin.u.toFixed(6)} to ${globalMax.u.toFixed(6)}`);
  console.log(`  V: ${globalMin.v.toFixed(6)} to ${globalMax.v.toFixed(6)}`);
  
  return { min: globalMin, max: globalMax };
}

/**
 * 폴리곤과 속도 데이터로부터 통합 메타데이터 생성
 */
export async function generateMetadata(
  polygon: PolygonData, 
  timeSteps?: number[], 
  basePath = path.join(process.cwd(), 'lib', 'data')
): Promise<VelocityMetadata> {
  console.log('📊 Generating metadata from polygon and velocity data...');
  
  let globalMin = { u: 0, v: 0 };
  let globalMax = { u: 0, v: 0 };
  let availableTimeSteps = timeSteps || [];
  
  // 시점이 제공되지 않았다면 자동으로 스캔
  if (!timeSteps) {
    availableTimeSteps = await getAvailableTimeSteps(basePath);
  }
  
  // 속도 데이터가 있다면 글로벌 범위 계산
  if (availableTimeSteps.length > 0) {
    const velocityRange = await calculateGlobalVelocityRange(availableTimeSteps);
    globalMin = velocityRange.min;
    globalMax = velocityRange.max;
  }
  
  // EPSG:5186 bounds를 WGS84로 변환
  const minWGS84 = convertToWGS84(polygon.bounds.west, polygon.bounds.south);
  const maxWGS84 = convertToWGS84(polygon.bounds.east, polygon.bounds.north);
  
  const boundsInWGS84: SpatialBounds = {
    west: minWGS84.longitude,
    east: maxWGS84.longitude,
    south: minWGS84.latitude,
    north: maxWGS84.latitude,
    minZ: polygon.bounds.minZ,
    maxZ: polygon.bounds.maxZ
  };
  
  return {
    globalMin,
    globalMax,
    timeSteps: availableTimeSteps,
    totalVertices: polygon.vertexCount,
    encoding: 'Raw velocity data from CSV files',
    bounds: polygon.bounds, // 폴리곤의 공간 경계를 메타데이터에 포함 (EPSG:5186)
    boundsInWGS84: boundsInWGS84 // WGS84 변환된 경계
  };
}

/**
 * ts-node 전용: lib/data/38.rgo를 읽어 파싱하여 반환.
 * @param basePath 데이터 폴더 경로 (기본: <cwd>/lib/data)
 */
export async function loadPolygonNode(
  basePath = path.join(process.cwd(), 'lib', 'data')
): Promise<LoadedData> {
  console.log('📂 Loading polygon data from:', basePath);
  const polygonPath = path.join(basePath, '38.rgo');

  try {
    const polyTxt = await readFile(polygonPath, { encoding: 'utf-8' });

    console.log('📊 Raw polygon data loaded, parsing...');
    const polygon = parsePolygonText(polyTxt);

    console.log('✅ Polygon parsed successfully:');
    console.log('  - Vertices:', polygon.vertices.length);
    console.log('  - Triangles:', polygon.triangles.length);
    console.log('  - Spatial Bounds:');
    console.log(`    West: ${polygon.bounds.west.toFixed(6)}, East: ${polygon.bounds.east.toFixed(6)}`);
    console.log(`    South: ${polygon.bounds.south.toFixed(6)}, North: ${polygon.bounds.north.toFixed(6)}`);
    console.log(`    Z Range: ${polygon.bounds.minZ.toFixed(6)} to ${polygon.bounds.maxZ.toFixed(6)}`);

    return { polygon };
  } catch (err) {
    console.error('❌ Error in loadPolygonNode:', (err as Error).message);
    throw err;
  }
}

/**
 * 폴리곤 데이터와 함께 메타데이터를 생성하여 반환 (파티클 시스템과의 연동용)
 */
export async function loadPolygonWithMetadata(
  basePath = path.join(process.cwd(), 'lib', 'data')
): Promise<{ polygon: PolygonData; metadata: VelocityMetadata }> {
  console.log('🔗 Loading polygon data with metadata for particle system integration...');
  
  const { polygon } = await loadPolygonNode(basePath);
  const metadata = await generateMetadata(polygon, undefined, basePath);
  
  console.log('✅ Polygon and metadata loaded for particle system:');
  console.log(`  - Spatial bounds: ${JSON.stringify(metadata.bounds)}`);
  console.log(`  - Available time steps: ${metadata.timeSteps.length}`);
  console.log(`  - Velocity range: U[${metadata.globalMin.u.toFixed(3)}, ${metadata.globalMax.u.toFixed(3)}], V[${metadata.globalMin.v.toFixed(3)}, ${metadata.globalMax.v.toFixed(3)}]`);
  
  return { polygon, metadata };
}

/**
 * 메타데이터를 JSON 형태로 출력 (디버깅 및 확인용)
 */
export function printMetadata(metadata: VelocityMetadata): void {
  console.log('📄 Generated Metadata:');
  console.log(JSON.stringify(metadata, null, 2));
}
