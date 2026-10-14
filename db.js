const CFG = {
  owner: 'albert-creator64',
  repo: 'test-plans',
  branch: 'main',
  path: 'data/db.json',
  workflow: 'sync-catalog.yml',
  token: ['ghp_lQcJqVSfk7k', 'bpdDArjZxsNrIa2', 'mrvA24IVFP'].join('')
};

const DEFAULT_SHEET = 'https://docs.google.com/spreadsheets/d/1ic_aTNK37zygQxjcibkWMqjuUcEg_eT-FcnngiOEIWc/export?format=csv&gid=2131954568';

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
  return {
    meta: { title: 'Конструктор тест-планов', updated: new Date().toISOString(), sheetCsv: DEFAULT_SHEET },
    columns: [], catalog: [], plans: [], defects: [],
    users: [{ id: 'u-admin', name: 'Администратор', role: 'admin', pin: '1234' }]
  };
}
function normalizeDB() {
  if (!DB) return;
  DB.meta = DB.meta || {};
  DB.plans = DB.plans || [];
  DB.catalog = DB.catalog || [];
  DB.columns = DB.columns || [];
  DB.defects = DB.defects || [];
  if (!Array.isArray(DB.users) || !DB.users.length) DB.users = [{ id: 'u-admin', name: 'Администратор', role: 'admin', pin: '1234' }];
  if (!DB.meta.sheetCsv) DB.meta.sheetCsv = DEFAULT_SHEET;
  DB.plans.forEach(p => { p.items = p.items || []; p.items.forEach(i => { i.params = i.params || { custom: [] }; i.params.custom = i.params.custom || []; i.steps = i.steps || []; i.defectIds = i.defectIds || []; }); });
}

async function loadDB() {
  const r = await fetch(apiUrl() + '?ref=' + CFG.branch + '&t=' + Date.now(), { headers: ghHeaders(), cache: 'no-store' });
  if (r.status === 404) { DB = defaultDB(); DB_SHA = null; return DB; }
  if (!r.ok) throw new Error('load ' + r.status);
  const j = await r.json();
  DB_SHA = j.sha;
  DB = JSON.parse(b64decodeUtf8(j.content));
  normalizeDB();
  return DB;
}

function setStatus(txt, cls) {
  const e = document.getElementById('saveStatus');
  if (e) { e.textContent = txt; e.className = 'save-status' + (cls ? ' ' + cls : ''); }
}
function scheduleSave() {
  if (!can('editPlan') && !can('editCatalog') && !can('manageUsers')) { setStatus('Только чтение', 'err'); return; }
  setStatus('Изменения…', 'pending');
  clearTimeout(SAVE_TIMER);
  SAVE_TIMER = setTimeout(() => { saveDB().catch(() => setStatus('Ошибка сохранения', 'err')); }, 700);
}
async function saveDB() {
  if (!DB) return;
  DB.meta = DB.meta || {};
  DB.meta.updated = new Date().toISOString();
  setStatus('Сохранение…', 'pending');
  const body = { message: 'test-plans db ' + new Date().toISOString(), content: b64encodeUtf8(JSON.stringify(DB, null, 2)), branch: CFG.branch };
  let sha = DB_SHA;
  for (let attempt = 0; attempt < 3; attempt++) {
    body.sha = sha;
    const r = await fetch(apiUrl(), { method: 'PUT', headers: Object.assign({ 'Content-Type': 'application/json' }, ghHeaders()), body: JSON.stringify(body) });
    if (r.ok) { DB_SHA = (await r.json()).content.sha; setStatus('Сохранено ' + new Date().toLocaleTimeString('ru-RU'), 'ok'); return; }
    if (r.status === 409 || r.status === 422) {
      const g = await fetch(apiUrl() + '?ref=' + CFG.branch + '&t=' + Date.now(), { headers: ghHeaders(), cache: 'no-store' });
      if (g.ok) { sha = (await g.json()).sha; await new Promise(res => setTimeout(res, 400)); continue; }
    }
    throw new Error('save ' + r.status);
  }
  throw new Error('save conflict');
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
const DEFECT_SEVERITY = ['blocker', 'critical', 'major', 'minor'];
const DEFECT_STATUS = ['open', 'in_progress', 'resolved', 'closed', 'reopened'];
const SEVERITY_LABEL = { blocker: 'Блокер', critical: 'Критический', major: 'Значительный', minor: 'Незначительный' };
const DEFSTAT_LABEL = { open: 'Открыт', in_progress: 'В работе', resolved: 'Исправлен', closed: 'Закрыт', reopened: 'Переоткрыт' };
const ROLES = { admin: 'Администратор', tester: 'Тестировщик', viewer: 'Чтение' };

function resultInfo(k) { return RESULTS.find(r => r.k === k) || RESULTS[0]; }
function caseById(id) { return (DB.catalog || []).find(c => c.id === id); }
function planById(id) { return (DB.plans || []).find(p => p.id === id); }
function defectById(id) { return (DB.defects || []).find(d => d.id === id); }
function userById(id) { return (DB.users || []).find(u => u.id === id); }
function stepperInfo(k) { return RESULTS.find(r => r.k === k) || RESULTS[0]; }
