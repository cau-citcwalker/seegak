# ScatterChart

High-performance scatter plot built on WebGL2. Ideal for UMAP/tSNE cluster visualization.

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `data` | `ScatterData` | - | Chart data |
| `pointSize` | `number` | `5` | Point size (px) |
| `opacity` | `number` | `0.9` | Point opacity (0–1) |
| `colorScale` | `ColorScale` | `VIRIDIS` | Color scale used when `values` is provided |
| `autoFit` | `boolean` | `true` | Auto-zoom to fit data range |
| `style` | `CSSProperties` | - | Container style |
| `className` | `string` | - | Container CSS class |

## ScatterData

```typescript
interface ScatterData {
  x: Float32Array;       // X coordinates
  y: Float32Array;       // Y coordinates
  values?: Float32Array;  // Continuous values (0–1, mapped to colorScale)
  colors?: string[];      // Per-point colors (hex, takes priority over values)
  labels?: string[];      // Per-point labels (used in tooltips)
}
```

## Example: Categorical Colors

```tsx
import { ScatterChart } from '@seegak/react';

function UMAPPlot() {
  const data = {
    x: new Float32Array([...umapX]),
    y: new Float32Array([...umapY]),
    colors: cellTypes.map(type => clusterColorMap[type]),
    labels: cellTypes,
  };

  return (
    <div style={{ width: 800, height: 600 }}>
      <ScatterChart
        data={data}
        pointSize={3}
        opacity={0.85}
        autoFit
      />
    </div>
  );
}
```

## Example: Continuous Color Scale

```tsx
import { ScatterChart, PLASMA } from '@seegak/react';

function ExpressionPlot() {
  // values must be normalized to the 0–1 range
  const maxExpr = Math.max(...rawExpression);
  const normalized = new Float32Array(rawExpression.map(v => v / maxExpr));

  const data = {
    x: new Float32Array(umapX),
    y: new Float32Array(umapY),
    values: normalized,
  };

  return (
    <div style={{ width: 800, height: 600 }}>
      <ScatterChart data={data} colorScale={PLASMA} pointSize={4} />
    </div>
  );
}
```

## Ref API

You can access the chart instance through a `ref`.

```tsx
import { useRef } from 'react';
import { ScatterChart } from '@seegak/react';
import type { ScatterChartHandle } from '@seegak/react';

function InteractiveScatter() {
  const chartRef = useRef<ScatterChartHandle>(null);

  const handleClick = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const pointIndex = chartRef.current?.hitTest(x, y);
    if (pointIndex !== null && pointIndex !== undefined) {
      console.log(`Clicked point index: ${pointIndex}`);
    }
  };

  return (
    <div style={{ width: 800, height: 600 }} onClick={handleClick}>
      <ScatterChart ref={chartRef} data={data} />
    </div>
  );
}
```
