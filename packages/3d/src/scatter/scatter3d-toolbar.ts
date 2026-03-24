/**
 * 3D Scatter toolbar — draggable floating panel with
 * flatten toggle, point size slider, and reset camera button.
 */

export interface Scatter3DToolbarOptions {
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  initialPointSize?: number;
  initialFlatten?: boolean;
}

export class Scatter3DToolbar {
  private el: HTMLElement;
  private flattenCheckbox: HTMLInputElement;
  private sizeSlider: HTMLInputElement;
  private sizeLabel: HTMLSpanElement;

  private onFlattenChange: (flatten: boolean) => void;
  private onPointSizeChange: (size: number) => void;
  private onResetCamera: () => void;

  // Drag state
  private isDragging = false;
  private dragOffsetX = 0;
  private dragOffsetY = 0;

  constructor(
    container: HTMLElement,
    callbacks: {
      onFlattenChange: (flatten: boolean) => void;
      onPointSizeChange: (size: number) => void;
      onResetCamera: () => void;
    },
    options: Scatter3DToolbarOptions = {},
  ) {
    this.onFlattenChange = callbacks.onFlattenChange;
    this.onPointSizeChange = callbacks.onPointSizeChange;
    this.onResetCamera = callbacks.onResetCamera;

    const pos = options.position ?? 'top-left';

    this.el = document.createElement('div');
    this.el.style.cssText = [
      'position:absolute',
      pos.includes('right') ? 'right:8px' : 'left:8px',
      pos.includes('bottom') ? 'bottom:8px' : 'top:8px',
      'display:flex',
      'flex-direction:column',
      'gap:6px',
      'z-index:10',
      'background:rgba(20,20,20,0.82)',
      'border:1px solid rgba(255,255,255,0.12)',
      'border-radius:6px',
      'padding:8px 10px',
      'backdrop-filter:blur(6px)',
      'user-select:none',
      'min-width:140px',
    ].join(';');

    // ─── Drag Handle ───
    const handle = document.createElement('div');
    handle.style.cssText = [
      'display:flex',
      'justify-content:center',
      'align-items:center',
      'padding:0 0 4px',
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

    // ─── Flatten Toggle ───
    const flattenRow = document.createElement('label');
    flattenRow.style.cssText = 'display:flex;align-items:center;gap:6px;cursor:pointer;font-size:11px;color:rgba(200,200,200,0.85);';

    this.flattenCheckbox = document.createElement('input');
    this.flattenCheckbox.type = 'checkbox';
    this.flattenCheckbox.checked = options.initialFlatten ?? false;
    this.flattenCheckbox.style.cssText = 'accent-color:#3b82f6;margin:0;cursor:pointer;';
    this.flattenCheckbox.addEventListener('change', () => {
      this.onFlattenChange(this.flattenCheckbox.checked);
    });

    flattenRow.appendChild(this.flattenCheckbox);
    flattenRow.appendChild(document.createTextNode('Flatten 2D'));
    this.el.appendChild(flattenRow);

    // ─── Point Size Slider ───
    const sizeRow = document.createElement('div');
    sizeRow.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:11px;color:rgba(200,200,200,0.85);';

    const sizeText = document.createElement('span');
    sizeText.textContent = 'Size';
    sizeText.style.cssText = 'flex-shrink:0;';

    this.sizeSlider = document.createElement('input');
    this.sizeSlider.type = 'range';
    this.sizeSlider.min = '1';
    this.sizeSlider.max = '50';
    this.sizeSlider.value = String(options.initialPointSize ?? 4);
    this.sizeSlider.style.cssText = 'flex:1;height:4px;accent-color:#3b82f6;cursor:pointer;';
    this.sizeSlider.addEventListener('input', () => {
      const val = Number(this.sizeSlider.value);
      this.sizeLabel.textContent = String(val);
      this.onPointSizeChange(val);
    });

    this.sizeLabel = document.createElement('span');
    this.sizeLabel.textContent = String(options.initialPointSize ?? 4);
    this.sizeLabel.style.cssText = 'min-width:16px;text-align:right;font-family:monospace;font-size:10px;color:rgba(200,200,200,0.5);';

    sizeRow.appendChild(sizeText);
    sizeRow.appendChild(this.sizeSlider);
    sizeRow.appendChild(this.sizeLabel);
    this.el.appendChild(sizeRow);

    // ─── Reset Camera Button ───
    const resetBtn = document.createElement('button');
    resetBtn.textContent = 'Reset Camera';
    resetBtn.style.cssText = [
      'background:rgba(255,255,255,0.07)',
      'border:none',
      'border-radius:4px',
      'color:rgba(200,200,200,0.6)',
      'font-size:10px',
      'padding:5px 0',
      'cursor:pointer',
      'transition:background 0.1s',
    ].join(';');
    resetBtn.addEventListener('mouseenter', () => { resetBtn.style.background = 'rgba(255,255,255,0.14)'; });
    resetBtn.addEventListener('mouseleave', () => { resetBtn.style.background = 'rgba(255,255,255,0.07)'; });
    resetBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onResetCamera();
    });
    this.el.appendChild(resetBtn);

    container.appendChild(this.el);
  }

  // ─── Public API ───

  setFlatten(v: boolean): void {
    this.flattenCheckbox.checked = v;
  }

  setPointSize(v: number): void {
    this.sizeSlider.value = String(v);
    this.sizeLabel.textContent = String(v);
  }

  show(): void { this.el.style.display = 'flex'; }
  hide(): void { this.el.style.display = 'none'; }

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
    const parent = this.el.parentElement!;
    const cr = parent.getBoundingClientRect();
    const tw = this.el.offsetWidth;
    const th = this.el.offsetHeight;
    const x = Math.max(0, Math.min(cr.width - tw, e.clientX - cr.left - this.dragOffsetX));
    const y = Math.max(0, Math.min(cr.height - th, e.clientY - cr.top - this.dragOffsetY));
    this.el.style.left = `${x}px`;
    this.el.style.top = `${y}px`;
    this.el.style.right = 'auto';
    this.el.style.bottom = 'auto';
  };

  private onDragEnd = (): void => {
    this.isDragging = false;
    const handle = this.el.firstElementChild as HTMLElement;
    if (handle) handle.style.cursor = 'grab';
    document.removeEventListener('mousemove', this.onDragMove);
    document.removeEventListener('mouseup', this.onDragEnd);
  };

  destroy(): void {
    document.removeEventListener('mousemove', this.onDragMove);
    document.removeEventListener('mouseup', this.onDragEnd);
    this.el.remove();
  }
}
