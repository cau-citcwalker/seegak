# HumanBodyMap

An interactive SVG map representing human organs.
Clicking or hovering an organ triggers events, and organs with data are highlighted in a distinct color.

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `data` | `Record<string, OrganData>` | - | Per-organ data (key: organ ID) |
| `onOrganClick` | `(event: BodyMapEvent) => void` | - | Click event handler |
| `onOrganHover` | `(event: BodyMapEvent) => void` | - | Hover event handler |
| `onOrganLeave` | `(event: BodyMapEvent) => void` | - | Mouse leave event handler |
| `showLabels` | `boolean` | `false` | Show organ name labels |
| `defaultColor` | `string` | `'#2a3a4a'` | Color for organs without data |
| `hoverColor` | `string` | `'#4a6a8a'` | Color on hover |
| `selectedColor` | `string` | `'#1a8cff'` | Color for selected organ |
| `activeColor` | `string` | `'#3a7a5a'` | Color for organs with data |
| `style` | `CSSProperties` | - | Container style |
| `className` | `string` | - | Container CSS class |

## Data Types

```typescript
interface OrganData {
  datasetCount?: number;
  cellCount?: number;
  sampleCount?: number;
  metadata?: Record<string, unknown>;  // Additional metadata
}

interface BodyMapEvent {
  type: 'click' | 'hover' | 'leave';
  organId: string;       // e.g. 'heart', 'lung', 'liver'
  organName: string;     // e.g. 'Heart', 'Lung', 'Liver'
  data?: OrganData;      // Data for the organ (if available)
  originalEvent: MouseEvent;
}
```

## Organ ID List

| ID | Name |
|----|------|
| `brain` | Brain |
| `heart` | Heart |
| `lung` | Lung |
| `liver` | Liver |
| `stomach` | Stomach |
| `kidney` | Kidney |
| `intestine` | Intestine |
| `spleen` | Spleen |
| `bladder` | Bladder |
| `skin` | Skin |

## Example: Dataset Explorer

```tsx
import { useState, useCallback } from 'react';
import { HumanBodyMap } from '@seegak/react';
import type { BodyMapEvent } from '@seegak/human-body-map';

function DatasetExplorer() {
  const [selected, setSelected] = useState<string | null>(null);

  const organData = {
    heart: { datasetCount: 2, cellCount: 45000, sampleCount: 12 },
    lung: { datasetCount: 14, cellCount: 128000, sampleCount: 48 },
    liver: { datasetCount: 3, cellCount: 62000, sampleCount: 15 },
    kidney: { datasetCount: 5, cellCount: 78000, sampleCount: 22 },
    brain: { datasetCount: 8, cellCount: 95000, sampleCount: 35 },
  };

  const handleClick = useCallback((e: BodyMapEvent) => {
    setSelected(e.organId);
    console.log(`Clicked: ${e.organName}`, e.data);
  }, []);

  return (
    <div style={{ display: 'flex', gap: 24 }}>
      <div style={{ width: 400, height: 600 }}>
        <HumanBodyMap
          data={organData}
          onOrganClick={handleClick}
          showLabels
          defaultColor="#1a2a3a"
          hoverColor="#2a4a6a"
          activeColor="#3b82f6"
        />
      </div>
      <div>
        {selected && organData[selected] && (
          <div>
            <h3>{selected}</h3>
            <p>Datasets: {organData[selected].datasetCount}</p>
            <p>Cells: {organData[selected].cellCount.toLocaleString()}</p>
            <p>Samples: {organData[selected].sampleCount}</p>
          </div>
        )}
      </div>
    </div>
  );
}
```

## Example: Custom Color Theme

```tsx
<HumanBodyMap
  data={organData}
  defaultColor="#e8e8e8"    // Light gray (light theme)
  hoverColor="#b0c4de"      // Light blue
  selectedColor="#ff6347"   // Tomato red
  activeColor="#32cd32"     // Lime green
  showLabels
/>
```

## Tooltip

HumanBodyMap automatically displays a tooltip on hover.
The tooltip shows the organ name and data (dataset count, cell count, sample count).
Simply pass `data` and it works automatically — no additional configuration needed.
