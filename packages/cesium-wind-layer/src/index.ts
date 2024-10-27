import {
  Viewer,
  Scene,
  Cartesian2,
  SceneMode,
  Math as CesiumMath,
  Rectangle
} from 'cesium';

import { WindLayerOptions, WindData } from './types';
import { WindParticleSystem } from './windParticleSystem';

export class WindLayer {
  private _show: boolean = true;
  private _resized: boolean = false;
  windData: Required<WindData>;

  get show(): boolean {
    return this._show;
  }

  set show(value: boolean) {
    if (this._show !== value) {
      this._show = value;
      this.updatePrimitivesVisibility(value);
    }
  }

  static defaultOptions: WindLayerOptions = {
    particlesTextureSize: 100,
    particleHeight: 0,
    lineWidth: 10.0,
    speedFactor: 10,
    dropRate: 0.003,
    dropRateBump: 0.001,
    colors: ['white'],
    flipY: false,
    useViewerBounds: false // 默认使用全局范围
  }

  viewer: Viewer;
  scene: Scene;
  options: WindLayerOptions;
  private particleSystem: WindParticleSystem;
  private viewerParameters: {
    lonRange: Cartesian2;
    latRange: Cartesian2;
    pixelSize: number;
    sceneMode: SceneMode;
  };
  private _isDestroyed: boolean = false;
  private primitives: any[] = [];

  /**
   * WindLayer class for visualizing wind field data with particle animation in Cesium.
   * 
   * @class
   * @param {Viewer} viewer - The Cesium viewer instance.
   * @param {WindData} windData - The wind field data to visualize.
   * @param {Partial<WindLayerOptions>} [options] - Optional configuration options for the wind layer.
   * @param {number} [options.particlesTextureSize=100] - Size of the particle texture. Determines the maximum number of particles (size squared).
   * @param {number} [options.particleHeight=0] - Height of particles above the ground in meters.
   * @param {number} [options.lineWidth=3.0] - Width of particle trails in pixels.
   * @param {number} [options.speedFactor=1.0] - Factor to adjust the speed of particles.
   * @param {number} [options.dropRate=0.003] - Rate at which particles are dropped (reset).
   * @param {number} [options.dropRateBump=0.001] - Additional drop rate for slow-moving particles.
   * @param {string[]} [options.colors=['white']] - Array of colors for particles. Can be used to create color gradients.
   * @param {boolean} [options.flipY=false] - Whether to flip the Y-axis of the wind data.
   * @param {boolean} [options.useViewerBounds=false] - Whether to use the viewer bounds to generate particles.
   */
  constructor(viewer: Viewer, windData: WindData, options?: Partial<WindLayerOptions>) {
    this.show = true;
    this.viewer = viewer;
    this.scene = viewer.scene;
    this.options = { ...WindLayer.defaultOptions, ...options };
    this.windData = this.processWindData(windData);

    this.viewerParameters = {
      lonRange: new Cartesian2(-180, 180),
      latRange: new Cartesian2(-90, 90),
      pixelSize: 2000.0,
      sceneMode: this.scene.mode
    };
    this.updateViewerParameters();

    this.particleSystem = new WindParticleSystem(this.scene.context, this.windData, this.options, this.viewerParameters);
    this.add();

    this.setupEventListeners();
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

  private processWindData(windData: WindData): Required<WindData> {
    if (windData.speed?.min === undefined || windData.speed?.max === undefined) {
      console.info('no speed data, calculate speed...');
      const speed = {
        array: new Float32Array(windData.u.array.length),
        min: Number.MAX_VALUE,
        max: Number.MIN_VALUE
      };
      for (let i = 0; i < windData.u.array.length; i++) {
        speed.array[i] = Math.sqrt(windData.u.array[i] * windData.u.array[i] + windData.v.array[i] * windData.v.array[i]);
        if (speed.array[i] !== 0) {
          speed.min = Math.min(speed.min, speed.array[i]);
          speed.max = Math.max(speed.max, speed.array[i]);
        }
      }
      return {
        ...windData,
        speed
      }
    }
    return windData as Required<WindData>;
  }

  /**
   * Get the wind data at a specific longitude and latitude.
   * @param {number} lon - The longitude.
   * @param {number} lat - The latitude.
   * @returns {Object} - An object containing the u, v, and speed values at the specified coordinates.
   */
  getDataAtLonLat(lon: number, lat: number): { u: number, v: number, speed: number } | null {
    const { bounds, width, height, u, v, speed } = this.windData;
    const { flipY } = this.options;

    // Check if the coordinates are within bounds
    if (lon < bounds.west || lon > bounds.east || lat < bounds.south || lat > bounds.north) {
      return null;
    }

    const x = Math.floor((lon - bounds.west) / (bounds.east - bounds.west) * (width - 1));
    let y = Math.floor((lat - bounds.south) / (bounds.north - bounds.south) * (height - 1));

    // Apply flipY if enabled
    if (flipY) {
      y = height - 1 - y;
    }

    // Ensure x and y are within the array bounds
    if (x < 0 || x >= width || y < 0 || y >= height) {
      return null;
    }

    const index = y * width + x;

    return {
      u: u.array[index],
      v: v.array[index],
      speed: speed.array[index]
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

    if (!isOutsideGlobe) {
      // Calculate intersection with data bounds
      const lonRange = new Cartesian2(
        Math.max(this.windData.bounds.west, minLon),
        Math.min(this.windData.bounds.east, maxLon)
      );
      const latRange = new Cartesian2(
        Math.max(this.windData.bounds.south, minLat),
        Math.min(this.windData.bounds.north, maxLat)
      );

      // Add 5% buffer to lonRange and latRange
      const lonBuffer = (lonRange.y - lonRange.x) * 0.05;
      const latBuffer = (latRange.y - latRange.x) * 0.05;

      lonRange.x = Math.max(this.windData.bounds.west, lonRange.x - lonBuffer);
      lonRange.y = Math.min(this.windData.bounds.east, lonRange.y + lonBuffer);
      latRange.x = Math.max(this.windData.bounds.south, latRange.x - latBuffer);
      latRange.y = Math.min(this.windData.bounds.north, latRange.y + latBuffer);

      this.viewerParameters.lonRange = lonRange;
      this.viewerParameters.latRange = latRange;

      // Calculate pixelSize based on the visible range
      const dataLonRange = this.windData.bounds.east - this.windData.bounds.west;
      const dataLatRange = this.windData.bounds.north - this.windData.bounds.south;

      // Calculate the ratio of visible area to total data area based on the shortest side
      const visibleRatioLon = (lonRange.y - lonRange.x) / dataLonRange;
      const visibleRatioLat = (latRange.y - latRange.x) / dataLatRange;
      const visibleRatio = Math.min(visibleRatioLon, visibleRatioLat);

      // Map the ratio to a pixelSize value between 0 and 1000
      const pixelSize = 1000 * visibleRatio;

      this.viewerParameters.pixelSize = 5 + Math.max(0, Math.min(1000, pixelSize));
    }


    this.viewerParameters.sceneMode = this.scene.mode;
    this.particleSystem?.applyViewerParameters(this.viewerParameters);
  }

  /**
   * Update the wind data of the wind layer.
   * @param {WindData} data - The new wind data to apply.
   */
  updateWindData(data: WindData): void {
    this.windData = this.processWindData(data);
    this.particleSystem.computing.updateWindData(this.windData);
    this.viewer.scene.requestRender();
  }

  /**
   * Update the options of the wind layer.
   * @param {Partial<WindLayerOptions>} options - The new options to apply.
   */
  updateOptions(options: Partial<WindLayerOptions>): void {
    this.options = { ...this.options, ...options };
    this.particleSystem.changeOptions(options);
    this.viewer.scene.requestRender();
  }

  zoomTo(duration: number = 0): void {
    if (this.windData.bounds) {
      const rectangle = Rectangle.fromDegrees(
        this.windData.bounds.west,
        this.windData.bounds.south,
        this.windData.bounds.east,
        this.windData.bounds.north
      );
      this.viewer.camera.flyTo({
        destination: rectangle,
        duration,
      });
    }
  }

  add(): void {
    this.primitives = this.particleSystem.getPrimitives();
    this.primitives.forEach(primitive => {
      this.scene.primitives.add(primitive);
    });
  }

  remove(): void {
    this.primitives.forEach(primitive => {
      this.scene.primitives.remove(primitive);
    });
    this.primitives = [];
  }

  isDestroyed(): boolean {
    return this._isDestroyed;
  }

  destroy(): void {
    this.remove();
    this.removeEventListeners();
    this.particleSystem.destroy();
    this._isDestroyed = true;
  }

  private updatePrimitivesVisibility(visibility?: boolean): void {
    const show = visibility !== undefined ? visibility : this._show;
    this.primitives.forEach(primitive => {
      primitive.show = show;
    });
  }

}

export type { WindLayerOptions, WindData };
