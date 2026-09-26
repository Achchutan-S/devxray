// @vitest-environment jsdom
import { act, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { consumeSharedState, encodeShareHash, resetShareRegistry } from '@/utils/shareState';
import { useImportShareLink } from './useImportShareLink';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => resetShareRegistry());

/** Mirrors a tool: consumes its shared state once, on mount. */
function Tool({ onLoad }: { onLoad: (data: unknown) => void }) {
  useEffect(() => {
    onLoad(consumeSharedState('markdown'));
  }, [onLoad]);
  return null;
}

/** Mirrors App: the tool is already mounted when the async decode resolves. */
function Harness({ onLoad }: { onLoad: (data: unknown) => void }) {
  const [, setTab] = useState('markdown');
  const count = useImportShareLink(setTab);
  return <Tool key={count} onLoad={onLoad} />;
}

it('delivers a share payload to a tool that mounted before the decode finished', async () => {
  window.location.hash = await encodeShareHash({ tab: 'markdown', data: { input: '# hi' } });
  const loaded: unknown[] = [];
  const onLoad = (data: unknown) => loaded.push(data);

  const root = createRoot(document.createElement('div'));
  await act(async () => {
    root.render(<Harness onLoad={onLoad} />);
  });
  await vi.waitFor(() => expect(loaded).toContainEqual({ input: '# hi' }));
  expect(window.location.hash).toBe('');
  act(() => root.unmount());
});
