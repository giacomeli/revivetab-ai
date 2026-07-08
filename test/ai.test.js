// test/ai.test.js — npm test
import { describe, it, expect } from 'vitest';
import { buildClassifyPayload, parseAssignments } from '../src/ai-client.js';
import { chunk, selectScope, organize, computePreview } from '../src/ai-organize.js';

const SECTIONS = [
  { id: 'study', label: 'O que estudar hoje' },
  { id: 'watch', label: 'O que assistir hoje' },
  { id: 'inbox', label: 'Não categorizado' },
];

const BOOKMARKS = [
  { id: 'b1', title: 'React docs', url: 'https://react.dev', folderList: ['Dev'] },
  { id: 'b2', title: 'Lo-fi', url: 'https://youtube.com/watch?v=abc12345678', folderList: [] },
];

describe('buildClassifyPayload', () => {
  const payload = buildClassifyPayload(BOOKMARKS, SECTIONS, 'deepseek-v4-flash');

  it('modelo, temperatura zero e JSON mode', () => {
    expect(payload.model).toBe('deepseek-v4-flash');
    expect(payload.temperature).toBe(0);
    expect(payload.response_format).toEqual({ type: 'json_object' });
  });

  it('system lista os ids das seções e o contrato de resposta', () => {
    const system = payload.messages[0].content;
    expect(payload.messages[0].role).toBe('system');
    for (const s of SECTIONS) expect(system).toContain('- ' + s.id + ': ' + s.label);
    expect(system).toContain('"assignments"');
  });

  it('user content é JSON compacto com id, title, url e folders', () => {
    const items = JSON.parse(payload.messages[1].content);
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({ id: 'b1', title: 'React docs', url: 'https://react.dev', folders: ['Dev'] });
    expect(items[1].folders).toEqual([]);
  });
});

describe('parseAssignments', () => {
  const sectionIds = SECTIONS.map((s) => s.id);
  const bookmarkIds = ['b1', 'b2'];

  it('caso feliz', () => {
    const out = parseAssignments('{"assignments":{"b1":"study","b2":"watch"}}', sectionIds, bookmarkIds);
    expect(out).toEqual({ b1: 'study', b2: 'watch' });
  });

  it('seção inválida vira inbox', () => {
    const out = parseAssignments('{"assignments":{"b1":"nao-existe"}}', sectionIds, bookmarkIds);
    expect(out).toEqual({ b1: 'inbox' });
  });

  it('id de bookmark desconhecido é ignorado', () => {
    const out = parseAssignments('{"assignments":{"fantasma":"study","b1":"study"}}', sectionIds, bookmarkIds);
    expect(out).toEqual({ b1: 'study' });
  });

  it('JSON entre cercas de código é aceito', () => {
    const out = parseAssignments('```json\n{"assignments":{"b1":"study"}}\n```', sectionIds, bookmarkIds);
    expect(out).toEqual({ b1: 'study' });
  });

  it('JSON malformado lança erro', () => {
    expect(() => parseAssignments('nem json', sectionIds, bookmarkIds)).toThrow(/JSON/);
  });

  it('sem campo assignments lança erro', () => {
    expect(() => parseAssignments('{"resultado":{}}', sectionIds, bookmarkIds)).toThrow(/assignments/);
  });
});

describe('chunk', () => {
  it('divide em lotes do tamanho pedido', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
  it('lista vazia -> nenhum lote', () => {
    expect(chunk([], 2)).toEqual([]);
  });
});

describe('selectScope', () => {
  const all = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const membership = { a: 'study', b: 'inbox' };

  it('inbox: só não categorizados (inbox ou sem membership)', () => {
    expect(selectScope(all, membership, 'inbox').map((b) => b.id)).toEqual(['b', 'c']);
  });
  it('all: todos', () => {
    expect(selectScope(all, membership, 'all')).toHaveLength(3);
  });
});

describe('organize', () => {
  const bookmarks = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
  const config = {};

  it('classifica todos os lotes e reporta progresso', async () => {
    const progress = [];
    const r = await organize({
      bookmarks, sections: SECTIONS, config, batchSize: 2,
      classifyFn: async (cfg, batch) => Object.fromEntries(batch.map((b) => [b.id, 'study'])),
      onProgress: (p) => progress.push(p),
    });
    expect(r.assignments).toEqual({ a: 'study', b: 'study', c: 'study', d: 'study' });
    expect(r.failedCount).toBe(0);
    expect(r.cancelled).toBe(false);
    expect(progress.map((p) => p.batchesDone)).toEqual([1, 2]);
    expect(progress[1].classified).toBe(4);
  });

  it('retry recupera falha transitória', async () => {
    let calls = 0;
    const r = await organize({
      bookmarks: [{ id: 'a' }], sections: SECTIONS, config, batchSize: 1,
      classifyFn: async (cfg, batch) => {
        calls++;
        if (calls === 1) throw new Error('falha transitoria');
        return { a: 'watch' };
      },
    });
    expect(calls).toBe(2);
    expect(r.assignments).toEqual({ a: 'watch' });
    expect(r.failedCount).toBe(0);
  });

  it('falha dupla marca o lote como falho e segue', async () => {
    const r = await organize({
      bookmarks, sections: SECTIONS, config, batchSize: 2,
      classifyFn: async (cfg, batch) => {
        if (batch[0].id === 'a') throw new Error('sempre falha');
        return Object.fromEntries(batch.map((b) => [b.id, 'study']));
      },
    });
    expect(r.failedCount).toBe(2);
    expect(r.assignments).toEqual({ c: 'study', d: 'study' });
    expect(r.cancelled).toBe(false);
  });

  it('cancelamento preserva o já classificado', async () => {
    const controller = new AbortController();
    const r = await organize({
      bookmarks, sections: SECTIONS, config, batchSize: 1, signal: controller.signal,
      classifyFn: async (cfg, batch) => Object.fromEntries(batch.map((b) => [b.id, 'study'])),
      onProgress: (p) => { if (p.batchesDone === 2) controller.abort(); },
    });
    expect(r.cancelled).toBe(true);
    expect(Object.keys(r.assignments)).toEqual(['a', 'b']);
  });
});

describe('computePreview', () => {
  it('conta mudanças e ganhos/perdas por seção, ignorando iguais', () => {
    const current = { a: 'study', b: 'inbox', c: 'watch' };
    const assignments = { a: 'study', b: 'watch', c: 'inbox' };
    const p = computePreview(current, assignments, SECTIONS);
    expect(p.total).toBe(3);
    expect(p.changes).toBe(2);
    expect(p.bySection.watch).toEqual({ gains: 1, losses: 1 });
    expect(p.bySection.inbox).toEqual({ gains: 1, losses: 1 });
    expect(p.bySection.study).toEqual({ gains: 0, losses: 0 });
  });

  it('membership ausente conta como inbox', () => {
    const p = computePreview({}, { x: 'study' }, SECTIONS);
    expect(p.changes).toBe(1);
    expect(p.bySection.study.gains).toBe(1);
    expect(p.bySection.inbox.losses).toBe(1);
  });
});
