// ============================================================
// GLOBALS
// ============================================================
var ALL = [];                    // flat list of all bookmarks {id, title, url, folderList, ...}
var STATE = {
  sections: [],                  // bd:sections, sorted by .order
  membership: {},                // bd:membership: { [bookmarkId]: sectionId }
  meta: null,                    // bd:meta
};
var logLines = [];

function dbg(s){ logLines.push(s); console.log('[BD]', s); }

// ============================================================
// TREE WALKER
// ============================================================
function walk(node, folders){
  var out = [];
  var name = (node.title||'').trim();
  var next = name ? folders.concat([name]) : folders.slice();

  if(node.url){
    var fset = new Set(next);
    out.push({
      id:    node.id,
      title: node.title||'(sem titulo)',
      url:   node.url,
      folders: fset,
      folderList: next,
      added: node.dateAdded||0,
    });
  }
  if(node.children){
    for(var i=0;i<node.children.length;i++){
      out = out.concat(walk(node.children[i], next));
    }
  }
  return out;
}

// ============================================================
// HELPERS
// ============================================================
function extractDomain(u){
  try{ return new URL(u).hostname.replace(/^www\./,''); }catch(e){ return ''; }
}

function ytId(u){
  var m=u.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return m?m[1]:null;
}

function clean(t){
  return t.replace(/^\(\d+\)\s*/,'').replace(/\s*-\s*YouTube$/,'')
    .replace(/\s*\|\s*[^|]+$/,'').trim()||t;
}

function esc(t){
  var d=document.createElement('div');
  d.textContent=t;
  return d.innerHTML;
}

function shuffle(a){
  var b=a.slice();
  for(var i=b.length-1;i>0;i--){
    var j=Math.floor(Math.random()*(i+1));
    var tmp=b[i];b[i]=b[j];b[j]=tmp;
  }
  return b;
}

function faviconUrl(u, size){
  var sz = size || 32;
  try{
    var origin = new URL(u).origin;
    if(typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id){
      return 'chrome-extension://'+chrome.runtime.id+'/_favicon/?pageUrl='+encodeURIComponent(origin)+'&size='+sz;
    }
    return 'https://www.google.com/s2/favicons?sz='+sz+'&domain_url='+encodeURIComponent(origin);
  }catch(e){
    return '';
  }
}

// ============================================================
// GROUP BY MEMBERSHIP
// ============================================================
function groupByMembership(bookmarks, membership, sections){
  var out = {};
  for(var i=0; i<sections.length; i++) out[sections[i].id] = [];
  for(var j=0; j<bookmarks.length; j++){
    var bm = bookmarks[j];
    var sid = membership[bm.id] || 'inbox';
    if(!out[sid]) out['inbox'] = out['inbox'] || [];
    (out[sid] || out['inbox']).push(bm);
  }
  return out;
}

// ============================================================
// RENDER
// ============================================================
function cardHTML(bm, big){
  var d = extractDomain(bm.url);
  var yt = ytId(bm.url);
  var title = clean(bm.title);
  var initial = (d.charAt(0)||'?').toUpperCase();
  var fav = faviconUrl(bm.url);
  var folder = bm.folderList[bm.folderList.length-1]||'';

  // Thumbnail strategy (all native, zero external APIs):
  //   YouTube → YT thumbnail API (same-origin CDN)
  //   Other   → large favicon (128px) via chrome _favicon API → letter initial
  // All use data-src for IntersectionObserver lazy loading
  var favLg = faviconUrl(bm.url, 128);
  var thumb;
  if(yt){
    thumb = '<img class="yt-thumb lazy-thumb" data-src="https://img.youtube.com/vi/'+yt+'/mqdefault.jpg"'
      + ' data-fallback="'+esc(favLg)+'"'
      + ' data-initial="'+initial+'"'
      + ' alt="" />'
      + '<div class="yt-play"></div>';
  } else {
    thumb = '<img class="site-thumb lazy-thumb" data-src="'+esc(favLg)+'"'
      + ' data-initial="'+initial+'"'
      + ' alt="" />';
  }

  // Placeholder with spinner shown while lazy image loads
  var placeholder = '<div class="thumb-placeholder">'
    + '<div class="thumb-spinner"></div>'
    + '</div>';

  var actions = '<div class="dial-actions">'
    + '<button class="btn-edit" data-id="'+esc(bm.id)+'" data-title="'+esc(bm.title)+'" title="Editar titulo">&#9998;</button>'
    + '<button class="btn-del" data-id="'+esc(bm.id)+'" data-title="'+esc(bm.title)+'" title="Excluir favorito">&#10005;</button>'
    + '</div>';

  // Breadcrumb from folder path (skip root empty names)
  var crumbs = bm.folderList.filter(function(f){ return f; });
  var breadcrumb = crumbs.length
    ? '<div class="dial-breadcrumb">' + crumbs.map(function(f){ return esc(f); }).join(' <span class="bc-sep">›</span> ') + '</div>'
    : '';

  return '<div class="dial-wrap'+(big?' featured':'')+'" data-bm-id="'+esc(bm.id)+'" data-href="'+esc(bm.url)+'" title="'+esc(bm.title)+'">'
    + actions
    + '<div class="dial-thumb">'+placeholder+thumb+'</div>'
    + '<div class="dial-body">'
    + breadcrumb
    + '<div class="dial-title" data-bmid="'+esc(bm.id)+'">'+esc(title)+'</div>'
    + '<div class="dial-domain"><img src="'+fav+'" alt="" onerror="this.style.display=\'none\'"/>'+esc(d)+'</div>'
    + '</div>'
    + '</div>';
}

// ============================================================
// LAZY LOAD via IntersectionObserver
// ============================================================
var thumbObserver = null;

function initThumbObserver(){
  if(thumbObserver) thumbObserver.disconnect();

  // rootMargin: start loading 200px before card enters viewport
  thumbObserver = new IntersectionObserver(function(entries){
    for(var i=0;i<entries.length;i++){
      if(!entries[i].isIntersecting) continue;
      var img = entries[i].target;
      thumbObserver.unobserve(img);
      loadThumb(img);
    }
  }, { rootMargin:'200px 600px' });

  var imgs = document.querySelectorAll('.lazy-thumb[data-src]');
  for(var i=0;i<imgs.length;i++) thumbObserver.observe(imgs[i]);
}

function loadThumb(img){
  var src = img.getAttribute('data-src');
  var fallback = img.getAttribute('data-fallback');
  var initial = img.getAttribute('data-initial')||'?';
  if(!src) return;

  var loader = new Image();
  loader.onload = function(){
    img.src = src;
    img.removeAttribute('data-src');
    img.classList.add('thumb-loaded');
    // Hide the spinner placeholder
    var placeholder = img.parentElement.querySelector('.thumb-placeholder');
    if(placeholder) placeholder.style.display = 'none';
  };
  loader.onerror = function(){
    // YT thumb can fallback to large favicon
    if(fallback){
      img.setAttribute('data-src', fallback);
      img.removeAttribute('data-fallback');
      loadThumb(img);
      return;
    }
    // Final fallback: letter initial
    var placeholder = img.parentElement.querySelector('.thumb-placeholder');
    if(placeholder){
      placeholder.innerHTML = '<span class="letter">'+initial+'</span>';
    }
    img.style.display = 'none';
  };
  loader.src = src;
}

// ============================================================
// MODAL SYSTEM
// ============================================================
function showModal(html){
  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = '<div class="modal">'+html+'</div>';
  document.body.appendChild(overlay);

  // Close on overlay click (not modal itself)
  overlay.addEventListener('click', function(e){
    if(e.target === overlay) closeModal();
  });

  // Close on Escape
  var escHandler = function(e){
    if(e.key==='Escape'){ closeModal(); document.removeEventListener('keydown', escHandler); }
  };
  document.addEventListener('keydown', escHandler);

  return overlay;
}

function closeModal(){
  var m = document.querySelector('.modal-overlay');
  if(m) m.remove();
}

// ============================================================
// EDIT BOOKMARK
// ============================================================
function editBookmark(bmId, currentTitle){
  var html = '<h3>Editar favorito</h3>'
    + '<input class="modal-input" id="modal-edit-input" type="text" value="'+esc(currentTitle)+'"/>'
    + '<div class="modal-buttons">'
    + '<button class="modal-btn-cancel" id="modal-cancel">Cancelar</button>'
    + '<button class="modal-btn-confirm" id="modal-save">Salvar</button>'
    + '</div>';

  var overlay = showModal(html);
  var input = document.getElementById('modal-edit-input');
  input.focus();
  input.select();

  document.getElementById('modal-cancel').addEventListener('click', closeModal);

  document.getElementById('modal-save').addEventListener('click', function(){
    var newTitle = input.value.trim();
    if(!newTitle || newTitle === currentTitle){ closeModal(); return; }

    chrome.bookmarks.update(bmId, {title: newTitle}, function(result){
      if(chrome.runtime.lastError){
        dbg('Edit error: '+chrome.runtime.lastError.message);
        return;
      }
      dbg('Updated bookmark '+bmId+' title to: '+newTitle);

      // Update in-memory data
      for(var i=0;i<ALL.length;i++){
        if(ALL[i].id === bmId){
          ALL[i].title = newTitle;
          break;
        }
      }

      // Update visible card title without full re-render
      var titleEl = document.querySelector('.dial-title[data-bmid="'+bmId+'"]');
      if(titleEl) titleEl.textContent = clean(newTitle);

      // Update the edit button's data-title
      var editBtn = document.querySelector('.btn-edit[data-id="'+bmId+'"]');
      if(editBtn) editBtn.setAttribute('data-title', newTitle);
      var delBtn = document.querySelector('.btn-del[data-id="'+bmId+'"]');
      if(delBtn) delBtn.setAttribute('data-title', newTitle);

      closeModal();
    });
  });

  // Save on Enter
  input.addEventListener('keydown', function(e){
    if(e.key==='Enter') document.getElementById('modal-save').click();
  });
}

// ============================================================
// DELETE BOOKMARK
// ============================================================
function deleteBookmark(bmId, title){
  var displayTitle = clean(title);
  if(displayTitle.length > 50) displayTitle = displayTitle.substring(0,50) + '...';

  var html = '<h3>Excluir favorito</h3>'
    + '<p>Tem certeza que deseja excluir <strong>"'+esc(displayTitle)+'"</strong>?<br>'
    + 'Isso vai remover o favorito permanentemente do browser.</p>'
    + '<div class="modal-buttons">'
    + '<button class="modal-btn-cancel" id="modal-cancel">Cancelar</button>'
    + '<button class="modal-btn-danger" id="modal-confirm-del">Excluir</button>'
    + '</div>';

  var overlay = showModal(html);

  document.getElementById('modal-cancel').addEventListener('click', closeModal);

  document.getElementById('modal-confirm-del').addEventListener('click', function(){
    chrome.bookmarks.remove(bmId, function(){
      if(chrome.runtime.lastError){
        dbg('Delete error: '+chrome.runtime.lastError.message);
        closeModal();
        return;
      }
      dbg('Deleted bookmark '+bmId);

      // Remove from ALL
      ALL = ALL.filter(function(b){ return b.id !== bmId; });

      // Remove from membership
      if(STATE.membership.hasOwnProperty(bmId)){
        delete STATE.membership[bmId];
        saveMembership(STATE.membership);
      }

      // Update stats and rebuild carousels
      renderStats();
      renderAll();
      closeModal();
    });
  });
}

function sectionHTML(sec, items){
  var pick = shuffle(items);
  var trackClass = 'carousel-track';
  var cards = '';
  for(var i=0; i<pick.length; i++) cards += cardHTML(pick[i], false);

  var iconHtml = (typeof iconSVG === 'function') ? iconSVG(sec.icon || 'bookmark', 18) : '';
  var labelHtml = '<span class="group-icon" style="color:'+esc(sec.color || '#ccc')+'">'
    + iconHtml + '</span>'
    + '<span class="group-label" data-section-id="'+esc(sec.id)+'" tabindex="0" '
    + 'title="Clique para renomear">'+esc(sec.label)+'</span>';

  // Empty state hint
  if(!items.length){
    return '<div class="group" data-section-id="'+esc(sec.id)+'">'
      + '<div class="group-head">'
      + '<span class="group-dot" style="background:'+esc(sec.color || '#888')+'"></span>'
      + labelHtml
      + '</div>'
      + '<div class="empty-section">Arraste um card aqui</div>'
      + '</div>';
  }

  return '<div class="group" data-section-id="'+esc(sec.id)+'">'
    + '<div class="group-head">'
    + '<span class="group-dot" style="background:'+esc(sec.color || '#888')+'"></span>'
    + labelHtml
    + '</div>'
    + '<div class="carousel-viewport">'
    + '<button class="carousel-arrow left">&#8249;</button>'
    + '<div class="'+trackClass+'">'+cards+'</div>'
    + '<button class="carousel-arrow right">&#8250;</button>'
    + '</div>'
    + '</div>';
}

function renderAll(){
  var app = document.getElementById('app');
  var byId = groupByMembership(ALL, STATE.membership, STATE.sections);
  // Sort sections by order
  var sorted = STATE.sections.slice().sort(function(a,b){ return (a.order||0) - (b.order||0); });
  var html = '';
  for(var i=0; i<sorted.length; i++){
    var sec = sorted[i];
    html += sectionHTML(sec, byId[sec.id] || []);
  }
  app.innerHTML = html || '<div class="msg">Nenhuma seção configurada.</div>';
  initCarousels();
  initThumbObserver();
  if(typeof setupDragAndDrop === 'function') setupDragAndDrop();
}

// ============================================================
// CAROUSEL — infinite horizontal scroll
// ============================================================
function initCarousels(){
  var viewports = document.querySelectorAll('.carousel-viewport');
  for(var i=0;i<viewports.length;i++) setupCarousel(viewports[i]);
}

function setupCarousel(viewport){
  var track = viewport.querySelector('.carousel-track');
  var cards = Array.from(track.querySelectorAll('.dial-wrap'));
  if(!cards.length) return;

  var gap = 10;
  var cardW = cards[0].offsetWidth + gap;
  var visibleCount = Math.ceil(viewport.offsetWidth / cardW);
  var shouldLoop = cards.length > visibleCount;

  var leftBtn = viewport.querySelector('.carousel-arrow.left');
  var rightBtn = viewport.querySelector('.carousel-arrow.right');

  if(!shouldLoop){
    leftBtn.classList.add('hidden');
    if(cards.length <= visibleCount) rightBtn.classList.add('hidden');
  }

  // Scroll by N cards on arrow click
  var scrollAmount = cardW * Math.max(1, Math.floor(visibleCount / 2));

  leftBtn.addEventListener('click', function(e){
    e.stopPropagation();
    track.scrollBy({left: -scrollAmount, behavior:'smooth'});
  });
  rightBtn.addEventListener('click', function(e){
    e.stopPropagation();
    track.scrollBy({left: scrollAmount, behavior:'smooth'});
  });

  if(!shouldLoop) return;

  // Clone cards for infinite loop
  var cloneCount = visibleCount + 1;

  // Prepend clones of last N cards
  for(var i = cards.length - cloneCount; i < cards.length; i++){
    var idx = Math.max(0, i);
    var clone = cards[idx].cloneNode(true);
    clone.classList.add('carousel-clone');
    // Remove edit/delete on clones
    var actions = clone.querySelector('.dial-actions');
    if(actions) actions.remove();
    track.insertBefore(clone, track.firstChild);
  }

  // Append clones of first N cards
  for(var i = 0; i < cloneCount && i < cards.length; i++){
    var clone = cards[i].cloneNode(true);
    clone.classList.add('carousel-clone');
    var actions = clone.querySelector('.dial-actions');
    if(actions) actions.remove();
    track.appendChild(clone);
  }

  // Set initial scroll past the prepended clones
  track.style.scrollBehavior = 'auto';
  track.scrollLeft = cloneCount * cardW;
  track.style.scrollBehavior = 'smooth';

  // Seamless loop on scroll
  var ticking = false;
  var realWidth = cards.length * cardW;
  var prependWidth = cloneCount * cardW;

  track.addEventListener('scroll', function(){
    if(ticking) return;
    ticking = true;
    requestAnimationFrame(function(){
      var sl = track.scrollLeft;
      var maxReal = prependWidth + realWidth;

      if(sl >= maxReal){
        track.style.scrollBehavior = 'auto';
        track.scrollLeft = prependWidth + (sl - maxReal);
        track.style.scrollBehavior = 'smooth';
      } else if(sl <= 0){
        track.style.scrollBehavior = 'auto';
        track.scrollLeft = maxReal - prependWidth + sl;
        track.style.scrollBehavior = 'smooth';
      }
      ticking = false;
    });
  });
}

// Debounced resize handler to rebuild carousels
var resizeTimer;
window.addEventListener('resize', function(){
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(function(){
    if(ALL.length) renderAll();
  }, 300);
});

function renderStats(){}

function renderSearch(q){
  var app = document.getElementById('app');
  if(!q.trim()){ renderAll(); return; }
  var lq = q.toLowerCase();
  var res = ALL.filter(function(b){
    if(b.title.toLowerCase().indexOf(lq)!==-1) return true;
    if(b.url.toLowerCase().indexOf(lq)!==-1) return true;
    for(var i=0;i<b.folderList.length;i++){
      if(b.folderList[i].toLowerCase().indexOf(lq)!==-1) return true;
    }
    return false;
  });
  if(!res.length){
    app.innerHTML = '<div class="msg">Nada encontrado para "'+esc(q)+'"</div>';
    return;
  }
  var cards='';
  var show = res.slice(0,20);
  for(var i=0;i<show.length;i++) cards += cardHTML(show[i],false);
  var searchIcon = (typeof iconSVG === 'function') ? iconSVG('search', 16) : '';
  app.innerHTML = '<div class="group">'
    + '<div class="group-head">'
    + '<span class="group-dot" style="background:#888"></span>'
    + '<span class="group-icon">' + searchIcon + '</span>'
    + '<span class="group-label">"'+esc(q)+'"</span>'
    + '</div>'
    + '<div class="dial-grid">'+cards+'</div></div>';
  initThumbObserver();
}

// ============================================================
// RENAME SECTION INLINE
// ============================================================
function startRenameSection(labelEl){
  var sectionId = labelEl.getAttribute('data-section-id');
  var sec = STATE.sections.find(function(s){ return s.id === sectionId; });
  if(!sec) return;

  var oldLabel = sec.label;
  labelEl.classList.add('editing');
  labelEl.setAttribute('contenteditable', 'true');
  labelEl.focus();

  // Select all text
  var range = document.createRange();
  range.selectNodeContents(labelEl);
  var selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);

  function finish(save){
    labelEl.classList.remove('editing');
    labelEl.removeAttribute('contenteditable');
    var newLabel = labelEl.textContent.trim();
    if(save && newLabel && newLabel !== oldLabel){
      sec.label = newLabel;
      saveSections(STATE.sections).then(function(){
        dbg('renamed section ' + sectionId + ' -> ' + newLabel);
      });
    } else {
      labelEl.textContent = oldLabel;
    }
    labelEl.removeEventListener('blur', onBlur);
    labelEl.removeEventListener('keydown', onKey);
  }

  function onBlur(){ finish(true); }
  function onKey(ev){
    if(ev.key === 'Enter'){ ev.preventDefault(); finish(true); }
    else if(ev.key === 'Escape'){ ev.preventDefault(); finish(false); }
  }

  labelEl.addEventListener('blur', onBlur);
  labelEl.addEventListener('keydown', onKey);
}

// ============================================================
// INIT
// ============================================================
async function init(){
  dbg('init start');

  var app = document.getElementById('app');
  app.innerHTML = '<div class="msg">Carregando favoritos...</div>';

  // Inject settings icon
  var settingsBtn = document.getElementById('btn-settings');
  if(settingsBtn && typeof iconSVG === 'function'){
    settingsBtn.innerHTML = iconSVG('settings', 18);
  }

  try {
    // Load bookmark tree
    var tree = await new Promise(function(resolve, reject){
      chrome.bookmarks.getTree(function(t){
        if(chrome.runtime.lastError){ reject(new Error(chrome.runtime.lastError.message)); return; }
        resolve(t);
      });
    });

    // Flatten
    ALL = [];
    for(var i=0; i<tree.length; i++){
      ALL = ALL.concat(walk(tree[i], []));
    }
    dbg('total bookmarks: ' + ALL.length);

    // Load existing storage state
    var loaded = await loadAll();
    var state = {
      sections: loaded.sections,
      membership: loaded.membership || {},
      meta: loaded.meta,
    };

    // First-time seed if needed
    if(!state.meta || !state.meta.seeded){
      dbg('first-time seed');
      state = await ensureSeeded(
        state,
        ALL,
        tree,
        saveInitialBackup,
        { sections: saveSections, membership: saveMembership, meta: saveMeta }
      );
    } else {
      // Reconcile membership against current bookmarks
      var rec = reconcileMembership(state.membership, ALL, 'inbox');
      if(rec.added.length || rec.removed.length){
        dbg('reconcile: +' + rec.added.length + ' -' + rec.removed.length);
        state.membership = rec.membership;
        await saveMembership(state.membership);
      }
    }

    STATE.sections = state.sections;
    STATE.membership = state.membership;
    STATE.meta = state.meta;

    // Sort sections by order
    STATE.sections.sort(function(a,b){ return (a.order||0) - (b.order||0); });

    renderStats();
    renderAll();
    setupBookmarkListeners();
    dbg('render complete');
  } catch(err) {
    dbg('ERROR: ' + err.message);
    app.innerHTML = '<div class="msg">Erro ao carregar bookmarks.<br>'
      + 'Verifique permissões em brave://extensions'
      + '<code>' + esc(err.message) + '\n\n' + esc(logLines.join('\n')) + '</code></div>';
  }
}

// ============================================================
// BOOKMARK CHROME EVENT LISTENERS
// ============================================================
function setupBookmarkListeners(){
  if(!chrome.bookmarks || !chrome.bookmarks.onRemoved) return;

  chrome.bookmarks.onRemoved.addListener(async function(id /*, info */){
    if(STATE.membership.hasOwnProperty(id)){
      delete STATE.membership[id];
      await saveMembership(STATE.membership);
    }
    ALL = ALL.filter(function(b){ return b.id !== id; });
    renderAll();
  });

  chrome.bookmarks.onCreated.addListener(async function(id, node){
    if(!node.url) return; // folder, ignore
    var folderList = [];
    // We don't have full path here without traversal; default to inbox.
    ALL.push({
      id: id,
      title: node.title || '(sem titulo)',
      url: node.url,
      folders: new Set(folderList),
      folderList: folderList,
      added: node.dateAdded || Date.now(),
    });
    STATE.membership[id] = 'inbox';
    await saveMembership(STATE.membership);
    renderAll();
  });

  chrome.bookmarks.onChanged.addListener(function(id, changes){
    for(var i=0; i<ALL.length; i++){
      if(ALL[i].id === id){
        if(changes.title !== undefined) ALL[i].title = changes.title;
        if(changes.url !== undefined) ALL[i].url = changes.url;
        break;
      }
    }
    var titleEl = document.querySelector('.dial-title[data-bmid="'+id+'"]');
    if(titleEl && changes.title !== undefined) titleEl.textContent = clean(changes.title);
  });

  // onMoved: ignored — membership is independent of folder structure.
}

// ---- EVENTS ----

// Delegated click handler for cards, edit and delete buttons
document.getElementById('app').addEventListener('click', function(e){
  // Edit button
  var editBtn = e.target.closest('.btn-edit');
  if(editBtn){
    e.preventDefault();
    e.stopPropagation();
    editBookmark(editBtn.getAttribute('data-id'), editBtn.getAttribute('data-title'));
    return;
  }
  // Delete button
  var delBtn = e.target.closest('.btn-del');
  if(delBtn){
    e.preventDefault();
    e.stopPropagation();
    deleteBookmark(delBtn.getAttribute('data-id'), delBtn.getAttribute('data-title'));
    return;
  }
  // Section label clicked -> inline rename
  var labelEl = e.target.closest('.group-label[data-section-id]');
  if(labelEl && !labelEl.classList.contains('editing')){
    e.preventDefault();
    e.stopPropagation();
    startRenameSection(labelEl);
    return;
  }
  // Card click → navigate
  var card = e.target.closest('.dial-wrap[data-href]');
  if(card){
    var href = card.getAttribute('data-href');
    if(href) window.location.href = href;
  }
});

document.getElementById('btn-shuffle').addEventListener('click', function(){
  document.getElementById('search').value='';
  renderAll();
});

document.getElementById('btn-settings').addEventListener('click', function(){
  if(typeof openSectionsModal === 'function') openSectionsModal();
});

var debounceTimer;
document.getElementById('search').addEventListener('input', function(e){
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(function(){ renderSearch(e.target.value); }, 200);
});

document.addEventListener('keydown', function(e){
  if(e.key==='/' && document.activeElement.tagName!=='INPUT'){
    e.preventDefault();
    document.getElementById('search').focus();
  }
  if(e.key==='Escape'){
    document.getElementById('search').value='';
    document.getElementById('search').blur();
    renderAll();
  }
});

// ============================================================
// HIDE BRAVE'S INJECTED FOOTER
// ============================================================
function hideBraveFooter(){
  // Brave injects elements outside our known DOM — hide anything we didn't create
  var known = ['app','stats','search','btn-shuffle','btn-settings'];
  var bodyChildren = document.body.children;
  for(var i=0;i<bodyChildren.length;i++){
    var el = bodyChildren[i];
    var tag = el.tagName.toLowerCase();
    // Skip our own elements
    if(tag==='script'||tag==='link'||tag==='style') continue;
    if(el.classList.contains('header')||el.classList.contains('stats')||el.id==='app') continue;
    if(el.classList.contains('modal-overlay')) continue;
    if(el.id==='search'||el.tagName==='DIV'&&el.className==='search-wrap') continue;
    // If it's not ours, hide it
    if(!el.id||known.indexOf(el.id)===-1){
      if(el.className && (el.className.toString().indexOf('header')!==-1 || el.className.toString().indexOf('stats')!==-1)) continue;
      el.style.display='none';
    }
  }
}

// Run once now, then watch for Brave injecting stuff later
hideBraveFooter();
var observer = new MutationObserver(function(mutations){
  for(var i=0;i<mutations.length;i++){
    if(mutations[i].addedNodes.length) {
      hideBraveFooter();
    }
  }
});
observer.observe(document.body, { childList: true });

// GO
init();
