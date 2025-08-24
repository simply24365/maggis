다음 셰이더들이 직접 연관입니다.

- calculateSpeed.ts
  - speedScaleFactor로 RG 이동량을 줄입니다.
  - calculateSpeedByRungeKutta2와 main에서 frameRateAdjustment와 함께 곱해져 per-frame 이동 벡터가 매우 작아집니다.

- updatePosition.ts
  - nextPos = currentPos + speed; 이동량이 작으면 current와 next가 거의 같아집니다.

- segmentDraw.ts (vertex)
  - 방향 계산 시 normalize(projectedCoordinates.next - projectedCoordinates.current)와 previous→current를 사용합니다.
  - 이동이 너무 작으면 방향 벡터가 0에 가까워져 정규화가 불안정/퇴화(길이 0 세그먼트)되어 실제로 그려질 픽셀이 줄어듭니다.

참고로 postProcessingPosition(드롭률)은 speedScaleFactor와 무관합니다.