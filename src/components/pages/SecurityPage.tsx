import { PageShell } from './PageShell';
import { Callout, DataLifecycle, Section } from './TrustPrimitives';
import type { ContentPageId } from '@/constants/routes';
import { CONFIG } from '@/utils/constants';

interface Props {
  onNavigate: (pageId: ContentPageId) => void;
  onBack: () => void;
}

interface ThreatRow {
  readonly threat: string;
  readonly mitigation: string;
  readonly residual: string;
}

const THREATS: readonly ThreatRow[] = [
  {
    threat: 'Accidental upload of pasted data',
    mitigation:
      'No application code performs network I/O. Verified by source audit and by a request-level network capture across ten usage scenarios.',
    residual:
      'A future contributor could add a network call. The privacy architecture doc exists to make that a deliberate, reviewable decision.',
  },
  {
    threat: 'Third-party analytics or telemetry',
    mitigation:
      'No analytics, tag manager, error reporter or beacon is bundled. There is no code path capable of reporting activity.',
    residual: 'Re-introducing a dependency with a network side effect would change this.',
  },
  {
    threat: 'A dependency that phones home',
    mitigation:
      'Dependencies are bundled at build time and execute locally. The network capture shows no third-party origins at runtime.',
    residual:
      'Supply-chain compromise of an npm package remains a real risk for any JS project. Lockfile pinning limits it; it does not eliminate it.',
  },
  {
    threat: 'Secrets persisted in history',
    mitigation:
      'JWT never writes to history. Other tools clip stored fields to 2,000 characters and only record on deliberate actions.',
    residual:
      'A secret pasted into a non-JWT tool (say, Base64) and then copied can enter local history. Clearing history removes it.',
  },
  {
    threat: 'Secrets leaked through share URLs',
    mitigation:
      'Share links are created only on an explicit click, are copied to the clipboard rather than pushed into the address bar, and an incoming share hash is stripped from the URL on load.',
    residual:
      'The link itself contains the data in recoverable form. Sharing it shares the contents. This is inherent to the feature.',
  },
  {
    threat: 'XSS through rendered Markdown',
    mitigation:
      'Markdown is parsed then sanitised with DOMPurify before it reaches the DOM; raw parser output is never assigned directly. Inline style attributes are stripped in addition to the default allowlist.',
    residual:
      'A sanitiser bypass in DOMPurify would affect this app as it would any other consumer.',
  },
  {
    threat: 'Catastrophic regex execution freezing the tab',
    mitigation: `Pattern syntax is validated on the main thread; execution happens in a Web Worker that is terminated after ${CONFIG.REGEX_WORKER_TIMEOUT_MS / 1000} seconds.`,
    residual:
      'A pathological pattern still burns CPU for the duration of the timeout before the worker is killed.',
  },
  {
    threat: 'Data left in browser storage on a shared machine',
    mitigation:
      'Only three localStorage keys are written, all clearable from the app or from browser settings.',
    residual:
      'Anyone with access to the same browser profile can read that storage. This is true of any local-first app.',
  },
  {
    threat: 'Compromised deployment serving modified code',
    mitigation:
      'The source is public and can be compared against what is served. Static hosting has a small attack surface — there is no server-side application to compromise.',
    residual:
      'A compromised host could serve altered JavaScript. There is currently no subresource-integrity or signed-build mechanism.',
  },
  {
    threat: 'Malicious browser extensions',
    mitigation: 'None available to the application.',
    residual:
      'Extensions with page access can read anything you type into any web page. Entirely outside this application’s control.',
  },
  {
    threat: 'Clipboard exposure',
    mitigation:
      'Copy actions are explicit and user-initiated. Nothing is written to the clipboard automatically.',
    residual:
      'The system clipboard is shared with every application, and on some platforms is synced across devices.',
  },
];

export function SecurityPage({ onNavigate, onBack }: Props) {
  return (
    <PageShell
      current="security"
      title="Security engineering decisions"
      lead="The specific choices behind the tools that touch sensitive material, and — just as importantly — what each one does not protect you from."
      onNavigate={onNavigate}
      onBack={onBack}
    >
      <Section
        title="JWT: decoding is not verification"
        lead="This is the single most misunderstood thing about JWT tooling, so the app is built to make the distinction obvious."
      >
        <div className="mb-4 space-y-3 text-sm leading-relaxed text-fg-muted">
          <p>
            <strong className="text-fg">Decoding</strong> a JWT is just base64url and
            JSON. It proves nothing about who issued the token or whether it has been
            tampered with. Dev X-Ray decodes immediately and always, because that step
            requires no secret and carries no authority.
          </p>
          <p>
            <strong className="text-fg">Verification</strong> is a separate, explicit
            action requiring a secret you supply. It runs through the browser&rsquo;s Web
            Crypto implementation (<code className="rounded bg-surface-sunken px-1 font-mono text-xs">crypto.subtle</code>),
            supporting HS256, HS384 and HS512. A valid result means the signature matched
            the secret you provided — nothing more.
          </p>
          <p>
            Editing the token, the secret or the algorithm after a successful check clears
            the result, so a green badge can never remain attached to input that has since
            changed.
          </p>
        </div>

        <Callout title="Why the algorithm is never read from the token">
          The verification algorithm comes from the dropdown you choose, never from the
          token&rsquo;s own <code className="font-mono text-xs">alg</code> header. A
          token&rsquo;s header is part of the document being authenticated — trusting it to
          decide how that same document gets checked is the shape of the classic
          &ldquo;algorithm confusion&rdquo; vulnerability. The app shows a warning when your
          selection disagrees with the header&rsquo;s claim, but that warning is
          informational and never changes which key or algorithm is actually used.
        </Callout>

        <div className="mt-4">
          <DataLifecycle
            title="JWT"
            stages={[
              { label: 'Input', value: 'Browser memory', kind: 'local' },
              { label: 'Decode', value: 'Browser', kind: 'local' },
              { label: 'Verify', value: 'Web Crypto, local', kind: 'local' },
              { label: 'History', value: 'Excluded entirely', kind: 'none' },
              { label: 'Network', value: 'None', kind: 'none' },
            ]}
            note="History persists to localStorage, so storing a raw token there would contradict the tool's own promise. JWT is the one tool deliberately excluded from history."
          />
        </div>

        <Callout tone="warning" title="Still worth saying">
          Do not paste production secrets into any tool, including this one. Local
          processing reduces where a secret travels; it does not make handling a live
          production secret a good idea.
        </Callout>
      </Section>

      <Section
        title="Regex: execution that can be interrupted"
        lead="A regular expression with nested quantifiers can take exponential time on a short string. In a normal page that freezes the tab with no way out, because JavaScript cannot interrupt itself mid-execution."
      >
        <ul className="space-y-2 text-sm leading-relaxed text-fg-muted">
          <li>
            <strong className="text-fg">Syntax validation runs on the main thread.</strong>{' '}
            Constructing a pattern only parses it and can never hang, so an invalid
            pattern is reported instantly with no round trip.
          </li>
          <li>
            <strong className="text-fg">Execution runs in a Web Worker.</strong> Only
            running a compiled pattern against a string carries the risk, and only that
            step is sent off the main thread.
          </li>
          <li>
            <strong className="text-fg">
              The worker is terminated after {CONFIG.REGEX_WORKER_TIMEOUT_MS / 1000} seconds.
            </strong>{' '}
            Terminating the worker is the only way to actually stop a synchronous
            execution from outside; a fresh worker is created for the next request, so one
            runaway pattern does not disable the tool.
          </li>
        </ul>
      </Section>

      <Section
        title="Files stay on your machine"
        lead="Dropped files are read by the browser's own FileReader and never transmitted — there is no upload endpoint in the application to transmit them to."
      >
        <ul className="space-y-1.5 text-sm text-fg-muted">
          <li>Files are streamed into memory and routed to the tool that handles that extension.</li>
          <li>Files larger than 25 MB are refused outright rather than freezing the tab.</li>
          <li>Only the first file of a multi-file drop is processed; each tool takes one document.</li>
        </ul>
      </Section>

      <Section
        title="Share links: convenient, not confidential"
        lead="This feature deserves the bluntest description on the site, because a URL looks private and is not."
      >
        <Callout tone="warning" title="A share link is not a secret vault">
          Tool state is JSON, compressed with lz-string and placed in the URL fragment.
          <strong> Compression is not encryption.</strong> Anyone who receives the link can
          recover exactly what it encodes. Treat a share link as being as sensitive as the
          data inside it.
        </Callout>
        <div className="mt-4 space-y-2 text-sm leading-relaxed text-fg-muted">
          <p>
            What the design does get right is scope. A link is produced only when you click
            Share, and it is written to your clipboard — the page&rsquo;s own address bar is
            not modified, so state does not silently accumulate in your browser history as
            you work. When you open someone else&rsquo;s share link, the fragment is read
            once and then stripped from the URL.
          </p>
          <p>
            The fragment of a URL is also not normally transmitted to a web server by the
            browser. That is a genuine property, but it is a weak guarantee to lean on:
            links get pasted into chat, tickets and email, all of which do see the whole
            string.
          </p>
        </div>
      </Section>

      <Section
        title="Dependencies: bundled, not phoning home"
        lead="Third-party packages are compiled into the application at build time and execute in your browser like the rest of the code."
      >
        <p className="text-sm leading-relaxed text-fg-muted">
          Using an npm package does not mean your input reaches that package&rsquo;s authors.
          A bundled library is just code running locally. The distinction that matters is
          whether a dependency <em>performs network communication</em> — and in this app
          the runtime network capture shows no third-party origins during any tool
          operation. What that does not eliminate is supply-chain risk: a compromised
          package could introduce behaviour that a future audit would need to catch.
        </p>
      </Section>

      <Section
        title="Threat model"
        lead="Stated as threat, mitigation and residual risk. Where the answer is 'nothing we can do', it says so."
      >
        <div className="space-y-3">
          {THREATS.map((row) => (
            <div key={row.threat} className="rounded border border-line bg-surface p-3">
              <p className="mb-2 text-sm font-semibold text-fg">{row.threat}</p>
              <dl className="space-y-1.5 text-sm">
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0 text-[11px] uppercase tracking-[0.08em] text-success">
                    Mitigation
                  </dt>
                  <dd className="text-fg-muted">{row.mitigation}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0 text-[11px] uppercase tracking-[0.08em] text-warning">
                    Residual
                  </dt>
                  <dd className="text-fg-muted">{row.residual}</dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
        <p className="mt-4 text-sm text-fg-subtle">
          No security claim here is absolute. Dev X-Ray is a local-first developer tool,
          not a hardened secrets-handling system, and it holds no security certifications.
        </p>
      </Section>
    </PageShell>
  );
}
