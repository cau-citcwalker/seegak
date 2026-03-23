export interface ChannelState {
  visible: boolean;
  colormap: string;
  contrastMin: number;
  contrastMax: number;
  lut: Float32Array;
}

// Named colormap endpoints: maps from black (0,0,0) to the named color
const NAMED_COLORMAP_ENDPOINTS: Record<string, [number, number, number]> = {
  red:     [1, 0, 0],
  green:   [0, 1, 0],
  blue:    [0, 0, 1],
  cyan:    [0, 1, 1],
  magenta: [1, 0, 1],
  yellow:  [1, 1, 0],
  white:   [1, 1, 1],
};

function hexToRgb(hex: string): [number, number, number] {
  // Strip leading '#' if present
  const h = hex.startsWith('#') ? hex.slice(1) : hex;
  const n = parseInt(h, 16);
  if (h.length === 3) {
    return [
      ((n >> 8) & 0xf) / 15,
      ((n >> 4) & 0xf) / 15,
      (n & 0xf) / 15,
    ];
  }
  return [
    ((n >> 16) & 0xff) / 255,
    ((n >> 8) & 0xff) / 255,
    (n & 0xff) / 255,
  ];
}

/**
 * ChannelController manages per-channel display state and LUT generation
 * for multi-channel spatial images.
 */
export class ChannelController {
  private states: ChannelState[] = [];
  private listeners: Array<() => void> = [];

  constructor(nChannels = 0) {
    for (let i = 0; i < nChannels; i++) {
      this.states.push(this.makeDefaultState(i));
    }
  }

  private makeDefaultState(idx: number): ChannelState {
    const defaultColormaps = ['red', 'green', 'blue', 'cyan', 'magenta', 'yellow'];
    const colormap = defaultColormaps[idx % defaultColormaps.length]!;
    return {
      visible: true,
      colormap,
      contrastMin: 0,
      contrastMax: 1,
      lut: this.buildLut(colormap, 0, 1),
    };
  }

  /**
   * Build a 256×4 RGBA LUT (Float32Array of length 1024).
   * Maps linearly from black at 'min' to the target color at 'max'.
   * For named colors: 'red','green','blue','cyan','magenta','yellow','white'.
   * For hex: parses and maps black → hex color.
   */
  buildLut(colormap: string, min: number, max: number): Float32Array {
    const lut = new Float32Array(256 * 4);
    const range = max - min || 1;

    let targetR: number;
    let targetG: number;
    let targetB: number;

    const named = NAMED_COLORMAP_ENDPOINTS[colormap.toLowerCase()];
    if (named) {
      [targetR, targetG, targetB] = named;
    } else {
      [targetR, targetG, targetB] = hexToRgb(colormap);
    }

    for (let i = 0; i < 256; i++) {
      // Physical value this LUT entry corresponds to
      const val = min + (i / 255) * range;
      // Normalize to [0, 1] within contrast window
      const t = Math.max(0, Math.min(1, (val - min) / range));

      lut[i * 4 + 0] = t * targetR;
      lut[i * 4 + 1] = t * targetG;
      lut[i * 4 + 2] = t * targetB;
      lut[i * 4 + 3] = 1.0;
    }

    return lut;
  }

  /** Ensure channel slot exists (grows array if needed) */
  private ensureChannel(idx: number): void {
    while (this.states.length <= idx) {
      this.states.push(this.makeDefaultState(this.states.length));
    }
  }

  setVisible(idx: number, visible: boolean): void {
    this.ensureChannel(idx);
    this.states[idx]!.visible = visible;
    this.notify();
  }

  setColormap(idx: number, colormap: string): void {
    this.ensureChannel(idx);
    const s = this.states[idx]!;
    s.colormap = colormap;
    s.lut = this.buildLut(colormap, s.contrastMin, s.contrastMax);
    this.notify();
  }

  setContrast(idx: number, min: number, max: number): void {
    this.ensureChannel(idx);
    const s = this.states[idx]!;
    s.contrastMin = min;
    s.contrastMax = max;
    s.lut = this.buildLut(s.colormap, min, max);
    this.notify();
  }

  getState(idx: number): ChannelState {
    this.ensureChannel(idx);
    return this.states[idx]!;
  }

  get channelCount(): number {
    return this.states.length;
  }

  /** Register a change listener. Returns an unsubscribe function. */
  onChanged(cb: () => void): () => void {
    this.listeners.push(cb);
    return () => {
      const i = this.listeners.indexOf(cb);
      if (i !== -1) this.listeners.splice(i, 1);
    };
  }

  private notify(): void {
    for (const cb of this.listeners) cb();
  }
}
