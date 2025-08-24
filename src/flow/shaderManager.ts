import { ShaderSource } from 'cesium';
import { updatePositionShader } from './shaders/updatePosition';
import { calculateSpeedShader } from './shaders/calculateSpeed';
import { dropParticleFragmentShader } from './shaders/dropParticles';
import { renderParticlesFragmentShader, renderParticlesVertexShader } from './shaders/segmentDraw';
import { spawnParticlesShader } from './shaders/spawnParticles';

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

  static getDropFlagPositionShader(): ShaderSource {
    return new ShaderSource({
      sources: [dropParticleFragmentShader]
    });
  }

  static getSpawnShader(): ShaderSource {
    return new ShaderSource({
      sources: [spawnParticlesShader]
    });
  }

}
