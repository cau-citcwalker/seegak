# PieChart

Visualizes proportions and composition as a pie chart. Also supports donut charts.

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `data` | `PieChartData` | - | Chart data |
| `showLabels` | `boolean` | `false` | Whether to show labels |
| `showPercentage` | `boolean` | `false` | Whether to show percentages |
| `style` | `CSSProperties` | - | Container style |
| `className` | `string` | - | Container CSS class |

## Data Types

```typescript
interface PieSlice {
  label: string;
  value: number;
  color?: string;  // Hex color
}

interface PieChartData {
  slices: PieSlice[];
  title?: string;
  innerRadius?: number;  // Donut chart (0 = pie, 0.5 = donut)
}
```

## Example: Cell Type Proportions

```tsx
import { PieChart } from '@seegak/react';

function CellTypeProportions() {
  const data = {
    slices: [
      { label: 'AT1', value: 800, color: '#e41a1c' },
      { label: 'AT2', value: 1200, color: '#377eb8' },
      { label: 'Endothelial', value: 1500, color: '#4daf4a' },
      { label: 'Fibroblast', value: 900, color: '#984ea3' },
      { label: 'Macrophage', value: 700, color: '#ff7f00' },
    ],
  };

  return (
    <div style={{ width: 400, height: 400 }}>
      <PieChart data={data} showLabels showPercentage />
    </div>
  );
}
```

## Example: Donut Chart

Use `innerRadius` to create a donut chart. Value is in the 0–1 range (ratio relative to outer radius).

```tsx
const data = {
  slices: [...],
  innerRadius: 0.5,  // Inner radius = 50% of outer radius
  title: 'Sample Composition',
};

<PieChart data={data} showLabels showPercentage />
```
