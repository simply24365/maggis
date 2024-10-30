import { Cartesian3 } from 'cesium';

export interface WindLayerOptions {
  /**
   * Size of the particle texture. Determines the maximum number of particles (size squared). Default is 100.
   */
  particlesTextureSize: number;
  /**
   * Height of particles above the ground in meters. Default is 0.
   */
  particleHeight: number;
  /**
   * Width of particle trails in pixels. Default is 10.0.
   * Controls the width of the particles.
   */
  lineWidth: number;
  /**
   * Factor to adjust the speed of particles. Default is 1.0.
   * Controls the movement speed of particles.
   */
  speedFactor: number;
  /**
   * Rate at which particles are dropped (reset). Default is 0.003.
   * Controls the lifecycle of particles.
   */
  dropRate: number;
  /**
   * Additional drop rate for slow-moving particles. Default is 0.001.
   * Increases the probability of dropping particles when they move slowly.
   */
  dropRateBump: number;
  /**
   * Whether to flip the Y-axis of the wind data. Default is false.
   */
  flipY: boolean;
  /**
   * Array of colors for particles. Can be used to create color gradients.
   * Default is ['white'].
   */
  colors: string[];
  /**
   * Whether to use the viewer bounds to generate particles. Default is false.
   */
  useViewerBounds?: boolean;
  /**
   * Controls the speed rendering range. Default is undefined.
   * @property {number} [min] - Minimum speed value for rendering
   * @property {number} [max] - Maximum speed value for rendering
   */
  domain?: {
    min?: number;
    max?: number;
  };
  /**
   * Controls the speed display range for visualization. Default is undefined.
   * @property {number} [min] - Minimum speed value for display
   * @property {number} [max] - Maximum speed value for display
   */
  displayRange?: {
    min?: number;
    max?: number;
  };
}

export interface WindDataDemention {
  array: Float32Array;
  min?: number;
  max?: number;
}

export interface WindData {
  u: WindDataDemention;
  v: WindDataDemention;
  speed?: WindDataDemention;
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

export interface WindDataAtLonLat {
  /**
   * Original data at the grid point
   */
  original: {
    /**
     * Original U component
     */
    u: number;
    /**
     * Original V component
     */
    v: number;
    /**
     * Original speed
     */
    speed: number;
  };
  /**
   * Interpolated data between grid points
   */
  interpolated: {
    /**
     * Interpolated U component
     */
    u: number;
    /**
     * Interpolated V component
     */
    v: number;
    /**
     * Interpolated speed
     */
    speed: number;
  };
}
