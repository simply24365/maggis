import { useEffect, useRef, useState } from 'react';
import { Viewer, Rectangle, ArcGisMapServerImageryProvider, ImageryLayer, Ion, CesiumTerrainProvider } from 'cesium';
import { FlowLayer, FlowLayerOptions, FlowData, fetchImageAsMask } from 'cesium-wind-layer';
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
        max: 8,
      },
      speedFactor: 0.8,
      lineWidth: { min: 1, max: 2 },
      lineLength: { min: 50, max: 100 },
      particleHeight: 100,
    },
  }
};

const defaultOptions: Partial<FlowLayerOptions> = {
  ...FlowLayer.defaultOptions,
  particlesTextureSize: 200,
  colors: ['#3288bd', '#66c2a5', '#abdda4', '#e6f598', '#ffffbf', '#fee08b', '#fdae61', '#f46d43', '#d53e4f', '#9e0142'],
  flipY: true,
  useViewerBounds: true,
  dynamic: true,
};

export function Earth() {
  const viewerRef = useRef<Viewer | null>(null);
  const flowLayerRef = useRef<FlowLayer | null>(null);
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
        const res = await fetch('/wind.json');
        const data = await res.json();

        if (!isComponentMounted || !viewerRef.current) return;

        const flowData: FlowData = {
          ...data,
          bounds: {
            west: data.bbox[0],
            south: data.bbox[1],
            east: data.bbox[2],
            north: data.bbox[3],
          }
        };

        // Apply initial options with flow configuration and mask URL
        const initialOptions = {
          ...defaultOptions,
          ...dataConfigs.wind.options,
          maskUrl: '/river-data/mask.png'  // Let FlowLayer load the mask automatically
        };

        if (isFirstLoadRef.current && flowData.bounds) {
          const rectangle = Rectangle.fromDegrees(
            flowData.bounds.west,
            flowData.bounds.south,
            flowData.bounds.east,
            flowData.bounds.north
          );
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
