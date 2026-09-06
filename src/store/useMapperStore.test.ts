// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { CONFIG, STORAGE_KEYS } from '@/utils/constants';
import type { MappingRow } from '@/utils/mapper/resolve';
import { capForStorage, useMapperStore } from './useMapperStore';

describe('capForStorage', () => {
  it('keeps a normal-sized input as-is', () => {
    expect(capForStorage('hello')).toBe('hello');
  });

  it('drops an input larger than the persistence cap', () => {
    const huge = 'x'.repeat(CONFIG.MAX_MAPPER_INPUT_CHARS + 1);
    expect(capForStorage(huge)).toBe('');
  });

  it('keeps an input exactly at the cap', () => {
    const atCap = 'x'.repeat(CONFIG.MAX_MAPPER_INPUT_CHARS);
    expect(capForStorage(atCap)).toBe(atCap);
  });
});

describe('useMapperStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useMapperStore.setState({
      responseJson: '',
      requestJson: '',
      requestGraphql: '',
      cartJson: '',
      targetJson: '',
      rows: [],
    });
  });

  it('setInput updates exactly the named field', () => {
    useMapperStore.getState().setInput('responseJson', '{"a":1}');
    expect(useMapperStore.getState().responseJson).toBe('{"a":1}');
    expect(useMapperStore.getState().targetJson).toBe('');
  });

  it('setRows replaces the row list', () => {
    const rows: MappingRow[] = [
      { targetPath: 'id', targetKind: 'string', sourcePath: null, source: null, status: 'new', reason: 'none', confidence: 0, explanation: '' },
    ];
    useMapperStore.getState().setRows(rows);
    expect(useMapperStore.getState().rows).toEqual(rows);
  });

  it('clearAll resets every input and the row list', () => {
    useMapperStore.getState().setInput('targetJson', '{}');
    useMapperStore.getState().setRows([
      { targetPath: 'a', targetKind: 'string', sourcePath: null, source: null, status: 'new', reason: 'none', confidence: 0, explanation: '' },
    ]);
    useMapperStore.getState().clearAll();
    const state = useMapperStore.getState();
    expect(state.targetJson).toBe('');
    expect(state.rows).toEqual([]);
  });

  it('persists state to localStorage under the dedicated mapper key', async () => {
    useMapperStore.getState().setInput('targetJson', '{"id":1}');
    // zustand's persist middleware writes asynchronously (microtask).
    await Promise.resolve();
    const raw = localStorage.getItem(STORAGE_KEYS.mapper);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.state.targetJson).toBe('{"id":1}');
  });

  it('does not persist an oversized input, without losing it from live state', async () => {
    const huge = 'x'.repeat(CONFIG.MAX_MAPPER_INPUT_CHARS + 1);
    useMapperStore.getState().setInput('responseJson', huge);
    expect(useMapperStore.getState().responseJson).toBe(huge);

    await Promise.resolve();
    const raw = localStorage.getItem(STORAGE_KEYS.mapper);
    const parsed = JSON.parse(raw!);
    expect(parsed.state.responseJson).toBe('');
  });
});
