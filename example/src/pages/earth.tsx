import { useEffect, useRef, useState } from 'react';
import { Viewer, Rectangle, ArcGisMapServerImageryProvider, ImageryLayer } from 'cesium';
import { WindLayer, WindLayerOptions, WindData } from 'cesium-wind-layer';
import { ControlPanel } from '@/components/ControlPanel';
import styled from 'styled-components';
import { colorSchemes } from '@/components/ColorTableInput';

const CesiumContainer = styled.div`
  width: 100vw;
  height: 100vh;
  overflow: hidden;
`;

const defaultOptions: Partial<WindLayerOptions> = {
  particlesTextureSize: 200,
  dropRate: 0.003,
  dropRateBump: 0.01,
  speedFactor: 10.0,
  lineWidth: 3.0,
  colors: colorSchemes[2].colors,
  flipY: true,
};

export function Earth() {
  const viewerRef = useRef<Viewer | null>(null);
  const windLayerRef = useRef<WindLayer | null>(null);
  // Add state to trigger re-render when windLayer is ready
  const [, setIsWindLayerReady] = useState(false);

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
        sceneModePicker: true,
      });
    }

    // Load wind data
    const loadWindData = async () => {
      // Skip if wind layer already exists or viewer is not initialized
      if (windLayerRef.current || !viewerRef.current) {
        return;
      }

      try {
        const res = await fetch('/wind.json');
        const data = await res.json();

        // Check if component is still mounted
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

        if (windData.bounds) {
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
        }

        const layer = new WindLayer(viewerRef.current, windData, defaultOptions);
        console.log('initailize windlayer', layer);
        windLayerRef.current = layer;
        // Trigger re-render when windLayer is ready
        setIsWindLayerReady(true);
      } catch (error) {
        console.error('Failed to load wind data:', error);
      }
    };

    loadWindData();

    return () => {
      isComponentMounted = false;
      
      if (windLayerRef.current) {
        console.log('destroy windlayer');
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
    <CesiumContainer id="cesiumContainer">
      <ControlPanel
        windLayer={windLayerRef.current}
        initialOptions={defaultOptions}
      />
    </CesiumContainer>
  );
}
