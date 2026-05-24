// dnd.js
// HTML5 Drag-and-Drop handlers for moving bookmark cards between sections.
// Drop zones: .group-head and .carousel-viewport. Clones (.carousel-clone) are NOT draggable.

function setupDragAndDrop(){
  // Make real cards draggable; explicitly disable on clones.
  var cards = document.querySelectorAll('.dial-wrap');
  for(var i=0; i<cards.length; i++){
    if(cards[i].classList.contains('carousel-clone')){
      cards[i].setAttribute('draggable', 'false');
    } else {
      cards[i].setAttribute('draggable', 'true');
      _wireCard(cards[i]);
    }
  }
  var zones = document.querySelectorAll('.group-head, .carousel-viewport');
  for(var j=0; j<zones.length; j++) _wireZone(zones[j]);
}

function _wireCard(card){
  card.addEventListener('dragstart', function(e){
    var bmId = _bookmarkIdFromCard(card);
    if(!bmId){ e.preventDefault(); return; }
    e.dataTransfer.setData('text/plain', bmId);
    e.dataTransfer.effectAllowed = 'move';
    document.body.classList.add('bd-dragging');
    card.classList.add('bd-card-dragging');
  });
  card.addEventListener('dragend', function(){
    document.body.classList.remove('bd-dragging');
    card.classList.remove('bd-card-dragging');
    var hi = document.querySelectorAll('.bd-drop-target');
    for(var i=0; i<hi.length; i++) hi[i].classList.remove('bd-drop-target');
  });
}

function _wireZone(zone){
  var group = zone.closest('.group');
  if(!group) return;

  zone.addEventListener('dragover', function(e){
    if(!document.body.classList.contains('bd-dragging')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    group.classList.add('bd-drop-target');
  });
  zone.addEventListener('dragleave', function(e){
    // dragleave fires when moving onto child — guard with relatedTarget
    if(!group.contains(e.relatedTarget)) group.classList.remove('bd-drop-target');
  });
  zone.addEventListener('drop', function(e){
    e.preventDefault();
    group.classList.remove('bd-drop-target');
    var bmId = e.dataTransfer.getData('text/plain');
    var destSectionId = group.getAttribute('data-section-id');
    if(!bmId || !destSectionId) return;
    moveBookmark(bmId, destSectionId);
  });
}

function _bookmarkIdFromCard(card){
  var directId = card.getAttribute('data-bm-id');
  if(directId) return directId;
  var titleEl = card.querySelector('.dial-title[data-bmid]');
  return titleEl ? titleEl.getAttribute('data-bmid') : null;
}

async function moveBookmark(bmId, destSectionId){
  if(!STATE.membership || STATE.membership[bmId] === destSectionId) return; // no-op
  STATE.membership[bmId] = destSectionId;
  await saveMembership(STATE.membership);
  renderAll();
}
