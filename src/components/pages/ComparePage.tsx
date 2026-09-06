import { PageShell } from './PageShell';
import { Callout, Section } from './TrustPrimitives';
import type { ContentPageId } from '@/constants/routes';

interface Props {
  onNavigate: (pageId: ContentPageId) => void;
  onBack: () => void;
}

interface Category {
  readonly name: string;
  readonly what: string;
  readonly goodAt: string;
  readonly tradeoff: string;
}

/**
 * Categories, not named products. Specific tools change their behaviour over
 * time and a stale claim about someone else's app would be both unfair and
 * unverifiable — so this page compares approaches instead.
 */
const CATEGORIES: readonly Category[] = [
  {
    name: 'Online utility sites',
    what: 'Single-purpose pages found through search: a JSON formatter, a JWT decoder, a cron parser.',
    goodAt: 'Immediate. Nothing to install, and search puts them one click away at the moment you need them.',
    tradeoff:
      'You generally cannot tell where processing happens or what is retained, and you are making that judgement mid-debug. Many are ad-supported, which means third-party scripts on a page you just pasted a payload into.',
  },
  {
    name: 'Desktop developer utility apps',
    what: 'Native applications bundling many of the same tools.',
    goodAt: 'Local processing, fast, well integrated with the OS, usually offline by nature.',
    tradeoff:
      'Requires installation and is typically tied to one platform, which is a problem on locked-down or shared machines. Updates go through an installer rather than a refresh.',
  },
  {
    name: 'Data-pipeline tools',
    what: 'Compose operations into a chain — decode, then decrypt, then parse, then extract.',
    goodAt: 'Unmatched for multi-step transformations and analysis where the pipeline itself is the work.',
    tradeoff:
      'The pipeline model is more machinery than you want when the job is simply "format this and move on". Different problem, not a worse one.',
  },
  {
    name: 'Editor and IDE extensions',
    what: 'Formatting and decoding available inside the editor you already have open.',
    goodAt: 'Zero context switch, and it works on the file already in front of you.',
    tradeoff:
      'Coverage is uneven across the long tail, quality varies by extension, and extensions run with the trust level of your editor. Data pasted from outside the project still has to get in somehow.',
  },
  {
    name: 'Internal enterprise utilities',
    what: 'Tools an organisation builds or hosts for its own engineers.',
    goodAt: 'Fully under organisational control, and can be tailored to internal formats and contracts.',
    tradeoff:
      'Someone has to build and maintain them, and in practice they tend to cover a handful of cases while engineers quietly use public sites for everything else.',
  },
];

export function ComparePage({ onNavigate, onBack }: Props) {
  return (
    <PageShell
      current="compare"
      title="Why not just use something else?"
      lead="A fair question, and often the right answer. This page compares approaches rather than naming products, because specific tools change and a stale claim about someone else's app would be neither fair nor verifiable."
      onNavigate={onNavigate}
      onBack={onBack}
    >
      <Section title="The categories">
        <div className="space-y-3">
          {CATEGORIES.map((c) => (
            <div key={c.name} className="rounded border border-line bg-surface p-3">
              <p className="mb-1 text-sm font-semibold text-fg">{c.name}</p>
              <p className="mb-2 text-sm text-fg-muted">{c.what}</p>
              <dl className="space-y-1 text-sm">
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0 text-[11px] uppercase tracking-[0.08em] text-success">
                    Strong at
                  </dt>
                  <dd className="text-fg-muted">{c.goodAt}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0 text-[11px] uppercase tracking-[0.08em] text-warning">
                    Trade-off
                  </dt>
                  <dd className="text-fg-muted">{c.tradeoff}</dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Where Dev X-Ray sits"
        lead="It is optimised for one specific workflow, and it is worth being clear about which."
      >
        <div className="space-y-3 text-sm leading-relaxed text-fg-muted">
          <p>
            The workflow is: <strong className="text-fg">you have a piece of developer
            data in front of you, it might be sensitive, and you want to inspect or
            reshape it right now without thinking about where it goes.</strong>
          </p>
          <p>
            It takes the accessibility of an online utility — a URL, nothing to install,
            works on any machine including one where you cannot install software — and
            removes the part that makes those uncomfortable, by not having a server at
            all. Then it adds the things a bundle of separate sites cannot: shared
            history, share links, file routing between tools, and an offline mode that
            covers every tool.
          </p>
        </div>
      </Section>

      <Section title="When something else is the better choice">
        <Callout tone="warning" title="Honest limits">
          <ul className="list-inside list-disc space-y-1.5">
            <li>
              If you need multi-step transformation pipelines, a purpose-built pipeline
              tool is genuinely better at that.
            </li>
            <li>
              If you want tools inside your editor with no context switch, an extension
              wins on ergonomics.
            </li>
            <li>
              If you need API request execution, collections and environments, this is not
              an API client and does not try to be.
            </li>
            <li>
              If your organisation requires certified, audited software, Dev X-Ray holds
              no certifications today.
            </li>
          </ul>
        </Callout>
      </Section>
    </PageShell>
  );
}
