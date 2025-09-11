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

function rcToPx(row, col, w){
  const rect = gridEl.getBoundingClientRect();
  const styles = getComputedStyle(gridEl);
  const gap = parseFloat(styles.gap) || 6;
  const pad = 8;

  const labelW = 40;
  const innerW = rect.width - pad*2 - gap*(COLS+2) - labelW; // gaps + label
  const innerH = rect.height - pad*2 - gap*(ROWS+1);

  const cw = innerW / COLS;
  const ch = innerH / ROWS;

  const left = rect.left + pad + gap + labelW + gap + col * (cw + gap);
  const top  = rect.top  + pad + gap + row * (ch + gap);

  const width = w * cw + (w-1)*gap;
  const height = ch;

  return { left, top, width, height };
}

function canPlace(tabIndex, tank, excludeId=null){
  if(tank.row < 0 || tank.row >= ROWS) return false;
  if(tank.col < 0) return false;
  if(tank.col + tank.w > COLS) return false;

  for(const t of racks[tabIndex].tanks){
    if(t.id === excludeId) continue;
    if(t.row !== tank.row) continue; // mesma linha
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
  document.querySelectorAll('.tank').forEach(n=>n.remove());
  const tanks = racks[activeTab].tanks;
  for(const t of tanks){
    const div = document.createElement('div');
    div.className = 'tank';
    div.dataset.id = t.id;
    div.dataset.size = String(t.w);
    if(t.color) div.style.backgroundColor = t.color;

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

    div.addEventListener('mousedown', onDragStart);
    div.addEventListener('touchstart', onDragStart, {passive:false});
    div.addEventListener('click', e => { if(!dragMoved) openEditor(t.id); });
    div.addEventListener('dblclick', e => openEditor(t.id));

    document.body.appendChild(div);
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
    addTankAt(Number(s.dataset.row), Number(s.dataset.col));
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

  const x = ('touches' in ev ? ev.touches[0].clientX : ev.clientX) - drag.offX;
  const y = ('touches' in ev ? ev.touches[0].clientY : ev.clientY) - drag.offY;

  let bestRow = t.row, bestCol = t.col, bestOk = false;

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

  const elTank = document.querySelector(`.tank[data-id="${t.id}"]`);
  if(bestOk){
    const {left, top, width, height} = rcToPx(bestRow, bestCol, t.w);
    elTank.classList.remove('ghost');
    Object.assign(elTank.style, { left:left+'px', top:top+'px', width:width+'px', height:height+'px' });
    drag.ok = true; drag.row = bestRow; drag.col = bestCol;
  }else{
    elTank.classList.add('ghost');
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

// Baixar .json (para subir manualmente em versions/)
document.getElementById('downloadBtn').addEventListener('click', ()=>{
  const stamp = new Date().toISOString().replace(/[:T]/g,'-').split('.')[0]; // 2025-09-11-14-35-22
  const fname = `rack-${stamp}.json`;
  const blob = new Blob([JSON.stringify({racks}, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fname;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
});

// ---------- GitHub: preferências (user/repo/branch/token) ----------
const ghUserEl = document.getElementById('ghUser');
const ghRepoEl = document.getElementById('ghRepo');
const ghBranchEl = document.getElementById('ghBranch');
const ghTokenEl = document.getElementById('ghToken');
const rememberEl = document.getElementById('rememberToken');

ghUserEl.value   = localStorage.getItem('gh_user')   || ghUserEl.value || '';
ghRepoEl.value   = localStorage.getItem('gh_repo')   || ghRepoEl.value || '';
ghBranchEl.value = localStorage.getItem('gh_branch') || ghBranchEl.value || 'main';
if(localStorage.getItem('gh_token')){
  ghTokenEl.value = localStorage.getItem('gh_token');
  rememberEl.checked = true;
}
[ghUserEl, ghRepoEl, ghBranchEl].forEach(el=>{
  el.addEventListener('change', ()=>{
    localStorage.setItem('gh_user', ghUserEl.value.trim());
    localStorage.setItem('gh_repo', ghRepoEl.value.trim());
    localStorage.setItem('gh_branch', ghBranchEl.value.trim());
  });
});
rememberEl.addEventListener('change', ()=>{
  if(rememberEl.checked){
    localStorage.setItem('gh_token', ghTokenEl.value);
  }else{
    localStorage.removeItem('gh_token');
  }
});
ghTokenEl.addEventListener('input', ()=>{
  if(rememberEl.checked){
    localStorage.setItem('gh_token', ghTokenEl.value);
  }
});

// ---------- GitHub: LISTAR versões (público) ----------
async function ghListVersions() {
  const user   = ghUserEl.value.trim();
  const repo   = ghRepoEl.value.trim();
  const branch = ghBranchEl.value.trim() || 'main';
  if(!user || !repo){ alert('Preencha GitHub user e Repositório.'); return; }

  const sel = document.getElementById('ghSelect');
  sel.innerHTML = '';
  const url = `https://api.github.com/repos/${user}/${repo}/contents/versions?ref=${encodeURIComponent(branch)}`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Falha ao listar versões');
    const data = await res.json();
    const files = (Array.isArray(data) ? data : [])
      .filter(f => f.type === 'file' && f.name.endsWith('.json'))
      .sort((a,b) => b.name.localeCompare(a.name)); // por nome (timestamp desc)

    if (!files.length) {
      const opt = document.createElement('option');
      opt.textContent = 'Nenhum arquivo .json em versions/';
      opt.disabled = true; opt.selected = true;
      sel.appendChild(opt);
      return;
    }
    files.forEach(f => {
      const opt = document.createElement('option');
      opt.value = f.name;
      opt.textContent = f.name;
      sel.appendChild(opt);
    });
    alert('Versões do GitHub carregadas!');
  } catch (e) {
    console.error(e);
    alert('Erro ao listar versões do GitHub.\nVerifique user/repo/branch e se a pasta versions existe.');
  }
}
document.getElementById('ghListBtn').addEventListener('click', ghListVersions);

// ---------- GitHub: CARREGAR versão selecionada (público) ----------
async function ghLoadSelected() {
  const user   = ghUserEl.value.trim();
  const repo   = ghRepoEl.value.trim();
  const branch = ghBranchEl.value.trim() || 'main';
  const sel = document.getElementById('ghSelect');
  const fname = sel.value;
  if (!user || !repo){ alert('Preencha GitHub user e Repositório.'); return; }
  if (!fname || fname.includes('Nenhum')) { alert('Selecione uma versão válida.'); return; }

  const rawUrl = `https://raw.githubusercontent.com/${user}/${repo}/${encodeURIComponent(branch)}/versions/${fname}`;
  try {
    const res = await fetch(rawUrl, { cache: 'no-store' });
    if (!res.ok) throw new Error('Falha ao baixar JSON');
    const data = await res.json();
    if (!Array.isArray(data?.racks)) { alert('JSON inválido.'); return; }
    racks = data.racks;
    activeTab = 0;
    document.getElementById('rackSelect').value = '0';
    save(); renderTabs(); renderGrid();
    alert(`Carregado: ${fname}`);
  } catch (e) {
    console.error(e);
    alert('Erro ao carregar a versão selecionada do GitHub.');
  }
}
document.getElementById('ghLoadBtn').addEventListener('click', ghLoadSelected);

// ---------- GitHub: CRIAR nova versão (requer PAT) ----------
function timestampName(){
  const s = new Date().toISOString().replace(/[:T]/g,'-').split('.')[0];
  return `rack-${s}.json`; // ex: rack-2025-09-11-15-02-33.json
}
async function ghCreateVersionFile(){
  const user   = ghUserEl.value.trim();
  const repo   = ghRepoEl.value.trim();
  const branch = ghBranchEl.value.trim() || 'main';
  const token  = ghTokenEl.value.trim();

  if(!user || !repo || !branch){ alert('Preencha user/repo/branch.'); return; }
  if(!token){ alert('Cole o seu token (PAT).'); return; }

  const json = JSON.stringify({ racks }, null, 2);
  const contentB64 = btoa(unescape(encodeURIComponent(json))); // base64 seguro para UTF-8
  const path = `versions/${timestampName()}`;

  const url = `https://api.github.com/repos/${encodeURIComponent(user)}/${encodeURIComponent(repo)}/contents/${encodeURIComponent(path)}`;
  const body = {
    message: `feat: add version via site (${path})`,
    content: contentB64,
    branch
  };

  try{
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json'
      },
      body: JSON.stringify(body)
    });
    if(!res.ok){
      const t = await res.text();
      console.error('GitHub error:', t);
      alert('Falha ao salvar no GitHub. Verifique token/permissões/branch.\nDetalhes no console.');
      return;
    }
    const data = await res.json();
    alert(`Versão criada!\n${data.content.path}`);
    if(typeof ghListVersions === 'function') ghListVersions();
  }catch(e){
    console.error(e);
    alert('Erro de rede ao salvar no GitHub.');
  }
}
document.getElementById('ghSaveNewBtn').addEventListener('click', ghCreateVersionFile);

// ---------- Init ----------
load();
renderTabs();
$('#rackSelect').value = String(activeTab);
window.addEventListener('resize', renderGrid);
renderGrid();
