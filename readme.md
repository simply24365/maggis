./packages/cesium-wind-layer/readme.md

각 GUI 옵션의 역할과 효과를 분석해드리겠습니다:

## 🎛️ **Particle System Controls**

### **Particles Texture Size** (50-500)
- **역할**: 동시에 표시되는 최대 파티클 수 제어
- **효과**: 
  - ⬆️ 증가 → 더 많은 파티클, 더 조밀한 시각화, 성능 저하
  - ⬇️ 감소 → 적은 파티클, 성능 향상, 희박한 시각화

### **Particle Height** (0-5000m)
- **역할**: 파티클이 지면에서 떠 있는 높이
- **효과**: 
  - ⬆️ 증가 → 파티클이 지형 위로 더 높이 표시
  - ⬇️ 감소 → 지형에 가까워져 일부 파티클이 지형에 가려질 수 있음

## 🎬 **Animation Controls**

### **Speed Factor** (0.1-5.0)
- **역할**: 파티클 이동 속도 배율 (calculateSpeed.ts 의 `speedScaleFactor`)
- **효과**:
  - ⬆️ 증가 → 파티클이 빠르게 움직임, 동적인 애니메이션
  - ⬇️ 감소 → 파티클이 천천히 움직임, 정적인 느낌

### **Drop Rate** (0.001-0.02)
- **역할**: 파티클이 새로 생성되는 빈도 (postProcessingPosition.ts의 `dropRate`)
- **효과**:
  - ⬆️ 증가 → 파티클이 자주 새로 생성됨, 짧은 궤적
  - ⬇️ 감소 → 파티클이 오래 살아있음, 긴 궤적

### **Drop Rate Bump** (0.001-0.02)
- **역할**: 느린 속도 파티클에 대한 추가 리셋 확률
- **효과**:
  - ⬆️ 증가 → 느린 영역의 파티클이 더 자주 리셋됨
  - ⬇️ 감소 → 정체된 파티클들이 더 오래 남아있음

### **Dynamic Animation** (toggle)
- **역할**: 파티클 움직임 활성화/비활성화
- **효과**:
  - ✅ ON → 파티클이 속도에 따라 움직임
  - ❌ OFF → 파티클이 정적으로 고정됨

## 📏 **Line Properties**

### **Min/Max Line Width** (0.001-1)
- **역할**: 파티클 궤적의 두께 (segmentDraw.ts의 `lineWidth`)
- **효과**:
  - ⬆️ 증가 → 더 굵은 선, 시각적으로 돋보임
  - ⬇️ 감소 → 더 얇은 선, 세밀한 표현

### **Min/Max Line Length** (0.001-1)
- **역할**: 파티클 궤적의 길이 (segmentDraw.ts의 `lineLength`)
- **효과**:
  - ⬆️ 증가 → 더 긴 꼬리, 궤적이 명확
  - ⬇️ 감소 → 더 짧은 꼬리, 점 형태에 가까움

## 📊 **Domain & Display Controls**

### **Domain Min/Max** (0-20)
- **역할**: 속도 값의 처리 범위 (calculateSpeed.ts의 `speedRange`)
- **효과**:
  - 범위 확대 → 더 넓은 속도 범위를 색상으로 표현
  - 범위 축소 → 특정 속도 구간을 강조

### **Display Range Min/Max** (0-20)
- **역할**: 실제로 보여줄 속도 범위 (segmentDraw.ts의 `displayRange`)
- **효과**:
  - 범위 밖 파티클 → **완전히 투명해져 보이지 않음**
  - 범위 내 파티클 → 정상적으로 표시

## 🎨 **Color Presets**

### **컬러 선택**
- **Default**: 다색 그라데이션 (파란색→빨간색 스펙트럼)
- **Blue-Red**: 파란색에서 빨간색으로 단순 그라데이션
- **Ocean**: 바다색 계열 (파란색 톤)
- **Viridis**: 과학적 시각화용 색상 (보라→녹색→노랑)
- **White**: 단색 흰색

## ⚙️ **Other Options**

### **Flip Y Axis**
- **역할**: Y축 방향 뒤집기
- **효과**: 속도 벡터의 세로 방향이 반전됨

### **Use Viewer Bounds**
- **역할**: 카메라 시야 범위에서만 파티클 생성 (postProcessingPosition.ts의 `useViewerBounds`)
- **효과**:
  - ✅ ON → 현재 보이는 화면 영역에서만 파티클 생성
  - ❌ OFF → 전체 데이터 범위에서 파티클 생성

## 🎯 **Layer Controls**

### **Show Layer**
- **역할**: 레이어 전체 표시/숨김
- **효과**: 즉시 모든 파티클이 보이거나 사라짐

### **Zoom to Data**
- **역할**: 데이터 영역으로 카메라 이동
- **효과**: 강 유역 전체가 화면에 맞춰짐

## 📈 **시각적 효과 요약**

| 옵션 | 증가하면 | 감소하면 |
|------|----------|----------|
| **Particles Texture Size** | 더 조밀함 | 더 희박함 |
| **Speed Factor** | 빠른 움직임 | 느린 움직임 |
| **Drop Rate** | 짧은 궤적 | 긴 궤적 |
| **Line Width** | 굵은 선 | 얇은 선 |
| **Line Length** | 긴 꼬리 | 짧은 꼬리 |
| **Display Range** | 더 많은 파티클 보임 | 일부 파티클 안 보임 |

이러한 옵션들을 조합하여 강의 흐름을 다양한 스타일로 시각화할 수 있습니다! 🌊