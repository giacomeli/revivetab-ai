import { afterEach, describe, expect, it, vi } from 'vitest';
import { BD_KEYS } from '../src/data/storage';
import { addFeed, getFeeds, normalizeFeedUrl, refreshFeeds, removeFeed, requestFeedAccess, setFeedColor } from '../src/services/rss';
import type { RssSource } from '../src/types';

afterEach(() => vi.unstubAllGlobals());

describe('normalizeFeedUrl', () => {
  it('normaliza a URL de inscrição e descarta a âncora', () => {
    expect(normalizeFeedUrl(' https://EXAMPLE.org:443/rss?category=tech#latest ')).toBe(
      'https://example.org/rss?category=tech',
    );
  });

  it.each([
    '',
    'example.org/rss',
    'http://example.org/rss',
    'file:///tmp/feed.xml',
    'https://user:secret@example.org/rss',
    'https://*/rss',
    'https://%2a.example.org/rss',
  ])('recusa a URL de inscrição %s', (url) => {
    expect(normalizeFeedUrl(url)).toBeNull();
  });
});

describe('requestFeedAccess', () => {
  it('solicita o domínio exato na mesma interação, sem incluir a URL privada do feed', async () => {
    const request = vi.fn().mockResolvedValue(true);
    vi.stubGlobal('chrome', { permissions: { request } });

    const pending = requestFeedAccess('https://feed.example.org:8443/rss?token=secret');
    expect(request.mock.calls).toEqual([[{ origins: ['https://feed.example.org/*'] }]]);
    await expect(pending).resolves.toBe(true);
  });
});

function mockFeedStorage(initial: RssSource[] = []): void {
  let values: Record<string, unknown> = { [BD_KEYS.rssSources]: initial };
  vi.stubGlobal('chrome', {
    runtime: {},
    permissions: { contains: async () => true },
    storage: { local: {
      get: (_keys: string[], callback: (stored: Record<string, unknown>) => void) => callback(structuredClone(values)),
      set: (next: Record<string, unknown>, callback: () => void) => {
        values = { ...values, ...structuredClone(next) };
        callback();
      },
    } },
  });
  vi.stubGlobal('navigator', { locks: {
    request: (_key: string, callbackOrOptions: (() => unknown) | LockOptions, withLock?: (lock: object) => unknown) =>
      typeof callbackOrOptions === 'function' ? callbackOrOptions() : withLock!({}),
  } });
}

const cachedSource: RssSource = {
  id: 'example-feed',
  title: 'Exemplo',
  url: 'https://example.org/rss',
  articles: [{ title: 'Artigo salvo', url: 'https://example.org/article', publishedAt: null }],
  checkedAt: 0,
};

it('preserva os artigos e aguarda o próximo intervalo quando a fonte falha', async () => {
  mockFeedStorage([cachedSource]);
  const fetchSource = vi.fn().mockImplementation(async () => new Response(null, { status: 503 }));
  vi.stubGlobal('fetch', fetchSource);

  await refreshFeeds();
  expect(await getFeeds()).toEqual([{ ...cachedSource, checkedAt: expect.any(Number), error: 'network' }]);
  await refreshFeeds();
  expect(fetchSource).toHaveBeenCalledTimes(1);
  await refreshFeeds(true);
  expect(fetchSource).toHaveBeenCalledTimes(2);
});

it('não recria uma fonte removida durante a atualização', async () => {
  mockFeedStorage([cachedSource]);
  let started!: () => void;
  const fetchStarted = new Promise<void>((resolve) => { started = resolve; });
  let finish!: (response: Response) => void;
  const response = new Promise<Response>((resolve) => { finish = resolve; });
  vi.stubGlobal('fetch', () => { started(); return response; });

  const refresh = refreshFeeds(true);
  await fetchStarted;
  await removeFeed(cachedSource.id);
  finish(new Response(null, { status: 503 }));
  await refresh;
  expect(await getFeeds()).toEqual([]);
});

it('salva uma cor por fonte e permite voltar à cor padrão', async () => {
  const otherSource = { ...cachedSource, id: 'other-feed' };
  mockFeedStorage([cachedSource, otherSource]);

  await setFeedColor(cachedSource.id, '#ff6633');
  expect(await getFeeds()).toEqual([{ ...cachedSource, color: '#ff6633' }, otherSource]);

  await setFeedColor(cachedSource.id);
  expect(await getFeeds()).toEqual([cachedSource, otherSource]);
});

it('preserva a cor escolhida enquanto a fonte está sendo atualizada', async () => {
  mockFeedStorage([{ ...cachedSource, color: '#ff6633' }]);
  let started!: () => void;
  const fetchStarted = new Promise<void>((resolve) => { started = resolve; });
  let finish!: (response: Response) => void;
  const response = new Promise<Response>((resolve) => { finish = resolve; });
  vi.stubGlobal('fetch', () => { started(); return response; });

  const refresh = refreshFeeds(true);
  await fetchStarted;
  await setFeedColor(cachedSource.id, '#3366ff');
  finish(new Response(null, { status: 503 }));
  await refresh;
  expect(await getFeeds()).toEqual([{
    ...cachedSource, color: '#3366ff', checkedAt: expect.any(Number), error: 'network',
  }]);
});

it('recusa uma resposta acima do limite mesmo sem cabeçalho de tamanho', async () => {
  mockFeedStorage();
  vi.stubGlobal('fetch', async () => new Response(new Uint8Array(2 * 1024 * 1024 + 1)));

  await expect(addFeed(cachedSource.url)).rejects.toMatchObject({ code: 'invalid' });
  expect(await getFeeds()).toEqual([]);
});
