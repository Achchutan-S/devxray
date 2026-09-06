/// <reference lib="webworker" />
import { analyzeMatches, applyReplace, RegexError, type RegexAnalysis } from '@/utils/formatters/regex';

export interface RegexWorkerRequest {
  readonly requestId: number;
  readonly pattern: string;
  readonly flags: string;
  readonly testString: string;
  readonly replacement: string;
}

export type RegexWorkerResponse =
  | { readonly ok: true; readonly requestId: number; readonly analysis: RegexAnalysis; readonly replaced: string }
  | { readonly ok: false; readonly requestId: number; readonly error: string };

self.onmessage = (event: MessageEvent<RegexWorkerRequest>): void => {
  const { requestId, pattern, flags, testString, replacement } = event.data;

  try {
    const analysis = analyzeMatches(pattern, flags, testString);
    const replaced = applyReplace(pattern, flags, testString, replacement);
    self.postMessage({ ok: true, requestId, analysis, replaced } satisfies RegexWorkerResponse);
  } catch (error) {
    self.postMessage({
      ok: false,
      requestId,
      error: error instanceof RegexError ? error.message : 'Invalid regular expression',
    } satisfies RegexWorkerResponse);
  }
};
