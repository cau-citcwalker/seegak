# Getting Started

## Installation

```bash
npm install @seegak/react
```

Installing `@seegak/react` will also install `@seegak/core`, `@seegak/bio-charts`, and `@seegak/human-body-map` as dependencies.

### Requirements

- React 18+
- A browser with WebGL2 support (Chrome, Firefox, Edge, Safari 15+)

## Basic Usage

```tsx
import { ScatterChart } from '@seegak/react';

function MyChart() {
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

## Important: Container Sizing

All chart components fill 100% of their parent container.
**You must set an explicit width/height on the parent element.**

```tsx
// OK - Explicit dimensions
<div style={{ width: 600, height: 400 }}>
  <ScatterChart data={data} />
</div>

// OK - Dimensions determined by CSS grid/flex
<div style={{ display: 'grid', gridTemplateColumns: '1fr', height: 500 }}>
  <ScatterChart data={data} />
</div>

// NG - Dimensions will be 0, chart won't render
<div>
  <ScatterChart data={data} />
</div>
```

> **Tip**: Setting `overflow: hidden` on the container can prevent ResizeObserver feedback loops.

## Data Format

Seegak charts use **Float32Array** for coordinate data.
Plain arrays can also be passed, but Float32Array is recommended for large datasets due to better memory efficiency and performance.

```tsx
// Convert plain array to Float32Array
const rawX = [1.0, 2.5, 3.2, 4.8];
const x = new Float32Array(rawX);

// Create directly from API response
const response = await fetch('/api/umap-data');
const json = await response.json();
const data = {
  x: new Float32Array(json.x),
  y: new Float32Array(json.y),
  colors: json.cellTypes.map((t: string) => colorMap[t]),
};
```

## Package Structure

```
@seegak/react          ← React components (just import from here)
  ├── @seegak/bio-charts   ← Chart logic (ScatterChart, BoxPlot, etc.)
  ├── @seegak/human-body-map ← Human body map
  └── @seegak/core         ← WebGL2 rendering engine
```

In most cases, you can import everything from `@seegak/react`:

```tsx
import {
  ScatterChart,
  FeaturePlotChart,
  BoxPlotChart,
  BarChart,
  PieChart,
  HumanBodyMap,
  VIRIDIS, PLASMA, INFERNO,  // Built-in color scales
} from '@seegak/react';

import type {
  ScatterData,
  FeaturePlotData,
  BoxPlotData,
  BarChartData,
  PieChartData,
  ColorScale,
} from '@seegak/react';
```

If you need core utilities such as custom color scales:

```tsx
import type { ColorScale, Vec4 } from '@seegak/core';
```
