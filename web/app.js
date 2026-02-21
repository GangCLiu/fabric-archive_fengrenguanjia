const STORE_KEY = 'sewing_manager_full_v2';
const IMG_EMPTY = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='320' height='200'><rect fill='%23edf0f4' width='100%' height='100%'/><text x='50%' y='50%' fill='%23909aae' dominant-baseline='middle' text-anchor='middle'>无图片</text></svg>";

const pages = [
  ['home', '📦 布料列表'],
  ['garments', '👗 成衣列表'],
  ['patterns', '📄 纸样列表'],
  ['sizes', '📐 尺码档案'],
  ['backup', '💾 数据备份'],
];

const state = {
  page: 'home',
  view: { home: 'grid', patterns: 'grid' },
  search: { home: '', garments: '', patterns: '', sizes: '' },
  shopFilter: '全部',
  data: { fabrics: [], garments: [], patterns: [], sizes: [] },
};

const $ = (s) => document.querySelector(s);
const app = $('#app');

init();

function init() {
  load();
  renderNav();
  route(state.page);
}

function renderNav() {
  const nav = $('#navMenu');
  nav.innerHTML = '';
  pages.forEach(([id, label]) => {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.className = state.page === id ? 'active' : '';
    btn.onclick = () => route(id);
    nav.appendChild(btn);
  });
}

function route(id) {
  state.page = id;
  $('#pageTitle').textContent = pages.find((p) => p[0] === id)?.[1] || '';
  renderNav();
  ({ home: renderHome, garments: renderGarments, patterns: renderPatterns, sizes: renderSizes, backup: renderBackup }[id])();
}

function renderHome() {
  const fabrics = filteredFabrics();
  const shops = ['全部', ...new Set(state.data.fabrics.map((f) => f.shop).filter(Boolean))];
  if (!shops.includes(state.shopFilter)) state.shopFilter = '全部';

  app.innerHTML = `
  <section class="panel stats">${statsHTML()}</section>
  <section class="panel toolbar">
    <input id="searchHome" placeholder="🔍 输入名称或店铺..." value="${esc(state.search.home)}" />
    <select id="shopFilter">${shops.map((s) => `<option ${s===state.shopFilter?'selected':''}>${s}</option>`).join('')}</select>
    <select id="viewHome"><option value="grid" ${state.view.home==='grid'?'selected':''}>网格</option><option value="list" ${state.view.home==='list'?'selected':''}>列表</option></select>
    <button id="goAddFabric">➕ 去添加布料</button>
  </section>
  <section class="panel" id="fabricBox"></section>
  <section id="editPanel"></section>`;

  $('#searchHome').oninput = (e) => { state.search.home = e.target.value; renderHome(); };
  $('#shopFilter').onchange = (e) => { state.shopFilter = e.target.value; renderHome(); };
  $('#viewHome').onchange = (e) => { state.view.home = e.target.value; renderHome(); };
  $('#goAddFabric').onclick = () => showFabricForm();

  const box = $('#fabricBox');
  box.innerHTML = `<p>找到 ${fabrics.length} 块布料</p><div class="${state.view.home==='grid'?'grid':'list'}" id="fabricList"></div>`;
  const list = $('#fabricList');
  fabrics.forEach((f) => list.appendChild(fabricCard(f)));
}

function fabricCard(f) {
  const tpl = $('#fabricCardTpl').content.firstElementChild.cloneNode(true);
  tpl.querySelector('.thumb').src = f.image || IMG_EMPTY;
  tpl.querySelector('.title').textContent = f.name;
  tpl.querySelector('.line1').textContent = `🏪 ${f.shop||'未知店铺'} ｜ 📏 ${fmt(f.length,'米')} ｜ 📐 ${fmt(f.width,'cm')}`;
  tpl.querySelector('.line2').textContent = `💰 ${fmtPrice(f.price)} ｜ 成衣 ${state.data.garments.filter((g)=>g.fabricId===f.id).length} 件`;
  const actions = tpl.querySelector('.actions');
  actions.innerHTML = `<button class='ghost'>详情/编辑</button><button>👗 添加成衣</button><button class='ghost'>删除</button>`;
  actions.children[0].onclick = () => showFabricForm(f);
  actions.children[1].onclick = () => showGarmentForm(undefined, f.id);
  actions.children[2].onclick = () => { if (confirm('确认删除布料？')) { state.data.fabrics = state.data.fabrics.filter((x)=>x.id!==f.id); state.data.garments = state.data.garments.filter((g)=>g.fabricId!==f.id); save(); renderHome(); } };
  return tpl;
}

function showFabricForm(f) {
  const panel = $('#editPanel');
  panel.className = 'panel';
  panel.innerHTML = `<h3>${f?'编辑':'新增'}布料</h3>
  <form id='fabricForm' class='form-grid'>
  <input name='name' placeholder='布料名称*' value='${esc(f?.name||'')}' required />
  <input name='shop' placeholder='店铺' value='${esc(f?.shop||'')}' />
  <input name='length' type='number' min='0' step='0.1' placeholder='长度米' value='${f?.length??''}' />
  <input name='width' type='number' min='0' step='1' placeholder='幅宽cm' value='${f?.width??''}' />
  <input name='price' type='number' min='0' step='0.01' placeholder='价格元' value='${f?.price??''}' />
  <input name='image' type='file' accept='image/*' />
  <div class='row'><button type='submit'>💾 保存</button><button type='button' class='ghost' id='cancelFabric'>取消</button></div>
  </form>`;
  $('#cancelFabric').onclick = () => (panel.innerHTML = '');
  $('#fabricForm').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const img = fd.get('image');
    const image = img && img.size > 0 ? await toDataUrl(img) : f?.image || '';
    const payload = { id: f?.id || id(), name: val(fd,'name'), shop: val(fd,'shop'), length:num(fd,'length'), width:num(fd,'width'), price:num(fd,'price'), image, createdAt: f?.createdAt || new Date().toISOString() };
    upsert(state.data.fabrics, payload);
    save();
    panel.innerHTML = '';
    renderHome();
  };
}

function renderGarments() {
  const q = state.search.garments.toLowerCase();
  const rows = state.data.garments.filter((g)=>`${g.name} ${fabricName(g.fabricId)} ${g.notes||''}`.toLowerCase().includes(q));
  app.innerHTML = `<section class='panel toolbar'><input id='searchG' placeholder='🔍 搜索成衣/布料/备注' value='${esc(state.search.garments)}' /><button id='addG'>➕ 新增成衣</button></section>
  <section class='panel'><table class='table'><thead><tr><th>成衣</th><th>制作日期</th><th>用布</th><th>布料</th><th>操作</th></tr></thead><tbody id='gBody'></tbody></table></section>`;
  $('#searchG').oninput=(e)=>{state.search.garments=e.target.value;renderGarments();};
  $('#addG').onclick=()=>showGarmentForm();
  const tb = $('#gBody');
  rows.forEach((g)=>{
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${esc(g.name||'未命名')}</td><td>${esc(g.madeDate||'-')}</td><td>${fmt(g.usedLength,'米')}</td><td>${esc(fabricName(g.fabricId)||'-')}</td><td><button class='ghost'>编辑</button> <button class='ghost'>删除</button></td>`;
    tr.children[4].children[0].onclick=()=>showGarmentForm(g);
    tr.children[4].children[1].onclick=()=>{if(confirm('确认删除成衣？')){state.data.garments=state.data.garments.filter(x=>x.id!==g.id);save();renderGarments();}};
    tb.appendChild(tr);
  });
}

function showGarmentForm(g, defaultFabricId='') {
  const fabrics = state.data.fabrics;
  if (!fabrics.length) return alert('请先添加布料');
  const target = app;
  const options = fabrics.map((f)=>`<option value='${f.id}' ${(g?.fabricId||defaultFabricId)===f.id?'selected':''}>${esc(f.name)}</option>`).join('');
  target.insertAdjacentHTML('beforeend', `<section class='panel'><h3>${g?'编辑':'新增'}成衣</h3><form id='gForm' class='form-grid'>
  <input name='name' placeholder='成衣名称' value='${esc(g?.name||'')}' />
  <input name='madeDate' type='date' value='${esc(g?.madeDate||new Date().toISOString().slice(0,10))}' />
  <input name='usedLength' type='number' min='0' step='0.1' placeholder='使用布长' value='${g?.usedLength??''}' />
  <select name='fabricId'>${options}</select>
  <select name='patternId'><option value=''>不关联纸样</option>${state.data.patterns.map((p)=>`<option value='${p.id}' ${p.id===g?.patternId?'selected':''}>${esc(p.name)}</option>`).join('')}</select>
  <input name='image' type='file' accept='image/*' />
  <textarea name='notes' placeholder='备注'>${esc(g?.notes||'')}</textarea>
  <div class='row'><button type='submit'>💾 保存</button><button id='closeG' type='button' class='ghost'>取消</button></div></form></section>`);
  $('#closeG').onclick=()=>$('#closeG').closest('.panel').remove();
  $('#gForm').onsubmit=async(e)=>{e.preventDefault();const fd=new FormData(e.target);const fabricId=fd.get('fabricId');const used=num(fd,'usedLength');const fabric=state.data.fabrics.find(f=>f.id===fabricId);if(used&&fabric?.length&&used>fabric.length){alert('使用布长不能超过当前剩余长度');return;}const img=fd.get('image');const image=img&&img.size>0?await toDataUrl(img):g?.image||'';const rec={id:g?.id||id(),name:val(fd,'name')||'未命名成衣',madeDate:val(fd,'madeDate'),usedLength:used,fabricId,patternId:val(fd,'patternId')||null,notes:val(fd,'notes'),image,createdAt:g?.createdAt||new Date().toISOString()};upsert(state.data.garments,rec);save();route('garments');};
}

function renderPatterns() {
  const q=state.search.patterns.toLowerCase();
  const rows=state.data.patterns.filter((p)=>(`${p.name} ${p.notes||''}`).toLowerCase().includes(q));
  app.innerHTML=`<section class='panel toolbar'><input id='searchP' placeholder='🔍 搜索纸样' value='${esc(state.search.patterns)}'/><select id='viewP'><option value='grid' ${state.view.patterns==='grid'?'selected':''}>网格</option><option value='list' ${state.view.patterns==='list'?'selected':''}>列表</option></select><button id='addP'>➕ 去添加纸样</button></section><section class='panel'><p>找到 ${rows.length} 个纸样</p><div class='${state.view.patterns==='grid'?'grid':'list'}' id='pList'></div></section>`;
  $('#searchP').oninput=(e)=>{state.search.patterns=e.target.value;renderPatterns();};
  $('#viewP').onchange=(e)=>{state.view.patterns=e.target.value;renderPatterns();};
  $('#addP').onclick=()=>showPatternForm();
  const box=$('#pList');
  rows.forEach((p)=>{const d=document.createElement('article');d.className='card-item';d.innerHTML=`<img class='thumb' src='${p.image||IMG_EMPTY}'/><h4 class='title'>${esc(p.name)}</h4><p class='line1'>被使用 ${state.data.garments.filter(g=>g.patternId===p.id).length} 次</p><p class='line2'>${esc(p.notes||'')}</p><div class='row'><button class='ghost'>编辑</button><button class='ghost'>删除</button></div>`;d.querySelectorAll('button')[0].onclick=()=>showPatternForm(p);d.querySelectorAll('button')[1].onclick=()=>{if(confirm('确认删除纸样？')){state.data.patterns=state.data.patterns.filter(x=>x.id!==p.id);state.data.garments.forEach(g=>{if(g.patternId===p.id)g.patternId=null});save();renderPatterns();}};box.appendChild(d);});
}

function showPatternForm(p){app.insertAdjacentHTML('beforeend',`<section class='panel'><h3>${p?'编辑':'新增'}纸样</h3><form id='pForm' class='form-grid'><input name='name' value='${esc(p?.name||'')}' placeholder='纸样名称*' required/><input name='image' type='file' accept='image/*'/><textarea name='notes' placeholder='备注'>${esc(p?.notes||'')}</textarea><div class='row'><button>💾 保存</button><button id='closeP' type='button' class='ghost'>取消</button></div></form></section>`);$('#closeP').onclick=()=>$('#closeP').closest('.panel').remove();$('#pForm').onsubmit=async(e)=>{e.preventDefault();const fd=new FormData(e.target);const img=fd.get('image');const image=img&&img.size>0?await toDataUrl(img):p?.image||'';upsert(state.data.patterns,{id:p?.id||id(),name:val(fd,'name'),notes:val(fd,'notes'),image,createdAt:p?.createdAt||new Date().toISOString()});save();route('patterns');};}

function renderSizes(){
  const q=state.search.sizes.toLowerCase();
  const rows=state.data.sizes.filter((s)=>JSON.stringify(s).toLowerCase().includes(q));
  app.innerHTML=`<section class='panel toolbar'><input id='searchS' placeholder='🔍 搜索尺码档案' value='${esc(state.search.sizes)}'/><button id='addS'>➕ 新增尺码档案</button></section><section class='panel'><table class='table'><thead><tr><th>名称</th><th>身高/体重</th><th>三围</th><th>其它</th><th>操作</th></tr></thead><tbody id='sBody'></tbody></table></section>`;
  $('#searchS').oninput=(e)=>{state.search.sizes=e.target.value;renderSizes();};
  $('#addS').onclick=()=>showSizeForm();
  const b=$('#sBody');
  rows.forEach((s)=>{const tr=document.createElement('tr');tr.innerHTML=`<td>${esc(s.name)}</td><td>${fmt(s.height_cm,'cm')} / ${fmt(s.weight_kg,'kg')}</td><td>胸${fmt(s.bust_cm,'')} 腰${fmt(s.waist_cm,'')} 臀${fmt(s.hip_cm,'')}</td><td>臂${fmt(s.arm_length_cm,'')} 衣${fmt(s.garment_length_cm,'')} 腿${fmt(s.leg_length_cm,'')}</td><td><button class='ghost'>编辑</button> <button class='ghost'>删除</button></td>`;tr.querySelectorAll('button')[0].onclick=()=>showSizeForm(s);tr.querySelectorAll('button')[1].onclick=()=>{if(confirm('确认删除尺码档案？')){state.data.sizes=state.data.sizes.filter(x=>x.id!==s.id);save();renderSizes();}};b.appendChild(tr);});
}

function showSizeForm(s){app.insertAdjacentHTML('beforeend',`<section class='panel'><h3>${s?'编辑':'新增'}尺码档案</h3><form id='sForm' class='form-grid'>
<input name='name' placeholder='档案名称*' required value='${esc(s?.name||'')}'/><input name='height_cm' type='number' placeholder='身高cm' value='${s?.height_cm??''}'/>
<input name='weight_kg' type='number' step='0.1' placeholder='体重kg' value='${s?.weight_kg??''}'/><input name='bust_cm' type='number' step='0.1' placeholder='胸围cm' value='${s?.bust_cm??''}'/>
<input name='waist_cm' type='number' step='0.1' placeholder='腰围cm' value='${s?.waist_cm??''}'/><input name='hip_cm' type='number' step='0.1' placeholder='臀围cm' value='${s?.hip_cm??''}'/>
<input name='arm_length_cm' type='number' step='0.1' placeholder='臂长cm' value='${s?.arm_length_cm??''}'/><input name='garment_length_cm' type='number' step='0.1' placeholder='衣长cm' value='${s?.garment_length_cm??''}'/>
<input name='leg_length_cm' type='number' step='0.1' placeholder='腿长cm' value='${s?.leg_length_cm??''}'/><textarea name='description' placeholder='描述'>${esc(s?.description||'')}</textarea>
<div class='row'><button>💾 保存</button><button id='closeS' type='button' class='ghost'>取消</button></div></form></section>`);$('#closeS').onclick=()=>$('#closeS').closest('.panel').remove();$('#sForm').onsubmit=(e)=>{e.preventDefault();const fd=new FormData(e.target);upsert(state.data.sizes,{id:s?.id||id(),name:val(fd,'name'),height_cm:num(fd,'height_cm'),weight_kg:num(fd,'weight_kg'),bust_cm:num(fd,'bust_cm'),waist_cm:num(fd,'waist_cm'),hip_cm:num(fd,'hip_cm'),arm_length_cm:num(fd,'arm_length_cm'),garment_length_cm:num(fd,'garment_length_cm'),leg_length_cm:num(fd,'leg_length_cm'),description:val(fd,'description'),createdAt:s?.createdAt||new Date().toISOString()});save();route('sizes');};}

function renderBackup(){
  app.innerHTML=`<section class='panel'><h3>📤 导出数据</h3><button id='exp'>导出为 JSON</button></section><section class='panel'><h3>📥 导入数据</h3><input type='file' id='imp' accept='application/json'/><p id='sum'></p></section>`;
  $('#exp').onclick=()=>{const blob=new Blob([JSON.stringify({export_time:new Date().toISOString(),...state.data},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`fabric_backup_${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(a.href);};
  $('#imp').onchange=(e)=>{const f=e.target.files?.[0];if(!f)return;const r=new FileReader();r.onload=()=>{try{const d=JSON.parse(String(r.result||'{}'));['fabrics','garments','patterns','sizes'].forEach((k)=>{if(!Array.isArray(d[k]))throw new Error('bad');});state.data={fabrics:d.fabrics,garments:d.garments,patterns:d.patterns,sizes:d.sizes};save();$('#sum').textContent=`导入成功：布料${d.fabrics.length}，成衣${d.garments.length}，纸样${d.patterns.length}，尺码${d.sizes.length}`;}catch{alert('导入失败：格式错误')}};r.readAsText(f);};
}

function filteredFabrics(){
  const q=state.search.home.toLowerCase();
  return state.data.fabrics.filter((f)=>{
    const matchQ = (`${f.name} ${f.shop||''}`).toLowerCase().includes(q);
    const matchShop = state.shopFilter === '全部' || (f.shop||'') === state.shopFilter;
    return matchQ && matchShop;
  });
}

function statsHTML(){
  const list=state.data.fabrics;const totalValue=list.reduce((s,i)=>s+(i.price||0),0);const totalLength=list.reduce((s,i)=>s+(i.length||0),0);const shops=new Set(list.map((i)=>i.shop).filter(Boolean)).size;
  return [["📦 布料总数",`${list.length}块`],["💰 总价值",`¥${totalValue.toFixed(0)}`],["📏 总长度",`${totalLength.toFixed(1)}米`],["🏪 店铺数量",`${shops}家`]].map(([k,v])=>`<div class='stat'><div class='k'>${k}</div><div class='v'>${v}</div></div>`).join('');
}

function load(){try{const raw=localStorage.getItem(STORE_KEY);if(!raw)return;const d=JSON.parse(raw);if(d?.data)Object.assign(state,d);}catch{}}
function save(){localStorage.setItem(STORE_KEY,JSON.stringify({page:state.page,view:state.view,search:state.search,shopFilter:state.shopFilter,data:state.data}));}

function upsert(arr,item){const i=arr.findIndex((x)=>x.id===item.id);if(i>=0)arr[i]=item;else arr.unshift(item);}
function id(){return crypto.randomUUID();}
function val(fd,k){return String(fd.get(k)||'').trim();}
function num(fd,k){const n=Number(fd.get(k));return Number.isFinite(n)&&n>0?n:null;}
function fmt(v,u){return typeof v==='number'?`${v}${u}`:'-';}
function fmtPrice(v){return typeof v==='number'?`¥${v.toFixed(2)}`:'-';}
function fabricName(fid){return state.data.fabrics.find((f)=>f.id===fid)?.name||'';}
function esc(s){return String(s||'').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function toDataUrl(file){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(String(r.result));r.onerror=rej;r.readAsDataURL(file);});}
