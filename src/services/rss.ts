import { hasRssHostAccess, requestRssHostAccess } from '../data/rss-permissions';
import { loadRssSources, updateRssSources, watchRssSources } from '../data/storage';
import type { RssArticle, RssFetchError, RssSource } from '../types';

export { loadRssSources as getFeeds, watchRssSources as onFeedsChanged };

const ATOM_NS = 'http://www.w3.org/2005/Atom';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';
const DC_NS = 'http://purl.org/dc/elements/1.1/';
const RSS_CONTENT_NS = 'http://purl.org/rss/1.0/modules/content/';
export const MAX_RSS_SOURCES = 12;
const MAX_ARTICLES = 20;
const MAX_EXCERPT_LENGTH = 200;
const MAX_FEED_BYTES = 2 * 1024 * 1024;
const MAX_URL_LENGTH = 2048;
const REFRESH_INTERVAL = 30 * 60 * 1000;

export class RssError extends Error {
  constructor(readonly code: RssFetchError | 'duplicate' | 'limit') {
    super(code);
    this.name = 'RssError';
  }
}

function webUrl(input: string, base?: string): URL | null {
  const value = input.trim();
  if (!value || value.length > MAX_URL_LENGTH) return null;
  try {
    const url = new URL(value, base);
    return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password
      && url.href.length <= MAX_URL_LENGTH ? url : null;
  } catch {
    return null;
  }
}

export function normalizeFeedUrl(input: string): string | null {
  if (!/^https:\/\//i.test(input.trim())) return null;
  const url = webUrl(input);
  // O parser de URL aceita * no hostname, mas o Chrome o interpreta como
  // permissão para vários domínios. Uma inscrição sempre pede um host exato.
  if (url?.protocol !== 'https:' || url.hostname.includes('*')) return null;
  url.hash = '';
  return url.href;
}

export function requestFeedAccess(input: string): Promise<boolean> {
  const url = normalizeFeedUrl(input);
  // A chamada precisa acontecer dentro da interação que abriu o prompt do Chrome.
  return url ? requestRssHostAccess(new URL(url).hostname) : Promise.resolve(false);
}

function child(parent: Element, name: string, namespace = parent.namespaceURI): Element | undefined {
  return Array.from(parent.children).find((el) => el.localName === name && el.namespaceURI === namespace);
}

function elementBase(element: Element, inherited: string): string {
  return webUrl(element.getAttributeNS(XML_NS, 'base') ?? '', inherited)?.href ?? inherited;
}

function elementTitle(element: Element): string {
  return (child(element, 'title')?.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 300);
}

function rssLink(item: Element, base: string): URL | null {
  const link = child(item, 'link');
  const article = link && webUrl(link.textContent ?? '', elementBase(link, base));
  if (article) return article;
  const guid = child(item, 'guid');
  return guid && guid.getAttribute('isPermaLink') !== 'false' ? webUrl(guid.textContent ?? '') : null;
}

function atomLink(entry: Element, base: string): URL | null {
  for (const link of entry.children) {
    if (link.localName !== 'link' || link.namespaceURI !== ATOM_NS) continue;
    if ((link.getAttribute('rel') ?? 'alternate') !== 'alternate') continue;
    const url = webUrl(link.getAttribute('href') ?? '', elementBase(link, base));
    if (url) return url;
  }
  return null;
}

function htmlExcerptText(html: string): string {
  // O conteúdo de template é inerte. O HTML recebido nunca entra na página.
  const template = document.createElement('template');
  template.innerHTML = html;
  template.content.querySelectorAll('script, style, template, noscript, iframe, object, [hidden]')
    .forEach((element) => element.remove());
  template.content.querySelectorAll('br, p, div, li, blockquote, pre, h1, h2, h3, h4, h5, h6')
    .forEach((element) => {
      element.before(' ');
      element.after(' ');
    });
  return template.content.textContent ?? '';
}

function articleExcerpt(item: Element, isAtom: boolean): string | undefined {
  const fields = isAtom
    ? [child(item, 'summary'), child(item, 'content')]
    : [child(item, 'description'), child(item, 'encoded', RSS_CONTENT_NS)];

  for (const field of fields) {
    if (!field) continue;
    const type = field.getAttribute('type')?.toLowerCase();
    const isHtml = !isAtom || type === 'html' || type === 'text/html' || type === 'xhtml';
    if (!isHtml && type && type !== 'text' && type !== 'text/plain') continue;
    const raw = field.textContent ?? '';
    const text = isHtml ? htmlExcerptText(field.children.length ? field.innerHTML : raw) : raw;
    const excerpt = text.replace(/\s+/g, ' ').trim();
    if (!excerpt) continue;
    if (excerpt.length <= MAX_EXCERPT_LENGTH) return excerpt;
    const prefix = excerpt.slice(0, MAX_EXCERPT_LENGTH - 1).replace(/[\uD800-\uDBFF]$/, '');
    const boundary = prefix.lastIndexOf(' ');
    return (boundary > MAX_EXCERPT_LENGTH / 2 ? prefix.slice(0, boundary) : prefix) + '…';
  }
  return undefined;
}

export function parseFeed(xml: string, sourceUrl: string): Pick<RssSource, 'title' | 'articles'> {
  // Um DOCTYPE só pode aparecer antes da raiz. Ignora comentários e instruções
  // nessa posição para bloquear entidades sem confundir texto de um artigo.
  const prolog = /^(?:\s+|<\?[\s\S]*?\?>|<!--[\s\S]*?-->)*/.exec(xml)![0];
  if (xml.startsWith('<!DOCTYPE', prolog.length)) throw new RssError('invalid');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.doctype || doc.getElementsByTagName('parsererror').length) throw new RssError('invalid');

  const root = doc.documentElement;
  const isAtom = root.localName === 'feed' && root.namespaceURI === ATOM_NS;
  const isRss = root.localName === 'rss' && root.namespaceURI === null;
  const feed = isAtom ? root : isRss ? child(root, 'channel') : undefined;
  if (!feed) throw new RssError('invalid');

  const feedBase = isAtom ? elementBase(root, sourceUrl) : elementBase(feed, elementBase(root, sourceUrl));
  const entries = new Map<string, { article: RssArticle; item: Element }>();
  for (const item of feed.children) {
    if (item.localName !== (isAtom ? 'entry' : 'item') || item.namespaceURI !== feed.namespaceURI) continue;
    const base = elementBase(item, feedBase);
    const url = isAtom ? atomLink(item, base) : rssLink(item, base);
    if (!url) continue;

    const date = isAtom ? child(item, 'published') ?? child(item, 'updated')
      : child(item, 'pubDate') ?? child(item, 'date', DC_NS);
    const timestamp = Date.parse(date?.textContent ?? '');
    const publishedAt = Number.isFinite(timestamp) ? timestamp : null;
    const existing = entries.get(url.href)?.article;
    if (!existing || (publishedAt ?? -Infinity) > (existing.publishedAt ?? -Infinity)) {
      const article = { title: elementTitle(item) || url.hostname, url: url.href, publishedAt };
      entries.set(url.href, { article, item });
    }
  }

  const articles = Array.from(entries.values())
    .sort((a, b) => (b.article.publishedAt ?? -Infinity) - (a.article.publishedAt ?? -Infinity))
    .slice(0, MAX_ARTICLES)
    .map(({ article, item }) => {
      const excerpt = articleExcerpt(item, isAtom);
      return excerpt ? { ...article, excerpt } : article;
    });
  return { title: elementTitle(feed) || new URL(sourceUrl).hostname, articles };
}

async function readFeedResponse(response: Response): Promise<string> {
  if (!response.body) throw new RssError('invalid');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_FEED_BYTES) {
        void reader.cancel().catch(() => undefined);
        throw new RssError('invalid');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const utf16Le = (bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0x3c && bytes[1] === 0);
  const utf16Be = (bytes[0] === 0xfe && bytes[1] === 0xff) || (bytes[0] === 0 && bytes[1] === 0x3c);
  const utf8Bom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  const charset = response.headers.get('content-type')?.match(/;\s*charset\s*=\s*["']?([^\s;"']+)/i)?.[1];
  const declaration = new TextDecoder().decode(bytes.subarray(0, 1024))
    .match(/^<\?xml\s+[^?]*\bencoding\s*=\s*["']([^"']+)["']/i)?.[1];
  const encoding = utf16Le ? 'utf-16le' : utf16Be ? 'utf-16be' : utf8Bom ? 'utf-8' : charset ?? declaration;
  try {
    return new TextDecoder(encoding, { fatal: true }).decode(bytes);
  } catch {
    throw new RssError('invalid');
  }
}

async function fetchFeed(url: string): Promise<Pick<RssSource, 'title' | 'articles'>> {
  if (!(await hasRssHostAccess(new URL(url).hostname))) throw new RssError('permission');
  try {
    const response = await fetch(url, {
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      void response.body?.cancel().catch(() => undefined);
      throw new RssError('network');
    }
    return parseFeed(await readFeedResponse(response), url);
  } catch (error) {
    if (error instanceof RssError) throw error;
    throw new RssError('network');
  }
}

function checkCanAdd(sources: RssSource[], url: string): void {
  if (sources.some((source) => source.url === url)) throw new RssError('duplicate');
  if (sources.length >= MAX_RSS_SOURCES) throw new RssError('limit');
}

export async function addFeed(input: string): Promise<void> {
  const url = normalizeFeedUrl(input);
  if (!url) throw new RssError('invalid');
  await navigator.locks.request(`bd:rss:${url}`, async () => {
    checkCanAdd(await loadRssSources(), url);
    const feed = await fetchFeed(url);
    await updateRssSources((sources) => {
      checkCanAdd(sources, url);
      return [...sources, { id: crypto.randomUUID(), url, checkedAt: Date.now(), ...feed }];
    });
  });
}

export function removeFeed(id: string): Promise<void> {
  return updateRssSources((sources) => sources.some((source) => source.id === id)
    ? sources.filter((source) => source.id !== id) : sources);
}

export async function setFeedColor(id: string, color?: string): Promise<void> {
  if (color !== undefined && !/^#[0-9a-f]{6}$/i.test(color)) throw new TypeError('Invalid feed color');
  await updateRssSources((sources) => {
    if (!sources.some((source) => source.id === id && source.color !== color)) return sources;
    return sources.map((source) => {
      if (source.id !== id) return source;
      const { color: _previousColor, ...subscription } = source;
      return color ? { ...subscription, color } : subscription;
    });
  });
}

function isDue(source: RssSource): boolean {
  const age = Date.now() - source.checkedAt;
  return age < 0 || age >= REFRESH_INTERVAL;
}

async function refreshFeed(source: RssSource, force: boolean): Promise<void> {
  await navigator.locks.request(`bd:rss:${source.url}`, { ifAvailable: true }, async (lock) => {
    if (!lock) return;
    const current = (await loadRssSources()).find((saved) => saved.id === source.id);
    if (!current || (!force && !isDue(current))) return;

    let result: Pick<RssSource, 'title' | 'articles'> | { error: RssFetchError };
    try {
      result = await fetchFeed(current.url);
    } catch (error) {
      const code = error instanceof RssError ? error.code : 'network';
      if (code === 'duplicate' || code === 'limit') throw error;
      result = { error: code };
    }
    const checkedAt = Date.now();
    await updateRssSources((sources) => {
      if (!sources.some((saved) => saved.id === source.id)) return sources;
      return sources.map((saved) => {
        if (saved.id !== source.id) return saved;
        const { error: _previousError, ...subscription } = saved;
        return { ...subscription, ...result, checkedAt };
      });
    });
  });
}

export async function refreshFeeds(force = false): Promise<void> {
  const sources = await loadRssSources();
  await Promise.all(sources.filter((source) => force || isDue(source)).map((source) => refreshFeed(source, force)));
}
