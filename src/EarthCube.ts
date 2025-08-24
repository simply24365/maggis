import * as Cesium from 'cesium'

/**
 * 지구본 스케일의 큐브를 생성하고 관리하는 클래스
 */
export class EarthCube {
  private viewer: Cesium.Viewer
  private cubeEntity: Cesium.Entity | null = null
  private debugEntity: Cesium.Entity | null = null
  private isVisible: boolean = true
  private isDebugVisible: boolean = false

  constructor(cesiumViewer: Cesium.Viewer) {
    this.viewer = cesiumViewer
    // 뷰어가 완전히 초기화될 때까지 잠시 대기
    setTimeout(() => {
      this.createCube()
    }, 100)
  }

  /**
   * 지구본 크기의 큐브를 생성합니다
   */
  private createCube(): void {
    // 지구의 반지름 (약 6,371,000m)
    const earthRadius = 6371000

    try {
      // 지구 표면 근처 위치를 사용 (지구 중심 대신)
      // 경도 0, 위도 0, 높이 0 (지구 표면)에서 약간 위로
      const centerPosition = new Cesium.ConstantPositionProperty(
        Cesium.Cartesian3.fromDegrees(0.0, 0.0, 0)
      )

      // 큐브 엔티티 생성 - 지구 표면 근처에 위치
      this.cubeEntity = this.viewer.entities.add({
        name: 'Earth Scale Cube',
        position: centerPosition,
        box: {
          dimensions: new Cesium.Cartesian3(
            earthRadius * 0.1, // 지구 반지름의 10%
            earthRadius * 0.1,
            earthRadius * 0.1
          ),
          material: new Cesium.ColorMaterialProperty(Cesium.Color.CYAN.withAlpha(0.3)),
          outline: true,
          outlineColor: new Cesium.ConstantProperty(Cesium.Color.CYAN),
          fill: true
        }
      })

      // 디버그용 와이어프레임 큐브 생성
      this.debugEntity = this.viewer.entities.add({
        name: 'Earth Scale Cube Debug',
        position: centerPosition,
        box: {
          dimensions: new Cesium.Cartesian3(
            earthRadius * 0.11, // 약간 더 크게
            earthRadius * 0.11,
            earthRadius * 0.11
          ),
          material: new Cesium.ColorMaterialProperty(Cesium.Color.TRANSPARENT),
          outline: true,
          outlineColor: new Cesium.ConstantProperty(Cesium.Color.RED),
          fill: false
        },
        show: false
      })

      console.log('EarthCube 생성 완료')
    } catch (error) {
      console.error('큐브 생성 중 오류:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      throw new Error(`큐브 생성 실패: ${errorMessage}`)
    }
  }

  /**
   * 큐브의 표시/숨기기를 제어합니다
   * @param visible - true: 표시, false: 숨기기
   */
  public show(visible: boolean): void {
    this.isVisible = visible
    if (this.cubeEntity) {
      this.cubeEntity.show = visible
    }
  }

  /**
   * 디버그 모드의 표시/숨기기를 제어합니다
   * @param visible - true: 디버그 표시, false: 디버그 숨기기
   */
  public showDebug(visible: boolean): void {
    this.isDebugVisible = visible
    if (this.debugEntity) {
      this.debugEntity.show = visible
    }
  }

  /**
   * 큐브의 투명도를 설정합니다
   * @param alpha - 투명도 값 (0.0 ~ 1.0)
   */
  public setAlpha(alpha: number): void {
    if (this.cubeEntity && this.cubeEntity.box) {
      const material = this.cubeEntity.box.material as Cesium.ColorMaterialProperty
      if (material && material.color) {
        const currentColor = material.color.getValue(Cesium.JulianDate.now())
        if (currentColor) {
          material.color = new Cesium.ConstantProperty(currentColor.withAlpha(alpha))
        }
      }
    }
  }

  /**
   * 큐브의 색상을 변경합니다
   * @param color - Cesium.Color 객체
   */
  public setColor(color: Cesium.Color): void {
    if (this.cubeEntity && this.cubeEntity.box) {
      const currentMaterial = this.cubeEntity.box.material as Cesium.ColorMaterialProperty
      const currentAlpha = currentMaterial && currentMaterial.color ? 
        currentMaterial.color.getValue(Cesium.JulianDate.now())?.alpha || 0.3 : 0.3
      
      this.cubeEntity.box.material = new Cesium.ColorMaterialProperty(color.withAlpha(currentAlpha))
      this.cubeEntity.box.outlineColor = new Cesium.ConstantProperty(color)
    }
  }

  /**
   * 큐브를 카메라 시점에 맞춥니다
   */
  public focusOnCube(): void {
    if (this.cubeEntity) {
      this.viewer.zoomTo(this.cubeEntity)
    }
  }

  /**
   * 큐브와 디버그 엔티티를 제거합니다
   */
  public destroy(): void {
    if (this.cubeEntity) {
      this.viewer.entities.remove(this.cubeEntity)
      this.cubeEntity = null
    }
    if (this.debugEntity) {
      this.viewer.entities.remove(this.debugEntity)
      this.debugEntity = null
    }
  }

  /**
   * 현재 상태 정보를 반환합니다
   */
  public getStatus(): {
    isVisible: boolean
    isDebugVisible: boolean
    entityId: string | null
  } {
    return {
      isVisible: this.isVisible,
      isDebugVisible: this.isDebugVisible,
      entityId: this.cubeEntity?.id || null
    }
  }
}
