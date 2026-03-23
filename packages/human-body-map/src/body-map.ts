import type {
  OrganData, BodyMapOptions, BodyMapCallback,
  BodyMapEvent, BodyMapEventType, TooltipInfo,
} from './types.js';
import { ANTERIOR_ORGANS, BODY_OUTLINE } from './organs/organ-paths.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const DEFAULTS: Required<BodyMapOptions> = {
  width: 300,
  height: 600,
  defaultColor: '#2a3a4a',
  hoverColor: '#4a6a8a',
  selectedColor: '#1a8cff',
  activeColor: '#3a7a5a',
  showLabels: false,
  view: 'anterior',
  gender: 'neutral',
};

export class HumanBodyMap {
  private container: HTMLElement;
  private svg: SVGSVGElement;
  private opts: Required<BodyMapOptions>;
  private organData = new Map<string, OrganData>();
  private organElements = new Map<string, SVGPathElement>();
  private selectedOrgans = new Set<string>();
  private callbacks: BodyMapCallback[] = [];
  private tooltipEl: HTMLDivElement | null = null;

  constructor(container: HTMLElement, options: BodyMapOptions = {}) {
    this.container = container;
    this.opts = { ...DEFAULTS, ...options };

    container.style.position = 'relative';

    this.svg = document.createElementNS(SVG_NS, 'svg');
    this.svg.setAttribute('viewBox', '0 0 300 600');
    this.svg.setAttribute('width', String(this.opts.width));
    this.svg.setAttribute('height', String(this.opts.height));
    this.svg.style.width = '100%';
    this.svg.style.height = '100%';
    this.svg.style.maxWidth = `${this.opts.width}px`;
    container.appendChild(this.svg);

    this.createTooltip();
    this.buildMap();
  }

  private createTooltip(): void {
    this.tooltipEl = document.createElement('div');
    Object.assign(this.tooltipEl.style, {
      position: 'absolute',
      display: 'none',
      padding: '8px 12px',
      backgroundColor: 'rgba(0, 0, 0, 0.85)',
      color: '#fff',
      borderRadius: '6px',
      fontSize: '13px',
      pointerEvents: 'none',
      zIndex: '1000',
      maxWidth: '250px',
      lineHeight: '1.4',
      boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
    });
    this.container.appendChild(this.tooltipEl);
  }

  private buildMap(): void {
    // Body outline (background silhouette)
    const outline = document.createElementNS(SVG_NS, 'path');
    outline.setAttribute('d', BODY_OUTLINE);
    outline.setAttribute('fill', '#1a2030');
    outline.setAttribute('stroke', '#3a4a5a');
    outline.setAttribute('stroke-width', '1');
    this.svg.appendChild(outline);

    // Organs
    const organs = ANTERIOR_ORGANS.filter(o => o.id !== 'skin'); // skin is the outline

    for (const organ of organs) {
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', organ.path);
      path.setAttribute('fill', this.opts.defaultColor);
      path.setAttribute('stroke', '#5a6a7a');
      path.setAttribute('stroke-width', '0.5');
      path.setAttribute('data-organ-id', organ.id);
      path.style.cursor = 'pointer';
      path.style.transition = 'fill 0.2s ease, opacity 0.2s ease';

      // Event listeners
      path.addEventListener('mouseenter', (e) => this.handleOrganEvent('hover', organ.id, e));
      path.addEventListener('mouseleave', (e) => this.handleOrganEvent('leave', organ.id, e));
      path.addEventListener('click', (e) => this.handleOrganEvent('click', organ.id, e));

      this.svg.appendChild(path);
      this.organElements.set(organ.id, path);

      // Label
      if (this.opts.showLabels) {
        const text = document.createElementNS(SVG_NS, 'text');
        text.setAttribute('x', String(organ.labelX));
        text.setAttribute('y', String(organ.labelY));
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('dominant-baseline', 'middle');
        text.setAttribute('fill', '#ccc');
        text.setAttribute('font-size', '7');
        text.setAttribute('pointer-events', 'none');
        text.textContent = organ.nameKo ?? organ.name;
        this.svg.appendChild(text);
      }
    }
  }

  private handleOrganEvent(type: BodyMapEventType, organId: string, e: MouseEvent): void {
    const organDef = ANTERIOR_ORGANS.find(o => o.id === organId);
    if (!organDef) return;

    const path = this.organElements.get(organId);
    if (!path) return;

    const data = this.organData.get(organId);

    if (type === 'hover') {
      if (!this.selectedOrgans.has(organId)) {
        path.setAttribute('fill', this.opts.hoverColor);
      }
      this.showTooltip(organDef.name, organDef.nameKo, data, e);
    } else if (type === 'leave') {
      if (!this.selectedOrgans.has(organId)) {
        path.setAttribute('fill', data ? this.opts.activeColor : this.opts.defaultColor);
      }
      this.hideTooltip();
    } else if (type === 'click') {
      this.toggleSelection(organId);
    }

    const event: BodyMapEvent = {
      type,
      organId,
      organName: organDef.name,
      data,
      originalEvent: e,
    };

    for (const cb of this.callbacks) {
      cb(event);
    }
  }

  private toggleSelection(organId: string): void {
    const path = this.organElements.get(organId);
    if (!path) return;

    // Deselect if clicking the already-selected organ
    if (this.selectedOrgans.has(organId)) {
      this.selectedOrgans.delete(organId);
      const data = this.organData.get(organId);
      path.setAttribute('fill', data ? this.opts.activeColor : this.opts.defaultColor);
      return;
    }

    // Clear previous selection (single-select mode)
    for (const prevId of [...this.selectedOrgans]) {
      const prevPath = this.organElements.get(prevId);
      if (prevPath) {
        const prevData = this.organData.get(prevId);
        prevPath.setAttribute('fill', prevData ? this.opts.activeColor : this.opts.defaultColor);
      }
      this.selectedOrgans.delete(prevId);
    }

    // Select the new organ
    this.selectedOrgans.add(organId);
    path.setAttribute('fill', this.opts.selectedColor);
  }

  private showTooltip(name: string, nameKo: string | undefined, data: OrganData | undefined, e: MouseEvent): void {
    if (!this.tooltipEl) return;

    let html = `<strong>${nameKo ? `${nameKo} (${name})` : name}</strong>`;

    if (data) {
      if (data.datasetCount !== undefined) {
        html += `<br>데이터셋: ${data.datasetCount.toLocaleString()}개`;
      }
      if (data.cellCount !== undefined) {
        html += `<br>세포 수: ${data.cellCount.toLocaleString()}`;
      }
      if (data.sampleCount !== undefined) {
        html += `<br>샘플 수: ${data.sampleCount.toLocaleString()}`;
      }
    } else {
      html += '<br><span style="color:#888">데이터 없음</span>';
    }

    this.tooltipEl.innerHTML = html;
    this.tooltipEl.style.display = 'block';

    const rect = this.container.getBoundingClientRect();
    const x = e.clientX - rect.left + 15;
    const y = e.clientY - rect.top - 10;
    this.tooltipEl.style.left = `${x}px`;
    this.tooltipEl.style.top = `${y}px`;
  }

  private hideTooltip(): void {
    if (this.tooltipEl) {
      this.tooltipEl.style.display = 'none';
    }
  }

  // ─── Public API ───

  /** Set data for organs. Organs with data will be highlighted. */
  setData(data: Record<string, OrganData>): void {
    this.organData.clear();
    for (const [organId, organData] of Object.entries(data)) {
      this.organData.set(organId, organData);
    }
    this.updateColors();
  }

  /** Update data for a single organ */
  setOrganData(organId: string, data: OrganData): void {
    this.organData.set(organId, data);
    this.updateOrganColor(organId);
  }

  private updateColors(): void {
    for (const [organId] of this.organElements) {
      this.updateOrganColor(organId);
    }
  }

  private updateOrganColor(organId: string): void {
    const path = this.organElements.get(organId);
    if (!path) return;

    if (this.selectedOrgans.has(organId)) {
      path.setAttribute('fill', this.opts.selectedColor);
    } else if (this.organData.has(organId)) {
      path.setAttribute('fill', this.opts.activeColor);
    } else {
      path.setAttribute('fill', this.opts.defaultColor);
    }
  }

  /** Listen for organ interaction events */
  on(callback: BodyMapCallback): () => void {
    this.callbacks.push(callback);
    return () => {
      const idx = this.callbacks.indexOf(callback);
      if (idx !== -1) this.callbacks.splice(idx, 1);
    };
  }

  /** Programmatically select an organ */
  select(organId: string): void {
    if (!this.selectedOrgans.has(organId)) {
      this.toggleSelection(organId);
    }
  }

  /** Programmatically deselect an organ */
  deselect(organId: string): void {
    if (this.selectedOrgans.has(organId)) {
      this.toggleSelection(organId);
    }
  }

  /** Clear all selections */
  clearSelection(): void {
    for (const organId of [...this.selectedOrgans]) {
      this.toggleSelection(organId);
    }
  }

  /** Get currently selected organ IDs */
  getSelected(): string[] {
    return [...this.selectedOrgans];
  }

  /** Highlight specific organs with a custom color */
  highlight(organIds: string[], color: string): void {
    for (const id of organIds) {
      const path = this.organElements.get(id);
      if (path) path.setAttribute('fill', color);
    }
  }

  /** Reset highlight to default state */
  resetHighlight(): void {
    this.updateColors();
  }

  destroy(): void {
    this.tooltipEl?.remove();
    this.svg.remove();
    this.organElements.clear();
    this.callbacks = [];
  }
}
