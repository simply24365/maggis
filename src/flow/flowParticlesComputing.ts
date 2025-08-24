import { PixelDatatype, PixelFormat, Sampler, Texture, TextureMagnificationFilter, TextureMinificationFilter, Cartesian2, FrameRateMonitor } from 'cesium';
import { type FlowLayerOptions, type FlowData } from './types';
import { ShaderManager } from './shaderManager';
import CustomPrimitive from './customPrimitive'
import { deepMerge, getQuantile } from './utils';

export class FlowParticlesComputing {
  context: any;
  options: FlowLayerOptions;
  viewerParameters: any;
  windTextures!: {
    U: Texture;
    V: Texture;
    mask: Texture;
    seeds: Texture;
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
    spawn: CustomPrimitive;
  };
  flowData: Required<FlowData>;
  private frameRateMonitor: FrameRateMonitor;
  frameRate: number = 60;
  frameRateAdjustment: number = 1;
  private startTime: number = Date.now();
  private currentTime: number = 0;

  constructor(context: any, flowData: Required<FlowData>, options: FlowLayerOptions, viewerParameters: any, scene: any) {
    this.context = context;
    this.options = options;
    this.viewerParameters = viewerParameters;
    this.flowData = flowData;

    this.frameRateMonitor = new FrameRateMonitor({
      scene: scene,
      samplingWindow: 1.0,
      quietPeriod: 0.0
    });
    this.initFrameRate();
    this.createWindTextures();
    this.createParticlesTextures();
    this.createComputingPrimitives();
  }

  private initFrameRate() {
    const updateFrameRate = () => {
      // avoid update frame rate when frame rate is too low
      if (this.frameRateMonitor.lastFramesPerSecond > 20) {
        this.frameRate = this.frameRateMonitor.lastFramesPerSecond;
        this.frameRateAdjustment = 60 / Math.max(this.frameRate, 1);
      }

    const safeFrameRate = Math.max(this.frameRate, 20.0);
    let adjustment = 60 / safeFrameRate;

    // 비정상적인 급증을 막기 위해 상한선을 설정 (예: 3.0은 20FPS에 해당)
    this.frameRateAdjustment = Math.min(adjustment, 3.0); 


      // Update time uniformly
      this.currentTime = (Date.now() - this.startTime) * 0.001;
    }

    // Initial frame rate calculation
    updateFrameRate();

    // Use setInterval instead of requestAnimationFrame - update every 16ms (~60fps)
    const intervalId = setInterval(updateFrameRate, 16);

    // Monitor frame rate changes
    this.frameRateMonitor.lowFrameRate.addEventListener((scene, frameRate) => {
      console.warn(`Low frame rate detected: ${frameRate} FPS`);
    });

    this.frameRateMonitor.nominalFrameRate.addEventListener((scene, frameRate) => {
      console.log(`Frame rate returned to normal: ${frameRate} FPS`);
    });

    // Add cleanup method to destroy
    const originalDestroy = this.destroy.bind(this);
    this.destroy = () => {
      clearInterval(intervalId);
      originalDestroy();
    };
  }

  createWindTextures() {
    const options = {
      context: this.context,
      width: this.flowData.width,
      height: this.flowData.height,
      pixelFormat: PixelFormat.RED,
      pixelDatatype: PixelDatatype.FLOAT,
      flipY: this.options.flipY ?? false,
      sampler: new Sampler({
        minificationFilter: TextureMinificationFilter.LINEAR,
        magnificationFilter: TextureMagnificationFilter.LINEAR
      })
    }

    this.windTextures = {
      U: new Texture({
        ...options,
        source: {
          arrayBufferView: new Float32Array(this.flowData.u.array)
        }
      }),
      V: new Texture({
        ...options,
        source: {
          arrayBufferView: new Float32Array(this.flowData.v.array)
        }
      }),
      mask: new Texture({
        ...options,
        source: {
          arrayBufferView: new Float32Array(this.flowData.mask.array)
        }
      }),
      seeds: this.createSeedsTexture(),
    };
  }

  private createSeedsTexture(): Texture {
    // Seeds texture uses RGBA format: R=longitude, G=latitude, B=0, A=unused
    const seedsArray = new Float32Array(this.options.particlesTextureSize * this.options.particlesTextureSize * 4);
    
    if (this.flowData.seeds && this.flowData.seeds.length > 0) {
      const seeds = this.flowData.seeds;
      const maxSeeds = this.options.particlesTextureSize * this.options.particlesTextureSize;
      
      for (let i = 0; i < Math.min(seeds.length, maxSeeds); i++) {
        const seed = seeds[i];
        const baseIndex = i * 4;
        seedsArray[baseIndex] = seed.lon;      // R
        seedsArray[baseIndex + 1] = seed.lat;   // G  
        seedsArray[baseIndex + 2] = 0.0; // B
        seedsArray[baseIndex + 3] = 1.0;             // A (valid flag)
      }
    }

    return new Texture({
      context: this.context,
      width: this.options.particlesTextureSize,
      height: this.options.particlesTextureSize,
      pixelFormat: PixelFormat.RGBA,
      pixelDatatype: PixelDatatype.FLOAT,
      source: {
        arrayBufferView: seedsArray
      },
      sampler: new Sampler({
        minificationFilter: TextureMinificationFilter.NEAREST,
        magnificationFilter: TextureMagnificationFilter.NEAREST
      })
    });
  }

  createParticlesTextures() {
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

    this.particlesTextures = {
      previousParticlesPosition: new Texture(options),
      currentParticlesPosition: new Texture(options),
      nextParticlesPosition: new Texture(options),
      postProcessingPosition: new Texture(options),
      particlesSpeed: new Texture(options)
    };
  }

  destroyParticlesTextures() {
    Object.values(this.particlesTextures).forEach(texture => texture.destroy());
  }

  createComputingPrimitives() {
    this.primitives = {
      calculateSpeed: new CustomPrimitive({
        commandType: 'Compute',
        uniformMap: {
          U: () => this.windTextures.U,
          V: () => this.windTextures.V,
          uRange: () => new Cartesian2(this.flowData.u.min, this.flowData.u.max),
          vRange: () => new Cartesian2(this.flowData.v.min, this.flowData.v.max),
          speedRange: () => new Cartesian2(this.flowData.speed.min, this.flowData.speed.max),
          currentParticlesPosition: () => this.particlesTextures.currentParticlesPosition,
          speedScaleFactor: () => {
            var speedFactor = (1000 + 50) * this.options.speedFactor;
            
            const ratio = this.flowData.speed.quantiles.q50 / 0.015;
            if (ratio < 1) {
              speedFactor = speedFactor / ratio;
            }
            return speedFactor;
          },
          frameRateAdjustment: () => this.frameRateAdjustment,
          dimension: () => new Cartesian2(this.flowData.width, this.flowData.height),
          minimum: () => new Cartesian2(this.flowData.bounds.west, this.flowData.bounds.south),
          maximum: () => new Cartesian2(this.flowData.bounds.east, this.flowData.bounds.north),
        },
        fragmentShaderSource: ShaderManager.getCalculateSpeedShader(),
        outputTexture: this.particlesTextures.particlesSpeed,
        preExecute: () => {
          // 과거 코드 방식으로 복원: nextParticlesPosition을 currentParticlesPosition으로 사용
          const temp = this.particlesTextures.previousParticlesPosition;
          this.particlesTextures.previousParticlesPosition = this.particlesTextures.currentParticlesPosition;
          this.particlesTextures.currentParticlesPosition = this.particlesTextures.nextParticlesPosition;
          this.particlesTextures.nextParticlesPosition = temp;
          if (this.primitives.calculateSpeed.commandToExecute) {
            this.primitives.calculateSpeed.commandToExecute.outputTexture = this.particlesTextures.particlesSpeed;
          }
        },
        isDynamic: () =>this.options.dynamic
      }),

      updatePosition: new CustomPrimitive({
        commandType: 'Compute',
        uniformMap: {
          currentParticlesPosition: () => this.particlesTextures.currentParticlesPosition,
          particlesSpeed: () => this.particlesTextures.particlesSpeed,
        },
        fragmentShaderSource: ShaderManager.getUpdatePositionShader(),
        // 1단계: 계산된 다음 위치를 'nextParticlesPosition' 텍스처에 저장
        outputTexture: this.particlesTextures.nextParticlesPosition,
        preExecute: () => {
          if (this.primitives.updatePosition.commandToExecute) {
            this.primitives.updatePosition.commandToExecute.outputTexture = this.particlesTextures.nextParticlesPosition;
          }
        },
        isDynamic: () => this.options.dynamic
      }),

      postProcessingPosition: new CustomPrimitive({
        commandType: 'Compute',
        uniformMap: {
          nextParticlesPosition: () => this.particlesTextures.nextParticlesPosition,
          particlesSpeed: () => this.particlesTextures.particlesSpeed,
          dataLonRange: () => new Cartesian2(this.flowData.bounds.west, this.flowData.bounds.east),
          dataLatRange: () => new Cartesian2(this.flowData.bounds.south, this.flowData.bounds.north),
          randomCoefficient: function () {
            return Math.random();
          },
          dropRate: () => this.options.dropRate,
          dropRateBump: () => this.options.dropRateBump
        },
        fragmentShaderSource: ShaderManager.getDropFlagPositionShader(),
        outputTexture: this.particlesTextures.postProcessingPosition,
        preExecute: () => {
          if (this.primitives.postProcessingPosition.commandToExecute) {
            this.primitives.postProcessingPosition.commandToExecute.outputTexture = this.particlesTextures.postProcessingPosition;
          }
        },
        isDynamic: () => this.options.dynamic
      }),

      spawn: new CustomPrimitive({
        commandType: 'Compute',
        uniformMap: {
          currentParticlesPosition: () => this.particlesTextures.postProcessingPosition,
          mask: () => this.windTextures.mask,
          seeds: () => this.windTextures.seeds, // Seeds texture
          dataLonRange: () => new Cartesian2(this.flowData.bounds.west, this.flowData.bounds.east),
          dataLatRange: () => new Cartesian2(this.flowData.bounds.south, this.flowData.bounds.north),
          lonRange: () => this.viewerParameters.lonRange,
          latRange: () => this.viewerParameters.latRange,
          dimension: () => new Cartesian2(this.flowData.width, this.flowData.height),
          minimum: () => new Cartesian2(this.flowData.bounds.west, this.flowData.bounds.south),
          maximum: () => new Cartesian2(this.flowData.bounds.east, this.flowData.bounds.north),
          randomCoefficient: function () {
            return Math.random();
          },
          particlesTextureSize: () => this.options.particlesTextureSize,
          useViewerBounds: () => this.options.useViewerBounds,
          t: () => this.currentTime
        },
        fragmentShaderSource: ShaderManager.getSpawnShader(),
        // Final result stored in nextParticlesPosition
        outputTexture: this.particlesTextures.nextParticlesPosition,
        preExecute: () => {
          if (this.primitives.spawn.commandToExecute) {
            this.primitives.spawn.commandToExecute.outputTexture = this.particlesTextures.nextParticlesPosition;
          }
        },
        isDynamic: () => this.options.dynamic
      })
    };
  }

  private reCreateWindTextures() {
    this.windTextures.U.destroy();
    this.windTextures.V.destroy();
    this.windTextures.mask.destroy();
    this.windTextures.seeds.destroy();
    this.createWindTextures();
  }

  updateFlowData(data: Required<FlowData>) {
    this.flowData = data;
    this.reCreateWindTextures();
  }

  updateOptions(options: Partial<FlowLayerOptions>) {
    const needUpdateWindTextures = options.flipY !== undefined && options.flipY !== this.options.flipY;
    this.options = deepMerge(options, this.options);
    if (needUpdateWindTextures) {
      this.reCreateWindTextures();
    }
  }

  processFlowData(data: {
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

    const maxNum = Math.max(Math.abs(min), Math.abs(max));

    for (let i = 0; i < array.length; i++) {
      const value = array[i] / maxNum; // Normalize to [-1, 1]
      result[i] = value;
    }
    console.log(result)
    return result;
  }

  destroy() {
    Object.values(this.windTextures).forEach(texture => {
      if (texture) texture.destroy();
    });
    Object.values(this.particlesTextures).forEach(texture => texture.destroy());
    Object.values(this.primitives).forEach(primitive => {
      if (primitive) primitive.destroy();
    });
    this.frameRateMonitor.destroy();
  }
}
