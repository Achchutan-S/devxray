import { describe, expect, it } from 'vitest';
import { TAB_IDS } from '@/constants/tabs';
import { IMPLEMENTED } from './index';

describe('tool component wiring', () => {
  it('has a component for every registered tool', () => {
    expect(TAB_IDS.filter((id) => IMPLEMENTED[id] === undefined)).toEqual([]);
  });

  it('wires no component for a tool that is not registered', () => {
    const known = new Set(TAB_IDS);
    expect(Object.keys(IMPLEMENTED).filter((id) => !known.has(id))).toEqual([]);
  });
});
