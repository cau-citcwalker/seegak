import {
  type Mat4,
  mat4LookAt,
  mat4RotateX,
  mat4RotateY,
  mat4Identity,
} from './mat4.js';

/**
 * Arcball camera controller.
 *
 * Tracks yaw (rotY) and pitch (rotX) angles plus a zoom distance and a world-
 * space target point.  Call handleMouseDrag / handleWheel from pointer events
 * and use getViewMatrix() to obtain the current view matrix.
 */
export class ArcballCamera {
  private rotX: number = 0;
  private rotY: number = 0;
  private distance: number = 3;
  private target: [number, number, number] = [0, 0, 0];

  /**
   * Apply a mouse-drag delta (in screen pixels) to rotate the camera.
   * @param dx  horizontal drag delta (pixels)
   * @param dy  vertical drag delta (pixels)
   * @param sensitivity  radians per pixel (default 0.005)
   */
  handleMouseDrag(dx: number, dy: number, sensitivity: number = 0.005): void {
    this.rotY -= dx * sensitivity;
    this.rotX += dy * sensitivity;
    // Clamp pitch so the camera doesn't flip over
    this.rotX = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.rotX));
  }

  /**
   * Pan the camera target in screen-space (right-drag).
   * Moves the target along the camera's local right and up axes.
   */
  handlePan(dx: number, dy: number, sensitivity: number = 0.002): void {
    const cosY = Math.cos(this.rotY);
    const sinY = Math.sin(this.rotY);

    // Camera right vector (perpendicular to look direction in xz plane)
    const rightX = cosY;
    const rightZ = -sinY;

    // Camera up is approximately world Y for moderate pitch
    const scale = this.distance * sensitivity;
    this.target[0] -= rightX * dx * scale;
    this.target[2] -= rightZ * dx * scale;
    this.target[1] += dy * scale;
  }

  /**
   * Apply a wheel delta to zoom in/out.
   * @param delta  positive = zoom out, negative = zoom in (e.g. WheelEvent.deltaY)
   */
  handleWheel(delta: number): void {
    const factor = delta > 0 ? 1.1 : 0.9;
    this.distance = Math.max(0.1, Math.min(100, this.distance * factor));
  }

  /**
   * Compute the current view matrix from the stored rotation, distance
   * and target.  The eye orbits around `target` at radius `distance`.
   */
  getViewMatrix(): Mat4 {
    // Build eye position from spherical coordinates
    // rotY = azimuth around Y,  rotX = elevation (pitch)
    const cosX = Math.cos(this.rotX);
    const sinX = Math.sin(this.rotX);
    const cosY = Math.cos(this.rotY);
    const sinY = Math.sin(this.rotY);

    const eye: [number, number, number] = [
      this.target[0] + this.distance * cosX * sinY,
      this.target[1] + this.distance * sinX,
      this.target[2] + this.distance * cosX * cosY,
    ];

    // Build a local up vector that avoids gimbal lock at the poles
    // We use the world Y axis rotated by the pitch
    const upX = -sinX * sinY;
    const upY =  cosX;
    const upZ = -sinX * cosY;
    const upLen = Math.sqrt(upX * upX + upY * upY + upZ * upZ) || 1;
    const up: [number, number, number] = [upX / upLen, upY / upLen, upZ / upLen];

    return mat4LookAt(eye, this.target, up);
  }

  /** Get the current orbit distance. */
  getDistance(): number { return this.distance; }

  /**
   * Set the camera's orbit distance.
   */
  setDistance(d: number): void {
    this.distance = Math.max(0.1, d);
  }

  /**
   * Set the point the camera orbits around.
   */
  setTarget(t: [number, number, number]): void {
    this.target = [...t];
  }

  /** Reset rotation and distance to initial values. */
  reset(): void {
    this.rotX = 0;
    this.rotY = 0;
    this.distance = 3;
    this.target = [0, 0, 0];
  }
}
