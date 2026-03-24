// ─── Types ───

export interface ClusterEntry {
  label: string;
  color: string;
  count: number;
  visible: boolean;
}

export interface CellLegendOptions {
  position?: 'left' | 'right';
  title?: string;
  maxHeight?: number;
}

// ─── SVG Icons ───

const EYE_ON = `<svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2 10s3-6 8-6 8 6 8 6-3 6-8 6-8-6-8-6z"/><circle cx="10" cy="10" r="2.5"/></svg>`;
const EYE_OFF = `<svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2 10s3-6 8-6 8 6 8 6-3 6-8 6-8-6-8-6z"/><line x1="3" y1="3" x2="17" y2="17"/></svg>`;
const COLLAPSE_ICON = `<svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="4" y1="10" x2="16" y2="10"/></svg>`;
const EXPAND_ICON = `<svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="4" y1="10" x2="16" y2="10"/><line x1="10" y1="4" x2="10" y2="16"/></svg>`;

// ─── CellLegend ───

export class CellLegend {
  private el: HTMLElement;
  private headerEl: HTMLElement;
  private listEl: HTMLElement;
  private footerEl: HTMLElement;
  private minimizedEl: HTMLElement;
  private entries: ClusterEntry[] = [];
  private focusedLabel: string | null = null;
  private rowEls = new Map<string, HTMLElement>();
  private clickTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private _minimized = false;

  // Drag state
  private isDragging = false;
  private dragOffsetX = 0;
  private dragOffsetY = 0;

  constructor(
    container: HTMLElement,
    private options: CellLegendOptions,
    private onToggle: (label: string, visible: boolean) => void,
    private onFocus: (label: string | null) => void,
  ) {
    const pos = options.position ?? 'right';

    // ─── Expanded panel ───
    this.el = document.createElement('div');
    this.el.style.cssText = [
      'position:absolute',
      pos === 'right' ? 'right:8px' : 'left:44px',
      'top:50%',
      'transform:translateY(-50%)',
      'width:176px',
      'display:flex',
      'flex-direction:column',
      'z-index:10',
      'background:rgba(20,20,20,0.82)',
      'border:1px solid rgba(255,255,255,0.12)',
      'border-radius:6px',
      'overflow:hidden',
      'backdrop-filter:blur(6px)',
      'max-height:' + (options.maxHeight ?? 420) + 'px',
      'user-select:none',
    ].join(';');

    // Header with drag handle + title + minimize button
    this.headerEl = document.createElement('div');
    this.headerEl.style.cssText = [
      'padding:5px 8px 5px 10px',
      'font-size:10px',
      'font-weight:600',
      'color:rgba(255,255,255,0.5)',
      'letter-spacing:0.06em',
      'text-transform:uppercase',
      'border-bottom:1px solid rgba(255,255,255,0.08)',
      'flex-shrink:0',
      'display:flex',
      'align-items:center',
      'gap:4px',
      'cursor:grab',
    ].join(';');

    // Drag dots
    const dragDots = document.createElement('span');
    dragDots.textContent = '⠿';
    dragDots.style.cssText = 'color:rgba(255,255,255,0.2);font-size:10px;line-height:1;';

    const titleSpan = document.createElement('span');
    titleSpan.textContent = options.title ?? 'Cell Types';
    titleSpan.style.cssText = 'flex:1;';

    // Minimize button
    const minBtn = document.createElement('button');
    minBtn.innerHTML = COLLAPSE_ICON;
    minBtn.title = 'Minimize';
    minBtn.style.cssText = [
      'background:none',
      'border:none',
      'color:rgba(255,255,255,0.35)',
      'cursor:pointer',
      'padding:2px',
      'display:flex',
      'align-items:center',
      'transition:color 0.1s',
    ].join(';');
    minBtn.addEventListener('mouseenter', () => { minBtn.style.color = 'rgba(255,255,255,0.7)'; });
    minBtn.addEventListener('mouseleave', () => { minBtn.style.color = 'rgba(255,255,255,0.35)'; });
    minBtn.addEventListener('click', (e) => { e.stopPropagation(); this.minimize(); });

    this.headerEl.appendChild(dragDots);
    this.headerEl.appendChild(titleSpan);
    this.headerEl.appendChild(minBtn);
    this.headerEl.addEventListener('mousedown', this.onDragStart);
    this.el.appendChild(this.headerEl);

    // Scrollable list
    this.listEl = document.createElement('div');
    this.listEl.style.cssText = [
      'overflow-y:auto',
      'overflow-x:hidden',
      'flex:1',
      'padding:3px 0',
    ].join(';');
    this.el.appendChild(this.listEl);

    // Footer
    this.footerEl = document.createElement('div');
    this.footerEl.style.cssText = [
      'display:flex',
      'gap:4px',
      'padding:5px 8px',
      'border-top:1px solid rgba(255,255,255,0.08)',
      'flex-shrink:0',
    ].join(';');
    const resetBtn = this.makeFooterBtn('Reset');
    resetBtn.addEventListener('click', () => this.resetAll());
    this.footerEl.appendChild(resetBtn);
    this.el.appendChild(this.footerEl);

    container.appendChild(this.el);

    // ─── Minimized icon button ───
    this.minimizedEl = document.createElement('button');
    this.minimizedEl.title = options.title ?? 'Cell Types';
    this.minimizedEl.innerHTML = `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
      <rect x="3" y="3" width="14" height="14" rx="2"/>
      <line x1="7" y1="8" x2="13" y2="8"/>
      <line x1="7" y1="12" x2="11" y2="12"/>
    </svg>`;
    this.minimizedEl.style.cssText = [
      'position:absolute',
      pos === 'right' ? 'right:8px' : 'left:44px',
      'top:8px',
      'z-index:10',
      'width:32px',
      'height:32px',
      'display:none',
      'align-items:center',
      'justify-content:center',
      'background:rgba(20,20,20,0.82)',
      'border:1px solid rgba(255,255,255,0.12)',
      'border-radius:6px',
      'color:rgba(200,200,200,0.7)',
      'cursor:pointer',
      'backdrop-filter:blur(6px)',
      'padding:0',
      'transition:background 0.1s',
    ].join(';');
    this.minimizedEl.addEventListener('mouseenter', () => { this.minimizedEl.style.background = 'rgba(40,40,40,0.9)'; });
    this.minimizedEl.addEventListener('mouseleave', () => { this.minimizedEl.style.background = 'rgba(20,20,20,0.82)'; });
    this.minimizedEl.addEventListener('click', () => this.expand());
    container.appendChild(this.minimizedEl);
  }

  // ─── Public ───

  setEntries(entries: ClusterEntry[]): void {
    this.entries = entries.map(e => ({ ...e }));
    this.focusedLabel = null;
    this.renderList();
  }

  show(): void {
    if (this._minimized) {
      this.minimizedEl.style.display = 'flex';
    } else {
      this.el.style.display = 'flex';
    }
  }

  hide(): void {
    this.el.style.display = 'none';
    this.minimizedEl.style.display = 'none';
  }

  minimize(): void {
    this._minimized = true;
    this.el.style.display = 'none';
    this.minimizedEl.style.display = 'flex';
  }

  expand(): void {
    this._minimized = false;
    this.minimizedEl.style.display = 'none';
    this.el.style.display = 'flex';
  }

  destroy(): void {
    for (const t of this.clickTimers.values()) clearTimeout(t);
    document.removeEventListener('mousemove', this.onDragMove);
    document.removeEventListener('mouseup', this.onDragEnd);
    this.el.remove();
    this.minimizedEl.remove();
  }

  // ─── Drag ───

  private onDragStart = (e: MouseEvent): void => {
    // Don't drag if clicking the minimize button
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    this.isDragging = true;
    const rect = this.el.getBoundingClientRect();
    this.dragOffsetX = e.clientX - rect.left;
    this.dragOffsetY = e.clientY - rect.top;
    this.headerEl.style.cursor = 'grabbing';
    document.addEventListener('mousemove', this.onDragMove);
    document.addEventListener('mouseup', this.onDragEnd);
  };

  private onDragMove = (e: MouseEvent): void => {
    if (!this.isDragging) return;
    const parent = this.el.parentElement!;
    const cr = parent.getBoundingClientRect();
    const tw = this.el.offsetWidth;
    const th = this.el.offsetHeight;
    const x = Math.max(0, Math.min(cr.width - tw, e.clientX - cr.left - this.dragOffsetX));
    const y = Math.max(0, Math.min(cr.height - th, e.clientY - cr.top - this.dragOffsetY));
    this.el.style.left = `${x}px`;
    this.el.style.top = `${y}px`;
    this.el.style.right = 'auto';
    this.el.style.transform = 'none';
  };

  private onDragEnd = (): void => {
    this.isDragging = false;
    this.headerEl.style.cursor = 'grab';
    document.removeEventListener('mousemove', this.onDragMove);
    document.removeEventListener('mouseup', this.onDragEnd);
  };

  // ─── Rendering ───

  private renderList(): void {
    this.listEl.innerHTML = '';
    this.rowEls.clear();
    for (const entry of this.entries) {
      const row = this.makeRow(entry);
      this.rowEls.set(entry.label, row);
      this.listEl.appendChild(row);
    }
  }

  private makeRow(entry: ClusterEntry): HTMLElement {
    const isFocused = this.focusedLabel === entry.label;

    const row = document.createElement('div');
    row.style.cssText = [
      'display:flex',
      'align-items:center',
      'gap:6px',
      'padding:3px 8px 3px 10px',
      'cursor:pointer',
      'user-select:none',
      'transition:background 0.1s',
      isFocused ? 'background:rgba(96,165,250,0.14)' : 'background:transparent',
    ].join(';');

    // Dot
    const dot = document.createElement('span');
    dot.style.cssText = [
      'width:9px',
      'height:9px',
      'border-radius:50%',
      'flex-shrink:0',
      'background:' + entry.color,
      'opacity:' + (entry.visible ? '1' : '0.2'),
      'transition:opacity 0.15s',
      isFocused ? 'box-shadow:0 0 0 2px rgba(96,165,250,0.5)' : '',
    ].join(';');

    // Label
    const lbl = document.createElement('span');
    lbl.textContent = entry.label;
    lbl.style.cssText = [
      'flex:1',
      'font-size:11px',
      'color:rgba(255,255,255,' + (entry.visible ? '0.85' : '0.3') + ')',
      'overflow:hidden',
      'text-overflow:ellipsis',
      'white-space:nowrap',
      'transition:color 0.15s',
    ].join(';');

    // Count badge
    const cnt = document.createElement('span');
    cnt.textContent = entry.count >= 1000
      ? (entry.count / 1000).toFixed(1) + 'k'
      : String(entry.count);
    cnt.style.cssText = [
      'font-size:10px',
      'color:rgba(255,255,255,0.28)',
      'flex-shrink:0',
      'min-width:24px',
      'text-align:right',
    ].join(';');

    // Eye icon
    const eye = document.createElement('span');
    eye.innerHTML = entry.visible ? EYE_ON : EYE_OFF;
    eye.style.cssText = [
      'flex-shrink:0',
      'color:rgba(255,255,255,' + (entry.visible ? '0.45' : '0.2') + ')',
      'display:flex',
      'align-items:center',
      'padding-left:2px',
    ].join(';');

    row.appendChild(dot);
    row.appendChild(lbl);
    row.appendChild(cnt);
    row.appendChild(eye);

    // Hover
    row.addEventListener('mouseenter', () => {
      if (!isFocused) row.style.background = 'rgba(255,255,255,0.06)';
      eye.style.color = 'rgba(255,255,255,0.75)';
    });
    row.addEventListener('mouseleave', () => {
      if (!isFocused) row.style.background = 'transparent';
      eye.style.color = 'rgba(255,255,255,' + (entry.visible ? '0.45' : '0.2') + ')';
    });

    // Click / Double-click detection
    row.addEventListener('click', () => {
      const label = entry.label;
      if (this.clickTimers.has(label)) {
        clearTimeout(this.clickTimers.get(label)!);
        this.clickTimers.delete(label);
        this.handleDoubleClick(label);
      } else {
        const t = setTimeout(() => {
          this.clickTimers.delete(label);
          this.handleToggle(label);
        }, 260);
        this.clickTimers.set(label, t);
      }
    });

    return row;
  }

  private handleToggle(label: string): void {
    const entry = this.entries.find(e => e.label === label);
    if (!entry) return;
    entry.visible = !entry.visible;
    this.refreshRow(label);
    this.onToggle(label, entry.visible);
  }

  private handleDoubleClick(label: string): void {
    if (this.focusedLabel === label) {
      // Un-focus → restore all
      this.focusedLabel = null;
      for (const e of this.entries) e.visible = true;
      this.renderList();
      this.onFocus(null);
    } else {
      // Focus this cluster
      this.focusedLabel = label;
      for (const e of this.entries) e.visible = e.label === label;
      this.renderList();
      this.onFocus(label);
    }
  }

  private refreshRow(label: string): void {
    const entry = this.entries.find(e => e.label === label);
    if (!entry) return;
    const oldRow = this.rowEls.get(label);
    if (!oldRow) return;
    const newRow = this.makeRow(entry);
    this.rowEls.set(label, newRow);
    oldRow.replaceWith(newRow);
  }

  private resetAll(): void {
    if (this.focusedLabel === null && this.entries.every(e => e.visible)) return;
    this.focusedLabel = null;
    for (const e of this.entries) e.visible = true;
    this.renderList();
    for (const e of this.entries) this.onToggle(e.label, true);
    this.onFocus(null);
  }

  // ─── Helpers ───

  private makeFooterBtn(text: string): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.style.cssText = [
      'flex:1',
      'background:rgba(255,255,255,0.07)',
      'border:none',
      'border-radius:3px',
      'color:rgba(255,255,255,0.5)',
      'font-size:10px',
      'padding:4px 0',
      'cursor:pointer',
      'transition:background 0.1s',
    ].join(';');
    btn.addEventListener('mouseenter', () => { btn.style.background = 'rgba(255,255,255,0.14)'; });
    btn.addEventListener('mouseleave', () => { btn.style.background = 'rgba(255,255,255,0.07)'; });
    return btn;
  }
}
