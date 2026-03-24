# BoxPlotChart

Visualizes data distribution by group using quartiles, median, and outliers.
Suitable for comparing gene expression across cell types.

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `data` | `BoxPlotData` | - | Chart data |
| `boxWidth` | `number` | - | Box width |
| `whiskerWidth` | `number` | - | Whisker width |
| `showOutliers` | `boolean` | `true` | Whether to show outliers |
| `outlierSize` | `number` | - | Outlier point size |
| `defaultColor` | `string` | - | Default color (hex) |
| `style` | `CSSProperties` | - | Container style |
| `className` | `string` | - | Container CSS class |

## Data Types

```typescript
interface BoxPlotData {
  groups: BoxPlotGroup[];
  title?: string;
  xLabel?: string;
  yLabel?: string;
  orientation?: 'vertical' | 'horizontal';  // Default: 'vertical'
}

interface BoxPlotGroup {
  label: string;       // Group name
  values: number[];    // Raw data (statistics computed automatically)
  color?: string;      // Per-group color (hex)
  stats?: BoxStats;    // Pre-computed statistics (optional)
}

interface BoxStats {
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  outliers: number[];
}
```

## Example: Gene Expression Distribution

```tsx
import { BoxPlotChart } from '@seegak/react';

function ExpressionDistribution() {
  const data = {
    groups: [
      { label: 'AT1', values: at1Expression, color: '#e41a1c' },
      { label: 'AT2', values: at2Expression, color: '#377eb8' },
      { label: 'Endothelial', values: endoExpression, color: '#4daf4a' },
      { label: 'Fibroblast', values: fibroExpression, color: '#984ea3' },
      { label: 'Macrophage', values: macroExpression, color: '#ff7f00' },
    ],
    title: 'SFTPC Expression by Cell Type',
    xLabel: 'Cell Type',
    yLabel: 'log2(Expression + 1)',
  };

  return (
    <div style={{ width: 800, height: 500 }}>
      <BoxPlotChart
        data={data}
        showOutliers
        outlierSize={2}
      />
    </div>
  );
}
```

## Example: Pre-computed Statistics

If statistics are already computed on the server, pass `stats` directly to skip client-side computation.

```tsx
const data = {
  groups: [
    {
      label: 'Group A',
      values: [],  // Ignored when stats is provided
      stats: {
        min: 0.5,
        q1: 2.1,
        median: 3.4,
        q3: 5.2,
        max: 8.1,
        outliers: [0.1, 9.5, 10.2],
      },
    },
  ],
};
```

## Example: Horizontal Orientation

```tsx
const data = {
  groups: [...],
  orientation: 'horizontal',
};

<BoxPlotChart data={data} />
```
