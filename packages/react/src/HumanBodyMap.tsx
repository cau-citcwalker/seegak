import { useRef, useEffect, useCallback } from 'react';
import {
  HumanBodyMap as HumanBodyMapCore,
  type OrganData, type BodyMapOptions, type BodyMapEvent,
} from '@seegak/human-body-map';

export interface HumanBodyMapProps {
  /** Organ data keyed by organ ID */
  data?: Record<string, OrganData>;
  /** Called when an organ is clicked */
  onOrganClick?: (event: BodyMapEvent) => void;
  /** Called when hovering over an organ */
  onOrganHover?: (event: BodyMapEvent) => void;
  /** Called when leaving an organ */
  onOrganLeave?: (event: BodyMapEvent) => void;
  /** Show organ labels */
  showLabels?: boolean;
  /** Custom colors */
  defaultColor?: string;
  hoverColor?: string;
  selectedColor?: string;
  activeColor?: string;
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
  showLabels,
  defaultColor,
  hoverColor,
  selectedColor,
  activeColor,
  systemFilter,
  style,
  className,
}: HumanBodyMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HumanBodyMapCore | null>(null);

  // Stable callback refs
  const onClickRef = useRef(onOrganClick);
  const onHoverRef = useRef(onOrganHover);
  const onLeaveRef = useRef(onOrganLeave);
  onClickRef.current = onOrganClick;
  onHoverRef.current = onOrganHover;
  onLeaveRef.current = onOrganLeave;

  // Create map on mount
  useEffect(() => {
    if (!containerRef.current) return;

    const map = new HumanBodyMapCore(containerRef.current, {
      showLabels,
      defaultColor,
      hoverColor,
      selectedColor,
      activeColor,
    });

    const unsubscribe = map.on((event) => {
      switch (event.type) {
        case 'click':
          onClickRef.current?.(event);
          break;
        case 'hover':
          onHoverRef.current?.(event);
          break;
        case 'leave':
          onLeaveRef.current?.(event);
          break;
      }
    });

    mapRef.current = map;

    return () => {
      unsubscribe();
      map.destroy();
      mapRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update data
  useEffect(() => {
    if (mapRef.current && data) {
      mapRef.current.setData(data);
    }
  }, [data]);

  // Update system filter
  useEffect(() => {
    mapRef.current?.setSystemFilter(systemFilter ?? null);
  }, [systemFilter]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ width: '100%', height: '100%', ...style }}
    />
  );
}
