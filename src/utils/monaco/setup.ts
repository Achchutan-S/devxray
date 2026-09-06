/**
 * Monaco bootstrap.
 *
 * Monaco is bundled from node_modules rather than fetched from a CDN, so the app
 * works offline as a PWA and no third-party host sees a request on page load.
 *
 * Only the languages the toolkit actually uses are registered. Importing the
 * default `monaco-editor` entry point would pull in every language and both the
 * TypeScript and CSS/HTML language services, pushing the chunk past the service
 * worker's cache ceiling — at which point the editor silently stops working
 * offline, which is the exact thing local bundling is meant to fix.
 */
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';

// Core editor features (find, folding, bracket matching, context menu, ...).
import 'monaco-editor/esm/vs/editor/editor.all.js';

// Full language service: real validation and formatting for JSON.
import 'monaco-editor/esm/vs/language/json/monaco.contribution';

// Syntax highlighting only (Monarch grammars, no worker).
import 'monaco-editor/esm/vs/basic-languages/graphql/graphql.contribution';
import 'monaco-editor/esm/vs/basic-languages/yaml/yaml.contribution';
import 'monaco-editor/esm/vs/basic-languages/xml/xml.contribution';
import 'monaco-editor/esm/vs/basic-languages/sql/sql.contribution';
import 'monaco-editor/esm/vs/basic-languages/markdown/markdown.contribution';
import 'monaco-editor/esm/vs/basic-languages/html/html.contribution';
import 'monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution';
import 'monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution';
import 'monaco-editor/esm/vs/basic-languages/python/python.contribution';
import 'monaco-editor/esm/vs/basic-languages/go/go.contribution';
import 'monaco-editor/esm/vs/basic-languages/rust/rust.contribution';
import 'monaco-editor/esm/vs/basic-languages/java/java.contribution';
import 'monaco-editor/esm/vs/basic-languages/shell/shell.contribution';

import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';

import { loader } from '@monaco-editor/react';
import type { Theme } from '@/types';
import { defineDevXRayThemes } from '@/utils/monacoThemes';

declare global {
  interface Window {
    MonacoEnvironment?: monaco.Environment;
  }
}

window.MonacoEnvironment = {
  getWorker(_workerId: string, label: string): Worker {
    if (label === 'json') return new JsonWorker();
    return new EditorWorker();
  },
};

// Point @monaco-editor/react at the bundled instance instead of its default CDN loader.
loader.config({ monaco });

let initialised = false;

/** Registers themes once. Called by CodeEditor before the first editor mounts. */
export function initMonaco(theme: Theme): typeof monaco {
  if (!initialised) {
    initialised = true;
    defineDevXRayThemes(monaco, theme);
  }
  return monaco;
}

export { monaco };
