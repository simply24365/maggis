import { WindLayerOptions, WindData } from './types';
import { WindParticlesComputing } from './windParticlesComputing';
import { WindParticlesRendering } from './windParticlesRendering';
import CustomPrimitive from './customPrimitive';
import { ClearCommand, Color, Pass } from 'cesium';

export class WindParticleSystem {
  computing: WindParticlesComputing;
  rendering: WindParticlesRendering;
  windData: WindData;
  options: WindLayerOptions;
  viewerParameters: any;
  context: any;
  constructor(context: any, windData: WindData, options: WindLayerOptions, viewerParameters: any) {
    this.context = context;
    this.windData = windData;
    this.options = options;
    this.viewerParameters = viewerParameters;
    this.computing = new WindParticlesComputing(context, windData, options, viewerParameters);
    this.rendering = new WindParticlesRendering(context, options, viewerParameters, this.computing);
    this.applyViewerParameters(viewerParameters);
  }

  getPrimitives(): CustomPrimitive[] {
    const primitives = [
      this.computing.primitives.calculateSpeed,
      this.computing.primitives.updatePosition,
      this.computing.primitives.postProcessingPosition,
      this.rendering.primitives.segments,
    ];

    return primitives;
  }

  updateWindData(data: WindData): void {
    this.computing.updateWindData(data);
  }

  canvasResize(context: any) {
    this.context = context;
    this.computing.destroy();
    this.rendering.destroy();
    this.computing = new WindParticlesComputing(context, this.windData, this.options, this.viewerParameters);
    this.rendering = new WindParticlesRendering(context, this.options, this.viewerParameters, this.computing);
  }

  clearFramebuffers() {
    const clearCommand = new ClearCommand({
      color: new Color(0.0, 0.0, 0.0, 0.0),
      depth: 1.0,
      framebuffer: undefined,
      pass: Pass.OPAQUE
    });

    Object.keys(this.rendering.framebuffers).forEach((key) => {
      clearCommand.framebuffer = this.rendering.framebuffers[key as keyof typeof this.rendering.framebuffers];
      clearCommand.execute(this.context);
    });
  }

  private refreshParticles(maxParticlesChanged: boolean) {
    this.clearFramebuffers();

    this.computing.destroyParticlesTextures();
    this.computing.createParticlesTextures();

    if (maxParticlesChanged) {
      this.rendering.onParticlesTextureSizeChange();
    }
  }

  changeOptions(options: WindLayerOptions) {
    let maxParticlesChanged = false;
    if (this.options.particlesTextureSize != options.particlesTextureSize) {
      maxParticlesChanged = true;
    }

    this.options = {
      ...this.options,
      ...options
    }

    this.refreshParticles(maxParticlesChanged);
  }

  applyViewerParameters(viewerParameters: any): void {
    this.viewerParameters = viewerParameters;
    this.refreshParticles(false);
  }


  destroy(): void {
    this.computing.destroy();
    this.rendering.destroy();
  }
}