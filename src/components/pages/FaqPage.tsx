import type { ReactNode } from 'react';
import { PageShell } from './PageShell';
import { Section } from './TrustPrimitives';
import type { ContentPageId } from '@/constants/routes';

interface Props {
  onNavigate: (pageId: ContentPageId) => void;
  onBack: () => void;
}

interface QA {
  readonly q: string;
  readonly a: ReactNode;
}

function Group({ title, items }: { title: string; items: readonly QA[] }) {
  return (
    <Section title={title}>
      <div className="divide-y divide-line overflow-hidden rounded border border-line">
        {items.map((item) => (
          <details key={item.q} className="group bg-surface">
            <summary className="cursor-pointer list-none px-3 py-2.5 text-sm font-medium text-fg marker:hidden hover:bg-surface-raised">
              <span className="mr-2 text-fg-subtle group-open:hidden" aria-hidden="true">+</span>
              <span className="mr-2 hidden text-fg-subtle group-open:inline" aria-hidden="true">−</span>
              {item.q}
            </summary>
            <div className="border-t border-line px-3 py-2.5 text-sm leading-relaxed text-fg-muted">
              {item.a}
            </div>
          </details>
        ))}
      </div>
    </Section>
  );
}

const PRODUCT: readonly QA[] = [
  { q: 'What is Dev X-Ray?', a: 'A browser-first developer toolkit: 23 tools for formatting, decoding, converting and inspecting the kinds of data you deal with daily — JSON, GraphQL, JWTs, YAML, SQL, cron expressions, CSV and more — that run in your browser rather than on a server.' },
  { q: 'Why did you build it?', a: 'It started as a GraphQL formatter because formatting queries in Postman was painful. Then JSON, cURL, JWT, Base64, Regex, Cron and CSV followed, one annoyance at a time, until the formatter had become a workspace.' },
  { q: 'Why 23 tools?', a: 'There was no target number. Tools accumulated as they were needed. The count is a consequence, not a design goal — and it is deliberately not the headline claim, because the number of tools is not what makes it different.' },
  { q: 'Who is it for?', a: 'Developers who handle data they would rather not paste into a random website — backend and integration engineers especially — and anyone on a machine where installing software is awkward or not allowed.' },
  { q: 'Is it free? Does it need an account?', a: 'It is free to use and there is no account, no sign-up and no login. There is no user concept in the application at all.' },
  { q: 'Does it work on Mac, Windows and Linux?', a: 'Yes. It is a web application, so it runs anywhere with a modern browser. There is nothing platform-specific.' },
  { q: 'Does it work on mobile?', a: 'It is responsive and usable from 360px upwards, and the layout adapts — navigation collapses into a drawer on narrow screens. That said, it is designed for a desktop workflow; code editing on a phone is inherently cramped.' },
  { q: 'Can I install it?', a: 'Yes — it is a Progressive Web App, so your browser can install it to your dock, taskbar or home screen. Installing also makes the offline behaviour more natural to use.' },
  { q: 'Does it work offline?', a: 'Yes, after the first visit. The service worker precaches the whole application — 75 files, about 5.4 MB — including the editor. Verified by disabling the network and confirming that the app boots and that tools never opened before still load and compute.' },
  { q: 'Why is it called Dev X-Ray?', a: 'Most of these tools are about seeing inside something opaque — what is actually in this token, this payload, this cron expression. X-ray is the plainest description of that.' },
  { q: 'Why the Clay and Grass themes?', a: 'Dark mode is Clay: warm terracotta with chalk-white lines and deep green accents. Light mode is Grass: bottle green and aubergine on cream and white. The reference is carried purely by colour and geometry — there is no tennis imagery in the product.' },
];

const PRIVACY: readonly QA[] = [
  { q: 'Does my data leave my browser?', a: 'The data you work on is not transmitted by the application. This was verified with a request-level network capture across ten scenarios — first load, formatting, JWT decoding, regex, file drop, history, Mapper, share-link creation and offline use — using a sentinel string planted in the input. It appeared in no request URL and no request body, and no third-party origin was contacted.' },
  { q: 'Do you have a backend?', a: 'No. There is no server-side application, no API and no database. The build output is static files.' },
  { q: 'Do you collect analytics or track users?', a: 'No. There is no analytics SDK, tag manager, error reporter or beacon bundled. There is no code in the application capable of reporting your activity.' },
  { q: 'Are my inputs stored?', a: 'Tool input lives in memory and is gone when you close the tab — with three exceptions that are written to your own browser storage: preferences, history entries and Mapper state. See the Privacy page for exactly what each contains.' },
  { q: 'Is history local?', a: 'Yes. It is written to localStorage in your browser under devxray_history, capped at 100 entries with each field clipped to 2,000 characters. It is never transmitted, and you can clear it from within the tool.' },
  { q: 'Are JWTs or JWT secrets stored?', a: 'No. JWT is the one tool deliberately excluded from history, precisely because history persists to localStorage and storing a raw token there would contradict the tool’s own promise. The secret you enter for verification is used in memory and never persisted or shared.' },
  { q: 'Are share links private?', a: 'No, and this is important. Share links compress tool state into the URL. Compression is not encryption — anyone holding the link can recover the contents. Treat a share link as being exactly as sensitive as the data in it. Note that a JWT does enter a share URL if you click Share in the JWT tool.' },
  { q: 'Does the URL contain my data?', a: 'Only if you click Share. Normal use puts nothing in the URL beyond which tool is open. When you create a share link it goes to your clipboard rather than your address bar, and when you open someone’s share link the fragment is read once and then stripped.' },
  { q: 'What happens when I drop a file?', a: 'The browser reads it into memory with FileReader and routes the contents to the tool that handles that extension. It is not uploaded — there is no upload endpoint. Files over 25 MB are refused, and only the first file of a multi-file drop is used.' },
  { q: 'Does the PWA cache anything?', a: 'Yes — the application itself. The service worker precaches the app’s own files so it can run offline. It does not cache your input; your data is never part of what is stored there.' },
  { q: 'Can I verify network activity myself?', a: 'Yes, and you should. Open DevTools, go to Network, clear the log, then use the tools and watch. Filter by Fetch/XHR and WS. Then set throttling to Offline and keep working. The Privacy page has the full procedure and a fake test payload to paste.' },
];

const SECURITY: readonly QA[] = [
  { q: 'Does decoding a JWT validate it?', a: 'No, and this distinction matters. Decoding is just base64url and JSON — it proves nothing about who issued the token or whether it was tampered with. Verification is a separate, explicit step requiring a secret you supply.' },
  { q: 'Is JWT verification supported?', a: 'HMAC verification is: HS256, HS384 and HS512, via the browser’s Web Crypto implementation. Signing new tokens is not supported, and RSA/ECDSA algorithms are not currently implemented.' },
  { q: 'Why does it not read the algorithm from the token?', a: 'Because the token’s header is part of the document being authenticated. Letting it choose how that same document is verified is the classic "algorithm confusion" vulnerability. The algorithm always comes from your explicit selection; a mismatch with the header shows a warning but never changes what is actually used.' },
  { q: 'Should I paste production secrets into it?', a: 'No. Local processing reduces where a secret travels, but handling a live production secret in any tool is still a bad habit. Use test data — the Privacy page has a fake payload for exactly this.' },
  { q: 'How does regex avoid hanging the page?', a: 'Syntax is validated on the main thread, where compiling a pattern can never hang. Execution happens in a Web Worker that is terminated after 2.5 seconds — terminating it is the only way to actually stop a synchronous execution from outside. A fresh worker is created for the next request.' },
  { q: 'Is the source code available?', a: 'Yes. The repository is public and readable, and the source is open source software licensed under the MIT License — the full text is in the LICENSE file at the repository root. You may use, modify, distribute and self-host it, including commercially, so long as you keep the copyright and permission notices. Bundled dependencies keep their own licences; the Technology page lists them.' },
  { q: 'Are dependencies audited?', a: 'Dependency versions are pinned by a lockfile and every dependency is bundled to run locally rather than as a hosted service. Their licences have been reviewed: everything that ships to the browser is permissively licensed (MIT, ISC, BSD-3-Clause, CC0-1.0), with dompurify offered as MPL-2.0 OR Apache-2.0. There is no formal third-party security audit or published SBOM, and supply-chain compromise remains a real risk for any JavaScript project.' },
];

const TECHNICAL: readonly QA[] = [
  { q: 'What stack is used?', a: 'React and TypeScript, built with Vite, styled with Tailwind, state in Zustand, editing via a locally bundled Monaco, and a Workbox-generated service worker for offline use. Full breakdown on the Technology page.' },
  { q: 'Why is Monaco bundled instead of loaded from a CDN?', a: 'Two reasons. A CDN request on every page load would contradict the "nothing leaves your machine" claim, and it would make the offline promise false — the shell would cache but the editor would not load.' },
  { q: 'Which tools run in workers?', a: 'Regex always runs its execution in a worker so it can be terminated. JSON parsing moves to a worker above 100 kB. The editor has two workers of its own. Everything else runs on the main thread.' },
  { q: 'What is Zustand used for?', a: 'Three stores: preferences (persisted), history (persisted) and ephemeral UI state. Mapper has a fourth store under its own key. They are consumed directly rather than through a facade so a component only re-renders for the slice it actually reads.' },
  { q: 'How does share state work?', a: 'Tool state is serialised to JSON, compressed with lz-string and placed in the URL fragment as #/{tool}/{payload}. There is no server involved — the link works because the receiving browser decodes it. Each tool validates the decoded shape before using it.' },
  { q: 'Does it need an API, a database or authentication?', a: 'None of the three. That is the whole architectural point: there is no server-side component to require them.' },
];

export function FaqPage({ onNavigate, onBack }: Props) {
  return (
    <PageShell
      current="faq"
      title="Frequently asked questions"
      lead="Straight answers, including the ones that are inconvenient. Where something is a limitation rather than a feature, it is described as one."
      onNavigate={onNavigate}
      onBack={onBack}
    >
      <Group title="Product" items={PRODUCT} />
      <Group title="Privacy" items={PRIVACY} />
      <Group title="Security" items={SECURITY} />
      <Group title="Technical" items={TECHNICAL} />
    </PageShell>
  );
}
