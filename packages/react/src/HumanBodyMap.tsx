import { useState, useRef, useEffect, useCallback } from 'react';
import {
  ANTERIOR_ORGANS, CATEGORY_COLORS,
  type OrganCategory, type OrganData, type BodyMapEvent,
} from '@seegak/human-body-map';

const skinUrl = new URL('./organs/skin.svg', import.meta.url).href;

const RENDER_ORDER = [
  'aorta', 'brain', 'esophagus', 'heart',
  'kidney_right', 'kidney_left',
  'adrenal_right', 'adrenal_left',
  'pancreas', 'spleen', 'stomach', 'urethra',
  'small_intestine', 'large_intestine', 'gonads',
  'lung_right', 'lung_left',
  'trachea', 'thyroid', 'thymus',
  'liver', 'gallbladder',
];

const ORGAN_SVG_URLS: Record<string, string> = {
  adrenal_left:    new URL('./organs/adrenal_left.svg',    import.meta.url).href,
  adrenal_right:   new URL('./organs/adrenal_right.svg',   import.meta.url).href,
  aorta:           new URL('./organs/aorta.svg',           import.meta.url).href,
  urethra:         new URL('./organs/urethra.svg',         import.meta.url).href,
  brain:           new URL('./organs/brain.svg',           import.meta.url).href,
  esophagus:       new URL('./organs/esophagus_real.svg',  import.meta.url).href,
  gallbladder:     new URL('./organs/gallbladder.svg',     import.meta.url).href,
  gonads:          new URL('./organs/gonads.svg',          import.meta.url).href,
  heart:           new URL('./organs/heart.svg',           import.meta.url).href,
  kidney_left:     new URL('./organs/kidney_left.svg',     import.meta.url).href,
  kidney_right:    new URL('./organs/kidney_right.svg',    import.meta.url).href,
  large_intestine: new URL('./organs/large_intestine.svg', import.meta.url).href,
  liver:           new URL('./organs/liver.svg',           import.meta.url).href,
  lung_left:       new URL('./organs/lung_left.svg',       import.meta.url).href,
  lung_right:      new URL('./organs/lung_right.svg',      import.meta.url).href,
  pancreas:        new URL('./organs/pancreas.svg',        import.meta.url).href,
  small_intestine: new URL('./organs/small_intestine.svg', import.meta.url).href,
  spleen:          new URL('./organs/spleen.svg',          import.meta.url).href,
  stomach:         new URL('./organs/stomach.svg',         import.meta.url).href,
  thymus:          new URL('./organs/thymus.svg',          import.meta.url).href,
  thyroid:         new URL('./organs/thyroid.svg',         import.meta.url).href,
  trachea:         new URL('./organs/trachea.svg',         import.meta.url).href,
};

// SVG native dimensions (width:height ratio ≈ 0.384, portrait)
const SVG_W = 1398.49;
const SVG_H = 3639.87;

// Downscaled canvas for alpha hit-testing (pixel-perfect click detection)
const CANVAS_SCALE = 0.15;
const CANVAS_W = Math.round(SVG_W * CANVAS_SCALE); // ~210
const CANVAS_H = Math.round(SVG_H * CANVAS_SCALE); // ~546

const ORGAN_MAP = Object.fromEntries(
  ANTERIOR_ORGANS.filter(o => o.id !== 'skin' && ORGAN_SVG_URLS[o.id]).map(o => [o.id, o])
);

export interface HumanBodyMapProps {
  /** Organ data keyed by organ ID — enriches click/hover events with metadata */
  data?: Record<string, OrganData>;
  /** Called when an organ is clicked */
  onOrganClick?: (event: BodyMapEvent) => void;
  /** Called when hovering over an organ */
  onOrganHover?: (event: BodyMapEvent) => void;
  /** Called when leaving an organ */
  onOrganLeave?: (event: BodyMapEvent) => void;
  /** Filter body map to a single organ system (e.g. "respiratory"). null shows all. */
  systemFilter?: string | null;
  style?: React.CSSProperties;
  className?: string;
}

export function HumanBodyMap({
  data,
  onOrganClick,
  onOrganHover,
  onOrganLeave,
  systemFilter,
  style,
  className,
}: HumanBodyMapProps) {
  const outerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const alphaRef = useRef<Record<string, Uint8ClampedArray>>({});

  // Measure available space and compute the largest body that fits
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const update = () => {
      const { width, height } = el.getBoundingClientRect();
      if (!width || !height) return;
      const ratio = SVG_W / SVG_H;
      let w = height * ratio;
      let h = height;
      if (w > width) { w = width; h = width / ratio; }
      setDims({ w: Math.floor(w), h: Math.floor(h) });
    };
    const ro = new ResizeObserver(update);
    ro.observe(el);
    update();
    return () => ro.disconnect();
  }, []);

  // Stable callback refs so event handlers don't recreate on every render
  const onClickRef = useRef(onOrganClick);
  const onHoverRef = useRef(onOrganHover);
  const onLeaveRef = useRef(onOrganLeave);
  const dataRef = useRef(data);
  onClickRef.current = onOrganClick;
  onHoverRef.current = onOrganHover;
  onLeaveRef.current = onOrganLeave;
  dataRef.current = data;

  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const hoveredIdRef = useRef<string | null>(null);

  // Reset selection when system filter changes
  useEffect(() => {
    setSelectedId(null);
    setHoveredId(null);
    hoveredIdRef.current = null;
  }, [systemFilter]);

  // Preload organ images into offscreen canvases for alpha hit-testing
  useEffect(() => {
    const ids = RENDER_ORDER.filter(id => ORGAN_SVG_URLS[id]);
    ids.forEach(id => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = CANVAS_W;
        canvas.height = CANVAS_H;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, CANVAS_W, CANVAS_H);
        try {
          alphaRef.current[id] = ctx.getImageData(0, 0, CANVAS_W, CANVAS_H).data;
        } catch {
          // CORS-tainted canvas — hit testing falls back gracefully
        }
      };
      img.src = ORGAN_SVG_URLS[id];
    });
  }, []);

  const getOrganAt = useCallback((xFrac: number, yFrac: number): string | null => {
    const px = Math.min(CANVAS_W - 1, Math.floor(xFrac * CANVAS_W));
    const py = Math.min(CANVAS_H - 1, Math.floor(yFrac * CANVAS_H));
    const idx = (py * CANVAS_W + px) * 4;
    // Walk render order back-to-front; return the frontmost opaque organ
    for (let i = RENDER_ORDER.length - 1; i >= 0; i--) {
      const id = RENDER_ORDER[i];
      const d = alphaRef.current[id];
      if (d && d[idx + 3] > 20) return id;
    }
    return null;
  }, []);

  const isOrganActive = useCallback((id: string) => {
    const organ = ORGAN_MAP[id];
    return !systemFilter || organ?.category === systemFilter;
  }, [systemFilter]);

  const makeEvent = useCallback((
    type: BodyMapEvent['type'],
    id: string,
    e: React.MouseEvent,
  ): BodyMapEvent => {
    const organ = ORGAN_MAP[id];
    return {
      type,
      organId: id,
      organName: organ?.name ?? id,
      data: dataRef.current?.[id],
      originalEvent: e.nativeEvent,
    };
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = containerRef.current!.getBoundingClientRect();
    const xFrac = (e.clientX - rect.left) / rect.width;
    const yFrac = (e.clientY - rect.top) / rect.height;
    const id = getOrganAt(xFrac, yFrac);
    const activeId = id && isOrganActive(id) ? id : null;

    const prev = hoveredIdRef.current;
    if (prev === activeId) return;

    if (prev) onLeaveRef.current?.(makeEvent('leave', prev, e));
    hoveredIdRef.current = activeId;
    setHoveredId(activeId);
    if (activeId) onHoverRef.current?.(makeEvent('hover', activeId, e));
  }, [getOrganAt, isOrganActive, makeEvent]);

  const handleMouseLeave = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const prev = hoveredIdRef.current;
    if (prev) onLeaveRef.current?.(makeEvent('leave', prev, e));
    hoveredIdRef.current = null;
    setHoveredId(null);
  }, [makeEvent]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = containerRef.current!.getBoundingClientRect();
    const xFrac = (e.clientX - rect.left) / rect.width;
    const yFrac = (e.clientY - rect.top) / rect.height;
    const id = getOrganAt(xFrac, yFrac);
    if (!id || !isOrganActive(id)) return;

    setSelectedId(prev => (prev === id ? null : id));
    onClickRef.current?.(makeEvent('click', id, e));
  }, [getOrganAt, isOrganActive, makeEvent]);

  return (
    <div
      ref={outerRef}
      className={className}
      style={{
        width: '100%', height: '100%',
        display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
        overflow: 'hidden',
        ...style,
      }}
    >
      <div
        ref={containerRef}
        style={{
          position: 'relative',
          width: dims ? dims.w : 0,
          height: dims ? dims.h : 0,
          flexShrink: 0,
          cursor: hoveredId ? 'pointer' : 'default',
          userSelect: 'none',
        }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
      >
        <img
          src={skinUrl}
          alt="body"
          style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%',
            objectFit: 'fill', pointerEvents: 'none',
          }}
          draggable={false}
        />

        {RENDER_ORDER.filter(id => ORGAN_SVG_URLS[id]).map(id => {
          const organ = ORGAN_MAP[id];
          if (!organ) return null;

          const isActive = !systemFilter || organ.category === systemFilter;
          const isHovered = hoveredId === id;
          const isSelected = selectedId === id;
          const color = CATEGORY_COLORS[organ.category as OrganCategory] ?? '#80a0b0';

          let filter: string;
          if (!isActive) {
            filter = 'grayscale(1) opacity(0.10)';
          } else if (isSelected) {
            filter = [
              `drop-shadow(2px 0px 0px ${color})`,
              `drop-shadow(-2px 0px 0px ${color})`,
              `drop-shadow(0px 2px 0px ${color})`,
              `drop-shadow(0px -2px 0px ${color})`,
              `drop-shadow(1px 1px 0px ${color})`,
              `drop-shadow(-1px 1px 0px ${color})`,
              `drop-shadow(1px -1px 0px ${color})`,
              `drop-shadow(-1px -1px 0px ${color})`,
              `drop-shadow(0px 0px 3px ${color}88)`,
              'brightness(1.05)',
            ].join(' ');
          } else if (isHovered) {
            filter = `brightness(1.1) drop-shadow(0 0 4px ${color}aa) opacity(0.92)`;
          } else {
            filter = 'grayscale(0.15) opacity(0.72)';
          }

          return (
            <img
              key={id}
              src={ORGAN_SVG_URLS[id]}
              alt={organ.name}
              style={{
                position: 'absolute', inset: 0,
                width: '100%', height: '100%',
                objectFit: 'fill', pointerEvents: 'none',
                transition: 'filter 0.2s ease',
                filter,
                mixBlendMode: 'multiply',
              }}
              draggable={false}
            />
          );
        })}
      </div>
    </div>
  );
}
