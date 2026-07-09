// types.ts — tipos de domínio compartilhados entre as camadas (data, services, ui).

export interface Bookmark {
  id: string;
  title: string;
  url: string;
  folders: Set<string>;
  folderList: string[];
  added: number;
}

export interface Section {
  id: string;
  label: string;
  icon: string;
  color: string;
  order: number;
  builtin?: boolean;
}

// bd:membership — fonte de verdade da categorização: bookmarkId -> sectionId.
export type Membership = Record<string, string>;

export interface Meta {
  version: number;
  seeded: boolean;
}

export interface SeedRule {
  folders: string[];
  urls: RegExp[];
}

export type SeedRules = Record<string, SeedRule>;

// Nó da árvore no formato de chrome.bookmarks.getTree() — subconjunto
// estrutural, compatível com BookmarkTreeNode e com fixtures de teste.
export interface TreeNode {
  id: string;
  title?: string;
  url?: string;
  dateAdded?: number;
  children?: TreeNode[];
}

export type AiProviderId = 'deepseek' | 'openrouter';

export interface AiConfig {
  provider: AiProviderId;
  apiKeys: Record<AiProviderId, string>;
  model: string;
}

// Campos mínimos que a classificação por IA envia ao modelo.
export interface ClassifiableBookmark {
  id: string;
  title: string;
  url: string;
  folderList?: string[];
}

// Resultado validado da classificação: bookmarkId -> sectionId.
export type Assignments = Record<string, string>;

export interface OrganizeProgress {
  batchesDone: number;
  batchesTotal: number;
  classified: number;
  failed: number;
}

export interface OrganizeResult {
  assignments: Assignments;
  failedCount: number;
  cancelled: boolean;
}

export interface SectionDelta {
  gains: number;
  losses: number;
}

export interface PreviewSummary {
  total: number;
  changes: number;
  bySection: Record<string, SectionDelta>;
}

export interface MembershipUndoSnapshot {
  savedAt: string;
  membership: Membership;
}

export interface InitialBackup {
  savedAt: string;
  tree: TreeNode[];
}
