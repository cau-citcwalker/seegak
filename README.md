# Seegak

High-performance biological data visualization library built on WebGL2.
Renders single-cell RNA-seq, spatial transcriptomics, and genomics data in the browser at interactive frame rates.

## Features

- **WebGL2 GPU acceleration** — Renders 1M+ data points at 60fps
- **Web Worker async processing** — Data loading and computation never block the main thread
- **Tree-shakable packages** — Only bundle what you use
- **React 18 support** — forwardRef + handle pattern for both declarative and imperative access

## Packages

| Package | Description |
|---|---|
| [`@seegak/core`](packages/core) | WebGL2 rendering engine, camera, shaders, Web Workers |
| [`@seegak/bio-charts`](packages/bio-charts) | Scatter, Heatmap, BoxPlot, Violin, DotPlot, Bar, Pie, FeaturePlot |
| [`@seegak/react`](packages/react) | React 18 component wrappers |
| [`@seegak/human-body-map`](packages/human-body-map) | Interactive human organ SVG map |
| [`@seegak/genomics`](packages/genomics) | Volcano Plot, Enrichment Plot (GSEA), Genomic Profile |
| [`@seegak/spatial`](packages/spatial) | Spatial transcriptomics view, OME-ZARR/TIFF multichannel imaging |
| [`@seegak/analysis`](packages/analysis) | FACS gating, Hierarchical Obs Sets, comparative analysis |
| [`@seegak/3d`](packages/3d) | Volume rendering (MIP/X-ray/ISO), mesh rendering (Phong) |
| [`@seegak/coordination`](packages/coordination) | Multi-view state synchronization, JSON config schema |
| [`@seegak/data-loaders`](packages/data-loaders) | AnnData-Zarr, HDF5, OME-ZARR, S3 Web Worker loaders |

## Installation

```bash
npm install @seegak/react
```

Installing `@seegak/react` will also install `@seegak/core`, `@seegak/bio-charts`, and `@seegak/human-body-map` as dependencies.

### Requirements

- React 18+
- A browser with WebGL2 support (Chrome, Firefox, Edge, Safari 15+)

## Quick Start

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

> All chart components fill 100% of their parent container. **You must set an explicit width/height on the parent element.**

## Documentation

- [Getting Started](docs/getting-started.md)
- [ScatterChart](docs/scatter-chart.md)
- [BoxPlotChart](docs/box-plot-chart.md)
- [BarChart](docs/bar-chart.md)
- [PieChart](docs/pie-chart.md)
- [FeaturePlotChart](docs/feature-plot-chart.md)
- [HumanBodyMap](docs/human-body-map.md)
- [Color Scales](docs/color-scales.md)

## Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Development mode (watch)
pnpm dev

# Run tests
pnpm test
```

### Monorepo Structure

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

## License

[MIT](LICENSE)
