// ======= CONFIGURE AQUI =======
const WORKER_URL = 'https://rack-saver.matheusgallasl.workers.dev';
// ==============================

const STATE_KEY = 'zebraRacks_custom_v2';
let racks = [{ tanks: [] }, { tanks: [] }, { tanks: [] }];
let activeTab = 0;
let placingSize = 1;
let drag = null;
let dragMoved = false;
let editingId = null;

const ROWS = 5; // A..E

const $ = s => document.querySelector(s);
const gridEl = $('#rackGrid');

function colsFor(tabIndex, rowIndex) {
  if (tabIndex === 1 && rowIndex === 0) return 15; // Rack 2, linha A
  return 10;
}

function save() {
  localStorage.setItem(STATE_KEY, JSON.stringify({ racks, activeTab }));
}
function load() {
  try {
    const data = JSON.parse(localStorage.getItem(STATE_KEY));
    if (data?.racks?.length === 3) racks = data.racks;
    if (Number.isInteger(data?.activeTab)) activeTab = data.activeTab;
  } catch (_) {}
}
function uid() {
  return Math.random().toString(36).slice(2, 9);
}
function rowIndexToLabel(r) {
  return ['A', 'B', 'C', 'D', 'E'][r];
}

function rcToPx(row, col, w) {
  const rect = gridEl.getBoundingClientRect();
  const styles = getComputedStyle(gridEl);
  const gap = parseFloat(styles.gap) || 6;
  const pad = 8;

  const labelW = 40;
  const cols = colsFor(activeTab, row);
  const innerW = rect.width - pad * 2 - gap * (cols + 2) - labelW;
  const innerH = rect.height - pad * 2 - gap * (ROWS + 1);

  const cw = innerW / cols;
  const ch = innerH / ROWS;

  const left = rect.left + pad + gap + labelW + gap + col * (cw + gap);
  const top = rect.top + pad + gap + row * (ch + gap);

  const width = w * cw + (w - 1) * gap;
  const height = ch;

  return { left, top, width, height };
}

function canPlace(tabIndex, tank, excludeId = null) {
  const cols = colsFor(tabIndex, tank.row);
  if (tank.row < 0 || tank.row >= ROWS) return false;
  if (tank.col < 0) return false;
  if (tank.col + tank.w > cols) return false;
  for (const t of racks[tabIndex].tanks) {
    if (t.id === excludeId) continue;
    if (t.row !== tank.row) continue;
    const sep = tank.col + tank.w <= t.col || t.col + t.w <= tank.col;
    if (!sep) return false;
  }
  return true;
}

function renderTabs() {
  document.querySelectorAll('.tab').forEach(b => {
    const i = Number(b.dataset.tab);
    b.classList.toggle('active', i === activeTab);
    b.setAttribute('aria-selected', i === activeTab ? 'true' : 'false');
  });
}
function renderGrid() {
  gridEl.innerHTML = '';
  for (let r = 0; r < ROWS; r++) {
    const cols = colsFor(activeTab, r);

    const label = document.createElement('div');
    label.className = 'rowLabel';
    label.textContent = rowIndexToLabel(r);
    label.style.gridRow = r + 1;
    label.style.gridColumn = 1;
    gridEl.appendChild(label);

    for (let c = 0; c < cols; c++) {
      const div = document.createElement('div');
      div.className = 'slot';
      div.dataset.row = r;
      div.dataset.col = c;
      div.style.gridRow = r + 1;
      div.style.gridColumn = c + 2;
      div.addEventListener('click', () =>
        addTankAt(Number(div.dataset.row), Number(div.dataset.col))
      );
      gridEl.appendChild(div);
    }
  }

  document.querySelectorAll('.tank').forEach(n => n.remove());
  const tanks = racks[activeTab].tanks;
  for (const t of tanks) {
    const div = document.createElement('div');
    div.className = 'tank';
    div.dataset.id = t.id;
    div.dataset.size = String(t.w);
    if (t.color) div.style.backgroundColor = t.color;

    const { left, top, width, height } = rcToPx(t.row, t.col, t.w);
    Object.assign(div.style, {
      left: left + 'px',
      top: top + 'px',
      width: width + 'px',
      height: height + 'px'
    });

    div.innerHTML = `
      <div class="meta">
        <div><b>${t.label || `${rowIndexToLabel(t.row)}${t.col + 1}`}</b></div>
        <div style="font-size:11px;opacity:.85">${t.linhagem || '-'} • ${
      t.n ?? '-'
    } peixes</div>
      </div>
      <div class="badge">${t.w}x</div>
    `;

    div.addEventListener('mousedown', onDragStart);
    div.addEventListener('touchstart', onDragStart, { passive: false });
    div.addEventListener('click', e => {
      if (!dragMoved) openEditor(t.id);
    });
    div.addEventListener('dblclick', e => openEditor(t.id));

    document.body.appendChild(div);
  }
}

function validSizes(tabIndex, rowIndex) {
  if (tabIndex === 1 && rowIndex === 0) return [1, 2];
  return [1, 2, 7];
}
function addTankAt(row, col) {
  const allowed = validSizes(activeTab, row);
  if (!allowed.includes(placingSize)) return false;
  const tank = {
    id: uid(),
    row,
    col,
    w: placingSize,
    label: '',
    linhagem: '',
    idade: null,
    n: null,
    notas: '',
    status: 'ok',
    color: ''
  };
  if (!canPlace(activeTab, tank)) return false;
  racks[activeTab].tanks.push(tank);
  save();
  renderGrid();
  return true;
}

// === Drag & Drop ===
function onDragStart(ev) {
  ev.preventDefault();
  dragMoved = false;

  const target = ev.currentTarget;
  const id = target.dataset.id;
  let startX = 'touches' in ev ? ev.touches[0].clientX : ev.clientX;
  let startY = 'touches' in ev ? ev.touches[0].clientY : ev.clientY;
  const rect = target.getBoundingClientRect();
  const offX = startX - rect.left;
  const offY = startY - rect.top;

  drag = { id, offX, offY, startX, startY };
  document.addEventListener('mousemove', onDragMove);
  document.addEventListener('mouseup', onDragEnd);
  document.addEventListener('touchmove', onDragMove, { passive: false });
  document.addEventListener('touchend', onDragEnd);
}
function onDragMove(ev) {
  ev.preventDefault();
  if (!drag) return;
  dragMoved = true;

  const t = racks[activeTab].tanks.find(x => x.id === drag.id);
  if (!t) return;

  const x =
    ('touches' in ev ? ev.touches[0].clientX : ev.clientX) - drag.offX;
  const y =
    ('touches' in ev ? ev.touches[0].clientY : ev.clientY) - drag.offY;

  let bestRow = t.row,
    bestCol = t.col,
    bestOk = false;

  const cols = colsFor(activeTab, t.row);
  for (let r = 0; r < ROWS; r++) {
    const colsR = colsFor(activeTab, r);
    for (let c = 0; c <= colsR - t.w; c++) {
      const box = rcToPx(r, c, t.w);
      const inside =
        x >= box.left - 12 &&
        x <= box.left + box.width + 12 &&
        y >= box.top - 12 &&
        y <= box.top + box.height + 12;
      if (inside) {
        const can = canPlace(activeTab, { row: r, col: c, w: t.w }, t.id);
        if (can) {
          bestRow = r;
          bestCol = c;
          bestOk = true;
          break;
        }
      }
    }
    if (bestOk) break;
  }

  const elTank = document.querySelector(`.tank[data-id="${t.id}"]`);
  if (bestOk) {
    const { left, top, width, height } = rcToPx(bestRow, bestCol, t.w);
    elTank.classList.remove('ghost');
    Object.assign(elTank.style, {
      left: left + 'px',
      top: top + 'px',
      width: width + 'px',
      height: height + 'px'
    });
    drag.ok = true;
    drag.row = bestRow;
    drag.col = bestCol;
  } else {
    elTank.classList.add('ghost');
    elTank.style.left = x + 'px';
    elTank.style.top = y + 'px';
  }
}
function onDragEnd() {
  if (!drag) return;
  const t = racks[activeTab].tanks.find(x => x.id === drag.id);
  const elTank = document.querySelector(`.tank[data-id="${t.id}"]`);
  if (drag.ok) {
    t.row = drag.row;
    t.col = drag.col;
    save();
  }
  elTank?.classList.remove('ghost');
  drag = null;
  document.removeEventListener('mousemove', onDragMove);
  document.removeEventListener('mouseup', onDragEnd);
  document.removeEventListener('touchmove', onDragMove);
  document.removeEventListener('touchend', onDragEnd);
}

// === Editor ===
function openEditor(id) {
  editingId = id;
  const t = racks[activeTab].tanks.find(x => x.id === id);
  if (!t) return;
  $('#f_label').value = t.label || '';
  $('#f_linhagem').value = t.linhagem || '';
  $('#f_idade').value = t.idade ?? '';
  $('#f_n').value = t.n ?? '';
  $('#f_notas').value = t.notas || '';
  $('#f_status').value = t.status || 'ok';
  $('#f_cor').value = t.color || '#1f6feb';
  $('#modal').classList.add('open');
  $('#modal').setAttribute('aria-hidden', 'false');
}
function closeEditor(saveIt = true) {
  const t = racks[activeTab].tanks.find(x => x.id === editingId);
  if (t && saveIt) {
    t.label = $('#f_label').value.trim();
    t.linhagem = $('#f_linhagem').value.trim();
    t.idade = Number($('#f_idade').value) || null;
    t.n = Number($('#f_n').value) || null;
    t.notas = $('#f_notas').value.trim();
    t.status = $('#f_status').value;
    t.color = $('#f_cor').value;
  }
  editingId = null;
  $('#modal').classList.remove('open');
  $('#modal').setAttribute('aria-hidden', 'true');
  save();
  renderGrid();
}
$('#closeBtn').addEventListener('click', () => closeEditor(true));
$('#modal').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeEditor(false);
});
$('#deleteBtn').addEventListener('click', () => {
  if (!editingId) return;
  racks[activeTab].tanks = racks[activeTab].tanks.filter(
    x => x.id !== editingId
  );
  closeEditor(false);
  save();
  renderGrid();
});

// === UI controles ===
document.querySelectorAll('.tab').forEach(t => {
  t.addEventListener('click', () => {
    activeTab = Number(t.dataset.tab);
    $('#rackSelect').value = String(activeTab);
    save();
    renderTabs();
    renderGrid();
  });
});
$('#rackSelect').addEventListener('change', e => {
  activeTab = Number(e.target.value);
  document
    .querySelectorAll('.tab')
    .forEach(b =>
      b.classList.toggle('active', Number(b.dataset.tab) === activeTab)
    );
  save();
  renderGrid();
});
$('#size').addEventListener('change', e => (placingSize = Number(e.target.value)));
$('#resetBtn').addEventListener('click', () => {
  if (confirm('Tem certeza que deseja apagar tudo?')) {
    racks = [{ tanks: [] }, { tanks: [] }, { tanks: [] }];
    activeTab = 0;
    save();
    renderTabs();
    renderGrid();
  }
});

// === Backend ===
async function autoLoadLatest() {
  try {
    const r = await fetch(`${WORKER_URL}/latest`);
    const j = await r.json();
    if (j?.ok && Array.isArray(j.data?.racks)) {
      racks = j.data.racks;
      activeTab = 0;
      document.getElementById('rackSelect').value = '0';
      save();
      renderTabs();
      renderGrid();
    }
  } catch (e) {
    console.warn('Auto-load falhou', e);
  }
}
async function saveWithPassword() {
  const password = document.getElementById('pwd').value.trim();
  if (!password) {
    alert('Digite a senha.');
    return;
  }
  try {
    const r = await fetch(`${WORKER_URL}/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, racks })
    });
    const j = await r.json();
    if (!r.ok || !j?.ok) {
      if (r.status === 401 || j?.error === 'unauthorized')
        alert('Senha incorreta.');
      else alert('Falha ao salvar. Veja console.');
      console.error('save error', r.status, j);
      return;
    }
    alert('Versão salva na nuvem!');
  } catch (e) {
    console.error(e);
    alert('Erro de rede ao salvar.');
  }
}
document.getElementById('saveBtn').addEventListener('click', saveWithPassword);

// === Init ===
load();
renderTabs();
document.getElementById('rackSelect').value = String(activeTab);
window.addEventListener('resize', renderGrid);
renderGrid();
autoLoadLatest();
