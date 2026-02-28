const STORE_KEY = 'sewing_manager_full_v2';
const IMG_EMPTY = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='320' height='200'><rect fill='%23edf0f4' width='100%' height='100%'/><text x='50%' y='50%' fill='%23909aae' dominant-baseline='middle' text-anchor='middle'>无图片</text></svg>";

const pages = [
  ['data', '数据'],
  ['home', '布料'],
  ['patterns', '纸样'],
  ['sizes', '尺码'],
  ['garments', '成衣'],
  ['backup', '备份'],
];

const state = {
  page: 'home',
  view: { home: 'grid', garments: 'table', patterns: 'grid', sizes: 'table' },
  search: { home: '', garments: '', patterns: '', sizes: '' },
  shopFilter: '全部',
  data: { fabrics: [], garments: [], patterns: [], sizes: [] },
};

let saveErrorNotified = false;

const $ = (s) => document.querySelector(s);
const app = $('#app');

init();

function init() {
  load();
  ensureOriginalLengthAndRecalculate();
  renderNav();
  setupUsageModal();
  setupImageZoom();
  route(state.page);
}


function setupUsageModal() {
  const trigger = $('#usageHelpTrigger');
  const modal = $('#usageModal');
  const confirmBtn = $('#usageModalConfirm');
  if (!trigger) return;

  const fallbackText = [
    '使用说明：',
    '1. 在布料列表点击“去添加布料”',
    '2. 列表统一为卡片视图',
    '3. 可管理成衣、纸样、尺码档案',
    '4. 定期在“数据备份”导出 JSON',
  ].join('\n');

  const openModal = () => {
    if (!modal) {
      alert(fallbackText);
      return;
    }
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
  };

  const closeModal = () => {
    if (!modal) return;
    modal.classList.add('hidden');
    modal.style.display = 'none';
  };

  if (modal && modal.classList.contains('hidden')) {
    modal.style.display = 'none';
  }

  trigger.onclick = openModal;
  trigger.addEventListener('touchend', (e) => {
    e.preventDefault();
    openModal();
  });

  if (confirmBtn) confirmBtn.onclick = closeModal;

  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
  }
}

function setupImagePreview(inputSelector, previewSelector, tipSelector) {
  const input = document.querySelector(inputSelector);
  const preview = document.querySelector(previewSelector);
  const tip = document.querySelector(tipSelector);
  if (!input || !preview) return;
  if (tip) tip.onclick = () => input.click();
  input.addEventListener('change', async (e) => {
    const file = (e.target.files && e.target.files[0]);
    if (!file) return;
    preview.src = await toDataUrl(file);
    preview.classList.remove('hidden');
    if (tip) tip.classList.add('hidden');
  });
}


function closestEl(start, selector){
  let el = start;
  while (el && el !== document) {
    if (typeof el.matches === 'function' && el.matches(selector)) return el;
    el = el.parentElement;
  }
  return null;
}

function setupImageZoom() {
  document.addEventListener('click', (e) => {
    const img = closestEl(e.target, '[data-preview-image]');
    if (img) {
      const modal = document.createElement('div');
      modal.className = 'image-modal';
      modal.innerHTML = `<img src='${img.src}' alt='放大预览' />`;
      modal.onclick = () => modal.remove();
      document.body.appendChild(modal);
      return;
    }
    const modalEl = closestEl(e.target, '.image-modal');if (modalEl) modalEl.remove();
  });
}

function renderNav() {
  const nav = $('#bottomNav');
  nav.innerHTML = '';
  pages.forEach(([id, label]) => {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.className = state.page === id ? 'active' : '';
    btn.onclick = () => {
      route(id);
    };
    nav.appendChild(btn);
  });
}

function route(id) {
  state.page = id;
  $('#pageTitle').textContent = ((pages.find((p) => p[0] === id) || [])[1] || '');
  renderNav();
  ({ data: renderDataCenter, home: renderHome, garments: renderGarments, patterns: renderPatterns, sizes: renderSizes, backup: renderBackup }[id])();
}

function renderHome() {
  const fabrics = filteredFabrics();
  const shops = ['全部'].concat(Array.from(new Set(state.data.fabrics.map((f) => f.shop).filter(Boolean))));
  if (!shops.includes(state.shopFilter)) state.shopFilter = '全部';

  app.innerHTML = `
  <section class="panel toolbar">
    <input id="searchHome" placeholder="输入名称或店铺..." value="${esc(state.search.home)}" />
    <select id="shopFilter">${shops.map((s) => `<option ${s===state.shopFilter?'selected':''}>${s}</option>`).join('')}</select>
    <button id="goAddFabric">去添加布料</button>
  </section>
  <section class="panel" id="fabricBox"></section>
  <section id="editPanel"></section>`;

  $('#searchHome').oninput = (e) => { state.search.home = e.target.value; renderHome(); };
  $('#shopFilter').onchange = (e) => { state.shopFilter = e.target.value; renderHome(); };
  $('#goAddFabric').onclick = () => showFabricForm();

  const box = $('#fabricBox');
  box.innerHTML = `<p>找到 ${fabrics.length} 块布料</p><div class="grid" id="fabricList"></div>`;
  const list = $('#fabricList');
  fabrics.forEach((f) => list.appendChild(fabricCard(f)));
}

function renderDataCenter() {
  const fabrics = state.data.fabrics;
  const garments = state.data.garments;
  const patterns = state.data.patterns;

  const purchasedLength = fabrics.reduce((sum, item) => sum + (Number(item.originalLength) || Number(item.length) || 0), 0);
  const purchaseCount = fabrics.length;
  const purchasedCost = fabrics.reduce((sum, item) => sum + (Number(item.price) || 0), 0);
  const usedLength = garments.reduce((sum, item) => sum + (Number(item.usedLength) || 0), 0);
  const remainLength = fabrics.reduce((sum, item) => sum + (Number(item.length) || 0), 0);
  const usageRate = purchasedLength > 0 ? `${((usedLength / purchasedLength) * 100).toFixed(1)}%` : '-';

  const patternCount = patterns.length;
  const patternCost = patterns.reduce((sum, item) => sum + (Number(item.price) || 0), 0);

  const garmentCount = garments.length;
  const garmentValue = garments.reduce((sum, item) => sum + (Number(item.value) || 0), 0);

  app.innerHTML = `
  <section class='panel'>
    <h3>布料统计</h3>
    <div class='stats'>
      ${statItem('购买总米数', fmt(purchasedLength, '米'))}
      ${statItem('购买次数', `${purchaseCount}次`)}
      ${statItem('购买花费', fmtPrice(purchasedCost))}
      ${statItem('耗布米数', fmt(usedLength, '米'))}
      ${statItem('剩余米数', fmt(remainLength, '米'))}
      ${statItem('利用率', usageRate)}
    </div>
  </section>
  <section class='panel'>
    <h3>纸样统计</h3>
    <div class='stats'>
      ${statItem('纸样数量', `${patternCount}个`)}
      ${statItem('纸样花费', fmtPrice(patternCost))}
    </div>
  </section>
  <section class='panel'>
    <h3>成衣统计</h3>
    <div class='stats'>
      ${statItem('成衣数量', `${garmentCount}件`)}
      ${statItem('成衣估值', fmtPrice(garmentValue))}
    </div>
  </section>
  <section class='panel'>
    <h3>其余分组</h3>
    <div class='stats'>
      ${statItem('关联店铺数', `${new Set(fabrics.map((item) => item.shop).filter(Boolean)).size}家`)}
      ${statItem('关联尺码档', `${state.data.sizes.length}个`)}
      ${statItem('已关联纸样的成衣', `${garments.filter((item) => item.patternId).length}件`)}
    </div>
  </section>`;
}

function statItem(k, v) {
  return `<div class='stat'><div class='k'>${k}</div><div class='v'>${v}</div></div>`;
}

function fabricCard(f) {
  const tpl = $('#fabricCardTpl').content.firstElementChild.cloneNode(true);
  tpl.querySelector('.thumb').src = f.image || IMG_EMPTY;
  tpl.querySelector('.title').textContent = f.name;
  tpl.querySelector('.line1').innerHTML = `<span class='meta-item'><span class='meta-k'>店铺</span><span class='meta-v'>${esc(f.shop||'未知店铺')}</span></span><span class='meta-item'><span class='meta-k'>长度</span><span class='meta-v'>${fmt(f.length,'米')}</span></span><span class='meta-item'><span class='meta-k'>幅宽</span><span class='meta-v'>${fmt(f.width,'cm')}</span></span>`;
  tpl.querySelector('.line2').innerHTML = `<span class='meta-item'><span class='meta-k'>价格</span><span class='meta-v'>${fmtPrice(f.price)}</span></span><span class='meta-item'><span class='meta-k'>成衣</span><span class='meta-v'>${state.data.garments.filter((g)=>g.fabricId===f.id).length} 件</span></span>`;
  const actions = tpl.querySelector('.actions');
  actions.innerHTML = `<button class='ghost'>详情/编辑</button><button>添加成衣</button><button class='ghost'>删除</button>`;
  actions.children[0].onclick = () => showFabricForm(f);
  actions.children[1].onclick = () => showGarmentForm(undefined, f.id);
  actions.children[2].onclick = () => { if (confirm('确认删除布料？')) { state.data.fabrics = state.data.fabrics.filter((x)=>x.id!==f.id); state.data.garments = state.data.garments.filter((g)=>g.fabricId!==f.id); save(); renderHome(); } };
  return tpl;
}

function showFabricForm(f) {
  const panel = $('#editPanel');
  const relatedGarments = f ? state.data.garments.filter((g) => g.fabricId === f.id) : [];
  const garmentPreview = relatedGarments.length
    ? `<div class='image-preview-wrap'><h4>关联成衣预览</h4><div class='garment-preview-list'>${relatedGarments.map((g) => `<div class='garment-preview-item'><img src='${g.image||IMG_EMPTY}' alt='${esc(g.name||'成衣')}' data-preview-image /><span>${esc(g.name||'未命名成衣')}</span></div>`).join('')}</div></div>`
    : `<div class='image-preview-wrap preview-tip'>暂无关联成衣</div>`;
  panel.className = 'panel';
  panel.innerHTML = `<h3>${f?'编辑':'新增'}布料</h3>
  <form id='fabricForm' class='form-grid'>
  <label class='field'><span>布料名称</span><input name='name' placeholder='布料名称*' value='${esc((f&&f.name)||'')}' required /></label>
  <label class='field'><span>店铺</span><input name='shop' placeholder='店铺' value='${esc((f&&f.shop)||'')}' /></label>
  <label class='field'><span>原长(米)</span><input name='length' type='number' min='0' step='0.1' placeholder='原长(米)' value='${f && f.originalLength != null ? f.originalLength : (f && f.length != null ? f.length : '')}' /></label>
  <label class='field'><span>幅宽(cm)</span><input name='width' type='number' min='0' step='1' placeholder='幅宽(cm)' value='${f && f.width != null ? f.width : ''}' /></label>
  <label class='field'><span>价格(元)</span><input name='price' type='number' min='0' step='0.01' placeholder='价格(元)' value='${f && f.price != null ? f.price : ''}' /></label>
  <label class='field'><span>布料图片</span><input id='fabricImageInput' name='image' type='file' accept='image/*' /></label>
  <div class='image-preview-wrap'><img id='fabricImagePreview' class='image-preview ${(f&&f.image) ? '' : 'hidden'}' src='${esc((f&&f.image)||'')}' alt='布料图片预览' data-preview-image /><div id='fabricImageTip' class='preview-tip ${(f&&f.image) ? 'hidden' : ''}'>单击选择图片，保存前可预览；单击图片可放大查看。</div></div>
  ${garmentPreview}
  <div class='row'><button type='submit'>保存</button><button type='button' class='ghost' id='cancelFabric'>取消</button></div>
  </form>`;
  setupImagePreview('#fabricImageInput','#fabricImagePreview','#fabricImageTip');
  $('#cancelFabric').onclick = () => (panel.innerHTML = '');
  $('#fabricForm').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const img = fd.get('image');
    const image = img && img.size > 0 ? await toDataUrl(img) : (f&&f.image) || '';
    const inputLength = num(fd,'length');
    const payload = { id: (f&&f.id) || id(), name: val(fd,'name'), shop: val(fd,'shop'), length: inputLength, originalLength: inputLength, width:num(fd,'width'), price:num(fd,'price'), image, createdAt: (f&&f.createdAt) || new Date().toISOString() };
    if (f && inputLength == null) {
      payload.originalLength = f.originalLength != null ? f.originalLength : (f.length != null ? f.length : null);
    }
    upsert(state.data.fabrics, payload);
    recalculateFabricLength(payload.id);
    if (!save()) return;
    showToast('保存成功!');
    panel.innerHTML = '';
    renderHome();
  };
}

function renderGarments() {
  const q = state.search.garments.toLowerCase();
  const rows = state.data.garments.filter((g)=>`${g.name} ${fabricName(g.fabricId)} ${patternName(g.patternId)} ${sizeName(g.sizeId)} ${g.notes||''}`.toLowerCase().includes(q));
  app.innerHTML = `<section class='panel toolbar'><input id='searchG' placeholder='搜索成衣/布料/纸样/尺码/备注' value='${esc(state.search.garments)}' /><button id='addG'>新增成衣</button></section>
  <section class='panel' id='garmentBox'></section>
  <section id='editPanel'></section>`;
  $('#searchG').oninput=(e)=>{state.search.garments=e.target.value;renderGarments();};
  $('#addG').onclick=()=>showGarmentForm();

  const box = $('#garmentBox');
  box.innerHTML = `<div class='grid' id='garmentList'></div>`;
  const list = $('#garmentList');
  rows.forEach((g)=>{
    const card=document.createElement('article');
    card.className='card-item';
    card.innerHTML=`<img class='thumb' src='${g.image||IMG_EMPTY}' alt='成衣图' data-preview-image/><h4 class='title'>${esc(g.name||'未命名')}</h4><p class='line1'><span class='meta-item'><span class='meta-k'>日期</span><span class='meta-v'>${esc(g.madeDate||'-')}</span></span><span class='meta-item'><span class='meta-k'>用布</span><span class='meta-v'>${fmt(g.usedLength,'米')}</span></span></p><p class='line2'><span class='meta-item'><span class='meta-k'>布料</span><span class='meta-v'>${esc(fabricName(g.fabricId)||'-')}</span></span><span class='meta-item'><span class='meta-k'>纸样</span><span class='meta-v'>${esc(patternName(g.patternId)||'-')}</span></span><span class='meta-item'><span class='meta-k'>尺码</span><span class='meta-v'>${esc(sizeName(g.sizeId)||'-')}</span></span></p><div class='row'><button class='ghost'>编辑</button><button class='ghost'>删除</button></div>`;
    card.querySelectorAll('button')[0].onclick=()=>showGarmentForm(g);
    card.querySelectorAll('button')[1].onclick=()=>{if(confirm('确认删除成衣？')){const oldFabricId=g.fabricId;state.data.garments=state.data.garments.filter(x=>x.id!==g.id);recalculateFabricLength(oldFabricId);save();renderGarments();}};
    list.appendChild(card);
  });
}

function showGarmentForm(g, defaultFabricId='') {
  const fabrics = state.data.fabrics;
  if (!fabrics.length) return alert('请先添加布料');
  const panel = $('#editPanel');
  if (!panel) return;
  const options = fabrics.map((f)=>`<option value='${f.id}' ${((g&&g.fabricId)||defaultFabricId)===f.id?'selected':''}>${esc(f.name)}</option>`).join('');
  panel.className = 'panel';
  panel.innerHTML = `<h3>${g?'编辑':'新增'}成衣</h3><form id='gForm' class='form-grid'>
  <label class='field'><span>成衣名称</span><input name='name' placeholder='成衣名称' value='${esc((g&&g.name)||'')}' /></label>
  <label class='field'><span>制作日期</span><input name='madeDate' type='date' value='${esc((g&&g.madeDate)||new Date().toISOString().slice(0,10))}' /></label>
  <label class='field'><span>使用布长(米)</span><input name='usedLength' type='number' min='0' step='0.1' placeholder='使用布长(米)' value='${g && g.usedLength != null ? g.usedLength : ''}' /></label>
  <label class='field'><span>布料</span><select name='fabricId'>${options}</select></label>
  <label class='field'><span>纸样</span><select name='patternId'><option value=''>不关联纸样</option>${state.data.patterns.map((p)=>`<option value='${p.id}' ${p.id===(g&&g.patternId)?'selected':''}>${esc(p.name)}</option>`).join('')}</select></label>
  <label class='field'><span>尺码</span><select name='sizeId'><option value=''>不关联尺码</option>${state.data.sizes.map((s)=>`<option value='${s.id}' ${s.id===(g&&g.sizeId)?'selected':''}>${esc(s.name||'未命名尺码')}</option>`).join('')}</select></label>
  <label class='field'><span>成衣图片</span><input id='garmentImageInput' name='image' type='file' accept='image/*' /></label>
  <div class='image-preview-wrap'><img id='garmentImagePreview' class='image-preview ${(g&&g.image) ? '' : 'hidden'}' src='${esc((g&&g.image)||'')}' alt='成衣图片预览' data-preview-image /><div id='garmentImageTip' class='preview-tip ${(g&&g.image) ? 'hidden' : ''}'>单击选择图片，保存前可预览；单击图片可放大查看。</div></div>
  <label class='field image-preview-wrap'><span>备注</span><textarea name='notes' placeholder='备注'>${esc((g&&g.notes)||'')}</textarea></label>
  <div class='row'><button type='submit'>保存</button><button id='closeG' type='button' class='ghost'>取消</button></div></form>`;
  $('#closeG').onclick=()=>{panel.className='';panel.innerHTML='';};
  setupImagePreview('#garmentImageInput','#garmentImagePreview','#garmentImageTip');
  $('#gForm').onsubmit=async(e)=>{e.preventDefault();const fd=new FormData(e.target);const fabricId=fd.get('fabricId');const used=num(fd,'usedLength');const fabric=state.data.fabrics.find(f=>f.id===fabricId);const available=(fabric&&fabric.originalLength)!=null?Number(fabric.originalLength)-usedLengthSumByFabric(fabricId,(g&&g.id)):(fabric&&fabric.length);if(used&&available!=null&&used>available){alert('使用布长不能超过当前剩余长度');return;}const img=fd.get('image');const image=img&&img.size>0?await toDataUrl(img):(g&&g.image)||'';const rec={id:(g&&g.id)||id(),name:val(fd,'name')||'未命名成衣',madeDate:val(fd,'madeDate'),usedLength:used,fabricId,patternId:val(fd,'patternId')||null,sizeId:val(fd,'sizeId')||null,notes:val(fd,'notes'),image,createdAt:(g&&g.createdAt)||new Date().toISOString()};const oldFabricId=(g&&g.fabricId)||null;upsert(state.data.garments,rec);if(oldFabricId&&oldFabricId!==fabricId)recalculateFabricLength(oldFabricId);recalculateFabricLength(fabricId);if(!save())return;showToast('保存成功!');route('garments');};
}

function usedLengthSumByFabric(fabricId, excludeGarmentId = null){
  return state.data.garments
    .filter((g)=>g.fabricId===fabricId && g.id!==excludeGarmentId)
    .reduce((sum,g)=>sum + (Number(g.usedLength)||0), 0);
}

function recalculateFabricLength(fabricId){
  const fabric = state.data.fabrics.find((f)=>f.id===fabricId);
  if (!fabric) return;
  if (fabric.originalLength == null) return;
  const used = usedLengthSumByFabric(fabricId);
  fabric.length = +Math.max(0, Number(fabric.originalLength) - used).toFixed(2);
}

function ensureOriginalLengthAndRecalculate(){
  state.data.fabrics.forEach((fabric)=>{
    if (fabric.originalLength == null && fabric.length != null) {
      fabric.originalLength = Number(fabric.length);
    }
  });
  state.data.fabrics.forEach((fabric)=>recalculateFabricLength(fabric.id));
}

function renderPatterns() {
  const q=state.search.patterns.toLowerCase();
  const rows=state.data.patterns.filter((p)=>(`${p.name} ${p.notes||''}`).toLowerCase().includes(q));
  app.innerHTML=`<section class='panel toolbar'><input id='searchP' placeholder='搜索纸样' value='${esc(state.search.patterns)}'/><button id='addP'>去添加纸样</button></section><section class='panel'><p>找到 ${rows.length} 个纸样</p><div class='grid' id='pList'></div></section><section id='editPanel'></section>`;
  $('#searchP').oninput=(e)=>{state.search.patterns=e.target.value;renderPatterns();};
  $('#addP').onclick=()=>showPatternForm();
  const box=$('#pList');
  rows.forEach((p)=>{const d=document.createElement('article');d.className='card-item';d.innerHTML=`<img class='thumb' src='${p.image||IMG_EMPTY}'/><h4 class='title'>${esc(p.name)}</h4><p class='line1'>被使用 ${state.data.garments.filter(g=>g.patternId===p.id).length} 次</p><p class='line2'>${esc(p.notes||'')}</p><div class='row'><button class='ghost'>编辑</button><button class='ghost'>删除</button></div>`;d.querySelectorAll('button')[0].onclick=()=>showPatternForm(p);d.querySelectorAll('button')[1].onclick=()=>{if(confirm('确认删除纸样？')){state.data.patterns=state.data.patterns.filter(x=>x.id!==p.id);state.data.garments.forEach(g=>{if(g.patternId===p.id)g.patternId=null});save();renderPatterns();}};box.appendChild(d);});
}

function showPatternForm(p){
  const panel = $('#editPanel');
  if (!panel) return;
  panel.className = 'panel';
  panel.innerHTML=`<h3>${p?'编辑':'新增'}纸样</h3><form id='pForm' class='form-grid'><label class='field'><span>纸样名称</span><input name='name' value='${esc((p&&p.name)||'')}' placeholder='纸样名称*' required/></label><label class='field'><span>纸样图片</span><input id='patternImageInput' name='image' type='file' accept='image/*'/></label><div class='image-preview-wrap'><img id='patternImagePreview' class='image-preview ${(p&&p.image) ? '' : 'hidden'}' src='${esc((p&&p.image)||'')}' alt='纸样图片预览' data-preview-image /><div id='patternImageTip' class='preview-tip ${(p&&p.image) ? 'hidden' : ''}'>单击选择图片，保存前可预览；单击图片可放大查看。</div></div><label class='field image-preview-wrap'><span>备注</span><textarea name='notes' placeholder='备注'>${esc((p&&p.notes)||'')}</textarea></label><div class='row'><button>保存</button><button id='closeP' type='button' class='ghost'>取消</button></div></form>`;
  setupImagePreview('#patternImageInput','#patternImagePreview','#patternImageTip');
  $('#closeP').onclick=()=>{panel.className='';panel.innerHTML='';};
  $('#pForm').onsubmit=async(e)=>{e.preventDefault();const fd=new FormData(e.target);const img=fd.get('image');const image=img&&img.size>0?await toDataUrl(img):(p&&p.image)||'';upsert(state.data.patterns,{id:(p&&p.id)||id(),name:val(fd,'name'),notes:val(fd,'notes'),image,createdAt:(p&&p.createdAt)||new Date().toISOString()});if(!save())return;showToast('保存成功!');route('patterns');};
}

function renderSizes(){
  const q=state.search.sizes.toLowerCase();
  const rows=state.data.sizes.filter((s)=>JSON.stringify(s).toLowerCase().includes(q));
  app.innerHTML=`<section class='panel toolbar'><input id='searchS' placeholder='搜索尺码档案' value='${esc(state.search.sizes)}'/><button id='addS'>新增尺码档案</button></section><section class='panel' id='sizeBox'></section><section id='editPanel'></section>`;
  $('#searchS').oninput=(e)=>{state.search.sizes=e.target.value;renderSizes();};
  $('#addS').onclick=()=>showSizeForm();

  const box=$('#sizeBox');
  box.innerHTML = `<div class='grid' id='sizeList'></div>`;
  const list = $('#sizeList');
  rows.forEach((s)=>{
    const card=document.createElement('article');
    card.className='card-item';
    card.innerHTML=`<h4 class='title'>${esc(s.name)}</h4><p class='line1'><span class='meta-item'><span class='meta-k'>身高</span><span class='meta-v'>${fmt(s.height_cm,'cm')}</span></span><span class='meta-item'><span class='meta-k'>体重</span><span class='meta-v'>${fmt(s.weight_kg,'kg')}</span></span></p><p class='line2'><span class='meta-item'><span class='meta-k'>三围</span><span class='meta-v'>胸${fmt(s.bust_cm,'')} 腰${fmt(s.waist_cm,'')} 臀${fmt(s.hip_cm,'')}</span></span><span class='meta-item'><span class='meta-k'>长度</span><span class='meta-v'>臂${fmt(s.arm_length_cm,'')} 衣${fmt(s.garment_length_cm,'')} 腿${fmt(s.leg_length_cm,'')}</span></span></p><div class='row'><button class='ghost'>编辑</button><button class='ghost'>删除</button></div>`;
    card.querySelectorAll('button')[0].onclick=()=>showSizeForm(s);
    card.querySelectorAll('button')[1].onclick=()=>{if(confirm('确认删除尺码档案？')){state.data.sizes=state.data.sizes.filter(x=>x.id!==s.id);save();renderSizes();}};
    list.appendChild(card);
  });
}

function showSizeForm(s){
  const panel = $('#editPanel');
  if (!panel) return;
  panel.className = 'panel';
  panel.innerHTML=`<h3>${s?'编辑':'新增'}尺码档案</h3><form id='sForm' class='form-grid'>
<label class='field'><span>名称</span><input name='name' placeholder='名称*' required value='${esc((s&&s.name)||'')}'/></label><label class='field'><span>身高(cm)</span><input name='height_cm' type='number' placeholder='身高(cm)' value='${s && s.height_cm != null ? s.height_cm : ''}'/></label>
<label class='field'><span>体重(kg)</span><input name='weight_kg' type='number' step='0.1' placeholder='体重(kg)' value='${s && s.weight_kg != null ? s.weight_kg : ''}'/></label><label class='field'><span>胸围(cm)</span><input name='bust_cm' type='number' step='0.1' placeholder='胸围(cm)' value='${s && s.bust_cm != null ? s.bust_cm : ''}'/></label>
<label class='field'><span>腰围(cm)</span><input name='waist_cm' type='number' step='0.1' placeholder='腰围(cm)' value='${s && s.waist_cm != null ? s.waist_cm : ''}'/></label><label class='field'><span>臀围(cm)</span><input name='hip_cm' type='number' step='0.1' placeholder='臀围(cm)' value='${s && s.hip_cm != null ? s.hip_cm : ''}'/></label>
<label class='field'><span>臂长(cm)</span><input name='arm_length_cm' type='number' step='0.1' placeholder='臂长(cm)' value='${s && s.arm_length_cm != null ? s.arm_length_cm : ''}'/></label><label class='field'><span>衣长(cm)</span><input name='garment_length_cm' type='number' step='0.1' placeholder='衣长(cm)' value='${s && s.garment_length_cm != null ? s.garment_length_cm : ''}'/></label>
<label class='field'><span>腿长(cm)</span><input name='leg_length_cm' type='number' step='0.1' placeholder='腿长(cm)' value='${s && s.leg_length_cm != null ? s.leg_length_cm : ''}'/></label><label class='field'><span>描述</span><textarea name='description' placeholder='描述'>${esc((s&&s.description)||'')}</textarea></label>
<div class='row'><button>保存</button><button id='closeS' type='button' class='ghost'>取消</button></div></form>`;
  $('#closeS').onclick=()=>{panel.className='';panel.innerHTML='';};
  $('#sForm').onsubmit=(e)=>{e.preventDefault();const fd=new FormData(e.target);upsert(state.data.sizes,{id:(s&&s.id)||id(),name:val(fd,'name'),height_cm:num(fd,'height_cm'),weight_kg:num(fd,'weight_kg'),bust_cm:num(fd,'bust_cm'),waist_cm:num(fd,'waist_cm'),hip_cm:num(fd,'hip_cm'),arm_length_cm:num(fd,'arm_length_cm'),garment_length_cm:num(fd,'garment_length_cm'),leg_length_cm:num(fd,'leg_length_cm'),description:val(fd,'description'),createdAt:(s&&s.createdAt)||new Date().toISOString()});if(!save())return;showToast('保存成功!');route('sizes');};
}

function renderBackup(){
  app.innerHTML=`<section class='panel'><div class='backup-layout'><article class='backup-card'><h3>导出数据</h3><button id='exp'>导出为 JSON</button></article><article class='backup-card'><h3>导入数据</h3><input type='file' id='imp' accept='application/json'/><p id='sum'></p></article></div></section>`;
  $('#exp').onclick=()=>{const blob=new Blob([JSON.stringify({export_time:new Date().toISOString(),fabrics:state.data.fabrics,garments:state.data.garments,patterns:state.data.patterns,sizes:state.data.sizes},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`fabric_backup_${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(a.href);};
  $('#imp').onchange=(e)=>{const f=(e.target.files && e.target.files[0]);if(!f)return;const r=new FileReader();r.onload=()=>{try{const d=JSON.parse(String(r.result||'{}'));['fabrics','garments','patterns','sizes'].forEach((k)=>{if(!Array.isArray(d[k]))throw new Error('bad');});state.data={fabrics:d.fabrics,garments:d.garments,patterns:d.patterns,sizes:d.sizes};if(!save()){ $('#sum').textContent='导入失败：本地存储不可用或空间不足'; return; }$('#sum').textContent=`导入成功：布料${d.fabrics.length}，成衣${d.garments.length}，纸样${d.patterns.length}，尺码${d.sizes.length}`;}catch(err){alert('导入失败：格式错误')}};r.readAsText(f);};
}

function filteredFabrics(){
  const q=state.search.home.toLowerCase();
  return state.data.fabrics.filter((f)=>{
    const matchQ = (`${f.name} ${f.shop||''}`).toLowerCase().includes(q);
    const matchShop = state.shopFilter === '全部' || (f.shop||'') === state.shopFilter;
    return matchQ && matchShop;
  });
}

function showToast(msg) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 320);
  }, 1200);
}

function load(){try{const raw=localStorage.getItem(STORE_KEY);if(!raw)return;const d=JSON.parse(raw);if(!(d&&d.data))return;Object.assign(state,d);state.view=Object.assign({home:'grid',garments:'table',patterns:'grid',sizes:'table'},d.view||{});state.search=Object.assign({home:'',garments:'',patterns:'',sizes:''},d.search||{});}catch(err){}}
function detectStorageErrorType(err){
  const name = err && err.name ? String(err.name) : '';
  const code = err && typeof err.code === 'number' ? err.code : null;
  const msg = err && err.message ? String(err.message).toLowerCase() : '';
  const restrictedLike = name === 'SecurityError' || code === 18 || msg.includes('access is denied') || msg.includes('insecure');
  if (restrictedLike) return 'restricted';

  const quotaName = name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED';
  const quotaCode = code === 1014;
  const quotaMessage = msg.includes('quota') || msg.includes('exceeded') || msg.includes('storage full');
  if (quotaName || quotaCode || quotaMessage) return 'quota';

  return 'unknown';
}

function canWriteTinyLocalStorage(){
  try{
    const key = '__sewing_storage_probe__';
    localStorage.setItem(key, '1');
    localStorage.removeItem(key);
    return true;
  }catch(err){
    return false;
  }
}

function save(){
  try{
    localStorage.setItem(STORE_KEY,JSON.stringify({page:state.page,view:state.view,search:state.search,shopFilter:state.shopFilter,data:state.data}));
    saveErrorNotified = false;
    return true;
  }catch(err){
    let errorType = detectStorageErrorType(err);
    if (errorType === 'quota' && !canWriteTinyLocalStorage()) {
      errorType = 'restricted';
    }
    if (!saveErrorNotified) {
      if (errorType === 'quota') {
        alert('保存失败：本地存储空间不足。请在“备份”中先导出数据，然后删除部分图片或清理浏览器缓存后重试。');
      } else if (errorType === 'restricted') {
        alert('保存失败：当前设备限制了本地存储权限，请关闭隐私/无痕模式后重试。');
      } else {
        alert('保存失败：当前设备无法写入本地数据，请先导出备份并重试。');
      }
      saveErrorNotified = true;
    }
    console.warn('localStorage save failed:', err);
    return false;
  }
}

function upsert(arr,item){const i=arr.findIndex((x)=>x.id===item.id);if(i>=0)arr[i]=item;else arr.unshift(item);}
function id(){
  if (typeof crypto !== 'undefined' && crypto && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}
function val(fd,k){return String(fd.get(k)||'').trim();}
function num(fd,k){const n=Number(fd.get(k));return Number.isFinite(n)&&n>0?n:null;}
function fmt(v,u){return typeof v==='number'?`${v}${u}`:'-';}
function fmtPrice(v){return typeof v==='number'?`¥${v.toFixed(2)}`:'-';}
function fabricName(fid){const f = state.data.fabrics.find((x)=>x.id===fid);return f ? f.name : '';}

function patternName(pid){const p = state.data.patterns.find((x)=>x.id===pid);return p ? p.name : '';}
function sizeName(sid){const s = state.data.sizes.find((x)=>x.id===sid);return s ? s.name : '';}
function esc(s){return String(s||'').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function toDataUrl(file){
  if (!file || !(file.type||'').startsWith('image/')) {
    return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(String(r.result));r.onerror=rej;r.readAsDataURL(file);});
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => resolve(String(reader.result));
      img.onload = () => {
        const maxEdge = 1600;
        const longest = Math.max(img.width, img.height);
        const scale = longest > maxEdge ? maxEdge / longest : 1;
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(reader.result));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
