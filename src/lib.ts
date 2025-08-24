// 라이브러리 진입점
export { EarthCube } from './EarthCube'
export { FlowVisualizationManager } from './flowVisualizationManager'
export { FlowLayer, DefaultOptions } from './flow'
export type { FlowLayerOptions, FlowData, FlowLayerEventType, FlowLayerEventCallback } from './flow'

// 타입 정의도 함께 export
// export type { default as Cesium } from 'cesium'

// 버전 정보
export const VERSION = '1.0.0'

// 라이브러리 정보
export const LIB_INFO = {
  name: 'magFlow',
  version: VERSION,
  description: 'A simple library for creating Earth-scale cubes in Cesium',
  author: 'magFlow Team'
}
