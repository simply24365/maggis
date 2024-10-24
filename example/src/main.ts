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
  dropRate: 0.003,
  dropRateBump: 0.01,
  speedFactor: 5.0,
  lineWidth: 5.0,
  particlesTextureSize: 200,
  colors: [
    "rgb(110, 64, 170)",
    "rgb(95, 86, 201)",
    "rgb(74, 113, 221)",
    "rgb(51, 145, 225)",
    "rgb(32, 177, 212)",
    "rgb(25, 206, 186)",
    "rgb(34, 229, 153)",
    "rgb(59, 242, 119)",
    "rgb(100, 247, 95)",
    "rgb(150, 243, 87)",
    "rgb(186, 227, 73)",
    "rgb(214, 197, 50)",
    "rgb(242, 162, 47)",
    "rgb(255, 129, 63)",
    "rgb(255, 100, 91)",
    "rgb(255, 79, 124)",
    "rgb(233, 66, 154)",
    "rgb(195, 61, 173)",
    "rgb(152, 61, 179)",
    "rgb(110, 64, 170)"
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
  // 创建风场图层
  windLayer = new WindLayer(viewer, windData, options);
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