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
import { readImageDimensionsFromHeader } from '@/utils/imageHeaderDimensions';
import {
  IMAGE_FORMATS,
  IMAGE_FORMAT_MIME,
  chooseEncodePath,
  decodedPixelCount,
  exceedsPixelLimit,
  formatSupportsQuality,
  lockedDimensions,
  percentChange,
  renameForFormat,
  type EncodePath,
  type ImageDimensions,
  type ImageFormat,
} from '@/utils/formatters/image';

const TAB_ID = 'image';

const ACCEPTED_TYPES = 'image/png,image/jpeg,image/webp,image/avif,image/gif';

/**
 * How much of the file is read for the header-based dimension check. Generous
 * for JPEG's marker walk (real EXIF/ICC/XMP segments can run tens of KB
 * before the SOF marker) while staying utterly cheap relative to the 25MB
 * drop limit — this is a bounded prefix read, never the whole file.
 */
const HEADER_PREFIX_BYTES = 256 * 1024;

interface EncodeParams {
  width: number;
  height: number;
  format: ImageFormat;
  quality: number;
}

/**
 * Probed once per session, not per render — browser capability doesn't change
 * mid-session, and this decides how (or whether) the encode effect below can
 * turn a resized bitmap into a downloadable file at all.
 */
const ENCODE_PATH: EncodePath = chooseEncodePath(
  typeof OffscreenCanvas !== 'undefined' && typeof OffscreenCanvas.prototype.convertToBlob === 'function',
  typeof HTMLCanvasElement !== 'undefined' && typeof HTMLCanvasElement.prototype.toBlob === 'function',
);

/** Wraps the callback-based `toBlob` in the same `Promise<Blob>` shape `OffscreenCanvas.convertToBlob` already returns. */
function canvasToBlob(canvas: HTMLCanvasElement, options: { type: string; quality?: number }): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('toBlob returned null'))),
      options.type,
      options.quality,
    );
  });
}

/**
 * JPEG has no alpha channel, so a canvas encodes its transparent pixels as
 * black. Flatten onto white first so a transparent PNG converts to a sensible
 * JPEG; PNG and WebP keep their transparency.
 */
function drawBitmap(
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
  bitmap: ImageBitmap,
  width: number,
  height: number,
  format: ImageFormat,
): void {
  if (format === 'jpeg') {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
}

export function ImageTab() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const downloadAnchorRef = useRef<HTMLAnchorElement>(null);
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

    // Reject an oversized image from its header alone, before ever decoding
    // it: createImageBitmap fully decodes into memory before its own
    // dimensions are knowable, so checking the ceiling only after that decode
    // is too late for a small, highly-compressed file at extreme pixel
    // dimensions. PNG/JPEG/GIF/WebP headers all carry dimensions cheaply;
    // AVIF's ISOBMFF container doesn't have a fixed offset to read them from
    // and falls through to the decode-then-check below, same as before this
    // existed — see imageHeaderDimensions.ts for exactly what's covered.
    const headerBytes = new Uint8Array(await picked.slice(0, HEADER_PREFIX_BYTES).arrayBuffer());
    const headerDims = readImageDimensionsFromHeader(headerBytes);
    if (headerDims && exceedsPixelLimit(headerDims, LIMITS.INPUT.IMAGE)) {
      const mp = (decodedPixelCount(headerDims) / 1_000_000).toFixed(1);
      const limitMp = Math.round(LIMITS.INPUT.IMAGE / 1_000_000);
      toast.error(
        `“${picked.name}” is ${headerDims.width}×${headerDims.height} (${mp} MP) — over the ${limitMp} MP limit this tool can safely resize on the main thread.`,
      );
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

    // Whatever the previous params produced no longer matches width/height/
    // format/quality the instant this effect fires again — clear it up front
    // rather than only on success, so a failed re-encode can never leave a
    // stale preview/download sitting under a now-wrong label.
    if (urlsRef.current.output) {
      URL.revokeObjectURL(urlsRef.current.output);
      urlsRef.current.output = null;
    }
    setOutputBlob(null);
    setOutputUrl(null);
    setError(null);

    // The input is capped at LIMITS.INPUT.IMAGE; an upscale target must be too,
    // or a typed width of 50000 asks the main thread for a multi-gigapixel canvas.
    if (exceedsPixelLimit({ width: debounced.width, height: debounced.height }, LIMITS.INPUT.IMAGE)) {
      const limitMp = Math.round(LIMITS.INPUT.IMAGE / 1_000_000);
      setError(
        `${debounced.width}×${debounced.height} is over the ${limitMp} MP limit this tool can safely resize on the main thread — reduce the dimensions.`,
      );
      return;
    }

    if (ENCODE_PATH === 'none') {
      setError(
        'This browser can’t resize or re-encode images in this tab (no OffscreenCanvas or canvas.toBlob support) — try a recent Chrome, Firefox, or Safari.',
      );
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const blobOptions = {
          type: IMAGE_FORMAT_MIME[debounced.format],
          ...(formatSupportsQuality(debounced.format) ? { quality: debounced.quality } : {}),
        };

        let blob: Blob;
        if (ENCODE_PATH === 'offscreen') {
          const canvas = new OffscreenCanvas(debounced.width, debounced.height);
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('2d context unavailable');
          drawBitmap(ctx, bitmap, debounced.width, debounced.height, debounced.format);
          blob = await canvas.convertToBlob(blobOptions);
        } else {
          const canvas = document.createElement('canvas');
          canvas.width = debounced.width;
          canvas.height = debounced.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('2d context unavailable');
          drawBitmap(ctx, bitmap, debounced.width, debounced.height, debounced.format);
          blob = await canvasToBlob(canvas, blobOptions);
        }
        if (cancelled) return;

        const newOutputUrl = URL.createObjectURL(blob);
        if (urlsRef.current.output) URL.revokeObjectURL(urlsRef.current.output);
        urlsRef.current.output = newOutputUrl;

        setOutputBlob(blob);
        setOutputUrl(newOutputUrl);
        setError(null);
      } catch (caught) {
        if (cancelled) return;
        console.error('[dev-xray] image encode failed:', caught);
        const message = caught instanceof Error ? caught.message : String(caught);
        setError(`Could not encode as ${debounced.format.toUpperCase()}: ${message}`);
        toast.error(`Could not re-encode as ${debounced.format.toUpperCase()} — ${message}`);
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
    if (!outputUrl || !file || !downloadAnchorRef.current) return;
    const downloadName = renameForFormat(file.name, format);
    downloadAnchorRef.current.href = outputUrl;
    downloadAnchorRef.current.download = downloadName;
    downloadAnchorRef.current.click();
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
  // AVIF/GIF can be loaded and previewed, but browsers can't reliably canvas-encode
  // AVIF and re-saving a GIF here would lose its animation anyway — Format only
  // ever offers the three formats above. Say so rather than leaving it unexplained.
  const outputFormatUnsupported = file ? file.type === 'image/avif' || file.type === 'image/gif' : false;

  return (
    <>
      {/*
        These two hidden controls must live outside TabShell: its resizable
        variant destructures exactly two children as the left/right panes
        (`const [first, second] = Children.toArray(children)`), so any extra
        sibling here silently bumps a real Pane out of the pair and it never
        renders at all.
      */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_TYPES}
        onChange={handlePick}
        className="sr-only"
        aria-label="Choose an image file"
      />
      <a ref={downloadAnchorRef} className="sr-only" aria-hidden="true" tabIndex={-1} />

      <TabShell split resizable="image">
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
  
            {outputFormatUnsupported && (
              <p className="text-xs text-fg-muted">
                This tool can't save back to AVIF or GIF — pick JPEG, PNG, or WebP for the download.
              </p>
            )}
  
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
    </>
  );
}
