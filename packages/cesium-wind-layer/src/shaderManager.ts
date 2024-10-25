import { ShaderSource } from 'cesium';
import { updatePositionShader } from './shaders/updatePosition';
import { calculateSpeedShader } from './shaders/calculateSpeed';
import { postProcessingPositionFragmentShader } from './shaders/postProcessingPosition';
import { renderParticlesFragmentShader, renderParticlesVertexShader } from './shaders/segmentDraw';
import { fullscreenQuadVertexShader } from './shaders/fullscreenQuad';
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

  static getSegmentDrawVertexShader(): ShaderSource {
    return new ShaderSource({
      sources: [renderParticlesVertexShader]
    });
  }

  static getSegmentDrawFragmentShader(): ShaderSource {
    return new ShaderSource({
      sources: [renderParticlesFragmentShader]
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
      defines: ['DISABLE_LOG_DEPTH_FRAGMENT_WRITE'],
      sources: [screenDrawFragmentShader]
    });
  }
}
