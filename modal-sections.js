// modal-sections.js
// Modal "Gerenciar seções" — CRUD of sections + re-seed + export backup.

var COLOR_PALETTE = [
  '#4fc3f7','#ef5350','#ff9800','#66bb6a','#ce93d8',
  '#ab47bc','#ffa726','#26c6da','#ffd54f','#8d6e63'
];

function openSectionsModal(){
  if(document.querySelector('.bd-sections-modal')) return; // already open

  var closeSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" '
    + 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
    + '<line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/></svg>';

  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay bd-sections-modal';
  overlay.innerHTML = '<div class="modal bd-modal-wide">'
    + '<div class="bd-modal-head">'
    +   '<h3>Gerenciar seções</h3>'
    +   '<button class="bd-modal-close" aria-label="Fechar">'+closeSvg+'</button>'
    + '</div>'
    + '<div class="bd-modal-body">'
    +   '<button class="bd-add-section">+ Nova seção</button>'
    +   '<ul class="bd-section-list"></ul>'
    + '</div>'
    + '<div class="bd-modal-foot">'
    +   '<button class="bd-btn-secondary" id="bd-reseed">Recategorizar tudo automaticamente</button>'
    +   '<button class="bd-btn-secondary" id="bd-export">Exportar backup</button>'
    + '</div>'
    + '</div>';
  document.body.appendChild(overlay);

  // Close on overlay or X click
  overlay.addEventListener('click', function(e){ if(e.target === overlay) closeSectionsModal(); });
  overlay.querySelector('.bd-modal-close').addEventListener('click', closeSectionsModal);
  document.addEventListener('keydown', _modalKeyHandler);

  // Wire body buttons
  overlay.querySelector('.bd-add-section').addEventListener('click', _showCreateForm);
  overlay.querySelector('#bd-reseed').addEventListener('click', _handleReSeed);
  overlay.querySelector('#bd-export').addEventListener('click', _handleExport);

  _renderSectionList();
}

function closeSectionsModal(){
  var m = document.querySelector('.bd-sections-modal');
  if(m) m.remove();
  document.removeEventListener('keydown', _modalKeyHandler);
}

function _modalKeyHandler(e){
  if(e.key === 'Escape') closeSectionsModal();
}

function _renderSectionList(){
  var list = document.querySelector('.bd-section-list');
  if(!list) return;
  var sorted = STATE.sections.slice().sort(function(a,b){ return (a.order||0) - (b.order||0); });
  var html = '';
  for(var i=0; i<sorted.length; i++){
    var s = sorted[i];
    var isBuiltin = !!s.builtin;
    html += '<li class="bd-section-row" data-section-id="'+esc(s.id)+'" draggable="true">'
      + '<span class="bd-drag-handle" title="Arrastar para reordenar">⋮⋮</span>'
      + '<span class="bd-row-icon" style="color:'+esc(s.color)+'">'+iconSVG(s.icon || 'bookmark', 18)+'</span>'
      + '<span class="bd-row-label">'+esc(s.label)+'</span>'
      + '<span class="bd-row-actions">'
      +   '<button class="bd-edit-section" title="Editar">'+iconSVG('pen-tool',16)+'</button>'
      +   (isBuiltin
            ? '<span class="bd-row-pin" title="Seção fixa">'+iconSVG('star',16)+'</span>'
            : '<button class="bd-delete-section" title="Excluir">'+iconSVG('flame',16)+'</button>')
      + '</span>'
      + '</li>';
  }
  list.innerHTML = html;

  // Wire row buttons
  list.querySelectorAll('.bd-edit-section').forEach(function(btn){
    btn.addEventListener('click', function(){
      var row = btn.closest('.bd-section-row');
      _showEditForm(row.getAttribute('data-section-id'));
    });
  });
  list.querySelectorAll('.bd-delete-section').forEach(function(btn){
    btn.addEventListener('click', function(){
      var row = btn.closest('.bd-section-row');
      _handleDelete(row.getAttribute('data-section-id'));
    });
  });

  _wireReorder();
}

// ============================================================
// FORM (create + edit shared)
// ============================================================
function _formHTML(values, submitLabel){
  var iconGrid = iconNames().map(function(n){
    var sel = (n === values.icon) ? ' selected' : '';
    return '<button type="button" class="bd-icon-pick'+sel+'" data-icon="'+esc(n)+'" title="'+esc(n)+'">'
      + iconSVG(n, 20) + '</button>';
  }).join('');

  var colorPalette = COLOR_PALETTE.map(function(c){
    var sel = (c === values.color) ? ' selected' : '';
    return '<button type="button" class="bd-color-pick'+sel+'" data-color="'+esc(c)+'" '
      + 'style="background:'+esc(c)+'" title="'+esc(c)+'"></button>';
  }).join('');

  return '<label class="bd-field-label">Nome</label>'
    + '<input type="text" class="bd-form-input" name="label" value="'+esc(values.label || '')+'" maxlength="40"/>'
    + '<label class="bd-field-label">Ícone</label>'
    + '<div class="bd-icon-grid">'+iconGrid+'</div>'
    + '<label class="bd-field-label">Cor</label>'
    + '<div class="bd-color-row">'
    +   colorPalette
    +   '<input type="color" class="bd-color-custom" value="'+esc(values.color)+'"/>'
    + '</div>'
    + '<div class="bd-form-actions">'
    +   '<button class="bd-btn-secondary bd-form-cancel" type="button">Cancelar</button>'
    +   '<button class="bd-btn-primary bd-form-submit" type="button">'+esc(submitLabel)+'</button>'
    + '</div>';
}

function _wireForm(form, submitFn){
  var iconSelected = form.querySelector('.bd-icon-pick.selected');
  var colorSelected = form.querySelector('.bd-color-pick.selected');
  var current = {
    label: form.querySelector('input[name="label"]').value,
    icon: iconSelected ? iconSelected.getAttribute('data-icon') : 'bookmark',
    color: colorSelected
      ? colorSelected.getAttribute('data-color')
      : form.querySelector('.bd-color-custom').value,
  };
  form.querySelectorAll('.bd-icon-pick').forEach(function(btn){
    btn.addEventListener('click', function(){
      form.querySelectorAll('.bd-icon-pick').forEach(function(b){ b.classList.remove('selected'); });
      btn.classList.add('selected');
      current.icon = btn.getAttribute('data-icon');
    });
  });
  form.querySelectorAll('.bd-color-pick').forEach(function(btn){
    btn.addEventListener('click', function(){
      form.querySelectorAll('.bd-color-pick').forEach(function(b){ b.classList.remove('selected'); });
      btn.classList.add('selected');
      current.color = btn.getAttribute('data-color');
      form.querySelector('.bd-color-custom').value = current.color;
    });
  });
  form.querySelector('.bd-color-custom').addEventListener('input', function(e){
    current.color = e.target.value;
    form.querySelectorAll('.bd-color-pick').forEach(function(b){ b.classList.remove('selected'); });
  });
  form.querySelector('input[name="label"]').addEventListener('input', function(e){
    current.label = e.target.value;
  });
  form.querySelector('.bd-form-cancel').addEventListener('click', function(){ form.remove(); });
  form.querySelector('.bd-form-submit').addEventListener('click', async function(){
    if(!current.label.trim()) return;
    await submitFn(current);
    form.remove();
    _renderSectionList();
    renderAll();
  });
}

// ============================================================
// CREATE
// ============================================================
function _showCreateForm(){
  var container = document.querySelector('.bd-modal-body');
  if(!container) return;
  var existing = container.querySelector('.bd-section-form');
  if(existing) existing.remove();

  var form = document.createElement('div');
  form.className = 'bd-section-form';
  form.innerHTML = _formHTML({ label: '', icon: 'bookmark', color: COLOR_PALETTE[0] }, 'Criar');
  container.insertBefore(form, container.querySelector('.bd-section-list'));

  _wireForm(form, function(values){
    return _createSection(values);
  });
  form.querySelector('input[name="label"]').focus();
}

async function _createSection(values){
  var ids = STATE.sections.map(function(s){ return s.id; });
  var newId = uniqueSectionId(slugify(values.label), ids);
  var nonBuiltinOrders = STATE.sections
    .filter(function(s){ return !s.builtin; })
    .map(function(s){ return s.order || 0; });
  var maxOrder = nonBuiltinOrders.length ? Math.max.apply(null, nonBuiltinOrders) : -1;
  STATE.sections.push({
    id: newId,
    label: values.label.trim(),
    icon: values.icon,
    color: values.color,
    order: maxOrder + 1,
  });
  STATE.sections.sort(function(a,b){ return (a.order||0) - (b.order||0); });
  await saveSections(STATE.sections);
}

// ============================================================
// EDIT
// ============================================================
function _showEditForm(sectionId){
  var sec = STATE.sections.find(function(s){ return s.id === sectionId; });
  if(!sec) return;

  var row = document.querySelector('.bd-section-row[data-section-id="'+sectionId+'"]');
  if(!row) return;
  var existing = row.nextElementSibling;
  if(existing && existing.classList.contains('bd-section-form')){ existing.remove(); return; }

  var form = document.createElement('div');
  form.className = 'bd-section-form';
  form.innerHTML = _formHTML({ label: sec.label, icon: sec.icon, color: sec.color }, 'Salvar');
  row.parentNode.insertBefore(form, row.nextSibling);

  _wireForm(form, async function(values){
    sec.label = values.label.trim();
    sec.icon = values.icon;
    sec.color = values.color;
    await saveSections(STATE.sections);
  });
  form.querySelector('input[name="label"]').focus();
  form.querySelector('input[name="label"]').select();
}

// ============================================================
// DELETE
// ============================================================
async function _handleDelete(sectionId){
  var sec = STATE.sections.find(function(s){ return s.id === sectionId; });
  if(!sec || sec.builtin) return;

  var count = 0;
  for(var bmId in STATE.membership){
    if(STATE.membership[bmId] === sectionId) count++;
  }

  var msg = count > 0
    ? 'Excluir "'+sec.label+'"? Os '+count+' bookmark(s) que estão aqui serão movidos para "Não categorizado".'
    : 'Excluir "'+sec.label+'"?';

  if(!confirm(msg)) return;

  for(var bmId2 in STATE.membership){
    if(STATE.membership[bmId2] === sectionId) STATE.membership[bmId2] = 'inbox';
  }
  STATE.sections = STATE.sections.filter(function(s){ return s.id !== sectionId; });

  await saveMembership(STATE.membership);
  await saveSections(STATE.sections);

  _renderSectionList();
  renderAll();
}

// ============================================================
// REORDER (drag rows in modal)
// ============================================================
var _reorderState = null;

function _wireReorder(){
  var rows = document.querySelectorAll('.bd-section-row');
  rows.forEach(function(row){
    row.addEventListener('dragstart', function(e){
      _reorderState = row.getAttribute('data-section-id');
      row.classList.add('bd-row-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', _reorderState);
    });
    row.addEventListener('dragend', function(){
      row.classList.remove('bd-row-dragging');
      _reorderState = null;
    });
    row.addEventListener('dragover', function(e){
      if(_reorderState && _reorderState !== row.getAttribute('data-section-id')){
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        row.classList.add('bd-row-drop-target');
      }
    });
    row.addEventListener('dragleave', function(){
      row.classList.remove('bd-row-drop-target');
    });
    row.addEventListener('drop', async function(e){
      e.preventDefault();
      row.classList.remove('bd-row-drop-target');
      var draggedId = _reorderState || e.dataTransfer.getData('text/plain');
      var targetId = row.getAttribute('data-section-id');
      if(!draggedId || draggedId === targetId) return;
      await _reorderSection(draggedId, targetId);
    });
  });
}

async function _reorderSection(draggedId, targetId){
  // Keep inbox at the end always (regardless of moves)
  var nonBuiltin = STATE.sections.filter(function(s){ return !s.builtin; });
  var builtin = STATE.sections.filter(function(s){ return s.builtin; });

  nonBuiltin.sort(function(a,b){ return (a.order||0) - (b.order||0); });

  var draggedIdx = nonBuiltin.findIndex(function(s){ return s.id === draggedId; });
  var targetIdx = nonBuiltin.findIndex(function(s){ return s.id === targetId; });
  if(draggedIdx === -1) return;
  if(targetIdx === -1) targetIdx = nonBuiltin.length;

  var moved = nonBuiltin.splice(draggedIdx, 1)[0];
  if(targetIdx > draggedIdx) targetIdx--;
  nonBuiltin.splice(targetIdx, 0, moved);

  // Recalculate order
  for(var i=0; i<nonBuiltin.length; i++) nonBuiltin[i].order = i;
  builtin.forEach(function(s){ if(s.id === 'inbox') s.order = 999; });

  STATE.sections = nonBuiltin.concat(builtin);
  await saveSections(STATE.sections);
  _renderSectionList();
  renderAll();
}

// ============================================================
// RE-SEED
// ============================================================
async function _handleReSeed(){
  if(!confirm(
    'Recategorizar tudo automaticamente?\n\n'
    + 'Isso vai apagar TODAS as movimentações manuais que você fez. '
    + 'As seções customizadas serão preservadas, mas os bookmarks delas voltam para "Não categorizado" '
    + '(a menos que casem com uma regra automática das seções padrão).\n\n'
    + 'Considere exportar um backup antes.'
  )) return;

  var membership = await reSeedAll(ALL, saveMembership);
  STATE.membership = membership;
  _renderSectionList();
  renderAll();
  alert('Categorização atualizada.');
}

// ============================================================
// EXPORT BACKUP
// ============================================================
async function _handleExport(){
  try {
    var data = await exportBackup();
    var json = JSON.stringify(data, null, 2);
    var blob = new Blob([json], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    var ts = new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
    a.href = url;
    a.download = 'bookmark-dial-backup-' + ts + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
  } catch(err) {
    alert('Erro ao exportar: ' + err.message);
  }
}
