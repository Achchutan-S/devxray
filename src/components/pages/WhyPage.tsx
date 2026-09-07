import { PageShell } from './PageShell';
import { Callout, Section } from './TrustPrimitives';
import { CATEGORIES, tabsInCategory } from '@/constants/tabs';
import type { ContentPageId } from '@/constants/routes';

interface Props {
  onNavigate: (pageId: ContentPageId) => void;
  onBack: () => void;
}

export function WhyPage({ onNavigate, onBack }: Props) {
  return (
    <PageShell
      current="why"
      title="Why Dev X-Ray exists"
      lead="Developer tools sit in an uncomfortable place. The data you most often need to format, decode or inspect is exactly the data you should be most careful with."
      onNavigate={onNavigate}
      onBack={onBack}
    >
      <Section title="The uncomfortable habit">
        <div className="space-y-3 text-sm leading-relaxed text-fg-muted">
          <p>
            You have a production JWT. An internal API payload. A customer record. A
            config file. A GraphQL query. Some database output you need to read.
          </p>
          <p>
            And when you need to decode, format or inspect it quickly, the path of least
            resistance is almost always the same:
          </p>
          <p className="rounded border border-line bg-surface-sunken px-3 py-2 font-mono text-sm text-fg">
            copy → paste → some website you found in search results
          </p>
          <p>
            Most of those sites are fine. Some are ad-supported. A few are worse. The
            point is that you usually cannot tell, and you are making that judgement call
            at the exact moment you are least inclined to think about it — mid-debug,
            wanting an answer.
          </p>
          <p className="text-fg">
            Dev X-Ray exists to remove that trip entirely.
          </p>
        </div>
      </Section>

      <Section title="The principle">
        <Callout title="One idea, applied consistently">
          Your developer data should not need to leave your machine just because you need
          to format it.
        </Callout>
        <p className="mt-4 text-sm leading-relaxed text-fg-muted">
          Everything else follows from that. No backend, because a backend would need to
          receive your data. No account, because there is nothing to associate with you.
          No analytics, because instrumenting a privacy tool undermines the point. It
          works offline not as a feature bullet but as a consequence: an app that needs
          your data on a server cannot function without one.
        </p>
      </Section>

      <Section title="How it actually started">
        <div className="space-y-3 text-sm leading-relaxed text-fg-muted">
          <p>
            I was working with GraphQL, and formatting queries in Postman was becoming a
            pain. So I built a small GraphQL formatter.
          </p>
          <p>Then I needed JSON. Then cURL. Then JWT. Then Base64. Then Regex. Then Cron. Then CSV.</p>
          <p>
            Eventually the tiny formatter had turned into a workspace. That became Dev
            X-Ray. It was not designed as a product with 23 tools; it accumulated them,
            one annoyance at a time.
          </p>
        </div>
      </Section>

      <Section
        title="Not just utilities: the Mapper"
        lead="Most of these tools are commodities. This one is the exception, and it came from a different kind of problem."
      >
        <div className="space-y-3 text-sm leading-relaxed text-fg-muted">
          <p>
            When you integrate two APIs, the hard part usually is not transforming the
            data. It is working out <em>how fields correspond</em> — which field in the
            source payload is meant to become which field in the target contract, across
            two teams&rsquo; naming conventions.
          </p>
          <p>
            The Mapper flattens a source payload (JSON, or a GraphQL selection set) and a
            target contract into field paths, then proposes a mapping between them. It
            explains every suggestion through five ordered tiers:
          </p>
          <ol className="ml-4 list-decimal space-y-1">
            <li><strong className="text-fg">Exact path</strong> — the same path on both sides.</li>
            <li><strong className="text-fg">Normalised name</strong> — same tokens once case and separators are stripped, or one path&rsquo;s tokens fully contained in the other.</li>
            <li><strong className="text-fg">Alias</strong> — a single-word synonym table, applied only to individual tokens.</li>
            <li><strong className="text-fg">Structural</strong> — token-overlap similarity with a small bonus when inferred types agree, capped below the &ldquo;found&rdquo; threshold so it always lands as &ldquo;needs review&rdquo;.</li>
            <li><strong className="text-fg">None</strong> — no match, stated plainly.</li>
          </ol>
          <p>
            Every row carries a plain-English explanation of why it was suggested. It is
            deterministic and inspectable: the same inputs always produce the same
            mapping, and you can see the reasoning rather than a score. No model is
            involved, which also means nothing needs to be sent anywhere to get a
            suggestion.
          </p>
        </div>
      </Section>

      <Section
        title="What is actually defensible here?"
        lead="Worth being blunt, because overclaiming here would undercut everything else on this site."
      >
        <div className="space-y-3 text-sm leading-relaxed text-fg-muted">
          <p className="text-fg">
            The individual utilities are not unique. A JSON formatter is a JSON formatter.
          </p>
          <p>
            You can find every one of these tools elsewhere, often in several places, and
            many of those implementations are excellent. &ldquo;23 tools&rdquo; is not a moat and
            claiming otherwise would be silly.
          </p>
          <p>What is genuinely different is the combination:</p>
          <ul className="ml-4 list-disc space-y-1">
            <li>A privacy-first architecture that is a structural property, not a policy — there is no server to send data to.</li>
            <li>Claims you can verify yourself in a minute with DevTools, rather than a privacy policy asking for trust.</li>
            <li>Genuine offline operation, including the bundled editor and tools you have never opened.</li>
            <li>One integrated workspace with shared history, share links and file routing, instead of 23 separate sites.</li>
            <li>The Mapper, which does not have an obvious equivalent in the utility-bundle category.</li>
            <li>Publicly readable, MIT-licensed source, so the privacy claims can be checked against the implementation — and so you can self-host it rather than trust a deployment.</li>
          </ul>
          <p>
            The philosophy and the integrated experience are the differentiator. The
            utilities are the reason to show up.
          </p>
        </div>
      </Section>

      <Section title={`${tabsInCategory('format').length + tabsInCategory('encode').length + tabsInCategory('utility').length + tabsInCategory('data').length + tabsInCategory('manage').length} tools, one workspace`}>
        <div className="grid gap-3 sm:grid-cols-2">
          {CATEGORIES.map((category) => (
            <div key={category.id} className="rounded border border-line bg-surface p-3">
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.13em] text-fg-subtle">
                {category.label}
              </p>
              <p className="text-sm text-fg-muted">
                {tabsInCategory(category.id).map((t) => t.label).join(' · ')}
              </p>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Clay and Grass"
        lead="Two themes, named after the surfaces they borrow from."
      >
        <p className="text-sm leading-relaxed text-fg-muted">
          Dark mode is Clay: a warm terracotta environment with chalk-white court lines
          and deep green structural accents. Light mode is Grass: bottle green and
          aubergine on cream and white. They are the same application in two different
          rooms. The reference is carried entirely by colour, surface and geometry — there
          is no tennis imagery anywhere, and none is planned.
        </p>
      </Section>
    </PageShell>
  );
}
