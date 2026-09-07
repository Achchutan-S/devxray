import { useCallback, useEffect, useMemo, useState } from 'react';
import { Clock3, Copy, Eraser, Eye, EyeOff, Link2, Shield, ShieldAlert, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import {
  InlineError,
  JsonTreeView,
  Pane,
  PaneBar,
  PaneBody,
  PaneHeader,
  ShareButton,
  TabShell,
  IconButton,
  ToolButton,
} from '@/components/common';
import { useCommandPaletteCommands, useShareAction, useTabHotkeys } from '@/hooks';
import { copyText } from '@/utils/clipboard';
import { consumeSharedState } from '@/utils/shareState';
import {
  HMAC_ALGORITHMS,
  decodeJwt,
  getExpiryInfo,
  verifyHmacSignature,
  type DecodedJwt,
  type ExpiryStatus,
  type HmacAlgorithm,
  type VerifyResult,
} from '@/utils/formatters/jwt';

const TAB_ID = 'jwt';

interface SharedJwtPayload {
  readonly token: string;
}

function isSharedJwtPayload(value: unknown): value is SharedJwtPayload {
  return typeof value === 'object' && value !== null && typeof (value as { token?: unknown }).token === 'string';
}

const EXPIRY_LABEL: Record<ExpiryStatus, string> = {
  'no-claim': 'No expiry claim',
  valid: 'Not expired',
  expired: 'Expired',
  'not-yet-valid': 'Not yet valid',
};

const EXPIRY_CLASS: Record<ExpiryStatus, string> = {
  'no-claim': 'bg-surface-sunken text-fg-muted',
  valid: 'bg-success-soft text-success',
  expired: 'bg-danger-soft text-danger',
  'not-yet-valid': 'bg-warning-soft text-warning',
};

export function JWTTab() {
  const [token, setToken] = useState('');
  const [secret, setSecret] = useState('');
  const [secretVisible, setSecretVisible] = useState(false);
  const [algorithm, setAlgorithm] = useState<HmacAlgorithm>('HS256');
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  useEffect(() => {
    const shared = consumeSharedState(TAB_ID);
    if (isSharedJwtPayload(shared)) {
      setToken(shared.token);
      toast.success('Loaded shared token');
    }
  }, []);

  const { decoded, error } = useMemo((): { decoded: DecodedJwt | null; error: string | null } => {
    if (token.trim() === '') return { decoded: null, error: null };
    try {
      return { decoded: decodeJwt(token), error: null };
    } catch (caught) {
      return { decoded: null, error: caught instanceof Error ? caught.message : 'Could not decode this token' };
    }
  }, [token]);

  // Verification is tied to what was actually checked — editing the token, the
  // secret or the algorithm invalidates any prior result rather than leaving a
  // stale "valid" badge attached to a token that has since changed.
  useEffect(() => {
    setVerifyResult(null);
  }, [token, secret, algorithm]);

  const expiry = useMemo(() => (decoded ? getExpiryInfo(decoded.payload) : null), [decoded]);

  const handleVerify = useCallback(() => {
    if (decoded === null || secret === '') return;
    setIsVerifying(true);
    void verifyHmacSignature(decoded, secret, algorithm)
      .then(setVerifyResult)
      .finally(() => setIsVerifying(false));
  }, [decoded, secret, algorithm]);

  const copyPart = useCallback((label: string, value: string) => {
    void copyText(value).then((ok) => {
      if (ok) toast.success(`Copied ${label}`);
      else toast.error('Could not access the clipboard');
    });
  }, []);

  const handleClear = useCallback(() => {
    setToken('');
    setSecret('');
    setVerifyResult(null);
  }, []);

  useTabHotkeys({
    onCopyOutput: () => decoded && copyPart('payload', JSON.stringify(decoded.payload, null, 2)),
  });

  const sharePayload = useMemo(() => ({ token }), [token]);
  const { share: shareLink } = useShareAction({
    tab: TAB_ID,
    data: sharePayload,
    contentLength: token.length,
  });
  const commandGetter = useCallback(
    () => [
      { id: 'jwt:verify', label: 'Verify signature', category: 'context' as const, icon: Shield, run: handleVerify },
      { id: 'jwt:clear', label: 'Clear token and secret', category: 'context' as const, icon: Eraser, run: handleClear },
      { id: 'jwt:share', label: 'Copy share link', category: 'context' as const, icon: Link2, run: shareLink },
    ],
    [handleVerify, handleClear, shareLink],
  );
  useCommandPaletteCommands(TAB_ID, commandGetter);

  return (
    <TabShell split>
      <Pane bordered>
        <PaneHeader
          title="Token"
          actions={
            <>
              <IconButton icon={Eraser} label="Clear" onClick={handleClear} disabled={token === ''} />
              <ShareButton tab={TAB_ID} data={sharePayload} contentLength={token.length} />
            </>
          }
        />
        <InlineError message={error} />
        <PaneBody scroll className="p-3">
          <textarea
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
            spellCheck={false}
            rows={6}
            aria-label="JWT token"
            className="w-full resize-y rounded border border-line bg-surface-sunken p-2 font-mono text-xs text-fg outline-none placeholder:text-fg-subtle focus:border-accent"
          />

          {decoded !== null && expiry !== null && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${EXPIRY_CLASS[expiry.status]}`}
              >
                <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                {EXPIRY_LABEL[expiry.status]}
                {expiry.expiresAt !== null && ` · ${expiry.expiresAt.toLocaleString()}`}
              </span>
            </div>
          )}

          <div className="mt-4 rounded border border-line bg-surface p-3">
            <h3 className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-fg-muted">
              <Shield className="h-3.5 w-3.5" aria-hidden="true" />
              Verify signature (HMAC)
            </h3>
            <p className="mb-2 text-xs text-fg-subtle">
              Decoding above never checked the signature. Verification runs entirely in
              your browser via Web Crypto — the secret is never sent anywhere.
            </p>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[160px]">
                <input
                  type={secretVisible ? 'text' : 'password'}
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  placeholder="Secret"
                  aria-label="HMAC secret"
                  autoComplete="off"
                  className="w-full rounded border border-line bg-surface-sunken px-2 py-1.5 pr-8 font-mono text-xs text-fg outline-none placeholder:text-fg-subtle focus:border-accent"
                />
                <button
                  type="button"
                  onClick={() => setSecretVisible((v) => !v)}
                  aria-label={secretVisible ? 'Hide secret' : 'Show secret'}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg"
                >
                  {secretVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>

              <select
                value={algorithm}
                onChange={(e) => setAlgorithm(e.target.value as HmacAlgorithm)}
                aria-label="HMAC algorithm"
                className="rounded border border-line bg-surface-sunken px-2 py-1.5 text-xs text-fg outline-none focus:border-accent"
              >
                {HMAC_ALGORITHMS.map((alg) => (
                  <option key={alg} value={alg}>
                    {alg}
                  </option>
                ))}
              </select>

              <ToolButton
                icon={Shield}
                variant="primary"
                onClick={handleVerify}
                disabled={decoded === null || secret === '' || isVerifying}
              >
                Verify
              </ToolButton>
            </div>

            {typeof decoded?.header['alg'] === 'string' && decoded.header['alg'] !== algorithm && (
              <p className="mt-2 text-xs text-warning">
                The token's header claims “{String(decoded.header['alg'])}”, not {algorithm}. The
                algorithm to verify with is your choice, never the token's own claim — a token
                should never get to pick how it is checked.
              </p>
            )}

            {verifyResult !== null && (
              <div
                role="status"
                className={`mt-3 flex items-center gap-2 rounded px-2.5 py-1.5 text-sm font-medium ${
                  verifyResult === 'valid'
                    ? 'bg-success-soft text-success'
                    : verifyResult === 'invalid'
                      ? 'bg-danger-soft text-danger'
                      : 'bg-warning-soft text-warning'
                }`}
              >
                {verifyResult === 'valid' ? (
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <ShieldAlert className="h-4 w-4" aria-hidden="true" />
                )}
                {verifyResult === 'valid' && 'Signature verified'}
                {verifyResult === 'invalid' && 'Signature does not match'}
                {verifyResult === 'error' && 'Could not run verification'}
              </div>
            )}
          </div>
        </PaneBody>
      </Pane>

      <Pane>
        <PaneHeader title={decoded === null ? 'Decoded' : 'Decoded (signature not verified above unless you ran Verify)'} />
        <PaneBody scroll>
          {decoded === null ? (
            <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-fg-muted">
              Paste a token to decode its header and payload.
            </div>
          ) : (
            <div className="flex flex-col gap-3 p-3">
              <section>
                <div className="mb-1 flex items-center justify-between">
                  <h3 className="text-xs font-medium uppercase tracking-wide text-fg-muted">Header</h3>
                  <IconButton
                    icon={Copy}
                    label="Copy header"
                    onClick={() => copyPart('header', JSON.stringify(decoded.header, null, 2))}
                  />
                </div>
                <div className="rounded border border-line bg-surface-sunken">
                  <JsonTreeView value={decoded.header} expandVersion={0} allExpanded className="max-h-40" />
                </div>
              </section>

              <section>
                <div className="mb-1 flex items-center justify-between">
                  <h3 className="text-xs font-medium uppercase tracking-wide text-fg-muted">Payload</h3>
                  <IconButton
                    icon={Copy}
                    label="Copy payload"
                    onClick={() => copyPart('payload', JSON.stringify(decoded.payload, null, 2))}
                  />
                </div>
                <div className="rounded border border-line bg-surface-sunken">
                  <JsonTreeView value={decoded.payload} expandVersion={0} allExpanded className="max-h-60" />
                </div>
              </section>

              <section>
                <div className="mb-1 flex items-center justify-between">
                  <h3 className="text-xs font-medium uppercase tracking-wide text-fg-muted">Signature</h3>
                  <IconButton icon={Copy} label="Copy signature" onClick={() => copyPart('signature', decoded.signature)} />
                </div>
                <pre className="overflow-x-auto rounded border border-line bg-surface-sunken p-2 font-mono text-xs text-fg-muted dx-scrollbar">
                  {decoded.signature}
                </pre>
              </section>
            </div>
          )}
        </PaneBody>
        <PaneBar>
          <span className="text-fg-subtle">
            {decoded === null
              ? 'nothing decoded'
              : 'decoded locally — nothing here is sent anywhere'}
          </span>
        </PaneBar>
      </Pane>
    </TabShell>
  );
}
