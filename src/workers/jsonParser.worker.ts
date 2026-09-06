/// <reference lib="webworker" />
import {
  analyzeJSON,
  countLines,
  extractJSONKeys,
  type JSONKey,
  type JSONStats,
} from '@/utils/formatters/json';

export interface JsonWorkerRequest {
  readonly input: string;
  /** Above the large-file threshold the parsed value is not transferred back. */
  readonly isLargeFile: boolean;
  /**
   * Echoed back so the UI can discard a slow response for input the user has
   * already replaced — otherwise a big earlier parse can overwrite a newer one.
   */
  readonly requestId: number;
}

export type JsonWorkerResponse =
  | {
      readonly ok: true;
      readonly requestId: number;
      /** null for large files — see below. */
      readonly parsed: unknown;
      readonly stats: JSONStats;
      readonly availableKeys: JSONKey[];
      readonly lineCount: number;
      readonly isLargeFile: boolean;
    }
  | { readonly ok: false; readonly requestId: number; readonly error: string };

self.onmessage = (event: MessageEvent<JsonWorkerRequest>): void => {
  const { input, isLargeFile, requestId } = event.data;

  try {
    const parsed: unknown = JSON.parse(input);

    self.postMessage({
      ok: true,
      requestId,
      /**
       * Structured-cloning a very large object back to the main thread costs more
       * than the parse it saved, and the UI disables the tree view at this size
       * anyway — so send the statistics and keep the value here.
       */
      parsed: isLargeFile ? null : parsed,
      stats: analyzeJSON(parsed),
      availableKeys: extractJSONKeys(parsed),
      lineCount: countLines(input),
      isLargeFile,
    } satisfies JsonWorkerResponse);
  } catch (error) {
    self.postMessage({
      ok: false,
      requestId,
      error: error instanceof Error ? error.message : 'Invalid JSON',
    } satisfies JsonWorkerResponse);
  }
};
