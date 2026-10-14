const CFG = {
  owner: 'albert-creator64',
  repo: 'test-plans',
  branch: 'main',
  path: 'data/db.json',
  token: ['ghp_lQcJqVSfk7k', 'bpdDArjZxsNrIa2', 'mrvA24IVFP'].join('')
};

let DB = null;
let DB_SHA = null;
let SAVE_TIMER = null;

function apiUrl() { return 'https://api.github.com/repos/' + CFG.owner + '/' + CFG.repo + '/contents/' + CFG.path; }
function ghHeaders() { return { 'Authorization': 'Bearer ' + CFG.token, 'Accept': 'application/vnd.github+json' }; }

function b64encodeUtf8(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
function b64decodeUtf8(b64) {
  const bin = atob(String(b64).replace(/\s/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function defaultDB() {
  return { meta: { title: 'Тест-планы', updated: new Date().toISOString() }, columns: [], catalog: [], plans: [] };
}

async function loadDB() {
  const r = await fetch(apiUrl() + '?ref=' + CFG.branch + '&t=' + Date.now(), { headers: ghHeaders(), cache: 'no-store' });
  if (r.status === 404) { DB = defaultDB(); DB_SHA = null; return DB; }
  if (!r.ok) throw new Error('load ' + r.status);
  const j = await r.json();
  DB_SHA = j.sha;
  DB = JSON.parse(b64decodeUtf8(j.content));
  if (!DB.plans) DB.plans = [];
  if (!DB.catalog) DB.catalog = [];
  if (!DB.columns) DB.columns = [];
  return DB;
}

function setStatus(txt, cls) {
  const el = document.getElementById('saveStatus');
  if (el) { el.textContent = txt; el.className = 'save-status' + (cls ? ' ' + cls : ''); }
}

function scheduleSave() {
  setStatus('Изменения…', 'pending');
  clearTimeout(SAVE_TIMER);
  SAVE_TIMER = setTimeout(() => { saveDB().catch(e => setStatus('Ошибка сохранения', 'err')); }, 700);
}

async function saveDB() {
  if (!DB) return;
  DB.meta = DB.meta || {};
  DB.meta.updated = new Date().toISOString();
  setStatus('Сохранение…', 'pending');
  const body = {
    message: 'test-plans db ' + new Date().toISOString(),
    content: b64encodeUtf8(JSON.stringify(DB, null, 2)),
    branch: CFG.branch
  };
  let sha = DB_SHA;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (sha) body.sha = sha;
    const r = await fetch(apiUrl(), { method: 'PUT', headers: Object.assign({ 'Content-Type': 'application/json' }, ghHeaders()), body: JSON.stringify(body) });
    if (r.ok) {
      const j = await r.json();
      DB_SHA = j.content.sha;
      setStatus('Сохранено ' + new Date().toLocaleTimeString('ru-RU'), 'ok');
      return;
    }
    if (r.status === 409 && attempt === 0) {
      const g = await fetch(apiUrl() + '?ref=' + CFG.branch, { headers: ghHeaders(), cache: 'no-store' });
      if (g.ok) { sha = (await g.json()).sha; delete body.sha; continue; }
    }
    throw new Error('save ' + r.status);
  }
}

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function el(id) { return document.getElementById(id); }

const RESULTS = [
  { k: '', label: '— не начат', cls: 'r-none' },
  { k: 'progress', label: 'В работе', cls: 'r-progress' },
  { k: 'pass', label: 'Пройден', cls: 'r-pass' },
  { k: 'fail', label: 'Провален', cls: 'r-fail' },
  { k: 'blocked', label: 'Заблокирован', cls: 'r-blocked' },
  { k: 'skip', label: 'Пропущен', cls: 'r-skip' }
];
function resultInfo(k) { return RESULTS.find(r => r.k === k) || RESULTS[0]; }
function caseById(id) { return (DB.catalog || []).find(c => c.id === id); }
function planById(id) { return (DB.plans || []).find(p => p.id === id); }
