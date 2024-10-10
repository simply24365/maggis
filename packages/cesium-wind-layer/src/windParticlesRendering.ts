import { Geometry, GeometryAttribute, ComponentDatatype, PrimitiveType, GeometryAttributes, Color, Texture, Sampler, TextureMinificationFilter, TextureMagnificationFilter, PixelFormat, PixelDatatype, Framebuffer, Appearance, DepthFunction, SceneMode, TextureWrap, VertexArray, BufferUsage } from 'cesium';
import { WindLayerOptions } from './types';
import { WindParticlesComputing } from './windParticlesComputing';
import CustomPrimitive from './customPrimitive';
import { ShaderManager } from './shaderManager';

export class WindParticlesRendering {
  private context: any;
  private options: WindLayerOptions;
  private viewerParameters: any;
  private computing: WindParticlesComputing;
  public primitives!: ReturnType<typeof this.createPrimitives>;
  private colorTable: Texture;
  textures: ReturnType<typeof this.createRenderingTextures>;
  framebuffers: ReturnType<typeof this.createRenderingFramebuffers>;
  constructor(context: any, options: WindLayerOptions, viewerParameters: any, computing: WindParticlesComputing) {
    this.context = context;
    this.options = options;
    this.viewerParameters = viewerParameters;
    this.computing = computing;

    if (typeof this.options.particlesTextureSize !== 'number' || this.options.particlesTextureSize <= 0) {
      console.error('Invalid particlesTextureSize. Using default value of 256.');
      this.options.particlesTextureSize = 256;
    }

    this.colorTable = this.createColorTableTexture();
    this.textures = this.createRenderingTextures();
    this.framebuffers = this.createRenderingFramebuffers();
    this.primitives = this.createPrimitives();
  }

  createRenderingTextures() {
    const colorTextureOptions = {
      context: this.context,
      width: this.context.drawingBufferWidth,
      height: this.context.drawingBufferHeight,
      pixelFormat: PixelFormat.RGBA,
      pixelDatatype: PixelDatatype.UNSIGNED_BYTE
    };
    const depthTextureOptions = {
      context: this.context,
      width: this.context.drawingBufferWidth,
      height: this.context.drawingBufferHeight,
      pixelFormat: PixelFormat.DEPTH_COMPONENT,
      pixelDatatype: PixelDatatype.UNSIGNED_INT
    };

    return {
      segmentsColor: new Texture(colorTextureOptions),
      segmentsDepth: new Texture(depthTextureOptions),
      currentTrailsColor: new Texture(colorTextureOptions),
      currentTrailsDepth: new Texture(depthTextureOptions),
      nextTrailsColor: new Texture(colorTextureOptions),
      nextTrailsDepth: new Texture(depthTextureOptions)
    }
  }

  createRenderingFramebuffers() {
    return {
      segments: new Framebuffer({
        context: this.context,
        colorTextures: [this.textures.segmentsColor],
        depthTexture: this.textures.segmentsDepth
      }),
      currentTrails: new Framebuffer({
        context: this.context,
        colorTextures: [this.textures.currentTrailsColor],
        depthTexture: this.textures.currentTrailsDepth
      }),
      nextTrails: new Framebuffer({
        context: this.context,
        colorTextures: [this.textures.nextTrailsColor],
        depthTexture: this.textures.nextTrailsDepth
      })
    }
  }

  destoryRenderingFramebuffers() {
    Object.values(this.framebuffers).forEach((framebuffer: any) => {
      framebuffer.destroy();
    });
  }

  private createColorTableTexture(): Texture {
    const colorTableData = new Float32Array(this.options.colors.flatMap(color => {
      const cesiumColor = Color.fromCssColorString(color);
      return [cesiumColor.red, cesiumColor.green, cesiumColor.blue, cesiumColor.alpha];
    }));

    return new Texture({
      context: this.context,
      width: this.options.colors.length,
      height: 1,
      pixelFormat: PixelFormat.RGBA,
      pixelDatatype: PixelDatatype.FLOAT,
      sampler: new Sampler({
        minificationFilter: TextureMinificationFilter.LINEAR,
        magnificationFilter: TextureMagnificationFilter.LINEAR,
        wrapS: TextureWrap.CLAMP_TO_EDGE,
        wrapT: TextureWrap.CLAMP_TO_EDGE
      }),
      source: {
        width: this.options.colors.length,
        height: 1,
        arrayBufferView: colorTableData
      }
    });
  }

  private createFullscreenQuad(): Geometry {
    return new Geometry({
      attributes: new (GeometryAttributes as any)({
        position: new GeometryAttribute({
          componentDatatype: ComponentDatatype.FLOAT,
          componentsPerAttribute: 3,
          //  v3----v2
          //  |     |
          //  |     |
          //  v0----v1
          values: new Float32Array([
            -1, -1, 0, // v0
            1, -1, 0, // v1
            1, 1, 0, // v2
            -1, 1, 0, // v3
          ])
        }),
        st: new GeometryAttribute({
          componentDatatype: ComponentDatatype.FLOAT,
          componentsPerAttribute: 2,
          values: new Float32Array([
            0, 0,
            1, 0,
            1, 1,
            0, 1,
          ])
        })
      }),
      indices: new Uint32Array([3, 2, 0, 0, 2, 1])
    });
  }

  createSegmentsGeometry(): Geometry {
    const repeatVertex = 4, texureSize = this.options.particlesTextureSize;
    // 坐标系
    //  z
    //  | /y
    //  |/
    //  o------x
    let st: any = []; // 纹理数组 st坐标系，左下角被定义为(0,0), 右上角为(1,1)，用于传入到顶点着色器中指代粒子的位置
    for (let s = 0; s < texureSize; s++) {
      for (let t = 0; t < texureSize; t++) {
        for (let i = 0; i < repeatVertex; i++) {
          st.push(s / texureSize);
          st.push(t / texureSize);
        }
      }
    }
    st = new Float32Array(st);

    const particlesCount = this.options.particlesTextureSize ** 2;

    let normal: any = [];
    for (let i = 0; i < particlesCount; i++) {
      normal.push(
        // (point to use, offset sign, not used component)
        -1, -1, 0,
        -1, 1, 0,
        1, -1, 0,
        1, 1, 0
      )
    }
    normal = new Float32Array(normal);

    let vertexIndexes: any = []; // 索引,一个粒子矩形由两个三角形组成
    for (let i = 0, vertex = 0; i < particlesCount; i++) {
      vertexIndexes.push(
        // 第一个三角形用的顶点
        vertex + 0, vertex + 1, vertex + 2,
        // 第二个三角形用的顶点
        vertex + 2, vertex + 1, vertex + 3
      )

      vertex += repeatVertex;
    }
    vertexIndexes = new Uint32Array(vertexIndexes);

    const geometry = new Geometry({
      attributes: new (GeometryAttributes as any)({
        st: new GeometryAttribute({
          componentDatatype: ComponentDatatype.FLOAT,
          componentsPerAttribute: 2,
          values: st
        }),
        normal: new GeometryAttribute({
          componentDatatype: ComponentDatatype.FLOAT,
          componentsPerAttribute: 3,
          values: normal
        }),
      }),
      indices: vertexIndexes
    });

    return geometry;
  }

  private createRawRenderState(options: {
    viewport?: any;
    depthTest?: any;
    depthMask?: any;
    blending?: any;
  }): any {
    return (Appearance as any).getDefaultRenderState(true, false, options);
  }

  private createPrimitives() {
    const segments = new CustomPrimitive({
      commandType: 'Draw',
      attributeLocations: {
        st: 0,
        normal: 1
      },
      geometry: this.createSegmentsGeometry(),
      primitiveType: PrimitiveType.TRIANGLES,
      uniformMap: {
        previousParticlesPosition: () => this.computing.particlesTextures.previousParticlesPosition,
        currentParticlesPosition: () => this.computing.particlesTextures.currentParticlesPosition,
        postProcessingPosition: () => this.computing.particlesTextures.postProcessingPosition,
        particlesSpeed: () => this.computing.particlesTextures.particlesSpeed,
        colorTable: () => this.colorTable,
        particleHeight: () => this.options.particleHeight || 1000.0,
        aspect: () => this.context.drawingBufferWidth / this.context.drawingBufferHeight,
        pixelSize: () => this.viewerParameters.pixelSize,
        lineWidth: () => this.options.lineWidth,
        is3D: () => this.viewerParameters.sceneMode === SceneMode.SCENE3D,
      },
      vertexShaderSource: ShaderManager.getRenderParticlesVertexShader(),
      fragmentShaderSource: ShaderManager.getRenderParticlesFragmentShader(),
      rawRenderState: this.createRawRenderState({
        viewport: undefined,
        depthTest: {
          enabled: true
        },
        depthMask: true,
      }),
      framebuffer: this.framebuffers.segments,
      autoClear: true
    });

    const trails = new CustomPrimitive({
      commandType: 'Draw',
      attributeLocations: {
        position: 0,
        st: 1,
      },
      geometry: this.createFullscreenQuad(),
      primitiveType: PrimitiveType.TRIANGLES,
      uniformMap: {
        segmentsColorTexture: () => this.textures.segmentsColor,
        segmentsDepthTexture: () => this.textures.segmentsDepth,
        currentTrailsColor: () => this.framebuffers.currentTrails.getColorTexture(0),
        trailsDepthTexture: () => this.framebuffers.currentTrails.depthTexture,
        fadeOpacity: () => this.options.fadeOpacity
      },
      vertexShaderSource: ShaderManager.getFullscreenQuadVertexShader(),
      fragmentShaderSource: ShaderManager.getTrailDrawFragmentShader(),
      rawRenderState: this.createRawRenderState({
        viewport: undefined,
        depthTest: {
          enabled: true,
          func: DepthFunction.ALWAYS
        },
        depthMask: true
      }),
      framebuffer: this.framebuffers.nextTrails,
      autoClear: true,
      preExecute: () => {
        // swap framebuffers before binding
        const temp = this.framebuffers.currentTrails;
        this.framebuffers.currentTrails = this.framebuffers.nextTrails;
        this.framebuffers.nextTrails = temp;

        // keep the framebuffers up to date
        if (this.primitives.trails.commandToExecute) {
          this.primitives.trails.commandToExecute.framebuffer = this.framebuffers.nextTrails;
        }
        if (this.primitives.trails.clearCommand) {
          this.primitives.trails.clearCommand.framebuffer = this.framebuffers.nextTrails;
        }
      }
    });

    const screen = new CustomPrimitive({
      commandType: 'Draw',
      attributeLocations: {
        position: 0,
        st: 1
      },
      geometry: this.createFullscreenQuad(),
      primitiveType: PrimitiveType.TRIANGLES,
      uniformMap: {
        trailsColorTexture: () => this.framebuffers.nextTrails.getColorTexture(0),
        trailsDepthTexture: () => this.framebuffers.nextTrails.depthTexture
      },
      vertexShaderSource: ShaderManager.getFullscreenQuadVertexShader(),
      fragmentShaderSource: ShaderManager.getScreenDrawFragmentShader(),
      rawRenderState: this.createRawRenderState({
        viewport: undefined,
        depthTest: {
          enabled: false
        },
        depthMask: true,
        blending: {
          enabled: true
        }
      }),
      framebuffer: undefined
    });

    return { segments, trails, screen };
  }

  onParticlesTextureSizeChange() {
    const geometry = this.createSegmentsGeometry();
    this.primitives.segments.geometry = geometry;
    const vertexArray = VertexArray.fromGeometry({
      context: this.context,
      geometry: geometry,
      attributeLocations: this.primitives.segments.attributeLocations,
      bufferUsage: BufferUsage.STATIC_DRAW,
    });
    if (this.primitives.segments.commandToExecute) {
      this.primitives.segments.commandToExecute.vertexArray = vertexArray;
    }
  }

  destroy(): void {
    Object.values(this.framebuffers).forEach((framebuffer: any) => {
      framebuffer.destroy();
    });
    Object.values(this.primitives).forEach((primitive: any) => {
      primitive.destroy();
    });
    this.colorTable.destroy();
  }
}