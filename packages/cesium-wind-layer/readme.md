# Cesium Flow Layer

[![npm version](https://img.shields.io/npm/v/cesium-wind-layer.svg)](https://www.npmjs.com/package/cesium-wind-layer)
[![license](https://img.shields.io/npm/l/cesium-wind-layer.svg)](https://github.com/your-repo/cesium-wind-layer/blob/main/LICENSE)

A Cesium plugin for GPU-accelerated visualization of flow field data with particle animation.

[中文文档](/packages/cesium-wind-layer/readme.zh-CN.md) | [Live Demo](https://cesium-wind-layer.opendde.com/)

| Flow Layer | Terrain Occlusion |
|-----------------|------------------------|
| ![Flow Layer Demo](/pictures/wind.gif) | ![Terrain Occlusion Demo](/pictures/terrain.gif) |

## 📚 Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
- [API Reference](#api-reference)
- [License](#license)

## ✨ Features

- ⚡️ Real-time flow field visualization using particle system
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
import { FlowLayer } from 'cesium-wind-layer';

// Create Cesium viewer
const viewer = new Viewer('cesiumContainer');

// Prepare flow data
const flowData = {
  u: {
    array: Float32Array,  // U component of flow velocity
    min: number,         // Optional: minimum value
    max: number          // Optional: maximum value
  },
  v: {
    array: Float32Array,  // V component of flow velocity
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

// Create flow layer with options
const FlowLayer = new FlowLayer(viewer, flowData, {
  particlesTextureSize: 100,            // Size of the particle texture. Determines the maximum number of particles (size squared).
  particleHeight: 1000,                 // Height of particles above ground
  lineWidth: { min: 1, max: 2 },        // Width of particle trails
  lineLength: { min: 20, max: 100 },    // Length range of particle trails
  speedFactor: 1.0,                     // Speed multiplier
  dropRate: 0.003,                      // Rate at which particles are dropped
  dropRateBump: 0.001,                  // Additional drop rate for slow particles
  colors: ['white'],                    // Colors for particles
  flipY: false,                         // Flip Y coordinates if needed
  domain: undefined,                    // Optional: domain for speed
  displayRange: undefined,              // Optional: display range for speed
  dynamic: true,                        // Whether to enable dynamic particle animation
});
```

## 📖 API Reference

### FlowLayer

Main class for flow visualization.

#### Constructor Options

```typescript
interface FlowLayerOptions {
  particlesTextureSize: number;              // Size of the particle texture. Determines the maximum number of particles (size squared). Default is 100.
  particleHeight: number;                    // Height of particles above the ground in meters. Default is 0.
  lineWidth: { min: number; max: number };   // Width range of particle trails in pixels. Default is { min: 1, max: 2 }.
  lineLength: { min: number; max: number };  // Length range of particle trails. Default is { min: 20, max: 100 }.
  speedFactor: number;                       // Factor to adjust the speed of particles. Default is 1.0.
  dropRate: number;                          // Rate at which particles are dropped (reset). Default is 0.003.
  dropRateBump: number;                      // Additional drop rate for slow-moving particles. Default is 0.001.
  colors: string[];                          // Array of colors for particles. Can be used to create color gradients. Default is ['white'].
  flipY: boolean;                            // Whether to flip the Y-axis of the flow data. Default is false.
  useViewerBounds: boolean;                  // Whether to use the viewer bounds to generate particles. Default is false.
  domain?: {                                 // Controls the speed rendering range. Default is undefined.
    min?: number;                            // Minimum speed value for rendering
    max?: number;                            // Maximum speed value for rendering
  };
  displayRange?: {                           // Controls the speed display range for visualization. Default is undefined.
    min?: number;                            // Minimum speed value for display
    max?: number;                            // Maximum speed value for display
  };
  dynamic: boolean;                          // Whether to enable dynamic particle animation. Default is true.
}
```

#### Methods

| Method | Description |
|--------|-------------|
| `add()` | Add the flow layer to the scene |
| `remove()` | Remove the flow layer from the scene |
| `show: boolean` | Get or set the visibility of the flow layer |
| `updateFlowData(data: FlowData)` | Update the flow field data |
| `updateOptions(options: Partial<FlowLayerOptions>)` | Update the options of the flow layer |
| `getDataAtLonLat(lon: number, lat: number): FlowDataAtLonLat \| null` | Get the flow data at a specific longitude and latitude, returns both original and interpolated values. Returns null if coordinates are outside bounds |
| `zoomTo(duration?: number)` | Zoom the camera to fit the flow field extent |
| `isDestroyed(): boolean` | Check if the flow layer has been destroyed |
| `destroy()` | Clean up resources and destroy the flow layer |

## 🎥 Demo

https://github.com/user-attachments/assets/64be8661-a080-4318-8b17-4931670570f1

You can also try the [online demo](https://cesium-wind-layer.opendde.com/) or check out the [example code](../../example).


## 📄 License

[MIT](/LICENSE)
