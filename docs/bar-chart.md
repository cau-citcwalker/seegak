# BarChart

Compares categorical values using bars. Supports both simple and stacked bar charts.

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `data` | `BarChartData` | - | Chart data |
| `barWidth` | `number` | - | Bar width |
| `defaultColor` | `string` | - | Default bar color (hex) |
| `gap` | `number` | - | Gap between bars |
| `style` | `CSSProperties` | - | Container style |
| `className` | `string` | - | Container CSS class |

## Data Types

```typescript
// Simple bars
interface BarGroup {
  label: string;
  value: number;
  color?: string;  // Per-bar color (hex)
}

// Stacked bars
interface StackedBarGroup {
  label: string;
  segments: Array<{
    value: number;
    color: string;
    label?: string;
  }>;
}

interface BarChartData {
  groups: BarGroup[] | StackedBarGroup[];
  title?: string;
  xLabel?: string;
  yLabel?: string;
  orientation?: 'vertical' | 'horizontal';
  stacked?: boolean;  // When true, groups are interpreted as StackedBarGroup
}
```

## Example: Cell Count Comparison

```tsx
import { BarChart } from '@seegak/react';

function CellCounts() {
  const data = {
    groups: [
      { label: 'AT1', value: 800, color: '#e41a1c' },
      { label: 'AT2', value: 1200, color: '#377eb8' },
      { label: 'Endothelial', value: 1500, color: '#4daf4a' },
      { label: 'Fibroblast', value: 900, color: '#984ea3' },
      { label: 'Macrophage', value: 700, color: '#ff7f00' },
    ],
    title: 'Cell Count per Type',
    xLabel: 'Cell Type',
    yLabel: 'Count',
  };

  return (
    <div style={{ width: 600, height: 400 }}>
      <BarChart data={data} />
    </div>
  );
}
```

## Example: Uniform Color

To apply the same color to all bars, use `defaultColor`.

```tsx
<BarChart data={data} defaultColor="#3b82f6" />
```

## Example: Stacked Bar Chart

```tsx
const data = {
  groups: [
    {
      label: 'Sample A',
      segments: [
        { value: 300, color: '#e41a1c', label: 'AT1' },
        { value: 500, color: '#377eb8', label: 'AT2' },
        { value: 200, color: '#4daf4a', label: 'Endothelial' },
      ],
    },
    {
      label: 'Sample B',
      segments: [
        { value: 400, color: '#e41a1c', label: 'AT1' },
        { value: 350, color: '#377eb8', label: 'AT2' },
        { value: 250, color: '#4daf4a', label: 'Endothelial' },
      ],
    },
  ],
  stacked: true,
  title: 'Cell Composition by Sample',
};

<BarChart data={data} />
```

## Label Overflow Behavior

When there are too many categories and the bar width becomes very narrow (< 18px per slot), labels automatically collapse into small colored dots. The full category name is still visible on hover via the tooltip.

This is useful when plotting datasets with 50+ categories (e.g., cell types from `dataset.h5ad` with 160 cell types).
