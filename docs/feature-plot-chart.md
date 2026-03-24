# FeaturePlotChart

Overlays gene expression values on UMAP/tSNE coordinates as a color gradient.
Similar to ScatterChart, but internally normalizes expression values (min/max) and maps them to a color scale.

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `data` | `FeaturePlotData` | - | Chart data |
| `pointSize` | `number` | `5` | Point size (px) |
| `opacity` | `number` | `0.9` | Point opacity (0–1) |
| `colorScale` | `ColorScale` | `VIRIDIS` | Expression color scale |
| `autoFit` | `boolean` | `true` | Auto-zoom to fit data range |
| `style` | `CSSProperties` | - | Container style |
| `className` | `string` | - | Container CSS class |

## FeaturePlotData

```typescript
interface FeaturePlotData {
  x: Float32Array;           // UMAP/tSNE X coordinates
  y: Float32Array;           // UMAP/tSNE Y coordinates
  expression: Float32Array;  // Gene expression values (raw, normalized internally)
  geneName?: string;         // Gene name (displayed as chart title)
}
```

## Example: Basic Usage

```tsx
import { FeaturePlotChart, VIRIDIS } from '@seegak/react';

function GeneExpression() {
  const data = {
    x: new Float32Array(umapX),
    y: new Float32Array(umapY),
    expression: new Float32Array(sftpcExpression),
    geneName: 'SFTPC',
  };

  return (
    <div style={{ width: 600, height: 500 }}>
      <FeaturePlotChart
        data={data}
        pointSize={3}
        opacity={0.9}
        colorScale={VIRIDIS}
        autoFit
      />
    </div>
  );
}
```

## Example: Custom Color Scale

Built-in scales (VIRIDIS, PLASMA, INFERNO) start with dark colors at low values, which may be invisible on dark backgrounds.
In that case, define a custom color scale.

```tsx
import { FeaturePlotChart } from '@seegak/react';
import type { ColorScale } from '@seegak/core';

const CUSTOM_SCALE: ColorScale = {
  stops: [
    { position: 0.0, color: { r: 0.6, g: 0.6, b: 0.65, a: 1 } },  // Light gray
    { position: 0.3, color: { r: 0.2, g: 0.4, b: 0.8, a: 1 } },   // Blue
    { position: 0.6, color: { r: 0.9, g: 0.2, b: 0.2, a: 1 } },   // Red
    { position: 1.0, color: { r: 1.0, g: 0.95, b: 0.2, a: 1 } },  // Yellow
  ],
};

function GeneExpression() {
  return (
    <div style={{ width: 600, height: 500, background: '#f5f5f8' }}>
      <FeaturePlotChart
        data={data}
        colorScale={CUSTOM_SCALE}
        autoFit
      />
    </div>
  );
}
```

## Example: Gene Selection Interaction

```tsx
import { useState } from 'react';
import { FeaturePlotChart, VIRIDIS } from '@seegak/react';

const GENES = ['SFTPC', 'AGER', 'PECAM1', 'CD68'];

function GeneExplorer() {
  const [gene, setGene] = useState('SFTPC');

  // Load expression data from API (example)
  const data = {
    x: umapCoords.x,
    y: umapCoords.y,
    expression: geneExpressionMap[gene],
    geneName: gene,
  };

  return (
    <div>
      <div>
        {GENES.map(g => (
          <button key={g} onClick={() => setGene(g)}>{g}</button>
        ))}
      </div>
      <div style={{ width: 600, height: 500 }}>
        <FeaturePlotChart data={data} colorScale={VIRIDIS} autoFit />
      </div>
    </div>
  );
}
```

## Differences from ScatterChart

| | ScatterChart | FeaturePlotChart |
|---|---|---|
| Color input | `colors` (hex array) or `values` (must be pre-normalized to 0–1) | `expression` (raw values, auto-normalized) |
| Use case | Categorical clustering | Continuous value overlay |
| Normalization | Manual | Automatic min/max |
| Title display | None | Automatic from `geneName` |
