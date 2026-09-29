import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type RefObject } from 'react';
import { Pause, Play, Square } from 'lucide-react';
import { IconButton } from './Buttons';
import { chunkSegments, extractSegments, type NarrationSegment } from '@/utils/tts/narration';
import { ReadAloudPlayer } from '@/utils/tts/player';
import { createBrowserEngine, isBrowserTtsSupported, subscribeVoices } from '@/utils/tts/browserEngine';

const RATES = [0.75, 1, 1.25, 1.5, 1.75, 2] as const;
const CHUNK_CHARS = 200; // long utterances get cut off or stall in some engines
const READING_CLASS = 'dx-reading';
const FIELD = 'rounded border border-line bg-surface-sunken px-1.5 py-1 text-xs text-fg outline-none focus:border-accent';

interface ReadAloudBarProps {
  /** The rendered preview; narration is read from its DOM, so it always matches what's on screen. */
  previewRef: RefObject<HTMLElement>;
  /** Sanitized preview HTML — only used to know when the DOM changed. */
  html: string;
}

export function ReadAloudBar({ previewRef, html }: ReadAloudBarProps) {
  const supported = useMemo(isBrowserTtsSupported, []);
  const [rate, setRate] = useState(1);
  const [skipCode, setSkipCode] = useState(true);
  const [voiceUri, setVoiceUri] = useState('');
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [segments, setSegments] = useState<NarrationSegment[]>([]);

  // The engine reads the voice through a ref so changing it never rebuilds the player.
  const voiceRef = useRef(voiceUri);
  voiceRef.current = voiceUri;

  useEffect(() => (supported ? subscribeVoices(setVoices) : undefined), [supported]);

  useEffect(() => {
    const root = previewRef.current;
    setSegments(root ? extractSegments(root, { readCode: !skipCode }) : []);
  }, [html, skipCode, previewRef]);

  const chunks = useMemo(() => chunkSegments(segments, CHUNK_CHARS), [segments]);
  const player = useMemo(
    () => new ReadAloudPlayer(createBrowserEngine(() => voiceRef.current || undefined), chunks),
    [chunks],
  );
  useEffect(() => () => player.stop(), [player]);
  const state = useSyncExternalStore(player.subscribe, player.getState);
  useEffect(() => player.setRate(rate), [player, rate]);

  // Subtle highlight of the section being read; chunk-level, not word-level. Kept while paused, cleared on stop.
  const activeSegment = state.status === 'idle' ? undefined : chunks[state.index]?.segment;
  useEffect(() => {
    if (activeSegment === undefined) return;
    const el = segments[activeSegment]?.el;
    el?.classList.add(READING_CLASS);
    el?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    return () => el?.classList.remove(READING_CLASS);
  }, [activeSegment, segments]);

  // "Start from here": clicking a block in the preview reads from it.
  useEffect(() => {
    const root = previewRef.current;
    if (!root || !supported) return;
    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (!target || target.closest('a') || window.getSelection()?.toString()) return;
      let hit = -1;
      segments.forEach((s, i) => s.el.contains(target) && (hit = i)); // last match = deepest (nested list items)
      const from = chunks.findIndex((c) => c.segment === hit);
      if (from >= 0) void player.play(from);
    };
    root.addEventListener('click', onClick);
    return () => root.removeEventListener('click', onClick);
  }, [previewRef, segments, chunks, player, supported]);

  const empty = chunks.length === 0;
  const status = state.status;
  const toggle = useCallback(() => {
    if (status === 'playing') player.pause();
    else if (status === 'paused') player.resume();
    else void player.play(status === 'error' ? state.index : 0);
  }, [player, status, state.index]);

  const playLabel =
    status === 'playing' ? 'Pause' : status === 'paused' ? 'Resume' : status === 'error' ? 'Retry' : 'Read aloud';
  const progress = status === 'idle' || empty ? 0 : ((state.index + 1) / state.total) * 100;
  const selectedVoice = voiceUri ? voices.find((v) => v.voiceURI === voiceUri) : voices.find((v) => v.default);

  return (
    <div className="shrink-0 border-b border-line bg-surface px-3 py-2 text-xs text-fg-muted" role="region" aria-label="Read aloud">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex items-center gap-1">
          <IconButton
            icon={status === 'playing' ? Pause : Play}
            label={playLabel}
            onClick={toggle}
            disabled={empty || !supported}
            aria-pressed={status === 'playing'}
          />
          <IconButton icon={Square} label="Stop" onClick={() => player.stop()} disabled={status === 'idle'} />
        </div>

        <div className="flex min-w-[6rem] flex-1 items-center gap-2">
          <div
            role="progressbar"
            aria-label="Reading progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress)}
            className="h-1.5 flex-1 overflow-hidden rounded bg-surface-sunken"
          >
            <div className="h-full bg-accent transition-[width]" style={{ width: `${progress}%` }} />
          </div>
          <span className="tabular-nums">
            {status === 'idle' ? `${chunks.length} parts` : `${state.index + 1} / ${state.total}`}
          </span>
        </div>

        <label className="flex items-center gap-1">
          Speed
          <select aria-label="Speech speed" value={rate} onChange={(e) => setRate(Number(e.target.value))} className={FIELD} disabled={!supported}>
            {RATES.map((r) => (
              <option key={r} value={r}>
                {r}x
              </option>
            ))}
          </select>
        </label>

        {supported && (
          <select
            aria-label="Voice"
            value={voiceUri}
            onChange={(e) => setVoiceUri(e.target.value)}
            disabled={voices.length === 0}
            className={`${FIELD} max-w-[12rem]`}
          >
            <option value="">{voices.length === 0 ? 'Loading voices…' : 'Default voice'}</option>
            {voices.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {v.name} ({v.lang}){v.localService ? '' : ' — online'}
              </option>
            ))}
          </select>
        )}

        <label className="flex cursor-pointer items-center gap-1.5">
          <input type="checkbox" checked={skipCode} onChange={(e) => setSkipCode(e.target.checked)} className="accent-[rgb(var(--dx-accent))]" />
          Skip code
        </label>
      </div>

      {!supported ? (
        <p role="status" className="mt-2">Read Aloud isn&rsquo;t available: this browser doesn&rsquo;t support speech synthesis.</p>
      ) : selectedVoice && !selectedVoice.localService ? (
        <p className="mt-2">This voice is provided online by your browser, which may send the text to its speech service. Pick a voice without &ldquo;online&rdquo; to keep text on this device.</p>
      ) : (
        <p className="mt-2">
          Uses your browser/device&rsquo;s available voices. Your text stays on this device.
          {!empty && status === 'idle' && ' Click any paragraph to start reading from it.'}
        </p>
      )}
      {status === 'error' && (
        <p role="alert" className="mt-2 text-danger">
          {state.error}
        </p>
      )}
    </div>
  );
}
