# PieChart

Visualizes proportions and composition as a pie chart. Also supports donut charts.

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `data` | `PieChartData` | - | Chart data |
| `showLabels` | `boolean` | `false` | Whether to show labels |
| `showPercentage` | `boolean` | `false` | Whether to show percentages |
| `groupThreshold` | `number` | `2` | Slices below this % are merged into "Others" |
| `labelThreshold` | `number` | `3` | Labels are hidden for slices below this % |
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

## Small Slice Grouping

When a dataset has many categories (e.g. 160 cell types), small slices make the chart unreadable with overlapping labels. Seegak automatically handles this:

- **Grouping**: Slices below `groupThreshold` (default 2%) are merged into a single "Others" slice
- **Label hiding**: Labels are hidden for slices below `labelThreshold` (default 3%) — hover to see details

Both thresholds are configurable:

```tsx
// Custom thresholds
<PieChart
  data={data}
  showLabels
  showPercentage
  groupThreshold={3}   // Merge slices below 3%
  labelThreshold={5}   // Hide labels below 5%
/>

// Disable grouping (show all slices)
<PieChart data={data} groupThreshold={0} labelThreshold={0} />
```

Tooltip hover still works for all slices, including "Others".
