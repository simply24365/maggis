import { PixelDatatype, PixelFormat, Sampler, Texture, TextureMagnificationFilter, TextureMinificationFilter, Math as CesiumMath, Cartesian2 } from 'cesium';
import { WindLayerOptions, WindData } from './types';
import { ShaderManager } from './shaderManager';
import CustomPrimitive from './customPrimitive'

export class WindParticlesComputing {
  context: any;
  options: WindLayerOptions;
  viewerParameters: any;
  windTextures!: {
    U: Texture;
    V: Texture;
  };
  particlesTextures!: {
    previousParticlesPosition: Texture;
    currentParticlesPosition: Texture;
    nextParticlesPosition: Texture;
    postProcessingPosition: Texture;
    particlesSpeed: Texture;
  };
  primitives!: {
    calculateSpeed: CustomPrimitive;
    updatePosition: CustomPrimitive;
    postProcessingPosition: CustomPrimitive;
  };
  lastTime: number = 0;
  uTextureData: Float32Array;
  vTextureData: Float32Array;
  bounds: { west: number; south: number; east: number; north: number; };
  windData: WindData;

  constructor(context: any, windData: WindData, options: WindLayerOptions, viewerParameters: any) {
    this.context = context;
    this.options = options;
    this.viewerParameters = viewerParameters;
    this.bounds = windData.bounds;
    this.windData = windData;

    this.uTextureData = this.processWindData(windData.u);
    this.vTextureData = this.processWindData(windData.v);
    this.createWindTextures();
    this.createParticlesTextures();
    this.createComputingPrimitives();
  }

  createWindTextures() {
    const options = {
      context: this.context,
      width: this.windData.width,
      height: this.windData.height,
      pixelFormat: PixelFormat.RED,
      pixelDatatype: PixelDatatype.FLOAT,
      flipY: false,
      sampler: new Sampler({
        minificationFilter: TextureMinificationFilter.LINEAR,
        magnificationFilter: TextureMagnificationFilter.LINEAR
      })
    }

    this.windTextures = {
      U: new Texture({
        ...options,
        source: {
          arrayBufferView: this.uTextureData
        }
      }),
      V: new Texture({
        ...options,
        source: {
          arrayBufferView: this.vTextureData
        }
      }),
    };
  }

  private randomizeParticles() {
    const array = new Float32Array(this.options.particlesTextureSize * this.options.particlesTextureSize * 4);
    for (let i = 0; i < this.options.particlesTextureSize * this.options.particlesTextureSize; i++) {
      array[4 * i] = CesiumMath.randomBetween(this.bounds.west, this.bounds.east);
      array[4 * i + 1] = CesiumMath.randomBetween(this.bounds.south, this.bounds.north);
      array[4 * i + 2] = 0;
      array[4 * i + 3] = 0;
    }
    return array;
  }

  createParticlesTextures() {
    const particlesArray = this.randomizeParticles();
    const options = {
      context: this.context,
      width: this.options.particlesTextureSize,
      height: this.options.particlesTextureSize,
      pixelFormat: PixelFormat.RGBA,
      pixelDatatype: PixelDatatype.FLOAT,
      flipY: false,
      source: {
        arrayBufferView: new Float32Array(this.options.particlesTextureSize * this.options.particlesTextureSize * 4).fill(0)
      },
      sampler: new Sampler({
        minificationFilter: TextureMinificationFilter.NEAREST,
        magnificationFilter: TextureMagnificationFilter.NEAREST
      })
    }

    const particleOptions = {
      ...options,
      source: {
        arrayBufferView: particlesArray
      }
    }

    this.particlesTextures = {
      previousParticlesPosition: new Texture(particleOptions),
      currentParticlesPosition: new Texture(particleOptions),
      nextParticlesPosition: new Texture(particleOptions),
      postProcessingPosition: new Texture(particleOptions),
      particlesSpeed: new Texture(options)
    };
  }

  createComputingPrimitives() {
    const dimension = new Cartesian2(this.windData.width, this.windData.height);
    const minimum = new Cartesian2(this.bounds.west, this.bounds.south);
    const maximum = new Cartesian2(this.bounds.east, this.bounds.north);
    const interval = new Cartesian2(
      (maximum.x - minimum.x) / (dimension.x - 1),
      (maximum.y - minimum.y) / (dimension.y - 1)
    );
    const lonRange = new Cartesian2(this.bounds.west, this.bounds.east);
    const latRange = new Cartesian2(this.bounds.south, this.bounds.north);

    this.primitives = {
      calculateSpeed: new CustomPrimitive({
        commandType: 'Compute',
        uniformMap: {
          U: () => this.windTextures.U,
          V: () => this.windTextures.V,
          currentParticlesPosition: () => this.particlesTextures.currentParticlesPosition,
          speedScaleFactor: () => this.viewerParameters.pixelSize * this.options.speedFactor,
          dimension: () => dimension,
          minimum: () => minimum,
          maximum: () => maximum,
          interval: () => interval,
          lonRange: () => lonRange,
          latRange: () => latRange,
        },
        fragmentShaderSource: ShaderManager.getCalculateSpeedShader(),
        outputTexture: this.particlesTextures.particlesSpeed,
        preExecute: () => {
          const temp = this.particlesTextures.previousParticlesPosition;
          this.particlesTextures.previousParticlesPosition = this.particlesTextures.currentParticlesPosition;
          this.particlesTextures.currentParticlesPosition = this.particlesTextures.postProcessingPosition;
          this.particlesTextures.postProcessingPosition = temp;
          if (this.primitives.calculateSpeed.commandToExecute) {
            this.primitives.calculateSpeed.commandToExecute.outputTexture = this.particlesTextures.particlesSpeed;
          }
        }
      }),

      updatePosition: new CustomPrimitive({
        commandType: 'Compute',
        uniformMap: {
          currentParticlesPosition: () => this.particlesTextures.currentParticlesPosition,
          particlesSpeed: () => this.particlesTextures.particlesSpeed
        },
        fragmentShaderSource: ShaderManager.getUpdatePositionShader(),
        outputTexture: this.particlesTextures.nextParticlesPosition,
        preExecute: () => {
          if (this.primitives.updatePosition.commandToExecute) {
            this.primitives.updatePosition.commandToExecute.outputTexture = this.particlesTextures.nextParticlesPosition;
          }
        }
      }),

      postProcessingPosition: new CustomPrimitive({
        commandType: 'Compute',
        uniformMap: {
          nextParticlesPosition: () => this.particlesTextures.nextParticlesPosition,
          particlesSpeed: () => this.particlesTextures.particlesSpeed,
          lonRange: () => [this.bounds.west, this.bounds.east],
          latRange: () => [this.bounds.south, this.bounds.north],
          viewerLonRange: () => this.viewerParameters.lonRange,
          viewerLatRange: () => this.viewerParameters.latRange,
          dimension: () => dimension,
          minimum: () => minimum,
          maximum: () => maximum,
          interval: () => interval,
          randomCoefficient: function () {
            const randomCoefficient = Math.random();
            return randomCoefficient;
          },
          dropRate: () => this.options.dropRate,
          dropRateBump: () => this.options.dropRateBump
        },
        fragmentShaderSource: ShaderManager.getPostProcessingPositionShader(),
        outputTexture: this.particlesTextures.postProcessingPosition,
        preExecute: () => {
          if (this.primitives.postProcessingPosition.commandToExecute) {
            this.primitives.postProcessingPosition.commandToExecute.outputTexture = this.particlesTextures.postProcessingPosition;
          }
        }
      })
    };
  }

  updateWindData(data: WindData) {
    const uTextureData = this.processWindData(data.u);
    const vTextureData = this.processWindData(data.v);
    this.windTextures.U.copyFrom({ source: uTextureData });
    this.windTextures.V.copyFrom({ source: vTextureData });
  }

  processWindData(data: {
    array: Float32Array;
    min?: number;
    max?: number;
  }): Float32Array {
    const { array } = data;
    let { min, max } = data;
    const result = new Float32Array(array.length);
    if (min === undefined) {
      console.warn('min is undefined, calculate min');
      min = Math.min(...array);
    }
    if (max === undefined) {
      console.warn('max is undefined, calculate max');
      max = Math.max(...array);
    }

    for (let i = 0; i < array.length; i++) {
      const value = (array[i] - min) / (max - min); // Normalize from [-1, 1] to [0, 1]
      result[i] = value;
    }

    return result;
  }

  applyViewerParameters(viewerParameters: any) {
    this.viewerParameters = viewerParameters;
    // Update uniforms if necessary
  }

  canvasResize(context: any) {
    this.context = context;
    this.createWindTextures();
    this.createParticlesTextures();
    this.createComputingPrimitives();
  }

  destroy() {
    Object.values(this.windTextures).forEach(texture => texture.destroy());
    Object.values(this.particlesTextures).forEach(texture => texture.destroy());
    Object.values(this.primitives).forEach(primitive => primitive.destroy());
  }
}