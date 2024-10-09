import { WindLayerOptions, WindData } from './types';
import { WindParticlesComputing } from './windParticlesComputing';
import { WindParticlesRendering } from './windParticlesRendering';
import CustomPrimitive from './customPrimitive';

export class WindParticleSystem {
  private computing: WindParticlesComputing;
  private rendering: WindParticlesRendering;

  constructor(context: any, windData: WindData, options: WindLayerOptions, viewerParameters: any) {
    this.computing = new WindParticlesComputing(context, windData, options, viewerParameters);
    this.rendering = new WindParticlesRendering(context, options, viewerParameters, this.computing);
  }

  getPrimitives(): CustomPrimitive[] {
    const primitives = [
      this.computing.primitives.calculateSpeed,
      this.computing.primitives.updatePosition,
      this.computing.primitives.postProcessingPosition,
      this.rendering.primitives.segments,
      this.rendering.primitives.trails,
      this.rendering.primitives.screen
    ];
    console.log('Returning primitives:', primitives);
    return primitives;
  }

  canvasResize(context: any): void {
    this.computing.canvasResize(context);
    this.rendering.canvasResize(context);
  }

  applyViewerParameters(viewerParameters: any): void {
    this.computing.applyViewerParameters(viewerParameters);
    this.rendering.applyViewerParameters(viewerParameters);
  }

  updateWindData(data: WindData): void {
    this.computing.updateWindData(data);
  }

  destroy(): void {
    this.computing.destroy();
    this.rendering.destroy();
  }
}