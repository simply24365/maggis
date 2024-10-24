import { Cartesian3 } from 'cesium';

export interface WindLayerOptions {
  /**
   * 粒子纹理大小
   */
  particlesTextureSize: number;
  /**
   * 粒子高度，默认为 1000
   */
  particleHeight: number;
  /**
   * 粒子线宽，默认为 2.0
   * 控制粒子的宽度
   */
  lineWidth: number;
  /**
   * 粒子速度系数，默认为 0.15
   * 控制粒子移动速度
   */
  speedFactor: number;
  /**
   * 粒子消失率，默认为 0.003
   * 控制粒子的生命周期
   */
  dropRate: number;
  /**
   * 粒子消失率增量，默认为 0.001
   * 当粒子移动速度较慢时增加消失概率
   */
  dropRateBump: number;
  /**
   * 是否翻转Y轴，默认为 false
   */
  flipY: boolean;
  /**
   * 颜色列表，用于生成颜色表
   * 默认为 ['rgb(4, 14, 216)', 'rgb(32, 243, 150)']
   */
  colors: string[];
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
