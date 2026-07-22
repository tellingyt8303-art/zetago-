/* =========================================================
   Crax Distributor — App Logic
   Storage layer is isolated (DB.*) so it can be swapped for
   Firebase later without touching render/business logic.
   ========================================================= */

/* ---------------- Storage Layer (Firebase Firestore + LocalStorage cache) ----------------
   Firestore is the source of truth (syncs across devices). LocalStorage is only
   used as an offline cache: if the phone has no internet on load, we fall back to
   the last-synced copy so the app still works, then reconnect and sync when back online. */
const firebaseConfig = {
  apiKey: "AIzaSyD4kh_czYSNZ63qLW-V1pWVkah80VB7H98",
  authDomain: "stya-52be1.firebaseapp.com",
  projectId: "stya-52be1",
  storageBucket: "stya-52be1.firebasestorage.app",
  messagingSenderId: "333307659379",
  appId: "1:333307659379:web:4ab3e686711278dd9a9606",
  measurementId: "G-N373Y12B22"
};
firebase.initializeApp(firebaseConfig);
const firestoreDB = firebase.firestore();
const productsDocRef = firestoreDB.collection('craxDistributor').doc('products');
const ordersDocRef = firestoreDB.collection('craxDistributor').doc('orders');

const DB = {
  KEYS: { productsCache: 'crax_products_cache_v1', ordersCache: 'crax_orders_cache_v1', theme: 'crax_theme_v1' },

  cacheProducts(products){ localStorage.setItem(this.KEYS.productsCache, JSON.stringify(products)); },
  cacheOrders(orders){ localStorage.setItem(this.KEYS.ordersCache, JSON.stringify(orders)); },
  loadCachedProducts(){
    const raw = localStorage.getItem(this.KEYS.productsCache);
    return raw ? JSON.parse(raw) : null;
  },
  loadCachedOrders(){
    const raw = localStorage.getItem(this.KEYS.ordersCache);
    return raw ? JSON.parse(raw) : null;
  },

  async fetchProducts(){
    const snap = await productsDocRef.get();
    return snap.exists && snap.data().list ? snap.data().list : null;
  },
  async fetchOrders(){
    const snap = await ordersDocRef.get();
    return snap.exists && snap.data().list ? snap.data().list : null;
  },

  persistProducts(products){
    this.cacheProducts(products);
    productsDocRef.set({ list: products }).catch(err => {
      console.error('Firestore product sync failed:', err);
      showToast('⚠️ Saved locally — will sync when online');
    });
  },
  persistOrders(orders){
    this.cacheOrders(orders);
    ordersDocRef.set({ list: orders }).catch(err => {
      console.error('Firestore order sync failed:', err);
      showToast('⚠️ Saved locally — will sync when online');
    });
  },

  loadTheme(){ return localStorage.getItem(this.KEYS.theme) || 'dark'; },
  saveTheme(theme){ localStorage.setItem(this.KEYS.theme, theme); }
};

/* ---------------- Default Seed Data ----------------
   Assumption: default opening stock = 50 Ladi per product,
   low-stock threshold = 10 Ladi. Adjust anytime from the
   Products screen. */
function buildDefaultProducts(){
  const seed = [
    // Ring — 14 pieces, ₹60
    ['Ring Tamato', 'Ring', 14, 60],
    ['Ring Masala', 'Ring', 14, 60],
    ['Ring Chatpata', 'Ring', 14, 60],
    ['Choco Ring', 'Ring', 14, 60],
    // Snacks — 12 pieces, ₹52
    ['Ring Strawberry', 'Snacks', 12, 52],
    ['Ring Mango', 'Snacks', 12, 52],
    ['Pipe', 'Snacks', 12, 52],
    ['Masala Pipe', 'Snacks', 12, 52],
    ['Noodles', 'Snacks', 12, 52],
    ['Chess Ball', 'Snacks', 12, 52],
    ['Pasta', 'Snacks', 12, 52],
    ['Biggis', 'Snacks', 12, 52],
    ['Fryumm', 'Snacks', 12, 52],
    // Chips — 12 pieces, ₹50
    ['Masala Chips', 'Chips', 12, 50],
    ['Tamato Chips', 'Chips', 12, 50],
    ['Onion Chips', 'Chips', 12, 50],
    ['Salted Chips', 'Chips', 12, 50],
    ['Pudina Chips', 'Chips', 12, 50],
    // Namkeen — 12 pieces, ₹48
    ['Aloo Bhujiya', 'Namkeen', 12, 48],
    ['Sesan Bhujiya', 'Namkeen', 12, 48],
    ['Khatta Mitha', 'Namkeen', 12, 48],
    ['Hari Matar', 'Namkeen', 12, 48],
    ['Mast Mofali', 'Namkeen', 12, 48],
    ['Punjabi Tadka', 'Namkeen', 12, 48],
    ['Moong Dal', 'Namkeen', 12, 48],
    ['Double Majja', 'Namkeen', 12, 48],
    ['Navratan', 'Namkeen', 12, 48],
  ];
  return seed.map((row, i) => ({
    id: i + 1,
    name: row[0],
    category: row[1],
    piecesPerLadi: row[2],
    mrpPerLadi: row[3],
    stockLadi: 50,
    lowLevel: 10
  }));
}

/* ---------------- App State ---------------- */
let products = [];
let orders = [];
let nextProductId = 1;
let nextOrderSeq = 1;

let activeCategory = 'All';
let editingProductId = null;
let currentOrderLines = []; // [{productId, name, qty, pieces, amount, piecesPerLadi, mrpPerLadi}]
let currentReportTab = 'today';
let lastInvoiceOrderId = null;

/* ---------------- Helpers ---------------- */
const fmtMoney = n => '₹' + Math.round(n || 0).toLocaleString('en-IN');
const todayISO = () => new Date().toISOString().slice(0, 10);
const todayDisplay = () => new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
const getProduct = id => products.find(p => p.id === id);

function productStatus(p){
  if (p.stockLadi <= 0) return { label: 'Out of Stock', cls: 'status-out' };
  if (p.stockLadi <= p.lowLevel) return { label: 'Low Stock', cls: 'status-low' };
  return { label: 'In Stock', cls: 'status-instock' };
}

function showToast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => t.classList.remove('show'), 1900);
}

/* ---------------- Navigation ---------------- */
function goPage(name){
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.nav === name));

  const subtitles = {
    dashboard: "Billing & Stock Manager",
    products: "Product Database",
    order: "Create a New Order",
    reports: "Sales & Stock Reports"
  };
  document.getElementById('pageSubtitle').textContent = subtitles[name] || '';

  if (name === 'dashboard') renderDashboard();
  if (name === 'products') renderProducts();
  if (name === 'order') renderOrderPage();
  if (name === 'reports') renderReports();

  window.scrollTo(0, 0);
}

document.querySelectorAll('[data-nav]').forEach(el => {
  el.addEventListener('click', () => goPage(el.dataset.nav));
});

/* ---------------- Theme Toggle ---------------- */
function applyTheme(theme){
  document.body.setAttribute('data-theme', theme);
  DB.saveTheme(theme);
}
document.getElementById('themeToggleBtn').addEventListener('click', () => {
  const current = document.body.getAttribute('data-theme');
  applyTheme(current === 'dark' ? 'light' : 'dark');
});
applyTheme(DB.loadTheme());

/* ---------------- Search Overlay ---------------- */
const searchOverlay = document.getElementById('searchOverlay');
document.getElementById('searchToggleBtn').addEventListener('click', () => {
  searchOverlay.classList.add('open');
  document.getElementById('globalSearchInput').value = '';
  document.getElementById('searchResults').innerHTML = '';
  document.getElementById('globalSearchInput').focus();
});
document.getElementById('searchCloseBtn').addEventListener('click', () => {
  searchOverlay.classList.remove('open');
});
document.getElementById('globalSearchInput').addEventListener('input', (e) => {
  runGlobalSearch(e.target.value.trim().toLowerCase());
});

function runGlobalSearch(q){
  const box = document.getElementById('searchResults');
  if (!q){ box.innerHTML = '<div class="empty-state">Type a product or customer name</div>'; return; }

  const matchedProducts = products.filter(p => p.name.toLowerCase().includes(q));
  const matchedOrders = orders.filter(o => o.customer.toLowerCase().includes(q));

  let html = '';

  if (matchedProducts.length){
    html += '<div class="card"><div class="card-head"><h2>Products</h2></div>';
    matchedProducts.forEach(p => {
      const st = productStatus(p);
      html += `<div class="list-row">
        <div><div class="lr-name">${p.name}</div><div class="lr-meta">${p.category} · ${p.stockLadi} Ladi left</div></div>
        <span class="status-pill ${st.cls}">${st.label}</span>
      </div>`;
    });
    html += '</div>';
  }

  if (matchedOrders.length){
    html += '<div class="card"><div class="card-head"><h2>Previous Orders</h2></div>';
    matchedOrders.slice(0, 20).forEach(o => {
      html += `<div class="list-row">
        <div><div class="lr-name">${o.customer}</div><div class="lr-meta">${o.invNo} · ${o.dateStr}</div></div>
        <div class="lr-val">${fmtMoney(o.totalAmount)}</div>
      </div>`;
    });
    html += '</div>';
  }

  box.innerHTML = html || '<div class="empty-state">No matches found</div>';
}

/* =========================================================
   DASHBOARD
   ========================================================= */
function renderDashboard(){
  document.getElementById('statTotalProducts').textContent = products.length;
  const totalStockPieces = products.reduce((sum, p) => sum + p.stockLadi * p.piecesPerLadi, 0);
  document.getElementById('statTotalStock').textContent = totalStockPieces.toLocaleString('en-IN');

  const todayOrders = orders.filter(o => o.dateISO === todayISO());
  document.getElementById('statTodayOrders').textContent = todayOrders.length;
  const todaySales = todayOrders.reduce((sum, o) => sum + o.totalAmount, 0);
  document.getElementById('statTodaySales').textContent = fmtMoney(todaySales);

  const lowItems = products.filter(p => p.stockLadi <= p.lowLevel);
  const banner = document.getElementById('stockAlertBanner');
  if (lowItems.length){
    banner.innerHTML = `<div class="alert-banner">
      <div class="ic">⚠️</div>
      <div class="txt"><b>Low / Out of Stock Alert</b>${lowItems.map(p => p.name + ' (' + p.stockLadi + ' Ladi)').join(', ')}</div>
    </div>`;
  } else {
    banner.innerHTML = '';
  }

  const wrap = document.getElementById('dashRecentOrders');
  const empty = document.getElementById('dashOrdersEmpty');
  if (!todayOrders.length){
    wrap.innerHTML = '';
    empty.style.display = 'block';
  } else {
    empty.style.display = 'none';
    wrap.innerHTML = todayOrders.slice(0, 8).map(o => `
      <div class="list-row">
        <div><div class="lr-name">${o.customer}</div><div class="lr-meta">${o.invNo} · ${o.lines.length} item(s) · ${o.totalPieces} pcs</div></div>
        <div class="lr-val">${fmtMoney(o.totalAmount)}</div>
      </div>`).join('');
  }
}

/* =========================================================
   PRODUCTS
   ========================================================= */
function renderCategoryChips(){
  const cats = ['All', ...new Set(products.map(p => p.category))];
  const wrap = document.getElementById('categoryChips');
  wrap.innerHTML = cats.map(c =>
    `<button class="chip ${c === activeCategory ? 'active' : ''}" data-cat="${c}">${c}</button>`
  ).join('');
  wrap.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => { activeCategory = chip.dataset.cat; renderProducts(); });
  });
}

function renderProducts(){
  renderCategoryChips();
  const list = activeCategory === 'All' ? products : products.filter(p => p.category === activeCategory);
  const wrap = document.getElementById('productListWrap');
  const empty = document.getElementById('productsEmpty');

  if (!list.length){
    wrap.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  wrap.innerHTML = list.map(p => {
    const st = productStatus(p);
    const pieces = p.stockLadi * p.piecesPerLadi;
    return `<div class="product-card">
      <div class="product-info">
        <div class="product-name">${p.name}</div>
        <div class="product-cat">${p.category} · ₹${p.mrpPerLadi}/Ladi</div>
        <div class="ladi-chip">1 Ladi = ${p.piecesPerLadi} pcs</div>
        <div class="product-actions">
          <button class="mini-btn" data-edit="${p.id}">Edit</button>
        </div>
      </div>
      <div class="product-right">
        <div class="product-stock">${p.stockLadi} Ladi</div>
        <div class="hint-text" style="margin-top:0;">${pieces} pcs</div>
        <span class="status-pill ${st.cls}">${st.label}</span>
      </div>
    </div>`;
  }).join('');

  wrap.querySelectorAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', () => openProductModal(parseInt(btn.dataset.edit)));
  });
}

/* ---- Product Modal ---- */
const productModal = document.getElementById('productModalBackdrop');

function openProductModal(id){
  editingProductId = id || null;
  const isEdit = !!id;
  document.getElementById('productModalTitle').textContent = isEdit ? 'Edit Product' : 'Add New Product';
  document.getElementById('deleteProductBtn').style.display = isEdit ? 'block' : 'none';

  // Refresh datalist of existing categories
  const cats = [...new Set(products.map(p => p.category))];
  document.getElementById('categoryList').innerHTML = cats.map(c => `<option value="${c}">`).join('');

  if (isEdit){
    const p = getProduct(id);
    document.getElementById('prodName').value = p.name;
    document.getElementById('prodCategory').value = p.category;
    document.getElementById('prodPieces').value = p.piecesPerLadi;
    document.getElementById('prodMrp').value = p.mrpPerLadi;
    document.getElementById('prodStock').value = p.stockLadi;
    document.getElementById('prodLowLevel').value = p.lowLevel;
  } else {
    ['prodName','prodCategory','prodPieces','prodMrp','prodStock','prodLowLevel'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('prodLowLevel').value = 10;
  }
  productModal.classList.add('show');
}

function closeProductModal(){
  productModal.classList.remove('show');
  editingProductId = null;
}

document.getElementById('openAddProductBtn').addEventListener('click', () => openProductModal(null));
document.getElementById('cancelProductBtn').addEventListener('click', closeProductModal);

document.getElementById('saveProductBtn').addEventListener('click', () => {
  const name = document.getElementById('prodName').value.trim();
  const category = document.getElementById('prodCategory').value.trim() || 'Uncategorised';
  const piecesPerLadi = parseInt(document.getElementById('prodPieces').value) || 0;
  const mrpPerLadi = parseFloat(document.getElementById('prodMrp').value) || 0;
  const stockLadi = parseFloat(document.getElementById('prodStock').value) || 0;
  const lowLevel = parseFloat(document.getElementById('prodLowLevel').value) || 10;

  if (!name || !piecesPerLadi || !mrpPerLadi){
    showToast('Name, Pieces/Ladi and MRP are required'); return;
  }

  if (editingProductId){
    const p = getProduct(editingProductId);
    Object.assign(p, { name, category, piecesPerLadi, mrpPerLadi, stockLadi, lowLevel });
    showToast('Product updated ✓');
  } else {
    products.push({ id: nextProductId++, name, category, piecesPerLadi, mrpPerLadi, stockLadi, lowLevel });
    showToast('Product added ✓');
  }
  DB.persistProducts(products);
  closeProductModal();
  renderProducts();
});

document.getElementById('deleteProductBtn').addEventListener('click', () => {
  if (!editingProductId) return;
  if (!confirm('Delete this product? This cannot be undone.')) return;
  products = products.filter(p => p.id !== editingProductId);
  DB.persistProducts(products);
  showToast('Product deleted');
  closeProductModal();
  renderProducts();
});

/* =========================================================
   NEW ORDER
   ========================================================= */
function renderOrderPage(){
  currentOrderLines = [];
  document.getElementById('orderCustomer').value = '';
  document.getElementById('orderQty').value = '';
  populateOrderProductSelect();
  populateCustomerSuggestions();
  updateOrderStockHint();
  renderOrderLines();
}

function populateOrderProductSelect(){
  const sel = document.getElementById('orderProduct');
  sel.innerHTML = products.map(p =>
    `<option value="${p.id}">${p.name} (${p.stockLadi} Ladi left)</option>`
  ).join('');
  updateOrderStockHint();
}

function populateCustomerSuggestions(){
  const names = [...new Set(orders.map(o => o.customer))];
  document.getElementById('customerSuggestions').innerHTML = names.map(n => `<option value="${n}">`).join('');
}

document.getElementById('orderProduct').addEventListener('change', updateOrderStockHint);
document.getElementById('orderQty').addEventListener('input', updateOrderStockHint);

function updateOrderStockHint(){
  const pid = parseInt(document.getElementById('orderProduct').value);
  const p = getProduct(pid);
  const qty = parseFloat(document.getElementById('orderQty').value) || 0;
  const hint = document.getElementById('orderStockHint');
  if (!p){ hint.textContent = ''; return; }

  if (qty > p.stockLadi){
    hint.textContent = `⚠️ Only ${p.stockLadi} Ladi available in stock`;
    hint.style.color = 'var(--red)';
  } else {
    hint.textContent = `Available: ${p.stockLadi} Ladi (${p.stockLadi * p.piecesPerLadi} pcs) · 1 Ladi = ${p.piecesPerLadi} pcs`;
    hint.style.color = 'var(--muted)';
  }
}

document.getElementById('addOrderLineBtn').addEventListener('click', () => {
  const pid = parseInt(document.getElementById('orderProduct').value);
  const qty = parseFloat(document.getElementById('orderQty').value);
  const p = getProduct(pid);

  if (!p){ showToast('Select a product'); return; }
  if (!qty || qty <= 0){ showToast('Enter a valid quantity'); return; }
  if (qty > p.stockLadi){ showToast(`Only ${p.stockLadi} Ladi in stock`); return; }

  const existingLine = currentOrderLines.find(l => l.productId === pid);
  const combinedQty = (existingLine ? existingLine.qty : 0) + qty;
  if (combinedQty > p.stockLadi){ showToast(`Only ${p.stockLadi} Ladi in stock`); return; }

  const pieces = qty * p.piecesPerLadi;
  const amount = qty * p.mrpPerLadi;

  if (existingLine){
    existingLine.qty += qty;
    existingLine.pieces += pieces;
    existingLine.amount += amount;
  } else {
    currentOrderLines.push({
      productId: pid, name: p.name, qty, pieces, amount,
      piecesPerLadi: p.piecesPerLadi, mrpPerLadi: p.mrpPerLadi
    });
  }

  document.getElementById('orderQty').value = '';
  updateOrderStockHint();
  renderOrderLines();
});

function renderOrderLines(){
  const wrap = document.getElementById('orderLinesWrap');
  const calcBox = document.getElementById('orderCalcBox');
  const genBtn = document.getElementById('generateBillBtn');

  if (!currentOrderLines.length){
    wrap.innerHTML = '';
    calcBox.style.display = 'none';
    genBtn.disabled = true;
    return;
  }

  wrap.innerHTML = currentOrderLines.map((l, idx) => `
    <div class="order-line">
      <div>
        <div class="ol-name">${l.name}</div>
        <div class="ol-meta">${l.qty} Ladi × ₹${l.mrpPerLadi} = ${l.pieces} pcs</div>
      </div>
      <div style="display:flex; align-items:center;">
        <div class="ol-amt">${fmtMoney(l.amount)}</div>
        <button class="ol-remove" data-remove="${idx}">&times;</button>
      </div>
    </div>`).join('');

  wrap.querySelectorAll('[data-remove]').forEach(btn => {
    btn.addEventListener('click', () => {
      currentOrderLines.splice(parseInt(btn.dataset.remove), 1);
      renderOrderLines();
    });
  });

  const totalPieces = currentOrderLines.reduce((s, l) => s + l.pieces, 0);
  const totalAmount = currentOrderLines.reduce((s, l) => s + l.amount, 0);
  document.getElementById('calcTotalPieces').textContent = totalPieces.toLocaleString('en-IN');
  document.getElementById('calcTotalItems').textContent = currentOrderLines.length;
  document.getElementById('calcGrandTotal').textContent = fmtMoney(totalAmount);
  calcBox.style.display = 'block';
  genBtn.disabled = false;
}

document.getElementById('generateBillBtn').addEventListener('click', () => {
  const customer = document.getElementById('orderCustomer').value.trim();
  if (!customer){ showToast('Enter customer name'); return; }
  if (!currentOrderLines.length){ showToast('Add at least one product'); return; }

  // Re-validate stock right before committing (guards against stale UI state)
  for (const l of currentOrderLines){
    const p = getProduct(l.productId);
    if (!p || l.qty > p.stockLadi){ showToast(`Not enough stock for ${l.name}`); return; }
  }

  // Deduct stock
  currentOrderLines.forEach(l => { getProduct(l.productId).stockLadi -= l.qty; });
  DB.persistProducts(products);

  const totalPieces = currentOrderLines.reduce((s, l) => s + l.pieces, 0);
  const totalAmount = currentOrderLines.reduce((s, l) => s + l.amount, 0);

  const order = {
    id: Date.now(),
    seq: nextOrderSeq++,
    invNo: 'INV-' + String(nextOrderSeq - 1).padStart(4, '0'),
    dateISO: todayISO(),
    dateStr: todayDisplay(),
    customer,
    lines: currentOrderLines.map(l => ({ ...l })),
    totalPieces,
    totalAmount
  };
  orders.unshift(order);
  DB.persistOrders(orders);

  showToast('Bill generated · Stock updated ✓');
  lastInvoiceOrderId = order.id;
  openInvoiceModal(order);

  currentOrderLines = [];
  document.getElementById('orderCustomer').value = '';
  renderOrderLines();
  populateOrderProductSelect();
});

/* =========================================================
   INVOICE
   ========================================================= */
const invoiceModal = document.getElementById('invoiceModalBackdrop');

function openInvoiceModal(order){
  document.getElementById('invNumberOut').textContent = order.invNo;
  document.getElementById('invDateOut').textContent = order.dateStr;
  document.getElementById('invCustomerOut').textContent = order.customer;
  document.getElementById('invItemsOut').innerHTML = order.lines.map(l => `
    <tr><td>${l.name}</td><td>${l.qty}</td><td>${l.pieces}</td><td class="ta-r">${fmtMoney(l.amount)}</td></tr>
  `).join('');
  document.getElementById('invTotalPiecesOut').textContent = order.totalPieces.toLocaleString('en-IN');
  document.getElementById('invGrandTotalOut').textContent = fmtMoney(order.totalAmount);
  invoiceModal.classList.add('show');
}

document.getElementById('closeInvoiceBtn').addEventListener('click', () => invoiceModal.classList.remove('show'));
document.getElementById('printInvoiceBtn').addEventListener('click', () => window.print());

document.getElementById('pdfInvoiceBtn').addEventListener('click', () => {
  // Placeholder: real PDF export (e.g. jsPDF or server-side render) can be wired in here later.
  showToast('PDF export coming soon — use Print for now');
});

document.getElementById('waInvoiceBtn').addEventListener('click', () => {
  const order = orders.find(o => o.id === lastInvoiceOrderId);
  if (!order) return;
  const itemLines = order.lines.map(l => `${l.name} x ${l.qty} Ladi (${l.pieces} pcs) = ${fmtMoney(l.amount)}`).join('\n');
  const msg = `*Crax Distributor Invoice*\n${order.invNo} | ${order.dateStr}\nCustomer: ${order.customer}\n\n${itemLines}\n\nTotal Pieces: ${order.totalPieces}\n*Grand Total: ${fmtMoney(order.totalAmount)}*\n\nThank you!`;
  window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
});

/* =========================================================
   REPORTS
   ========================================================= */
document.querySelectorAll('.rtab').forEach(tab => {
  tab.addEventListener('click', () => {
    currentReportTab = tab.dataset.rtab;
    document.querySelectorAll('.rtab').forEach(t => t.classList.toggle('active', t === tab));
    renderReports();
  });
});

function renderReports(){
  const summaryGrid = document.getElementById('reportSummaryGrid');
  const titleEl = document.getElementById('reportCardTitle');
  const body = document.getElementById('reportBody');
  const empty = document.getElementById('reportEmpty');

  const todayOrders = orders.filter(o => o.dateISO === todayISO());
  const todayRevenue = todayOrders.reduce((s, o) => s + o.totalAmount, 0);
  const totalRevenueAll = orders.reduce((s, o) => s + o.totalAmount, 0);

  // Summary cards change slightly per tab for relevance
  summaryGrid.innerHTML = `
    <div class="stat-card">
      <div class="stat-icon" style="background:rgba(255,106,26,.14); color:var(--accent);">🧾</div>
      <div class="stat-num">${todayOrders.length}</div>
      <div class="stat-label">Today's Orders</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon" style="background:rgba(45,212,167,.14); color:var(--teal);">💰</div>
      <div class="stat-num">${fmtMoney(todayRevenue)}</div>
      <div class="stat-label">Today's Revenue</div>
    </div>`;

  let rows = '';

  if (currentReportTab === 'today'){
    titleEl.textContent = "Today's Sales";
    rows = todayOrders.map(o => `
      <div class="list-row">
        <div><div class="lr-name">${o.customer}</div><div class="lr-meta">${o.invNo} · ${o.lines.length} item(s)</div></div>
        <div class="lr-val">${fmtMoney(o.totalAmount)}</div>
      </div>`).join('');
  }

  else if (currentReportTab === 'products'){
    titleEl.textContent = 'Product Wise Sales';
    const map = {};
    orders.forEach(o => o.lines.forEach(l => {
      if (!map[l.name]) map[l.name] = { qty: 0, amount: 0 };
      map[l.name].qty += l.qty; map[l.name].amount += l.amount;
    }));
    rows = Object.entries(map).sort((a, b) => b[1].amount - a[1].amount).map(([name, d]) => `
      <div class="list-row">
        <div><div class="lr-name">${name}</div><div class="lr-meta">${d.qty} Ladi sold</div></div>
        <div class="lr-val">${fmtMoney(d.amount)}</div>
      </div>`).join('');
  }

  else if (currentReportTab === 'top'){
    titleEl.textContent = 'Top Selling Products';
    const map = {};
    orders.forEach(o => o.lines.forEach(l => {
      if (!map[l.name]) map[l.name] = { qty: 0, amount: 0 };
      map[l.name].qty += l.qty; map[l.name].amount += l.amount;
    }));
    rows = Object.entries(map).sort((a, b) => b[1].qty - a[1].qty).slice(0, 10).map(([name, d], i) => `
      <div class="list-row">
        <div style="display:flex; align-items:center;"><span class="rank-badge">${i + 1}</span>
          <div><div class="lr-name">${name}</div><div class="lr-meta">${d.qty} Ladi sold</div></div>
        </div>
        <div class="lr-val">${fmtMoney(d.amount)}</div>
      </div>`).join('');
  }

  else if (currentReportTab === 'stock'){
    titleEl.textContent = 'Remaining Stock';
    rows = products.map(p => {
      const st = productStatus(p);
      return `<div class="list-row">
        <div><div class="lr-name">${p.name}</div><div class="lr-meta">${p.category}</div></div>
        <div style="text-align:right;">
          <div class="lr-val">${p.stockLadi} Ladi</div>
          <span class="status-pill ${st.cls}">${st.label}</span>
        </div>
      </div>`;
    }).join('');
  }

  else if (currentReportTab === 'orders'){
    titleEl.textContent = `All Orders (${orders.length}) · Total Revenue ${fmtMoney(totalRevenueAll)}`;
    rows = orders.map(o => `
      <div class="list-row">
        <div><div class="lr-name">${o.customer}</div><div class="lr-meta">${o.invNo} · ${o.dateStr} · ${o.lines.length} item(s)</div></div>
        <div class="lr-val">${fmtMoney(o.totalAmount)}</div>
      </div>`).join('');
  }

  if (!rows){
    body.innerHTML = '';
    empty.style.display = 'block';
  } else {
    empty.style.display = 'none';
    body.innerHTML = rows;
  }
}

/* ---------------- Init ---------------- */
async function initApp(){
  const loadingScreen = document.getElementById('loadingScreen');
  try {
    const [fetchedProducts, fetchedOrders] = await Promise.all([DB.fetchProducts(), DB.fetchOrders()]);

    if (fetchedProducts){
      products = fetchedProducts;
    } else {
      products = buildDefaultProducts();
      DB.persistProducts(products); // first-run seed, written to Firestore
    }

    orders = fetchedOrders || [];
    DB.cacheProducts(products);
    DB.cacheOrders(orders);
  } catch (err){
    console.error('Could not reach Firestore, using offline cache:', err);
    products = DB.loadCachedProducts() || buildDefaultProducts();
    orders = DB.loadCachedOrders() || [];
    showToast('📴 Offline — showing last saved data');
  }

  nextProductId = products.reduce((m, p) => Math.max(m, p.id), 0) + 1;
  nextOrderSeq = orders.reduce((m, o) => Math.max(m, o.seq || 0), 0) + 1;

  if (loadingScreen) loadingScreen.style.display = 'none';
  renderDashboard();
}

initApp();
