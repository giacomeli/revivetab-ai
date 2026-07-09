// data/storage.ts — wrapper fino sobre chrome.storage.local.

import type {
  AiConfig, InitialBackup, Membership, MembershipUndoSnapshot, Meta, Section, TreeNode,
} from '../types';
import { getTree } from './bookmarks';

export const BD_KEYS = {
  sections: 'bd:sections',
  membership: 'bd:membership',
  meta: 'bd:meta',
  initialBackup: 'bd:initial-backup',
  ai: 'bd:ai',
  membershipUndo: 'bd:membership-undo',
} as const;

function _get(keys: string[]): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(keys, (items) => {
      if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
      resolve(items);
    });
  });
}

function _set(obj: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(obj, () => {
      if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
      resolve();
    });
  });
}

export interface LoadedState {
  sections: Section[] | null;
  membership: Membership | null;
  meta: Meta | null;
}

export async function loadAll(): Promise<LoadedState> {
  const items = await _get([BD_KEYS.sections, BD_KEYS.membership, BD_KEYS.meta]);
  return {
    sections: (items[BD_KEYS.sections] as Section[] | undefined) || null,
    membership: (items[BD_KEYS.membership] as Membership | undefined) || null,
    meta: (items[BD_KEYS.meta] as Meta | undefined) || null,
  };
}

export async function saveSections(sections: Section[]): Promise<void> { return _set({ [BD_KEYS.sections]: sections }); }
export async function saveMembership(membership: Membership): Promise<void> { return _set({ [BD_KEYS.membership]: membership }); }
export async function saveMeta(meta: Meta): Promise<void> { return _set({ [BD_KEYS.meta]: meta }); }

export async function saveInitialBackup(tree: TreeNode[]): Promise<void> {
  return _set({ [BD_KEYS.initialBackup]: { savedAt: new Date().toISOString(), tree } });
}

export async function loadInitialBackup(): Promise<InitialBackup | null> {
  const items = await _get([BD_KEYS.initialBackup]);
  return (items[BD_KEYS.initialBackup] as InitialBackup | undefined) || null;
}

// Config da organização por IA. A API key fica em chrome.storage.local
// (local à máquina) — nunca em código, logs ou repositório.
const AI_DEFAULTS: AiConfig = { provider: 'deepseek', apiKeys: { deepseek: '', openrouter: '' }, model: '' };

export async function loadAiConfig(): Promise<AiConfig> {
  const items = await _get([BD_KEYS.ai]);
  const saved = (items[BD_KEYS.ai] as Partial<AiConfig> | undefined) || {};
  return {
    ...AI_DEFAULTS,
    ...saved,
    apiKeys: { ...AI_DEFAULTS.apiKeys, ...(saved.apiKeys || {}) },
  };
}

export async function saveAiConfig(config: AiConfig): Promise<void> { return _set({ [BD_KEYS.ai]: config }); }

// Snapshot do membership anterior à última organização por IA (para desfazer).
export async function loadMembershipUndo(): Promise<MembershipUndoSnapshot | null> {
  const items = await _get([BD_KEYS.membershipUndo]);
  return (items[BD_KEYS.membershipUndo] as MembershipUndoSnapshot | undefined) || null;
}

export async function saveMembershipUndo(membership: Membership): Promise<void> {
  return _set({ [BD_KEYS.membershipUndo]: { savedAt: new Date().toISOString(), membership } });
}

export async function clearMembershipUndo(): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.remove(BD_KEYS.membershipUndo, () => {
      if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
      resolve();
    });
  });
}

export interface ExportedBackup {
  exportedAt: string;
  bookmarksTree: TreeNode[];
  storage: Record<string, unknown>;
}

export async function exportBackup(): Promise<ExportedBackup> {
  const items = await _get([BD_KEYS.sections, BD_KEYS.membership, BD_KEYS.meta, BD_KEYS.initialBackup]);
  const tree = await getTree();
  return {
    exportedAt: new Date().toISOString(),
    bookmarksTree: tree,
    storage: items,
  };
}
