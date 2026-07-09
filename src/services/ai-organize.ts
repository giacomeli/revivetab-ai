// services/ai-organize.ts — orquestração da classificação por IA: lotes
// sequenciais, retry, cancelamento e diff da prévia. `classifyFn` é injetada
// (produção usa classifyBatch de ai-client.ts), o que permite testar sem mock
// de fetch.

import type {
  AiConfig, Assignments, Bookmark, Membership, OrganizeProgress, OrganizeResult,
  PreviewSummary, Section, SectionDelta,
} from '../types';

export const BATCH_SIZE = 80;

export function chunk<T>(items: T[], size: number = BATCH_SIZE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// scope: 'inbox' (só não categorizados) | 'all' (todos).
export type OrganizeScope = 'inbox' | 'all';

export function selectScope<T extends Pick<Bookmark, 'id'>>(
  all: T[],
  membership: Membership,
  scope: OrganizeScope
): T[] {
  if (scope === 'all') return all.slice();
  return all.filter((b) => !membership[b.id] || membership[b.id] === 'inbox');
}

export interface OrganizeOptions<T extends Pick<Bookmark, 'id'>> {
  bookmarks: T[];
  sections: Section[];
  config: AiConfig;
  classifyFn: (config: AiConfig, batch: T[], sections: Section[], signal?: AbortSignal) => Promise<Assignments>;
  onProgress?: (p: OrganizeProgress) => void;
  signal?: AbortSignal;
  batchSize?: number;
}

// Loop sequencial nos lotes. Erro em um lote: 1 retry; falha dupla registra o
// lote como falho e segue. Cancelamento (signal) preserva o já classificado.
export async function organize<T extends Pick<Bookmark, 'id'>>(
  { bookmarks, sections, config, classifyFn, onProgress, signal, batchSize }: OrganizeOptions<T>
): Promise<OrganizeResult> {
  const batches = chunk(bookmarks, batchSize || BATCH_SIZE);
  const assignments: Assignments = {};
  let failedCount = 0;
  let cancelled = false;

  for (let i = 0; i < batches.length; i++) {
    if (signal && signal.aborted) { cancelled = true; break; }
    const batch = batches[i];
    let result: Assignments | null = null;
    for (let attempt = 0; attempt < 2 && !result; attempt++) {
      try {
        result = await classifyFn(config, batch, sections, signal);
      } catch (err) {
        if (signal && signal.aborted) { cancelled = true; break; }
        if (attempt === 1) failedCount += batch.length;
      }
    }
    if (cancelled) break;
    if (result) Object.assign(assignments, result);
    if (onProgress) {
      onProgress({
        batchesDone: i + 1,
        batchesTotal: batches.length,
        classified: Object.keys(assignments).length,
        failed: failedCount,
      });
    }
  }
  return { assignments, failedCount, cancelled };
}

// Diff da prévia (função pura): quantos mudam e ganhos/perdas por seção.
// Assignments iguais ao membership atual não contam como mudança.
export function computePreview(
  currentMembership: Membership,
  assignments: Assignments,
  sections: Array<Pick<Section, 'id'>>
): PreviewSummary {
  const bySection: Record<string, SectionDelta> = {};
  for (const s of sections) bySection[s.id] = { gains: 0, losses: 0 };
  let changes = 0;
  for (const bmId of Object.keys(assignments)) {
    const next = assignments[bmId];
    const cur = currentMembership[bmId] || 'inbox';
    if (cur === next) continue;
    changes++;
    if (bySection[next]) bySection[next].gains++;
    if (bySection[cur]) bySection[cur].losses++;
  }
  return { total: Object.keys(assignments).length, changes, bySection };
}
