/**
 * Accessibility layer for chart components.
 * Adds ARIA attributes, keyboard navigation, and screen reader support.
 */

export interface A11yOptions {
  /** Chart title for screen readers */
  label: string;
  /** Detailed description */
  description?: string;
  /** Enable keyboard navigation */
  keyboardNav?: boolean;
  /** Announce data point on focus */
  announceOnFocus?: boolean;
}

export interface DataPointA11y {
  index: number;
  label: string;
  value?: string;
}

export class AccessibilityManager {
  private container: HTMLElement;
  private liveRegion: HTMLDivElement;
  private focusIndex = -1;
  private dataPoints: DataPointA11y[] = [];
  private onFocusChange?: (index: number) => void;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(container: HTMLElement, options: A11yOptions) {
    this.container = container;

    // Make container focusable
    if (!container.getAttribute('tabindex')) {
      container.setAttribute('tabindex', '0');
    }

    // ARIA role and labels
    container.setAttribute('role', 'img');
    container.setAttribute('aria-label', options.label);
    if (options.description) {
      container.setAttribute('aria-description', options.description);
    }

    // Live region for announcements
    this.liveRegion = document.createElement('div');
    this.liveRegion.setAttribute('role', 'status');
    this.liveRegion.setAttribute('aria-live', 'polite');
    this.liveRegion.setAttribute('aria-atomic', 'true');
    Object.assign(this.liveRegion.style, {
      position: 'absolute',
      width: '1px',
      height: '1px',
      padding: '0',
      margin: '-1px',
      overflow: 'hidden',
      clip: 'rect(0,0,0,0)',
      whiteSpace: 'nowrap',
      border: '0',
    });
    container.appendChild(this.liveRegion);

    // Keyboard navigation
    if (options.keyboardNav !== false) {
      this.keyHandler = this.handleKeyDown.bind(this);
      container.addEventListener('keydown', this.keyHandler);
    }
  }

  /** Set the data points available for keyboard navigation */
  setDataPoints(points: DataPointA11y[]): void {
    this.dataPoints = points;
    this.focusIndex = -1;

    // Update ARIA description with summary
    if (points.length > 0) {
      this.container.setAttribute(
        'aria-description',
        `차트 데이터: ${points.length}개 항목. 화살표 키로 탐색, Enter로 선택.`,
      );
    }
  }

  /** Set callback for when focused data point changes */
  onFocus(callback: (index: number) => void): void {
    this.onFocusChange = callback;
  }

  /** Announce a message to screen readers */
  announce(message: string): void {
    this.liveRegion.textContent = '';
    // Force re-announcement by clearing and re-setting
    requestAnimationFrame(() => {
      this.liveRegion.textContent = message;
    });
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (this.dataPoints.length === 0) return;

    let handled = true;

    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        this.focusIndex = Math.min(this.focusIndex + 1, this.dataPoints.length - 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        this.focusIndex = Math.max(this.focusIndex - 1, 0);
        break;
      case 'Home':
        this.focusIndex = 0;
        break;
      case 'End':
        this.focusIndex = this.dataPoints.length - 1;
        break;
      case 'Enter':
      case ' ':
        if (this.focusIndex >= 0) {
          const point = this.dataPoints[this.focusIndex];
          this.announce(`선택됨: ${point.label}${point.value ? `, 값: ${point.value}` : ''}`);
        }
        break;
      case 'Escape':
        this.focusIndex = -1;
        this.announce('탐색 종료');
        break;
      default:
        handled = false;
    }

    if (handled) {
      e.preventDefault();

      if (this.focusIndex >= 0 && this.focusIndex < this.dataPoints.length) {
        const point = this.dataPoints[this.focusIndex];
        this.announce(
          `${this.focusIndex + 1}/${this.dataPoints.length}: ${point.label}${point.value ? ` — ${point.value}` : ''}`,
        );
        this.onFocusChange?.(this.focusIndex);
      }
    }
  }

  /** Get the currently focused data point index */
  getFocusIndex(): number {
    return this.focusIndex;
  }

  destroy(): void {
    if (this.keyHandler) {
      this.container.removeEventListener('keydown', this.keyHandler);
    }
    this.liveRegion.remove();
    this.container.removeAttribute('role');
    this.container.removeAttribute('aria-label');
    this.container.removeAttribute('aria-description');
    this.container.removeAttribute('tabindex');
  }
}
