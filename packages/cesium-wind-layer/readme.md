# Cesium Wind Layer

[![npm version](https://img.shields.io/npm/v/cesium-wind-layer.svg)](https://www.npmjs.com/package/cesium-wind-layer)
[![license](https://img.shields.io/npm/l/cesium-wind-layer.svg)](https://github.com/your-repo/cesium-wind-layer/blob/main/LICENSE)

A Cesium plugin for GPU-accelerated visualization of wind field data with particle animation.

[中文文档](/packages/cesium-wind-layer/readme.zh-CN.md) | [Live Demo](https://cesium-wind-layer.opendde.com/)

| Wind Layer | Terrain Occlusion |
|-----------------|------------------------|
| ![Wind Layer Demo](/pictures/wind.gif) | ![Terrain Occlusion Demo](/pictures/terrain.gif) |

## 📚 Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
- [API Reference](#api-reference)
- [License](#license)

## ✨ Features

- ⚡️ Real-time wind field visualization using particle system
- 🚀 GPU-accelerated particle computation and rendering
- 🎨 Customizable particle appearance and behavior
- 🏔️ Terrain occlusion support, particles are blocked by terrain

## 📦 Installation

```bash
pnpm add cesium-wind-layer
```

## 🚀 Usage

### Basic Example

```typescript
import { Viewer } from 'cesium';
import { WindLayer } from 'cesium-wind-layer';

// Create Cesium viewer
const viewer = new Viewer('cesiumContainer');

// Prepare wind data
const windData = {
  u: {
    array: Float32Array,  // U component of wind velocity
    min: number,         // Optional: minimum value
    max: number          // Optional: maximum value
  },
  v: {
    array: Float32Array,  // V component of wind velocity
    min: number,         // Optional: minimum value
    max: number          // Optional: maximum value
  },
  width: number,         // Data grid width
  height: number,        // Data grid height
  bounds: {
    west: number,        // Western boundary (longitude)
    south: number,       // Southern boundary (latitude)
    east: number,        // Eastern boundary (longitude)
    north: number        // Northern boundary (latitude)
  }
};

// Create wind layer with options
const windLayer = new WindLayer(viewer, windData, {
  particlesTextureSize: 100,  // Size of the particle texture. Determines the maximum number of particles (size squared).
  particleHeight: 1000,       // Height of particles above ground
  lineWidth: 10.0,            // Width of particle trails
  speedFactor: 1.0,         // Speed multiplier
  dropRate: 0.003,           // Rate at which particles are dropped
  dropRateBump: 0.001,       // Additional drop rate for slow particles
  colors: ['white'],         // Colors for particles
  flipY: false              // Flip Y coordinates if needed
});
```

## 📖 API Reference

### WindLayer

Main class for wind visualization.

#### Constructor Options

```typescript
interface WindLayerOptions {
  particlesTextureSize: number;  // Size of the particle texture. Determines the maximum number of particles (size squared). (default: 100)
  particleHeight: number;        // Height of particles (default: 0)
  lineWidth: number;            // Width of particle lines (default: 10.0)
  speedFactor: number;          // Speed multiplier (default: 1.0)
  dropRate: number;             // Particle drop rate (default: 0.003)
  dropRateBump: number;         // Additional drop rate (default: 0.001)
  colors: string[];            // Array of colors for particles
  flipY: boolean;              // Flip Y coordinates (default: false)
  useViewerBounds: boolean;    // Use viewer bounds to generate particles (default: false)
}
```

#### Methods

| Method | Description |
|--------|-------------|
| `add()` | Add the wind layer to the scene |
| `remove()` | Remove the wind layer from the scene |
| `show: boolean` | Get or set the visibility of the wind layer |
| `updateWindData(data: WindData)` | Update the wind field data |
| `updateOptions(options: Partial<WindLayerOptions>)` | Update the options of the wind layer |
| `getDataAtLonLat(lon: number, lat: number): WindDataAtLonLat \| null` | Get the wind data at a specific longitude and latitude, returns both original and interpolated values. Returns null if coordinates are outside bounds |
| `zoomTo(duration?: number)` | Zoom the camera to fit the wind field extent |
| `isDestroyed(): boolean` | Check if the wind layer has been destroyed |
| `destroy()` | Clean up resources and destroy the wind layer |

## 📄 License

[MIT](/LICENSE)
