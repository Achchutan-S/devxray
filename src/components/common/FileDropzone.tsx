import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { UploadCloud } from 'lucide-react';
import { toast } from 'sonner';
import { isFileDrag, isTabDrag } from '@/constants/dragTypes';
import { useUIStore } from '@/store';
import { triggerFileDropForTab } from '@/hooks';
import { CONFIG } from '@/utils/constants';
import { resolveTargetTab } from '@/utils/fileRouting';

/** Files larger than this are refused outright rather than freezing the tab. */
const MAX_DROP_BYTES = 25 * 1024 * 1024;

async function readFileWithProgress(
  file: File,
  onProgress: (loadedBytes: number) => void,
): Promise<string> {
  if (typeof file.stream !== 'function') return file.text();

  const reader = file.stream().getReader();
  const decoder = new TextDecoder();
  let text = '';
  let loaded = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      loaded += value.byteLength;
      text += decoder.decode(value, { stream: true });
      onProgress(loaded);
    }
  }
  text += decoder.decode();
  return text;
}

interface FileDropzoneProps {
  children: ReactNode;
}

export function FileDropzone({ children }: FileDropzoneProps) {
  const activeTab = useUIStore((state) => state.activeTab);
  const setActiveTab = useUIStore((state) => state.setActiveTab);

  const [isDragging, setIsDragging] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const dragCounter = useRef(0);

  // Read inside async handlers without making them depend on a changing value.
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  const handleFile = useCallback(
    async (file: File) => {
      const target = resolveTargetTab(file.name, activeTabRef.current);
      if (target === null) {
        toast.error(`Dev X-Ray has no tool for “${file.name}”`);
        return;
      }

      if (file.size > MAX_DROP_BYTES) {
        toast.error(
          `“${file.name}” is ${Math.round(file.size / 1024 / 1024)} MB — the limit is 25 MB.`,
        );
        return;
      }

      const showProgress = file.size > CONFIG.LARGE_FILE_THRESHOLD;
      if (showProgress) setProgress(0);

      try {
        const content = await readFileWithProgress(file, (loaded) => {
          if (showProgress) setProgress(Math.round((loaded / file.size) * 100));
        });

        if (target !== activeTabRef.current) setActiveTab(target);
        // No generic success toast here: every tool registered via
        // useFileDropCallback already shows its own — often more specific
        // ("Inferred 3 fields from x.json", "Loaded x.json into Response
        // JSON") — and firing both stacked two toasts for one drop.
        triggerFileDropForTab(target, content, file.name);
      } catch {
        // The failure is reported to the user; the file's contents are never logged.
        toast.error(`Could not read “${file.name}”`);
      } finally {
        setProgress(null);
      }
    },
    [setActiveTab],
  );

  const endDrag = useCallback(() => {
    dragCounter.current = 0;
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (event: DragEvent) => {
      if (isTabDrag(event)) return;
      event.preventDefault();
      endDrag();

      // Only the first file is processed — each tool takes a single document.
      const file = event.dataTransfer?.files?.[0];
      if (file) void handleFile(file);
    },
    [endDrag, handleFile],
  );

  /**
   * Window-level listeners in addition to the wrapper's React handlers: Monaco
   * installs its own drag handling, and without these a drop onto the editor
   * surface is swallowed before it ever reaches React.
   */
  useEffect(() => {
    const onDragEnter = (event: DragEvent): void => {
      if (isTabDrag(event) || !isFileDrag(event)) return;
      event.preventDefault();
      dragCounter.current += 1;
      setIsDragging(true);
    };

    const onDragOver = (event: DragEvent): void => {
      if (isTabDrag(event) || !isFileDrag(event)) return;
      // Required, otherwise the browser navigates to the dropped file.
      event.preventDefault();
    };

    const onDragLeave = (event: DragEvent): void => {
      if (isTabDrag(event)) return;
      dragCounter.current -= 1;
      if (dragCounter.current <= 0 || event.relatedTarget === null) endDrag();
    };

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', handleDrop);
    };
  }, [endDrag, handleDrop]);

  return (
    <div className="dx-app-shell flex flex-col min-h-0 overflow-hidden">
      {children}

      {(isDragging || progress !== null) && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-overlay/70 backdrop-blur-sm"
          aria-hidden="true"
        >
          <div className="flex flex-col items-center gap-3 rounded-lg border-2 border-dashed border-accent bg-surface px-10 py-8 shadow-xl">
            <UploadCloud className="h-10 w-10 text-accent" />
            {progress === null ? (
              <>
                <p className="text-base font-semibold text-fg">Drop a file to open it</p>
                <p className="text-xs text-fg-muted">
                  .json .graphql .yaml .xml .sql .csv .md .jwt
                </p>
              </>
            ) : (
              <>
                <p className="text-base font-semibold text-fg">Reading file… {progress}%</p>
                <div className="h-1.5 w-56 overflow-hidden rounded-full bg-surface-sunken">
                  <div
                    className="h-full rounded-full bg-accent transition-[width]"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
