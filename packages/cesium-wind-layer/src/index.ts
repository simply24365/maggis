import {
  Viewer,
  Scene,
  Cartesian2,
  Cartesian3,
  SceneMode,
  Math as CesiumMath,
  Rectangle
} from 'cesium';

import { FlowLayerOptions as FlowLayerOptions, FlowData, FlowDataAtLonLat as FlowDataAtLonLat } from './types';
import { FlowParticleSystem } from './flowParticleSystem';
import { deepMerge, fetchImageAsMask } from './utils';
import { log } from 'console';

export * from './types';

type FlowLayerEventType = 'dataChange' | 'optionsChange';
type FlowLayerEventCallback = (data: FlowData | FlowLayerOptions) => void;

export const DefaultOptions: FlowLayerOptions = {
  particlesTextureSize: 100,
  dropRate: 0.003,
  particleHeight: 1000,
  dropRateBump: 0.01,
  speedFactor: 1.0,
  lineWidth: { min: 1, max: 2 },
  lineLength: { min: 20, max: 100 },
  colors: ['white'],
  flipY: false,
  useViewerBounds: false,
  domain: undefined,
  displayRange: undefined,
  dynamic: true
}

export class FlowLayer {
  private _show: boolean = true;
  private _resized: boolean = false;
  flowData: Required<FlowData>;

  get show(): boolean {
    return this._show;
  }

  set show(value: boolean) {
    if (this._show !== value) {
      this._show = value;
      this.updatePrimitivesVisibility(value);
    }
  }

  static defaultOptions: FlowLayerOptions = DefaultOptions;

  viewer: Viewer;
  scene: Scene;
  options: FlowLayerOptions;
  private particleSystem: FlowParticleSystem;
  private viewerParameters: {
    lonRange: Cartesian2;
    latRange: Cartesian2;
    pixelSize: number;
    sceneMode: SceneMode;
    cameraPosition: Cartesian3;
    cameraDirection: Cartesian3;
    cameraUp: Cartesian3;
    cameraDistance: number;
  };
  private _isDestroyed: boolean = false;
  private primitives: any[] = [];
  private eventListeners: Map<FlowLayerEventType, Set<FlowLayerEventCallback>> = new Map();

  /**
   * FlowLayer class for visualizing flow field data with particle animation in Cesium.
   * 
   * @class
   * @param {Viewer} viewer - The Cesium viewer instance.
   * @param {FlowData} flowData - The flow field data to visualize.
   * @param {Partial<FlowLayerOptions>} [options] - Optional configuration options for the flow layer.
   * @param {number} [options.particlesTextureSize=100] - Size of the particle texture. Determines the maximum number of particles (size squared).
   * @param {number} [options.particleHeight=0] - Height of particles above the ground in meters.
   * @param {Object} [options.lineWidth={ min: 1, max: 2 }] - Width range of particle trails.
   * @param {Object} [options.lineLength={ min: 20, max: 100 }] - Length range of particle trails.
   * @param {number} [options.speedFactor=1.0] - Factor to adjust the speed of particles.
   * @param {number} [options.dropRate=0.003] - Rate at which particles are dropped (reset).
   * @param {number} [options.dropRateBump=0.001] - Additional drop rate for slow-moving particles.
   * @param {string[]} [options.colors=['white']] - Array of colors for particles. Can be used to create color gradients.
   * @param {boolean} [options.flipY=false] - Whether to flip the Y-axis of the flow data.
   * @param {boolean} [options.useViewerBounds=false] - Whether to use the viewer bounds to generate particles.
   * @param {boolean} [options.dynamic=true] - Whether to enable dynamic particle animation.
   * @param {string} [options.maskUrl] - URL of the mask image to fetch and apply.
   */
  constructor(viewer: Viewer, flowData: FlowData, options?: Partial<FlowLayerOptions>) {
    this.show = true;
    this.viewer = viewer;
    this.scene = viewer.scene;
    this.options = { ...FlowLayer.defaultOptions, ...options };
    
    // Initialize with basic flow data first
    this.flowData = this.processFlowData(flowData);
    
    this.viewerParameters = {
      lonRange: new Cartesian2(-180, 180),
      latRange: new Cartesian2(-90, 90),
      pixelSize: 1000.0,
      sceneMode: this.scene.mode,
      cameraPosition: Cartesian3.ZERO,
      cameraDirection: Cartesian3.UNIT_Z,
      cameraUp: Cartesian3.UNIT_Y,
      cameraDistance: 0
    };
    this.updateViewerParameters();
    
    this.particleSystem = new FlowParticleSystem(this.scene.context, this.flowData, this.options, this.viewerParameters, this.scene);
    this.add();
    this.setupEventListeners();

    // If maskUrl is provided, fetch and apply the mask asynchronously
    if (this.options.maskUrl) {
      this.loadMask(this.options.maskUrl, flowData);
    }
  }

  /**
   * Loads a mask from an image URL and applies it to the flow data
   * @param maskUrl - URL of the mask image
   * @param originalFlowData - Original flow data to apply mask to
   */
  private async loadMask(maskUrl: string, originalFlowData: FlowData): Promise<void> {
    try {
      const maskData = await fetchImageAsMask(maskUrl, originalFlowData.width, originalFlowData.height);
      
      // Create new flow data with the fetched mask
      const flowDataWithMask: FlowData = {
        ...originalFlowData,
        mask: maskData
      };
      
      // Update the flow data with the new mask
      this.updateFlowData(flowDataWithMask);
    } catch (error) {
      console.warn('Failed to load mask from URL:', maskUrl, error);
      // Continue without mask if loading fails
    }
  }

  private setupEventListeners(): void {
    this.viewer.camera.percentageChanged = 0.01;
    this.viewer.camera.changed.addEventListener(this.updateViewerParameters.bind(this));
    this.scene.morphComplete.addEventListener(this.updateViewerParameters.bind(this));
    window.addEventListener("resize", this.updateViewerParameters.bind(this));
  }

  private removeEventListeners(): void {
    this.viewer.camera.changed.removeEventListener(this.updateViewerParameters.bind(this));
    this.scene.morphComplete.removeEventListener(this.updateViewerParameters.bind(this));
    window.removeEventListener("resize", this.updateViewerParameters.bind(this));
  }

  private processFlowData(flowData: FlowData): Required<FlowData> {
    if (flowData.speed?.min === undefined || flowData.speed?.max === undefined || flowData.speed.array === undefined) {
      const speed = {
        array: new Float32Array(flowData.u.array.length),
        min: Number.MAX_VALUE,
        max: Number.MIN_VALUE
      };
      for (let i = 0; i < flowData.u.array.length; i++) {
        speed.array[i] = Math.sqrt(flowData.u.array[i] * flowData.u.array[i] + flowData.v.array[i] * flowData.v.array[i]);
        if (speed.array[i] !== 0) {
          speed.min = Math.min(speed.min, speed.array[i]);
          speed.max = Math.max(speed.max, speed.array[i]);
        }
      }
      flowData = { ...flowData, speed };
    }

    // If mask data is not provided, create a default mask with all areas valid (value = 1)
    if (!flowData.mask) {
      const mask = {
        array: new Float32Array(flowData.u.array.length).fill(1.0),
        min: 1.0,
        max: 1.0
      };
      flowData = { ...flowData, mask };
    } else if (flowData.mask.min === undefined || flowData.mask.max === undefined) {
      // Calculate min/max for provided mask data
      let min = Number.MAX_VALUE;
      let max = Number.MIN_VALUE;
      for (let i = 0; i < flowData.mask.array.length; i++) {
        min = Math.min(min, flowData.mask.array[i]);
        max = Math.max(max, flowData.mask.array[i]);
      }
      flowData.mask.min = min;
      flowData.mask.max = max;
    }

    return flowData as Required<FlowData>;
  }

  /**
   * Get the flow data at a specific longitude and latitude.
   * @param {number} lon - The longitude.
   * @param {number} lat - The latitude.
   * @returns {Object} - An object containing the u, v, and speed values at the specified coordinates.
   */
  getDataAtLonLat(lon: number, lat: number): FlowDataAtLonLat | null {
    const { bounds, width, height, u, v, speed } = this.flowData;
    const { flipY } = this.options;

    // Check if the coordinates are within bounds
    if (lon < bounds.west || lon > bounds.east || lat < bounds.south || lat > bounds.north) {
      return null;
    }

    // Calculate normalized coordinates
    const xNorm = (lon - bounds.west) / (bounds.east - bounds.west) * (width - 1);
    let yNorm = (lat - bounds.south) / (bounds.north - bounds.south) * (height - 1);

    // Apply flipY if enabled
    if (flipY) {
      yNorm = height - 1 - yNorm;
    }

    // Get exact grid point for original values
    const x = Math.floor(xNorm);
    const y = Math.floor(yNorm);

    // Get the four surrounding grid points for interpolation
    const x0 = Math.floor(xNorm);
    const x1 = Math.min(x0 + 1, width - 1);
    const y0 = Math.floor(yNorm);
    const y1 = Math.min(y0 + 1, height - 1);

    // Calculate interpolation weights
    const wx = xNorm - x0;
    const wy = yNorm - y0;

    // Get indices
    const index = y * width + x;
    const i00 = y0 * width + x0;
    const i10 = y0 * width + x1;
    const i01 = y1 * width + x0;
    const i11 = y1 * width + x1;

    // Bilinear interpolation for u component
    const u00 = u.array[i00];
    const u10 = u.array[i10];
    const u01 = u.array[i01];
    const u11 = u.array[i11];
    const uInterp = (1 - wx) * (1 - wy) * u00 + wx * (1 - wy) * u10 +
      (1 - wx) * wy * u01 + wx * wy * u11;

    // Bilinear interpolation for v component
    const v00 = v.array[i00];
    const v10 = v.array[i10];
    const v01 = v.array[i01];
    const v11 = v.array[i11];
    const vInterp = (1 - wx) * (1 - wy) * v00 + wx * (1 - wy) * v10 +
      (1 - wx) * wy * v01 + wx * wy * v11;

    // Calculate interpolated speed
    const interpolatedSpeed = Math.sqrt(uInterp * uInterp + vInterp * vInterp);

    return {
      original: {
        u: u.array[index],
        v: v.array[index],
        speed: speed.array[index],
      },
      interpolated: {
        u: uInterp,
        v: vInterp,
        speed: interpolatedSpeed,
      }
    };
  }

  private updateViewerParameters(): void {
    const scene = this.viewer.scene;
    const canvas = scene.canvas;
    const corners = [
      { x: 0, y: 0 },
      { x: 0, y: canvas.clientHeight },
      { x: canvas.clientWidth, y: 0 },
      { x: canvas.clientWidth, y: canvas.clientHeight }
    ];

    // Convert screen corners to cartographic coordinates
    let minLon = 180;
    let maxLon = -180;
    let minLat = 90;
    let maxLat = -90;
    let isOutsideGlobe = false;

    for (const corner of corners) {
      const cartesian = scene.camera.pickEllipsoid(
        new Cartesian2(corner.x, corner.y),
        scene.globe.ellipsoid
      );

      if (!cartesian) {
        isOutsideGlobe = true;
        break;
      }

      const cartographic = scene.globe.ellipsoid.cartesianToCartographic(cartesian);
      const lon = CesiumMath.toDegrees(cartographic.longitude);
      const lat = CesiumMath.toDegrees(cartographic.latitude);

      minLon = Math.min(minLon, lon);
      maxLon = Math.max(maxLon, lon);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    }

    if (!isOutsideGlobe) { // -30 degrees in radians
      // Calculate intersection with data bounds
      const lonRange = new Cartesian2(
        Math.max(this.flowData.bounds.west, minLon),
        Math.min(this.flowData.bounds.east, maxLon)
      );
      const latRange = new Cartesian2(
        Math.max(this.flowData.bounds.south, minLat),
        Math.min(this.flowData.bounds.north, maxLat)
      );

      // Add 5% buffer to lonRange and latRange
      const lonBuffer = (lonRange.y - lonRange.x) * 0.05;
      const latBuffer = (latRange.y - latRange.x) * 0.05;

      lonRange.x = Math.max(this.flowData.bounds.west, lonRange.x - lonBuffer);
      lonRange.y = Math.min(this.flowData.bounds.east, lonRange.y + lonBuffer);
      latRange.x = Math.max(this.flowData.bounds.south, latRange.x - latBuffer);
      latRange.y = Math.min(this.flowData.bounds.north, latRange.y + latBuffer);

      this.viewerParameters.lonRange = lonRange;
      this.viewerParameters.latRange = latRange;
      // Calculate pixelSize based on the visible range
      const dataLonRange = this.flowData.bounds.east - this.flowData.bounds.west;
      const dataLatRange = this.flowData.bounds.north - this.flowData.bounds.south;

      // Calculate the ratio of visible area to total data area based on the shortest side
      const visibleRatioLon = (lonRange.y - lonRange.x) / dataLonRange;
      const visibleRatioLat = (latRange.y - latRange.x) / dataLatRange;
      const visibleRatio = Math.min(visibleRatioLon, visibleRatioLat);

      // Map the ratio to a pixelSize value between 0 and 1000
      const pixelSize = 1000 * visibleRatio;
      if (pixelSize > 0) {
        this.viewerParameters.pixelSize = Math.max(0, Math.min(1000, pixelSize));
      }
    }

    // 카메라 정보 추가
    const camera = this.viewer.camera;
    this.viewerParameters.cameraPosition = camera.position;
    this.viewerParameters.cameraDirection = camera.direction;
    this.viewerParameters.cameraUp = camera.up;
    
    // 카메라와 지구 중심 간의 거리 계산
    const earthCenter = Cartesian3.ZERO;
    this.viewerParameters.cameraDistance = Cartesian3.distance(camera.position, earthCenter);

    this.viewerParameters.sceneMode = this.scene.mode;
    this.particleSystem?.applyViewerParameters(this.viewerParameters);
  }

  /**
   * Update the flow data of the flow layer.
   * @param {FlowData} data - The new flow data to apply.
   */
  updateFlowData(data: FlowData): void {
    if (this._isDestroyed) return;
    this.flowData = this.processFlowData(data);
    this.particleSystem.computing.updateFlowData(this.flowData);
    this.viewer.scene.requestRender();
    // Dispatch data change event
    this.dispatchEvent('dataChange', this.flowData);
  }

  /**
   * Update the options of the flow layer.
   * @param {Partial<FlowLayerOptions>} options - The new options to apply.
   */
  updateOptions(options: Partial<FlowLayerOptions>): void {
    if (this._isDestroyed) return;
    this.options = deepMerge(options, this.options);
    this.particleSystem.changeOptions(options);
    this.viewer.scene.requestRender();
    // Dispatch options change event
    this.dispatchEvent('optionsChange', this.options);
  }

  /**
   * Load and apply a mask from an image URL.
   * @param {string} maskUrl - The URL of the mask image to load.
   * @returns {Promise<void>} - Promise that resolves when the mask is loaded and applied.
   */
  async loadMaskFromUrl(maskUrl: string): Promise<void> {
    if (this._isDestroyed) return;
    
    try {
      const maskData = await fetchImageAsMask(maskUrl, this.flowData.width, this.flowData.height);
      
      // Update the current flow data with the new mask
      const updatedFlowData: FlowData = {
        ...this.flowData,
        mask: maskData
      };
      
      this.updateFlowData(updatedFlowData);
    } catch (error) {
      console.error('Failed to load mask from URL:', maskUrl, error);
      throw error;
    }
  }

  /**
   * Zoom to the flow data bounds.
   * @param {number} [duration=0] - The duration of the zoom animation.
   */
  zoomTo(duration: number = 0): void {
    if (this.flowData.bounds) {
      const rectangle = Rectangle.fromDegrees(
        this.flowData.bounds.west,
        this.flowData.bounds.south,
        this.flowData.bounds.east,
        this.flowData.bounds.north
      );
      this.viewer.camera.flyTo({
        destination: rectangle,
        duration,
      });
    }
  }

  /**
   * Add the flow layer to the scene.
   */
  add(): void {
    this.primitives = this.particleSystem.getPrimitives();
    this.primitives.forEach(primitive => {
      this.scene.primitives.add(primitive);
    });
  }

  /**
   * Remove the flow layer from the scene.
   */
  remove(): void {
    this.primitives.forEach(primitive => {
      this.scene.primitives.remove(primitive);
    });
    this.primitives = [];
  }

  /**
   * Check if the flow layer is destroyed.
   * @returns {boolean} - True if the flow layer is destroyed, otherwise false.
   */
  isDestroyed(): boolean {
    return this._isDestroyed;
  }

  /**
   * Destroy the flow layer and release all resources.
   */
  destroy(): void {
    this.remove();
    this.removeEventListeners();
    this.particleSystem.destroy();
    // Clear all event listeners
    this.eventListeners.clear();
    this._isDestroyed = true;
  }

  private updatePrimitivesVisibility(visibility?: boolean): void {
    const show = visibility !== undefined ? visibility : this._show;
    this.primitives.forEach(primitive => {
      primitive.show = show;
    });
  }

  /**
   * Add an event listener for the specified event type.
   * @param {FlowLayerEventType} type - The type of event to listen for.
   * @param {FlowLayerEventCallback} callback - The callback function to execute when the event occurs.
   */
  addEventListener(type: FlowLayerEventType, callback: FlowLayerEventCallback) {
    if (!this.eventListeners.has(type)) {
      this.eventListeners.set(type, new Set());
    }
    this.eventListeners.get(type)?.add(callback);
  }

  /**
   * Remove an event listener for the specified event type.
   * @param {FlowLayerEventType} type - The type of event to remove.
   * @param {FlowLayerEventCallback} callback - The callback function to remove.
   */
  removeEventListener(type: FlowLayerEventType, callback: FlowLayerEventCallback) {
    this.eventListeners.get(type)?.delete(callback);
  }

  private dispatchEvent(type: FlowLayerEventType, data: FlowData | FlowLayerOptions) {
    this.eventListeners.get(type)?.forEach(callback => callback(data));
  }

}

export type { FlowLayerOptions as FlowLayerOptions, FlowData as FlowData, FlowLayerEventType, FlowLayerEventCallback };
export { fetchImageAsMask };
