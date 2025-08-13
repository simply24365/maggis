import { useEffect, useRef, useState } from 'react';
import { Viewer, Rectangle, ArcGisMapServerImageryProvider, ImageryLayer, Ion, CesiumTerrainProvider } from 'cesium';
import { FlowLayer, FlowLayerOptions, FlowData } from 'cesium-wind-layer';
import { GUI } from 'lil-gui';
import styled from 'styled-components';

Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJhY2IzNzQzNi1iOTVkLTRkZjItOWVkZi1iMGUyYTUxN2Q5YzYiLCJpZCI6NTUwODUsImlhdCI6MTcyNTQyMDE4NX0.yHbHpszFexPrxX6_55y0RgNrHjBQNu9eYkW9cXKUTPk';

const PageContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
`;

const CesiumContainer = styled.div`
  flex: 1;
  position: relative;
  overflow: hidden;
`;

// Add data configurations
const dataConfigs = {
  wind: {
    options: {
      domain: {
        min: 0,
        max: 0.02,
      },
      speedFactor: 0.7,
      
      // lineWidth: { min: 1, max: 3 }, // 좁은 지역이므로 선 굵기 변화를 줌
      // lineLength: { min: 5, max: 15 }, // 좁은 지역에 맞게 파티클 길이를 줄임
      particleHeight: 100,
      
      lineLength: { min: 0.1, max: 0.3 },
      lineWidth: { min: 0.1, max: 0.101 },
    },
  }
};

const defaultOptions: Partial<FlowLayerOptions> = {
  ...FlowLayer.defaultOptions,
  particlesTextureSize: 400,
  colors: ['#3288bd', '#66c2a5', '#abdda4', '#e6f598', '#ffffbf', '#fee08b', '#fdae61', '#f46d43', '#d53e4f', '#9e0142'],
  flipY: false,
  useViewerBounds: true,
  dynamic: true,
  visibility: {
    minSpeedAlpha: 0.3,      // 가까이서 볼 때 느린 파티클도 보이게
    maxSpeedAlpha: 1.0,
    minCameraAlpha: 0.5,     // 가까이서 볼 때 투명도 높임
    maxCameraAlpha: 1.0,
    cameraDistanceThreshold: 10000000,  // 거리 임계값 낮춤
    edgeFadeWidth: 0.05,     // 가장자리 페이드 줄임
    minEdgeFade: 0.8         // 최소 가장자리 투명도 높임
  },
  pixelSizeOptions: {
    minPixelSize: 200,       // 줌인 시에도 충분한 크기 보장
    maxPixelSize: 1000,
    useLogScale: true        // 부드러운 줌 전환
  }
};

// GUI controls configuration
const setupGUI = (flowLayer: FlowLayer) => {
  const gui = new GUI({ title: 'Flow Layer Controls' });
  
  // Get current options
  const options = { ...flowLayer.options };
  
  // Particle System Controls
  const particleFolder = gui.addFolder('Particle System');
  particleFolder.add(options, 'particlesTextureSize', 50, 500, 10)
    .name('Particles Texture Size')
    .onChange((value: number) => {
      flowLayer.updateOptions({ particlesTextureSize: value });
    });
  
  particleFolder.add(options, 'particleHeight', 0, 5000, 100)
    .name('Particle Height (m)')
    .onChange((value: number) => {
      flowLayer.updateOptions({ particleHeight: value });
    });
  
  // Animation Controls
  const animationFolder = gui.addFolder('Animation');
  animationFolder.add(options, 'speedFactor', 0.1, 3.0, 0.1)
    .name('Speed Factor')
    .onChange((value: number) => {
      flowLayer.updateOptions({ speedFactor: value });
    });
  
  animationFolder.add(options, 'dropRate', 0.001, 0.02, 0.001)
    .name('Drop Rate')
    .onChange((value: number) => {
      flowLayer.updateOptions({ dropRate: value });
    });
  
  animationFolder.add(options, 'dropRateBump', 0.001, 0.02, 0.001)
    .name('Drop Rate Bump')
    .onChange((value: number) => {
      flowLayer.updateOptions({ dropRateBump: value });
    });
  
  animationFolder.add(options, 'dynamic')
    .name('Dynamic Animation')
    .onChange((value: boolean) => {
      flowLayer.updateOptions({ dynamic: value });
    });
  
  // Line Properties
  const lineFolder = gui.addFolder('Line Properties');
  lineFolder.add(options.lineWidth, 'min', 0.001, 10, 0.01)
    .name('Min Line Width')
    .onChange((value: number) => {
      flowLayer.updateOptions({ 
        lineWidth: { ...options.lineWidth, min: value }
      });
    });
  
  lineFolder.add(options.lineWidth, 'max', 0.001, 10, 0.01)
    .name('Max Line Width')
    .onChange((value: number) => {
      flowLayer.updateOptions({ 
        lineWidth: { ...options.lineWidth, max: value }
      });
    });
  
  lineFolder.add(options.lineLength, 'min', 0.001, 10, 0.01)
    .name('Min Line Length')
    .onChange((value: number) => {
      flowLayer.updateOptions({ 
        lineLength: { ...options.lineLength, min: value }
      });
    });
  
  lineFolder.add(options.lineLength, 'max', 0.001, 10, 0.01)
    .name('Max Line Length')
    .onChange((value: number) => {
      flowLayer.updateOptions({ 
        lineLength: { ...options.lineLength, max: value }
      });
    });
  
  // Domain Controls
  const domainFolder = gui.addFolder('Domain & Display');
  if (!options.domain) {
    options.domain = { min: 0, max: 1 };
  }
  
  domainFolder.add(options.domain, 'min', 0, 1, 0.001)
    .name('Domain Min')
    .onChange((value: number) => {
      flowLayer.updateOptions({ 
        domain: { ...options.domain, min: value }
      });
    });
  
  domainFolder.add(options.domain, 'max', 0, 20, 0.1)
    .name('Domain Max')
    .onChange((value: number) => {
      flowLayer.updateOptions({ 
        domain: { ...options.domain, max: value }
      });
    });
  
  // Display Range Controls
  if (!options.displayRange) {
    options.displayRange = { min: 0, max: 8 };
  }
  
  domainFolder.add(options.displayRange, 'min', 0, 20, 0.1)
    .name('Display Range Min')
    .onChange((value: number) => {
      flowLayer.updateOptions({ 
        displayRange: { ...options.displayRange, min: value }
      });
    });
  
  domainFolder.add(options.displayRange, 'max', 0, 20, 0.1)
    .name('Display Range Max')
    .onChange((value: number) => {
      flowLayer.updateOptions({ 
        displayRange: { ...options.displayRange, max: value }
      });
    });
  
  // Other Controls
  const otherFolder = gui.addFolder('Other Options');
  otherFolder.add(options, 'flipY')
    .name('Flip Y Axis')
    .onChange((value: boolean) => {
      flowLayer.updateOptions({ flipY: value });
    });
  
  otherFolder.add(options, 'useViewerBounds')
    .name('Use Viewer Bounds')
    .onChange((value: boolean) => {
      flowLayer.updateOptions({ useViewerBounds: value });
    });
  
  // Color preset selector
  const colorPresets = {
    'Default': ['#3288bd', '#66c2a5', '#abdda4', '#e6f598', '#ffffbf', '#fee08b', '#fdae61', '#f46d43', '#d53e4f', '#9e0142'],
    'Blue-Red': ['#0000ff', '#4040ff', '#8080ff', '#c0c0ff', '#ffffff', '#ffc0c0', '#ff8080', '#ff4040', '#ff0000'],
    'Ocean': ['#003366', '#0066cc', '#3399ff', '#66ccff', '#99e6ff', '#ccf2ff'],
    'Viridis': ['#440154', '#31688e', '#35b779', '#fde725'],
    'White': ['white']
  };
  
  const colorControl = { preset: 'Default' };
  otherFolder.add(colorControl, 'preset', Object.keys(colorPresets))
    .name('Color Preset')
    .onChange((presetName: string) => {
      flowLayer.updateOptions({ colors: colorPresets[presetName as keyof typeof colorPresets] });
    });

  // Visibility Controls
  const visibilityFolder = gui.addFolder('Visibility');
  if (!options.visibility) {
    options.visibility = {
      minSpeedAlpha: 0.7,
      maxSpeedAlpha: 1.0,
      minCameraAlpha: 0.8,
      maxCameraAlpha: 1.0,
      cameraDistanceThreshold: 20000000,
      edgeFadeWidth: 0.1,
      minEdgeFade: 0.6
    };
  }
  
  visibilityFolder.add(options.visibility, 'minSpeedAlpha', 0.0, 1.0, 0.1)
    .name('Slow Particles Alpha')
    .onChange((value: number) => {
      flowLayer.updateOptions({ 
        visibility: { ...options.visibility!, minSpeedAlpha: value }
      });
    });
  
  visibilityFolder.add(options.visibility, 'maxSpeedAlpha', 0.0, 1.0, 0.1)
    .name('Fast Particles Alpha')
    .onChange((value: number) => {
      flowLayer.updateOptions({ 
        visibility: { ...options.visibility!, maxSpeedAlpha: value }
      });
    });
  
  visibilityFolder.add(options.visibility, 'minCameraAlpha', 0.0, 1.0, 0.1)
    .name('Close View Alpha')
    .onChange((value: number) => {
      flowLayer.updateOptions({ 
        visibility: { ...options.visibility!, minCameraAlpha: value }
      });
    });
  
  visibilityFolder.add(options.visibility, 'maxCameraAlpha', 0.0, 1.0, 0.1)
    .name('Far View Alpha')
    .onChange((value: number) => {
      flowLayer.updateOptions({ 
        visibility: { ...options.visibility!, maxCameraAlpha: value }
      });
    });
  
  visibilityFolder.add(options.visibility, 'cameraDistanceThreshold', 1000000, 50000000, 100000)
    .name('Distance Threshold')
    .onChange((value: number) => {
      flowLayer.updateOptions({ 
        visibility: { ...options.visibility!, cameraDistanceThreshold: value }
      });
    });
  
  visibilityFolder.add(options.visibility, 'edgeFadeWidth', 0.0, 0.5, 0.05)
    .name('Edge Fade Width')
    .onChange((value: number) => {
      flowLayer.updateOptions({ 
        visibility: { ...options.visibility!, edgeFadeWidth: value }
      });
    });
  
  visibilityFolder.add(options.visibility, 'minEdgeFade', 0.0, 1.0, 0.1)
    .name('Min Edge Alpha')
    .onChange((value: number) => {
      flowLayer.updateOptions({ 
        visibility: { ...options.visibility!, minEdgeFade: value }
      });
    });

  // Pixel Size Controls
  const pixelSizeFolder = gui.addFolder('Pixel Size');
  if (!options.pixelSizeOptions) {
    options.pixelSizeOptions = {
      minPixelSize: 200,
      maxPixelSize: 1000,
      useLogScale: true
    };
  }
  
  pixelSizeFolder.add(options.pixelSizeOptions, 'minPixelSize', 50, 500, 10)
    .name('Min Pixel Size')
    .onChange((value: number) => {
      flowLayer.updateOptions({ 
        pixelSizeOptions: { ...options.pixelSizeOptions!, minPixelSize: value }
      });
    });
  
  pixelSizeFolder.add(options.pixelSizeOptions, 'maxPixelSize', 500, 2000, 50)
    .name('Max Pixel Size')
    .onChange((value: number) => {
      flowLayer.updateOptions({ 
        pixelSizeOptions: { ...options.pixelSizeOptions!, maxPixelSize: value }
      });
    });
  
  pixelSizeFolder.add(options.pixelSizeOptions, 'useLogScale')
    .name('Use Log Scale')
    .onChange((value: boolean) => {
      flowLayer.updateOptions({ 
        pixelSizeOptions: { ...options.pixelSizeOptions!, useLogScale: value }
      });
    });
  
  // Layer controls
  const layerFolder = gui.addFolder('Layer Controls');
  const layerControls = {
    show: true,
    zoomToData: () => {
      flowLayer.zoomTo(1000);
    }
  };
  
  layerFolder.add(layerControls, 'show')
    .name('Show Layer')
    .onChange((value: boolean) => {
      flowLayer.show = value;
    });
  
  layerFolder.add(layerControls, 'zoomToData')
    .name('Zoom to Data');
  
  // Open some folders by default
  particleFolder.open();
  animationFolder.open();
  
  return gui;
};

export function Earth() {
  const viewerRef = useRef<Viewer | null>(null);
  const flowLayerRef = useRef<FlowLayer | null>(null);
  const guiRef = useRef<GUI | null>(null);
  const [, setIsFlowLayerReady] = useState(false);
  const isFirstLoadRef = useRef(true);

  useEffect(() => {
    let isComponentMounted = true;

    // Create viewer only if it doesn't exist
    if (!viewerRef.current) {
      viewerRef.current = new Viewer('cesiumContainer', {
        baseLayer: ImageryLayer.fromProviderAsync(ArcGisMapServerImageryProvider.fromUrl(
          'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer',
          { enablePickFeatures: false }
        ), {}),
        baseLayerPicker: false,
        animation: false,
        fullscreenButton: false,
        geocoder: false,
        homeButton: false,
        selectionIndicator: true,
        timeline: false,
        navigationHelpButton: false,
        shouldAnimate: true,
        useBrowserRecommendedResolution: false,
        sceneModePicker: false,
      });
    }
    // Add terrain
    CesiumTerrainProvider.fromIonAssetId(1).then(terrainProvider => {
      if (viewerRef.current) {
        viewerRef.current.terrainProvider = terrainProvider;
      }
    });

    viewerRef.current.scene.globe.depthTestAgainstTerrain = true;
    // Optional: Add exaggeration to make terrain features more visible
    // viewerRef.current.scene.verticalExaggeration = 2;
    // viewerRef.current.sceneModePicker.viewModel.duration = 0;
    
    const initFlowLayer = async () => {
      try {
        const res = await fetch('/river-data/velocity/20250724/flow_1.json');
        // const res = await fetch('/wind.json');
        const flowData: FlowData = await res.json();

        if (!isComponentMounted || !viewerRef.current) return;

        // Apply initial options with flow configuration and mask URL
        const initialOptions = {
          ...defaultOptions,
          ...dataConfigs.wind.options,
          maskUrl: '/river-data/mask.png'
        };

        if (isFirstLoadRef.current && flowData.bounds) {
          const rectangle = Rectangle.fromDegrees(
            flowData.bounds.west,
            flowData.bounds.south,
            flowData.bounds.east,
            flowData.bounds.north
          );
          console.log(rectangle);
          
          viewerRef.current.camera.flyTo({
            destination: rectangle,
            duration: 0,
          });
          isFirstLoadRef.current = false;
        }

        const layer = new FlowLayer(viewerRef.current, flowData, initialOptions);
        
        // Add event listeners
        layer.addEventListener('dataChange', (data) => {
          console.log('Flow data updated:', data);
          // Handle data change
        });

        layer.addEventListener('optionsChange', (options) => {
          console.log('Options updated:', options);
          // Handle options change
        });

        flowLayerRef.current = layer;
        
        // Setup GUI controls
        if (guiRef.current) {
          guiRef.current.destroy();
        }
        guiRef.current = setupGUI(layer);
        
        setIsFlowLayerReady(true);
      } catch (error) {
        console.error('Failed to initialize flow layer:', error);
      }
    };

    // Initialize flow layer
    initFlowLayer();

    return () => {
      isComponentMounted = false;
      isFirstLoadRef.current = true;
      
      // Cleanup GUI
      if (guiRef.current) {
        guiRef.current.destroy();
        guiRef.current = null;
      }
      
      if (flowLayerRef.current) {
        flowLayerRef.current.destroy();
        flowLayerRef.current = null;
        setIsFlowLayerReady(false);
      }

      if (viewerRef.current) {
        viewerRef.current.destroy();
        viewerRef.current = null;
      }
    };
  }, []);

  return (
    <PageContainer>
      <CesiumContainer id="cesiumContainer" />
    </PageContainer>
  );
}
