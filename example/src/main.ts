import { Viewer, Rectangle, ArcGisMapServerImageryProvider, ImageryLayer, SceneMode } from 'cesium';
import { WindLayer, WindLayerOptions, WindData } from 'cesium-wind-layer';
import 'cesium/Build/Cesium/Widgets/widgets.css';

// Initialize the Cesium Viewer in the HTML element with the `cesiumContainer` ID.
const viewer = new Viewer('cesiumContainer', {
  baseLayer: ImageryLayer.fromProviderAsync(ArcGisMapServerImageryProvider.fromUrl('https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer', {
    enablePickFeatures: false
  }), {}),
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
  orderIndependentTranslucency: false,
  // sceneMode: SceneMode.SCENE2D,
});

// Define wind layer options
const options: WindLayerOptions = {
  particleHeight: 1000.0,
  fadeOpacity: 0.996,
  dropRate: 0.003,
  dropRateBump: 0.01,
  speedFactor: 1.0,
  lineWidth: 10.0,
  particlesTextureSize: 100,
  colors: ['#ffffff', '#0000ff', '#00ffff', '#00ff00', '#ffff00', '#ff0000'],
};
let windLayer: WindLayer;
fetch('/wind.json').then(res => res.json()).then(data => {
  const windData: WindData = {
    ...data,
    bounds: {
      west: data.bbox[0],
      south: data.bbox[1],
      east: data.bbox[2],
      north: data.bbox[3],
    }
  };
  // 创建风场图层
  windLayer = new WindLayer(viewer, windData, options);

  // Zoom to wind data bounds
  if (windData.bounds) {
    const rectangle = Rectangle.fromDegrees(
      windData.bounds.west,
      windData.bounds.south,
      windData.bounds.east,
      windData.bounds.north
    );
    viewer.camera.flyTo({
      destination: rectangle,
      duration: 0,
    });
  }
});


// Add UI controls
const toggleButton = document.createElement('button');
toggleButton.textContent = 'Toggle Wind Layer';
toggleButton.style.position = 'absolute';
toggleButton.style.top = '10px';
toggleButton.style.left = '10px';
document.body.appendChild(toggleButton);

let isVisible = true;
toggleButton.onclick = () => {
  if (isVisible) {
    windLayer.show = false;
    isVisible = false;
  } else {
    windLayer.show = true;
    isVisible = true;
  }
};