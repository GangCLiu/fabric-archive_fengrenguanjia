const STORAGE_KEY = "sewing_manager_data_v1";
const EMPTY_IMG = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='200'><rect fill='%23f2f2f2' width='300' height='200'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='%23999' font-size='20'>无图片</text></svg>";

const state = {
  fabrics: [],
  search: "",
};

const el = {
  stats: document.querySelector("#stats"),
  fabricList: document.querySelector("#fabricList"),
  searchInput: document.querySelector("#searchInput"),
  showAddFabricBtn: document.querySelector("#showAddFabricBtn"),
  addFabricPanel: document.querySelector("#addFabricPanel"),
  cancelAddFabric: document.querySelector("#cancelAddFabric"),
  fabricForm: document.querySelector("#fabricForm"),
  garmentPanel: document.querySelector("#garmentPanel"),
  garmentForm: document.querySelector("#garmentForm"),
  cancelGarment: document.querySelector("#cancelGarment"),
  exportBtn: document.querySelector("#exportBtn"),
  importInput: document.querySelector("#importInput"),
  tpl: document.querySelector("#fabricItemTpl"),
};

init();

function init() {
  load();
  bindEvents();
  render();
}

function bindEvents() {
  el.searchInput.addEventListener("input", (e) => {
    state.search = e.target.value.trim();
    render();
  });

  el.showAddFabricBtn.addEventListener("click", () => {
    el.addFabricPanel.hidden = false;
  });

  el.cancelAddFabric.addEventListener("click", () => {
    el.fabricForm.reset();
    el.addFabricPanel.hidden = true;
  });

  el.fabricForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(el.fabricForm);
    const file = fd.get("image");
    const image = file && file.size > 0 ? await fileToDataUrl(file) : "";

    state.fabrics.unshift({
      id: crypto.randomUUID(),
      name: String(fd.get("name") || "").trim(),
      shop: String(fd.get("shop") || "").trim(),
      length: toNum(fd.get("length")),
      width: toNum(fd.get("width")),
      price: toNum(fd.get("price")),
      image,
      createdAt: new Date().toISOString(),
      garments: [],
    });

    save();
    el.fabricForm.reset();
    el.addFabricPanel.hidden = true;
    render();
  });

  el.cancelGarment.addEventListener("click", () => {
    el.garmentForm.reset();
    el.garmentPanel.hidden = true;
  });

  el.garmentForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(el.garmentForm);
    const fabricId = fd.get("fabricId");
    const fabric = state.fabrics.find((f) => f.id === fabricId);
    if (!fabric) return;

    const usedLength = toNum(fd.get("usedLength"));
    if (usedLength > 0 && typeof fabric.length === "number" && usedLength > fabric.length) {
      alert("使用布长不能超过当前剩余长度");
      return;
    }

    const file = fd.get("image");
    const image = file && file.size > 0 ? await fileToDataUrl(file) : "";

    fabric.garments.unshift({
      id: crypto.randomUUID(),
      name: String(fd.get("name") || "").trim() || "未命名成衣",
      madeDate: String(fd.get("madeDate") || ""),
      usedLength,
      notes: String(fd.get("notes") || "").trim(),
      image,
    });

    if (typeof fabric.length === "number" && usedLength > 0) {
      fabric.length = +(fabric.length - usedLength).toFixed(2);
    }

    save();
    el.garmentForm.reset();
    el.garmentPanel.hidden = true;
    render();
  });

  el.exportBtn.addEventListener("click", exportJson);
  el.importInput.addEventListener("change", importJson);
}

function render() {
  const visible = state.fabrics.filter((f) => {
    if (!state.search) return true;
    const key = `${f.name} ${f.shop}`.toLowerCase();
    return key.includes(state.search.toLowerCase());
  });

  renderStats(state.fabrics);
  el.fabricList.innerHTML = "";

  if (!visible.length) {
    el.fabricList.innerHTML = "<p>暂无布料数据，点击上方“添加布料”。</p>";
    return;
  }

  visible.forEach((fabric) => {
    const node = el.tpl.content.firstElementChild.cloneNode(true);
    node.querySelector(".fabric-image").src = fabric.image || EMPTY_IMG;
    node.querySelector(".name").textContent = fabric.name || "未命名布料";
    node.querySelector(".meta").textContent = `🏪 ${fabric.shop || "未知店铺"}｜📏 ${fmt(fabric.length, "米")}｜📐 ${fmt(fabric.width, "cm")}`;
    node.querySelector(".meta2").textContent = `💰 ${fmtPrice(fabric.price)}｜🕒 ${fmtDate(fabric.createdAt)}`;
    node.querySelector(".tags").textContent = `成衣数：${fabric.garments?.length || 0}`;

    const garments = node.querySelector(".garments");
    if (!fabric.garments?.length) {
      garments.innerHTML = "<p>暂无成衣记录</p>";
    } else {
      garments.innerHTML = fabric.garments
        .map(
          (g) => `<div><b>${g.name}</b>｜日期: ${g.madeDate || "-"}｜用布: ${fmt(g.usedLength, "米")}<br/>备注: ${g.notes || "-"}</div>`
        )
        .join("<hr/>");
    }

    node.querySelector('[data-action="delete"]').addEventListener("click", () => {
      if (!confirm(`确定删除布料【${fabric.name}】吗？`)) return;
      state.fabrics = state.fabrics.filter((f) => f.id !== fabric.id);
      save();
      render();
    });

    node.querySelector('[data-action="add-garment"]').addEventListener("click", () => {
      el.garmentPanel.hidden = false;
      el.garmentForm.fabricId.value = fabric.id;
      el.garmentForm.madeDate.value = new Date().toISOString().slice(0, 10);
    });

    el.fabricList.appendChild(node);
  });
}

function renderStats(list) {
  const totalValue = list.reduce((sum, i) => sum + (i.price || 0), 0);
  const totalLength = list.reduce((sum, i) => sum + (i.length || 0), 0);
  const shops = new Set(list.map((i) => i.shop).filter(Boolean)).size;

  el.stats.innerHTML = [
    ["📦 布料总数", `${list.length} 块`],
    ["💰 总价值", `¥${totalValue.toFixed(2)}`],
    ["📏 总长度", `${totalLength.toFixed(2)} 米`],
    ["🏪 店铺数量", `${shops} 家`],
  ]
    .map(([k, v]) => `<div class="stat"><div>${k}</div><strong>${v}</strong></div>`)
    .join("");
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ fabrics: state.fabrics }));
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    state.fabrics = Array.isArray(parsed.fabrics) ? parsed.fabrics : [];
  } catch {
    state.fabrics = [];
  }
}

function exportJson() {
  const blob = new Blob([JSON.stringify({ fabrics: state.fabrics }, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `sewing-manager-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function importJson(e) {
  const [file] = e.target.files || [];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result || "{}"));
      if (!Array.isArray(parsed.fabrics)) throw new Error("格式错误");
      state.fabrics = parsed.fabrics;
      save();
      render();
      alert("导入成功");
    } catch {
      alert("导入失败：JSON 格式不正确");
    }
  };
  reader.readAsText(file);
  e.target.value = "";
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function toNum(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function fmt(v, unit) {
  return typeof v === "number" ? `${v} ${unit}` : "-";
}

function fmtPrice(v) {
  return typeof v === "number" ? `¥${v.toFixed(2)}` : "-";
}

function fmtDate(v) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString();
}
