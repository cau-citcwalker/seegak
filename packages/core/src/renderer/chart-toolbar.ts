// ─── Tool Types ───

export type ToolType = 'pan' | 'draw' | 'line' | 'box-select' | 'lasso' | 'eraser';

/** Action buttons (non-toggle, fire-and-forget) */
export type ActionType = 'save-png' | 'save-svg';

/** Preset tool sets */
export type ToolPreset = 'full' | 'standard' | 'minimal';

const PRESET_TOOLS: Record<ToolPreset, ToolType[]> = {
  full:     ['pan', 'draw', 'line', 'box-select', 'lasso', 'eraser'],
  standard: ['pan', 'box-select', 'lasso', 'eraser'],
  minimal:  ['pan'],
};

const PRESET_ACTIONS: Record<ToolPreset, ActionType[]> = {
  full:     ['save-png', 'save-svg'],
  standard: ['save-png'],
  minimal:  [],
};

// ─── Icons (inline SVG) ───

const ICONS: Record<ToolType | ActionType, string> = {
  pan: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M10 2v16M2 10h16"/>
    <path d="M6.5 6.5L3 10l3.5 3.5M13.5 6.5L17 10l-3.5 3.5"/>
  </svg>`,

  draw: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 16l3.5-.5 8-8-3-3-8 8L4 16z"/>
    <path d="M12.5 4.5l3 3"/>
  </svg>`,

  line: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
    <line x1="4" y1="16" x2="16" y2="4"/>
    <circle cx="4" cy="16" r="2" fill="currentColor" stroke="none"/>
    <circle cx="16" cy="4" r="2" fill="currentColor" stroke="none"/>
  </svg>`,

  'box-select': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
    <rect x="3" y="3" width="14" height="14" rx="1" stroke-dasharray="3.5 2.5"/>
  </svg>`,

  lasso: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M9 4C5.5 4 3 6.5 3 9.5c0 3 2 5 5.5 5 1.5 0 3-.5 4-1.5" stroke-dasharray="2.5 2"/>
    <path d="M15.5 13.5C17 12 17.5 10 17.5 8.5" stroke-dasharray="2.5 2"/>
    <path d="M12.5 13l3 1.5.5 3-3.5-4.5z" fill="currentColor" stroke="none"/>
  </svg>`,

  eraser: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 17h14"/>
    <path d="M5.5 17L3 14.5l7-7 5 5-4.5 4.5"/>
    <path d="M10 7.5l2.5-2.5 5 5-2.5 2.5"/>
  </svg>`,

  'save-png': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 14v2a1 1 0 001 1h12a1 1 0 001-1v-2"/>
    <path d="M10 3v10"/>
    <path d="M6.5 9.5L10 13l3.5-3.5"/>
  </svg>`,

  'save-svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 14v2a1 1 0 001 1h12a1 1 0 001-1v-2"/>
    <path d="M10 3v10"/>
    <path d="M6.5 9.5L10 13l3.5-3.5"/>
    <text x="14" y="8" font-size="5" fill="currentColor" stroke="none" font-weight="bold">S</text>
  </svg>`,
};

const LABELS: Record<ToolType | ActionType, string> = {
  pan: 'Pan',
  draw: 'Draw',
  line: 'Line',
  'box-select': 'Box Select',
  lasso: 'Lasso',
  eraser: 'Eraser',
  'save-png': 'Save PNG',
  'save-svg': 'Save SVG',
};

// ─── ChartToolbar ───

export interface ChartToolbarOptions {
  /** Preset: 'full' | 'standard' | 'minimal', or omit to use custom tools */
  preset?: ToolPreset;
  /** Custom tool list (ignored when preset is set) */
  tools?: ToolType[];
  /** Custom action list (ignored when preset is set) */
  actions?: ActionType[];
  defaultTool?: ToolType;
  position?: 'top-left' | 'top-right';
}

export class ChartToolbar {
  private el: HTMLElement;
  private buttons = new Map<ToolType, HTMLButtonElement>();
  private _activeTool: ToolType;
  private onChange: (tool: ToolType) => void;
  private onAction: ((action: ActionType) => void) | null = null;

  // Drag state
  private isDragging = false;
  private dragOffsetX = 0;
  private dragOffsetY = 0;

  constructor(
    container: HTMLElement,
    options: ChartToolbarOptions = {},
    onChange: (tool: ToolType) => void,
    onAction?: (action: ActionType) => void,
  ) {
    let tools: ToolType[];
    let actions: ActionType[];

    if (options.preset) {
      tools = PRESET_TOOLS[options.preset];
      actions = PRESET_ACTIONS[options.preset];
    } else {
      tools = options.tools ?? PRESET_TOOLS.standard;
      actions = options.actions ?? PRESET_ACTIONS.standard;
    }

    this._activeTool = options.defaultTool ?? 'pan';
    this.onChange = onChange;
    this.onAction = onAction ?? null;

    this.el = document.createElement('div');
    const pos = options.position ?? 'top-left';
    this.el.style.cssText = [
      'position:absolute',
      pos === 'top-right' ? 'right:8px' : 'left:8px',
      'top:8px',
      'display:flex',
      'flex-direction:column',
      'gap:4px',
      'z-index:10',
      'background:rgba(20,20,20,0.82)',
      'border:1px solid rgba(255,255,255,0.12)',
      'border-radius:6px',
      'padding:4px',
      'backdrop-filter:blur(6px)',
      'user-select:none',
    ].join(';');

    // ─── Drag Handle ───
    const handle = document.createElement('div');
    handle.style.cssText = [
      'display:flex',
      'justify-content:center',
      'align-items:center',
      'padding:2px 0 4px',
      'cursor:grab',
      'color:rgba(255,255,255,0.25)',
      'font-size:10px',
      'letter-spacing:2px',
      'line-height:1',
    ].join(';');
    handle.textContent = '⠿⠿';
    handle.title = 'Drag to move';
    handle.addEventListener('mousedown', this.onDragStart);
    this.el.appendChild(handle);

    // ─── Tool buttons (toggle) ───
    for (const tool of tools) {
      const btn = this.makeButton(ICONS[tool], LABELS[tool]);
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.setTool(tool);
      });
      this.buttons.set(tool, btn);
      this.el.appendChild(btn);
    }

    // ─── Separator ───
    if (actions.length > 0) {
      const sep = document.createElement('div');
      sep.style.cssText = 'height:1px;background:rgba(255,255,255,0.1);margin:2px 4px;';
      this.el.appendChild(sep);
    }

    // ─── Action buttons (fire-and-forget) ───
    for (const action of actions) {
      const btn = this.makeButton(ICONS[action], LABELS[action]);
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.onAction?.(action);
      });
      this.el.appendChild(btn);
    }

    container.appendChild(this.el);
    this.applyStyles();
  }

  get activeTool(): ToolType { return this._activeTool; }

  setTool(tool: ToolType): void {
    if (this._activeTool === tool) return;
    this._activeTool = tool;
    this.applyStyles();
    this.onChange(tool);
  }

  // ─── Drag ───

  private onDragStart = (e: MouseEvent): void => {
    e.preventDefault();
    this.isDragging = true;
    const rect = this.el.getBoundingClientRect();
    this.dragOffsetX = e.clientX - rect.left;
    this.dragOffsetY = e.clientY - rect.top;
    (e.currentTarget as HTMLElement).style.cursor = 'grabbing';
    document.addEventListener('mousemove', this.onDragMove);
    document.addEventListener('mouseup', this.onDragEnd);
  };

  private onDragMove = (e: MouseEvent): void => {
    if (!this.isDragging) return;
    const container = this.el.parentElement!;
    const cr = container.getBoundingClientRect();
    const tw = this.el.offsetWidth;
    const th = this.el.offsetHeight;
    const x = Math.max(0, Math.min(cr.width - tw, e.clientX - cr.left - this.dragOffsetX));
    const y = Math.max(0, Math.min(cr.height - th, e.clientY - cr.top - this.dragOffsetY));
    this.el.style.left = `${x}px`;
    this.el.style.top = `${y}px`;
    this.el.style.right = 'auto';
  };

  private onDragEnd = (): void => {
    this.isDragging = false;
    const handle = this.el.firstElementChild as HTMLElement;
    if (handle) handle.style.cursor = 'grab';
    document.removeEventListener('mousemove', this.onDragMove);
    document.removeEventListener('mouseup', this.onDragEnd);
  };

  private makeButton(icon: string, title: string): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.innerHTML = icon;
    btn.title = title;
    btn.style.cssText = [
      'width:28px',
      'height:28px',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'border:none',
      'border-radius:4px',
      'cursor:pointer',
      'background:transparent',
      'color:rgba(200,200,200,0.75)',
      'padding:4px',
      'transition:background 0.12s,color 0.12s',
      'flex-shrink:0',
    ].join(';');

    btn.addEventListener('mouseenter', () => {
      if (!this.buttons.has(btn.dataset.tool as ToolType) || this._activeTool !== btn.dataset.tool) {
        btn.style.background = 'rgba(255,255,255,0.08)';
      }
    });
    btn.addEventListener('mouseleave', () => {
      if (!this.buttons.has(btn.dataset.tool as ToolType) || this._activeTool !== btn.dataset.tool) {
        btn.style.background = 'transparent';
      }
    });

    return btn;
  }

  private applyStyles(): void {
    for (const [tool, btn] of this.buttons) {
      if (tool === this._activeTool) {
        btn.style.background = 'rgba(96,165,250,0.25)';
        btn.style.color = 'rgba(147,210,255,1)';
      } else {
        btn.style.background = 'transparent';
        btn.style.color = 'rgba(200,200,200,0.75)';
      }
    }
  }

  destroy(): void {
    document.removeEventListener('mousemove', this.onDragMove);
    document.removeEventListener('mouseup', this.onDragEnd);
    this.el.remove();
  }
}
