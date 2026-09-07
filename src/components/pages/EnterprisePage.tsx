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
            { ok: true, text: 'The source is public and MIT licensed, so a security team can review the implementation directly and you are permitted to host it yourself.' },
            { ok: true, text: 'Once loaded it works offline, so an air-gapped or restricted workstation is workable.' },
          ]}
        />
      </Section>

      <Section
        title="Licensing: what you are permitted to do"
        lead="This used to be the largest gap on this page. It is now settled."
      >
        <div className="space-y-3 text-sm leading-relaxed text-fg-muted">
          <p>
            <strong className="text-fg">Dev X-Ray&rsquo;s source code is licensed under the
            MIT License.</strong> The full text is in the{' '}
            <code className="font-mono text-xs text-accent">LICENSE</code> file at the root
            of the public repository.
          </p>
          <p>
            That means an organisation may use, modify, distribute and self-host it,
            including for commercial purposes and on internal infrastructure, without
            asking for permission or negotiating an agreement. The conditions are the
            ordinary MIT ones: keep the copyright notice and the permission notice with
            copies or substantial portions of the software.
          </p>
          <p>
            Third-party dependencies are not relicensed by this. Each keeps the licence
            its authors chose — all permissive for everything that ships to the browser —
            and those terms travel with any build you redistribute. The Technology page
            lists them.
          </p>
        </div>

        <Callout tone="warning" title="A licence is not a product">
          MIT settles the legal question of whether you may run it. It does not supply an
          identity integration, an administrator, a support desk or an auditor, and it
          carries an explicit disclaimer of warranty. The section below is what that
          actually leaves missing.
        </Callout>
      </Section>

      <Section
        title="What does not exist yet"
        lead="The MIT licence grants a right to run the software. It provides none of the following, and none of the following exists in any other form either."
      >
        <Callout tone="warning" title="Please read this before planning a rollout">
          <ul className="list-inside list-disc space-y-1.5">
            <li>
              <strong>There is no enterprise SSO.</strong> The application has no concept
              of a user, a session or an identity provider — no SAML, no OIDC, no SCIM.
              Access control would come entirely from whatever fronts the static host: a
              reverse proxy, an identity-aware proxy, or a private network. Nothing
              SSO-related is built in.
            </li>
            <li>
              <strong>There is no centralised administration.</strong> No admin console,
              no tenant model, no central policy, no ability to disable individual tools
              for an organisation, and no way to push configuration to installs.
            </li>
            <li>
              <strong>There is no enterprise management plane.</strong> Nothing exists to
              enrol, inventory, monitor or remotely manage deployments, and there is no
              audit logging — logging usage would require exactly the telemetry the
              project deliberately does not have.
            </li>
            <li>
              <strong>There is no commercial support.</strong> No support offering, no
              SLA, no paid tier, no commercial agreement and no maintenance commitment.
              The MIT License explicitly disclaims warranty.
            </li>
            <li>
              <strong>There are no compliance certifications.</strong> No SOC 2, no
              ISO 27001, no HIPAA or GDPR attestation, and no third-party audit or
              published SBOM. The architecture may make a review easier because there is
              less to review; that is not the same as being certified.
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
          happens to suit internal hosting, and whose MIT licence means you are free to
          host it. It is still <strong className="text-fg">not an enterprise
          product</strong>: there is no SSO, no centralised administration, no management
          plane, no commercial support and no certifications. The licence removes the
          permission question and nothing else. Treat the rest of this page as a
          description of properties that already hold and of a plausible direction — not
          as a commercial offering.
        </p>
      </Section>
    </PageShell>
  );
}
