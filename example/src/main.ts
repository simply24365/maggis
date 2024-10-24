import { Viewer, Rectangle, ArcGisMapServerImageryProvider, ImageryLayer, SceneModePicker } from 'cesium';
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
  // sceneMode: SceneMode.SCENE2D,
  sceneModePicker: false,
});

new SceneModePicker('sceneModePicker', viewer.scene, 0)

// Define wind layer options
const options: WindLayerOptions = {
  particleHeight: 1000.0,
  fadeOpacity: 0.95,
  dropRate: 0.003,
  dropRateBump: 0.01,
  speedFactor: 5.0,
  lineWidth: 10.0,
  particlesTextureSize: 256,
  colors: [
    'rgb(36,104, 180)',
    'rgb(60,157, 194)',
    'rgb(128,205,193 )',
    'rgb(151,218,168 )',
    'rgb(198,231,181)',
    'rgb(238,247,217)',
    'rgb(255,238,159)',
    'rgb(252,217,125)',
    'rgb(255,182,100)',
    'rgb(252,150,75)',
    'rgb(250,112,52)',
    'rgb(245,64,32)',
    'rgb(237,45,28)',
    'rgb(220,24,32)',
    'rgb(180,0,35)',
  ],
  flipY: true,
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