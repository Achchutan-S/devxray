import type { SpeechEngine } from './player';

export function isBrowserTtsSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
}

/**
 * Calls `onChange` with the device's voices now and whenever they change. Browsers
 * (Chrome especially) return an empty list until `voiceschanged` fires.
 */
export function subscribeVoices(onChange: (voices: SpeechSynthesisVoice[]) => void): () => void {
  const synth = window.speechSynthesis;
  const load = () => onChange(synth.getVoices());
  load();
  synth.addEventListener('voiceschanged', load);
  return () => synth.removeEventListener('voiceschanged', load);
}

/**
 * Web Speech API engine. DevXray itself sends nothing anywhere; note that
 * voices with `localService === false` are synthesised by the browser vendor's
 * online service, which the UI discloses.
 */
export function createBrowserEngine(getVoiceUri: () => string | undefined): SpeechEngine {
  // Held so the utterance isn't garbage-collected mid-speech (Chrome then never fires `end`).
  const active = new Set<SpeechSynthesisUtterance>();

  return {
    speak(text, { rate }) {
      return new Promise<void>((resolve, reject) => {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = rate;
        const uri = getVoiceUri();
        const voice = uri ? window.speechSynthesis.getVoices().find((v) => v.voiceURI === uri) : undefined;
        if (voice) {
          utterance.voice = voice;
          utterance.lang = voice.lang;
        }
        utterance.onend = () => {
          active.delete(utterance);
          resolve();
        };
        utterance.onerror = (event) => {
          active.delete(utterance);
          // cancel() surfaces as an error event; that's a stop, not a failure.
          if (event.error === 'canceled' || event.error === 'interrupted') resolve();
          else reject(new Error(`Speech failed (${event.error})`));
        };
        active.add(utterance);
        window.speechSynthesis.speak(utterance);
      });
    },
    // Optional chaining: the player calls stop() on unmount even where speech is unsupported.
    pause: () => window.speechSynthesis?.pause(),
    resume: () => window.speechSynthesis?.resume(),
    cancel() {
      active.clear();
      window.speechSynthesis?.cancel();
      // Safari/Chrome keep the paused flag across cancel(), silently stalling the next speak().
      window.speechSynthesis?.resume();
    },
  };
}
