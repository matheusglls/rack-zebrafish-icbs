// ---------- Estado ----------
const STATE_KEY = 'zebraRacks_5x10_v1';
// 3 racks, cada um: 5 linhas (A–E), 10 colunas; tanques ocupam 1 linha x (1|2|7) colunas
let racks = [
  { tanks: [] }, { tanks: [] }, { tanks: [] }
];
let activeTab = 0;        // 0,1,2
let placingSize = 1;      // 1,2,7
let drag = null;          // {id, startX, startY, offX, offY}
let dragMoved = false;
let editingId = null;

const ROWS = 5;           // A..E
const COLS = 10;          // 10 slots por nível

// ---------- Util ----------
const $ = s => document.querySelector(s);
const gridEl = $('#rackGrid');

function save(){ localStorage.setItem(STATE_KEY, JSON.stringify({racks, activeTab})); }
function load(){
  try{
    const data = JSON.parse(localStorage.getItem(STATE_KEY));
    if(data?.racks?.length===3){ racks = data.racks; }
    if(Number.isInteger(data?.activeTab)) activeTab = data.activeTab;
  }catch(_){}
}

function uid(){ return Math.random().toString(36).slice(2,9); }
function rowIndexToLabel(r){ return ['A','B','C','D','E'][r] }

// posição absoluta → cell size
function cellSizePx(){
  const rect = gridEl.getBoundingClientRect();
  // grid real: 11 colunas (1 label + 10 slots). Tanks ficam nas 10 slots (colunas 2..11)
  const totalCols = COLS + 1;
  const gap = 6;
  const pad = 8;
  const innerW = rect.width - pad*2 - gap*(totalCols+1);
  const innerH = rect.height - pad*2 - gap*(ROWS+1);

  const cw = innerW / COLS;
  const ch = innerH / ROWS;
  const originX = rect.left + pad + gap + cw + gap; // col label + gap já somados → na verdade, melhor calcular offset de coluna 2
  // corrigindo: col1=label, col2 primeiro slot. A borda esquerda é rect.left+pad+gap.
  const left0 = rect.left + pad + gap; // início da coluna 1 (label)
  const cw_all = innerW * (COLS/(COLS)) / COLS; // simplificado
  const col1_width = cw; // slots e label têm larguras diferentes; simplificar usando cálculo direto via CSS é mais seguro.
  // Em vez de confiar nisso, vamos posicionar usando grid → via transformação de col/row para px:
  return { cw, ch, rect };
}

// auxílio: converte (row 0..4, col 0..9) em left/top/width/height (px)
function rcToPx(row, col, w){
  const rect = gridEl.getBoundingClientRect();
  const styles = getComputedStyle(gridEl);
  const gap = parseFloat(styles.gap) || 6;
  const pad = 8;

  // largura total disponível para as 11 colunas (1 label + 10 slots)
  const totalCols = COLS + 1;
  const totalRows = ROWS;

  const innerW = rect.width - pad*2 - gap*(totalCols+1);
  const innerH = rect.height - pad*2 - gap*(totalRows+1);

  // col label ocupa mesma fração que um slot? No CSS definimos col1 = 40px e os slots = 1fr.
  const labelW = 40;
  const slotsW = innerW - (labelW - (innerW/(COLS+1))); // pequena correção para o cálculo do gap; manter simples
  const cw = (rect.width - pad*2 - gap*(COLS+1) - labelW) / COLS;
  const ch = innerH / ROWS;

  const left = rect.left + pad + gap + labelW + gap + col * (cw + gap);
  const top  = rect.top  + pad + gap + row * (ch + gap);

  const width = w * cw + (w-1)*gap;
  const height = ch;

  return { left, top, width, height };
}

function canPlace(tabIndex, tank, excludeId=null){
  // tank: {row, col, w}
  // limites horizontais na mesma linha
  if(tank.row < 0 || tank.row >= ROWS) return false;
  if(tank.col < 0) return false;
  if(tank.col + tank.w > COLS) return false;

  for(const t of racks[tabIndex].tanks){
    if(t.id === excludeId) continue;
    if(t.row !== tank.row) continue; // só colide se está na mesma linha
    // colisão 1D no eixo X
    const sep = (tank.col + tank.w <= t.col) || (t.col + t.w <= tank.col);
    if(!sep) return false;
  }
  return true;
}

// ---------- Render ----------
function renderTabs(){
  document.querySelectorAll('.tab').forEach(b=>{
    const i = Number(b.dataset.tab);
    b.classList.toggle('active', i===activeTab);
    b.setAttribute('aria-selected', i===activeTab?'true':'false');
  });
}

function renderGrid(){
  // remove tanques visuais existentes
  document.querySelectorAll('.tank').forEach(n=>n.remove());

  const tanks = racks[activeTab].tanks;
  for(const t of tanks){
    const div = document.createElement('div');
    div.className = 'tank';
    div.dataset.id = t.id;
    div.dataset.size = String(t.w);
    if(t.color) div.style.backgroundColor = t.color;

    // posicionar
    const {left, top, width, height} = rcToPx(t.row, t.col, t.w);
    Object.assign(div.style, {
      left: left + 'px', top: top + 'px', width: width + 'px', height: height + 'px'
    });

    div.innerHTML = `
      <div class="meta">
        <div><b>${t.label||`${rowIndexToLabel(t.row)}${t.col+1}`}</b></div>
        <div style="font-size:11px;opacity:.85">${t.linhagem||'-'} • ${t.n??'-'} peixes</div>
      </div>
      <div class="badge">${t.w}x</div>
    `;

    // eventos
    div.addEventListener('mousedown', onDragStart);
    div.addEventListener('touchstart', onDragStart, {passive:false});
    div.addEventListener('click', e => { if(!dragMoved) openEditor(t.id); });
    div.addEventListener('dblclick', e => openEditor(t.id));

    document.body.appendChild(div); // absoluto relativo à viewport; usamos px calculado
  }
}

// ---------- Adição por clique ----------
function addTankAt(row, col){
  const w = placingSize; // 1,2,7
  const tank = {
    id: uid(),
    row, col, w,
    label:'', linhagem:'', idade:null, n:null, notas:'', status:'ok', color:''
  };
  if(!canPlace(activeTab, tank)) return false;
  racks[activeTab].tanks.push(tank);
  save(); renderGrid();
  return true;
}

document.querySelectorAll('.slot').forEach(s=>{
  s.addEventListener('click', ()=>{
    const row = Number(s.dataset.row);
    const col = Number(s.dataset.col);
    addTankAt(row, col);
  });
});

// ---------- Drag & Drop ----------
function onDragStart(ev){
  ev.preventDefault();
  dragMoved = false;

  const target = ev.currentTarget;
  const id = target.dataset.id;
  let startX = ('touches' in ev ? ev.touches[0].clientX : ev.clientX);
  let startY = ('touches' in ev ? ev.touches[0].clientY : ev.clientY);
  const rect = target.getBoundingClientRect();
  const offX = startX - rect.left;
  const offY = startY - rect.top;

  drag = { id, offX, offY, startX, startY };
  document.addEventListener('mousemove', onDragMove);
  document.addEventListener('mouseup', onDragEnd);
  document.addEventListener('touchmove', onDragMove, {passive:false});
  document.addEventListener('touchend', onDragEnd);
}

function onDragMove(ev){
  ev.preventDefault();
  if(!drag) return;
  dragMoved = true;

  const t = racks[activeTab].tanks.find(x=>x.id===drag.id);
  if(!t) return;

  // posição do ponteiro
  const x = ('touches' in ev ? ev.touches[0].clientX : ev.clientX) - drag.offX;
  const y = ('touches' in ev ? ev.touches[0].clientY : ev.clientY) - drag.offY;

  // converter px → célula mais próxima
  // para simplificar, vamos testar col/row por aproximação usando rcToPx inverso
  let bestRow = t.row, bestCol = t.col, bestOk = false;

  // varremos linhas 0..4 e colunas 0..(COLS - t.w)
  for(let r=0;r<ROWS;r++){
    for(let c=0;c<=COLS - t.w;c++){
      const box = rcToPx(r,c,t.w);
      const inside = (x >= box.left-12 && x <= box.left+box.width+12 &&
                      y >= box.top-12  && y <= box.top+box.height+12);
      if(inside){
        const can = canPlace(activeTab, {row:r,col:c,w:t.w}, t.id);
        if(can){ bestRow = r; bestCol = c; bestOk = true; break; }
      }
    }
    if(bestOk) break;
  }

  // feedback visual
  const elTank = document.querySelector(`.tank[data-id="${t.id}"]`);
  if(bestOk){
    const {left, top, width, height} = rcToPx(bestRow, bestCol, t.w);
    elTank.classList.remove('ghost');
    Object.assign(elTank.style, { left:left+'px', top:top+'px', width:width+'px', height:height+'px' });
    drag.ok = true; drag.row = bestRow; drag.col = bestCol;
  }else{
    elTank.classList.add('ghost');
    // move “livre”, mas com ghost
    elTank.style.left = x + 'px';
    elTank.style.top  = y + 'px';
  }
}

function onDragEnd(){
  if(!drag) return;
  const t = racks[activeTab].tanks.find(x=>x.id===drag.id);
  const elTank = document.querySelector(`.tank[data-id="${t.id}"]`);
  if(drag.ok){
    t.row = drag.row; t.col = drag.col; save();
  }
  elTank?.classList.remove('ghost');
  drag = null;
  document.removeEventListener('mousemove', onDragMove);
  document.removeEventListener('mouseup', onDragEnd);
  document.removeEventListener('touchmove', onDragMove);
  document.removeEventListener('touchend', onDragEnd);
}

// ---------- Editor ----------
function openEditor(id){
  editingId = id;
  const t = racks[activeTab].tanks.find(x=>x.id===id);
  if(!t) return;
  $('#f_label').value = t.label || '';
  $('#f_linhagem').value = t.linhagem || '';
  $('#f_idade').value = t.idade ?? '';
  $('#f_n').value = t.n ?? '';
  $('#f_notas').value = t.notas || '';
  $('#f_status').value = t.status || 'ok';
  $('#f_cor').value = t.color || '#1f6feb';
  $('#modal').classList.add('open');
  $('#modal').setAttribute('aria-hidden','false');
}
function closeEditor(saveIt=true){
  const t = racks[activeTab].tanks.find(x=>x.id===editingId);
  if(t && saveIt){
    t.label = $('#f_label').value.trim();
    t.linhagem = $('#f_linhagem').value.trim();
    t.idade = Number($('#f_idade').value)||null;
    t.n = Number($('#f_n').value)||null;
    t.notas = $('#f_notas').value.trim();
    t.status = $('#f_status').value;
    t.color = $('#f_cor').value;
  }
  editingId = null;
  $('#modal').classList.remove('open');
  $('#modal').setAttribute('aria-hidden','true');
  save(); renderGrid();
}
$('#closeBtn').addEventListener('click', ()=>closeEditor(true));
$('#modal').addEventListener('click', e=>{ if(e.target===e.currentTarget) closeEditor(false); });
$('#deleteBtn').addEventListener('click', ()=>{
  if(!editingId) return;
  racks[activeTab].tanks = racks[activeTab].tanks.filter(x=>x.id!==editingId);
  closeEditor(false); save(); renderGrid();
});

// ---------- Controles ----------
document.querySelectorAll('.tab').forEach(t=>{
  t.addEventListener('click', ()=>{
    activeTab = Number(t.dataset.tab);
    $('#rackSelect').value = String(activeTab);
    save(); renderTabs(); renderGrid();
  });
});
$('#rackSelect').addEventListener('change', e=>{
  activeTab = Number(e.target.value);
  document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active', Number(b.dataset.tab)===activeTab));
  save(); renderGrid();
});

$('#size').addEventListener('change', e=> placingSize = Number(e.target.value));

$('#exportBtn').addEventListener('click', ()=>{
  $('#jsonArea').value = JSON.stringify({racks}, null, 2);
});
$('#importBtn').addEventListener('click', ()=>{
  try{
    const data = JSON.parse($('#jsonArea').value);
    if(data && Array.isArray(data.racks) && data.racks.length===3){
      racks = data.racks; activeTab = 0;
      $('#rackSelect').value = '0';
      save(); renderTabs(); renderGrid();
      alert('Importado com sucesso!');
    }else{
      alert('JSON inválido.');
    }
  }catch(e){ alert('Erro ao ler JSON.'); }
});
$('#resetBtn').addEventListener('click', ()=>{
  if(confirm('Tem certeza que deseja apagar tudo?')){
    racks = [{tanks:[]},{tanks:[]},{tanks:[]}];
    activeTab = 0;
    save(); renderTabs(); renderGrid();
  }
});

// ---------- Init ----------
load();
renderTabs();
$('#rackSelect').value = String(activeTab);
window.addEventListener('resize', renderGrid);
renderGrid();
