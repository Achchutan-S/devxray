import type { NarrationChunk } from './narration';

/** Speech backend seam (the browser engine in production, a fake in tests). `speak` resolves when the text has been fully spoken (or cancelled) and rejects on failure. */
export interface SpeechEngine {
  speak(text: string, options: { rate: number }): Promise<void>;
  pause(): void;
  resume(): void;
  /** Abort anything in flight and release resources. */
  cancel(): void;
}

export type PlayerStatus = 'idle' | 'playing' | 'paused' | 'error';

export interface PlayerState {
  readonly status: PlayerStatus;
  /** Index of the chunk being (or about to be) spoken. */
  readonly index: number;
  readonly total: number;
  readonly error: string | null;
}

/**
 * Walks a list of chunks through an engine: pause/resume/stop, progress and
 * error state live here; the engine only knows how to say one chunk.
 * A generation counter makes stale engine callbacks (from before a stop/seek) harmless.
 */
export class ReadAloudPlayer {
  private state: PlayerState;
  private generation = 0;
  private rate = 1;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly engine: SpeechEngine,
    private readonly chunks: readonly NarrationChunk[],
  ) {
    this.state = { status: 'idle', index: 0, total: chunks.length, error: null };
  }

  getState = (): PlayerState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(patch: Partial<PlayerState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  /** Applies from the next utterance; one already being spoken keeps its rate. */
  setRate(rate: number): void {
    this.rate = rate;
  }

  /** Starts (or restarts) from a chunk. After an error, `play(getState().index)` is the retry. */
  async play(from = 0): Promise<void> {
    if (this.chunks.length === 0) return;
    const generation = ++this.generation;
    this.engine.cancel();
    this.set({ status: 'playing', index: Math.min(from, this.chunks.length - 1), error: null });

    while (generation === this.generation && this.state.index < this.chunks.length) {
      const { index } = this.state;
      try {
        await this.engine.speak(this.chunks[index]!.text, { rate: this.rate });
      } catch (error) {
        if (generation !== this.generation) return;
        this.set({ status: 'error', error: error instanceof Error ? error.message : 'Speech failed' });
        return;
      }
      if (generation !== this.generation) return;
      if (index + 1 >= this.chunks.length) break;
      this.set({ index: index + 1 });
    }
    if (generation === this.generation) this.set({ status: 'idle', index: 0 });
  }

  pause(): void {
    if (this.state.status !== 'playing') return;
    this.engine.pause();
    this.set({ status: 'paused' });
  }

  resume(): void {
    if (this.state.status !== 'paused') return;
    this.engine.resume();
    this.set({ status: 'playing' });
  }

  stop(): void {
    this.generation++;
    this.engine.cancel();
    this.set({ status: 'idle', index: 0, error: null });
  }
}
