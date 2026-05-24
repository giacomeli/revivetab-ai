// state.js — shared mutable state across modules.

export const STATE = {
  sections: [],     // bd:sections, sorted by .order
  membership: {},   // bd:membership: { [bookmarkId]: sectionId }
  meta: null,       // bd:meta
  all: [],          // flat list of all bookmarks
};

const logLines = [];
export function dbg(s){ logLines.push(s); console.log('[BD]', s); }
export function getLog(){ return logLines.slice(); }
