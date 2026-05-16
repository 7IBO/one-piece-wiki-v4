/**
 * Drag-and-drop image uploader. The browser:
 *  1. Asks the dashboard API for a presigned PUT URL on R2.
 *  2. PUTs the file bytes straight to Cloudflare (bypassing our API,
 *     zero egress on our side).
 *  3. Receives the public URL and surfaces it back to the form via
 *     `onUploaded`.
 *
 * Used by the `url` field on the `image` entity-type (see inputs.tsx
 * → UrlInput → falls through to this when allowed). Also usable as a
 * standalone input if we ever expose a "create image entity from this
 * upload" affordance.
 */
import { Button } from '@/components/ui/button';
import { ImagePlus, Loader2, Trash2, Upload } from 'lucide-react';
import { type JSX, useRef, useState } from 'react';
import { api, resolveImageUrl } from '../api';

/**
 * Metadata the uploader can derive from the picked file. `format`
 * comes from the MIME type (mapped to the `image-formats` vocab
 * ids); `width` / `height` come from decoding the image in the
 * browser. SVGs and uncommon types may decode without dimensions —
 * `width` / `height` are left undefined in that case, and dependent
 * fields just stay blank for the maintainer to fill manually.
 */
export type ImageMeta = {
  readonly url: string;
  readonly format?: string;
  readonly width?: number;
  readonly height?: number;
  readonly sizeBytes: number;
};

const MIME_TO_FORMAT: Record<string, string> = {
  'image/webp': 'webp',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
};

async function decodeDimensions(
  file: File,
): Promise<{ width: number; height: number; } | undefined> {
  // Browser-native: cheaper + handles every supported format that
  // <img> can render. We dispose of the object URL whether the load
  // resolved or failed, so no memory leak.
  return await new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    const cleanup = (): void => URL.revokeObjectURL(objectUrl);
    img.addEventListener(
      'load',
      () => {
        const out = { width: img.naturalWidth, height: img.naturalHeight };
        cleanup();
        resolve(out.width > 0 && out.height > 0 ? out : undefined);
      },
      { once: true },
    );
    img.addEventListener(
      'error',
      () => {
        cleanup();
        resolve(undefined);
      },
      { once: true },
    );
    img.src = objectUrl;
  });
}

export type ImageUploadProps = {
  value: string | undefined;
  onChange: (next: string) => void;
  /**
   * Optional sibling-field auto-fill hook. Fires AFTER the upload
   * succeeds, with the file's full metadata. The form decides which
   * sibling properties (format / image_width / image_height) to
   * touch — and crucially only touches empty ones, so a maintainer's
   * manual override is never clobbered.
   */
  onUploaded?: (meta: ImageMeta) => void;
  disabled?: boolean | undefined;
};

export function ImageUpload(
  { value, onChange, onUploaded, disabled }: ImageUploadProps,
): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  async function handleFile(file: File): Promise<void> {
    setError(null);
    setBusy(true);
    setProgress(0);
    try {
      // Decode dimensions in parallel with the upload — the file is
      // already in memory, and both operations are network/CPU-bound
      // in different ways. Worst case we wait for the slower one.
      const [result, dimensions] = await Promise.all([
        api.uploadImage(file, (loaded, total) => {
          setProgress(total > 0 ? loaded / total : 0);
        }),
        decodeDimensions(file),
      ]);
      onChange(result.stagingUrl);
      onUploaded?.({
        url: result.stagingUrl,
        ...(MIME_TO_FORMAT[file.type] !== undefined
          ? { format: MIME_TO_FORMAT[file.type] }
          : {}),
        ...(dimensions !== undefined
          ? { width: dimensions.width, height: dimensions.height }
          : {}),
        sizeBytes: file.size,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function onPickClick(): void {
    inputRef.current?.click();
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0];
    if (file !== undefined) void handleFile(file);
    // Reset so picking the same file twice still fires onChange.
    e.target.value = '';
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>): void {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file !== undefined) void handleFile(file);
  }

  const hasImage = value !== undefined && value !== '';

  return (
    <div className='space-y-2'>
      <input
        ref={inputRef}
        type='file'
        accept='image/webp,image/png,image/jpeg,image/gif,image/avif,image/svg+xml'
        className='hidden'
        onChange={onInputChange}
        disabled={disabled === true || busy}
      />

      {hasImage
        ? (
          <div className='border-input bg-card flex items-center gap-3 rounded-md border p-2'>
            <ImagePreview src={value!} />
            <div className='min-w-0 flex-1'>
              <p className='truncate text-xs font-mono text-muted-foreground'>{value}</p>
              <div className='mt-1 flex gap-2'>
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  className='h-7 px-2 text-xs'
                  onClick={onPickClick}
                  disabled={disabled === true || busy}
                >
                  <Upload className='size-3.5' />
                  Replace
                </Button>
                <Button
                  type='button'
                  variant='ghost'
                  size='sm'
                  className='text-muted-foreground h-7 px-2 text-xs'
                  onClick={() => onChange('')}
                  disabled={disabled === true || busy}
                >
                  <Trash2 className='size-3.5' />
                  Clear
                </Button>
              </div>
            </div>
          </div>
        )
        : (
          <div
            onClick={onPickClick}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed py-8 text-xs transition-colors ${
              dragging
                ? 'border-primary bg-primary/5 text-primary'
                : 'border-input/60 text-muted-foreground hover:border-input hover:bg-accent/30 hover:text-foreground'
            } ${busy || disabled === true ? 'pointer-events-none opacity-50' : ''}`}
          >
            {busy
              ? <Loader2 className='size-5 animate-spin' />
              : <ImagePlus className='size-5' />}
            <span>
              {busy
                ? `Uploading… ${Math.round(progress * 100)}%`
                : dragging
                ? 'Drop to upload'
                : 'Drop an image or click to browse'}
            </span>
            {busy
              ? (
                <div className='bg-input mt-1 h-1 w-40 overflow-hidden rounded'>
                  <div
                    className='bg-primary h-full transition-all'
                    style={{ width: `${Math.round(progress * 100)}%` }}
                  />
                </div>
              )
              : null}
          </div>
        )}

      {error !== null
        ? <p className='text-destructive text-[10px]'>{error}</p>
        : null}
    </div>
  );
}

/**
 * Thumbnail with a graceful fallback when the URL doesn't resolve.
 * Seed data + manually-typed URLs often point at hosts that don't
 * exist (e.g. `images.onepiece-wiki.example`), and the browser's
 * default broken-image icon is alarming. We catch the error and show
 * a muted placeholder + the host name so the maintainer knows what's
 * up at a glance.
 */
function ImagePreview({ src }: { src: string; }): JSX.Element {
  const [broken, setBroken] = useState(false);
  // Reset the broken flag when the URL changes so swapping in a new
  // image gives it a fresh chance to load.
  const lastSrc = useRef(src);
  if (lastSrc.current !== src) {
    lastSrc.current = src;
    if (broken) setBroken(false);
  }

  if (broken) {
    let host = '?';
    try {
      host = new URL(src).hostname;
    } catch { /* relative URLs etc. */ }
    return (
      <div
        className='bg-muted text-muted-foreground flex size-16 shrink-0 flex-col items-center justify-center rounded text-[9px]'
        title={`Image unavailable — ${src}`}
      >
        <ImagePlus className='size-4 opacity-50' />
        <span className='truncate max-w-full px-1'>{host}</span>
      </div>
    );
  }
  // Resolve `staging://` placeholders to the dashboard's signed
  // preview route so the browser can render unpromoted uploads.
  const resolved = resolveImageUrl(src);
  return (
    <img
      src={resolved}
      alt=''
      className='size-16 shrink-0 rounded object-cover'
      loading='lazy'
      onError={() => setBroken(true)}
    />
  );
}
