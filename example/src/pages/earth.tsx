import { useEffect, useRef, useState } from 'react';
import { Viewer, Rectangle, ArcGisMapServerImageryProvider, ImageryLayer, Ion, CesiumTerrainProvider } from 'cesium';
import { WindLayer, WindLayerOptions, WindData } from 'cesium-wind-layer';
import { ControlPanel } from '@/components/ControlPanel';
import styled from 'styled-components';
import { colorSchemes } from '@/components/ColorTableInput';
import { SpeedQuery } from '@/components/SpeedQuery';

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

const defaultOptions: Partial<WindLayerOptions> = {
  particlesTextureSize: 200,
  dropRate: 0.003,
  particleHeight: 1000,
  dropRateBump: 0.01,
  speedFactor: 0.5,
  lineWidth: 10.0,
  colors: colorSchemes[3].colors,
  flipY: true,
  useViewerBounds: true,
  domain: {
    min: 0,
    max: 8,
  },
};

export function Earth() {
  const viewerRef = useRef<Viewer | null>(null);
  const windLayerRef = useRef<WindLayer | null>(null);
  const [, setIsWindLayerReady] = useState(false);
  const dataIndexRef = useRef(0);
  const windDataFiles = ['/wind.json', '/wind2.json'];
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
    viewerRef.current.scene.verticalExaggeration = 2;
    // viewerRef.current.sceneModePicker.viewModel.duration = 0;
    
    const initWindLayer = async () => {
      try {
        const res = await fetch(windDataFiles[0]);
        const data = await res.json();

        if (!isComponentMounted || !viewerRef.current) return;

        const windData: WindData = {
          ...data,
          bounds: {
            west: data.bbox[0],
            south: data.bbox[1],
            east: data.bbox[2],
            north: data.bbox[3],
          }
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

        const layer = new WindLayer(viewerRef.current, windData, defaultOptions);
        
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

    const updateWindData = async () => {
      try {
        const nextIndex = (dataIndexRef.current + 1) % windDataFiles.length;
        const res = await fetch(windDataFiles[nextIndex]);
        const data = await res.json();

        if (!isComponentMounted || !windLayerRef.current) return;

        const windData: WindData = {
          ...data,
          bounds: {
            west: data.bbox[0],
            south: data.bbox[1],
            east: data.bbox[2],
            north: data.bbox[3],
          }
        };

        windLayerRef.current.updateWindData(windData);
        dataIndexRef.current = nextIndex;
      } catch (error) {
        console.error('Failed to update wind data:', error);
      }
    };

    // Initialize wind layer
    initWindLayer();

    // Set up interval to update data
    const intervalId = setInterval(updateWindData, 3000);

    return () => {
      isComponentMounted = false;
      isFirstLoadRef.current = true;
      clearInterval(intervalId);
      
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
      <SpeedQuery windLayer={windLayerRef.current} viewer={viewerRef.current} />
      <CesiumContainer id="cesiumContainer">
        <ControlPanel
          windLayer={windLayerRef.current}
          initialOptions={defaultOptions}
        />
      </CesiumContainer>
    </PageContainer>
  );
}
