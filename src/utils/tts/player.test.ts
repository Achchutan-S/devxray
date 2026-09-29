import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBrowserEngine, isBrowserTtsSupported, subscribeVoices } from './browserEngine';
import { ReadAloudPlayer, type SpeechEngine } from './player';

const chunks = ['a', 'b', 'c'].map((text, segment) => ({ text, segment }));
const tick = () => new Promise((r) => setTimeout(r, 0));

/** Engine whose speak() finishes only when the test says so. */
function fakeEngine() {
  const finishers: Array<{ resolve: () => void; reject: (e: Error) => void; text: string; rate: number }> = [];
  const engine: SpeechEngine = {
    speak: vi.fn(
      (text: string, { rate }: { rate: number }) =>
        new Promise<void>((resolve, reject) => finishers.push({ resolve, reject, text, rate })),
    ),
    pause: vi.fn(),
    resume: vi.fn(),
    cancel: vi.fn(),
  };
  return { engine, finishers };
}

describe('ReadAloudPlayer', () => {
  it('walks chunks in order, then returns to idle', async () => {
    const { engine, finishers } = fakeEngine();
    const player = new ReadAloudPlayer(engine, chunks);
    void player.play();
    await tick();
    expect(player.getState()).toMatchObject({ status: 'playing', index: 0, total: 3 });
    for (let i = 0; i < 3; i++) {
      expect(finishers[i]!.text).toBe(chunks[i]!.text);
      finishers[i]!.resolve();
      await tick();
    }
    expect(player.getState()).toMatchObject({ status: 'idle', index: 0 });
    expect(engine.speak).toHaveBeenCalledTimes(3);
  });

  it('pause keeps position, resume continues, stop resets and ignores stale completions', async () => {
    const { engine, finishers } = fakeEngine();
    const player = new ReadAloudPlayer(engine, chunks);
    void player.play();
    await tick();
    finishers[0]!.resolve();
    await tick();
    player.pause();
    expect(player.getState()).toMatchObject({ status: 'paused', index: 1 });
    expect(engine.pause).toHaveBeenCalled();
    player.resume();
    expect(player.getState()).toMatchObject({ status: 'playing', index: 1 });
    expect(engine.resume).toHaveBeenCalled();
    player.stop();
    expect(engine.cancel).toHaveBeenCalled();
    finishers[1]!.resolve();
    await tick();
    expect(player.getState()).toMatchObject({ status: 'idle', index: 0 });
    expect(engine.speak).toHaveBeenCalledTimes(2);
  });

  it('ignores pause/resume in the wrong state', () => {
    const { engine } = fakeEngine();
    const player = new ReadAloudPlayer(engine, chunks);
    player.pause();
    player.resume();
    expect(engine.pause).not.toHaveBeenCalled();
    expect(engine.resume).not.toHaveBeenCalled();
  });

  it('reports an error, keeps position, and retries from the failed chunk', async () => {
    const { engine, finishers } = fakeEngine();
    const player = new ReadAloudPlayer(engine, chunks);
    void player.play();
    await tick();
    finishers[0]!.resolve();
    await tick();
    finishers[1]!.reject(new Error('boom'));
    await tick();
    expect(player.getState()).toMatchObject({ status: 'error', index: 1, error: 'boom' });
    void player.play(player.getState().index);
    await tick();
    expect(finishers[2]!.text).toBe('b');
    expect(player.getState()).toMatchObject({ status: 'playing', error: null });
  });

  it('starts from a given chunk and applies rate changes to the next utterance', async () => {
    const { engine, finishers } = fakeEngine();
    const player = new ReadAloudPlayer(engine, chunks);
    player.setRate(1.5);
    void player.play(1);
    await tick();
    expect(finishers[0]).toMatchObject({ text: 'b', rate: 1.5 });
    player.setRate(0.75);
    finishers[0]!.resolve();
    await tick();
    expect(finishers[1]).toMatchObject({ text: 'c', rate: 0.75 });
  });

  it('does nothing for an empty document', async () => {
    const { engine } = fakeEngine();
    const player = new ReadAloudPlayer(engine, []);
    await player.play();
    expect(engine.speak).not.toHaveBeenCalled();
    expect(player.getState().status).toBe('idle');
  });

  it('notifies subscribers and stops notifying after unsubscribe', async () => {
    const { engine } = fakeEngine();
    const player = new ReadAloudPlayer(engine, chunks);
    const listener = vi.fn();
    const unsubscribe = player.subscribe(listener);
    void player.play();
    expect(listener).toHaveBeenCalled();
    unsubscribe();
    listener.mockClear();
    player.stop();
    expect(listener).not.toHaveBeenCalled();
  });
});

// --- browser engine against a mocked window.speechSynthesis --------------------

type FakeUtterance = { text: string; rate: number; voice?: unknown; lang?: string; onend: () => void; onerror: (e: { error: string }) => void };

function mockSpeech(voices: Array<Partial<SpeechSynthesisVoice>> = []) {
  const spoken: FakeUtterance[] = [];
  const listeners = new Set<() => void>();
  const synth = {
    voices,
    speak: vi.fn((u: FakeUtterance) => spoken.push(u)),
    cancel: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    getVoices: vi.fn(() => synth.voices),
    addEventListener: vi.fn((_: string, fn: () => void) => listeners.add(fn)),
    removeEventListener: vi.fn((_: string, fn: () => void) => listeners.delete(fn)),
    fireVoicesChanged: () => listeners.forEach((fn) => fn()),
    listeners,
  };
  vi.stubGlobal('window', { speechSynthesis: synth });
  vi.stubGlobal('SpeechSynthesisUtterance', function (this: { text: string }, text: string) {
    this.text = text;
  });
  return { synth, spoken };
}

describe('browser engine', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('detects support, and its absence', () => {
    mockSpeech();
    expect(isBrowserTtsSupported()).toBe(true);
    vi.stubGlobal('window', {});
    expect(isBrowserTtsSupported()).toBe(false);
  });

  it('speaks one utterance per chunk with the chosen rate and voice', async () => {
    const voice = { voiceURI: 'v-en', lang: 'en-GB', name: 'En' };
    const { spoken } = mockSpeech([voice]);
    const engine = createBrowserEngine(() => 'v-en');
    const done = engine.speak('hello', { rate: 1.25 });
    expect(spoken[0]).toMatchObject({ text: 'hello', rate: 1.25, voice, lang: 'en-GB' });
    spoken[0]!.onend();
    await expect(done).resolves.toBeUndefined();
  });

  it('falls back to the browser default when the chosen voice is gone', () => {
    const { spoken } = mockSpeech([]);
    void createBrowserEngine(() => 'missing').speak('x', { rate: 1 });
    expect(spoken[0]!.voice).toBeUndefined();
  });

  it('pause/resume delegate to speechSynthesis', () => {
    const { synth } = mockSpeech();
    const engine = createBrowserEngine(() => undefined);
    engine.pause();
    engine.resume();
    expect(synth.pause).toHaveBeenCalled();
    expect(synth.resume).toHaveBeenCalled();
  });

  it('treats cancel as a stop, clears a stuck paused flag, and rejects real failures', async () => {
    const { synth, spoken } = mockSpeech();
    const engine = createBrowserEngine(() => undefined);
    const cancelled = engine.speak('again', { rate: 1 });
    engine.cancel();
    expect(synth.cancel).toHaveBeenCalled();
    expect(synth.resume).toHaveBeenCalled();
    spoken[0]!.onerror({ error: 'interrupted' });
    await expect(cancelled).resolves.toBeUndefined();

    const failed = engine.speak('bad', { rate: 1 });
    spoken[1]!.onerror({ error: 'synthesis-failed' });
    await expect(failed).rejects.toThrow(/synthesis-failed/);
  });

  it('drives a full player run end to end', async () => {
    const { synth, spoken } = mockSpeech();
    const player = new ReadAloudPlayer(createBrowserEngine(() => undefined), chunks);
    void player.play();
    for (let i = 0; i < 3; i++) {
      await tick();
      spoken[i]!.onend();
    }
    await tick();
    expect(spoken.map((u) => u.text)).toEqual(['a', 'b', 'c']);
    expect(player.getState().status).toBe('idle');
    player.stop();
    expect(synth.cancel).toHaveBeenCalled();
  });
});

describe('subscribeVoices', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reports voices now, again on voiceschanged, and unsubscribes cleanly', () => {
    const { synth } = mockSpeech([]);
    const onChange = vi.fn();
    const unsubscribe = subscribeVoices(onChange);
    expect(onChange).toHaveBeenLastCalledWith([]);
    synth.voices = [{ voiceURI: 'late', name: 'Late', lang: 'en-US' }];
    synth.fireVoicesChanged();
    expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ voiceURI: 'late' })]);
    unsubscribe();
    expect(synth.listeners.size).toBe(0);
  });
});
