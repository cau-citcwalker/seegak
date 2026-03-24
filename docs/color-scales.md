# Color Scales

Color scales map continuous values to colors.
Used with ScatterChart's `values` and FeaturePlotChart's `expression`.

## Built-in Scales

```tsx
import { VIRIDIS, PLASMA, INFERNO } from '@seegak/react';
```

| Scale | Range | Characteristics |
|-------|-------|----------------|
| **VIRIDIS** | Dark purple → Teal → Yellow | Suitable for light backgrounds. Perceptually uniform |
| **PLASMA** | Dark blue → Purple → Orange → Yellow | Suitable for light backgrounds. High contrast |
| **INFERNO** | Black → Purple → Orange → Yellow | Suitable for light backgrounds |

> **Note**: Built-in scales start with dark colors at low values.
> For dark backgrounds, consider using a custom scale.

## Custom Color Scales

A `ColorScale` is defined as an array of `stops`. Each stop consists of a position (0–1) and an RGBA color (0–1 range).

```typescript
import type { ColorScale } from '@seegak/core';

const MY_SCALE: ColorScale = {
  stops: [
    { position: 0.0, color: { r: 0.6, g: 0.6, b: 0.65, a: 1 } },
    { position: 0.5, color: { r: 0.9, g: 0.2, b: 0.2, a: 1 } },
    { position: 1.0, color: { r: 1.0, g: 0.95, b: 0.2, a: 1 } },
  ],
};
```

### Rules

- `position` must be in the 0.0–1.0 range
- Each channel of `color` (r, g, b, a) must be in the 0.0–1.0 range
- Stops must be sorted by position in ascending order
- At least one stop is required
- Values between stops are linearly interpolated (lerp)

## Example: Scale for Dark Backgrounds

```tsx
const DARK_BG_SCALE: ColorScale = {
  stops: [
    { position: 0.0, color: { r: 0.6, g: 0.6, b: 0.65, a: 1 } },  // Light gray
    { position: 0.3, color: { r: 0.2, g: 0.4, b: 0.8, a: 1 } },   // Blue
    { position: 0.6, color: { r: 0.9, g: 0.2, b: 0.2, a: 1 } },   // Red
    { position: 1.0, color: { r: 1.0, g: 0.95, b: 0.2, a: 1 } },  // Yellow
  ],
};

<FeaturePlotChart data={data} colorScale={DARK_BG_SCALE} />
```

## Example: Blue-White-Red (for Differential Expression)

```tsx
const BLUE_WHITE_RED: ColorScale = {
  stops: [
    { position: 0.0, color: { r: 0.0, g: 0.0, b: 1.0, a: 1 } },   // Blue (downregulated)
    { position: 0.5, color: { r: 0.95, g: 0.95, b: 0.95, a: 1 } }, // White (no change)
    { position: 1.0, color: { r: 1.0, g: 0.0, b: 0.0, a: 1 } },   // Red (upregulated)
  ],
};
```

## Example: Two-color Gradient

```tsx
const SIMPLE_GRADIENT: ColorScale = {
  stops: [
    { position: 0.0, color: { r: 0.9, g: 0.9, b: 0.9, a: 1 } },  // Light gray
    { position: 1.0, color: { r: 0.8, g: 0.0, b: 0.0, a: 1 } },  // Dark red
  ],
};
```

## Utility Functions

Color scale utilities are available from `@seegak/core`:

```tsx
import { sampleColorScale, colorScaleToTexture, hexToVec4, vec4ToHex } from '@seegak/core';

// Sample color at a specific position
const color = sampleColorScale(VIRIDIS, 0.5);
// → { r: 0.127, g: 0.566, b: 0.551, a: 1 }

// hex → Vec4 conversion
const vec4 = hexToVec4('#e41a1c');
// → { r: 0.894, g: 0.102, b: 0.110, a: 1 }

// Vec4 → hex conversion
const hex = vec4ToHex({ r: 0.894, g: 0.102, b: 0.110, a: 1 });
// → '#e41a1c'
```
