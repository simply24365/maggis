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
        max: 1,
      },
      speedFactor: 5,
      lineWidth: { min: 0.1, max: 1 },
      lineLength: { min: 0.1, max: 1 },
      particleHeight: 100,
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
  animationFolder.add(options, 'speedFactor', 1, 5.0, 0.5)
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
