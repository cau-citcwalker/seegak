/**
 * S3-compatible range-request source.
 *
 * Works with AWS S3, MinIO, Cloudflare R2, or any HTTP server that
 * supports Range headers.  No AWS SDK dependency — uses the fetch API only.
 */

export interface S3SourceOptions {
  /** Custom endpoint base URL for MinIO, R2, etc. (e.g. https://my-minio.internal) */
  endpoint?: string;
  /** AWS region (used when constructing the default AWS endpoint). */
  region?: string;
  /** S3 bucket name. */
  bucket: string;
  /** Optional key prefix (folder path) prepended to every relative path. */
  prefix?: string;
}

export class S3Source {
  private readonly endpoint: string;
  private readonly bucket: string;
  private readonly prefix: string;

  constructor(options: S3SourceOptions) {
    this.bucket = options.bucket;
    this.prefix = options.prefix ? options.prefix.replace(/\/$/, '') : '';

    if (options.endpoint) {
      // Custom endpoint (MinIO, R2, etc.)
      this.endpoint = options.endpoint.replace(/\/$/, '');
    } else {
      // Default AWS S3 virtual-hosted-style URL
      const region = options.region ?? 'us-east-1';
      this.endpoint = `https://${options.bucket}.s3.${region}.amazonaws.com`;
    }
  }

  /**
   * Resolve a relative path to its full S3 URL.
   *
   * If `path` already starts with `http://` or `https://` it is returned
   * unchanged so callers can mix absolute and relative URLs freely.
   */
  resolveUrl(path: string): string {
    if (/^https?:\/\//i.test(path)) return path;

    const cleanPath = path.replace(/^\//, '');
    const keyPath = this.prefix ? `${this.prefix}/${cleanPath}` : cleanPath;

    // For custom endpoints (MinIO-style) the bucket is in the path.
    // For AWS virtual-hosted-style the bucket is in the host (already in endpoint).
    if (this.endpoint.includes('amazonaws.com')) {
      return `${this.endpoint}/${keyPath}`;
    }
    return `${this.endpoint}/${this.bucket}/${keyPath}`;
  }

  /**
   * Fetch a byte range `[start, end)` from `url`.
   * Uses the HTTP `Range` header for efficient partial reads.
   */
  async fetchRange(url: string, start: number, end: number): Promise<ArrayBuffer> {
    const resolvedUrl = this.resolveUrl(url);
    const res = await fetch(resolvedUrl, {
      headers: {
        Range: `bytes=${start}-${end - 1}`,
      },
    });

    if (!res.ok && res.status !== 206) {
      throw new Error(
        `S3Source.fetchRange: HTTP ${res.status} for ${resolvedUrl} range ${start}-${end - 1}`,
      );
    }

    return res.arrayBuffer();
  }

  /**
   * Probe whether `url` is accessible (HTTP HEAD request).
   * Returns `true` if the server responds with a 2xx status.
   */
  async probe(url: string): Promise<boolean> {
    const resolvedUrl = this.resolveUrl(url);
    try {
      const res = await fetch(resolvedUrl, { method: 'HEAD' });
      return res.ok;
    } catch {
      return false;
    }
  }
}
