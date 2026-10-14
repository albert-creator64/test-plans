const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');
const DEFAULT_SHEET = 'https://docs.google.com/spreadsheets/d/1ic_aTNK37zygQxjcibkWMqjuUcEg_eT-FcnngiOEIWc/export?format=csv&gid=2131954568';

const COL_GROUPS = [
  ['main', 'Приоритет'], ['main', '№ кейса'], ['main', 'Статус'],
  ['checks', 'проверка ОД'], ['checks', 'проверка ИМ'], ['checks', 'проверка FI'], ['checks', 'проверка BW'],
  ['main', 'Страна'], ['main', 'Описание (доп. условия)'], ['main', 'Блокирующее замечание'],
  ['logistics', 'Завод'], ['logistics', '№ заказа/чека'], ['logistics', 'Условие отгрузки'],
  ['goods', 'IN+'], ['goods', 'Собственный товар'], ['goods', 'Товар МП'], ['goods', 'Товары 1ТНП'], ['goods', 'Локальная уценка'],
  ['payment', 'Тип оплаты'], ['payment', 'Валюта оплаты'],
  ['logistics', 'Тип комплектования'], ['logistics', 'Коробка вскрыта при приёмке'], ['logistics', 'Тип выдачи'],
  ['logistics', 'Добавить пакет'], ['logistics', 'Коробка вскрыта на кассе'], ['logistics', 'Выдача через MIZ'],
  ['ret_dvd', 'Возврат ДвД'], ['ret_dvd', 'Локальная уценка'], ['ret_dvd', 'Брак'], ['ret_dvd', 'Качественный'], ['ret_dvd', '№ заказа/чека'],
  ['ret_cour', 'Возврат от курьера'], ['ret_cour', 'Качественный'], ['ret_cour', 'Брак'], ['ret_cour', 'Недостача'], ['ret_cour', '№ заказа/поставки'],
  ['ret_notdvd', 'Возврат не ДвД'], ['ret_notdvd', 'Возврат на ВК'], ['ret_notdvd', 'Локальная уценка'], ['ret_notdvd', 'Брак'], ['ret_notdvd', 'Качественный'], ['ret_notdvd', '№ заказа'],
  ['exchange', 'Проведение ВП (обмена)'], ['exchange', 'Локальная уценка'], ['exchange', 'Брак'], ['exchange', 'Качественный'], ['exchange', '№ заказа'],
  ['reports', 'Отчёт Агента ТК'], ['reports', '№ IDOC'], ['reports', 'Претензия'], ['reports', '№ заказа'], ['reports', 'Отчёт Агента МП'],
  ['meta', 'Актуальность сценария'], ['meta', 'Комментарий'], ['meta', 'К кому придти за актуализацией'], ['meta', 'Автоматизирован (имя варианта)'], ['meta', 'Статус автоматизации']
];

function parseCSV(text) {
  const rows = [];
  let row = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else {
      if (c === '"') q = true;
      else if (c === ',') { row.push(cur); cur = ''; }
      else if (c === '\n') { row.push(cur); cur = ''; rows.push(row); row = []; }
      else if (c === '\r') { /* skip */ }
      else cur += c;
    }
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
function trim(v) { return (v == null ? '' : String(v)).trim(); }

async function main() {
  const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  db.meta = db.meta || {};
  const url = db.meta.sheetCsv || DEFAULT_SHEET;

  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error('fetch sheet ' + res.status);
  const raw = await res.text();
  const rows = parseCSV(raw);
  const header = rows[1];
  if (!header) throw new Error('no header row');
  const ncol = header.length;

  const columns = COL_GROUPS.map(([group, label], i) => ({ k: 'c' + i, group, label }));

  const prevSteps = {};
  (db.catalog || []).forEach(c => { if (c.steps && c.steps.length) prevSteps[c.num] = c.steps; });

  const catalog = [];
  for (let r = 2; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length < 3) continue;
    const num = trim(row[1]);
    if (!/^\d+$/.test(num)) continue;
    const v = [];
    for (let i = 0; i < ncol; i++) v.push(trim(row[i]));
    const n = parseInt(num, 10);
    const c = { id: 'case-' + n, num: n, v };
    if (prevSteps[n]) c.steps = prevSteps[n];
    catalog.push(c);
  }

  db.columns = columns;
  db.catalog = catalog;
  db.meta.sheetCsv = url;
  db.meta.updated = new Date().toISOString();

  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2) + '\n', 'utf8');
  console.log('Synchronized: ' + catalog.length + ' cases, ' + columns.length + ' columns');
}

main().catch(e => { console.error(e); process.exit(1); });
