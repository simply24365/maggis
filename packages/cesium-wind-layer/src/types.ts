import { Cartesian3 } from 'cesium';

export interface FlowLayerOptions {
  /**
   * Size of the particle texture. Determines the maximum number of particles (size squared). Default is 100.
   */
  particlesTextureSize: number;
  /**
   * Height of particles above the ground in meters. Default is 0.
   */
  particleHeight: number;
  /**
   * Width range of particle trails in pixels. Default is { min: 1, max: 5 }.
   * Controls the width of the particles.
   * @property {number} min - Minimum width of particle trails
   * @property {number} max - Maximum width of particle trails
   */
  lineWidth: {
    min: number;
    max: number;
  };
  /**
   * Length range of particle trails. Default is { min: 20, max: 100 }.
   * @property {number} min - Minimum length of particle trails
   * @property {number} max - Maximum length of particle trails
   */
  lineLength: {
    min: number;
    max: number;
  };
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
   * Whether to flip the Y-axis of the flow data. Default is false.
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
  /**
   * Whether to enable dynamic particle animation. Default is true.
   * When set to false, particles will remain static.
   */
  dynamic: boolean;
  /**
   * URL of the mask image to fetch and apply. Optional.
   * The image will be converted to a grayscale mask where white areas are valid and black areas are invalid.
   */
  maskUrl?: string;
  /**
   * Controls particle visibility based on speed and camera distance.
   * @property {number} [minSpeedAlpha] - Minimum alpha for slow particles (0.0-1.0). Default is 0.7.
   * @property {number} [maxSpeedAlpha] - Maximum alpha for fast particles (0.0-1.0). Default is 1.0.
   * @property {number} [minCameraAlpha] - Minimum alpha when camera is close (0.0-1.0). Default is 0.8.
   * @property {number} [maxCameraAlpha] - Maximum alpha when camera is far (0.0-1.0). Default is 1.0.
   * @property {number} [cameraDistanceThreshold] - Distance threshold for camera alpha (meters). Default is 20000000.
   * @property {number} [edgeFadeWidth] - Width of edge fade effect (0.0-0.5). Default is 0.1.
   * @property {number} [minEdgeFade] - Minimum fade value at edges (0.0-1.0). Default is 0.6.
   */
  visibility?: {
    minSpeedAlpha?: number;
    maxSpeedAlpha?: number;
    minCameraAlpha?: number;
    maxCameraAlpha?: number;
    cameraDistanceThreshold?: number;
    edgeFadeWidth?: number;
    minEdgeFade?: number;
  };
  /**
   * Controls pixel size calculation for zoom-level adaptation.
   * @property {number} [minPixelSize] - Minimum pixel size (prevents particles from becoming too small). Default is 200.
   * @property {number} [maxPixelSize] - Maximum pixel size. Default is 1000.
   * @property {boolean} [useLogScale] - Whether to use logarithmic scaling for smooth zoom transitions. Default is true.
   */
  pixelSizeOptions?: {
    minPixelSize?: number;
    maxPixelSize?: number;
    useLogScale?: boolean;
  };
}

export interface ArrayWithMinMax {
  array: Float32Array;
  min?: number;
  max?: number;
}

export interface FlowData {
  u: ArrayWithMinMax;
  v: ArrayWithMinMax;
  speed?: ArrayWithMinMax;
  width: number;
  height: number;
  mask?: ArrayWithMinMax;
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

export interface FlowDataAtLonLat {
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
