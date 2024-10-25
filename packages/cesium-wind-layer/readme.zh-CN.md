# Cesium Wind Layer

[![npm version](https://img.shields.io/npm/v/cesium-wind-layer.svg)](https://www.npmjs.com/package/cesium-wind-layer)
[![license](https://img.shields.io/npm/l/cesium-wind-layer.svg)](https://github.com/your-repo/cesium-wind-layer/blob/main/LICENSE)

一个GPU加速的用于通过粒子动画可视化风场数据的 Cesium 插件。

[English](/packages/cesium-wind-layer/readme.md) | [在线演示](https://cesium-wind-layer.opendde.com/)

<div style="display: flex; justify-content: space-between;">
  <img src="/pictures/wind.gif" alt="Wind Layer Demo" style="width: 48%;">
  <img src="/pictures/terrain.gif" alt="Terrain Demo" style="width: 48%;">
</div>

## 📚 目录

- [特性](#特性)
- [安装](#安装)
- [使用方法](#使用方法)
- [API 参考](#api-参考)
- [许可证](#许可证)

## ✨ 特性

- ⚡️ 使用粒子系统实现实时风场可视化
- 🚀 GPU 加速的粒子计算和渲染
- 🎨 可自定义粒子外观和行为
- 🏔️ 支持地形遮挡，粒子会被地形阻挡

## 📦 安装

```bash
pnpm add cesium-wind-layer
```

## 🚀 使用方法

### 基础示例

```typescript
import { Viewer } from 'cesium';
import { WindLayer } from 'cesium-wind-layer';

// 创建 Cesium viewer
const viewer = new Viewer('cesiumContainer');

// 准备风场数据
const windData = {
  u: {
    array: Float32Array,  // 风速的 U 分量
    min: number,         // 可选：最小值
    max: number          // 可选：最大值
  },
  v: {
    array: Float32Array,  // 风速的 V 分量
    min: number,         // 可选：最小值
    max: number          // 可选：最大值
  },
  width: number,         // 数据网格宽度
  height: number,        // 数据网格高度
  bounds: {
    west: number,        // 西边界（经度）
    south: number,       // 南边界（纬度）
    east: number,        // 东边界（经度）
    north: number        // 北边界（纬度）
  }
};

// 使用配置创建风场图层
const windLayer = new WindLayer(viewer, windData, {
  particlesTextureSize: 256,  // 粒子系统的纹理大小
  particleHeight: 1000,       // 粒子距地面高度
  lineWidth: 10.0,            // 粒子轨迹宽度
  speedFactor: 10.0,         // 速度倍数
  dropRate: 0.003,           // 粒子消失率
  dropRateBump: 0.001,       // 慢速粒子的额外消失率
  colors: ['white'],         // 粒子颜色
  flipY: false              // 是否翻转 Y 坐标
});
```

## 📖 API 参考

### WindLayer

风场可视化的主类。

#### 构造函数选项

```typescript
interface WindLayerOptions {
  particlesTextureSize: number;  // 粒子纹理大小（默认：256）
  particleHeight: number;        // 粒子高度（默认：1000）
  lineWidth: number;            // 粒子线宽（默认：3.0）
  speedFactor: number;          // 速度倍数（默认：10.0）
  dropRate: number;             // 粒子消失率（默认：0.003）
  dropRateBump: number;         // 额外消失率（默认：0.001）
  colors: string[];            // 粒子颜色数组
  flipY: boolean;              // 是否翻转 Y 坐标（默认：false）
  useViewerBounds: boolean;    // 是否使用视域范围生成粒子（默认：false）
}
```

#### 方法

| 方法 | 描述 |
|--------|-------------|
| `add()` | 将风场图层添加到场景中 |
| `remove()` | 从场景中移除风场图层 |
| `show: boolean` | 获取或设置风场图层的可见性 |
| `updateWindData(data: WindData)` | 更新风场数据 |
| `updateOptions(options: Partial<WindLayerOptions>)` | 更新风场图层的选项 |
| `zoomTo(duration?: number)` | 缩放相机以适应风场范围 |
| `isDestroyed(): boolean` | 检查风场图层是否已被销毁 |
| `destroy()` | 清理资源并销毁风场图层 |

## 📄 许可证

[MIT](/LICENSE)
