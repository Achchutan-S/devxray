/**
 * State is split by responsibility and consumed directly — there is deliberately
 * no combined facade hook, because subscribing to every slice at once re-renders
 * consumers on unrelated changes.
 */
export { usePreferenceStore } from './usePreferenceStore';
export { useHistoryStore, enforceHistoryLimits } from './useHistoryStore';
export type { NewHistoryEntry } from './useHistoryStore';
export { useUIStore } from './useUIStore';
export type { DiffPreset } from './useUIStore';
export { useMapperStore } from './useMapperStore';
export type { MapperInputKey, MapperInputs } from './useMapperStore';
