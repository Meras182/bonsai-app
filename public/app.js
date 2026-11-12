'use strict';

/* ---------- Konstanten ---------- */

const TASK_TYPES = ['water', 'fertilize', 'prune', 'repot'];
const TASK_META = {
  water:     { label: 'Gießen',   ico: '💧' },
  fertilize: { label: 'Düngen',   ico: '🌾' },
  prune:     { label: 'Schneiden', ico: '✂️' },
  repot:     { label: 'Umtopfen', ico: '🪴' }
};
const DEFAULT_INTERVALS = { water: 3, fertilize: 30, prune: 90, repot: 730 };
const DAY_MS = 24 * 60 * 60 * 1000;

/* ---------- IndexedDB ---------- */

let db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('bonsai', 1);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains('trees')) d.createObjectStore('trees', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('photos')) {
        const s = d.createObjectStore('photos', { keyPath: 'id' });
        s.createIndex('treeId', 'treeId');
      }
      if (!d.objectStoreNames.contains('events')) {
        const s = d.createObjectStore('events', { keyPath: 'id' });
        s.createIndex('treeId', 'treeId');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(store, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    const result = fn(s);
    t.oncomplete = () => resolve(result.result !== undefined ? result.result : result);
    t.onerror = () => reject(t.error);
  });
}

const dbPut = (store, value) => tx(store, 'readwrite', (s) => s.put(value));
const dbDelete = (store, key) => tx(store, 'readwrite', (s) => s.delete(key));
const dbGetAll = (store) => tx(store, 'readonly', (s) => s.getAll());
const dbGetIndex = (store, index, key) =>
  new Promise((resolve, reject) => {
    const t = db.transaction(store, 'readonly');
    const req = t.objectStore(store).index(index).getAll(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

/* ---------- Hilfsfunktionen ---------- */

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const $ = (sel) => document.querySelector(sel);

function todayStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function addDays(dateStr, days) {
  return new Date(new Date(dateStr + 'T12:00:00').getTime() + days * DAY_MS)
    .toISOString().slice(0, 10);
}

function daysUntil(dateStr) {
  return Math.round((new Date(dateStr + 'T12:00:00') - new Date(todayStr() + 'T12:00:00')) / DAY_MS);
}

function fmtDate(dateStr) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('de-DE', {
    day: '2-digit', month: 'short', year: 'numeric'
  });
}

function dueLabel(dateStr) {
  const n = daysUntil(dateStr);
  if (n < -1) return `${-n} Tage überfällig`;
  if (n === -1) return 'Gestern fällig';
  if (n === 0) return 'Heute fällig';
  if (n === 1) return 'Morgen fällig';
  if (n <= 7) return `in ${n} Tagen`;
  return fmtDate(dateStr);
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add('hidden'), 2600);
}

/* ---------- State ---------- */

let trees = [];
let photos = [];
let events = [];
let currentTreeId = null;
let editingTreeId = null;

async function loadAll() {
  [trees, photos, events] = await Promise.all([
    dbGetAll('trees'), dbGetAll('photos'), dbGetAll('events')
  ]);
  trees.sort((a, b) => a.createdAt - b.createdAt);
}

function treeTasks(tree) {
  return TASK_TYPES.map((type) => {
    const c = tree.care[type];
    return { type, intervalDays: c.intervalDays, lastDone: c.lastDone, nextDue: addDays(c.lastDone, c.intervalDays) };
  });
}

function nextTaskFor(tree) {
  return treeTasks(tree).slice().sort((a, b) => a.nextDue.localeCompare(b.nextDue))[0];
}

/* ---------- Navigation ---------- */

const VIEW_TITLES = { overview: 'Übersicht', trees: 'Meine Bäume', tree: 'Baum', settings: 'Einstellungen' };

function showView(name) {
  document.querySelectorAll('.view').forEach((v) => v.classList.add('hidden'));
  $(`#view-${name}`).classList.remove('hidden');
  document.querySelectorAll('.tab').forEach((t) =>
    t.classList.toggle('active', t.dataset.view === (name === 'tree' ? 'trees' : name)));
  $('#view-title').textContent = VIEW_TITLES[name] || '';
  $('#btn-add-tree').classList.toggle('hidden', name === 'tree');
  if (name === 'overview') renderOverview();
  if (name === 'trees') renderTrees();
  if (name === 'tree') renderTreeDetail();
  if (name === 'settings') renderSettings();
  window.scrollTo(0, 0);
}

document.querySelectorAll('.tab').forEach((tab) =>
  tab.addEventListener('click', () => showView(tab.dataset.view)));

/* ---------- Rendering: Übersicht ---------- */

function renderOverview() {
  const view = $('#view-overview');
  const all = [];
  for (const tree of trees) {
    for (const t of treeTasks(tree)) all.push({ tree, task: t });
  }
  all.sort((a, b) => a.task.nextDue.localeCompare(b.task.nextDue));

  if (trees.length === 0) {
    view.innerHTML = `<div class="empty">🌿<br>Noch keine Bäume vorhanden.<br>
      Tippe oben rechts auf <b>＋</b>, um deinen ersten Bonsai anzulegen.</div>`;
    return;
  }

  const today = todayStr();
  const overdue = all.filter((x) => x.task.nextDue < today);
  const dueToday = all.filter((x) => x.task.nextDue === today);
  const soon = all.filter((x) => {
    const n = daysUntil(x.task.nextDue);
    return n > 0 && n <= 7;
  });
  const later = all.filter((x) => daysUntil(x.task.nextDue) > 7);

  const row = (x) => {
    const n = daysUntil(x.task.nextDue);
    const cls = n < 0 ? 'overdue' : n === 0 ? 'today' : '';
    return `<div class="task-row">
      <span class="task-ico">${TASK_META[x.task.type].ico}</span>
      <div class="task-main">
        <strong>${esc(x.tree.name)}</strong>
        <span>${TASK_META[x.task.type].label}</span>
      </div>
      <span class="task-due ${cls}">${dueLabel(x.task.nextDue)}</span>
      <button class="btn small primary" data-done="${x.tree.id}|${x.task.type}">Erledigt</button>
    </div>`;
  };

  const section = (label, items) => items.length
    ? `<div class="section-label">${label}</div><div class="card">${items.map(row).join('')}</div>`
    : '';

  view.innerHTML =
    section(`Überfällig (${overdue.length})`, overdue) +
    section(`Heute fällig (${dueToday.length})`, dueToday) +
    section('Demnächst (7 Tage)', soon) +
    section('Später', later.slice(0, 10)) +
    (overdue.length + dueToday.length === 0
      ? `<div class="card" style="text-align:center;color:var(--ok)">✅ Alles erledigt – deine Bäume sind versorgt!</div>`
      : '');
}

/* ---------- Rendering: Baumliste ---------- */

function renderTrees() {
  const view = $('#view-trees');
  if (trees.length === 0) {
    view.innerHTML = `<div class="empty">🌿<br>Noch keine Bäume vorhanden.<br>
      Tippe oben rechts auf <b>＋</b>, um deinen ersten Bonsai anzulegen.</div>`;
    return;
  }
  view.innerHTML = trees.map((tree) => {
    const photo = photos.filter((p) => p.treeId === tree.id).sort((a, b) => b.date.localeCompare(a.date))[0];
    const next = nextTaskFor(tree);
    const thumb = photo
      ? `<img class="tree-thumb" src="${photo.dataUrl}" alt="">`
      : `<div class="tree-thumb placeholder">🌳</div>`;
    return `<div class="card tree-card" data-tree="${tree.id}">
      ${thumb}
      <div class="tree-info">
        <strong>${esc(tree.name)}</strong>
        <span>${esc(tree.species || 'Bonsai')}</span>
      </div>
      <div class="tree-next">${TASK_META[next.type].ico}<b>${dueLabel(next.nextDue)}</b></div>
    </div>`;
  }).join('');
}

/* ---------- Rendering: Baumdetail ---------- */

function renderTreeDetail() {
  const view = $('#view-tree');
  const tree = trees.find((t) => t.id === currentTreeId);
  if (!tree) { showView('trees'); return; }

  const treePhotos = photos.filter((p) => p.treeId === tree.id).sort((a, b) => b.date.localeCompare(a.date));
  const treeEvents = events.filter((e) => e.treeId === tree.id).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt).slice(0, 30);
  const latest = treePhotos[0];

  const careRows = TASK_TYPES.map((type) => {
    const c = tree.care[type];
    const nextDue = addDays(c.lastDone, c.intervalDays);
    return `<div class="care-row">
      <span class="task-ico">${TASK_META[type].ico}</span>
      <div class="task-main">
        <strong>${TASK_META[type].label}</strong>
        <span>${dueLabel(nextDue)}</span>
      </div>
      <span class="interval-edit">
        alle <input type="number" min="1" max="3650" value="${c.intervalDays}" data-interval="${type}"> Tg.
      </span>
      <button class="btn small done-btn" data-done="${tree.id}|${type}">✓ Erledigt</button>
    </div>`;
  }).join('');

  const history = treeEvents.length
    ? treeEvents.map((e) => {
        const meta = TASK_META[e.type] || (e.type === 'photo' ? { ico: '📷', label: 'Foto' } : { ico: '📝', label: 'Notiz' });
        return `<div class="history-item">
          <span class="h-date">${fmtDate(e.date)}</span>
          <span>${meta.ico} ${esc(meta.label)}${e.note ? ` – ${esc(e.note)}` : ''}</span>
        </div>`;
      }).join('')
    : '<div class="hint">Noch keine Einträge.</div>';

  view.innerHTML = `
    <div class="card">
      <div class="detail-head">
        ${latest
          ? `<img class="tree-thumb" src="${latest.dataUrl}" alt="">`
          : `<div class="tree-thumb placeholder">🌳</div>`}
        <div class="tree-info">
          <strong style="font-size:18px">${esc(tree.name)}</strong>
          <span>${esc(tree.species || 'Bonsai')}</span>
          ${tree.notes ? `<span style="display:block;margin-top:6px;white-space:pre-wrap">${esc(tree.notes)}</span>` : ''}
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:14px">
        <button class="btn secondary small" id="btn-edit-tree">Bearbeiten</button>
        <button class="btn danger small" id="btn-delete-tree">Löschen</button>
      </div>
    </div>

    <div class="section-label">Fotos (${treePhotos.length})</div>
    <div class="card">
      <div class="photo-grid">
        <button class="add-photo" id="btn-add-photo" aria-label="Foto aufnehmen">📷</button>
        ${treePhotos.map((p) => `<img src="${p.dataUrl}" data-photo="${p.id}" alt="Foto vom ${fmtDate(p.date)}">`).join('')}
      </div>
    </div>

    <div class="section-label">Pflege</div>
    <div class="card">${careRows}</div>

    <div class="section-label">Verlauf</div>
    <div class="card">${history}</div>
  `;
}

/* ---------- Rendering: Einstellungen ---------- */

function renderSettings() {
  const view = $('#view-settings');
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const granted = supported && Notification.permission === 'granted';
  const standalone = window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;

  view.innerHTML = `
    <div class="section-label">Erinnerungen</div>
    <div class="card">
      <div class="settings-status">
        <span class="dot ${granted ? 'on' : 'off'}"></span>
        <span>${granted
          ? 'Push-Erinnerungen sind aktiviert.'
          : supported ? 'Push-Erinnerungen sind deaktiviert.' : 'Push wird von diesem Browser nicht unterstützt.'}</span>
      </div>
      <button class="btn primary block" id="btn-enable-push" ${granted ? 'style="display:none"' : ''} ${supported ? '' : 'disabled'}>
        🔔 Erinnerungen aktivieren
      </button>
      <button class="btn secondary block" id="btn-test-push" style="margin-top:10px" ${granted ? '' : 'disabled'}>
        Test-Benachrichtigung senden
      </button>
      ${!standalone && supported ? `<p class="hint" style="margin-top:14px"><b>Wichtig (iPhone):</b> Push funktioniert nur, wenn die App zum Home-Bildschirm hinzugefügt wurde. In Safari: Teilen-Symbol → „Zum Home-Bildschirm" → öffne die App von dort.</p>` : ''}
      <p class="hint" style="margin-top:14px">Du bekommst täglich früh morgens eine Benachrichtigung, wenn an diesem Tag Pflege fällig ist (gießen, düngen, schneiden oder umtopfen).</p>
    </div>

    <div class="section-label">Über</div>
    <div class="card">
      <p class="hint">Bonsai-App · Version 1.0<br>
      Alle Daten (Bäume, Fotos, Verlauf) liegen ausschließlich lokal auf deinem Gerät. Für die Push-Erinnerungen werden nur die fälligen Pflegetermine verschlüsselt an den Benachrichtigungsdienst übermittelt.</p>
    </div>
  `;
}

/* ---------- Baum-Formular ---------- */

function openTreeModal(tree) {
  editingTreeId = tree ? tree.id : null;
  $('#modal-title').textContent = tree ? 'Baum bearbeiten' : 'Baum hinzufügen';
  $('#f-name').value = tree?.name || '';
  $('#f-species').value = tree?.species || '';
  $('#f-notes').value = tree?.notes || '';
  TASK_TYPES.forEach((type) => {
    $(`#f-${type}`).value = tree ? tree.care[type].intervalDays : DEFAULT_INTERVALS[type];
  });
  $('#modal-overlay').classList.remove('hidden');
  $('#f-name').focus();
}

function closeTreeModal() {
  $('#modal-overlay').classList.add('hidden');
  editingTreeId = null;
}

$('#btn-add-tree').addEventListener('click', () => openTreeModal(null));
$('#modal-cancel').addEventListener('click', closeTreeModal);
$('#modal-overlay').addEventListener('click', (e) => {
  if (e.target === $('#modal-overlay')) closeTreeModal();
});

$('#tree-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('#f-name').value.trim();
  if (!name) return;

  const wasEdit = !!editingTreeId;
  let tree;
  if (editingTreeId) {
    tree = trees.find((t) => t.id === editingTreeId);
    tree.name = name;
    tree.species = $('#f-species').value.trim();
    tree.notes = $('#f-notes').value.trim();
    TASK_TYPES.forEach((type) => {
      const v = Math.max(1, parseInt($(`#f-${type}`).value, 10) || DEFAULT_INTERVALS[type]);
      tree.care[type].intervalDays = v;
    });
  } else {
    tree = {
      id: uid(),
      name,
      species: $('#f-species').value.trim(),
      notes: $('#f-notes').value.trim(),
      createdAt: Date.now(),
      care: {}
    };
    TASK_TYPES.forEach((type) => {
      const v = Math.max(1, parseInt($(`#f-${type}`).value, 10) || DEFAULT_INTERVALS[type]);
      tree.care[type] = { intervalDays: v, lastDone: todayStr() };
    });
    trees.push(tree);
  }

  await dbPut('trees', tree);
  closeTreeModal();
  syncPush();
  toast(wasEdit ? 'Änderungen gespeichert' : `${name} angelegt 🌱`);
  showView(wasEdit ? 'tree' : 'trees');
});

/* ---------- Pflege-Aktionen ---------- */

async function markDone(treeId, type) {
  const tree = trees.find((t) => t.id === treeId);
  if (!tree) return;
  tree.care[type].lastDone = todayStr();
  await dbPut('trees', tree);
  await dbPut('events', { id: uid(), treeId, type, date: todayStr(), createdAt: Date.now() });
  syncPush();
  toast(`${TASK_META[type].label} notiert ✅`);
  if (!$('#view-tree').classList.contains('hidden') && currentTreeId === treeId) renderTreeDetail();
  else if (!$('#view-overview').classList.contains('hidden')) renderOverview();
  else renderTrees();
}

$('#main').addEventListener('click', (e) => {
  const done = e.target.closest('[data-done]');
  if (done) {
    const [treeId, type] = done.dataset.done.split('|');
    markDone(treeId, type);
    return;
  }
  const card = e.target.closest('[data-tree]');
  if (card) {
    currentTreeId = card.dataset.tree;
    showView('tree');
    return;
  }
  const photo = e.target.closest('[data-photo]');
  if (photo) {
    const p = photos.find((x) => x.id === photo.dataset.photo);
    if (p) {
      $('#photo-large').src = p.dataUrl;
      $('#photo-overlay').classList.remove('hidden');
    }
  }
});

$('#photo-close').addEventListener('click', () => {
  $('#photo-overlay').classList.add('hidden');
  $('#photo-large').src = '';
});

$('#main').addEventListener('change', async (e) => {
  const input = e.target.closest('[data-interval]');
  if (!input) return;
  const tree = trees.find((t) => t.id === currentTreeId);
  if (!tree) return;
  const type = input.dataset.interval;
  const v = Math.max(1, parseInt(input.value, 10) || 1);
  tree.care[type].intervalDays = v;
  await dbPut('trees', tree);
  syncPush();
  toast(`Intervall geändert: alle ${v} Tage`);
  renderTreeDetail();
});

/* ---------- Baum bearbeiten / löschen ---------- */

$('#main').addEventListener('click', (e) => {
  if (e.target.closest('#btn-edit-tree')) {
    openTreeModal(trees.find((t) => t.id === currentTreeId));
  } else if (e.target.closest('#btn-delete-tree')) {
    const tree = trees.find((t) => t.id === currentTreeId);
    if (tree && confirm(`„${tree.name}" wirklich löschen? Fotos und Verlauf werden mitgelöscht.`)) {
      deleteTree(tree.id);
    }
  } else if (e.target.closest('#btn-add-photo')) {
    $('#photo-input').click();
  }
});

async function deleteTree(treeId) {
  trees = trees.filter((t) => t.id !== treeId);
  const treePhotos = await dbGetIndex('photos', 'treeId', treeId);
  const treeEvents = await dbGetIndex('events', 'treeId', treeId);
  await Promise.all([
    dbDelete('trees', treeId),
    ...treePhotos.map((p) => dbDelete('photos', p.id)),
    ...treeEvents.map((ev) => dbDelete('events', ev.id))
  ]);
  photos = photos.filter((p) => p.treeId !== treeId);
  events = events.filter((ev) => ev.treeId !== treeId);
  currentTreeId = null;
  syncPush();
  toast('Baum gelöscht');
  showView('trees');
}

/* ---------- Fotos ---------- */

$('#photo-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file || !currentTreeId) return;
  try {
    const dataUrl = await downscale(file, 1280, 0.82);
    const thumb = await downscale(file, 320, 0.7);
    const photo = { id: uid(), treeId: currentTreeId, date: todayStr(), dataUrl, thumb };
    await dbPut('photos', photo);
    await dbPut('events', { id: uid(), treeId: currentTreeId, type: 'photo', date: todayStr(), createdAt: Date.now() });
    await loadAll();
    renderTreeDetail();
    toast('Foto gespeichert 📷');
  } catch (err) {
    toast('Foto konnte nicht gespeichert werden');
  }
});

function downscale(file, maxSize, quality) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Bild konnte nicht geladen werden'));
    };
    img.src = url;
  });
}

/* ---------- Push ---------- */

function urlB64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function buildSyncPayload() {
  return trees.map((tree) => ({
    name: tree.name,
    tasks: treeTasks(tree).map((t) => ({ type: t.type, nextDue: t.nextDue }))
  }));
}

async function syncPush() {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    if (Notification.permission !== 'granted') return;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    await fetch('/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: sub.toJSON(), trees: buildSyncPayload() })
    });
  } catch { /* offline: wird beim nächsten Öffnen synchronisiert */ }
}

async function enablePush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    toast('Dein Browser unterstützt keine Push-Benachrichtigungen');
    return;
  }
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') {
    toast('Benachrichtigungen wurden abgelehnt');
    renderSettings();
    return;
  }
  try {
    const res = await fetch('/api/vapid-public');
    const { publicKey } = await res.json();
    if (!publicKey) {
      toast('Server nicht konfiguriert – siehe Anleitung im Repo');
      return;
    }
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToUint8Array(publicKey)
      });
    }
    await fetch('/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: sub.toJSON(), trees: buildSyncPayload() })
    });
    toast('Erinnerungen aktiviert 🔔');
  } catch (err) {
    toast('Aktivierung fehlgeschlagen – bist du online?');
  }
  renderSettings();
}

$('#main').addEventListener('click', async (e) => {
  if (e.target.closest('#btn-enable-push')) enablePush();
  if (e.target.closest('#btn-test-push')) {
    const reg = await navigator.serviceWorker.ready;
    reg.showNotification('🌱 Bonsai-Erinnerung', {
      body: 'So sieht eine Erinnerung aus – z. B. „Heute fällig: Gießen: Ficus"',
      icon: '/icons/icon-192.png'
    });
  }
});

/* ---------- Start ---------- */

(async function init() {
  db = await openDB();
  await loadAll();
  showView('overview');
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('sw.js');
      syncPush();
    } catch { /* offline ok */ }
  }
})();
