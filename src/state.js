// state.js — shared mutable state across modules.

export const STATE = {
  sections: [],     // bd:sections, sorted by .order
  membership: {},   // bd:membership: { [bookmarkId]: sectionId }
  meta: null,       // bd:meta
  all: [],          // flat list of all bookmarks
};

const logLines = [];
export function dbg(s){ logLines.push(s); console.log('[BD]', tstamp(), s); }
export function getLog(){ return logLines.slice(); }

// ============================================================
// PERFORMANCE INSTRUMENTATION
// ============================================================

const T0 = performance.now();

// Returns a string like "[+1234.5ms]" representing time since page load.
export function tstamp() {
  const ms = performance.now() - T0;
  return '[+' + ms.toFixed(1) + 'ms]';
}

// Wrap a sync function for timed logging. Returns the function's result.
export function timed(label, fn) {
  const start = performance.now();
  const result = fn();
  const dur = performance.now() - start;
  const slow = dur > 50 ? ' SLOW' : '';
  console.log('[BD-PERF]' + slow, tstamp(), label, dur.toFixed(1) + 'ms');
  return result;
}

// Async variant.
export async function timedAsync(label, fn) {
  const start = performance.now();
  const result = await fn();
  const dur = performance.now() - start;
  const slow = dur > 50 ? ' SLOW' : '';
  console.log('[BD-PERF]' + slow, tstamp(), label, dur.toFixed(1) + 'ms');
  return result;
}
