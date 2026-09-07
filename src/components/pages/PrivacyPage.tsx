import { useCallback, useState } from 'react';
import { Copy } from 'lucide-react';
import { toast } from 'sonner';
import { PageShell } from './PageShell';
import {
  ArchitectureDiagram,
  Badge,
  Callout,
  DataLifecycle,
  DataMatrix,
  Section,
  type MatrixRow,
} from './TrustPrimitives';
import type { ContentPageId } from '@/constants/routes';
import { copyText } from '@/utils/clipboard';
import { CONFIG, STORAGE_KEYS } from '@/utils/constants';

/**
 * Every statement on this page maps to something verified in
 * docs/PRIVACY_ARCHITECTURE.md. Where a claim would be stronger than the
 * evidence, the weaker true statement is used instead.
 */

const MATRIX: readonly MatrixRow[] = [
  {
    action: 'JSON / YAML / XML / SQL formatting',
    processing: 'Browser (Web Worker above 100 kB for JSON)',
    storage: 'Not persisted',
    storageKind: 'none',
    network: 'None',
    networkKind: 'none',
  },
  {
    action: 'JWT decoding & verification',
    processing: 'Browser (Web Crypto)',
    storage: 'Not persisted',
    storageKind: 'none',
    network: 'None',
    networkKind: 'none',
  },
  {
    action: 'Regex testing',
    processing: 'Browser Web Worker',
    storage: 'Not persisted',
    storageKind: 'none',
    network: 'None',
    networkKind: 'none',
  },
  {
    action: 'File drop',
    processing: 'Browser (FileReader stream)',
    storage: 'Not persisted',
    storageKind: 'none',
    network: 'None',
    networkKind: 'none',
  },
  {
    action: 'History entry',
    processing: 'Browser',
    storage: 'localStorage',
    storageKind: 'persisted',
    network: 'None',
    networkKind: 'none',
  },
  {
    action: 'Mapper state',
    processing: 'Browser',
    storage: 'localStorage',
    storageKind: 'persisted',
    network: 'None',
    networkKind: 'none',
  },
  {
    action: 'Preferences (theme, tabs)',
    processing: 'Browser',
    storage: 'localStorage',
    storageKind: 'persisted',
    network: 'None',
    networkKind: 'none',
  },
  {
    action: 'Share link (you click Share)',
    processing: 'Browser',
    storage: 'Encoded into the URL',
    storageKind: 'url',
    network: 'None',
    networkKind: 'none',
  },
  {
    action: 'Loading the app itself',
    processing: 'Browser',
    storage: 'Service-worker cache',
    storageKind: 'persisted',
    network: 'Static files from the host',
    networkKind: 'network',
  },
];

const SAMPLE_PAYLOAD = JSON.stringify(
  {
    note: 'Fake data for testing Dev X-Ray. Do not paste real secrets anywhere.',
    customer: { id: 'cus_TEST_0000', email: 'not-a-real-person@example.invalid' },
    apiKey: 'sk_test_00000000000000000000',
    balanceCents: 4200,
  },
  null,
  2,
);

interface Props {
  onNavigate: (pageId: ContentPageId) => void;
  onBack: () => void;
}

export function PrivacyPage({ onNavigate, onBack }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopySample = useCallback(() => {
    void copyText(SAMPLE_PAYLOAD).then((ok) => {
      if (ok) {
        setCopied(true);
        toast.success('Fake test payload copied');
      } else {
        toast.error('Could not access the clipboard');
      }
    });
  }, []);

  return (
    <PageShell
      current="privacy"
      title="Where your data actually goes"
      lead="Dev X-Ray processes developer data in your browser. This page states exactly what that does and does not mean, and shows you how to check it yourself rather than take our word for it."
      onNavigate={onNavigate}
      onBack={onBack}
    >
      <Section
        title="The short version"
        lead="Three claims, each verifiable with the browser DevTools you already have."
      >
        <ul className="space-y-2 text-sm leading-relaxed text-fg-muted">
          <li>
            <strong className="text-fg">There is no Dev X-Ray server.</strong> No backend,
            no database, no API. The app is a folder of static files. Nothing you type,
            paste or drop is sent anywhere by the application.
          </li>
          <li>
            <strong className="text-fg">There is no analytics or telemetry.</strong> No
            analytics SDK, tag manager, error reporter or beacon is bundled — there is no
            code in the app capable of reporting your activity.
          </li>
          <li>
            <strong className="text-fg">Some things are stored — locally.</strong>{' '}
            Preferences, history and Mapper state are written to your browser&rsquo;s own{' '}
            <code className="rounded bg-surface-sunken px-1 font-mono text-xs">
              localStorage
            </code>
            . That is on your machine, not ours, and you can clear it at any time.
          </li>
        </ul>
      </Section>

      <Section
        title="&ldquo;Not sent to a server&rdquo; is not the same as &ldquo;not stored anywhere&rdquo;"
        lead="These two claims get conflated constantly, so here is the distinction as it applies to this app."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded border border-line bg-surface p-3">
            <p className="mb-2 text-sm font-medium text-fg">What never leaves your browser</p>
            <p className="text-sm leading-relaxed text-fg-muted">
              The content you work on — payloads, tokens, files, queries. No application
              code transmits it, which the network audit confirms end to end.
            </p>
          </div>
          <div className="rounded border border-line bg-surface p-3">
            <p className="mb-2 text-sm font-medium text-fg">What is nonetheless stored</p>
            <p className="text-sm leading-relaxed text-fg-muted">
              Your browser can retain data in memory, localStorage, the service-worker
              cache, its own address-bar history, and the clipboard. Those are real
              storage locations. They are on your device, but they are not &ldquo;nowhere&rdquo;.
            </p>
          </div>
        </div>
      </Section>

      <Section title="The architecture">
        <ArchitectureDiagram />
      </Section>

      <Section
        title="Where does my data go?"
        lead="One row per action, populated from the implementation rather than from intent."
      >
        <DataMatrix rows={MATRIX} />
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-fg-subtle">
          <Badge kind="local" /> processed in the browser
          <Badge kind="none" /> discarded when you close the tab
          <Badge kind="persisted" /> written to your browser storage
          <Badge kind="url" /> encoded into a link you chose to create
          <Badge kind="network" /> leaves the browser
        </div>
      </Section>

      <Section
        title="Exactly what is persisted"
        lead="Three localStorage keys. Nothing else is written by the application."
      >
        <div className="space-y-3">
          <div className="rounded border border-line bg-surface p-3">
            <code className="font-mono text-xs text-accent">{STORAGE_KEYS.preferences}</code>
            <p className="mt-1 text-sm text-fg-muted">
              Theme, pinned tabs, tab order, last active tool, navigation panel state. No
              tool content.
            </p>
          </div>
          <div className="rounded border border-line bg-surface p-3">
            <code className="font-mono text-xs text-accent">{STORAGE_KEYS.history}</code>
            <p className="mt-1 text-sm text-fg-muted">
              Up to {CONFIG.MAX_HISTORY_ENTRIES} entries, each field clipped to 2,000
              characters, with a total budget of{' '}
              {CONFIG.MAX_HISTORY_CHARS.toLocaleString()} characters. Written only on
              deliberate actions — never on every keystroke.{' '}
              <strong className="text-fg">JWT is excluded entirely.</strong>
            </p>
          </div>
          <div className="rounded border border-line bg-surface p-3">
            <code className="font-mono text-xs text-accent">{STORAGE_KEYS.mapper}</code>
            <p className="mt-1 text-sm text-fg-muted">
              Mapper inputs and mapping rows, so a mapping survives a reload. A single
              pasted input larger than{' '}
              {CONFIG.MAX_MAPPER_INPUT_CHARS.toLocaleString()} characters is kept in memory
              for the session but not written to storage.
            </p>
          </div>
        </div>
      </Section>

      <Section title="Per-action lifecycle">
        <div className="grid gap-3 sm:grid-cols-2">
          <DataLifecycle
            title="JWT decode"
            stages={[
              { label: 'Input', value: 'Browser memory', kind: 'local' },
              { label: 'Processing', value: 'Browser + Web Crypto', kind: 'local' },
              { label: 'Storage', value: 'Not persisted', kind: 'none' },
              { label: 'Network', value: 'None', kind: 'none' },
            ]}
            note="Tokens and secrets are never written to history. A token does enter a URL if you click Share."
          />
          <DataLifecycle
            title="Regex test"
            stages={[
              { label: 'Input', value: 'Browser memory', kind: 'local' },
              { label: 'Processing', value: 'Web Worker', kind: 'local' },
              { label: 'Storage', value: 'Not persisted', kind: 'none' },
              { label: 'Network', value: 'None', kind: 'none' },
            ]}
            note="The worker is terminated if a pattern runs longer than 2.5 seconds."
          />
          <DataLifecycle
            title="File drop"
            stages={[
              { label: 'Input', value: 'Local file', kind: 'local' },
              { label: 'Processing', value: 'Browser FileReader', kind: 'local' },
              { label: 'Storage', value: 'Not persisted', kind: 'none' },
              { label: 'Network', value: 'None', kind: 'none' },
            ]}
            note="The file is read into memory by the browser. There is no upload endpoint to send it to."
          />
          <DataLifecycle
            title="Share link"
            stages={[
              { label: 'Input', value: 'Current tool state', kind: 'local' },
              { label: 'Processing', value: 'Compressed in browser', kind: 'local' },
              { label: 'Storage', value: 'Encoded in the URL', kind: 'url' },
              { label: 'Network', value: 'None at creation', kind: 'none' },
            ]}
            note="Compression is not encryption. Anyone holding the link holds the data."
          />
        </div>
      </Section>

      <Section
        title="Turn off Wi-Fi. Keep working."
        lead="Because processing is local, cutting the network does not stop the tools. This is the strongest practical evidence that your data is not being sent anywhere: an app that needs your data on a server cannot work without one."
      >
        <div className="rounded border border-line bg-surface p-4">
          <ol className="space-y-1.5 text-sm text-fg-muted">
            {[
              'Load Dev X-Ray once, online.',
              'Disable your network — airplane mode, or DevTools → Network → Offline.',
              'Reload the page. It still boots.',
              'Format JSON, decode a JWT, run a regex, convert a timestamp, format GraphQL.',
              'Everything still works.',
            ].map((step, i) => (
              <li key={step} className="flex gap-2.5">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[11px] font-semibold text-accent">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <p className="mt-3 border-t border-line pt-3 text-xs text-fg-subtle">
            Verified: with the network disabled, the app boots from the service-worker
            cache and every tool — including ones never opened before, and the bundled
            editor — loads and computes. The one requirement is that the first visit
            happens online, so the browser can cache the app.
          </p>
        </div>
      </Section>

      <Section
        title="Don't take our word for it"
        lead="You do not have to trust this page. You can watch the network yourself in about a minute."
      >
        <ol className="mb-4 space-y-2 text-sm leading-relaxed text-fg-muted">
          <li>1. Open Dev X-Ray and open your browser&rsquo;s DevTools.</li>
          <li>2. Go to the <strong className="text-fg">Network</strong> tab.</li>
          <li>3. Clear the request list, and leave &ldquo;Preserve log&rdquo; on.</li>
          <li>
            4. Use a tool — paste the fake payload below into JSON, decode a JWT, run a
            regex, drop a file.
          </li>
          <li>
            5. Watch the list. Filter by <strong className="text-fg">Fetch/XHR</strong> and
            by <strong className="text-fg">WS</strong> (WebSocket).
          </li>
          <li>
            6. Then set the throttling dropdown to <strong className="text-fg">Offline</strong>{' '}
            and keep using the tools.
          </li>
        </ol>

        <Callout title="What you should see">
          Requests only while the app itself is loading — HTML, JavaScript, CSS, fonts and
          the service worker, all from the same origin that served the page. No Fetch/XHR
          and no WebSocket traffic while you are using a tool. No third-party domains at
          any point. If you ever see otherwise on an official deployment, that is a bug
          worth reporting.
        </Callout>

        <p className="mt-3 text-sm leading-relaxed text-fg-muted">
          If watching the network is not enough, read the code. The source is public and
          MIT licensed, which means you are also free to build it yourself and serve your
          own copy — the strongest available check that what runs in your browser is what
          the repository says it is.
        </p>

        <div className="mt-4 rounded border border-line bg-surface p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-fg">Fake test payload</p>
            <button
              type="button"
              onClick={handleCopySample}
              className="inline-flex items-center gap-1.5 rounded border border-line px-2 py-1 text-xs text-fg-muted hover:bg-surface-raised hover:text-fg"
            >
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              {copied ? 'Copy again' : 'Copy test payload'}
            </button>
          </div>
          <pre className="overflow-x-auto rounded bg-surface-sunken p-2.5 font-mono text-xs text-fg-muted dx-scrollbar">
            {SAMPLE_PAYLOAD}
          </pre>
          <p className="mt-2 text-xs text-fg-subtle">
            Deliberately fake, and shaped to look sensitive so it is easy to spot in a
            request body. Never use a real secret to test a tool — including this one.
          </p>
        </div>
      </Section>

      <Section
        title="What this page does not claim"
        lead="Being precise about the limits is part of being trustworthy about the rest."
      >
        <Callout tone="warning" title="Honest limits">
          <ul className="list-inside list-disc space-y-1.5">
            <li>
              <strong>Share links are not private.</strong> State is compressed into the
              URL, and compression is reversible by design. Anyone with the link can
              recover the contents.
            </li>
            <li>
              <strong>Your browser keeps its own records.</strong> Address-bar history,
              the clipboard and browser sync are outside this application&rsquo;s control.
            </li>
            <li>
              <strong>Browser extensions can read page content.</strong> Any extension you
              have installed can see what you type, in this app as in any other.
            </li>
            <li>
              <strong>Whoever hosts the files sees the requests for them.</strong> A host
              can see that a browser requested the app, along with the usual IP and
              user-agent metadata in its server logs. It does not see what you then do in
              the app.
            </li>
            <li>
              <strong>We do not claim the app is &ldquo;secure&rdquo; or &ldquo;unhackable&rdquo;,</strong>{' '}
              and we hold no compliance certifications.
            </li>
          </ul>
        </Callout>
      </Section>
    </PageShell>
  );
}
