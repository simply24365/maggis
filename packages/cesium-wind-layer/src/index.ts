import {
  Viewer,
  Scene,
  Cartesian2,
  Event,
  Cartesian3,
  BoundingSphere,
  Ellipsoid,
  SceneMode,
  Math as CesiumMath
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
      this.updatePrimitivesVisibility();
    }
  }

  static defaultOptions: WindLayerOptions = {
    particlesTextureSize: 100,
    particleHeight: 0,
    lineWidth: 3.0,
    speedFactor: 10,
    dropRate: 0.003,
    dropRateBump: 0.001,
    colors: ['white'],
    flipY: false
  }

  private viewer: Viewer;
  private scene: Scene;
  private options: WindLayerOptions;
  private particleSystem: WindParticleSystem;
  private viewerParameters: {
    lonRange: Cartesian2;
    latRange: Cartesian2;
    pixelSize: number;
    sceneMode: SceneMode;
  };
  private preUpdateEvent: Event;
  private postUpdateEvent: Event;
  private _isDestroyed: boolean = false;
  private primitives: any[] = [];
  private moveStartFun: () => void;
  private moveEndFun: () => void;
  private resizeFun: () => void;
  private preRenderFun: () => void;

  /**
   * WindLayer class for visualizing wind field data with particle animation in Cesium.
   * 
   * @class
   * @param {Viewer} viewer - The Cesium viewer instance.
   * @param {WindData} windData - The wind field data to visualize.
   * @param {Partial<WindLayerOptions>} [options] - Optional configuration options for the wind layer.
   * @param {number} [options.particlesTextureSize=100] - Size of the particle texture. Determines the maximum number of particles.
   * @param {number} [options.particleHeight=0] - Height of particles above the ground in meters.
   * @param {number} [options.lineWidth=3.0] - Width of particle trails in pixels.
   * @param {number} [options.speedFactor=10.0] - Factor to adjust the speed of particles.
   * @param {number} [options.dropRate=0.003] - Rate at which particles are dropped (reset).
   * @param {number} [options.dropRateBump=0.001] - Additional drop rate for slow-moving particles.
   * @param {string[]} [options.colors=['white']] - Array of colors for particles. Can be used to create color gradients.
   * @param {boolean} [options.flipY=false] - Whether to flip the Y-axis of the wind data.
   */
  constructor(viewer: Viewer, windData: WindData, options?: Partial<WindLayerOptions>) {
    this.show = true;
    this.viewer = viewer;
    this.scene = viewer.scene;
    this.options = { ...WindLayer.defaultOptions, ...options };
    this.windData = windData;

    this.viewerParameters = {
      lonRange: new Cartesian2(0, 0),
      latRange: new Cartesian2(0, 0),
      pixelSize: 0.0,
      sceneMode: this.scene.mode
    };
    this.updateViewerParameters();

    this.preUpdateEvent = new Event();
    this.postUpdateEvent = new Event();

    this.particleSystem = new WindParticleSystem(this.scene.context, windData, this.options, this.viewerParameters);
    this.particleSystem.applyViewerParameters(this.viewerParameters);
    console.log('Particle system created:', this.particleSystem);
    this.addPrimitives();

    this.moveStartFun = this.onMoveStart.bind(this);
    this.moveEndFun = this.onMoveEnd.bind(this);
    this.resizeFun = this.onResize.bind(this);
    this.preRenderFun = this.onPreRender.bind(this);

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.viewer.camera.moveStart.addEventListener(this.moveStartFun);
    this.viewer.camera.moveEnd.addEventListener(this.moveEndFun);
    this.scene.preRender.addEventListener(this.preRenderFun);
    window.addEventListener("resize", this.resizeFun);
  }

  private removeEventListeners(): void {
    this.viewer.camera.moveStart.removeEventListener(this.moveStartFun);
    this.viewer.camera.moveEnd.removeEventListener(this.moveEndFun);
    window.removeEventListener("resize", this.resizeFun);
    this.scene.preRender.removeEventListener(this.preRenderFun);
  }

  private onMoveStart(): void {
  }

  private onMoveEnd(): void {
    // this.updateViewerParameters();
    // this.particleSystem.applyViewerParameters(this.viewerParameters);
  }

  private onResize(): void {
    this._resized = true;
    this.remove();
  }

  private onPreRender(): void {
    this.preUpdateEvent.raiseEvent();
    this.postUpdateEvent.raiseEvent();
    if (this._resized) {
      this.particleSystem.canvasResize(this.scene.context);
      this.addPrimitives();
      this._resized = false;
    }
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

    const pixelSize = this.viewer.camera.getPixelSize(
      new BoundingSphere(Cartesian3.ZERO, Ellipsoid.WGS84.maximumRadius),
      this.viewer.scene.drawingBufferWidth,
      this.viewer.scene.drawingBufferHeight
    );
    if (pixelSize > 0) {
      this.viewerParameters.pixelSize = pixelSize;
    }

    this.viewerParameters.sceneMode = this.scene.mode;
  }

  updateWindData(data: WindData): void {
    this.particleSystem.updateWindData(data);
    this.viewer.scene.requestRender();
  }

  private addPrimitives(): void {
    this.primitives = this.particleSystem.getPrimitives();
    this.primitives.forEach(primitive => {
      this.scene.primitives.add(primitive);
    });
    this.updatePrimitivesVisibility();
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