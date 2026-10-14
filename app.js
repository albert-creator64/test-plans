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

function ci(name) { return DB.columns.findIndex(c => c.label === name); }
function val(c, name) { const i = ci(name); return i < 0 ? '' : (c.v[i] || ''); }

/* ---------------- theme ---------------- */
function initTheme() {
  const dark = localStorage.getItem('tp_theme') === 'dark';
  document.body.classList.toggle('dark', dark);
  el('themeBtn').textContent = dark ? '☀️' : '🌙';
}
function toggleTheme() {
  const dark = document.body.classList.toggle('dark');
  localStorage.setItem('tp_theme', dark ? 'dark' : 'light');
  el('themeBtn').textContent = dark ? '☀️' : '🌙';
}

/* ---------------- navigation ---------------- */
function goView(v) {
  pane = v;
  ['catalog', 'plans', 'plan'].forEach(x => { el('view-' + x).style.display = x === v ? 'block' : 'none'; });
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.dataset.view === v || (v === 'plan' && t.dataset.view === 'plans')));
  if (v === 'catalog') renderCatalog();
  if (v === 'plans') renderPlans();
}

/* ---------------- filters ---------------- */
function distinctCatalog(name) {
  const set = new Set();
  DB.catalog.forEach(c => { const v = val(c, name); if (v) set.add(v); });
  return [...set].sort((a, b) => a.localeCompare(b, 'ru'));
}
function fillSelect(id, values, allLabel) {
  const s = el(id);
  if (!s) return;
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
function initBulkResult() {
  const s = el('bulkResult');
  s.innerHTML = '<option value="">Массово: статус…</option>' + RESULTS.filter(r => r.k).map(r => '<option value="' + r.k + '">' + r.label + '</option>').join('');
}
function resetFilters() {
  ['fSearch', 'fPriority', 'fStatus', 'fCountry', 'fShipping', 'fPayType', 'fCurrency', 'fPlant'].forEach(id => el(id).value = '');
  renderCatalog();
}
function filteredCatalog() {
  const q = (el('fSearch').value || '').trim().toLowerCase();
  const fp = el('fPriority').value, fs = el('fStatus').value, fc = el('fCountry').value,
    fsh = el('fShipping').value, fpay = el('fPayType').value, fcur = el('fCurrency').value, fpl = el('fPlant').value;
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
function stTag(v) {
  const cls = v === 'Новый' ? 'st-Новый' : v === 'Отмена' ? 'st-Отмена' : 'st-other';
  return '<span class="tag ' + cls + '">' + esc(v || '—') + '</span>';
}

/* ---------------- catalog ---------------- */
function renderCatalog() {
  const list = filteredCatalog();
  const body = el('catalogBody');
  if (!DB.catalog.length) {
    body.innerHTML = '<tr><td colspan="15" class="empty"><div class="empty-ic">📄</div>Каталог пуст. Добавьте кейс или импортируйте JSON.</td></tr>';
    el('catCount').textContent = '';
    return;
  }
  body.innerHTML = list.map(c => {
    const isSel = selected.has(c.id);
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
      '</tr>';
  }).join('');
  el('catCount').textContent = 'Показано: ' + list.length + ' из ' + DB.catalog.length + ' · выбрано: ' + selected.size;
  updateSelInfo();
}
function toggleSel(id, on) { if (on) selected.add(id); else selected.delete(id); renderCatalog(); }
function selectAllVisible(on) {
  filteredCatalog().forEach(c => { if (on) selected.add(c.id); else selected.delete(c.id); });
  el('ckAll').checked = false;
  renderCatalog();
}
function updateSelInfo() { el('selInfo').textContent = selected.size + ' выбрано'; }

/* ---------------- plans ---------------- */
function refreshPlanSelect() {
  const s = el('addToPlan');
  if (!s) return;
  const opts = DB.plans.map(p => '<option value="' + p.id + '">' + esc(p.name || 'Тест-план') + '</option>').join('');
  s.innerHTML = opts + '<option value="__new__">＋ Создать новый план…</option>';
  if (currentPlanId && planById(currentPlanId)) s.value = currentPlanId;
}
function refreshReleaseFilter() {
  const vals = [...new Set(DB.plans.map(p => (p.ver || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));
  const s = el('fRelease');
  const cur = s.value;
  s.innerHTML = '<option value="">Все релизы</option>' + vals.map(v => '<option value="' + esc(v) + '">' + esc(v) + '</option>').join('');
  if (vals.indexOf(cur) >= 0) s.value = cur;
}
function updatePlansPill() { el('plansCount').textContent = DB.plans.length; }

function createPlan(quiet) {
  const plan = {
    id: uid(), name: 'Тест-план ' + new Date().toLocaleDateString('ru-RU'),
    ver: '', env: '', tester: '', created: new Date().toISOString(), updated: new Date().toISOString(), items: []
  };
  DB.plans.unshift(plan);
  scheduleSave(); updatePlansPill(); refreshPlanSelect(); refreshReleaseFilter();
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
  return '<div class="plan-tile" onclick="openPlan(\'' + p.id + '\')">' +
    '<h3>' + esc(p.name || 'Тест-план') + '</h3>' +
    '<div class="pt-meta">' + (meta || 'параметры не заданы') + '</div>' +
    (assignees.length ? '<div class="pt-meta">👤 ' + assignees.map(esc).join(', ') + '</div>' : '') +
    '<div class="pt-row"><span>Кейсов: <b>' + s.total + '</b></span><span>Выполнено: <b>' + pct + '%</b></span></div>' +
    progressBar(s) +
    '<div class="pt-row" style="margin-top:2px"><span>✓ ' + s.pass + ' · ✗ ' + s.fail + ' · ⛔ ' + s.blocked + '</span><span>' + (p.updated ? new Date(p.updated).toLocaleDateString('ru-RU') : '') + '</span></div>' +
    '</div>';
}
function renderPlans() {
  updatePlansPill(); refreshPlanSelect(); refreshReleaseFilter();
  const box = el('plansList');
  const filt = el('fRelease').value;
  let plans = DB.plans;
  if (filt) plans = plans.filter(p => (p.ver || '').trim() === filt);
  if (!plans.length) {
    box.innerHTML = '<div class="empty" style="grid-column:1/-1"><div class="empty-ic">🧪</div><div style="font-weight:700;font-size:15px;color:var(--text)">Тест-планов пока нет</div><div>Создайте план и добавьте кейсы из каталога</div></div>';
    return;
  }
  const groups = {};
  plans.forEach(p => { const k = (p.ver || '').trim() || 'Без версии'; (groups[k] = groups[k] || []).push(p); });
  const keys = Object.keys(groups).sort((a, b) => a.localeCompare(b, 'ru'));
  box.innerHTML = keys.map(k =>
    '<div class="rel-group" style="grid-column:1/-1">' +
    '<div class="rel-title">' + esc(k) + ' <span class="pill">' + groups[k].length + '</span></div>' +
    '<div class="plans-grid">' + groups[k].map(planTile).join('') + '</div></div>'
  ).join('');
}

/* ---------------- plan detail ---------------- */
function openPlan(id) {
  currentPlanId = id;
  const p = planById(id);
  if (!p) return goView('plans');
  if (!p.items) p.items = [];
  el('pName').value = p.name || '';
  el('pVer').value = p.ver || '';
  el('pEnv').value = p.env || '';
  el('pTester').value = p.tester || '';
  renderPlanItems();
  goView('plan');
  refreshPlanSelect();
}
function updatePlanField(f, v) {
  const p = planById(currentPlanId); if (!p) return;
  p[f] = v; p.updated = new Date().toISOString(); scheduleSave();
  if (f === 'ver') refreshReleaseFilter();
}

function renderPlanItems() {
  const p = planById(currentPlanId); if (!p) return;
  const body = el('planItems');
  if (!p.items.length) {
    body.innerHTML = '<tr><td colspan="11" class="empty"><div class="empty-ic">➕</div>В плане нет кейсов.<br>Нажмите «Добавить кейсы из каталога»</td></tr>';
    renderPlanStats(); return;
  }
  body.innerHTML = p.items.map(it => {
    const c = caseById(it.caseId); if (!c) return '';
    const ri = resultInfo(it.result || '');
    const paramsOpen = openParams.has(it.caseId);
    const filled = countParams(it);
    const row = '<tr class="item-row">' +
      '<td class="num"><span class="link" onclick="showCase(\'' + c.id + '\')">' + c.num + '</span></td>' +
      '<td>' + prTag(val(c, 'Приоритет')) + '</td>' +
      '<td>' + esc(val(c, 'Страна')) + '</td>' +
      '<td>' + esc(val(c, 'Условие отгрузки')) + '</td>' +
      '<td>' + esc(val(c, 'Тип оплаты')) + '</td>' +
      '<td class="cur-tag">' + esc(val(c, 'Валюта оплаты')) + '</td>' +
      '<td class="desc">' + (esc(val(c, 'Описание (доп. условия)')) || '<span class="co">—</span>') + '</td>' +
      '<td class="assignee-col"><input class="assignee-input" list="assigneeList" placeholder="—" value="' + esc(it.assignee || '') + '" oninput="setAssignee(\'' + it.caseId + '\',this.value)"></td>' +
      '<td class="res-col"><select class="res-select ' + ri.cls + '" onchange="setResult(\'' + it.caseId + '\',this.value)">' +
      RESULTS.map(r => '<option value="' + r.k + '"' + ((it.result || '') === r.k ? ' selected' : '') + '>' + r.label + '</option>').join('') +
      '</select></td>' +
      '<td class="params-col"><button class="btn ghost" onclick="toggleParams(\'' + it.caseId + '\')">' + (paramsOpen ? 'Скрыть' : 'Параметры' + (filled ? ' (' + filled + ')' : '')) + '</button></td>' +
      '<td class="ck"><button class="icon-btn danger" title="Убрать" onclick="removeItem(\'' + it.caseId + '\')">✕</button></td>' +
      '</tr>';
    return row + (paramsOpen ? paramRow(it, c) : '');
  }).join('');
  renderPlanStats();
}

function paramRow(it, c) {
  const pr = it.params || (it.params = {});
  const custom = pr.custom || (pr.custom = []);
  return '<tr class="param-row"><td colspan="11" class="param-panel"><div class="param-inner">' +
    '<label>Среда / стенд<input value="' + esc(pr.env || '') + '" oninput="setParam(\'' + it.caseId + '\',\'env\',this.value)"></label>' +
    '<label>№ заказа / чека (факт)<input value="' + esc(pr.orderNo || '') + '" oninput="setParam(\'' + it.caseId + '\',\'orderNo\',this.value)"></label>' +
    '<label>Ожидаемый результат<input value="' + esc(pr.expected || '') + '" oninput="setParam(\'' + it.caseId + '\',\'expected\',this.value)" placeholder="напр. чек сформирован, сумма списана"></label>' +
    '<label class="param-full">Фактический результат<textarea rows="2" oninput="setParam(\'' + it.caseId + '\',\'actual\',this.value)">' + esc(pr.actual || '') + '</textarea></label>' +
    '<label class="param-full">Комментарий<textarea rows="2" oninput="setParam(\'' + it.caseId + '\',\'comment\',this.value)">' + esc(pr.comment || '') + '</textarea></label>' +
    '<div class="param-full"><div style="font-size:11.5px;font-weight:700;color:var(--muted);text-transform:uppercase;margin-bottom:6px">Дополнительные параметры проверки</div>' +
    custom.map((kv, idx) => '<div class="kv-row"><input placeholder="Параметр" value="' + esc(kv.name || '') + '" oninput="setCustom(\'' + it.caseId + '\',' + idx + ',\'name\',this.value)"><input placeholder="Значение" value="' + esc(kv.value || '') + '" oninput="setCustom(\'' + it.caseId + '\',' + idx + ',\'value\',this.value)"><button class="icon-btn danger" onclick="delCustom(\'' + it.caseId + '\',' + idx + ')">✕</button></div>').join('') +
    '<button class="btn ghost" onclick="addCustom(\'' + it.caseId + '\')">＋ Добавить параметр</button></div>' +
    '<div class="param-full spec">' + specOf(c) + '</div>' +
    '</div></td></tr>';
}
function specOf(c) {
  const names = ['Завод', 'Условие отгрузки', 'Тип оплаты', 'Валюта оплаты', 'Тип комплектования', 'Тип выдачи', 'Коробка вскрыта при приёмке', 'Коробка вскрыта на кассе'];
  return '<b>Параметры из документа:</b> ' + names.map(n => n + ': ' + (esc(val(c, n)) || '—')).join(' · ');
}
function countParams(it) {
  const pr = it.params || {};
  let n = 0;
  ['env', 'orderNo', 'expected', 'actual', 'comment'].forEach(k => { if (pr[k]) n++; });
  n += (pr.custom || []).filter(kv => kv.name || kv.value).length;
  return n;
}
function setResult(caseId, result) {
  const it = itemOf(caseId); if (!it) return;
  it.result = result; markItem(it); scheduleSave(); renderPlanItems();
}
function setAssignee(caseId, value) { const it = itemOf(caseId); if (!it) return; it.assignee = value; markItem(it); scheduleSave(); }
function toggleParams(caseId) { if (openParams.has(caseId)) openParams.delete(caseId); else openParams.add(caseId); renderPlanItems(); }
function setParam(caseId, key, value) { const it = itemOf(caseId); if (!it) return; it.params = it.params || {}; it.params[key] = value; markItem(it); scheduleSave(); }
function setCustom(caseId, idx, key, value) { const it = itemOf(caseId); if (!it) return; it.params.custom[idx][key] = value; markItem(it); scheduleSave(); }
function addCustom(caseId) { const it = itemOf(caseId); if (!it) return; it.params = it.params || {}; it.params.custom = it.params.custom || []; it.params.custom.push({ name: '', value: '' }); markItem(it); scheduleSave(); renderPlanItems(); }
function delCustom(caseId, idx) { const it = itemOf(caseId); if (!it) return; it.params.custom.splice(idx, 1); markItem(it); scheduleSave(); renderPlanItems(); }
function itemOf(caseId) { const p = planById(currentPlanId); return p ? p.items.find(i => i.caseId === caseId) : null; }
function markItem(it) { const p = planById(currentPlanId); it.updated = new Date().toISOString(); if (p) p.updated = it.updated; }

function removeItem(caseId) {
  const p = planById(currentPlanId); if (!p) return;
  if (!confirm('Убрать кейс из плана?')) return;
  p.items = p.items.filter(i => i.caseId !== caseId); p.updated = new Date().toISOString();
  scheduleSave(); renderPlanItems();
}
function applyBulkResult(result) {
  if (!result) return;
  const p = planById(currentPlanId); if (!p) return;
  if (!confirm('Установить статус «' + resultInfo(result).label + '» всем кейсам плана?')) return;
  p.items.forEach(i => i.result = result); p.updated = new Date().toISOString();
  scheduleSave(); renderPlanItems();
}
function renderPlanStats() {
  const p = planById(currentPlanId); if (!p) return;
  const s = planStats(p);
  const done = s.pass + s.fail + s.blocked + s.skip;
  const pct = s.total ? Math.round(done / s.total * 100) : 0;
  el('planStats').innerHTML =
    '<div class="stat"><b>' + s.total + '</b>кейсов</div>' +
    '<div class="stat"><b style="color:var(--green)">' + s.pass + '</b>пройдено</div>' +
    '<div class="stat"><b style="color:var(--red)">' + s.fail + '</b>провалено</div>' +
    '<div class="stat"><b style="color:var(--orange)">' + s.blocked + '</b>блокировано</div>' +
    '<div class="stat"><b>' + pct + '%</b>выполнено</div>' +
    '<div class="stat-bar">' + progressBar(s) + '</div>';
}
function deleteCurrentPlan() {
  const p = planById(currentPlanId); if (!p) return;
  if (!confirm('Удалить тест-план «' + (p.name || '') + '»?')) return;
  DB.plans = DB.plans.filter(x => x.id !== p.id); currentPlanId = null;
  scheduleSave(); updatePlansPill(); goView('plans');
}
function pickCasesForPlan() {
  selected = new Set();
  refreshPlanSelect();
  el('addToPlan').value = currentPlanId || '';
  goView('catalog');
}

/* ---------------- add from catalog ---------------- */
function addSelectedToPlan() {
  const ids = [...selected];
  if (!ids.length) return alert('Отметьте кейсы галочками в таблице');
  let plan;
  const v = el('addToPlan').value;
  if (v === '__new__') plan = createPlan(true);
  else plan = planById(v);
  if (!plan) return alert('Сначала создайте тест-план');
  if (!plan.items) plan.items = [];
  let added = 0;
  ids.forEach(id => {
    if (!plan.items.find(i => i.caseId === id)) {
      plan.items.push({ caseId: id, result: '', assignee: '', params: { custom: [] }, comment: '', updated: new Date().toISOString() });
      added++;
    }
  });
  plan.updated = new Date().toISOString();
  scheduleSave(); renderPlans(); refreshReleaseFilter(); refreshPlanSelect();
  if (added) { selected.clear(); renderCatalog(); }
  alert(added ? 'Добавлено кейсов: ' + added + ' в «' + plan.name + '»' : 'Выбранные кейсы уже есть в плане');
}

/* ---------------- compare ---------------- */
function openCompare() {
  const p = planById(currentPlanId); if (!p) return;
  const others = DB.plans.filter(x => x.id !== p.id);
  if (!others.length) return alert('Нужен ещё хотя бы один тест-план для сравнения');
  const opts = others.map(x => '<option value="' + x.id + '">' + esc(x.name || 'план') + ' (' + esc((x.ver || '—')) + ')</option>').join('');
  openModal('Сравнение прогонов',
    '<div class="cmp-fields">' +
    '<label>Базовый прогон<input value="' + esc(p.name || '') + '" disabled></label>' +
    '<label>Сравнить с<select id="cmpSel" onchange="renderCompare(\'' + p.id + '\',this.value)">' + opts + '</select></label>' +
    '</div><div id="cmpOut"></div>');
  renderCompare(p.id, others[0].id);
}
function renderCompare(baseId, cmpId) {
  const b = planById(baseId), c = planById(cmpId);
  if (!b || !c) return;
  const bm = {}; (b.items || []).forEach(i => bm[i.caseId] = i.result || '');
  const cm = {}; (c.items || []).forEach(i => cm[i.caseId] = i.result || '');
  const ids = [...new Set([...Object.keys(bm), ...Object.keys(cm)])];
  const stat = { fixed: 0, regressed: 0, changed: 0, new: 0, removed: 0, same: 0 };
  const rows = ids.map(id => {
    const inB = id in bm, inC = id in cm;
    const bs = bm[id] || '', cs = cm[id] || '';
    let cat;
    if (inB && inC) {
      if (bs === cs) cat = 'same';
      else if (cs === 'pass' && bs !== 'pass') cat = 'fixed';
      else if (bs === 'pass' && cs !== 'pass') cat = 'regressed';
      else cat = 'changed';
    } else if (inC) cat = 'new';
    else cat = 'removed';
    stat[cat]++;
    const cse = caseById(id);
    return { num: cse ? cse.num : 9999, bs, cs, cat };
  }).sort((a, b) => a.num - b.num);
  const labels = { fixed: 'Исправлен', regressed: 'Регресс', changed: 'Изменён', new: 'Новый', removed: 'Убран', same: 'Без изменений' };
  const summary = Object.keys(stat).filter(k => stat[k]).map(k => '<span class="cmp-chip ' + k + '">' + labels[k] + ': ' + stat[k] + '</span>').join('');
  const table = '<table class="cmp-table"><thead><tr><th>№</th><th>Базовый</th><th>Новый</th><th>Изменение</th></tr></thead><tbody>' +
    rows.map(r => '<tr class="r-' + r.cat + '"><td>' + (r.num === 9999 ? '?' : r.num) + '</td><td>' + esc(resultInfo(r.bs).label) + '</td><td>' + esc(resultInfo(r.cs).label) + '</td><td><span class="cat ' + r.cat + '">' + labels[r.cat] + '</span></td></tr>').join('') +
    '</tbody></table>';
  el('cmpOut').innerHTML = '<div class="cmp-summary">' + summary + '</div>' + table;
}

/* ---------------- catalog import / export / add ---------------- */
function exportCatalogJson() {
  download('catalog.json', JSON.stringify({ columns: DB.columns, catalog: DB.catalog }, null, 2), 'application/json');
}
function exportCatalogCsv() {
  const head = DB.columns.map(c => c.label);
  const rows = [head].concat(DB.catalog.map(c => c.v));
  const csv = '\ufeff' + rows.map(r => r.map(csvCell).join(';')).join('\r\n');
  download('catalog.csv', csv, 'text/csv;charset=utf-8');
}
function importCatalogFile(input) {
  const f = input.files && input.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const j = JSON.parse(r.result);
      if (j.catalog && j.columns && Array.isArray(j.catalog)) { DB.catalog = j.catalog; DB.columns = j.columns; }
      else if (Array.isArray(j)) { DB.catalog = j; }
      else throw new Error('нет поля catalog');
      scheduleSave(); initFilters(); renderCatalog();
      alert('Импортировано кейсов: ' + DB.catalog.length);
    } catch (e) { alert('Ошибка чтения файла: ' + e.message); }
    input.value = '';
  };
  r.readAsText(f, 'utf-8');
}
function addCaseModal() {
  const groups = {}; DB.columns.forEach(col => { (groups[col.group] = groups[col.group] || []).push(col); });
  const html = GROUP_ORDER.filter(g => groups[g]).map(g =>
    '<div class="case-group"><h4>' + esc(GROUP_TITLES[g] || g) + '</h4><table>' +
    groups[g].filter(col => col.k !== 'c1').map(col => '<tr><td>' + esc(col.label) + '</td><td><input data-col="' + col.k + '" value=""></td></tr>').join('') +
    '</table></div>').join('');
  openModal('Новый кейс', '<div class="case-groups">' + html + '</div><div style="margin-top:16px;text-align:right"><button class="btn primary" onclick="saveNewCase()">Создать кейс</button></div>');
}
function saveNewCase() {
  const v = DB.columns.map(() => '');
  document.querySelectorAll('#modalHost input[data-col]').forEach(inp => {
    const idx = DB.columns.findIndex(c => c.k === inp.dataset.col);
    if (idx >= 0) v[idx] = inp.value.trim();
  });
  const numIdx = DB.columns.findIndex(c => c.label === '№ кейса');
  let num = parseInt(v[numIdx], 10);
  if (!num) { num = DB.catalog.reduce((m, c) => Math.max(m, c.num), 0) + 1; v[numIdx] = String(num); }
  if (DB.catalog.find(c => c.num === num)) { if (!confirm('Кейс №' + num + ' уже существует. Добавить всё равно?')) return; }
  DB.catalog.push({ id: 'case-' + num + '-' + Math.random().toString(36).slice(2, 5), num: num, v: v });
  scheduleSave(); closeModal(); initFilters(); renderCatalog();
}

/* ---------------- case modal ---------------- */
function showCase(id) {
  const c = caseById(id); if (!c) return;
  const groups = {}; DB.columns.forEach(col => { (groups[col.group] = groups[col.group] || []).push(col); });
  const html = GROUP_ORDER.filter(g => groups[g]).map(g => {
    const rows = groups[g].map(col => {
      const v = c.v[DB.columns.indexOf(col)] || '';
      if (col.k === 'c1') return '';
      return '<tr><td>' + esc(col.label) + '</td><td>' + (esc(v) || '<span class="co">—</span>') + '</td></tr>';
    }).join('');
    return '<div class="case-group"><h4>' + esc(GROUP_TITLES[g] || g) + '</h4><table>' + rows + '</table></div>';
  }).join('');
  openModal('Кейс №' + c.num + ' · ' + esc(val(c, 'Страна')), '<div class="case-groups">' + html + '</div>');
}
function openModal(title, bodyHtml) {
  el('modalHost').innerHTML = '<div class="modal" onclick="if(event.target===this)closeModal()">' +
    '<div class="modal-box"><div class="modal-head"><div class="modal-title">' + title + '</div>' +
    '<button class="modal-close" onclick="closeModal()">✕</button></div>' +
    '<div class="modal-body">' + bodyHtml + '</div></div></div>';
  document.body.style.overflow = 'hidden';
}
function closeModal() { el('modalHost').innerHTML = ''; document.body.style.overflow = ''; }

/* ---------------- export plan ---------------- */
function planRows(p) {
  const head = ['№ кейса', 'Приоритет', 'Статус кейса', 'Страна', 'Отгрузка', 'Тип оплаты', 'Валюта оплаты', 'Завод', 'Комплектование', 'Описание', 'Ответственный', 'Результат', 'Среда', '№ заказа (факт)', 'Ожидаемый результат', 'Фактический результат', 'Комментарий', 'Доп. параметры'];
  const rows = [head];
  (p.items || []).forEach(it => {
    const c = caseById(it.caseId); if (!c) return;
    const pr = it.params || {};
    const extra = (pr.custom || []).filter(kv => kv.name || kv.value).map(kv => (kv.name || '') + '=' + (kv.value || '')).join('; ');
    rows.push([c.num, val(c, 'Приоритет'), val(c, 'Статус'), val(c, 'Страна'), val(c, 'Условие отгрузки'), val(c, 'Тип оплаты'), val(c, 'Валюта оплаты'), val(c, 'Завод'), val(c, 'Тип комплектования'), val(c, 'Описание (доп. условия)'), it.assignee || '', resultInfo(it.result || '').label, pr.env || '', pr.orderNo || '', pr.expected || '', pr.actual || '', pr.comment || '', extra]);
  });
  return rows;
}
function csvCell(v) { v = String(v == null ? '' : v); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
function download(name, content, type) {
  const blob = new Blob([content], { type: type || 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function exportPlanCsv() {
  const p = planById(currentPlanId); if (!p) return;
  const csv = '\ufeff' + planRows(p).map(r => r.map(csvCell).join(';')).join('\r\n');
  download('plan-' + (p.name || 'export').replace(/[^\wа-яё\-]+/gi, '_') + '.csv', csv, 'text/csv;charset=utf-8');
}
function exportPlanJson() {
  const p = planById(currentPlanId); if (!p) return;
  download('plan-' + p.id + '.json', JSON.stringify(p, null, 2), 'application/json');
}

/* ---------------- init ---------------- */
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  setStatus('Загрузка…', 'pending');
  loadDB().then(() => {
    initFilters();
    initBulkResult();
    refreshPlanSelect();
    refreshReleaseFilter();
    updatePlansPill();
    renderCatalog();
    renderPlans();
    setStatus('Готово', 'ok');
  }).catch(e => { setStatus('Нет связи с базой', 'err'); console.error(e); });
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
