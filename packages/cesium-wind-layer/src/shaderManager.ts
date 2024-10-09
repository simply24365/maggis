import { ShaderSource } from 'cesium';
import { updatePositionShader } from './shaders/updatePosition';
import { calculateSpeedShader } from './shaders/calculateSpeed';
import { postProcessingPositionFragmentShader } from './shaders/postProcessingPosition';
import { renderParticlesFragmentShader, renderParticlesVertexShader } from './shaders/renderParticles';
import { fullscreenQuadVertexShader } from './shaders/fullscreenQuad';
import { trailDrawFragmentShader } from './shaders/trailDraw';
import { screenDrawFragmentShader } from './shaders/screenDraw';

export class ShaderManager {
  static getCalculateSpeedShader(): ShaderSource {
    return new ShaderSource({
      sources: [calculateSpeedShader]
    });
  }

  static getUpdatePositionShader(): ShaderSource {
    return new ShaderSource({
      sources: [updatePositionShader]
    });
  }

  static getRenderParticlesVertexShader(): ShaderSource {
    return new ShaderSource({
      sources: [renderParticlesVertexShader]
    });
  }

  static getPostProcessingPositionShader(): ShaderSource {
    return new ShaderSource({
      sources: [postProcessingPositionFragmentShader]
    });
  }

  static getFullscreenQuadVertexShader(): ShaderSource {
    return new ShaderSource({
      defines: ['DISABLE_GL_POSITION_LOG_DEPTH'],
      sources: [fullscreenQuadVertexShader]
    });
  }

  static getScreenDrawFragmentShader(): ShaderSource {
    return new ShaderSource({
      sources: [screenDrawFragmentShader]
    });
  }

  static getRenderParticlesFragmentShader(): ShaderSource {
    return new ShaderSource({
      defines: ['DISABLE_LOG_DEPTH_FRAGMENT_WRITE'],
      sources: [renderParticlesFragmentShader]
    });
  }

  static getTrailDrawFragmentShader(): ShaderSource {
    return new ShaderSource({
      defines: ['DISABLE_LOG_DEPTH_FRAGMENT_WRITE'],
      sources: [trailDrawFragmentShader]
    });
  }
}
