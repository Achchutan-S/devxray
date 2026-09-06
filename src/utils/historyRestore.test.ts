import { beforeEach, describe, expect, it } from 'vitest';
import { consumeHistoryRestore, resetHistoryRestoreRegistry, stageHistoryRestore } from './historyRestore';

describe('historyRestore registry', () => {
  beforeEach(() => resetHistoryRestoreRegistry());

  it('delivers a staged value exactly once', () => {
    stageHistoryRestore('json', '{"a":1}');
    expect(consumeHistoryRestore('json')).toBe('{"a":1}');
    expect(consumeHistoryRestore('json')).toBeNull();
  });

  it('is independent per tab', () => {
    stageHistoryRestore('json', 'json input');
    stageHistoryRestore('hash', 'hash input');
    expect(consumeHistoryRestore('hash')).toBe('hash input');
    expect(consumeHistoryRestore('json')).toBe('json input');
  });

  it('returns null when nothing was staged', () => {
    expect(consumeHistoryRestore('csv')).toBeNull();
  });

  it('a later stage after consumption can be delivered again', () => {
    stageHistoryRestore('json', 'first');
    expect(consumeHistoryRestore('json')).toBe('first');
    stageHistoryRestore('json', 'second');
    expect(consumeHistoryRestore('json')).toBe('second');
  });

  it('survives a StrictMode-style double-consume attempt without redelivering', () => {
    stageHistoryRestore('json', 'once');
    const first = consumeHistoryRestore('json');
    const second = consumeHistoryRestore('json');
    expect(first).toBe('once');
    expect(second).toBeNull();
  });
});
