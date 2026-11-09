import { iconSVG } from '../assets/icons';
import { t, uiLanguage } from '../services/i18n';
import {
  addFeed, getFeeds, normalizeFeedUrl, onFeedsChanged, refreshFeeds, removeFeed,
  requestFeedAccess, setFeedColor, MAX_RSS_SOURCES, RssError,
} from '../services/rss';
import type { RssSource } from '../types';

const MAX_VISIBLE_ARTICLES = 12;
const DEFAULT_COLOR_SWATCH = '#808080';
const errorMessage = {
  permission: 'rssPermissionDenied',
  invalid: 'rssInvalidFeed',
  network: 'rssNetworkError',
  duplicate: 'rssDuplicateFeed',
  limit: 'rssSourceLimit',
} as const;

function action(label: string, icon: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn btn-ghost btn-square btn-sm shrink-0';
  button.title = label;
  button.setAttribute('aria-label', label);
  button.innerHTML = iconSVG(icon, 16);
  return button;
}

function renderArticles(list: HTMLElement, sources: RssSource[], dateFormat: Intl.DateTimeFormat): void {
  const articles = sources.flatMap((source) =>
    source.articles.map((article) => ({ ...article, source: source.title, color: source.color })),
  );
  articles.sort((a, b) => (b.publishedAt ?? Number.MIN_SAFE_INTEGER) - (a.publishedAt ?? Number.MIN_SAFE_INTEGER));

  const rows = document.createDocumentFragment();
  const seen = new Set<string>();
  const focusedUrl = list.contains(document.activeElement)
    ? (document.activeElement as HTMLAnchorElement).href : undefined;
  let nextFocus: HTMLAnchorElement | undefined;
  for (const article of articles) {
    if (seen.has(article.url)) continue;
    seen.add(article.url);

    const row = document.createElement('li');
    const link = document.createElement('a');
    link.className = 'group block rounded-lg px-3 py-3.5 hover:bg-base-content/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary';
    link.href = article.url;
    link.referrerPolicy = 'no-referrer';

    const title = document.createElement('span');
    title.className = 'mt-1.5 block break-words text-[0.9375rem] font-semibold leading-snug';
    if (article.color) {
      title.style.color = article.color;
      title.classList.add('group-hover:underline');
    } else {
      title.classList.add('group-hover:text-primary');
    }
    title.textContent = article.title;

    const metadata = document.createElement('span');
    metadata.className = 'flex items-center justify-between gap-3 text-xs text-base-content/65';
    const source = document.createElement('span');
    source.className = 'truncate font-medium';
    source.textContent = article.source;
    metadata.append(source);
    if (article.publishedAt !== null) {
      const time = document.createElement('time');
      const date = new Date(article.publishedAt);
      time.className = 'shrink-0';
      time.dateTime = date.toISOString();
      time.textContent = dateFormat.format(date);
      metadata.append(time);
    }
    link.append(metadata, title);
    if (article.excerpt) {
      const excerpt = document.createElement('span');
      excerpt.className = 'rss-excerpt mt-1 line-clamp-2 break-words text-sm leading-snug text-base-content/70';
      excerpt.textContent = article.excerpt;
      link.append(excerpt);
    }
    row.append(link);
    rows.append(row);
    if (link.href === focusedUrl) nextFocus = link;
    if (seen.size >= MAX_VISIBLE_ARTICLES) break;
  }
  list.replaceChildren(rows);
  nextFocus?.focus({ preventScroll: true });
}

export function initRssPanel(panel: HTMLElement): void {
  panel.setAttribute('aria-labelledby', 'rss-heading');
  panel.innerHTML = `
    <div class="rounded-2xl border border-base-content/10 bg-base-100">
      <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-4 sm:px-5">
        <h2 id="rss-heading" class="flex min-w-0 items-center gap-2 text-lg font-bold tracking-tight">
          <span aria-hidden="true" class="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">${iconSVG('rss', 17)}</span>
          <span data-rss-text="rssHeading"></span>
        </h2>
        <div id="rss-actions" class="flex items-center gap-1">
          <button id="rss-manage" type="button" class="btn btn-sm btn-ghost hidden" aria-haspopup="dialog" aria-controls="rss-source-dialog">
            <span aria-hidden="true">${iconSVG('settings', 15)}</span>
            <span data-rss-text="rssSources"></span>
          </button>
        </div>
      </div>
      <div id="rss-filter" class="hidden border-t border-base-content/10 px-4 py-3 sm:px-5">
        <label for="rss-source-filter" class="sr-only" data-rss-text="rssFilterSource"></label>
        <select id="rss-source-filter" class="select select-bordered select-sm w-full font-medium" aria-controls="rss-articles"></select>
      </div>
      <p id="rss-status" class="mx-4 mb-4 rounded-lg bg-base-200 px-3 py-2.5 text-sm leading-relaxed text-base-content/70 empty:hidden sm:mx-5" role="status"></p>
      <div id="rss-empty-actions" class="hidden px-4 pb-4 sm:px-5">
        <button type="button" class="btn btn-primary btn-sm" aria-haspopup="dialog" aria-controls="rss-source-dialog">
          <span aria-hidden="true">${iconSVG('plus', 16)}</span>
          <span data-rss-text="rssAddSource"></span>
        </button>
      </div>
      <ul id="rss-articles" class="mx-2 mb-2 divide-y divide-base-content/10 border-t border-base-content/10 empty:hidden sm:mx-3"></ul>
    </div>
    <dialog id="rss-source-dialog" class="modal [&:not([open])]:hidden" aria-labelledby="rss-source-heading">
      <section class="modal-box w-[calc(100%-2rem)] max-w-lg p-0">
        <header class="flex items-center justify-between gap-3 border-b border-base-content/10 px-4 py-3 sm:px-6">
          <h2 id="rss-source-heading" class="text-lg font-semibold tracking-tight" data-rss-text="rssManageSources"></h2>
        </header>
        <div class="space-y-5 p-4 sm:p-6">
          <form id="rss-source-form" class="space-y-2" novalidate>
            <label for="rss-url" class="block text-sm font-semibold" data-rss-text="rssUrlLabel"></label>
            <div class="flex flex-wrap gap-2">
              <input id="rss-url" type="url" class="input input-bordered min-w-40 flex-1" placeholder="https://" required autocomplete="off" spellcheck="false" aria-describedby="rss-url-hint rss-form-status" autofocus>
              <button type="submit" class="btn btn-primary" data-rss-text="rssAddSource"></button>
            </div>
            <p id="rss-url-hint" class="text-xs leading-relaxed text-base-content/70" data-rss-text="rssUrlHint"></p>
            <p id="rss-form-status" class="text-sm empty:hidden" role="status"></p>
          </form>
          <section id="rss-subscriptions" class="hidden space-y-2" aria-labelledby="rss-subscriptions-heading">
            <h3 id="rss-subscriptions-heading" class="text-sm font-semibold" data-rss-text="rssSubscribedSources"></h3>
            <ul id="rss-sources" class="divide-y divide-base-content/10 rounded-xl border border-base-content/10 px-3"></ul>
          </section>
        </div>
      </section>
      <form method="dialog" class="modal-backdrop" aria-hidden="true"><button tabindex="-1"></button></form>
    </dialog>`;
  panel.querySelectorAll<HTMLElement>('[data-rss-text]').forEach((node) => {
    node.textContent = t(node.dataset.rssText!);
  });

  const refreshButton = action(t('rssRefresh'), 'refresh-cw');
  refreshButton.classList.add('aria-disabled:cursor-default', 'aria-disabled:opacity-50');
  panel.querySelector('#rss-actions')!.prepend(refreshButton);
  const manageButton = panel.querySelector<HTMLButtonElement>('#rss-manage')!;
  manageButton.setAttribute('aria-label', t('rssManageSources'));
  const emptyActions = panel.querySelector<HTMLElement>('#rss-empty-actions')!;
  const addButton = emptyActions.querySelector('button')!;
  const dialog = panel.querySelector('dialog')!;
  const closeButton = action(t('close'), 'x');
  dialog.querySelector('header')!.append(closeButton);
  closeButton.addEventListener('click', () => dialog.close());
  const form = panel.querySelector<HTMLFormElement>('#rss-source-form')!;
  const input = form.querySelector('input')!;
  const submit = form.querySelector('button')!;
  const filterWrapper = panel.querySelector<HTMLElement>('#rss-filter')!;
  const filter = filterWrapper.querySelector('select')!;
  const status = panel.querySelector<HTMLElement>('#rss-status')!;
  const formStatus = panel.querySelector<HTMLElement>('#rss-form-status')!;
  const subscriptions = panel.querySelector<HTMLElement>('#rss-subscriptions')!;
  const sourceList = panel.querySelector<HTMLElement>('#rss-sources')!;
  const articleList = panel.querySelector<HTMLElement>('#rss-articles')!;
  const dateFormat = new Intl.DateTimeFormat(uiLanguage(), { day: 'numeric', month: 'short', year: 'numeric' });
  let sources: RssSource[] = [];
  let refreshing = true;
  let storageFailed = false;
  const colorControls = new Map<string, { picker: HTMLInputElement; reset: HTMLButtonElement }>();

  function showStatus(): void {
    const hasSources = sources.length > 0;
    const showAdd = !hasSources && !refreshing && !storageFailed;
    manageButton.classList.toggle('hidden', !hasSources && !storageFailed);
    emptyActions.classList.toggle('hidden', !showAdd);
    refreshButton.classList.toggle('hidden', !hasSources && !storageFailed);
    refreshButton.setAttribute('aria-disabled', String(refreshing || (!sources.length && !storageFailed)));
    let message = '';
    if (storageFailed) message = 'rssStorageError';
    else if (refreshing) message = 'rssLoading';
    else if (!sources.length) message = 'rssEmptySources';
    else if (sources.some((source) => source.error)) message = 'rssPartialError';
    else if (!articleList.children.length) message = 'rssEmptyArticles';
    status.textContent = message ? t(message) : '';
  }

  function showFormStatus(message: string, isError = false): void {
    formStatus.classList.toggle('text-error', isError);
    formStatus.textContent = message ? t(message) : '';
  }

  function openSources(): void {
    if (!submit.disabled) showFormStatus('');
    dialog.showModal();
  }
  manageButton.addEventListener('click', openSources);
  addButton.addEventListener('click', openSources);
  dialog.addEventListener('close', () => {
    (manageButton.classList.contains('hidden') ? addButton : manageButton).focus({ preventScroll: true });
  });

  function showArticles(): void {
    const selectedSource = sources.find((source) => source.id === filter.value);
    renderArticles(articleList, selectedSource ? [selectedSource] : sources, dateFormat);
    showStatus();
  }
  filter.addEventListener('change', showArticles);

  function syncColor(source: RssSource): void {
    const controls = colorControls.get(source.id);
    if (!controls) return;
    const color = source.color ?? DEFAULT_COLOR_SWATCH;
    if (controls.picker.value !== color) controls.picker.value = color;
    controls.reset.classList.toggle('hidden', !source.color);
  }

  async function saveColor(id: string, color?: string): Promise<void> {
    try {
      await setFeedColor(id, color);
    } catch {
      const source = sources.find((candidate) => candidate.id === id);
      if (source) syncColor(source);
      showFormStatus('rssStorageError', true);
    }
  }

  function renderSourceControls(): void {
    colorControls.clear();
    const rows = document.createDocumentFragment();
    const paths = sources.map((source) => {
      const url = new URL(source.url);
      return url.host + url.pathname;
    });
    const locations = paths.map((path, index) =>
      paths.indexOf(path) === paths.lastIndexOf(path) ? path : `${path} (${index + 1})`,
    );
    for (const [index, source] of sources.entries()) {
      const row = document.createElement('li');
      row.className = 'py-2';
      const header = document.createElement('div');
      header.className = 'flex items-center gap-2';
      const identity = document.createElement('div');
      identity.className = 'min-w-0 flex-1';
      const title = document.createElement('span');
      title.className = 'block break-words text-sm font-medium';
      title.textContent = source.title;
      const location = document.createElement('span');
      location.className = 'block truncate text-xs text-base-content/70';
      location.textContent = locations[index];
      location.title = source.url;
      identity.append(title, location);
      const sourceLabel = `${source.title} (${location.textContent})`;
      const picker = document.createElement('input');
      picker.type = 'color';
      picker.className = 'size-8 shrink-0 cursor-pointer rounded-md border border-base-content/20 bg-base-200 p-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary';
      picker.title = t('rssSourceColor', [sourceLabel]);
      picker.setAttribute('aria-label', picker.title);
      picker.addEventListener('change', () => void saveColor(source.id, picker.value));
      const reset = action(t('rssResetSourceColor', [sourceLabel]), 'refresh-cw');
      reset.addEventListener('click', () => {
        picker.focus();
        void saveColor(source.id);
      });
      colorControls.set(source.id, { picker, reset });
      syncColor(source);
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn btn-ghost btn-sm shrink-0 text-base-content/70 hover:text-error';
      remove.textContent = t('rssRemove');
      remove.setAttribute('aria-label', t('rssRemoveSource', [sourceLabel]));
      remove.addEventListener('click', async () => {
        remove.disabled = true;
        try {
          await removeFeed(source.id);
          showFormStatus('rssSourceRemoved');
          if (dialog.open) input.focus();
        } catch {
          showFormStatus('rssStorageError', true);
          remove.disabled = false;
          remove.focus();
        }
      });
      header.append(identity, picker, reset, remove);
      row.append(header);
      if (source.error) {
        const warning = document.createElement('p');
        warning.className = 'text-xs leading-relaxed text-base-content/70';
        warning.textContent = t(errorMessage[source.error]);
        row.append(warning);
        if (source.error === 'permission') {
          const grant = document.createElement('button');
          grant.type = 'button';
          grant.className = 'btn btn-ghost btn-xs mt-1';
          grant.textContent = t('rssGrantAccess');
          grant.addEventListener('click', async () => {
            grant.disabled = true;
            try {
              if (!await requestFeedAccess(source.url)) throw new RssError('permission');
              await refresh(true);
              if (dialog.open) input.focus();
            } catch {
              showFormStatus('rssPermissionDenied', true);
            } finally {
              grant.disabled = false;
              if (grant.isConnected && document.activeElement === document.body) grant.focus();
            }
          });
          row.append(grant);
        }
      }
      rows.append(row);
    }
    sourceList.replaceChildren(rows);
    subscriptions.classList.toggle('hidden', !sources.length);
    const selected = filter.value;
    filter.replaceChildren(new Option(t('rssAllSources'), ''));
    for (const [index, source] of sources.entries()) {
      const duplicate = sources.some((candidate) => candidate !== source && candidate.title === source.title);
      const label = duplicate ? `${source.title} (${locations[index]})` : source.title;
      filter.add(new Option(label, source.id));
    }
    const canFilter = sources.length > 1;
    filterWrapper.classList.toggle('hidden', !canFilter);
    filter.value = canFilter && sources.some((source) => source.id === selected) ? selected : '';
  }

  function renderSources(next: RssSource[]): void {
    const previousSources = sources;
    const sameControls = next.length === sources.length && next.every((source, index) => {
      const previous = sources[index];
      return source.id === previous.id && source.url === previous.url
        && source.title === previous.title && source.error === previous.error;
    });
    sources = next;
    if (sameControls) {
      sources.forEach((source, index) => {
        if (source.color !== previousSources[index].color) syncColor(source);
      });
    } else {
      renderSourceControls();
    }
    showArticles();
  }

  async function refresh(force: boolean): Promise<void> {
    refreshing = true;
    storageFailed = false;
    showStatus();
    try {
      await refreshFeeds(force);
    } catch {
      storageFailed = true;
    } finally {
      refreshing = false;
      showStatus();
    }
  }

  refreshButton.addEventListener('click', () => {
    if (refreshButton.getAttribute('aria-disabled') === 'false') void refresh(true);
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submit.disabled) return;
    const url = normalizeFeedUrl(input.value);
    if (!url) {
      input.setAttribute('aria-invalid', 'true');
      showFormStatus('rssInvalidUrl', true);
      input.focus();
      return;
    }
    input.removeAttribute('aria-invalid');
    if (sources.some((source) => source.url === url)) {
      showFormStatus('rssDuplicateFeed', true);
      return;
    }
    if (sources.length >= MAX_RSS_SOURCES) {
      showFormStatus('rssSourceLimit', true);
      return;
    }

    submit.disabled = true;
    input.readOnly = true;
    showFormStatus('rssAddingSource');
    try {
      if (!await requestFeedAccess(url)) throw new RssError('permission');
      await addFeed(url);
      input.value = '';
      showFormStatus('rssSourceAdded');
    } catch (error) {
      showFormStatus(error instanceof RssError ? errorMessage[error.code] : 'rssStorageError', true);
    } finally {
      submit.disabled = false;
      input.readOnly = false;
      if (dialog.open) input.focus();
    }
  });
  input.addEventListener('input', () => {
    input.removeAttribute('aria-invalid');
    showFormStatus('');
  });

  async function start(): Promise<void> {
    showStatus();
    try {
      let receivedChange = false;
      onFeedsChanged((next) => {
        receivedChange = true;
        renderSources(next);
      });
      const saved = await getFeeds();
      if (!receivedChange) renderSources(saved);
      await refresh(false);
    } catch {
      storageFailed = true;
      refreshing = false;
      showStatus();
    }
  }
  void start();
}
