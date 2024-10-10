import { Cartesian3 } from 'cesium';

export interface WindLayerOptions {
  speedFactor: number;
  dropRate: number;
  dropRateBump: number;
  colors: string[];
  particleHeight?: number;
  lineWidth: number;
  fadeOpacity: number;
  particlesTextureSize: number;
  flipY?: boolean;
}

export interface WindDataDemention {
  array: Float32Array;
  min?: number;
  max?: number;
}

export interface WindData {
  u: WindDataDemention;
  v: WindDataDemention;
  width: number;
  height: number;
  bounds: {
    west: number;
    south: number;
    east: number;
    north: number;
  };
}

export interface Particle {
  position: Cartesian3;
  age: number;
}