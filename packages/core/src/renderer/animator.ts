/**
 * Animation system for smooth data transitions.
 * Supports easing functions and interruptible animations.
 */

export type EasingFn = (t: number) => number;

// ─── Built-in Easings ───

export const Easing = {
  linear: (t: number) => t,
  easeInQuad: (t: number) => t * t,
  easeOutQuad: (t: number) => t * (2 - t),
  easeInOutQuad: (t: number) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  easeInCubic: (t: number) => t * t * t,
  easeOutCubic: (t: number) => (--t) * t * t + 1,
  easeInOutCubic: (t: number) => t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
  easeOutElastic: (t: number) => {
    if (t === 0 || t === 1) return t;
    return Math.pow(2, -10 * t) * Math.sin((t - 0.1) * 5 * Math.PI) + 1;
  },
} as const;

// ─── Animation ───

export interface AnimationOptions {
  duration?: number;       // ms, default 300
  easing?: EasingFn;
  onUpdate: (progress: number) => void;
  onComplete?: () => void;
}

interface ActiveAnimation {
  id: number;
  startTime: number;
  duration: number;
  easing: EasingFn;
  onUpdate: (progress: number) => void;
  onComplete?: () => void;
  cancelled: boolean;
}

export class Animator {
  private animations = new Map<number, ActiveAnimation>();
  private nextId = 0;
  private rafId = 0;
  private running = false;

  /**
   * Start a new animation. Returns an ID to cancel it.
   */
  animate(options: AnimationOptions): number {
    const id = this.nextId++;
    const anim: ActiveAnimation = {
      id,
      startTime: performance.now(),
      duration: options.duration ?? 300,
      easing: options.easing ?? Easing.easeOutCubic,
      onUpdate: options.onUpdate,
      onComplete: options.onComplete,
      cancelled: false,
    };

    this.animations.set(id, anim);

    if (!this.running) {
      this.running = true;
      this.tick();
    }

    return id;
  }

  /**
   * Cancel a running animation.
   */
  cancel(id: number): void {
    const anim = this.animations.get(id);
    if (anim) {
      anim.cancelled = true;
      this.animations.delete(id);
    }
  }

  /**
   * Cancel all running animations.
   */
  cancelAll(): void {
    for (const [, anim] of this.animations) {
      anim.cancelled = true;
    }
    this.animations.clear();
    this.running = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  private tick = (): void => {
    if (!this.running || this.animations.size === 0) {
      this.running = false;
      return;
    }

    const now = performance.now();
    const toRemove: number[] = [];

    for (const [id, anim] of this.animations) {
      if (anim.cancelled) {
        toRemove.push(id);
        continue;
      }

      const elapsed = now - anim.startTime;
      const rawProgress = Math.min(elapsed / anim.duration, 1);
      const easedProgress = anim.easing(rawProgress);

      anim.onUpdate(easedProgress);

      if (rawProgress >= 1) {
        anim.onComplete?.();
        toRemove.push(id);
      }
    }

    for (const id of toRemove) {
      this.animations.delete(id);
    }

    if (this.animations.size > 0) {
      this.rafId = requestAnimationFrame(this.tick);
    } else {
      this.running = false;
    }
  };

  /**
   * Animate a Float32Array from current values to target values.
   * Useful for transitioning scatter point positions, bar heights, etc.
   */
  animateArray(
    current: Float32Array,
    target: Float32Array,
    options: Omit<AnimationOptions, 'onUpdate'> & {
      onUpdate: (interpolated: Float32Array) => void;
    },
  ): number {
    const from = new Float32Array(current); // snapshot
    const result = new Float32Array(current.length);

    return this.animate({
      duration: options.duration,
      easing: options.easing,
      onUpdate: (t) => {
        for (let i = 0; i < result.length; i++) {
          result[i] = from[i] + (target[i] - from[i]) * t;
        }
        options.onUpdate(result);
      },
      onComplete: options.onComplete,
    });
  }

  /**
   * Animate a single number.
   */
  animateValue(
    from: number,
    to: number,
    options: Omit<AnimationOptions, 'onUpdate'> & {
      onUpdate: (value: number) => void;
    },
  ): number {
    return this.animate({
      duration: options.duration,
      easing: options.easing,
      onUpdate: (t) => {
        options.onUpdate(from + (to - from) * t);
      },
      onComplete: options.onComplete,
    });
  }

  get activeCount(): number {
    return this.animations.size;
  }

  destroy(): void {
    this.cancelAll();
  }
}
