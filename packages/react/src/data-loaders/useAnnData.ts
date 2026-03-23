import { useEffect, useRef, useState, useCallback } from 'react';
import { LoaderWorker, type AnnDataSchema, type EmbeddingSlice, type ExpressionSlice, type ObsCategorySlice } from '@seegak/data-loaders';

export interface UseAnnDataResult {
  schema: AnnDataSchema | null;
  loading: boolean;
  error: Error | null;
  getEmbedding: (key: string) => Promise<EmbeddingSlice>;
  getExpression: (varName: string) => Promise<ExpressionSlice>;
  getObsCategory: (key: string) => Promise<ObsCategorySlice>;
}

/**
 * React hook for loading AnnData from a Zarr store URL.
 *
 * Creates a LoaderWorker internally and manages its lifecycle. The worker is
 * terminated when the component unmounts or when the `url` changes.
 *
 * The Worker script must be provided by the consuming application. Pass
 * `null` as the URL to keep the hook inactive (useful for conditional loading).
 *
 * @example
 * ```tsx
 * import LoaderWorkerImpl from '@seegak/data-loaders/worker/loader-worker-impl?worker';
 * import { LoaderWorker } from '@seegak/data-loaders';
 *
 * // Create a worker factory prop or pass a pre-built LoaderWorker
 * const { schema, loading, error, getEmbedding } = useAnnData('https://...', workerFactory);
 * ```
 *
 * For simplicity the hook accepts a `workerFactory` callback that produces a
 * Worker instance so the consumer can use their bundler's `?worker` syntax.
 */
export function useAnnData(
  url: string | null,
  workerFactory?: () => Worker,
): UseAnnDataResult {
  const [schema, setSchema] = useState<AnnDataSchema | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const loaderRef = useRef<LoaderWorker | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!url) {
      setSchema(null);
      setLoading(false);
      setError(null);
      return;
    }

    // Dispose existing worker if URL changed
    if (loaderRef.current && urlRef.current !== url) {
      loaderRef.current.dispose();
      loaderRef.current = null;
    }

    urlRef.current = url;

    // Create worker
    let loader: LoaderWorker;
    if (workerFactory) {
      loader = LoaderWorker.fromWorker(workerFactory());
    } else {
      // Fallback: attempt to load worker from default URL relative to this module.
      // Consumers should always provide a workerFactory for proper bundler support.
      loader = LoaderWorker.fromURL(
        new URL('../../../data-loaders/dist/worker/loader-worker-impl.js', import.meta.url),
      );
    }
    loaderRef.current = loader;

    setLoading(true);
    setError(null);

    loader.openAnndata(url).then((s) => {
      setSchema(s);
      setLoading(false);
    }).catch((e: unknown) => {
      setError(e instanceof Error ? e : new Error(String(e)));
      setLoading(false);
    });

    return () => {
      loader.dispose();
      loaderRef.current = null;
    };
  // Re-run when url changes; workerFactory is expected to be stable
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  const getEmbedding = useCallback(async (key: string): Promise<EmbeddingSlice> => {
    if (!loaderRef.current || !urlRef.current) {
      throw new Error('useAnnData: no active loader. Provide a valid URL first.');
    }
    return loaderRef.current.getEmbedding(urlRef.current, key);
  }, []);

  const getExpression = useCallback(async (varName: string): Promise<ExpressionSlice> => {
    if (!loaderRef.current || !urlRef.current) {
      throw new Error('useAnnData: no active loader. Provide a valid URL first.');
    }
    return loaderRef.current.getExpression(urlRef.current, varName);
  }, []);

  const getObsCategory = useCallback(async (key: string): Promise<ObsCategorySlice> => {
    if (!loaderRef.current || !urlRef.current) {
      throw new Error('useAnnData: no active loader. Provide a valid URL first.');
    }
    return loaderRef.current.getObsCategory(urlRef.current, key);
  }, []);

  return { schema, loading, error, getEmbedding, getExpression, getObsCategory };
}
