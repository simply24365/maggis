1) 빌드 & 서빙 (Windows)
- 프로젝트 루트(c:\Users\simply\proj2\magflow)에서:
````bash
# 의존 설치 (한번만)
pnpm install

# 타입 + 라이브러리 빌드
pnpm run build:all

# public 폴더를 정적서버로 띄우기
pnpm run serve:node
# 브라우저로 열기: http://localhost:3000/test-simple.html
````
(또는 필요 시 PowerShell/CMD에서 동일 명령 사용)

2) HTML에서 UMD 스크립트 불러오기 및 사용 예
현재 당신의 test-simple.html 예시와 동일하게 magFlow.umd.js 를 전역 magFlow 네임스페이스로 불러온다. 사용 예:
````html
<!DOCTYPE html>
<html>
  <body>
    <div id="cesiumContainer"></div>
    <script src="https://cesium.com/downloads/cesiumjs/releases/1.132/Build/Cesium/Cesium.js"></script>
    <script src="./dist/magFlow.umd.js"></script>
    <script>
      // magFlow는 전역으로 노출됩니다.
      const viewer = new Cesium.Viewer('cesiumContainer');
      const flowLayerOptions = { /* 간단 예: 위 파일과 동일 */ };

      // 데이터/설정 옵션
      const dataOpts = {
        polygonUrl: "/river-data/38.rgo",
        maskUrl: "/river-data/mask.png",
        csvBaseUrl: "/river-data/20250730",
        initialCsvFile: "/river-data/20250730/1.csv",
        maxTime: 137
      };

      const manager = new magFlow.FlowVisualizationManager(viewer, flowLayerOptions, dataOpts);
      // 초기화(비동기)
      manager.initialize().then(() => {
        manager.setCameraView();
        manager.setVisible(true);
        manager.setGuiVisible(true);
        window.flowManager = manager; // 디버깅용
      }).catch(console.error);
    </script>
  </body>
</html>
````

3) 주요 메서드(사용 예)
- new magFlow.FlowVisualizationManager(viewer, flowLayerOptions, dataOptions)
- await manager.initialize() — 내부 리소스/CSV 로드 등 초기화
- manager.setCameraView() — 뷰를 데이터 영역으로 맞춤
- manager.setVisible(true|false) — 레이어 표시/숨김
- manager.setGuiVisible(true|false) — GUI 표시 토글

4) dataOptions 파라미터 설명 (당신이 제시한 것)
- polygonUrl: "/river-data/38.rgo"
  - 유역/경계 등 벡터 폴리곤 파일의 URL. 라이브러리가 해석하는 포맷(.rgo)에 맞는 경로.
- maskUrl: "/river-data/mask.png"
  - 마스크 이미지 (PNG). 유효한 영역만 보이도록 파티클을 클리핑할 때 사용.
- csvBaseUrl: "/river-data/20250730"
  - 시간별 CSV 파일들이 위치한 기본 폴더 URL. 각 타임스텝 CSV를 이 경로 기준으로 로드.
- initialCsvFile: "/river-data/20250730/1.csv"
  - 초기 로드할 CSV 파일(full path or relative). 초기 상태/첫 프레임 데이터.
- maxTime: 137
  - 시뮬레이션/타임스텝의 최대 인덱스 또는 프레임 수(라이브러리 내부에서 타임 루프의 상한으로 사용).

5) flowLayerOptions(요약)
- particlesTextureSize: 정점/텍스처 해상도 (숫자)
- dropRate, dropRateBump: 입자 재생성 비율 관련
- particleHeight: 입자 고도 (m)
- speedFactor: 유속 스케일링
- lineWidth: {min, max} — 렌더된 선 굵기 범위
- lineLength: {min, max} — 꼬리 길이 범위
- colors: ['cyan','lime',...] — 컬러 팔레트
- dynamic: boolean — 동적 업데이트 여부

추가 팁
- 모든 URL은 브라우저에서 접근 가능한 정적 경로여야 함(public 폴더 내부 or 서버 제공).
- 빌드 후 magFlow.umd.js 가 갱신되므로 서빙 전에 빌드해야 함.
- 콘솔에 에러가 있으면 manager.initialize() 에서 발생한 로드 실패(파일 경로, CORS)를 먼저 확인.
