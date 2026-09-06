import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { MappingRow } from '@/utils/mapper/resolve';
import { CONFIG, STORAGE_KEYS } from '@/utils/constants';

export interface MapperInputs {
  responseJson: string;
  requestJson: string;
  requestGraphql: string;
  cartJson: string;
  targetJson: string;
}

export type MapperInputKey = keyof MapperInputs;

const EMPTY_INPUTS: MapperInputs = {
  responseJson: '',
  requestJson: '',
  requestGraphql: '',
  cartJson: '',
  targetJson: '',
};

interface MapperState extends MapperInputs {
  rows: MappingRow[];
  setInput: (key: MapperInputKey, value: string) => void;
  setRows: (rows: MappingRow[]) => void;
  clearAll: () => void;
}

/** A paste this large is kept for the session but not written to localStorage. Exported for unit testing. */
export function capForStorage(value: string): string {
  return value.length > CONFIG.MAX_MAPPER_INPUT_CHARS ? '' : value;
}

export const useMapperStore = create<MapperState>()(
  persist(
    (set) => ({
      ...EMPTY_INPUTS,
      rows: [],
      setInput: (key, value) => set({ [key]: value }),
      setRows: (rows) => set({ rows }),
      clearAll: () => set({ ...EMPTY_INPUTS, rows: [] }),
    }),
    {
      name: STORAGE_KEYS.mapper,
      storage: createJSONStorage(() => localStorage),
      version: 1,
      partialize: (state) => ({
        responseJson: capForStorage(state.responseJson),
        requestJson: capForStorage(state.requestJson),
        requestGraphql: capForStorage(state.requestGraphql),
        cartJson: capForStorage(state.cartJson),
        targetJson: capForStorage(state.targetJson),
        rows: state.rows,
      }),
    },
  ),
);
