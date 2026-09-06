import { PageShell } from './PageShell';
import { Callout, Section } from './TrustPrimitives';
import type { ContentPageId } from '@/constants/routes';

interface Props {
  onNavigate: (pageId: ContentPageId) => void;
  onBack: () => void;
}

interface Dep {
  readonly name: string;
  readonly role: string;
}

/**
 * Generated from the real dependency list in package.json. Every entry here is
 * bundled into the client and executes in the browser; none of them is a
 * hosted service.
 */
const GROUPS: readonly { title: string; note?: string; deps: readonly Dep[] }[] = [
  {
    title: 'UI',
    deps: [
      { name: 'react / react-dom', role: 'Renders the interface.' },
      { name: 'lucide-react', role: 'The icon set, compiled in as SVG components — no icon font, no CDN.' },
      { name: 'sonner', role: 'Toast notifications.' },
      { name: 'tailwindcss', role: 'Styling, compiled to a static stylesheet at build time.' },
    ],
  },
  {
    title: 'Editor',
    note: 'Bundled from node_modules rather than fetched from a CDN — which is what makes offline use possible and means opening the app contacts no third party.',
    deps: [
      { name: 'monaco-editor', role: 'The code editor, including the Diff viewer. Only the languages this toolkit uses are registered.' },
      { name: '@monaco-editor/react', role: 'React bindings, pointed at the locally bundled Monaco instance.' },
    ],
  },
  {
    title: 'State',
    deps: [
      { name: 'zustand', role: 'Application state. Three stores; two of them persist to localStorage.' },
    ],
  },
  {
    title: 'Parsing & formatting',
    deps: [
      { name: 'graphql', role: 'Parses GraphQL into a real AST for formatting, analysis and field filtering.' },
      { name: 'prettier', role: 'Formats GraphQL. Loaded on first use rather than at page load.' },
      { name: 'yaml', role: 'YAML parsing and serialisation, including anchors and merge keys.' },
      { name: 'sql-formatter', role: 'SQL formatting across six dialects, imported per dialect.' },
      { name: 'marked', role: 'Markdown to HTML. Its output is never used directly — see Security.' },
      { name: 'cronstrue', role: 'Turns a cron expression into an English description. Next-run times use a hand-written scheduler.' },
    ],
  },
  {
    title: 'Security',
    deps: [
      { name: 'dompurify', role: 'Sanitises Markdown-generated HTML before it reaches the page; inline style attributes are stripped as well.' },
      { name: 'Web Crypto (browser API)', role: 'JWT HMAC verification and SHA digests. Not a dependency — the browser’s own implementation.' },
    ],
  },
  {
    title: 'Generators & utilities',
    deps: [
      { name: '@faker-js/faker', role: 'Mock data generation. English locale only.' },
      { name: 'uuid', role: 'UUID v4 and v7 generation.' },
      { name: 'ulid', role: 'ULID generation, via the monotonic factory so a batch sorts correctly.' },
      { name: 'nanoid', role: 'NanoID generation.' },
      { name: 'lz-string', role: 'Compresses tool state into share links. Compression, not encryption.' },
    ],
  },
  {
    title: 'Build & PWA',
    note: 'Build-time only — these do not ship to the browser as runtime services.',
    deps: [
      { name: 'vite', role: 'Build tool and dev server.' },
      { name: 'typescript', role: 'Type checking in strict mode.' },
      { name: 'vite-plugin-pwa / workbox', role: 'Generates the service worker that precaches the app for offline use.' },
      { name: 'vitest', role: 'Test runner.' },
      { name: 'eslint', role: 'Linting.' },
    ],
  },
];

export function TechnologyPage({ onNavigate, onBack }: Props) {
  return (
    <PageShell
      current="technology"
      title="What it is built with"
      lead="The full runtime stack, grouped by what each part actually does. Generated from the project's real dependency list."
      onNavigate={onNavigate}
      onBack={onBack}
    >
      <Section title="Shape of the application">
        <div className="space-y-3 text-sm leading-relaxed text-fg-muted">
          <p>
            A React single-page application, written in TypeScript, built by Vite into
            static files: HTML, JavaScript, CSS and a handful of SVG icons. There is no
            server-side application, no database and no API.
          </p>
          <p>
            Every tool is loaded lazily, so opening the YAML tool does not download the
            GraphQL parser. Four Web Workers exist: two belonging to the editor, one for
            parsing large JSON off the main thread, and one for running regular
            expressions where it can be terminated.
          </p>
        </div>
      </Section>

      <Section
        title="Dependencies"
        lead="Every runtime dependency below is compiled into the bundle and runs in your browser."
      >
        <div className="space-y-4">
          {GROUPS.map((group) => (
            <div key={group.title}>
              <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.13em] text-fg-subtle">
                {group.title}
              </h3>
              {group.note ? (
                <p className="mb-2 text-xs italic text-fg-subtle">{group.note}</p>
              ) : null}
              <div className="overflow-hidden rounded border border-line">
                {group.deps.map((dep, i) => (
                  <div
                    key={dep.name}
                    className={`flex flex-col gap-0.5 bg-surface px-3 py-2 sm:flex-row sm:gap-4 ${
                      i > 0 ? 'border-t border-line' : ''
                    }`}
                  >
                    <code className="w-full shrink-0 font-mono text-xs text-accent sm:w-56">
                      {dep.name}
                    </code>
                    <span className="text-sm text-fg-muted">{dep.role}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="A dependency is not a service">
        <Callout title="What bundling actually means">
          Using an npm package does not mean your input is sent to that package&rsquo;s
          authors or servers. These libraries are compiled into the JavaScript your browser
          downloads and then execute locally, exactly like the rest of the application
          code. The distinction that matters is whether a dependency performs network
          communication — and a request-level capture across ten usage scenarios recorded
          no third-party origins during any tool operation.
        </Callout>
        <p className="mt-3 text-sm leading-relaxed text-fg-muted">
          What this does not rule out is supply-chain risk. Any JavaScript project depends
          on packages that could, in a future version, be compromised. Versions are pinned
          through a lockfile, which limits exposure but does not eliminate it.
        </p>
      </Section>

      <Section title="Bundle and offline footprint">
        <ul className="space-y-1.5 text-sm text-fg-muted">
          <li>Initial JavaScript is around 116 kB raw (roughly 34 kB gzipped); everything else loads on demand.</li>
          <li>The editor is by far the largest asset at roughly 3.3 MB raw (about 860 kB gzipped) and is precached so it works offline.</li>
          <li>The service worker precaches 66 files, about 5.3 MB in total, which is what allows every tool to run with the network off.</li>
        </ul>
      </Section>
    </PageShell>
  );
}
