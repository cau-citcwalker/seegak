export interface OrganDefinition {
  id: string;
  name: string;
  nameKo?: string;
  /** SVG path d attribute — legacy, not used by image-based renderer */
  path?: string;
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

export type BodyMapEventType = 'click' | 'hover' | 'leave';

export interface BodyMapEvent {
  type: BodyMapEventType;
  organId: string;
  organName: string;
  data?: OrganData;
  originalEvent: MouseEvent;
}

export type BodyMapCallback = (event: BodyMapEvent) => void;
