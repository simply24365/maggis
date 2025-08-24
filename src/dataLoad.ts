import proj4 from "proj4";
import { type FlowData, type SeedPoint } from "./flow";

import { getQuantile } from './flow/utils';

proj4.defs(
  "EPSG:5186",
  "+proj=tmerc +lat_0=38 +lon_0=127 +k=1 "
  +"+x_0=200000 +y_0=600000 "
  +"+ellps=GRS80 +towgs84=0,0,0,0,0,0,0 "
  +"+units=m +no_defs +type=crs"
);

/** =========================
 *  Types
 *  ========================= */
export type VertexId = number;

export interface ProjectedBounds {
  minLon: number; maxLon: number;
  minLat: number; maxLat: number;
  minZ: number; maxZ: number;
}

export interface Vertex { id: VertexId; lon: number; lat: number; z: number; }
export interface Triangle { id: number; vertexIds: [VertexId, VertexId, VertexId]; }

export interface PolygonData {
  vertexCount: number;
  triangleCount: number;
  vertices: Vertex[];
  triangles: Triangle[];
  bounds: ProjectedBounds;
}

export interface TimeSeriesRecord {
  nodeId: VertexId;
  timestamp: number;
  velocityX: number;
  velocityY: number;
  waterDepth: number;
  velocityMagnitude: number;
  waterElevation: number;
  inflowRate: number;
}
export type TimeSeriesData = TimeSeriesRecord[];

export interface ArrayWithMinMax {
  array: number[] | Float32Array;
  min?: number;
  max?: number;
}

export interface Quantiles {
  q25: number;
  q50: number;
  q75: number;
  q90: number;
}

/** =========================
 *  Spatial acceleration grid
 *  ========================= */
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

      const triBounds = {
        minLon: Math.min(v1.lon, v2.lon, v3.lon),
        maxLon: Math.max(v1.lon, v2.lon, v3.lon),
        minLat: Math.min(v1.lat, v2.lat, v3.lat),
        maxLat: Math.max(v1.lat, v2.lat, v3.lat),
      };

      const startCol = Math.floor((triBounds.minLon - this.bounds.minLon) / this.cellWidth);
      const endCol = Math.floor((triBounds.maxLon - this.bounds.minLon) / this.cellWidth);
      const startRow = Math.floor((triBounds.minLat - this.bounds.minLat) / this.cellHeight);
      const endRow = Math.floor((triBounds.maxLat - this.bounds.minLat) / this.cellHeight);

      for (let row = Math.max(0, startRow); row <= Math.min(this.gridResolution - 1, endRow); row++) {
        for (let col = Math.max(0, startCol); col <= Math.min(this.gridResolution - 1, endCol); col++) {
          this.grid[row][col].push(i);
        }
      }
    }
  }

  public getCandidateTriangles(lon: number, lat: number): number[] {
    if (lon < this.bounds.minLon || lon > this.bounds.maxLon || lat < this.bounds.minLat || lat > this.bounds.maxLat) {
      return [];
    }

    const col = Math.floor((lon - this.bounds.minLon) / this.cellWidth);
    const row = Math.floor((lat - this.bounds.minLat) / this.cellHeight);

    const safeCol = Math.max(0, Math.min(this.gridResolution - 1, col));
    const safeRow = Math.max(0, Math.min(this.gridResolution - 1, row));

    return this.grid[safeRow][safeCol];
  }
}

/** =========================
 *  Helpers
 *  ========================= */
function calculateSpatialBounds(vertices: Vertex[]): ProjectedBounds {
  return vertices.reduce((acc, v) => ({
    minLon: Math.min(acc.minLon, v.lon),
    maxLon: Math.max(acc.maxLon, v.lon),
    minLat: Math.min(acc.minLat, v.lat),
    maxLat: Math.max(acc.maxLat, v.lat),
    minZ: Math.min(acc.minZ, v.z),
    maxZ: Math.max(acc.maxZ, v.z)
  }), {
    minLon: Infinity, maxLon: -Infinity,
    minLat: Infinity, maxLat: -Infinity,
    minZ: Infinity, maxZ: -Infinity
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

function parseTimeSeriesCsv(text: string): TimeSeriesData {
  return text
    .trim()
    .split("\n")
    .slice(1)
    .map(line => {
      const trimmedLine = line.trim();
      if (!trimmedLine) return null;
      const [
        nodeId,
        timestamp,
        velocityX,
        velocityY,
        waterDepth,
        velocityMagnitude,
        waterElevation,
        inflowRate
      ] = trimmedLine.split(",").map(Number);
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
    })
    .filter((item): item is TimeSeriesRecord => item !== null);
}

async function deserializePolygonFromUrl(url: string): Promise<PolygonData> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch polygon data: ${res.statusText}`);
  const text = await res.text();
  return parsePolygonText(text);
}

async function deserializeTimeSeriesFromUrl(url: string): Promise<TimeSeriesData> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch time series data: ${res.statusText}`);
  const text = await res.text();
  return parseTimeSeriesCsv(text);
}

/**
 * Fetches an image and converts it to a mask array
 * - Requires DOM APIs (browser)
 */
async function loadMaskDataFromUrl(
  imageUrl: string,
  width: number,
  height: number
): Promise<{ array: Float32Array; min: number; max: number }> {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined' || typeof Image === 'undefined') {
      reject(new Error('DOM APIs not available - may be running in sandboxed environment'));
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          reject(new Error('Failed to get canvas context - may be running in sandboxed environment without allow-scripts permission'));
          return;
        }

        canvas.width = width;
        canvas.height = height;

        ctx.drawImage(img, 0, 0, width, height);

        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;

        const maskArray = new Float32Array(width * height);
        let min = Number.MAX_VALUE;
        let max = Number.MIN_VALUE;

        for (let i = 0; i < maskArray.length; i++) {
          const pixelIndex = i * 4; // RGBA
          const r = data[pixelIndex];
          const g = data[pixelIndex + 1];
          const b = data[pixelIndex + 2];
          const alpha = data[pixelIndex + 3];

          const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
          const maskValue = alpha === 0 ? 0 : luminance;

          maskArray[i] = maskValue;

          if (maskValue >= 0) {
            min = Math.min(min, maskValue);
            max = Math.max(max, maskValue);
          }
        }

        if (min === Number.MAX_VALUE) {
          min = 0;
          max = 1;
        }

        resolve({
          array: maskArray,
          min,
          max
        });
      } catch (error) {
        reject(error);
      }
    };

    img.onerror = () => {
      reject(new Error(`Failed to load image: ${imageUrl}`));
    };

    img.src = imageUrl;
  });
}

function isPointInTriangle(pLon: number, pLat: number, v1: Vertex, v2: Vertex, v3: Vertex): boolean {
  const d1 = (pLon - v2.lon) * (v1.lat - v2.lat) - (v1.lon - v2.lon) * (pLat - v2.lat);
  const d2 = (pLon - v3.lon) * (v2.lat - v3.lat) - (v2.lon - v3.lon) * (pLat - v3.lat);
  const d3 = (pLon - v1.lon) * (v3.lat - v1.lat) - (v3.lon - v1.lon) * (pLat - v1.lat);
  const has_neg = d1 < 0 || d2 < 0 || d3 < 0;
  const has_pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(has_neg && has_pos);
}

function generateRandomSeedsFromPolygon(polygonData: PolygonData, numSeeds: number): SeedPoint[] {
  const { vertices, triangles, bounds } = polygonData;
  const { maxLat, maxLon, minLon, minLat } = bounds;

  const vertexMap = new Map(vertices.map(v => [v.id, v]));
  const seeds: SeedPoint[] = [];

  const lonRange = maxLon - minLon;
  const latRange = maxLat - minLat;

  for (let i = 0; i < numSeeds; i++) {
    const triangleIndex = Math.floor(Math.random() * triangles.length);
    const triangle = triangles[triangleIndex];

    const v1 = vertexMap.get(triangle.vertexIds[0])!;
    const v2 = vertexMap.get(triangle.vertexIds[1])!;
    const v3 = vertexMap.get(triangle.vertexIds[2])!;

    let r1 = Math.random();
    let r2 = Math.random();

    // This ensures the point is uniformly distributed within the triangle
    if (r1 + r2 > 1) {
      r1 = 1 - r1;
      r2 = 1 - r2;
    }

    const r3 = 1 - r1 - r2;

    const lon = r1 * v1.lon + r2 * v2.lon + r3 * v3.lon;
    const lat = r1 * v1.lat + r2 * v2.lat + r3 * v3.lat;

    // Normalize the coordinates to a 0-1 range based on the bounding box.
    const normalizedLon = (lon - minLon) / lonRange;
    const normalizedLat = (lat - minLat) / latRange;

    seeds.push({ lon: normalizedLon, lat: normalizedLat });
  }

  return seeds;
}


/** =========================
 *  FlowFieldDataManager (Class)
 *  - polygon, seeds, mask를 초기 1회 생성/재사용
 *  ========================= */
export class FlowFieldDataManager {
  private readonly polygonUrl: string;
  private readonly textureSize: number;
  private readonly maskUrl?: string;
  private readonly numSeeds: number;
  private readonly gridResolution: number;

  private polygon!: PolygonData;
  private grid!: SpatialGrid;
  private mask?: { array: Float32Array; min: number; max: number };
  private seeds?: SeedPoint[];

  private constructor(opts: {
    polygonUrl: string;
    textureSize?: number;
    maskUrl?: string;
    numSeeds?: number;
    gridResolution?: number;
  }) {
    this.polygonUrl = opts.polygonUrl;
    this.textureSize = opts.textureSize ?? 1024;
    this.maskUrl = opts.maskUrl;
    this.numSeeds = opts.numSeeds ?? 256 * 256; 
    this.gridResolution = opts.gridResolution ?? 64;
  }

  /**
   * Static factory method
   * - polygon, grid, mask, seeds를 초기 1회 생성
   */
  public static async create(opts: {
    polygonUrl: string;
    textureSize?: number;
    maskUrl?: string;
    numSeeds?: number;
    gridResolution?: number;
  }): Promise<FlowFieldDataManager> {
    const dataManager = new FlowFieldDataManager(opts);
    await dataManager.initialize();
    return dataManager;
  }

  /**
   * 내부 초기화: polygon/grid/mask/seeds를 생성하여 캐시.
   */
  private async initialize(): Promise<void> {
    this.polygon = await deserializePolygonFromUrl(this.polygonUrl);
    this.grid = new SpatialGrid(this.polygon, this.gridResolution);

    this.seeds = generateRandomSeedsFromPolygon(this.polygon, this.numSeeds);
    if (this.maskUrl) {
      try {
        this.mask = await loadMaskDataFromUrl(this.maskUrl, this.textureSize, this.textureSize);
      } catch (e) {
        console.warn("Failed to load mask. Proceeding without mask. Error:", e);
      }
    }
  }

  /**
   * 단일 CSV URL로부터 FlowData 생성 (polygon, mask, seeds는 재사용)
   */
  public async generateFromCsv(csvUrl: string): Promise<FlowData> {
    const timeSeries = await deserializeTimeSeriesFromUrl(csvUrl);
    return this.generateFromTimeSeries(timeSeries);
  }

  /**
   * 여러 CSV URL에 대해 배치 생성 (polygon, mask, seeds는 재사용)
   */
  public async generateBatchFromCsv(csvUrls: string[]): Promise<FlowData[]> {
    const results: FlowData[] = [];
    for (let i = 0; i < csvUrls.length; i++) {
      const flow = await this.generateFromCsv(csvUrls[i]);
      results.push(flow);
    }
    return results;
  }

  /**
   * 이미 파싱된 TimeSeriesData로부터 FlowData 생성
   */
  public generateFromTimeSeries(timeSeriesData: TimeSeriesData): FlowData {
    return this.generateFlow(timeSeriesData, this.textureSize);
  }

  /**
   * 현재 캐시된 polygon 반환
   */
  public getPolygon(): PolygonData {
    return this.polygon;
  }

  /**
   * 현재 캐시된 seeds 반환
   */
  public getSeeds(): SeedPoint[] | undefined {
    return this.seeds;
  }

  /**
   * seeds 재생성 (요청 시 수동 재생성)
   */
  public regenerateSeeds(numSeeds = this.numSeeds): SeedPoint[] {
    this.seeds = generateRandomSeedsFromPolygon(this.polygon, numSeeds);
    return this.seeds;
  }

  /**
   * 내부 생성 로직: polygon/grid는 캐시 사용, mask/seeds 포함하여 FlowData 반환
   */
  private generateFlow(timeSeriesData: TimeSeriesData, size: number): FlowData {
    const { bounds, vertices, triangles } = this.polygon;
    const totalPixels = size * size;

    const uArray = new Float32Array(totalPixels);
    const vArray = new Float32Array(totalPixels);
    const speedArray = new Float32Array(totalPixels);
  const nonZeroSpeeds: number[] = [];

    const vertexMap = new Map(vertices.map(v => [v.id, v]));
    const velocityMap = new Map(timeSeriesData.map(v => [v.nodeId, v]));

    let uMin = Infinity, uMax = -Infinity;
    let vMin = Infinity, vMax = -Infinity;
    let speedMin = Infinity, speedMax = -Infinity;

    for (let j = 0; j < size; j++) {
      for (let i = 0; i < size; i++) {
        const lon = bounds.minLon + (i / (size - 1)) * (bounds.maxLon - bounds.minLon);
        const lat = bounds.minLat + (j / (size - 1)) * (bounds.maxLat - bounds.minLat);
        const arrayIndex = j * size + i;

        let interpolated: { vx: number, vy: number } | null = null;
        const candidateIndices = this.grid.getCandidateTriangles(lon, lat);

        for (const triIndex of candidateIndices) {
          const tri = triangles[triIndex];
          const v1 = vertexMap.get(tri.vertexIds[0])!;
          const v2 = vertexMap.get(tri.vertexIds[1])!;
          const v3 = vertexMap.get(tri.vertexIds[2])!;

          if (isPointInTriangle(lon, lat, v1, v2, v3)) {
            const vel1 = velocityMap.get(tri.vertexIds[0]);
            const vel2 = velocityMap.get(tri.vertexIds[1]);
            const vel3 = velocityMap.get(tri.vertexIds[2]);

            if (vel1 && vel2 && vel3) {
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
          uArray[arrayIndex] = interpolated.vx;
          vArray[arrayIndex] = interpolated.vy;
          const speed = Math.sqrt(interpolated.vx * interpolated.vx + interpolated.vy * interpolated.vy);
          speedArray[arrayIndex] = speed;
          if (speed > 0) nonZeroSpeeds.push(speed);

          uMin = Math.min(uMin, interpolated.vx);
          uMax = Math.max(uMax, interpolated.vx);
          vMin = Math.min(vMin, interpolated.vy);
          vMax = Math.max(vMax, interpolated.vy);
          speedMin = Math.min(speedMin, speed);
          speedMax = Math.max(speedMax, speed);
        } else {
          uArray[arrayIndex] = 0;
          vArray[arrayIndex] = 0;
          speedArray[arrayIndex] = 0;
        }
      }
    }

    if (uMin === Infinity) {
      uMin = uMax = vMin = vMax = speedMin = speedMax = 0;
    }

    // Compute speed quantiles (ignore zero speeds which usually denote outside-polygon)
    let quantiles: Quantiles | undefined = undefined;
    if (nonZeroSpeeds.length === 0) {
      quantiles = { q25: 0, q50: 0, q75: 0, q90: 0 };
    } else {
      const sortedSpeeds = nonZeroSpeeds.slice().sort((a, b) => a - b);
      quantiles = {
        q25: getQuantile(sortedSpeeds, 0.25),
        q50: getQuantile(sortedSpeeds, 0.5),
        q75: getQuantile(sortedSpeeds, 0.75),
        q90: getQuantile(sortedSpeeds, 0.9),
      };
    }

    const flowData: FlowData = {
      u: { array: Array.from(uArray), min: uMin, max: uMax },
      v: { array: Array.from(vArray), min: vMin, max: vMax },
      speed: { array: Array.from(speedArray), min: speedMin, max: speedMax, quantiles },
      width: size,
      height: size,
      bounds: {
        west: bounds.minLon,
        south: bounds.minLat,
        east: bounds.maxLon,
        north: bounds.maxLat
      },
      // time-독립 데이터 재사용
      mask: this.mask ? { array: this.mask.array, min: this.mask.min, max: this.mask.max } : undefined,
      seeds: this.seeds ? [...this.seeds] : undefined
    };

    return flowData;
  }
}