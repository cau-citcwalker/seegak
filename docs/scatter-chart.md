# ScatterChart

High-performance scatter plot built on WebGL2. Ideal for UMAP/tSNE cluster visualization.

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `data` | `ScatterData` | - | Chart data |
| `z` | `Float32Array` | - | Z coordinates for 3D mode |
| `enable3D` | `boolean` | `false` | Show 2D/3D toggle button (requires `z`) |
| `initial3D` | `boolean` | `false` | Start in 3D mode |
| `pointSize` | `number` | `5` | Point size (px) |
| `opacity` | `number` | `0.9` | Point opacity (0–1) |
| `colorScale` | `ColorScale` | `VIRIDIS` | Color scale used when `values` is provided |
| `autoFit` | `boolean` | `true` | Auto-zoom to fit data range |
| `toolbarPreset` | `ToolPreset` | - | Toolbar preset: `'full'`, `'standard'`, or `'minimal'` |
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

## 3D Mode

ScatterChart supports an integrated 3D mode for visualizing 3D UMAP/tSNE/PCA embeddings. Pass `z` coordinates and set `enable3D` to show a 2D/3D toggle button.

```tsx
import { ScatterChart } from '@seegak/react';

function UMAP3D() {
  const data = {
    x: new Float32Array(umapX),
    y: new Float32Array(umapY),
    labels: cellTypes,
  };
  const z = new Float32Array(umapZ);

  return (
    <div style={{ width: 800, height: 600 }}>
      <ScatterChart data={data} z={z} enable3D pointSize={4} />
    </div>
  );
}
```

- A **2D / 3D** toggle button appears in the top-right corner
- To start in 3D mode, add `initial3D`
- Switching is instant — both chart instances are pre-created

### 3D Controls

| Input | Action |
|---|---|
| Left-drag | Rotate |
| Right-drag / Shift+drag | Pan |
| Scroll | Zoom |
| `F` | Toggle 2D/3D |
| `R` | Reset camera |

### 3D Ref API

```tsx
const chartRef = useRef<ScatterChartHandle>(null);

// Check current mode
chartRef.current?.is3D;         // boolean

// Toggle programmatically
chartRef.current?.toggle3D();

// Access the underlying 3D chart instance
chartRef.current?.instance3D;   // Scatter3DViewCore | null
```

## Color Mode

Switch how points are colored at runtime. Requires data with both `labels` (for cell set mode) and `values` (for expression mode).

```tsx
const chartRef = useRef<ScatterChartHandle>(null);

// Switch to expression colorscale
chartRef.current?.instance?.setColorMode('expression');

// Switch back to cluster label colors
chartRef.current?.instance?.setColorMode('cell-set');

// Check current mode
chartRef.current?.instance?.colorMode; // 'cell-set' | 'expression'
```

| Mode | Description |
|---|---|
| `cell-set` | Colors by cluster label using the auto-assigned palette (default) |
| `expression` | Colors by `values` (0–1) mapped through the `colorScale` |

## Convex Hull Overlay

Display convex hull polygons around each cluster as semi-transparent filled areas with colored borders. Useful for visually separating clusters.

```tsx
const chartRef = useRef<ScatterChartHandle>(null);

// Show cluster hull polygons
chartRef.current?.instance?.setShowHull(true);

// Hide
chartRef.current?.instance?.setShowHull(false);
```

The hulls are computed using Andrew's monotone chain algorithm (O(n log n)) and rendered on a lightweight 2D canvas overlay that follows camera pan/zoom. Performance impact is negligible.

## Toolbar Presets

Control which tools appear in the toolbar:

```tsx
// All tools + download button
<ScatterChart data={data} toolbarPreset="full" />

// Pan, box-select, lasso, eraser + download button (default)
<ScatterChart data={data} toolbarPreset="standard" />

// Pan only, no download
<ScatterChart data={data} toolbarPreset="minimal" />

// Custom selection
<ScatterChart data={data} tools={['pan', 'lasso']} actions={['download']} />
```

## Download / Export

Clicking the **download button** (↓) in the toolbar opens a modal with all available export formats:

| Format | Description |
|---|---|
| **PNG Image** | High-resolution raster image (2x scale) |
| **SVG Image** | Vector graphics |
| **Embedding CSV** | X, Y coordinates + labels + colors as CSV |
| **Cell Sets CSV** | Cell index + cluster label as CSV |

CSV options appear automatically when the chart has data loaded. The `Embedding CSV` and `Cell Sets CSV` formats are equivalent to Vitessce's obsEmbedding and obsSets downloads.

### Programmatic Export

Export methods are also available via ref without the modal:

```tsx
const chartRef = useRef<ScatterChartHandle>(null);

// Download as PNG (2x resolution by default)
chartRef.current?.instance?.exportPNG('my-umap');

// Download as SVG
chartRef.current?.instance?.exportSVG('my-umap');
```

### Custom Download Options (for library authors)

Subclasses can override `getDownloadOptions()` and `handleDownloadSelect()` to add custom export formats:

```typescript
import { BaseChart } from '@seegak/bio-charts';
import type { DownloadOption } from '@seegak/core';

class MyChart extends BaseChart {
  protected override getDownloadOptions(): DownloadOption[] {
    return [
      ...super.getDownloadOptions(),
      { id: 'json', label: 'JSON Data', description: 'Raw chart data as JSON' },
    ];
  }

  protected override handleDownloadSelect(id: string): void {
    if (id === 'json') {
      // custom export logic
      return;
    }
    super.handleDownloadSelect(id);
  }
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
