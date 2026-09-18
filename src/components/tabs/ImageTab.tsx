import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Download, Image as ImageIcon, Lock, Unlock, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { IconButton, InlineError, Pane, PaneBar, PaneBody, PaneHeader, TabShell, ToolButton } from '@/components/common';
import {
  useCommandPaletteCommands,
  useDebounce,
  useFileDropCallback,
  useTabHotkeys,
  type FileDropPayload,
} from '@/hooks';
import { LIMITS } from '@/utils/constants';
import { formatBytes } from '@/utils/resourceGuard';
import {
  IMAGE_FORMATS,
  IMAGE_FORMAT_MIME,
  decodedPixelCount,
  exceedsPixelLimit,
  formatSupportsQuality,
  lockedDimensions,
  percentChange,
  renameForFormat,
  type ImageDimensions,
  type ImageFormat,
} from '@/utils/formatters/image';

const TAB_ID = 'image';

const ACCEPTED_TYPES = 'image/png,image/jpeg,image/webp,image/avif,image/gif';

interface EncodeParams {
  width: number;
  height: number;
  format: ImageFormat;
  quality: number;
}

export function ImageTab() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bitmapRef = useRef<ImageBitmap | null>(null);
  const urlsRef = useRef<{ original: string | null; output: string | null }>({ original: null, output: null });

  const [file, setFile] = useState<File | null>(null);
  const [originalDims, setOriginalDims] = useState<ImageDimensions | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);

  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  const [aspectLocked, setAspectLocked] = useState(true);
  const [format, setFormat] = useState<ImageFormat>('jpeg');
  const [quality, setQuality] = useState(0.8);

  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [outputBlob, setOutputBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadFile = useCallback(async (picked: File) => {
    if (picked.size > LIMITS.FILE.MAX_DROP_BYTES) {
      toast.error(`“${picked.name}” is ${formatBytes(picked.size)} — the limit is ${formatBytes(LIMITS.FILE.MAX_DROP_BYTES)}.`);
      return;
    }

    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(picked, { imageOrientation: 'from-image' });
    } catch {
      toast.error(`Could not decode “${picked.name}” as an image`);
      return;
    }

    const dims: ImageDimensions = { width: bitmap.width, height: bitmap.height };
    if (exceedsPixelLimit(dims, LIMITS.INPUT.IMAGE)) {
      bitmap.close();
      const mp = (decodedPixelCount(dims) / 1_000_000).toFixed(1);
      const limitMp = Math.round(LIMITS.INPUT.IMAGE / 1_000_000);
      toast.error(
        `“${picked.name}” decodes to ${bitmap.width}×${bitmap.height} (${mp} MP) — over the ${limitMp} MP limit this tool can safely resize on the main thread.`,
      );
      return;
    }

    bitmapRef.current?.close();
    bitmapRef.current = bitmap;

    const newOriginalUrl = URL.createObjectURL(picked);
    if (urlsRef.current.original) URL.revokeObjectURL(urlsRef.current.original);
    urlsRef.current.original = newOriginalUrl;

    setFile(picked);
    setOriginalDims(dims);
    setWidth(dims.width);
    setHeight(dims.height);
    setAspectLocked(true);
    setOriginalUrl(newOriginalUrl);
    setError(null);
    toast.success(`Loaded ${picked.name}`);
  }, []);

  const handleFileDrop = useCallback(
    (payload: FileDropPayload) => {
      if (payload.kind !== 'binary') return;
      void loadFile(payload.file);
    },
    [loadFile],
  );
  useFileDropCallback(TAB_ID, handleFileDrop);

  useEffect(
    () => () => {
      bitmapRef.current?.close();
      if (urlsRef.current.original) URL.revokeObjectURL(urlsRef.current.original);
      if (urlsRef.current.output) URL.revokeObjectURL(urlsRef.current.output);
    },
    [],
  );

  // Memoized so the reference only changes when a value actually does — otherwise
  // useDebounce (which compares by reference) would never settle, re-encoding
  // on every render forever.
  const encodeParams = useMemo<EncodeParams>(
    () => ({ width, height, format, quality }),
    [width, height, format, quality],
  );
  const debounced = useDebounce(encodeParams);

  useEffect(() => {
    const bitmap = bitmapRef.current;
    if (!bitmap || debounced.width <= 0 || debounced.height <= 0) return;

    let cancelled = false;
    void (async () => {
      try {
        const canvas = new OffscreenCanvas(debounced.width, debounced.height);
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('2d context unavailable');
        ctx.drawImage(bitmap, 0, 0, debounced.width, debounced.height);
        const blob = await canvas.convertToBlob({
          type: IMAGE_FORMAT_MIME[debounced.format],
          ...(formatSupportsQuality(debounced.format) ? { quality: debounced.quality } : {}),
        });
        if (cancelled) return;

        const newOutputUrl = URL.createObjectURL(blob);
        if (urlsRef.current.output) URL.revokeObjectURL(urlsRef.current.output);
        urlsRef.current.output = newOutputUrl;

        setOutputBlob(blob);
        setOutputUrl(newOutputUrl);
        setError(null);
      } catch {
        if (!cancelled) setError('Could not render this image at the selected size and format.');
      }
    })();

    return () => {
      cancelled = true;
    };
    // `file` retriggers this on every new load even if the debounced params
    // happen to match the previous image's (e.g. re-dropping the same size).
  }, [debounced, file]);

  const applyWidth = useCallback(
    (value: number) => {
      if (!Number.isFinite(value)) return;
      if (aspectLocked && originalDims) {
        const next = lockedDimensions(originalDims, { dimension: 'width', value });
        setWidth(next.width);
        setHeight(next.height);
      } else {
        setWidth(Math.max(1, Math.round(value)));
      }
    },
    [aspectLocked, originalDims],
  );

  const applyHeight = useCallback(
    (value: number) => {
      if (!Number.isFinite(value)) return;
      if (aspectLocked && originalDims) {
        const next = lockedDimensions(originalDims, { dimension: 'height', value });
        setWidth(next.width);
        setHeight(next.height);
      } else {
        setHeight(Math.max(1, Math.round(value)));
      }
    },
    [aspectLocked, originalDims],
  );

  const handleDownload = useCallback(() => {
    if (!outputUrl || !file) return;
    const downloadName = renameForFormat(file.name, format);
    const a = document.createElement('a');
    a.href = outputUrl;
    a.download = downloadName;
    a.click();
    toast.success(`Downloaded ${downloadName}`);
  }, [outputUrl, file, format]);

  useTabHotkeys({ onFormat: handleDownload });

  const commandGetter = useCallback(
    () => [
      {
        id: 'image:choose',
        label: 'Choose image…',
        category: 'context' as const,
        icon: Upload,
        run: () => fileInputRef.current?.click(),
      },
      {
        id: 'image:download',
        label: 'Download resized image',
        category: 'context' as const,
        icon: Download,
        run: handleDownload,
      },
    ],
    [handleDownload],
  );
  useCommandPaletteCommands(TAB_ID, commandGetter);

  const handlePick = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const picked = event.target.files?.[0];
      event.target.value = '';
      if (picked) void loadFile(picked);
    },
    [loadFile],
  );

  const sizeDelta = file && outputBlob ? percentChange(file.size, outputBlob.size) : null;

  return (
    <TabShell split resizable="image">
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_TYPES}
        onChange={handlePick}
        className="sr-only"
        aria-label="Choose an image file"
      />

      <Pane bordered>
        <PaneHeader
          title="Original"
          actions={<IconButton icon={Upload} label="Choose image" onClick={() => fileInputRef.current?.click()} />}
        />
        <PaneBody scroll className="flex flex-1 items-center justify-center p-4">
          {originalUrl ? (
            <img
              src={originalUrl}
              alt="Original upload"
              className="max-h-full max-w-full rounded border border-line object-contain"
            />
          ) : (
            <div className="flex flex-col items-center gap-3 text-center text-fg-muted">
              <ImageIcon className="h-8 w-8" aria-hidden="true" />
              <p className="text-sm">Drop an image anywhere, or choose one</p>
              <p className="text-xs">.png .jpg .jpeg .webp .avif .gif</p>
              <ToolButton icon={Upload} onClick={() => fileInputRef.current?.click()}>
                Choose image
              </ToolButton>
            </div>
          )}
        </PaneBody>
        {file && originalDims && (
          <PaneBar>
            <span>
              {originalDims.width}×{originalDims.height}
            </span>
            <span>{formatBytes(file.size)}</span>
          </PaneBar>
        )}
      </Pane>

      <Pane>
        <PaneHeader title="Resized" />
        <InlineError message={error} />
        <PaneBody scroll className="space-y-4 p-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs text-fg-muted">
              Width
              <input
                type="number"
                min={1}
                value={width || ''}
                disabled={!file}
                onChange={(e) => applyWidth(Number(e.target.value))}
                className="w-24 rounded border border-line bg-surface-sunken px-2 py-1.5 font-mono text-sm text-fg outline-none focus:border-accent disabled:opacity-50"
              />
            </label>

            <IconButton
              icon={aspectLocked ? Lock : Unlock}
              label={aspectLocked ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
              onClick={() => setAspectLocked((v) => !v)}
              disabled={!file}
              className="mb-0.5"
            />

            <label className="flex flex-col gap-1 text-xs text-fg-muted">
              Height
              <input
                type="number"
                min={1}
                value={height || ''}
                disabled={!file}
                onChange={(e) => applyHeight(Number(e.target.value))}
                className="w-24 rounded border border-line bg-surface-sunken px-2 py-1.5 font-mono text-sm text-fg outline-none focus:border-accent disabled:opacity-50"
              />
            </label>

            <label className="flex flex-col gap-1 text-xs text-fg-muted">
              Format
              <select
                value={format}
                disabled={!file}
                onChange={(e) => setFormat(e.target.value as ImageFormat)}
                className="rounded border border-line bg-surface-sunken px-2 py-1.5 text-sm text-fg outline-none focus:border-accent disabled:opacity-50"
              >
                {IMAGE_FORMATS.map((f) => (
                  <option key={f} value={f}>
                    {f.toUpperCase()}
                  </option>
                ))}
              </select>
            </label>

            <ToolButton icon={Download} variant="primary" onClick={handleDownload} disabled={!outputUrl}>
              Download
            </ToolButton>
          </div>

          <label className="flex flex-col gap-1 text-xs text-fg-muted">
            Quality {formatSupportsQuality(format) ? `— ${Math.round(quality * 100)}%` : '— PNG is lossless'}
            <input
              type="range"
              min={1}
              max={100}
              value={Math.round(quality * 100)}
              disabled={!file || !formatSupportsQuality(format)}
              onChange={(e) => setQuality(Number(e.target.value) / 100)}
              className="accent-accent disabled:opacity-50"
            />
          </label>

          <div className="flex flex-1 items-center justify-center rounded border border-line bg-surface-sunken p-2 min-h-40">
            {outputUrl ? (
              <img src={outputUrl} alt="Resized preview" className="max-h-full max-w-full object-contain" />
            ) : (
              <p className="text-xs text-fg-muted">{file ? 'Rendering…' : 'Load an image to preview the result'}</p>
            )}
          </div>

          <p className="text-xs text-fg-muted">
            Re-encoding strips EXIF metadata — including GPS location — so the downloaded file carries no hidden
            data about where or when it was taken. It also drops the ICC color profile, so colors may shift
            slightly on wide-gamut (e.g. Display P3) source photos.
          </p>
        </PaneBody>
        {outputBlob && (
          <PaneBar>
            <span>
              {width}×{height}
            </span>
            <span>{formatBytes(outputBlob.size)}</span>
            {sizeDelta !== null && (
              <span className={sizeDelta <= 0 ? 'text-success' : 'text-danger'}>
                {sizeDelta > 0 ? '+' : ''}
                {sizeDelta}% vs original
              </span>
            )}
          </PaneBar>
        )}
      </Pane>
    </TabShell>
  );
}
