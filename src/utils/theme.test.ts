// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_THEME, applyTheme, initTheme, readStoredTheme } from './theme';
import { STORAGE_KEYS } from './constants';

/**
 * Theme resolution, including the rule that matters most on a default change:
 * a stored preference always wins. Changing the default must never rewrite a
 * choice someone has already made.
 */

function store(theme: unknown): void {
  localStorage.setItem(STORAGE_KEYS.preferences, JSON.stringify({ state: { theme }, version: 1 }));
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.className = '';
  document.documentElement.removeAttribute('data-theme');
});

afterEach(() => localStorage.clear());

describe('default theme', () => {
  it('is light', () => {
    expect(DEFAULT_THEME).toBe('light');
  });

  it('resolves to light for a browser with nothing stored', () => {
    expect(readStoredTheme()).toBe('light');
  });
});

describe('a stored preference always wins', () => {
  it('keeps a saved dark preference', () => {
    store('dark');
    expect(readStoredTheme()).toBe('dark');
  });

  it('keeps a saved light preference', () => {
    store('light');
    expect(readStoredTheme()).toBe('light');
  });

  it('does not overwrite what is stored when reading', () => {
    store('dark');
    readStoredTheme();
    initTheme();
    const raw = localStorage.getItem(STORAGE_KEYS.preferences);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string).state.theme).toBe('dark');
  });

  it('falls back to the default for a corrupt or unknown value', () => {
    store('chartreuse');
    expect(readStoredTheme()).toBe('light');
    localStorage.setItem(STORAGE_KEYS.preferences, '{not json');
    expect(readStoredTheme()).toBe('light');
  });
});

describe('applying a theme', () => {
  it('marks the document for dark and unmarks it for light', () => {
    applyTheme('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.dataset['theme']).toBe('dark');

    applyTheme('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.dataset['theme']).toBe('light');
  });

  it('initialises a fresh browser to light', () => {
    expect(initTheme()).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('initialises a returning dark user to dark', () => {
    store('dark');
    expect(initTheme()).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
});
