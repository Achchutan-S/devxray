import { PageShell } from './PageShell';
import { Callout, Section } from './TrustPrimitives';
import { REPO_URL, type ContentPageId } from '@/constants/routes';

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
      { name: 'zustand', role: 'Application state. Four stores; three of them persist to localStorage.' },
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

/**
 * Licences of everything that ships to the browser, read from the installed
 * package metadata rather than restated from memory. Grouped by licence so the
 * one entry that is not a plain permissive licence stays visible.
 */
const DEPENDENCY_LICENCES: readonly { licence: string; packages: string }[] = [
  {
    licence: 'MIT',
    packages:
      'react, react-dom, scheduler, monaco-editor, @monaco-editor/react, @monaco-editor/loader, state-local, zustand, use-sync-external-store, sonner, graphql, prettier, marked, sql-formatter, nearley, cronstrue, @faker-js/faker, uuid, ulid, nanoid, lz-string, loose-envify, js-tokens, randexp, ret, discontinuous-range, commander',
  },
  { licence: 'ISC', packages: 'lucide-react, yaml' },
  { licence: 'BSD-3-Clause', packages: 'moo' },
  { licence: 'CC0-1.0 (public domain dedication)', packages: 'railroad-diagrams' },
  { licence: 'MPL-2.0 OR Apache-2.0 (dual)', packages: 'dompurify' },
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

      <Section
        title="Limits &amp; safety"
        lead="Why some operations stop rather than grinding, and roughly where the ceilings sit."
      >
        <div className="space-y-3 text-sm leading-relaxed text-fg-muted">
          <p>
            Dev X-Ray does all its work on the main thread of the tab you have
            open. There is no server to absorb an unreasonable workload, so an
            unbounded operation does not fail somewhere else &mdash; it freezes
            the window you are working in. Resource-heavy operations are
            therefore deliberately bounded to keep the UI responsive.
          </p>
          <p>
            The ceilings are set from measured cost, not picked to look tidy, and
            they are generous: ordinary developer payloads should never meet one.
            When an input does exceed a limit the tool refuses it and says so.
            Nothing is silently truncated and presented as a complete result.
          </p>
        </div>

        <div className="mt-4 overflow-hidden rounded border border-line">
          {[
            ['Input size', 'Each format has its own ceiling, measured in UTF-8 bytes. JSON, CSV and Hash sit at the top; YAML is lower because its parser gets slower with structural complexity rather than raw size, and Markdown is lower still because its cost is the DOM it produces.'],
            ['Rendering', 'A safe parser is not enough if the result is half a million table rows. Large CSVs render a window of rows while copy and export keep every parsed row. The JSON tree summarises very wide containers instead of expanding them.'],
            ['Regular expressions', 'Pattern syntax is checked on the main thread, where compiling can never hang. Execution runs in a Web Worker that is terminated after 2.5 seconds \u2014 the only way to actually stop a catastrophic pattern, since JavaScript cannot interrupt itself mid-match.'],
            ['History', 'Capped at 100 entries, 2,000 characters per field and 8,000 characters in total, so it cannot grow without bound. JWT is excluded entirely.'],
            ['Share links', 'State above 500,000 characters is not shareable; the button says so rather than producing a link that will not open.'],
            ['Dropped files', 'Checked against the file size before a byte is read, so an oversized file is refused without being loaded into memory first.'],
            ['Browser storage', 'If the origin runs out of quota the session simply stops being saved. It is reported once and the tools keep working in memory.'],
          ].map(([title, body], i) => (
            <div
              key={title}
              className={`flex flex-col gap-1 bg-surface px-3 py-2.5 sm:flex-row sm:gap-4 ${
                i > 0 ? 'border-t border-line' : ''
              }`}
            >
              <span className="w-full shrink-0 text-xs font-semibold uppercase tracking-[0.09em] text-fg-subtle sm:w-40">
                {title}
              </span>
              <span className="text-sm text-fg-muted">{body}</span>
            </div>
          ))}
        </div>

        <Callout tone="warning" title="What this is not">
          These are resource budgets, not a security boundary, and they are not a
          guarantee. They bound the workloads that were measured; a deliberately
          pathological input under a ceiling can still be slow. The claim is
          predictable failure with an explanation, not immunity.
        </Callout>
      </Section>

      <Section
        title="Licensing"
        lead="What you are allowed to do with this code, and what the dependencies bring with them."
      >
        <div className="space-y-3 text-sm leading-relaxed text-fg-muted">
          <p>
            <strong className="text-fg">Dev X-Ray&rsquo;s own source code is licensed
            under the MIT License.</strong> The full text is in the{' '}
            <code className="font-mono text-xs text-accent">LICENSE</code> file at the
            root of the repository.
          </p>
          <p>
            The repository is public, so the implementation is inspectable: every claim
            on the Privacy and Security pages can be checked against the code that makes
            it, rather than taken on trust — read it at{' '}
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent underline underline-offset-2 hover:text-accent-hover"
            >
              github.com/Achchutan-S/devxray
            </a>
            .
          </p>
          <p>
            Under the MIT License you may use, modify, distribute and self-host Dev X-Ray,
            including commercially, subject to its conditions — the copyright notice and
            permission notice must be retained in copies or substantial portions of the
            software, and the software is provided &ldquo;as is&rdquo;, without warranty
            of any kind.
          </p>
        </div>

        <Callout title="Dependencies keep their own licences">
          The MIT License covers this project&rsquo;s source. It does not relicense the
          third-party packages compiled into the bundle — each of those stays under the
          licence its authors chose, and those terms travel with any copy you
          redistribute.
        </Callout>

        <div className="mt-4 overflow-hidden rounded border border-line">
          {DEPENDENCY_LICENCES.map((row, i) => (
            <div
              key={row.licence}
              className={`flex flex-col gap-0.5 bg-surface px-3 py-2 sm:flex-row sm:gap-4 ${
                i > 0 ? 'border-t border-line' : ''
              }`}
            >
              <code className="w-full shrink-0 font-mono text-xs text-accent sm:w-56">
                {row.licence}
              </code>
              <span className="text-sm text-fg-muted">{row.packages}</span>
            </div>
          ))}
        </div>

        <p className="mt-3 text-sm leading-relaxed text-fg-muted">
          Everything that reaches the browser is permissively licensed. The one entry
          worth reading twice is <code className="font-mono text-xs text-accent">dompurify</code>,
          which is offered under <em>either</em> MPL-2.0 or Apache-2.0; taking it under
          Apache-2.0 avoids MPL-2.0&rsquo;s file-level copyleft entirely. Nothing bundled
          here is under the GPL or any other licence that would reach back into this
          project&rsquo;s own terms. One dependency in the install tree,{' '}
          <code className="font-mono text-xs text-accent">argparse</code> (Python-2.0), is
          used only by <code className="font-mono text-xs text-accent">sql-formatter</code>&rsquo;s
          command-line entry point and is never bundled into the application.
        </p>

        <p className="mt-3 text-sm leading-relaxed text-fg-muted">
          The icons are <code className="font-mono text-xs text-accent">lucide-react</code>{' '}
          (ISC), compiled in as SVG components. No web fonts are bundled or fetched: the
          interface uses the system font stack, and the only font file in the build is the
          icon font Monaco ships inside its own MIT-licensed package. The application
          icons are original SVGs belonging to this project.
        </p>
      </Section>

      <Section title="Bundle and offline footprint">
        <ul className="space-y-1.5 text-sm text-fg-muted">
          <li>The application’s own entry chunk is around 133 kB raw (roughly 40 kB gzipped); every tool loads on demand.</li>
          <li>The editor is by far the largest asset at roughly 3.3 MB raw (about 860 kB gzipped) and is precached so it works offline.</li>
          <li>The service worker precaches 75 files, about 5.4 MB in total, which is what allows every tool to run with the network off.</li>
        </ul>
      </Section>
    </PageShell>
  );
}
