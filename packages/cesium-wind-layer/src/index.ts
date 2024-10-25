import {
  Viewer,
  Scene,
  Cartesian2,
  Cartesian3,
  BoundingSphere,
  Ellipsoid,
  SceneMode,
  Math as CesiumMath,
  Rectangle
} from 'cesium';

import { WindLayerOptions, WindData } from './types';
import { WindParticleSystem } from './windParticleSystem';

export class WindLayer {
  private _show: boolean = true;
  private _resized: boolean = false;
  windData: WindData;

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
   * @param {number} [options.speedFactor=10.0] - Factor to adjust the speed of particles.
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
    this.windData = windData;

    this.viewerParameters = {
      lonRange: new Cartesian2(-180, 180),
      latRange: new Cartesian2(-90, 90),
      pixelSize: 2000.0,
      sceneMode: this.scene.mode
    };
    this.updateViewerParameters();

    this.particleSystem = new WindParticleSystem(this.scene.context, windData, this.options, this.viewerParameters);
    this.add();

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.viewer.camera.changed.addEventListener(this.updateViewerParameters.bind(this));
    this.scene.morphComplete.addEventListener(this.updateViewerParameters.bind(this));
    window.addEventListener("resize", this.updateViewerParameters.bind(this));
  }

  private removeEventListeners(): void {
    this.viewer.camera.changed.removeEventListener(this.updateViewerParameters.bind(this));
    this.scene.morphComplete.removeEventListener(this.updateViewerParameters.bind(this));
    window.removeEventListener("resize", this.updateViewerParameters.bind(this));
  }

  private updateViewerParameters(): void {
    const viewRectangle = this.viewer.camera.computeViewRectangle();
    if (viewRectangle) {
      const minLon = CesiumMath.toDegrees(Math.max(viewRectangle.west, -Math.PI));
      const maxLon = CesiumMath.toDegrees(Math.min(viewRectangle.east, Math.PI));
      const minLat = CesiumMath.toDegrees(Math.max(viewRectangle.south, -Math.PI / 2));
      const maxLat = CesiumMath.toDegrees(Math.min(viewRectangle.north, Math.PI / 2));
      // 计算经纬度范围的交集
      const lonRange = new Cartesian2(
        Math.max(this.windData.bounds.west, minLon),
        Math.min(this.windData.bounds.east, maxLon)
      );
      const latRange = new Cartesian2(
        Math.max(this.windData.bounds.south, minLat),
        Math.min(this.windData.bounds.north, maxLat)
      );
      this.viewerParameters.lonRange = lonRange;
      this.viewerParameters.latRange = latRange;
    }

    const rawPixelSize = this.viewer.camera.getPixelSize(
      new BoundingSphere(Cartesian3.ZERO, Ellipsoid.WGS84.maximumRadius),
      this.viewer.scene.drawingBufferWidth,
      this.viewer.scene.drawingBufferHeight
    );
    const pixelSize = rawPixelSize + 100;

    if (pixelSize > 0) {
      this.viewerParameters.pixelSize = pixelSize;
    }

    this.viewerParameters.sceneMode = this.scene.mode;
    this.particleSystem?.applyViewerParameters(this.viewerParameters);
  }

  /**
   * Update the wind data of the wind layer.
   * @param {WindData} data - The new wind data to apply.
   */
  updateWindData(data: WindData): void {
    this.particleSystem.updateWindData(data);
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
