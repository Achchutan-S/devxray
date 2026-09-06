import { PageShell } from './PageShell';
import { Callout, CheckList, Section } from './TrustPrimitives';
import type { ContentPageId } from '@/constants/routes';

interface Props {
  onNavigate: (pageId: ContentPageId) => void;
  onBack: () => void;
}

export function EnterprisePage({ onNavigate, onBack }: Props) {
  return (
    <PageShell
      current="enterprise"
      title="Running it inside an organisation"
      lead="Dev X-Ray builds to static files with no backend and no database, which makes hosting it internally unusually simple. This page describes that honestly — including what does not exist yet."
      onNavigate={onNavigate}
      onBack={onBack}
    >
      <Section title="The problem this addresses">
        <div className="space-y-3 text-sm leading-relaxed text-fg-muted">
          <p>
            Engineers at every organisation format JSON, decode tokens and inspect
            payloads dozens of times a day. When the convenient option is a public
            website, some fraction of that traffic is internal data being pasted into
            infrastructure nobody reviewed.
          </p>
          <p>
            Usually no policy covers it, because it does not feel like data egress. It
            just feels like formatting something.
          </p>
          <p className="text-fg">
            Hosting a browser-first toolkit internally removes the reason to reach for a
            public one.
          </p>
        </div>
      </Section>

      <Section
        title="Why the architecture makes this straightforward"
        lead="These are properties of the build output, not features that needed to be added."
      >
        <CheckList
          items={[
            { ok: true, text: 'The build output is a folder of static files — HTML, JavaScript, CSS and SVG icons.' },
            { ok: true, text: 'No application backend to deploy, patch or monitor.' },
            { ok: true, text: 'No database, so there is no store of developer data to secure or retain.' },
            { ok: true, text: 'No outbound network calls from the application, so egress rules have little to constrain.' },
            { ok: true, text: 'It can be served from any static host, including one only reachable on an internal network.' },
            { ok: true, text: 'Because it is served like any other internal web app, it can sit behind whatever access controls already protect that host.' },
            { ok: true, text: 'The source is publicly readable, so a security team can review the implementation directly.' },
            { ok: true, text: 'Once loaded it works offline, so an air-gapped or restricted workstation is workable.' },
          ]}
        />
      </Section>

      <Section title="What does not exist yet">
        <Callout tone="warning" title="Please read this before planning a rollout">
          <ul className="list-inside list-disc space-y-1.5">
            <li>
              <strong>No licence is currently declared.</strong> The source is public and
              readable, but without a licence file the default is that all rights are
              reserved. An organisation wanting to host it internally should ask first.
              This is the most important gap on this page.
            </li>
            <li>
              <strong>There is no SSO integration.</strong> The application has no concept
              of a user or a session. Access control would come entirely from whatever
              fronts the static host — a reverse proxy, an identity-aware proxy, or a
              private network. Nothing SSO-related is built in.
            </li>
            <li>
              <strong>There are no compliance certifications.</strong> No SOC 2, no
              ISO 27001, no HIPAA or GDPR attestation. The architecture may make a review
              easier because there is less to review; that is not the same as being
              certified.
            </li>
            <li>
              <strong>There is no support offering, SLA or commercial agreement.</strong>
            </li>
            <li>
              <strong>There is no admin console,</strong> no central policy, no ability to
              disable individual tools, and no audit logging — logging usage would require
              exactly the telemetry the project deliberately does not have.
            </li>
          </ul>
        </Callout>
      </Section>

      <Section
        title="An honest summary"
        lead="Where this genuinely stands today."
      >
        <p className="text-sm leading-relaxed text-fg-muted">
          Dev X-Ray is a well-built local-first developer toolkit whose architecture
          happens to suit internal hosting. It is <strong className="text-fg">not an
          enterprise product</strong> today: there is no licence, no support, no
          certifications and no administrative tooling. Treat this page as a description
          of a plausible direction and of properties that already hold — not as a
          commercial offering. If your organisation has a real use case, the useful next
          step is a conversation about licensing.
        </p>
      </Section>
    </PageShell>
  );
}
