// state.ts — estado mutável compartilhado entre módulos + instrumentação.

import type { Bookmark, Membership, Meta, Section } from './types';

export interface AppState {
  sections: Section[];    // bd:sections, ordenado por .order
  membership: Membership; // bd:membership: { [bookmarkId]: sectionId }
  meta: Meta | null;      // bd:meta
  all: Bookmark[];        // lista flat de todos os bookmarks
}

export const STATE: AppState = {
  sections: [],
  membership: {},
  meta: null,
  all: [],
};

const logLines: string[] = [];
export function dbg(s: string): void { logLines.push(s); console.log('[BD]', tstamp(), s); }
export function getLog(): string[] { return logLines.slice(); }

// ============================================================
// PERFORMANCE INSTRUMENTATION
// ============================================================

const T0 = performance.now();

// Retorna uma string como "[+1234.5ms]" com o tempo desde o load da página.
export function tstamp(): string {
  const ms = performance.now() - T0;
  return '[+' + ms.toFixed(1) + 'ms]';
}

// Envolve uma função síncrona com log de duração. Retorna o resultado dela.
export function timed<T>(label: string, fn: () => T): T {
  const start = performance.now();
  const result = fn();
  const dur = performance.now() - start;
  const slow = dur > 50 ? ' SLOW' : '';
  console.log('[BD-PERF]' + slow, tstamp(), label, dur.toFixed(1) + 'ms');
  return result;
}

// Variante assíncrona.
export async function timedAsync<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = performance.now();
  const result = await fn();
  const dur = performance.now() - start;
  const slow = dur > 50 ? ' SLOW' : '';
  console.log('[BD-PERF]' + slow, tstamp(), label, dur.toFixed(1) + 'ms');
  return result;
}
