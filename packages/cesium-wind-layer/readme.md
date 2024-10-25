# Cesium Wind Layer

A Cesium plugin for visualizing wind field data with particle animation.

![Wind Layer Demo](/pictures/wind.gif)

## Features

- Real-time wind field visualization using particle system
- GPU-accelerated particle computation and rendering
- Customizable particle appearance and behavior
- Support for both 2D and 3D views
- Compatible with Cesium 3D globe

## Installation

```bash
pnpm add cesium-wind-layer
```

## Usage

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
  particlesTextureSize: 256,  // Texture size for particle system
  particleHeight: 1000,       // Height of particles above ground
  lineWidth: 3.0,            // Width of particle trails
  speedFactor: 10.0,         // Speed multiplier
  dropRate: 0.003,           // Rate at which particles are dropped
  dropRateBump: 0.001,       // Additional drop rate for slow particles
  colors: ['white'],         // Colors for particles
  flipY: false              // Flip Y coordinates if needed
});
```

## API Reference

### WindLayer

Main class for wind visualization.

#### Constructor Options

```typescript
interface WindLayerOptions {
  particlesTextureSize: number;  // Size of the particle texture (default: 256)
  particleHeight: number;        // Height of particles (default: 1000)
  lineWidth: number;            // Width of particle lines (default: 3.0)
  speedFactor: number;          // Speed multiplier (default: 10.0)
  dropRate: number;             // Particle drop rate (default: 0.003)
  dropRateBump: number;         // Additional drop rate (default: 0.001)
  colors: string[];            // Array of colors for particles
  flipY: boolean;              // Flip Y coordinates (default: false)
}
```

#### Methods

- `show: boolean` - Show/hide the wind layer
- `updateWindData(data: WindData)` - Update wind field data
- `destroy()` - Clean up resources

## License

MIT
