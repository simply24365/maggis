import { useEffect, useRef, useState } from 'react';
import { Viewer, Rectangle, ArcGisMapServerImageryProvider, ImageryLayer, Ion, CesiumTerrainProvider } from 'cesium';
import { WindLayer, WindLayerOptions, WindData } from 'cesium-wind-layer';
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
    file: '/wind.json'
  },
  ocean: {
    options: {
      domain: {
        min: 0,
        max: 1,
      },
      speedFactor: 8,
      lineWidth: { min: 1, max: 4 },
      lineLength: { min: 20, max: 50 },
      particleHeight: 10,
    },
    file: '/ocean.json'
  }
};

const defaultOptions: Partial<WindLayerOptions> = {
  ...WindLayer.defaultOptions,
  particlesTextureSize: 200,
  colors: ['#3288bd', '#66c2a5', '#abdda4', '#e6f598', '#ffffbf', '#fee08b', '#fdae61', '#f46d43', '#d53e4f', '#9e0142'],
  flipY: true,
  useViewerBounds: true,
  dynamic: true,
};

export function Earth() {
  const viewerRef = useRef<Viewer | null>(null);
  const windLayerRef = useRef<WindLayer | null>(null);
  const [, setIsWindLayerReady] = useState(false);
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
    
    const initWindLayer = async () => {
      try {
        const res = await fetch('/wind.json');
        const data = await res.json();

        if (!isComponentMounted || !viewerRef.current) return;

        // Create test mask: circle inside square (normalized coordinates)
        const createTestMask = (width: number, height: number) => {
          const mask = new Float32Array(width * height);
          
          // Circle parameters (in normalized coordinates 0-1)
          const centerX = 0.5;  // Center at 0.5
          const centerY = 0.5;  // Center at 0.5
          const radius = 0.5;   // Radius 0.5
          
          for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
              const index = y * width + x;
              
              // Convert pixel coordinates to normalized coordinates (0-1)
              const normalizedX = x / (width - 1);
              const normalizedY = y / (height - 1);
              
              // Calculate distance from center
              const dx = normalizedX - centerX;
              const dy = normalizedY - centerY;
              const distance = Math.sqrt(dx * dx + dy * dy);
              
              // Set mask: 1 if inside circle, 0 otherwise
              mask[index] = distance <= radius ? 1.0 : 0.0;
            }
          }
          
          return mask;
        };

        const testMask = createTestMask(data.width, data.height);

        const windData: WindData = {
          ...data,
          bounds: {
            west: data.bbox[0],
            south: data.bbox[1],
            east: data.bbox[2],
            north: data.bbox[3],
          },
          mask: {
            array: testMask,
            min: 0.0,
            max: 1.0
          }
        };

        // Apply initial options with wind configuration
        const initialOptions = {
          ...defaultOptions,
          ...dataConfigs.wind.options
        };

        if (isFirstLoadRef.current && windData.bounds) {
          const rectangle = Rectangle.fromDegrees(
            windData.bounds.west,
            windData.bounds.south,
            windData.bounds.east,
            windData.bounds.north
          );
          viewerRef.current.camera.flyTo({
            destination: rectangle,
            duration: 0,
          });
          isFirstLoadRef.current = false;
        }

        const layer = new WindLayer(viewerRef.current, windData, initialOptions);
        
        // Add event listeners
        layer.addEventListener('dataChange', (data) => {
          console.log('Wind data updated:', data);
          // Handle data change
        });

        layer.addEventListener('optionsChange', (options) => {
          console.log('Options updated:', options);
          // Handle options change
        });

        windLayerRef.current = layer;
        setIsWindLayerReady(true);
      } catch (error) {
        console.error('Failed to initialize wind layer:', error);
      }
    };

    // Initialize wind layer
    initWindLayer();

    return () => {
      isComponentMounted = false;
      isFirstLoadRef.current = true;
      
      if (windLayerRef.current) {
        windLayerRef.current.destroy();
        windLayerRef.current = null;
        setIsWindLayerReady(false);
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
