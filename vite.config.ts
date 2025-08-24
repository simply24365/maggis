import { defineConfig } from 'vite'
import cesium from 'vite-plugin-cesium'
import { resolve } from 'path'

export default defineConfig({
  plugins: [cesium()],
  build: {
    lib: {
      // 라이브러리의 진입점
      entry: resolve(__dirname, 'src/lib.ts'),
      name: 'magFlow',
      // 파일명 형식
      fileName: (format) => `magFlow.${format}.js`
    },
    rollupOptions: {
      // 외부 의존성 설정 (cesium은 번들에 포함하지 않음)
      external: ['cesium'],
      output: {
        // UMD 빌드의 글로벌 변수 설정
        globals: {
          cesium: 'Cesium'
        }
      }
    }
  }
})