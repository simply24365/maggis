import * as Cesium from 'cesium'
import { FlowFieldDataManager } from './dataLoad'

/**
 * 시드 포인트를 시각화하는 클래스
 */
export class SeedViz {
  private viewer: Cesium.Viewer
  private seedEntities: Cesium.Entity[] = []
  private isVisible: boolean = true

  constructor(cesiumViewer: Cesium.Viewer) {
    this.viewer = cesiumViewer
  }

  /**
   * DataManager에서 시드 포인트를 가져와 시각화합니다
   * @param dataManager - DataManager 인스턴스
   * @param cubeSize - 큐브 크기 (미터 단위, 기본값: 1000m = 1km)
   */
  public visualizeFromEngine(dataManager: FlowFieldDataManager, cubeSize: number = 1000): void {
    try {
      // DataManager에서 시드 포인트 가져오기
      const seeds = dataManager.getSeeds()
      
      if (!seeds || seeds.length === 0) {
        console.warn('DataManager에서 시드 포인트를 찾을 수 없습니다.')
        return
      }

      console.log(`시드 포인트 ${seeds.length}개 시각화 중...`)

      // 기존 시드 엔티티 제거
      this.clearSeeds()

      // 각 시드 포인트에 대해 큐브 생성
      seeds.forEach((seed, index) => {
        const cubeEntity = this.viewer.entities.add({
          name: `Seed Cube ${index}`,
          position: Cesium.Cartesian3.fromDegrees(seed.lon, seed.lat, cubeSize / 2), // 큐브 중심이 지표면에 오도록
          box: {
            dimensions: new Cesium.Cartesian3(cubeSize, cubeSize, cubeSize),
            material: new Cesium.ColorMaterialProperty(
              Cesium.Color.fromRandom({
                red: 0.5,
                green: 0.5,
                blue: 1.0,
                alpha: 0.6
              })
            ),
            outline: true,
            outlineColor: new Cesium.ConstantProperty(Cesium.Color.YELLOW),
            fill: true
          },
          description: `시드 포인트 ${index + 1}<br/>
                       경도: ${seed.lon.toFixed(6)}<br/>
                       위도: ${seed.lat.toFixed(6)}<br/>`
        })

        this.seedEntities.push(cubeEntity)
      })

      console.log(`${seeds.length}개의 디버깅 큐브가 생성되었습니다`)

    } catch (error) {
      console.error('시드 시각화 중 오류:', error)
      throw error
    }
  }

  /**
   * 폴리곤 URL에서 시드 포인트를 생성하고 시각화합니다 (레거시 메서드)
   * @param polygonUrl - 폴리곤 데이터 URL
   * @param numSeeds - 생성할 시드 개수 (기본값: 500)
   * @param cubeSize - 큐브 크기 (미터 단위, 기본값: 1000m = 1km)
   * @deprecated DataManager을 사용하는 visualizeFromEngine 메서드를 사용하세요
   */
  async generateAndVisualize(polygonUrl: string, numSeeds: number = 500, cubeSize: number = 1000): Promise<void> {
    try {
      console.log(`시드 포인트 ${numSeeds}개 생성 중...`)
      
      // DataManager을 임시로 생성하여 시드 포인트 생성
      const dataManager = await FlowFieldDataManager.create({
        polygonUrl,
        numSeeds
      })
      
      // 시각화 실행
      this.visualizeFromEngine(dataManager, cubeSize)

    } catch (error) {
      console.error('시드 시각화 중 오류:', error)
      throw error
    }
  }

  /**
   * 모든 시드 큐브의 표시/숨기기를 제어합니다
   * @param visible - true: 표시, false: 숨기기
   */
  public show(visible: boolean): void {
    this.isVisible = visible
    this.seedEntities.forEach(entity => {
      entity.show = visible
    })
  }

  /**
   * 시드 큐브들의 색상을 변경합니다
   * @param color - Cesium.Color 객체
   */
  public setColor(color: Cesium.Color): void {
    this.seedEntities.forEach(entity => {
      if (entity.box) {
        entity.box.material = new Cesium.ColorMaterialProperty(color.withAlpha(0.6))
        entity.box.outlineColor = new Cesium.ConstantProperty(color)
      }
    })
  }

  /**
   * 시드 큐브들의 크기를 변경합니다
   * @param size - 큐브 크기 (미터 단위)
   */
  public setSize(size: number): void {
    this.seedEntities.forEach(entity => {
      if (entity.box) {
        entity.box.dimensions = new Cesium.ConstantProperty(new Cesium.Cartesian3(size, size, size))
        // 위치도 조정 (큐브 중심이 지표면에 오도록)
        const currentPosition = entity.position?.getValue(Cesium.JulianDate.now())
        if (currentPosition) {
          const cartographic = Cesium.Cartographic.fromCartesian(currentPosition)
          entity.position = new Cesium.ConstantPositionProperty(
            Cesium.Cartesian3.fromRadians(cartographic.longitude, cartographic.latitude, size / 2)
          )
        }
      }
    })
  }

  /**
   * 모든 시드 큐브를 제거합니다
   */
  public clearSeeds(): void {
    this.seedEntities.forEach(entity => {
      this.viewer.entities.remove(entity)
    })
    this.seedEntities = []
  }

  /**
   * 시드 큐브들을 카메라 시점에 맞춥니다
   */
  public focusOnSeeds(): void {
    if (this.seedEntities.length > 0) {
      this.viewer.zoomTo(this.seedEntities)
    }
  }

  /**
   * 현재 상태 정보를 반환합니다
   */
  public getStatus(): {
    isVisible: boolean
    seedCount: number
  } {
    return {
      isVisible: this.isVisible,
      seedCount: this.seedEntities.length
    }
  }

  /**
   * 모든 리소스를 정리합니다
   */
  public destroy(): void {
    this.clearSeeds()
  }
}
