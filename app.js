const GROUP_TITLES = {
  main: 'Основное', checks: 'Проверки', logistics: 'Логистика и заказ', goods: 'Товар',
  payment: 'Оплата', ret_dvd: 'Возврат ДвД', ret_cour: 'Возврат от курьера',
  ret_notdvd: 'Возврат не ДвД', exchange: 'Обмен (ВП)', reports: 'Отчёты и претензии', meta: 'Актуальность и автоматизация'
};
const GROUP_ORDER = ['main', 'checks', 'logistics', 'goods', 'payment', 'ret_dvd', 'ret_cour', 'ret_notdvd', 'exchange', 'reports', 'meta'];

let pane = 'catalog';
let selected = new Set();
let currentPlanId = null;
let openParams = new Set();
let mineOnly = false;
let catMode = 'table';
let excelParams = new Set();

function ci(name) { return DB.columns.findIndex(c => c.label === name); }
function val(c, name) { const i = ci(name); return i < 0 ? '' : (c.v[i] || ''); }

/* ---------------- users & roles ---------------- */
function currentUser() { return userById(localStorage.getItem('tp_user') || ''); }
function role() { const u = currentUser(); return u ? u.role : 'viewer'; }
function can(perm) {
  const r = role();
  if (r === 'admin') return true;
  if (r === 'tester') return perm === 'editPlan' || perm === 'view';
  return perm === 'view';
}
function updateUserBtn() {
  const u = currentUser();
  const b = el('userBtn');
  if (!u) { b.innerHTML = 'Войти'; return; }
  b.innerHTML = esc(u.name) + ' <span class="role-tag role-' + u.role + '">' + ROLES[u.role] + '</span>';
}
function loginAs(id) {
  const u = userById(id); if (!u) return;
  if (u.pin) { const p = prompt('PIN для «' + u.name + '»'); if (p !== u.pin) return alert('Неверный PIN'); }
  localStorage.setItem('tp_user', id);
  updateUserBtn(); closeModal(); refreshAll();
}
function logoutUser() { localStorage.removeItem('tp_user'); updateUserBtn(); closeModal(); refreshAll(); }
function openUserMenu() {
  const users = DB.users || [];
  const rows = users.map(u => '<div class="uo-row"><div><div class="uo-name">' + esc(u.name) +
    (currentUser() && currentUser().id === u.id ? ' · вы' : '') + '</div><div class="uo-sub">' + ROLES[u.role] + (u.pin ? ' · PIN' : '') + '</div></div>' +
    '<div class="sp">' + (can('manageUsers') ? '<select onchange="setUserRole(\'' + u.id + '\',this.value)">' + Object.keys(ROLES).map(r => '<option value="' + r + '"' + (r === u.role ? ' selected' : '') + '>' + ROLES[r] + '</option>').join('') + '</select>' +
      '<button class="icon-btn danger" onclick="delUser(\'' + u.id + '\')">✕</button>' : '') +
    '<button class="btn ghost" onclick="loginAs(\'' + u.id + '\')">Войти</button></div></div>').join('');
  const addForm = can('manageUsers') ?
    '<div style="margin-top:14px;border-top:1px solid var(--border);padding-top:14px"><div style="font-weight:700;margin-bottom:8px">Добавить пользователя</div>' +
    '<div class="def-grid"><input id="nuName" placeholder="Имя"><select id="nuRole">' + Object.keys(ROLES).map(r => '<option value="' + r + '">' + ROLES[r] + '</option>').join('') + '</select></div>' +
    '<input id="nuPin" placeholder="PIN (необязательно)" style="margin-top:10px;width:100%">' +
    '<div style="margin-top:10px;text-align:right"><button class="btn primary" onclick="addUser()">Добавить</button></div></div>' : '';
  const cur = currentUser();
  openModal('Пользователь и роли',
    '<div>' + rows + '</div>' + addForm +
    (cur ? '<div style="margin-top:14px;text-align:right"><button class="btn ghost" onclick="logoutUser()">Выйти</button></div>' : ''));
}
function addUser() {
  const name = (el('nuName').value || '').trim(); if (!name) return alert('Укажите имя');
  DB.users.push({ id: uid(), name: name, role: el('nuRole').value, pin: (el('nuPin').value || '').trim() });
  scheduleSave(); openUserMenu();
}
function setUserRole(id, r) { const u = userById(id); if (!u) return; u.role = r; scheduleSave(); updateUserBtn(); openUserMenu(); }
function delUser(id) {
  if (DB.users.length <= 1) return alert('Нельзя удалить последнего пользователя');
  if (!confirm('Удалить пользователя?')) return;
  DB.users = DB.users.filter(u => u.id !== id);
  if (localStorage.getItem('tp_user') === id) localStorage.removeItem('tp_user');
  scheduleSave(); updateUserBtn(); openUserMenu();
}

/* ---------------- theme ---------------- */
function initTheme() { const dark = localStorage.getItem('tp_theme') === 'dark'; document.body.classList.toggle('dark', dark); el('themeBtn').textContent = dark ? '☀️' : '🌙'; }
function toggleTheme() { const dark = document.body.classList.toggle('dark'); localStorage.setItem('tp_theme', dark ? 'dark' : 'light'); el('themeBtn').textContent = dark ? '☀️' : '🌙'; }

/* ---------------- navigation ---------------- */
function goView(v) {
  pane = v;
  ['catalog', 'plans', 'plan', 'coverage', 'analytics', 'defects'].forEach(x => { el('view-' + x).style.display = x === v ? 'block' : 'none'; });
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.dataset.view === v || (v === 'plan' && t.dataset.view === 'plans')));
  if (v === 'catalog') renderCatalog();
  if (v === 'plans') renderPlans();
  if (v === 'coverage') renderCoverage();
  if (v === 'analytics') renderAnalytics();
  if (v === 'defects') renderDefects();
}
function refreshAll() {
  updateUserBtn(); updatePlansPill(); updateDefectsPill(); refreshPlanSelect(); refreshReleaseFilter(); initBulkResult(); initBulkAssignee(); initDefectFilters();
  goView(pane);
}

/* ---------------- filters ---------------- */
function distinctCatalog(name) {
  const set = new Set();
  DB.catalog.forEach(c => { const v = val(c, name); if (v) set.add(v); });
  return [...set].sort((a, b) => a.localeCompare(b, 'ru'));
}
function fillSelect(id, values, allLabel) {
  const s = el(id); if (!s) return;
  s.innerHTML = '<option value="">' + allLabel + '</option>' + values.map(v => '<option value="' + esc(v) + '">' + esc(v) + '</option>').join('');
}
function initFilters() {
  fillSelect('fPriority', distinctCatalog('Приоритет'), 'Приоритет: все');
  fillSelect('fStatus', distinctCatalog('Статус'), 'Статус: все');
  fillSelect('fCountry', distinctCatalog('Страна'), 'Страна: все');
  fillSelect('fShipping', distinctCatalog('Условие отгрузки'), 'Отгрузка: все');
  fillSelect('fPayType', distinctCatalog('Тип оплаты'), 'Оплата: все');
  fillSelect('fCurrency', distinctCatalog('Валюта оплаты'), 'Валюта: все');
  fillSelect('fPlant', distinctCatalog('Завод'), 'Завод: все');
}
function initBulkResult() { el('bulkResult').innerHTML = '<option value="">Массово: статус…</option>' + RESULTS.filter(r => r.k).map(r => '<option value="' + r.k + '">' + r.label + '</option>').join(''); }
function initBulkAssignee() {
  const names = [...new Set([...(DB.users || []).map(u => u.name), ...DB.plans.flatMap(p => (p.items || []).map(i => i.assignee).filter(Boolean))])].sort((a, b) => a.localeCompare(b, 'ru'));
  el('bulkAssignee').innerHTML = '<option value="">Массово: ответственный…</option><option value="__none__">— снять —</option>' + names.map(n => '<option value="' + esc(n) + '">' + esc(n) + '</option>').join('');
}
function initDefectFilters() {
  fillSelect('dFilterStatus', DEFECT_STATUS.map(s => DEFSTAT_LABEL[s]), 'Статус: все');
  const s = el('dFilterStatus'); s.innerHTML = '<option value="">Статус: все</option>' + DEFECT_STATUS.map(x => '<option value="' + x + '">' + DEFSTAT_LABEL[x] + '</option>').join('');
  const sv = el('dFilterSeverity'); sv.innerHTML = '<option value="">Критичность: все</option>' + DEFECT_SEVERITY.map(x => '<option value="' + x + '">' + SEVERITY_LABEL[x] + '</option>').join('');
}
function resetFilters() { ['fSearch', 'fPriority', 'fStatus', 'fCountry', 'fShipping', 'fPayType', 'fCurrency', 'fPlant'].forEach(id => el(id).value = ''); renderCatalog(); }
function filteredCatalog() {
  const q = (el('fSearch').value || '').trim().toLowerCase();
  const fp = el('fPriority').value, fs = el('fStatus').value, fc = el('fCountry').value, fsh = el('fShipping').value, fpay = el('fPayType').value, fcur = el('fCurrency').value, fpl = el('fPlant').value;
  return DB.catalog.filter(c => {
    if (fp && val(c, 'Приоритет') !== fp) return false;
    if (fs && val(c, 'Статус') !== fs) return false;
    if (fc && val(c, 'Страна') !== fc) return false;
    if (fsh && val(c, 'Условие отгрузки') !== fsh) return false;
    if (fpay && val(c, 'Тип оплаты') !== fpay) return false;
    if (fcur && val(c, 'Валюта оплаты') !== fcur) return false;
    if (fpl && val(c, 'Завод') !== fpl) return false;
    if (q && c.v.join(' ').toLowerCase().indexOf(q) < 0) return false;
    return true;
  });
}

/* ---------------- cells ---------------- */
function checkCell(v) {
  if (!v) return '<span class="co">—</span>';
  if (v === 'Ожидание примера') return '<span class="tag" style="background:var(--orange-soft);color:var(--orange)">ожид.</span>';
  if (v === 'OK' || v === 'Y') return '<span class="chk y">✓</span>';
  return esc(v);
}
function prTag(v) { return '<span class="tag pr-' + esc(v) + '">' + esc(v) + '</span>'; }
function stTag(v) { const cls = v === 'Новый' ? 'st-Новый' : v === 'Отмена' ? 'st-Отмена' : 'st-other'; return '<span class="tag ' + cls + '">' + esc(v || '—') + '</span>'; }

/* ---------------- catalog ---------------- */
function renderCatalog() {
  const list = filteredCatalog();
  el('catTableBox').style.display = catMode === 'excel' ? 'none' : 'block';
  el('catExcelBox').style.display = catMode === 'excel' ? 'block' : 'none';
  el('catBulkbar').style.display = catMode === 'excel' ? 'none' : 'flex';
  const mb = el('catModeBtn'); if (mb) mb.textContent = catMode === 'excel' ? 'Таблица' : 'Excel';
  if (catMode === 'excel') { renderExcel(list); return; }
  const body = el('catalogBody');
  if (!DB.catalog.length) { body.innerHTML = '<tr><td colspan="16" class="empty">Каталог пуст. Добавьте кейс или импортируйте JSON.</td></tr>'; el('catCount').textContent = ''; return; }
  body.innerHTML = list.map(c => {
    const isSel = selected.has(c.id);
    const steps = (c.steps || []).length;
    return '<tr class="' + (isSel ? 'is-sel' : '') + '">' +
      '<td class="ck"><input type="checkbox" ' + (isSel ? 'checked' : '') + ' onchange="toggleSel(\'' + c.id + '\',this.checked)"></td>' +
      '<td class="num"><span class="link" onclick="showCase(\'' + c.id + '\')">' + c.num + '</span></td>' +
      '<td>' + prTag(val(c, 'Приоритет')) + '</td>' +
      '<td>' + stTag(val(c, 'Статус')) + '</td>' +
      '<td>' + esc(val(c, 'Страна')) + '</td>' +
      '<td>' + esc(val(c, 'Условие отгрузки')) + '</td>' +
      '<td>' + esc(val(c, 'Тип оплаты')) + '</td>' +
      '<td class="cur-tag">' + esc(val(c, 'Валюта оплаты')) + '</td>' +
      '<td class="co">' + esc(val(c, 'Завод')) + '</td>' +
      '<td>' + esc(val(c, 'Тип комплектования')) + '</td>' +
      '<td class="desc">' + (esc(val(c, 'Описание (доп. условия)')) || '<span class="co">—</span>') + '</td>' +
      '<td class="checks">' + checkCell(val(c, 'проверка ОД')) + '</td>' +
      '<td class="checks">' + checkCell(val(c, 'проверка ИМ')) + '</td>' +
      '<td class="checks">' + checkCell(val(c, 'проверка FI')) + '</td>' +
      '<td class="checks">' + checkCell(val(c, 'проверка BW')) + '</td>' +
      '<td class="checks">' + (steps ? '<span class="steps-badge">' + steps + '</span>' : '<span class="co">—</span>') + '</td>' +
      '</tr>';
  }).join('');
  el('catCount').textContent = 'Показано: ' + list.length + ' из ' + DB.catalog.length + ' · выбрано: ' + selected.size;
  updateSelInfo();
}

function toggleCatMode() { catMode = catMode === 'excel' ? 'table' : 'excel'; renderCatalog(); }
function renderExcel(list) {
  const ro = !can('editCatalog');
  const numIdx = ci('№ кейса');
  el('excelHead').innerHTML = '<th class="num">№</th>' + DB.columns.map(col => '<th class="excel-th g-' + col.group + '">' + esc(col.label) + '</th>').join('') + '<th class="ck"></th>';
  el('excelBody').innerHTML = list.map(c => {
    const cells = DB.columns.map((col, idx) => {
      if (idx === numIdx) return '<td class="num ro">' + c.num + '</td>';
      return '<td><input class="excel-cell" value="' + esc(c.v[idx] || '') + '"' + (ro ? ' disabled' : '') + ' oninput="setCell(\'' + c.id + '\',' + idx + ',this.value)"></td>';
    }).join('');
    return '<tr><td class="num"><span class="link" onclick="showCase(\'' + c.id + '\')">' + c.num + '</span></td>' + cells +
      '<td class="ck">' + (ro ? '' : '<button class="icon-btn danger" title="Удалить" onclick="delExcelRow(\'' + c.id + '\')">✕</button>') + '</td></tr>';
  }).join('');
  el('catCount').textContent = 'Режим Excel · строк: ' + list.length + ' из ' + DB.catalog.length + (ro ? ' · только чтение' : ' · редактирование');
}
function setCell(id, idx, value) {
  if (!can('editCatalog')) return;
  const c = caseById(id); if (!c) return;
  c.v[idx] = value;
  scheduleSave();
}
function addExcelRow() {
  if (!can('editCatalog')) return alert('Добавление доступно администратору');
  const num = DB.catalog.reduce((m, x) => Math.max(m, x.num || 0), 0) + 1;
  const v = DB.columns.map(() => ''); const numIdx = ci('№ кейса'); if (numIdx >= 0) v[numIdx] = String(num);
  const c = { id: 'case-' + num + '-' + Math.random().toString(36).slice(2, 5), num: num, v: v };
  DB.catalog.push(c); scheduleSave(); renderExcel(filteredCatalog());
  el('catCount').textContent = 'Добавлен кейс №' + num + ' · заполните значения в таблице';
}
function delExcelRow(id) {
  if (!can('editCatalog')) return alert('Удаление доступно администратору');
  const c = caseById(id); if (!c) return;
  if (!confirm('Удалить кейс №' + c.num + ' из каталога? Он также будет убран из всех тест-планов.')) return;
  DB.catalog = DB.catalog.filter(x => x.id !== id);
  DB.plans.forEach(p => { p.items = (p.items || []).filter(i => i.caseId !== id); });
  selected.delete(id); scheduleSave(); renderExcel(filteredCatalog());
}
function toggleSel(id, on) { if (on) selected.add(id); else selected.delete(id); renderCatalog(); }
function selectAllVisible(on) { filteredCatalog().forEach(c => { if (on) selected.add(c.id); else selected.delete(c.id); }); el('ckAll').checked = false; renderCatalog(); }
function updateSelInfo() { el('selInfo').textContent = selected.size + ' выбрано'; }

/* ---------------- plans ---------------- */
function refreshPlanSelect() {
  const s = el('addToPlan'); if (!s) return;
  s.innerHTML = DB.plans.map(p => '<option value="' + p.id + '">' + esc(p.name || 'Тест-план') + '</option>').join('') + '<option value="__new__">＋ Создать новый план…</option>';
  if (currentPlanId && planById(currentPlanId)) s.value = currentPlanId;
}
function refreshReleaseFilter() {
  const vals = [...new Set(DB.plans.map(p => (p.ver || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));
  const s = el('fRelease'); const cur = s.value;
  s.innerHTML = '<option value="">Все релизы</option>' + vals.map(v => '<option value="' + esc(v) + '">' + esc(v) + '</option>').join('');
  if (vals.indexOf(cur) >= 0) s.value = cur;
}
function updatePlansPill() { el('plansCount').textContent = DB.plans.length; }
function updateDefectsPill() { el('defectsCount').textContent = (DB.defects || []).length; }

function createPlan(quiet) {
  if (!can('editPlan')) return alert('Нет прав на редактирование');
  const plan = { id: uid(), name: 'Тест-план ' + new Date().toLocaleDateString('ru-RU'), ver: '', env: '', tester: (currentUser() ? currentUser().name : ''), created: new Date().toISOString(), updated: new Date().toISOString(), items: [] };
  DB.plans.unshift(plan); scheduleSave(); updatePlansPill(); refreshPlanSelect(); refreshReleaseFilter();
  if (!quiet) openPlan(plan.id);
  return plan;
}
function planStats(plan) {
  const s = { total: (plan.items || []).length, pass: 0, fail: 0, blocked: 0, progress: 0, skip: 0, none: 0 };
  (plan.items || []).forEach(i => { s[i.result || 'none'] = (s[i.result || 'none'] || 0) + 1; });
  return s;
}
function progressBar(s) {
  const t = s.total || 1;
  const seg = (n, cls) => n ? '<i class="' + cls + '" style="width:' + (n / t * 100) + '%"></i>' : '';
  return '<div class="progress">' + seg(s.pass, 'pg-pass') + seg(s.fail, 'pg-fail') + seg(s.blocked, 'pg-blocked') + seg(s.progress, 'pg-progress') + seg(s.skip, 'pg-skip') + '</div>';
}
function planTile(p) {
  const s = planStats(p);
  const done = s.pass + s.fail + s.blocked + s.skip;
  const pct = s.total ? Math.round(done / s.total * 100) : 0;
  const assignees = [...new Set((p.items || []).map(i => i.assignee).filter(Boolean))];
  const meta = [p.ver, p.env, p.tester].filter(Boolean).map(esc).join(' · ');
  return '<div class="plan-tile" onclick="openPlan(\'' + p.id + '\')"><h3>' + esc(p.name || 'Тест-план') + '</h3>' +
    '<div class="pt-meta">' + (meta || 'параметры не заданы') + '</div>' +
    (assignees.length ? '<div class="pt-meta">👤 ' + assignees.map(esc).join(', ') + '</div>' : '') +
    '<div class="pt-row"><span>Кейсов: <b>' + s.total + '</b></span><span>Выполнено: <b>' + pct + '%</b></span></div>' + progressBar(s) +
    '<div class="pt-row" style="margin-top:2px"><span>✓ ' + s.pass + ' · ✗ ' + s.fail + ' · ⛔ ' + s.blocked + '</span><span>' + (p.updated ? new Date(p.updated).toLocaleDateString('ru-RU') : '') + '</span></div></div>';
}
function renderPlans() {
  updatePlansPill(); refreshPlanSelect(); refreshReleaseFilter();
  const box = el('plansList'); const filt = el('fRelease').value;
  let plans = DB.plans; if (filt) plans = plans.filter(p => (p.ver || '').trim() === filt);
  if (!plans.length) { box.innerHTML = '<div class="empty" style="grid-column:1/-1"><div class="empty-ic">🧪</div><div style="font-weight:700;font-size:15px">Тест-планов пока нет</div><div>Создайте план и добавьте кейсы из каталога</div></div>'; return; }
  const groups = {};
  plans.forEach(p => { const k = (p.ver || '').trim() || 'Без версии'; (groups[k] = groups[k] || []).push(p); });
  box.innerHTML = Object.keys(groups).sort((a, b) => a.localeCompare(b, 'ru')).map(k =>
    '<div class="rel-group" style="grid-column:1/-1"><div class="rel-title">' + esc(k) + ' <span class="pill">' + groups[k].length + '</span></div><div class="plans-grid">' + groups[k].map(planTile).join('') + '</div></div>').join('');
}

/* ---------------- plan detail ---------------- */
function openPlan(id) {
  currentPlanId = id; const p = planById(id); if (!p) return goView('plans');
  if (!p.items) p.items = [];
  el('pName').value = p.name || ''; el('pVer').value = p.ver || ''; el('pEnv').value = p.env || ''; el('pTester').value = p.tester || '';
  renderPlanItems(); goView('plan'); refreshPlanSelect();
}
function updatePlanField(f, v) { const p = planById(currentPlanId); if (!p) return; p[f] = v; p.updated = new Date().toISOString(); scheduleSave(); if (f === 'ver') refreshReleaseFilter(); }
function toggleMine() { mineOnly = !mineOnly; el('mineBtn').classList.toggle('btn-primary', mineOnly); renderPlanItems(); }

function renderPlanItems() {
  const p = planById(currentPlanId); if (!p) return;
  const banner = can('editPlan') ? '' : '<div class="readonly-banner">Режим «только чтение» — войдите как тестировщик или администратор, чтобы вносить результаты.</div>';
  const body = el('planItems');
  let items = p.items;
  const me = currentUser();
  if (mineOnly && me) items = items.filter(i => i.assignee === me.name);
  if (!items.length) { body.innerHTML = '<tr><td colspan="11" class="empty">' + banner + (p.items.length ? 'Нет кейсов, назначенных на вас.' : 'В плане нет кейсов. Нажмите «Добавить кейсы из каталога»') + '</td></tr>'; renderPlanStats(); return; }
  body.innerHTML = items.map(it => {
    const c = caseById(it.caseId); if (!c) return '';
    const ri = resultInfo(it.result || '');
    const open = openParams.has(it.caseId);
    const stepBadge = (it.steps || []).length ? '<span class="steps-badge">шаги ' + it.steps.filter(s => s.result === 'pass').length + '/' + it.steps.length + '</span>' : '';
    const defBadge = (it.defectIds || []).length ? '<span class="def-badge">🐞 ' + it.defectIds.length + '</span>' : '';
    const row = '<tr class="item-row">' +
      '<td class="num"><span class="link" onclick="showCase(\'' + c.id + '\')">' + c.num + '</span></td>' +
      '<td>' + prTag(val(c, 'Приоритет')) + '</td>' +
      '<td>' + esc(val(c, 'Страна')) + '</td>' +
      '<td>' + esc(val(c, 'Условие отгрузки')) + '</td>' +
      '<td>' + esc(val(c, 'Тип оплаты')) + '</td>' +
      '<td class="cur-tag">' + esc(val(c, 'Валюта оплаты')) + '</td>' +
      '<td class="desc">' + (esc(val(c, 'Описание (доп. условия)')) || '<span class="co">—</span>') + stepBadge + defBadge + '</td>' +
      '<td class="assignee-col"><input class="assignee-input" value="' + esc(it.assignee || '') + '" placeholder="—" oninput="setAssignee(\'' + it.caseId + '\',this.value)"></td>' +
      '<td class="res-col"><select class="res-select ' + ri.cls + '" onchange="setResult(\'' + it.caseId + '\',this.value)">' + RESULTS.map(r => '<option value="' + r.k + '"' + ((it.result || '') === r.k ? ' selected' : '') + '>' + r.label + '</option>').join('') + '</select></td>' +
      '<td class="params-col"><button class="btn ghost" onclick="toggleParams(\'' + it.caseId + '\')">' + (open ? 'Скрыть' : 'Детали') + '</button></td>' +
      '<td class="ck"><button class="icon-btn danger" title="Убрать" onclick="removeItem(\'' + it.caseId + '\')">✕</button></td></tr>';
    return row + (open ? detailRow(it, c) : '');
  }).join('');
  renderPlanStats();
}

function detailRow(it, c) {
  const pr = it.params || (it.params = {});
  const custom = pr.custom || (pr.custom = []);
  const steps = it.steps || (it.steps = []);
  const defs = (it.defectIds || []);
  const ro = !can('editPlan');
  const dis = ro ? ' disabled' : '';
  return '<tr class="param-row"><td colspan="11" class="param-panel"><div class="param-inner">' +
    '<label>Среда / стенд<input value="' + esc(pr.env || '') + '"' + dis + ' oninput="setParam(\'' + it.caseId + '\',\'env\',this.value)"></label>' +
    '<label>№ заказа / чека (факт)<input value="' + esc(pr.orderNo || '') + '"' + dis + ' oninput="setParam(\'' + it.caseId + '\',\'orderNo\',this.value)"></label>' +
    '<label>Ожидаемый результат<input value="' + esc(pr.expected || '') + '"' + dis + ' oninput="setParam(\'' + it.caseId + '\',\'expected\',this.value)"></label>' +
    '<label class="param-full">Фактический результат<textarea rows="2"' + dis + ' oninput="setParam(\'' + it.caseId + '\',\'actual\',this.value)">' + esc(pr.actual || '') + '</textarea></label>' +
    '<div class="param-full"><div class="kvh">Дополнительные параметры проверки</div>' +
    custom.map((kv, idx) => '<div class="kv-row"><input placeholder="Параметр" value="' + esc(kv.name || '') + '"' + dis + ' oninput="setCustom(\'' + it.caseId + '\',' + idx + ',\'name\',this.value)"><input placeholder="Значение" value="' + esc(kv.value || '') + '"' + dis + ' oninput="setCustom(\'' + it.caseId + '\',' + idx + ',\'value\',this.value)">' + (ro ? '' : '<button class="icon-btn danger" onclick="delCustom(\'' + it.caseId + '\',' + idx + ')">✕</button>') + '</div>').join('') +
    (ro ? '' : '<button class="btn ghost" onclick="addCustom(\'' + it.caseId + '\')">＋ Параметр</button>') + '</div>' +
    '<div class="param-full steps-box"><div class="kvh">Шаги сценария <button class="btn ghost" style="margin-left:8px" onclick="loadStepsFromTemplate(\'' + it.caseId + '\')">Из каталога</button></div>' +
    steps.map((s, idx) => '<div class="step-row"><div class="step-num">' + (idx + 1) + '</div>' +
      '<textarea placeholder="Шаг"' + dis + ' oninput="setStep(\'' + it.caseId + '\',' + idx + ',\'text\',this.value)">' + esc(s.text || '') + '</textarea>' +
      '<textarea placeholder="Ожидаемый результат"' + dis + ' oninput="setStep(\'' + it.caseId + '\',' + idx + ',\'expected\',this.value)">' + esc(s.expected || '') + '</textarea>' +
      '<select class="step-res s-' + (s.result || 'none') + '"' + dis + ' onchange="setStepResult(\'' + it.caseId + '\',' + idx + ',this.value)"><option value="">—</option>' + RESULTS.filter(r => r.k).map(r => '<option value="' + r.k + '"' + (s.result === r.k ? ' selected' : '') + '>' + r.label + '</option>').join('') + '</select>' +
      (ro ? '' : '<button class="icon-btn danger" onclick="delStep(\'' + it.caseId + '\',' + idx + ')">✕</button>') + '</div>').join('') +
    (ro ? '' : '<button class="btn ghost" onclick="addStep(\'' + it.caseId + '\')">＋ Шаг</button>') + '</div>' +
    '<div class="param-full"><div class="kvh">Дефекты ' + (defs.length ? '(' + defs.length + ')' : '') + '</div>' +
    defs.map(id => { const d = defectById(id); return d ? '<div class="spec">🐞 <span class="link" onclick="openDefectModal(\'' + id + '\')">' + esc(d.title) + '</span> <span class="sev sev-' + d.severity + '">' + SEVERITY_LABEL[d.severity] + '</span> <span class="dstat dstat-' + d.status + '">' + DEFSTAT_LABEL[d.status] + '</span></div>' : ''; }).join('') +
    (ro ? '' : '<div class="details-actions"><button class="btn ghost" onclick="openDefectModal(null,\'' + it.caseId + '\')">＋ Создать дефект</button></div>') + '</div>' +
    caseParamsBlock(it, c) +
    '</div></td></tr>';
}
function caseParamValue(it, col, idx) {
  const ov = it.overrides || {};
  return (col.k in ov) ? ov[col.k] : (caseById(it.caseId).v[idx] || '');
}
function caseParamsBlock(it, c) {
  const ro = !can('editPlan');
  const excel = excelParams.has(it.caseId);
  const ov = it.overrides || {};
  const groups = {}; DB.columns.forEach((col, idx) => { if (col.label !== '№ кейса') (groups[col.group] = groups[col.group] || []).push({ col, idx }); });
  let inner;
  if (excel) {
    inner = '<div class="pexcel"><table><thead><tr>' + DB.columns.map(col => '<th class="g-' + col.group + '">' + esc(col.label) + '</th>').join('') + '</tr></thead><tbody><tr>' +
      DB.columns.map((col, idx) => {
        if (col.label === '№ кейса') return '<td class="num">' + c.num + '</td>';
        const v = caseParamValue(it, col, idx);
        const changed = (col.k in ov) && ov[col.k] !== (c.v[idx] || '');
        return '<td' + (changed ? ' class="ov-cell"' : '') + '><input value="' + esc(v) + '"' + (ro ? ' disabled' : '') + ' oninput="setCaseParam(\'' + it.caseId + '\',\'' + col.k + '\',this.value)"></td>';
      }).join('') + '</tr></tbody></table></div>';
  } else {
    inner = GROUP_ORDER.filter(g => groups[g]).map(g => {
      const items = groups[g].map(({ col, idx }) => {
        const v = caseParamValue(it, col, idx);
        const changed = (col.k in ov) && ov[col.k] !== (c.v[idx] || '');
        return '<label class="pg-item' + (changed ? ' ov-changed' : '') + '"><span>' + esc(col.label) + '</span><input value="' + esc(v) + '"' + (ro ? ' disabled' : '') + ' oninput="setCaseParam(\'' + it.caseId + '\',\'' + col.k + '\',this.value)"></label>';
      }).join('');
      return '<div class="pg-group"><h5>' + esc(GROUP_TITLES[g] || g) + '</h5><div class="pg-grid">' + items + '</div></div>';
    }).join('');
  }
  const changedCount = Object.keys(ov).filter(k => { const idx = DB.columns.findIndex(x => x.k === k); return idx >= 0 && ov[k] !== (c.v[idx] || ''); }).length;
  return '<div class="param-full case-params"><div class="kvh">Параметры кейса (все значения)' +
    (changedCount ? ' <span class="ov-count">изменено: ' + changedCount + '</span>' : '') +
    '<span class="pg-toggle"><button class="btn ghost' + (!excel ? ' primary' : '') + '" onclick="setParamView(\'' + it.caseId + '\',\'form\')">Параметры</button>' +
    '<button class="btn ghost' + (excel ? ' primary' : '') + '" onclick="setParamView(\'' + it.caseId + '\',\'excel\')">Excel</button></span>' +
    (ro || !changedCount ? '' : '<button class="btn ghost" onclick="resetCaseParams(\'' + it.caseId + '\')">Сбросить</button>') + '</div>' +
    inner + '</div>';
}
function setParamView(caseId, mode) { if (mode === 'excel') excelParams.add(caseId); else excelParams.delete(caseId); renderPlanItems(); }
function setCaseParam(caseId, colKey, value) {
  if (!guardPlan()) return;
  const it = itemOf(caseId); if (!it) return;
  const c = caseById(caseId); const idx = DB.columns.findIndex(x => x.k === colKey);
  it.overrides = it.overrides || {};
  if (c && idx >= 0 && value === (c.v[idx] || '')) delete it.overrides[colKey];
  else it.overrides[colKey] = value;
  markItem(it); scheduleSave();
}
function resetCaseParams(caseId) {
  if (!guardPlan()) return;
  const it = itemOf(caseId); if (!it) return;
  it.overrides = {}; markItem(it); scheduleSave(); renderPlanItems();
}
function specOf(c) {
  const names = ['Завод', 'Условие отгрузки', 'Тип оплаты', 'Валюта оплаты', 'Тип комплектования', 'Тип выдачи', 'Коробка вскрыта при приёмке', 'Коробка вскрыта на кассе'];
  return '<b>Параметры из документа:</b> ' + names.map(n => n + ': ' + (esc(val(c, n)) || '—')).join(' · ');
}
function itemOf(caseId) { const p = planById(currentPlanId); return p ? p.items.find(i => i.caseId === caseId) : null; }
function markItem(it) { const p = planById(currentPlanId); it.updated = new Date().toISOString(); if (p) p.updated = it.updated; }
function guardPlan() { if (!can('editPlan')) { alert('Нет прав на редактирование'); return false; } return true; }

function setResult(caseId, result) { if (!guardPlan()) return; const it = itemOf(caseId); if (!it) return; it.result = result; markItem(it); scheduleSave(); renderPlanItems(); }
function setAssignee(caseId, value) { if (!guardPlan()) return; const it = itemOf(caseId); if (!it) return; it.assignee = value; markItem(it); scheduleSave(); }
function toggleParams(caseId) { if (openParams.has(caseId)) openParams.delete(caseId); else openParams.add(caseId); renderPlanItems(); }
function setParam(caseId, key, value) { const it = itemOf(caseId); if (!it) return; it.params[key] = value; markItem(it); scheduleSave(); }
function setCustom(caseId, idx, key, value) { const it = itemOf(caseId); if (!it) return; it.params.custom[idx][key] = value; markItem(it); scheduleSave(); }
function addCustom(caseId) { if (!guardPlan()) return; const it = itemOf(caseId); if (!it) return; it.params.custom.push({ name: '', value: '' }); markItem(it); scheduleSave(); renderPlanItems(); }
function delCustom(caseId, idx) { if (!guardPlan()) return; const it = itemOf(caseId); if (!it) return; it.params.custom.splice(idx, 1); markItem(it); scheduleSave(); renderPlanItems(); }

/* steps (execution) */
function addStep(caseId) { if (!guardPlan()) return; const it = itemOf(caseId); if (!it) return; it.steps.push({ id: uid(), text: '', expected: '', result: '', comment: '' }); markItem(it); scheduleSave(); renderPlanItems(); }
function delStep(caseId, idx) { if (!guardPlan()) return; const it = itemOf(caseId); if (!it) return; it.steps.splice(idx, 1); markItem(it); scheduleSave(); renderPlanItems(); }
function setStep(caseId, idx, field, value) { const it = itemOf(caseId); if (!it) return; it.steps[idx][field] = value; markItem(it); scheduleSave(); }
function setStepResult(caseId, idx, val) { if (!guardPlan()) return; const it = itemOf(caseId); if (!it) return; it.steps[idx].result = val; markItem(it); scheduleSave(); renderPlanItems(); }
function loadStepsFromTemplate(caseId) { if (!guardPlan()) return; const it = itemOf(caseId); const c = caseById(caseId); if (!it || !c) return; it.steps = (c.steps || []).map(s => ({ id: uid(), text: s.text, expected: s.expected, result: '', comment: '' })); markItem(it); scheduleSave(); renderPlanItems(); }
function setAllStepsFromTemplates() {
  if (!guardPlan()) return; const p = planById(currentPlanId); if (!p) return;
  if (!confirm('Заполнить пустые шаги из шаблонов каталога?')) return;
  p.items.forEach(it => { if (!(it.steps || []).length) { const c = caseById(it.caseId); if (c && (c.steps || []).length) it.steps = c.steps.map(s => ({ id: uid(), text: s.text, expected: s.expected, result: '', comment: '' })); } });
  scheduleSave(); renderPlanItems();
}

function removeItem(caseId) { if (!guardPlan()) return; const p = planById(currentPlanId); if (!p) return; if (!confirm('Убрать кейс из плана?')) return; p.items = p.items.filter(i => i.caseId !== caseId); p.updated = new Date().toISOString(); scheduleSave(); renderPlanItems(); }
function applyBulkResult(result) { if (!result) return; if (!guardPlan()) return; const p = planById(currentPlanId); if (!p) return; if (!confirm('Установить статус «' + resultInfo(result).label + '» всем кейсам плана?')) return; p.items.forEach(i => i.result = result); p.updated = new Date().toISOString(); scheduleSave(); renderPlanItems(); }
function applyBulkAssignee(name) {
  if (!name) return; if (!guardPlan()) return; const p = planById(currentPlanId); if (!p) return;
  const v = name === '__none__' ? '' : name;
  p.items.forEach(i => i.assignee = v); p.updated = new Date().toISOString(); scheduleSave(); renderPlanItems();
}
function renderPlanStats() {
  const p = planById(currentPlanId); if (!p) return; const s = planStats(p);
  const done = s.pass + s.fail + s.blocked + s.skip; const pct = s.total ? Math.round(done / s.total * 100) : 0;
  el('planStats').innerHTML = '<div class="stat"><b>' + s.total + '</b>кейсов</div>' +
    '<div class="stat"><b style="color:var(--green)">' + s.pass + '</b>пройдено</div>' +
    '<div class="stat"><b style="color:var(--red)">' + s.fail + '</b>провалено</div>' +
    '<div class="stat"><b style="color:var(--orange)">' + s.blocked + '</b>блокировано</div>' +
    '<div class="stat"><b>' + pct + '%</b>выполнено</div>' +
    '<div class="stat-bar">' + progressBar(s) + '</div>';
}
function deleteCurrentPlan() { if (!guardPlan()) return; const p = planById(currentPlanId); if (!p) return; if (!confirm('Удалить тест-план «' + (p.name || '') + '»?')) return; DB.plans = DB.plans.filter(x => x.id !== p.id); currentPlanId = null; scheduleSave(); updatePlansPill(); goView('plans'); }
function pickCasesForPlan() { selected = new Set(); refreshPlanSelect(); el('addToPlan').value = currentPlanId || ''; goView('catalog'); }

function addSelectedToPlan() {
  if (!can('editPlan')) return alert('Нет прав на редактирование');
  const ids = [...selected]; if (!ids.length) return alert('Отметьте кейсы галочками в таблице');
  let plan; const v = el('addToPlan').value;
  if (v === '__new__') plan = createPlan(true); else plan = planById(v);
  if (!plan) return alert('Сначала создайте тест-план');
  let added = 0;
  ids.forEach(id => {
    if (!plan.items.find(i => i.caseId === id)) {
      const c = caseById(id);
      plan.items.push({ caseId: id, result: '', assignee: '', params: { custom: [] }, steps: (c && c.steps || []).map(s => ({ id: uid(), text: s.text, expected: s.expected, result: '', comment: '' })), defectIds: [], comment: '', updated: new Date().toISOString() });
      added++;
    }
  });
  plan.updated = new Date().toISOString(); scheduleSave(); renderPlans(); refreshReleaseFilter(); refreshPlanSelect();
  if (added) { selected.clear(); renderCatalog(); }
  alert(added ? 'Добавлено кейсов: ' + added + ' в «' + plan.name + '»' : 'Выбранные кейсы уже есть в плане');
}

/* ---------------- defects ---------------- */
function renderDefects() {
  updateDefectsPill();
  const fs = el('dFilterStatus').value, fsv = el('dFilterSeverity').value;
  let list = (DB.defects || []).slice();
  if (fs) list = list.filter(d => d.status === fs);
  if (fsv) list = list.filter(d => d.severity === fsv);
  list.sort((a, b) => (b.updated || '').localeCompare(a.updated || ''));
  const body = el('defectsBody');
  if (!list.length) { body.innerHTML = '<tr><td colspan="8" class="empty">Дефектов нет</td></tr>'; return; }
  body.innerHTML = list.map(d => {
    const c = d.caseId ? caseById(d.caseId) : null;
    return '<tr><td class="num">' + esc(d.id.slice(-4)) + '</td>' +
      '<td class="link" onclick="openDefectModal(\'' + d.id + '\')">' + esc(d.title) + '</td>' +
      '<td>' + (c ? '№' + c.num : '<span class="co">—</span>') + '</td>' +
      '<td><span class="sev sev-' + d.severity + '">' + SEVERITY_LABEL[d.severity] + '</span></td>' +
      '<td><span class="dstat dstat-' + d.status + '">' + DEFSTAT_LABEL[d.status] + '</span></td>' +
      '<td>' + esc(d.assignee || '—') + '</td>' +
      '<td class="co">' + (d.updated ? new Date(d.updated).toLocaleString('ru-RU') : '') + '</td>' +
      '<td class="ck">' + (can('editPlan') ? '<button class="icon-btn danger" onclick="deleteDefect(\'' + d.id + '\')">✕</button>' : '') + '</td></tr>';
  }).join('');
}
function openDefectModal(id, caseId) {
  if (!can('editPlan') && !id) return alert('Нет прав');
  const d = id ? defectById(id) : { id: '', title: '', severity: 'major', status: 'open', priority: '', description: '', caseId: caseId || '', assignee: '', links: [] };
  const c = d.caseId ? caseById(d.caseId) : null;
  const caseOpts = '<option value="">— без кейса —</option>' + DB.catalog.map(x => '<option value="' + x.id + '"' + (x.id === d.caseId ? ' selected' : '') + '>№' + x.num + ' · ' + esc(val(x, 'Валюта оплаты')) + '</option>').join('');
  const html = '<div class="def-form"><div class="def-grid">' +
    '<label>Заголовок<input id="dTitle" value="' + esc(d.title) + '"></label>' +
    '<label>Кейс<select id="dCase">' + caseOpts + '</select></label>' +
    '<label>Критичность<select id="dSev">' + DEFECT_SEVERITY.map(s => '<option value="' + s + '"' + (s === d.severity ? ' selected' : '') + '>' + SEVERITY_LABEL[s] + '</option>').join('') + '</select></label>' +
    '<label>Статус<select id="dStat">' + DEFECT_STATUS.map(s => '<option value="' + s + '"' + (s === d.status ? ' selected' : '') + '>' + DEFSTAT_LABEL[s] + '</option>').join('') + '</select></label>' +
    '<label>Ответственный<input id="dAssign" value="' + esc(d.assignee) + '"></label>' +
    '<label>Приоритет<input id="dPrio" value="' + esc(d.priority) + '"></label></div>' +
    '<label>Описание<textarea id="dDesc" rows="4">' + esc(d.description) + '</textarea></label>' +
    '<label>Ссылки (по одной в строке)<textarea id="dLinks" rows="2">' + esc((d.links || []).join('\n')) + '</textarea></label>' +
    '<div style="text-align:right">' + (id ? '<button class="btn danger" style="float:left" onclick="deleteDefect(\'' + id + '\')">Удалить</button>' : '') + '<button class="btn primary" onclick="saveDefect(\'' + (d.id || '') + '\',\'' + (caseId || d.caseId || '') + '\')">Сохранить</button></div></div>';
  openModal(id ? 'Дефект' : 'Новый дефект', html);
}
function saveDefect(id, caseId) {
  if (!can('editPlan')) return alert('Нет прав');
  const title = (el('dTitle').value || '').trim(); if (!title) return alert('Укажите заголовок');
  const links = (el('dLinks').value || '').split('\n').map(s => s.trim()).filter(Boolean);
  let d = id ? defectById(id) : null;
  const wasNew = !d;
  if (!d) { d = { id: 'D' + uid(), created: new Date().toISOString() }; DB.defects.push(d); }
  d.title = title; d.severity = el('dSev').value; d.status = el('dStat').value; d.priority = el('dPrio').value;
  d.description = el('dDesc').value; d.caseId = el('dCase').value; d.assignee = el('dAssign').value; d.links = links; d.updated = new Date().toISOString();
  if (wasNew && caseId && currentPlanId) {
    const p = planById(currentPlanId); const it = p && p.items.find(i => i.caseId === caseId);
    if (it) { it.defectIds = it.defectIds || []; it.defectIds.push(d.id); }
  }
  if (wasNew && d.caseId && !currentPlanId) { }
  scheduleSave(); closeModal(); updateDefectsPill();
  if (pane === 'defects') renderDefects(); else if (pane === 'plan') renderPlanItems();
}
function deleteDefect(id) {
  if (!can('editPlan')) return alert('Нет прав');
  if (!confirm('Удалить дефект?')) return;
  DB.defects = DB.defects.filter(d => d.id !== id);
  DB.plans.forEach(p => (p.items || []).forEach(i => { if (i.defectIds) i.defectIds = i.defectIds.filter(x => x !== id); }));
  scheduleSave(); closeModal(); updateDefectsPill(); if (pane === 'defects') renderDefects(); else if (pane === 'plan') renderPlanItems();
}
function defectsForCase(caseId) { return (DB.defects || []).filter(d => d.caseId === caseId); }

/* ---------------- coverage ---------------- */
function executedCaseIds() {
  const set = new Set();
  DB.plans.forEach(p => (p.items || []).forEach(i => { if (i.result && i.result !== '') set.add(i.caseId); }));
  return set;
}
function coverageMatrix(rowName, colName) {
  const exec = executedCaseIds();
  const rows = {}, cols = new Set();
  DB.catalog.forEach(c => {
    const r = val(c, rowName) || '—', col = val(c, colName) || '—';
    cols.add(col);
    rows[r] = rows[r] || {};
    const cell = rows[r][col] = rows[r][col] || { total: 0, exec: 0 };
    cell.total++;
    if (exec.has(c.id)) cell.exec++;
  });
  return { rows, cols: [...cols].sort((a, b) => a.localeCompare(b, 'ru')) };
}
function coverageTable(rowName, colName, rowLabel, colLabel) {
  const { rows, cols } = coverageMatrix(rowName, colName);
  const rowKeys = Object.keys(rows).sort((a, b) => a.localeCompare(b, 'ru'));
  let totalAll = 0, execAll = 0;
  const head = '<tr><th class="rowh">' + esc(rowLabel) + ' \\ ' + esc(colLabel) + '</th>' + cols.map(c => '<th>' + esc(c) + '</th>').join('') + '<th>Итого</th></tr>';
  const body = rowKeys.map(r => {
    let rt = 0, re = 0;
    const cells = cols.map(c => {
      const cell = rows[r][c];
      if (!cell) return '<td class="cov-empty">·</td>';
      rt += cell.total; re += cell.exec;
      const cls = cell.exec === 0 ? 'cov-none' : cell.exec >= cell.total ? 'cov-full' : 'cov-part';
      return '<td class="' + cls + '">' + cell.exec + '/' + cell.total + '</td>';
    }).join('');
    totalAll += rt; execAll += re;
    return '<tr><th class="rowh">' + esc(r) + '</th>' + cells + '<td class="' + (re === 0 ? 'cov-none' : re >= rt ? 'cov-full' : 'cov-part') + '">' + re + '/' + rt + '</td></tr>';
  }).join('');
  return '<table><thead>' + head + '</thead><tbody>' + body + '</tbody></table><div class="spec">Покрыто: ' + execAll + ' из ' + totalAll + ' кейсов</div>';
}
function renderCoverage() {
  const box = el('coverageBody');
  const exec = executedCaseIds();
  const uncovered = DB.catalog.filter(c => !DB.plans.some(p => (p.items || []).some(i => i.caseId === c.id)));
  const legend = '<div class="legend"><span><i class="cov-full"></i>полностью</span><span><i class="cov-part"></i>частично</span><span><i class="cov-none"></i>не начато</span><span><i class="cov-empty"></i>нет кейсов</span></div>';
  const uncovList = uncovered.length
    ? '<div class="bars"><h3>Кейсы вне тест-планов (' + uncovered.length + ')</h3><div class="spec">' + uncovered.slice(0, 100).map(c => '№' + c.num).join(', ') + (uncovered.length > 100 ? ' …' : '') + '</div></div>'
    : '<div class="bars"><h3>Кейсы вне тест-планов</h3><div class="spec">Все кейсы каталога включены хотя бы в один план 🎉</div></div>';
  box.innerHTML = legend +
    '<div class="matrix"><h3>Страна × Условие отгрузки</h3>' + coverageTable('Страна', 'Условие отгрузки', 'Страна', 'Отгрузка') + '</div>' +
    '<div class="matrix"><h3>Тип оплаты × Валюта оплаты</h3>' + coverageTable('Тип оплаты', 'Валюта оплаты', 'Оплата', 'Валюта') + '</div>' +
    '<div class="matrix"><h3>Страна × Тип оплаты</h3>' + coverageTable('Страна', 'Тип оплаты', 'Страна', 'Оплата') + '</div>' +
    uncovList;
}

/* ---------------- analytics ---------------- */
function agg(plans) {
  const s = { total: 0, pass: 0, fail: 0, blocked: 0, progress: 0, skip: 0, none: 0 };
  plans.forEach(p => (p.items || []).forEach(i => { s.total++; s[i.result || 'none'] = (s[i.result || 'none'] || 0) + 1; }));
  return s;
}
function barRows(groups) {
  const keys = Object.keys(groups);
  if (!keys.length) return '<div class="spec">Нет данных</div>';
  const max = Math.max(...keys.map(k => groups[k].total), 1);
  return keys.map(k => {
    const s = groups[k]; const t = s.total || 1;
    const seg = (n, cls) => n ? '<i class="' + cls + '" style="width:' + (n / t * 100) + '%"></i>' : '';
    const rate = s.pass + s.fail ? Math.round(s.pass / (s.pass + s.fail) * 100) : 0;
    return '<div class="bar-row"><span>' + esc(k) + '</span><div class="bar-track" style="width:' + (s.total / max * 100) + '%;min-width:40px">' + seg(s.pass, 'pg-pass') + seg(s.fail, 'pg-fail') + seg(s.blocked, 'pg-blocked') + seg(s.progress, 'pg-progress') + seg(s.skip, 'pg-skip') + '</div><span class="bar-val">' + s.total + ' · ' + rate + '%</span></div>';
  }).join('');
}
function renderAnalytics() {
  const all = agg(DB.plans);
  const done = all.pass + all.fail + all.blocked + all.skip;
  const passRate = (all.pass + all.fail) ? Math.round(all.pass / (all.pass + all.fail) * 100) : 0;
  const byRel = {}, byEnv = {};
  DB.plans.forEach(p => {
    const rk = (p.ver || '').trim() || 'Без версии'; (byRel[rk] = byRel[rk] || { total: 0, pass: 0, fail: 0, blocked: 0, progress: 0, skip: 0, none: 0 });
    const ek = (p.env || '').trim() || 'Без среды'; (byEnv[ek] = byEnv[ek] || { total: 0, pass: 0, fail: 0, blocked: 0, progress: 0, skip: 0, none: 0 });
    (p.items || []).forEach(i => { byRel[rk].total++; byRel[rk][i.result || 'none']++; byEnv[ek].total++; byEnv[ek][i.result || 'none']++; });
  });
  const defs = DB.defects || [];
  const bySev = {}; DEFECT_SEVERITY.forEach(s => bySev[s] = defs.filter(d => d.severity === s).length);
  const byStatus = {}; DEFECT_STATUS.forEach(s => byStatus[s] = defs.filter(d => d.status === s).length);
  const failCount = {};
  DB.plans.forEach(p => (p.items || []).forEach(i => { if (i.result === 'fail') failCount[i.caseId] = (failCount[i.caseId] || 0) + 1; }));
  const topFail = Object.keys(failCount).sort((a, b) => failCount[b] - failCount[a]).slice(0, 10);
  const openDefects = defs.filter(d => d.status === 'open' || d.status === 'reopened' || d.status === 'in_progress').length;
  const cards = '<div class="cards">' +
    '<div class="card"><div class="cv">' + all.total + '</div><div class="cl">выполнений кейсов</div><div class="cs">во всех планах</div></div>' +
    '<div class="card"><div class="cv" style="color:var(--green)">' + passRate + '%</div><div class="cl">pass-rate</div><div class="cs">от завершённых</div></div>' +
    '<div class="card"><div class="cv" style="color:var(--red)">' + all.fail + '</div><div class="cl">провалено</div></div>' +
    '<div class="card"><div class="cv" style="color:var(--orange)">' + all.blocked + '</div><div class="cl">блокировано</div></div>' +
    '<div class="card"><div class="cv">' + DB.plans.length + '</div><div class="cl">тест-планов</div><div class="cs">' + done + ' выполнено</div></div>' +
    '<div class="card"><div class="cv" style="color:var(--red)">' + openDefects + '</div><div class="cl">открытых дефектов</div><div class="cs">всего ' + defs.length + '</div></div>' +
    '</div>';
  const blocks = '<div class="bars"><h3>По релизам</h3>' + barRows(byRel) + '</div>' +
    '<div class="bars"><h3>По средам</h3>' + barRows(byEnv) + '</div>' +
    '<div class="bars"><h3>Дефекты по критичности</h3>' + DEFECT_SEVERITY.map(s => '<div class="bar-row"><span>' + SEVERITY_LABEL[s] + '</span><div class="bar-track" style="width:' + (defs.length ? Math.max(2, bySev[s] / defs.length * 100) : 2) + '%"><i class="pg-fail" style="width:100%"></i></div><span class="bar-val">' + bySev[s] + '</span></div>').join('') + '</div>' +
    '<div class="bars"><h3>Дефекты по статусу</h3>' + DEFECT_STATUS.map(s => '<div class="bar-row"><span>' + DEFSTAT_LABEL[s] + '</span><div class="bar-track" style="width:' + (defs.length ? Math.max(2, byStatus[s] / defs.length * 100) : 2) + '%"><i class="pg-blocked" style="width:100%"></i></div><span class="bar-val">' + byStatus[s] + '</span></div>').join('') + '</div>' +
    '<div class="bars"><h3>Часто падающие кейсы</h3>' + (topFail.length ? topFail.map(id => { const c = caseById(id); return '<div class="bar-row"><span>№' + (c ? c.num : '?') + '</span><div class="bar-track" style="width:' + (failCount[id] / failCount[topFail[0]] * 100) + '%"><i class="pg-fail" style="width:100%"></i></div><span class="bar-val">' + failCount[id] + '</span></div>'; }).join('') : '<div class="spec">Провалов нет</div>') + '</div>';
  el('analyticsBody').innerHTML = cards + blocks;
}

/* ---------------- compare ---------------- */
function openCompare() {
  const p = planById(currentPlanId); if (!p) return;
  const others = DB.plans.filter(x => x.id !== p.id);
  if (!others.length) return alert('Нужен ещё хотя бы один тест-план для сравнения');
  const opts = others.map(x => '<option value="' + x.id + '">' + esc(x.name || 'план') + ' (' + esc(x.ver || '—') + ')</option>').join('');
  openModal('Сравнение прогонов', '<div class="cmp-fields"><label>Базовый прогон<input value="' + esc(p.name || '') + '" disabled></label><label>Сравнить с<select id="cmpSel" onchange="renderCompare(\'' + p.id + '\',this.value)">' + opts + '</select></label></div><div id="cmpOut"></div>');
  renderCompare(p.id, others[0].id);
}
function renderCompare(baseId, cmpId) {
  const b = planById(baseId), c = planById(cmpId); if (!b || !c) return;
  const bm = {}; (b.items || []).forEach(i => bm[i.caseId] = i.result || '');
  const cm = {}; (c.items || []).forEach(i => cm[i.caseId] = i.result || '');
  const ids = [...new Set([...Object.keys(bm), ...Object.keys(cm)])];
  const stat = { fixed: 0, regressed: 0, changed: 0, new: 0, removed: 0, same: 0 };
  const rows = ids.map(id => {
    const inB = id in bm, inC = id in cm; const bs = bm[id] || '', cs = cm[id] || '';
    let cat;
    if (inB && inC) { if (bs === cs) cat = 'same'; else if (cs === 'pass' && bs !== 'pass') cat = 'fixed'; else if (bs === 'pass' && cs !== 'pass') cat = 'regressed'; else cat = 'changed'; }
    else if (inC) cat = 'new'; else cat = 'removed';
    stat[cat]++; const cse = caseById(id); return { num: cse ? cse.num : 9999, bs, cs, cat };
  }).sort((a, b) => a.num - b.num);
  const labels = { fixed: 'Исправлен', regressed: 'Регресс', changed: 'Изменён', new: 'Новый', removed: 'Убран', same: 'Без изменений' };
  const summary = Object.keys(stat).filter(k => stat[k]).map(k => '<span class="cmp-chip ' + k + '">' + labels[k] + ': ' + stat[k] + '</span>').join('');
  el('cmpOut').innerHTML = '<div class="cmp-summary">' + summary + '</div><table class="cmp-table"><thead><tr><th>№</th><th>Базовый</th><th>Новый</th><th>Изменение</th></tr></thead><tbody>' +
    rows.map(r => '<tr class="r-' + r.cat + '"><td>' + (r.num === 9999 ? '?' : r.num) + '</td><td>' + esc(resultInfo(r.bs).label) + '</td><td>' + esc(resultInfo(r.cs).label) + '</td><td><span class="cat ' + r.cat + '">' + labels[r.cat] + '</span></td></tr>').join('') + '</tbody></table>';
}

/* ---------------- sync google sheets ---------------- */
function openSync() {
  const url = DB.meta.sheetCsv || DEFAULT_SHEET;
  const html = '<div class="def-form"><label>Ссылка на CSV (публикация Google Sheets)<input id="sheetUrl" value="' + esc(url) + '"></label>' +
    '<div class="spec" style="margin-bottom:12px">Формат: …/export?format=csv&gid=НОМЕР_ЛИСТА. Синхронизация выполняется GitHub Action и обновляет только каталог кейсов; планы, дефекты и пользователи сохраняются.</div>' +
    '<div style="text-align:right"><button class="btn ghost" onclick="saveSheetUrl()">Сохранить ссылку</button> <button class="btn primary" onclick="runSync()">Запустить синк</button></div>' +
    '<div id="syncStatus" class="spec" style="margin-top:12px"></div></div>';
  openModal('Синхронизация каталога', html);
}
function saveSheetUrl() { DB.meta.sheetCsv = (el('sheetUrl').value || '').trim() || DEFAULT_SHEET; scheduleSave(); el('syncStatus').textContent = 'Ссылка сохранена.'; }
async function runSync() {
  if (role() !== 'admin') return alert('Синхронизация доступна администратору');
  const u = el('sheetUrl').value.trim(); if (u) DB.meta.sheetCsv = u;
  el('syncStatus').textContent = 'Запускаю workflow…';
  const url = 'https://api.github.com/repos/' + CFG.owner + '/' + CFG.repo + '/actions/workflows/' + CFG.workflow + '/dispatches';
  const r = await fetch(url, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, ghHeaders()), body: JSON.stringify({ ref: CFG.branch }) });
  if (r.status !== 204) { el('syncStatus').textContent = 'Не удалось запустить workflow: HTTP ' + r.status; return; }
  el('syncStatus').textContent = 'Workflow запущен. Ожидаю завершения…';
  pollSync(0);
}
async function pollSync(n) {
  if (n > 25) { el('syncStatus').textContent = 'Долго… проверьте статус в GitHub Actions.'; return; }
  const r = await fetch('https://api.github.com/repos/' + CFG.owner + '/' + CFG.repo + '/actions/runs?per_page=1&event=workflow_dispatch', { headers: ghHeaders(), cache: 'no-store' });
  if (r.ok) {
    const j = await r.json(); const run = (j.workflow_runs || [])[0];
    if (run) {
      if (run.status === 'completed') {
        if (run.conclusion === 'success') {
          el('syncStatus').textContent = 'Готово! Обновляю данные…';
          await loadDB(); selected = new Set(); initFilters(); refreshAll(); closeModal();
          alert('Каталог синхронизирован: ' + DB.catalog.length + ' кейсов');
          return;
        } else { el('syncStatus').textContent = 'Workflow завершился с ошибкой: ' + run.conclusion; return; }
      }
      el('syncStatus').textContent = 'Статус: ' + run.status + '…';
    }
  }
  setTimeout(() => pollSync(n + 1), 3000);
}

/* ---------------- catalog import/export/add/edit ---------------- */
function exportCatalogJson() { download('catalog.json', JSON.stringify({ columns: DB.columns, catalog: DB.catalog }, null, 2), 'application/json'); }
function exportCatalogCsv() {
  const head = DB.columns.map(c => c.label); const rows = [head].concat(DB.catalog.map(c => c.v));
  download('catalog.csv', '\ufeff' + rows.map(r => r.map(csvCell).join(';')).join('\r\n'), 'text/csv;charset=utf-8');
}
function importCatalogFile(input) {
  if (!can('editCatalog')) return alert('Импорт доступен администратору');
  const f = input.files && input.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const j = JSON.parse(r.result);
      if (j.catalog && j.columns && Array.isArray(j.catalog)) { DB.catalog = j.catalog; DB.columns = j.columns; }
      else if (Array.isArray(j)) DB.catalog = j; else throw new Error('нет поля catalog');
      scheduleSave(); initFilters(); renderCatalog(); alert('Импортировано кейсов: ' + DB.catalog.length);
    } catch (e) { alert('Ошибка чтения файла: ' + e.message); }
    input.value = '';
  };
  r.readAsText(f, 'utf-8');
}
function addCaseModal() { if (!can('editCatalog')) return alert('Добавление кейсов доступно администратору'); openCaseEditor(null); }
function openCaseEditor(id) {
  const c = id ? caseById(id) : null;
  const groups = {}; DB.columns.forEach(col => { (groups[col.group] = groups[col.group] || []).push(col); });
  const html = GROUP_ORDER.filter(g => groups[g]).map(g =>
    '<div class="case-group"><h4>' + esc(GROUP_TITLES[g] || g) + '</h4><table>' +
    groups[g].filter(col => col.k !== 'c1').map(col => { const idx = DB.columns.indexOf(col); const v = c ? (c.v[idx] || '') : ''; return '<tr><td>' + esc(col.label) + '</td><td><input data-col="' + col.k + '" value="' + esc(v) + '"></td></tr>'; }).join('') +
    '</table></div>').join('');
  openModal(c ? 'Кейс №' + c.num : 'Новый кейс', '<div class="case-groups">' + html + '</div><div style="margin-top:16px;text-align:right"><button class="btn primary" onclick="saveCase(\'' + (id || '') + '\')">' + (c ? 'Сохранить' : 'Создать кейс') + '</button></div>');
}
function saveCase(id) {
  if (!can('editCatalog')) return alert('Нет прав');
  let c = id ? caseById(id) : null;
  if (!c) { c = { id: '', num: 0, v: DB.columns.map(() => '') }; }
  const v = DB.columns.map((col, idx) => c.v[idx] || '');
  document.querySelectorAll('#modalHost input[data-col]').forEach(inp => { const idx = DB.columns.findIndex(x => x.k === inp.dataset.col); if (idx >= 0) v[idx] = inp.value.trim(); });
  const numIdx = DB.columns.findIndex(x => x.label === '№ кейса');
  if (!id) {
    let num = parseInt(v[numIdx], 10); if (!num) { num = DB.catalog.reduce((m, x) => Math.max(m, x.num), 0) + 1; v[numIdx] = String(num); }
    c.id = 'case-' + num + '-' + Math.random().toString(36).slice(2, 5); c.num = num;
  }
  c.v = v; if (!id) DB.catalog.push(c);
  scheduleSave(); closeModal(); initFilters(); renderCatalog();
}
function saveCaseSteps(caseId) {
  if (!can('editCatalog')) return alert('Нет прав');
  const c = caseById(caseId); if (!c) return;
  const texts = document.querySelectorAll('#caseSteps [data-step-text]');
  const exps = document.querySelectorAll('#caseSteps [data-step-exp]');
  const steps = [];
  texts.forEach((t, i) => steps.push({ id: uid(), text: t.value.trim(), expected: (exps[i] && exps[i].value || '').trim() }));
  c.steps = steps.filter(s => s.text || s.expected);
  scheduleSave(); initFilters(); renderCatalog();
}

/* ---------------- case modal ---------------- */
function showCase(id) {
  const c = caseById(id); if (!c) return;
  const groups = {}; DB.columns.forEach(col => { (groups[col.group] = groups[col.group] || []).push(col); });
  const html = GROUP_ORDER.filter(g => groups[g]).map(g => {
    const rows = groups[g].map(col => { const v = c.v[DB.columns.indexOf(col)] || ''; if (col.k === 'c1') return ''; return '<tr><td>' + esc(col.label) + '</td><td>' + (esc(v) || '<span class="co">—</span>') + '</td></tr>'; }).join('');
    return '<div class="case-group"><h4>' + esc(GROUP_TITLES[g] || g) + '</h4><table>' + rows + '</table></div>';
  }).join('');
  const steps = (c.steps || []);
  const ro = !can('editCatalog');
  const stepsHtml = '<div class="param-full steps-box" id="caseSteps"><div class="kvh">Шаги сценария (шаблон)</div>' +
    steps.map((s, idx) => '<div class="step-row"><div class="step-num">' + (idx + 1) + '</div>' +
      '<textarea data-step-text' + (ro ? ' disabled' : '') + '>' + esc(s.text || '') + '</textarea>' +
      '<textarea data-step-exp placeholder="Ожидаемый результат"' + (ro ? ' disabled' : '') + '>' + esc(s.expected || '') + '</textarea><div></div>' + (ro ? '' : '<button class="icon-btn danger" onclick="caseStepRemove(' + idx + ')">✕</button>') + '</div>').join('') +
    (ro ? '' : '<button class="btn ghost" onclick="caseStepAdd()">＋ Шаг</button> <button class="btn primary" onclick="saveCaseSteps(\'' + c.id + '\')">Сохранить шаги</button>') + '</div>';
  openModal('Кейс №' + c.num + ' · ' + esc(val(c, 'Страна')), '<div class="case-groups">' + html + '</div>' + stepsHtml +
    (can('editCatalog') ? '<div style="margin-top:16px"><button class="btn ghost" onclick="openCaseEditor(\'' + c.id + '\')">Редактировать поля кейса</button></div>' : ''));
  window.__caseStepBuf = steps.map(s => ({ text: s.text, expected: s.expected }));
}
function caseStepAdd() { window.__caseStepBuf.push({ text: '', expected: '' }); rerenderCaseSteps(); }
function caseStepRemove(i) { window.__caseStepBuf.splice(i, 1); rerenderCaseSteps(); }
function rerenderCaseSteps() {
  const box = el('caseSteps'); if (!box) return;
  const buf = window.__caseStepBuf;
  box.querySelectorAll('[data-step-text]').forEach((t, i) => { if (buf[i]) buf[i].text = t.value; });
  box.querySelectorAll('[data-step-exp]').forEach((t, i) => { if (buf[i]) buf[i].expected = t.value; });
  box.innerHTML = '<div class="kvh">Шаги сценария (шаблон)</div>' + buf.map((s, idx) =>
    '<div class="step-row"><div class="step-num">' + (idx + 1) + '</div><textarea data-step-text>' + esc(s.text || '') + '</textarea><textarea data-step-exp placeholder="Ожидаемый результат">' + esc(s.expected || '') + '</textarea><div></div><button class="icon-btn danger" onclick="caseStepRemove(' + idx + ')">✕</button></div>').join('') +
    '<button class="btn ghost" onclick="caseStepAdd()">＋ Шаг</button> <button class="btn primary" onclick="saveCaseStepBuf()">Сохранить шаги</button>';
}
function saveCaseStepBuf() {
  const box = el('caseSteps'); const buf = window.__caseStepBuf;
  box.querySelectorAll('[data-step-text]').forEach((t, i) => { if (buf[i]) buf[i].text = t.value; });
  box.querySelectorAll('[data-step-exp]').forEach((t, i) => { if (buf[i]) buf[i].expected = t.value; });
  const title = document.querySelector('.modal-title').textContent;
  const num = parseInt((title.match(/№(\d+)/) || [])[1], 10);
  const c = DB.catalog.find(x => x.num === num); if (!c) return;
  c.steps = buf.filter(s => s.text || s.expected).map(s => ({ id: uid(), text: s.text, expected: s.expected }));
  scheduleSave(); initFilters(); renderCatalog();
  el('caseSteps').innerHTML = '<div class="kvh">Шаги сохранены ✓</div>';
}

function openModal(title, body) { el('modalHost').innerHTML = '<div class="modal" onclick="if(event.target===this)closeModal()"><div class="modal-box"><div class="modal-head"><div class="modal-title">' + title + '</div><button class="modal-close" onclick="closeModal()">✕</button></div><div class="modal-body">' + body + '</div></div></div>'; document.body.style.overflow = 'hidden'; }
function closeModal() { el('modalHost').innerHTML = ''; document.body.style.overflow = ''; }

/* ---------------- export plan ---------------- */
function itemVal(it, c, name) {
  const idx = ci(name); if (idx < 0) return '';
  const col = DB.columns[idx]; const ov = it.overrides || {};
  return (col.k in ov) ? ov[col.k] : (c.v[idx] || '');
}
function planRows(p) {
  const head = ['№ кейса', 'Приоритет', 'Статус кейса', 'Страна', 'Отгрузка', 'Тип оплаты', 'Валюта оплаты', 'Завод', 'Комплектование', 'Описание', 'Ответственный', 'Результат', 'Среда', '№ заказа (факт)', 'Ожидаемый результат', 'Фактический результат', 'Шаги', 'Дефекты', 'Комментарий', 'Доп. параметры'];
  const rows = [head];
  (p.items || []).forEach(it => {
    const c = caseById(it.caseId); if (!c) return; const pr = it.params || {};
    const extra = (pr.custom || []).filter(kv => kv.name || kv.value).map(kv => (kv.name || '') + '=' + (kv.value || '')).join('; ');
    const steps = (it.steps || []).map((s, i) => (i + 1) + ') ' + s.text + ' → ' + (s.expected || '') + ' [' + resultInfo(s.result || '').label + ']').join(' | ');
    const defs = (it.defectIds || []).map(id => { const d = defectById(id); return d ? d.title + '(' + SEVERITY_LABEL[d.severity] + '/' + DEFSTAT_LABEL[d.status] + ')' : ''; }).filter(Boolean).join('; ');
    rows.push([c.num, itemVal(it, c, 'Приоритет'), itemVal(it, c, 'Статус'), itemVal(it, c, 'Страна'), itemVal(it, c, 'Условие отгрузки'), itemVal(it, c, 'Тип оплаты'), itemVal(it, c, 'Валюта оплаты'), itemVal(it, c, 'Завод'), itemVal(it, c, 'Тип комплектования'), itemVal(it, c, 'Описание (доп. условия)'), it.assignee || '', resultInfo(it.result || '').label, pr.env || '', pr.orderNo || '', pr.expected || '', pr.actual || '', steps, defs, pr.comment || '', extra]);
  });
  return rows;
}
function csvCell(v) { v = String(v == null ? '' : v); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
function download(name, content, type) { const blob = new Blob([content], { type: type || 'text/plain;charset=utf-8' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }
function exportPlanCsv() { const p = planById(currentPlanId); if (!p) return; download('plan-' + (p.name || 'export').replace(/[^\wа-яё\-]+/gi, '_') + '.csv', '\ufeff' + planRows(p).map(r => r.map(csvCell).join(';')).join('\r\n'), 'text/csv;charset=utf-8'); }
function exportPlanJson() { const p = planById(currentPlanId); if (!p) return; download('plan-' + p.id + '.json', JSON.stringify(p, null, 2), 'application/json'); }

/* ---------------- init ---------------- */
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  setStatus('Загрузка…', 'pending');
  loadDB().then(() => {
    if (!localStorage.getItem('tp_user') && DB.users && DB.users.length) {
      const admin = DB.users.find(u => u.role === 'admin') || DB.users[0];
      localStorage.setItem('tp_user', admin.id);
    }
    initFilters(); initBulkResult(); initBulkAssignee(); initDefectFilters();
    refreshPlanSelect(); refreshReleaseFilter(); updatePlansPill(); updateDefectsPill(); updateUserBtn();
    renderCatalog(); renderPlans();
    setStatus('Готово', 'ok');
  }).catch(e => { setStatus('Нет связи с базой', 'err'); console.error(e); });
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
