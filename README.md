# Seegak

WebGL2 기반 고성능 생물학 데이터 시각화 라이브러리.
싱글셀 RNA-seq, 공간전사체, 유전체 분석 데이터를 브라우저에서 빠르게 렌더링합니다.

## 특징

- **WebGL2 GPU 가속** — 100만 개 이상의 세포 데이터를 60fps로 렌더링
- **Web Worker 비동기 처리** — 데이터 로딩과 연산이 메인 스레드를 차단하지 않음
- **Tree-shakable 패키지 구조** — 필요한 패키지만 번들에 포함
- **React 18 지원** — forwardRef + handle 패턴으로 선언적/명령적 접근 모두 지원

## 패키지

| 패키지 | 설명 |
|---|---|
| [`@seegak/core`](packages/core) | WebGL2 렌더링 엔진, 카메라, 셰이더, Web Worker |
| [`@seegak/bio-charts`](packages/bio-charts) | Scatter, Heatmap, BoxPlot, Violin, DotPlot, Bar, Pie, FeaturePlot |
| [`@seegak/react`](packages/react) | React 18 컴포넌트 래퍼 |
| [`@seegak/human-body-map`](packages/human-body-map) | 인터랙티브 인체 장기 SVG 맵 |
| [`@seegak/genomics`](packages/genomics) | Volcano Plot, Enrichment Plot (GSEA), Genomic Profile |
| [`@seegak/spatial`](packages/spatial) | 공간전사체 뷰, OME-ZARR/TIFF 멀티채널 이미징 |
| [`@seegak/analysis`](packages/analysis) | FACS 게이팅, Hierarchical Obs Sets, 비교 분석 |
| [`@seegak/3d`](packages/3d) | 볼륨 렌더링 (MIP/X-ray/ISO), 메시 렌더링 (Phong) |
| [`@seegak/coordination`](packages/coordination) | 멀티뷰 상태 동기화, JSON 설정 스키마 |
| [`@seegak/data-loaders`](packages/data-loaders) | AnnData-Zarr, HDF5, OME-ZARR, S3 Web Worker 로더 |

## 설치

```bash
npm install @seegak/react
```

`@seegak/react`를 설치하면 `@seegak/core`, `@seegak/bio-charts`, `@seegak/human-body-map`이 함께 설치됩니다.

### 요구 사항

- React 18 이상
- WebGL2를 지원하는 브라우저 (Chrome, Firefox, Edge, Safari 15+)

## 빠른 시작

```tsx
import { ScatterChart } from '@seegak/react';

function UMAPView() {
  const data = {
    x: new Float32Array([1, 2, 3, 4, 5]),
    y: new Float32Array([2, 4, 1, 5, 3]),
    colors: ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00'],
  };

  return (
    <div style={{ width: 600, height: 400 }}>
      <ScatterChart data={data} pointSize={8} autoFit />
    </div>
  );
}
```

> 모든 차트 컴포넌트는 부모 컨테이너의 100%를 채웁니다. **반드시 부모 요소에 너비/높이를 지정**하세요.

## 문서

- [시작하기](docs/getting-started.md)
- [ScatterChart](docs/scatter-chart.md)
- [BoxPlotChart](docs/box-plot-chart.md)
- [BarChart](docs/bar-chart.md)
- [PieChart](docs/pie-chart.md)
- [FeaturePlotChart](docs/feature-plot-chart.md)
- [HumanBodyMap](docs/human-body-map.md)
- [색상 스케일](docs/color-scales.md)

## 개발

```bash
# 의존성 설치
pnpm install

# 전체 빌드
pnpm build

# 개발 모드 (watch)
pnpm dev

# 테스트
pnpm test
```

### 모노레포 구조

```
seegak/
├── packages/
│   ├── core/
│   ├── bio-charts/
│   ├── react/
│   ├── human-body-map/
│   ├── genomics/
│   ├── spatial/
│   ├── analysis/
│   ├── 3d/
│   ├── coordination/
│   └── data-loaders/
├── docs/
├── package.json
└── pnpm-workspace.yaml
```

## 라이선스

[MIT](LICENSE)
