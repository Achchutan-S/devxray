// @vitest-environment jsdom
import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderMarkdown } from '@/utils/formatters/markdown';
import { ReadAloudBar } from './ReadAloudBar';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type FakeUtterance = { text: string; voice?: { voiceURI: string }; onend: () => void };

function mockSpeech(voices: Array<Partial<SpeechSynthesisVoice>>) {
  const spoken: FakeUtterance[] = [];
  const listeners = new Set<() => void>();
  const synth = {
    voices,
    speak: vi.fn((u: FakeUtterance) => spoken.push(u)),
    cancel: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    getVoices: () => synth.voices,
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  vi.stubGlobal('SpeechSynthesisUtterance', function (this: { text: string }, text: string) {
    this.text = text;
  });
  return { synth, spoken, fireVoicesChanged: () => listeners.forEach((fn) => fn()) };
}

const HTML = renderMarkdown('# Title\n\nFirst paragraph.\n\nSecond paragraph.');

function Harness() {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <>
      <ReadAloudBar previewRef={ref} html={HTML} />
      <div ref={ref} className="dx-markdown-preview" dangerouslySetInnerHTML={{ __html: HTML }} />
    </>
  );
}

let root: Root | undefined;
let container: HTMLDivElement;
async function render() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root!.render(<Harness />));
}
const $ = (selector: string) => container.querySelector(selector) as HTMLElement;
const button = (label: string) => $(`button[aria-label="${label}"]`) as HTMLButtonElement;
const reading = () => Array.from(container.querySelectorAll('.dx-reading')).map((el) => el.textContent);
const flush = () => act(async () => {});

afterEach(() => {
  act(() => root?.unmount());
  container.remove();
  vi.unstubAllGlobals();
  delete (window as { speechSynthesis?: unknown }).speechSynthesis;
});

describe('ReadAloudBar', () => {
  it('highlights the segment being read, tracks progress, keeps it on pause and clears it on stop', async () => {
    const { spoken, synth } = mockSpeech([]);
    await render();
    expect($('[role="progressbar"]').getAttribute('aria-valuenow')).toBe('0');

    await act(async () => button('Read aloud').click());
    expect(spoken[0]!.text).toBe('Title.');
    expect(reading()).toEqual(['Title']);

    await act(async () => spoken[0]!.onend());
    expect(spoken[1]!.text).toBe('First paragraph.');
    expect(reading()).toEqual(['First paragraph.']);
    expect($('[role="progressbar"]').getAttribute('aria-valuenow')).toBe('67');

    await act(async () => button('Pause').click());
    expect(synth.pause).toHaveBeenCalled();
    expect(reading()).toEqual(['First paragraph.']);

    await act(async () => button('Stop').click());
    expect(reading()).toEqual([]);
    expect($('[role="progressbar"]').getAttribute('aria-valuenow')).toBe('0');
  });

  it('starts reading from a clicked paragraph', async () => {
    const { spoken } = mockSpeech([]);
    await render();
    const second = Array.from(container.querySelectorAll('.dx-markdown-preview p'))[1] as HTMLElement;
    await act(async () => second.click());
    await flush();
    expect(spoken.at(-1)!.text).toBe('Second paragraph.');
    expect(reading()).toEqual(['Second paragraph.']);
  });

  it('fills the voice list on voiceschanged, marks online voices and uses the chosen one', async () => {
    const speech = mockSpeech([]);
    await render();
    const select = $('select[aria-label="Voice"]') as HTMLSelectElement;
    expect(select.disabled).toBe(true);

    speech.synth.voices = [
      { voiceURI: 'local-1', name: 'Local', lang: 'en-US', localService: true, default: true },
      { voiceURI: 'cloud-1', name: 'Cloud', lang: 'en-GB', localService: false },
    ];
    await act(async () => speech.fireVoicesChanged());
    expect(select.disabled).toBe(false);
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual([
      'Default voice',
      'Local (en-US)',
      'Cloud (en-GB) — online',
    ]);
    expect(container.textContent).toContain('Your text stays on this device.');

    await act(async () => {
      select.value = 'cloud-1';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(container.textContent).toContain('provided online by your browser');

    await act(async () => button('Read aloud').click());
    expect(speech.spoken[0]!.voice?.voiceURI).toBe('cloud-1');
  });

  it('explains and disables playback when speech synthesis is unavailable', async () => {
    await render();
    expect(container.textContent).toContain('doesn’t support speech synthesis');
    expect(button('Read aloud').disabled).toBe(true);
    expect($('select[aria-label="Voice"]')).toBeNull();
    // clicking the preview must not throw
    await act(async () => (container.querySelector('.dx-markdown-preview p') as HTMLElement).click());
  });
});
