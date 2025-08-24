import { type FlowLayerOptions, type FlowData } from './types';
import { FlowParticlesComputing } from './flowParticlesComputing';
import { FlowParticlesRendering } from './flowParticlesRendering';
import CustomPrimitive from './customPrimitive';
import { ClearCommand, Color, Pass } from 'cesium';
import { deepMerge } from './utils';

export class FlowParticleSystem {
  computing: FlowParticlesComputing;
  rendering: FlowParticlesRendering;
  options: FlowLayerOptions;
  viewerParameters: any;
  context: any;
  constructor(context: any, flowData: Required<FlowData>, options: FlowLayerOptions, viewerParameters: any, scene: any) {
    this.context = context;
    this.options = options;
    this.viewerParameters = viewerParameters;
    this.computing = new FlowParticlesComputing(context, flowData, options, viewerParameters, scene);
    this.rendering = new FlowParticlesRendering(context, options, viewerParameters, this.computing);
    this.clearFramebuffers();
  }

  getPrimitives(): CustomPrimitive[] {
    const primitives = [
      this.computing.primitives.calculateSpeed,
      this.computing.primitives.updatePosition,
      this.computing.primitives.postProcessingPosition,
      this.computing.primitives.spawn,
      this.rendering.primitives.segments
    ];

    return primitives;
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

  changeOptions(options: Partial<FlowLayerOptions>) {
    let maxParticlesChanged = false;
    if (options.particlesTextureSize && this.options.particlesTextureSize !== options.particlesTextureSize) {
      maxParticlesChanged = true;
    }

    const newOptions = deepMerge(options, this.options);
    if (newOptions.particlesTextureSize < 1) {
      throw new Error('particlesTextureSize must be greater than 0');
    }
    this.options = newOptions;

    this.rendering.updateOptions(options);
    this.computing.updateOptions(options);
    if (maxParticlesChanged) {
      this.computing.destroyParticlesTextures();
      this.computing.createParticlesTextures();
      this.rendering.onParticlesTextureSizeChange();
    }
  }

  applyViewerParameters(viewerParameters: any): void {
    this.viewerParameters = viewerParameters;
    this.computing.viewerParameters = viewerParameters;
    this.rendering.viewerParameters = viewerParameters;
  }

  destroy(): void {
    this.computing.destroy();
    this.rendering.destroy();
  }
}