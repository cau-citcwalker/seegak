export interface OrganDefinition {
  id: string;
  name: string;
  nameKo?: string;
  /** SVG path d attribute */
  path: string;
  /** Label position (relative to SVG viewBox) */
  labelX: number;
  labelY: number;
  /** Organ category for grouping */
  category: OrganCategory;
}

export type OrganCategory =
  | 'nervous'
  | 'respiratory'
  | 'cardiovascular'
  | 'digestive'
  | 'urinary'
  | 'reproductive'
  | 'musculoskeletal'
  | 'endocrine'
  | 'lymphatic'
  | 'integumentary';

export interface OrganData {
  datasetCount?: number;
  cellCount?: number;
  sampleCount?: number;
  /** Any additional metadata */
  metadata?: Record<string, unknown>;
}

export interface BodyMapOptions {
  /** Width of the SVG container */
  width?: number;
  /** Height of the SVG container */
  height?: number;
  /** Default fill color for organs */
  defaultColor?: string;
  /** Hover fill color */
  hoverColor?: string;
  /** Selected fill color */
  selectedColor?: string;
  /** Color for organs with data */
  activeColor?: string;
  /** Show organ labels */
  showLabels?: boolean;
  /** Which body view to show */
  view?: 'anterior' | 'posterior';
  /** Gender for anatomical accuracy */
  gender?: 'male' | 'female' | 'neutral';
}

export interface TooltipInfo {
  organId: string;
  organName: string;
  position: { x: number; y: number };
  data?: OrganData;
}

export type BodyMapEventType = 'click' | 'hover' | 'leave';

export interface BodyMapEvent {
  type: BodyMapEventType;
  organId: string;
  organName: string;
  data?: OrganData;
  originalEvent: MouseEvent;
}

export type BodyMapCallback = (event: BodyMapEvent) => void;
