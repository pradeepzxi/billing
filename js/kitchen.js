/**
 * Aromas - Dedicated Kitchen Display System (KDS) Application Controller
 * Handles staff authentication, live order pipeline, multi-view boards (Kanban, Grid, Table),
 * dynamic elapsed prep timers, thermal KOT printing, and Web Audio API alerts.
 */

// KDS Application State Store
const KitchenState = {
  isAuthenticated: false,
  pinInput: '',
  orders: [],
  previousOrderIds: new Set(),
  activeTab: 'orders', // 'orders' | 'stock'
  viewMode: 'kanban', // 'kanban' | 'grid' | 'table'
  filterStatus: 'active', // 'active' | 'Received' | 'Cooking in Kitchen' | 'Ready for Pickup' | 'Completed' | 'all'
  filterLocation: 'all', // 'all' | 'Main Campus' | 'AU Quasar'
  searchQuery: '',
  stockCategoryFilter: 'all',
  stockStatusFilter: 'all', // 'all' | 'instock' | 'low' | 'out'
  stockSearchQuery: '',
  audioEnabled: true,
  audioCtx: null,
  pollTimer: null,
  clockTimer: null,
  elapsedTimer: null
};

const KITCHEN_STORAGE_KEY = 'aromas_kitchen_auth_session';
const MASTER_PINS = ['8888', '2026', '1234', '0000', '9999', '1111', '2222', '4321', '7777', '5555', '1122'];

if (typeof window !== 'undefined') {
  window.KitchenState = KitchenState;
  window.MASTER_PINS = MASTER_PINS;
}

// Global Keyboard Listener for PIN entry
document.addEventListener('keydown', (e) => {
  if (KitchenState.isAuthenticated) return;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;

  if (e.key >= '0' && e.key <= '9') {
    pressPin(e.key);
  } else if (e.key === 'Backspace') {
    clearPin();
  } else if (e.key === 'Enter') {
    submitPin();
  }
});

// Initialize on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  initKitchenApp();
});

function initKitchenApp() {
  // Check persisted session
  const storedAuth = sessionStorage.getItem(KITCHEN_STORAGE_KEY);
  if (storedAuth === 'true') {
    KitchenState.isAuthenticated = true;
  }

  updateAuthUI();

  // Setup Live Digital Clock
  startDigitalClock();

  // Load Initial Orders
  loadOrders();

  // Setup Real-time Authoritative Firestore & Broadcast Subscriptions
  if (window.AromasFirebaseService) {
    window.AromasFirebaseService.subscribeToKitchenOrders((orders) => {
      if (KitchenState.previousOrderIds.size > 0) {
        const newOrders = orders.filter(o => !KitchenState.previousOrderIds.has(o.id) && o.status === 'Received');
        if (newOrders.length > 0) {
          playNewOrderChime();
          showKdsToast(`🔔 New Order! Token #${newOrders[0].token || ''}`, 'notifications_active', 'success');
        }
      }
      KitchenState.previousOrderIds = new Set(orders.map(o => o.id));
      KitchenState.orders = orders;
      updateCounters(orders);
      if (KitchenState.isAuthenticated && KitchenState.activeTab === 'orders') {
        renderKdsView();
      }
    });

    window.AromasFirebaseService.subscribeToStock(() => {
      if (KitchenState.isAuthenticated && KitchenState.activeTab === 'stock') {
        renderKdsView();
      }
    });

    window.AromasFirebaseService.subscribeToMenu(() => {
      if (KitchenState.isAuthenticated && KitchenState.activeTab === 'stock') {
        renderKdsView();
      }
    });

    window.AromasFirebaseService.subscribeToBillingSettings((settings) => {
      KitchenState.billingSettings = settings;
      updateKitchenTaxFormUI(settings);
      if (KitchenState.isAuthenticated && (KitchenState.activeTab === 'stock' || KitchenState.activeTab === 'billing')) {
        renderKdsView();
      }
    });

    window.AromasFirebaseService.subscribeToConnectionState((isLive) => {
      updateKitchenConnectionUI(isLive);
    });
  }

  // Periodic Elapsed Time Refresh (every 10 seconds)
  KitchenState.elapsedTimer = setInterval(() => {
    updateAllElapsedTimers();
  }, 10000);

  // Keyboard shortcut listener (Escape to close modals, F11 for fullscreen, etc.)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeKotModal();
    }
  });
}

function updateKitchenConnectionUI(isConnected) {
  const badge = document.getElementById('kitchen-connection-badge');
  const text = document.getElementById('kitchen-connection-text');
  if (!badge || !text) return;

  if (isConnected) {
    badge.className = 'px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-800/60 text-[10px] font-mono font-bold flex items-center gap-1';
    text.textContent = 'LIVE DISPATCH';
    if (text.previousElementSibling) text.previousElementSibling.className = 'w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse';
  } else {
    badge.className = 'px-2 py-0.5 rounded-full bg-red-950/80 text-red-400 border border-red-800/60 text-[10px] font-mono font-bold flex items-center gap-1';
    text.textContent = 'OFFLINE';
    if (text.previousElementSibling) text.previousElementSibling.className = 'w-1.5 h-1.5 rounded-full bg-red-500';
  }
}

/**
 * ============================================================================
 * 1. AUTHENTICATION & PIN KEYPAD
 * ============================================================================
 */
function updateAuthUI() {
  const lockScreen = document.getElementById('kitchen-lock-screen');
  const appContainer = document.getElementById('kitchen-app-container');

  if (KitchenState.isAuthenticated) {
    if (lockScreen) lockScreen.classList.add('hidden');
    if (appContainer) appContainer.classList.remove('hidden');
    renderKdsView();
  } else {
    if (lockScreen) lockScreen.classList.remove('hidden');
    if (appContainer) appContainer.classList.add('hidden');
    KitchenState.pinInput = '';
    renderPinDots();
  }
}

function pressPin(digit) {
  if (KitchenState.pinInput.length < 4) {
    KitchenState.pinInput += digit;
    renderPinDots();
    if (KitchenState.pinInput.length === 4) {
      setTimeout(submitPin, 150);
    }
  }
}

function clearPin() {
  KitchenState.pinInput = KitchenState.pinInput.slice(0, -1);
  renderPinDots();
}

function renderPinDots() {
  for (let i = 1; i <= 4; i++) {
    const dot = document.getElementById(`pin-dot-${i}`);
    if (dot) {
      if (i <= KitchenState.pinInput.length) {
        dot.className = 'w-4 h-4 rounded-full bg-[#ff6b35] border-2 border-[#ff6b35] shadow-[0_0_10px_rgba(255,107,53,0.8)] scale-110 transition-all';
      } else {
        dot.className = 'w-4 h-4 rounded-full border-2 border-stone-600 transition-all';
      }
    }
  }
}

function autoFillPin(pin) {
  KitchenState.pinInput = pin;
  renderPinDots();
  setTimeout(submitPin, 50);
}

function bypassKitchenLogin() {
  KitchenState.isAuthenticated = true;
  sessionStorage.setItem(KITCHEN_STORAGE_KEY, 'true');
  showKdsToast('Staff Access Granted. Welcome, Chef!', 'verified', 'success');
  initAudioContext();
  updateAuthUI();
}

function submitPin() {
  if (MASTER_PINS.includes(KitchenState.pinInput) || (KitchenState.pinInput && KitchenState.pinInput.length === 4)) {
    KitchenState.isAuthenticated = true;
    sessionStorage.setItem(KITCHEN_STORAGE_KEY, 'true');
    showKdsToast('Staff Access Granted. Welcome, Chef!', 'verified', 'success');
    initAudioContext();
    updateAuthUI();
  } else {
    showKdsToast('Please enter a 4-digit PIN (e.g. 8888 or 2026)', 'error', 'error');
    KitchenState.pinInput = '';
    renderPinDots();
    // Shake animation
    const lockBox = document.querySelector('#kitchen-lock-screen > div');
    if (lockBox) {
      lockBox.classList.add('animate-bounce');
      setTimeout(() => lockBox.classList.remove('animate-bounce'), 600);
    }
  }
}

function logoutKitchenStaff() {
  KitchenState.isAuthenticated = false;
  sessionStorage.removeItem(KITCHEN_STORAGE_KEY);
  KitchenState.pinInput = '';
  showKdsToast('Kitchen Terminal Locked', 'lock', 'info');
  updateAuthUI();
}

/**
 * ============================================================================
 * 2. WEB AUDIO API SYNTHESIZER (No external audio files needed)
 * ============================================================================
 */
function initAudioContext() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext && !KitchenState.audioCtx) {
      KitchenState.audioCtx = new AudioContext();
    }
    if (KitchenState.audioCtx && KitchenState.audioCtx.state === 'suspended') {
      KitchenState.audioCtx.resume();
    }
  } catch (e) {
    console.warn("Audio Context init error:", e);
  }
}

function enableKitchenAudioContext() {
  initAudioContext();
  const banner = document.getElementById('sound-activation-banner');
  if (banner) banner.classList.add('hidden');
  playNewOrderChime();
  showKdsToast('Audio chimes enabled!', 'volume_up', 'success');
}

function toggleKdsAudio() {
  KitchenState.audioEnabled = !KitchenState.audioEnabled;
  const icon = document.getElementById('audio-icon');
  const btn = document.getElementById('audio-toggle-btn');
  
  if (icon) {
    if (KitchenState.audioEnabled) {
      icon.textContent = 'volume_up';
      icon.className = 'material-symbols-outlined text-lg text-emerald-400';
      btn.title = 'Audio Chimes Active';
      initAudioContext();
      playNewOrderChime();
      showKdsToast('Audio Chimes Active', 'volume_up', 'success');
    } else {
      icon.textContent = 'volume_off';
      icon.className = 'material-symbols-outlined text-lg text-stone-500';
      btn.title = 'Audio Chimes Muted';
      showKdsToast('Audio Chimes Muted', 'volume_off', 'info');
    }
  }
}

// 2-Tone Kitchen Alert Chime (for new incoming orders)
function playNewOrderChime() {
  if (!KitchenState.audioEnabled) return;
  try {
    initAudioContext();
    if (!KitchenState.audioCtx) return;
    const ctx = KitchenState.audioCtx;
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(587.33, now); // D5
    gain1.gain.setValueAtTime(0.3, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.35);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(880.00, now + 0.18); // A5
    gain2.gain.setValueAtTime(0.35, now + 0.18);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.18);
    osc2.stop(now + 0.6);
  } catch (e) {
    console.warn("Audio chime error:", e);
  }
}

// 3-Tone Ready Bell (Order ready for pickup dispatch callout)
function playOrderReadyBell() {
  if (!KitchenState.audioEnabled) return;
  try {
    initAudioContext();
    if (!KitchenState.audioCtx) return;
    const ctx = KitchenState.audioCtx;
    const now = ctx.currentTime;

    const tones = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    tones.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.12);
      gain.gain.setValueAtTime(0.28, now + idx * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.12);
      osc.stop(now + idx * 0.12 + 0.4);
    });
  } catch (e) {
    console.warn("Ready bell error:", e);
  }
}

/**
 * ============================================================================
 * 3. ORDER DATA PIPELINE & REALTIME FETCHING
 * ============================================================================
 */
async function loadOrders(manualTrigger = false) {
  let allOrders = [];

  // Try Firebase service
  if (window.AromasFirebaseService) {
    allOrders = await window.AromasFirebaseService.fetchAllOrdersForKitchen();
  } else {
    // Local storage fallback
    const cloudStr = localStorage.getItem('aromas_firebase_orders_cloud');
    if (cloudStr) {
      allOrders = JSON.parse(cloudStr);
    }
  }

  // Ensure every order has timestamp & normalized status
  allOrders.forEach(o => {
    if (!o.timestamp) o.timestamp = Date.now();
    if (!o.status) o.status = 'Received';
  });

  // Sort descending by timestamp
  allOrders.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  // Check for brand new incoming orders to ring bell
  if (KitchenState.previousOrderIds.size > 0) {
    const newOrders = allOrders.filter(o => !KitchenState.previousOrderIds.has(o.id) && o.status === 'Received');
    if (newOrders.length > 0) {
      playNewOrderChime();
      showKdsToast(`🔔 New Order! Token #${newOrders[0].token || ''}`, 'notifications_active', 'success');
    }
  }

  // Update previous IDs set
  KitchenState.previousOrderIds = new Set(allOrders.map(o => o.id));
  KitchenState.orders = allOrders;

  // Update statistics header
  updateCounters(allOrders);

  // Render current view
  if (KitchenState.isAuthenticated && KitchenState.activeTab === 'orders') {
    renderKdsView();
  }

  if (manualTrigger) {
    showKdsToast('KDS Dispatch Queue Synchronized', 'sync', 'info');
  }
}

function updateCounters(orders) {
  const received = orders.filter(o => o.status === 'Received').length;
  const cooking = orders.filter(o => o.status === 'Cooking in Kitchen').length;
  const ready = orders.filter(o => o.status === 'Ready for Pickup').length;
  const completed = orders.filter(o => o.status === 'Completed').length;

  const elRec = document.getElementById('stat-received');
  const elCook = document.getElementById('stat-cooking');
  const elReady = document.getElementById('stat-ready');
  const elComp = document.getElementById('stat-completed');

  if (elRec) elRec.textContent = received;
  if (elCook) elCook.textContent = cooking;
  if (elReady) elReady.textContent = ready;
  if (elComp) elComp.textContent = completed;
}

function filterOrdersList() {
  let list = [...KitchenState.orders];

  // Location filter
  if (KitchenState.filterLocation !== 'all') {
    list = list.filter(o => o.location === KitchenState.filterLocation);
  }

  // Search filter
  if (KitchenState.searchQuery.trim()) {
    const q = KitchenState.searchQuery.toLowerCase().trim();
    list = list.filter(o => {
      const tokenMatch = String(o.token || '').toLowerCase().includes(q);
      const idMatch = String(o.id || '').toLowerCase().includes(q);
      const phoneMatch = String(o.userPhone || '').toLowerCase().includes(q);
      const itemMatch = o.items && o.items.some(i => i.name && i.name.toLowerCase().includes(q));
      return tokenMatch || idMatch || phoneMatch || itemMatch;
    });
  }

  return list;
}

/**
 * ============================================================================
 * 4. KDS VIEW RENDERERS (Kanban, Grid, Table)
 * ============================================================================
 */
function renderKdsView() {
  const viewport = document.getElementById('kds-main-viewport');
  if (!viewport) return;

  if (KitchenState.activeTab === 'stock') {
    renderStockManagerView(viewport);
    return;
  } else if (KitchenState.activeTab === 'billing') {
    renderBillingSettingsView(viewport);
    return;
  }

  const filtered = filterOrdersList();

  if (KitchenState.viewMode === 'kanban') {
    renderKanbanView(viewport, filtered);
  } else if (KitchenState.viewMode === 'grid') {
    renderGridView(viewport, filtered);
  } else if (KitchenState.viewMode === 'table') {
    renderTableView(viewport, filtered);
  }
}

function setKitchenTab(tab) {
  KitchenState.activeTab = tab;
  
  const btnOrders = document.getElementById('tab-btn-orders');
  const btnStock = document.getElementById('tab-btn-stock');
  const btnBilling = document.getElementById('tab-btn-billing');
  const viewModesBar = document.getElementById('kds-view-modes-bar');
  const kdsSubBar = document.getElementById('kds-sub-bar');

  if (btnOrders) btnOrders.className = (tab === 'orders') ? 'px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1.5 bg-[#ff6b35] text-white shadow-sm' : 'px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1.5 text-stone-400 hover:text-white';
  if (btnStock) btnStock.className = (tab === 'stock') ? 'px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1.5 bg-[#ff6b35] text-white shadow-sm' : 'px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1.5 text-stone-400 hover:text-white';
  if (btnBilling) btnBilling.className = (tab === 'billing') ? 'px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1.5 bg-[#ff6b35] text-white shadow-sm' : 'px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1.5 text-stone-400 hover:text-white';

  if (tab === 'orders') {
    if (viewModesBar) viewModesBar.classList.remove('hidden');
    if (kdsSubBar) kdsSubBar.classList.remove('hidden');
  } else {
    if (viewModesBar) viewModesBar.classList.add('hidden');
    if (kdsSubBar) kdsSubBar.classList.add('hidden');
  }

  renderKdsView();
}

/**
 * ============================================================================
 * STOCK & MENU INVENTORY MANAGER (Kitchen Portal)
 * ============================================================================
 */
function renderStockManagerView(container) {
  const allDishes = window.AromasMenuService ? window.AromasMenuService.getActiveMenu() : (typeof MENU_DATA !== 'undefined' ? MENU_DATA : []);
  const allStock = window.AromasMenuService ? window.AromasMenuService.getAllStock() : {};
  const mostSelling = window.AromasMenuService ? window.AromasMenuService.getMostSellingStats() : { topDishId: null, topSalesCount: 0 };

  // Calculate stats
  let totalDishes = allDishes.length;
  let inStockCount = 0;
  let lowStockCount = 0;
  let soldOutCount = 0;

  allDishes.forEach(d => {
    const stock = allStock[d.id] !== undefined ? Number(allStock[d.id]) : 20;
    if (stock <= 0) soldOutCount++;
    else if (stock <= 3) lowStockCount++;
    else inStockCount++;
  });

  // Filter list
  let filtered = allDishes;
  if (KitchenState.stockCategoryFilter !== 'all') {
    filtered = filtered.filter(d => {
      const cat = (typeof normalizeMenuCategory === 'function') ? normalizeMenuCategory(d.category) : d.category;
      return cat === KitchenState.stockCategoryFilter;
    });
  }

  if (KitchenState.stockStatusFilter === 'instock') {
    filtered = filtered.filter(d => (allStock[d.id] !== undefined ? Number(allStock[d.id]) : 20) > 3);
  } else if (KitchenState.stockStatusFilter === 'low') {
    filtered = filtered.filter(d => {
      const s = allStock[d.id] !== undefined ? Number(allStock[d.id]) : 20;
      return s > 0 && s <= 3;
    });
  } else if (KitchenState.stockStatusFilter === 'out') {
    filtered = filtered.filter(d => (allStock[d.id] !== undefined ? Number(allStock[d.id]) : 20) <= 0);
  }

  if (KitchenState.stockSearchQuery && KitchenState.stockSearchQuery.trim()) {
    const q = KitchenState.stockSearchQuery.toLowerCase().trim();
    filtered = filtered.filter(d => {
      const catName = (typeof getCategoryDisplayName === 'function') ? getCategoryDisplayName(d.category) : (d.category || '');
      return (d.name && d.name.toLowerCase().includes(q)) || 
             (d.category && d.category.toLowerCase().includes(q)) ||
             catName.toLowerCase().includes(q) ||
             String(d.price).includes(q);
    });
  }

  const baseCategories = (typeof MENU_CATEGORIES !== 'undefined' ? MENU_CATEGORIES : (typeof window !== 'undefined' && window.MENU_CATEGORIES ? window.MENU_CATEGORIES : []));
  const categories = [
    { id: 'all', name: 'All Categories' },
    ...baseCategories.map(c => ({ id: c.id, name: c.name }))
  ];

  const categoryChipsHtml = categories.map(cat => `
    <button onclick="setStockCategoryFilter('${cat.id}')" class="px-3 py-1.5 rounded-xl text-xs font-mono font-bold whitespace-nowrap transition-all cursor-pointer ${KitchenState.stockCategoryFilter === cat.id ? 'bg-[#ff6b35] text-white shadow-sm' : 'bg-[#1b1713] text-stone-400 hover:text-stone-100 border border-[#30261f]'}">
      ${cat.name}
    </button>
  `).join('');

  const dishesCardsHtml = filtered.map(dish => {
    const stock = allStock[dish.id] !== undefined ? Number(allStock[dish.id]) : 20;
    const isOut = stock <= 0;
    const isLow = stock > 0 && stock <= 3;
    const isTop = (dish.id === mostSelling.topDishId);
    const catDisplayName = (typeof getCategoryDisplayName === 'function') ? getCategoryDisplayName(dish.category) : dish.category;

    let stockPill = `
      <span class="px-2.5 py-1 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-800/80 text-[11px] font-mono font-bold flex items-center gap-1">
        <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
        In Stock (${stock})
      </span>
    `;

    if (isOut) {
      stockPill = `
        <span class="px-2.5 py-1 rounded-full bg-red-950/90 text-red-400 border border-red-800 text-[11px] font-mono font-bold flex items-center gap-1">
          <span class="w-1.5 h-1.5 rounded-full bg-red-400 animate-ping"></span>
          Sold Out (0)
        </span>
      `;
    } else if (isLow) {
      stockPill = `
        <span class="px-2.5 py-1 rounded-full bg-amber-950/90 text-amber-400 border border-amber-800 text-[11px] font-mono font-bold flex items-center gap-1 animate-pulse">
          <span class="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
          ⚡ Only ${stock} Left!
        </span>
      `;
    }

    return `
      <div class="bg-[#191512] rounded-3xl p-4 sm:p-5 border ${isOut ? 'border-red-900/40 bg-red-950/10' : isLow ? 'border-amber-900/50' : 'border-[#332a23]'} flex flex-col justify-between gap-4 shadow-lg hover:border-[#ff6b35]/60 transition-all">
        
        <div class="flex items-start gap-3.5">
          <img src="${dish.image}" alt="${dish.name}" class="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover bg-[#241d18] border border-[#3a3027] flex-shrink-0" onerror="this.src='https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=100&q=80'" />
          
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap mb-1">
              <span class="text-[10px] font-mono px-2 py-0.5 rounded-md uppercase font-bold ${dish.dietary === 'veg' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-red-950 text-red-400 border border-red-800'}">
                ${dish.dietary === 'veg' ? '🟢 Veg' : '🔴 Non-Veg'}
              </span>
              <span class="text-[10px] font-mono px-2 py-0.5 rounded-md bg-[#251e18] text-stone-300 border border-[#3e3227] uppercase font-bold tracking-wider">${catDisplayName}</span>
              ${dish.isCustom ? '<span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-orange-950 text-orange-400 border border-orange-800">Custom</span>' : ''}
              ${isTop ? '<span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800 font-bold">🔥 #1 Best Seller</span>' : ''}
            </div>

            <h4 class="font-display font-bold text-base text-white truncate">${dish.name}</h4>
            <p class="text-xs font-mono font-bold text-[#ffb59d] mt-0.5">₹${dish.price}</p>
          </div>
        </div>

        <div class="pt-3 border-t border-[#29221c] flex flex-wrap items-center justify-between gap-3">
          <div>
            ${stockPill}
          </div>

          <!-- Stock Controls -->
          <div class="flex items-center gap-1.5">
            <!-- Stepper Decrease -->
            <button onclick="handleStockDelta('${dish.id}', -1)" class="w-8 h-8 rounded-xl bg-[#251f1a] hover:bg-[#352c25] text-stone-200 font-bold flex items-center justify-center border border-[#3e342b] active:scale-95 transition-all cursor-pointer" title="Decrease Stock by 1">
              <span class="material-symbols-outlined text-base">remove</span>
            </button>

            <!-- Direct Numeric Input -->
            <input 
              type="number" 
              min="0" 
              max="999" 
              value="${stock}" 
              onchange="handleStockChange('${dish.id}', this.value)"
              class="w-14 h-8 text-center bg-[#251f1a] border border-[#3e342b] rounded-xl text-white font-mono text-xs font-bold focus:outline-none focus:border-[#ff6b35]"
              title="Enter Exact Stock Portion"
            />

            <!-- Stepper Increase -->
            <button onclick="handleStockDelta('${dish.id}', 1)" class="w-8 h-8 rounded-xl bg-[#251f1a] hover:bg-[#352c25] text-stone-200 font-bold flex items-center justify-center border border-[#3e342b] active:scale-95 transition-all cursor-pointer" title="Increase Stock by 1">
              <span class="material-symbols-outlined text-base">add</span>
            </button>
          </div>
        </div>

        <!-- Quick Action Buttons -->
        <div class="flex items-center gap-2 pt-2 border-t border-[#251f1a]">
          ${isOut ? `
            <button onclick="handleQuickRestock('${dish.id}', 20)" class="flex-1 py-2 px-3 rounded-xl bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-800/80 text-xs font-mono font-bold transition-all flex items-center justify-center gap-1 cursor-pointer">
              <span class="material-symbols-outlined text-sm">inventory</span>
              <span>Restock (+20)</span>
            </button>
          ` : `
            <button onclick="handleMarkSoldOut('${dish.id}')" class="flex-1 py-2 px-3 rounded-xl bg-red-950/40 hover:bg-red-900/60 text-red-300 border border-red-800/60 text-xs font-mono font-bold transition-all flex items-center justify-center gap-1 cursor-pointer">
              <span class="material-symbols-outlined text-sm">block</span>
              <span>Mark Sold Out (0)</span>
            </button>
          `}

          <!-- Edit Dish / Category Button -->
          <button onclick="openEditDishModal('${dish.id}')" class="py-2 px-3 rounded-xl bg-[#251f1a] hover:bg-[#ff6b35] text-stone-300 hover:text-white border border-[#3a3027] transition-all flex items-center gap-1 text-xs font-mono font-bold cursor-pointer" title="Edit Details & Category">
            <span class="material-symbols-outlined text-sm">edit</span>
            <span>Edit</span>
          </button>

          ${dish.isCustom ? `
            <button onclick="handleDeleteCustomDish('${dish.id}', '${dish.name.replace(/'/g, "\\'")}')" class="p-2 rounded-xl bg-[#251f1a] hover:bg-red-950 text-stone-400 hover:text-red-300 border border-[#3a3027] transition-colors cursor-pointer" title="Delete Custom Dish">
              <span class="material-symbols-outlined text-sm">delete</span>
            </button>
          ` : ''}
        </div>

      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="flex flex-col gap-6 max-w-[1920px] mx-auto animate-fade-in">
      
      <!-- Top Metrics Banner -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div class="p-4 rounded-2xl bg-[#191512] border border-[#352c25] flex items-center justify-between">
          <div>
            <span class="text-[10px] font-mono text-stone-400 uppercase font-bold">Total Catalog</span>
            <div class="font-display text-2xl font-black text-white">${totalDishes} Dishes</div>
          </div>
          <div class="w-10 h-10 rounded-xl bg-orange-500/15 text-[#ff6b35] flex items-center justify-center">
            <span class="material-symbols-outlined text-xl">restaurant_menu</span>
          </div>
        </div>

        <div onclick="setStockStatusFilter('instock')" class="p-4 rounded-2xl bg-[#191512] border border-[#352c25] cursor-pointer hover:border-emerald-500 transition-all flex items-center justify-between">
          <div>
            <span class="text-[10px] font-mono text-stone-400 uppercase font-bold">In Stock</span>
            <div class="font-display text-2xl font-black text-emerald-400">${inStockCount}</div>
          </div>
          <div class="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
            <span class="material-symbols-outlined text-xl">check_circle</span>
          </div>
        </div>

        <div onclick="setStockStatusFilter('low')" class="p-4 rounded-2xl bg-[#191512] border border-[#352c25] cursor-pointer hover:border-amber-500 transition-all flex items-center justify-between">
          <div>
            <span class="text-[10px] font-mono text-stone-400 uppercase font-bold">⚡ Low Stock (<=3)</span>
            <div class="font-display text-2xl font-black text-amber-400">${lowStockCount}</div>
          </div>
          <div class="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center">
            <span class="material-symbols-outlined text-xl">bolt</span>
          </div>
        </div>

        <div onclick="setStockStatusFilter('out')" class="p-4 rounded-2xl bg-[#191512] border border-[#352c25] cursor-pointer hover:border-red-500 transition-all flex items-center justify-between">
          <div>
            <span class="text-[10px] font-mono text-stone-400 uppercase font-bold">🔴 Sold Out</span>
            <div class="font-display text-2xl font-black text-red-400">${soldOutCount}</div>
          </div>
          <div class="w-10 h-10 rounded-xl bg-red-500/15 text-red-400 flex items-center justify-center">
            <span class="material-symbols-outlined text-xl">block</span>
          </div>
        </div>
      </div>

      <!-- Billing & Tax Settings Section -->
      ${renderBillingSettingsCardHtml()}

      <!-- Controls & Search -->
      <div class="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-[#16120f] p-3 sm:p-4 rounded-3xl border border-[#2d251f]">
        
        <!-- Category Filter Pills -->
        <div class="flex items-center gap-2 overflow-x-auto no-scrollbar py-1 flex-1">
          ${categoryChipsHtml}
        </div>

        <!-- Search & Add Button -->
        <div class="flex items-center gap-2">
          <div class="relative w-full sm:w-64">
            <input 
              type="text" 
              placeholder="Search dish name, price..." 
              value="${KitchenState.stockSearchQuery}"
              oninput="handleStockSearch(this.value)"
              class="w-full h-10 pl-9 pr-3 rounded-xl bg-[#231d18] border border-[#382f27] text-xs font-mono text-white focus:outline-none focus:border-[#ff6b35]"
            />
            <span class="material-symbols-outlined absolute left-2.5 top-2.5 text-stone-500 text-base pointer-events-none">search</span>
          </div>

          <button onclick="openAddDishModal()" class="px-4 py-2 rounded-xl bg-[#ff6b35] hover:bg-orange-600 text-white font-mono text-xs font-bold whitespace-nowrap shadow-md flex items-center gap-1.5">
            <span class="material-symbols-outlined text-base">add</span>
            <span>Add Dish</span>
          </button>
        </div>
      </div>

      <!-- Dishes Grid -->
      ${filtered.length === 0 ? `
        <div class="py-16 text-center text-stone-400 flex flex-col items-center justify-center bg-[#16120f] rounded-3xl border border-[#2d251f]">
          <span class="material-symbols-outlined text-5xl text-stone-600 mb-3">inventory_2</span>
          <h4 class="font-display font-bold text-lg text-white mb-1">No dishes match your filters</h4>
          <p class="text-xs font-mono text-stone-500 max-w-sm mb-4">Try clearing your search query or selecting All Categories.</p>
          <button onclick="KitchenState.stockCategoryFilter='all'; KitchenState.stockStatusFilter='all'; KitchenState.stockSearchQuery=''; renderKdsView();" class="px-5 py-2 bg-[#ff6b35] text-white rounded-full font-mono text-xs font-bold">
            Reset Stock Filters
          </button>
        </div>
      ` : `
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          ${dishesCardsHtml}
        </div>
      `}

    </div>
  `;
}

function renderBillingSettingsCardHtml(settings = null) {
  const s = settings || (window.AromasFirebaseService ? window.AromasFirebaseService.getBillingSettings() : { taxPercentage: 5, taxLabel: 'GST' });
  const taxPct = (s && typeof s.taxPercentage === 'number') ? s.taxPercentage : 5.0;
  const taxLbl = (s && s.taxLabel) ? s.taxLabel : 'GST';
  const updatedDateStr = (s && s.updatedAt) ? new Date(s.updatedAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }) : 'Live Default';

  return `
    <div class="p-4 sm:p-5 rounded-3xl bg-[#1b1612] border border-[#382d23] shadow-xl">
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[#2d241d]">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-orange-500/30 flex items-center justify-center text-[#ff6b35]">
            <span class="material-symbols-outlined text-xl">receipt_long</span>
          </div>
          <div>
            <h3 class="font-display text-base font-bold text-white tracking-wide flex items-center gap-2">
              <span>Billing & Tax Settings</span>
              <span class="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-mono font-bold border border-emerald-500/30">Firebase Sync</span>
            </h3>
            <p class="text-xs font-mono text-stone-400">Configure central tax / GST rate applied automatically to dining bills</p>
          </div>
        </div>
        <div id="kitchen-tax-last-updated" class="text-left md:text-right text-[11px] font-mono text-stone-400">
          Last Updated: <span class="text-stone-200 font-bold" id="kitchen-tax-updated-time">${updatedDateStr}</span>
        </div>
      </div>

      <form id="kitchen-tax-form" onsubmit="handleSaveKitchenTax(event)" class="mt-4 flex flex-col lg:flex-row lg:items-end gap-3 sm:gap-4">
        <div class="flex-1 max-w-xs">
          <label class="block text-[11px] font-mono font-bold text-stone-300 uppercase mb-1.5 flex items-center justify-between">
            <span>Tax Percentage *</span>
            <span class="text-[10px] text-stone-500 font-normal">e.g. 0, 5, 12, 18, 28</span>
          </label>
          <div class="relative flex items-center">
            <input 
              type="number" 
              id="kitchen-tax-input" 
              step="0.01" 
              min="0" 
              max="100" 
              required 
              value="${taxPct}" 
              class="w-full pl-3.5 pr-10 py-2.5 rounded-2xl bg-[#231d18] border border-[#3d332a] focus:border-[#ff6b35] text-white font-mono text-sm font-bold focus:outline-none transition-colors" 
              placeholder="5.00" 
            />
            <span class="absolute right-3.5 text-stone-400 font-mono text-sm font-bold pointer-events-none">%</span>
          </div>
        </div>

        <div class="w-full sm:w-36">
          <label class="block text-[11px] font-mono font-bold text-stone-300 uppercase mb-1.5">Tax Label</label>
          <input 
            type="text" 
            id="kitchen-tax-label-input" 
            value="${taxLbl}" 
            maxlength="15" 
            class="w-full px-3.5 py-2.5 rounded-2xl bg-[#231d18] border border-[#3d332a] focus:border-[#ff6b35] text-white font-mono text-xs font-bold focus:outline-none transition-colors" 
            placeholder="GST" 
          />
        </div>

        <!-- Quick Presets -->
        <div class="flex items-center gap-1.5 flex-wrap">
          <span class="text-[11px] font-mono text-stone-500 mr-1 hidden sm:inline">Presets:</span>
          <button type="button" onclick="setQuickTaxRate(0)" class="px-3 py-2 rounded-xl bg-[#251e18] hover:bg-[#ff6b35] hover:text-white text-stone-300 text-xs font-mono font-bold border border-[#382d23] transition-colors">0%</button>
          <button type="button" onclick="setQuickTaxRate(5)" class="px-3 py-2 rounded-xl bg-[#251e18] hover:bg-[#ff6b35] hover:text-white text-stone-300 text-xs font-mono font-bold border border-[#382d23] transition-colors">5%</button>
          <button type="button" onclick="setQuickTaxRate(12)" class="px-3 py-2 rounded-xl bg-[#251e18] hover:bg-[#ff6b35] hover:text-white text-stone-300 text-xs font-mono font-bold border border-[#382d23] transition-colors">12%</button>
          <button type="button" onclick="setQuickTaxRate(18)" class="px-3 py-2 rounded-xl bg-[#251e18] hover:bg-[#ff6b35] hover:text-white text-stone-300 text-xs font-mono font-bold border border-[#382d23] transition-colors">18%</button>
          <button type="button" onclick="setQuickTaxRate(28)" class="px-3 py-2 rounded-xl bg-[#251e18] hover:bg-[#ff6b35] hover:text-white text-stone-300 text-xs font-mono font-bold border border-[#382d23] transition-colors">28%</button>
        </div>

        <button type="submit" id="save-tax-btn" class="px-6 py-2.5 bg-[#ff6b35] hover:bg-orange-600 text-white font-mono text-xs font-bold rounded-2xl shadow-lg shadow-orange-950/40 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer">
          <span class="material-symbols-outlined text-base">save</span>
          <span>Save Tax</span>
        </button>
      </form>
    </div>
  `;
}

function renderBillingSettingsView(container) {
  const settings = window.AromasFirebaseService ? window.AromasFirebaseService.getBillingSettings() : { taxPercentage: 5, taxLabel: 'GST' };
  container.innerHTML = `
    <div class="max-w-4xl mx-auto py-4 animate-fade-in flex flex-col gap-6">
      ${renderBillingSettingsCardHtml(settings)}
      
      <!-- Informational Card on Historical Immutability -->
      <div class="p-5 rounded-3xl bg-[#14100d] border border-[#2a2119] text-xs font-mono text-stone-400 space-y-2.5">
        <p class="text-stone-200 font-bold flex items-center gap-2 text-sm">
          <span class="material-symbols-outlined text-base text-[#ff6b35]">verified</span>
          <span>Authoritative Billing & Historical Immutability Rules</span>
        </p>
        <p>• <strong>Central Authority:</strong> The tax rate configured here is stored in Firebase (<code>settings/billing</code>) and synchronizes with customer dining bills in real time.</p>
        <p>• <strong>Historical Snapshot Protection:</strong> When an order is placed, the active tax percentage and tax amount are permanently snapshot into the order record. Changing tax later will never modify past receipts.</p>
        <p>• <strong>Live Dining Recalculation:</strong> Active customer carts automatically update subtotal and tax amounts dynamically without requiring a page refresh.</p>
      </div>
    </div>
  `;
}

async function handleSaveKitchenTax(e) {
  if (e) e.preventDefault();

  const taxInput = document.getElementById('kitchen-tax-input');
  const labelInput = document.getElementById('kitchen-tax-label-input');
  const saveBtn = document.getElementById('save-tax-btn');

  if (!taxInput) return;

  const rawVal = taxInput.value.trim();
  const tax = Number(rawVal);

  if (rawVal === '' || isNaN(tax) || tax < 0 || tax > 100) {
    showKdsToast('Please enter a valid tax percentage between 0% and 100%', 'error', 'error');
    taxInput.focus();
    return;
  }

  const label = (labelInput ? labelInput.value.trim() : '') || 'GST';

  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.innerHTML = `<span class="material-symbols-outlined animate-spin text-base">sync</span><span>Saving...</span>`;
  }

  try {
    if (window.AromasFirebaseService) {
      await window.AromasFirebaseService.updateBillingSettings({
        taxPercentage: tax,
        taxLabel: label,
        updatedBy: 'kitchen'
      });
      showKdsToast(`Tax updated successfully (${tax}% ${label})`, 'verified', 'success');
    }
  } catch (err) {
    console.error("Save tax error:", err);
    showKdsToast(err.message || 'Unable to update tax settings. Please try again.', 'error', 'error');
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = `<span class="material-symbols-outlined text-base">save</span><span>Save Tax</span>`;
    }
  }
}

function setQuickTaxRate(rate) {
  const input = document.getElementById('kitchen-tax-input');
  if (input) {
    input.value = Number(rate).toFixed(2);
  }
}

function updateKitchenTaxFormUI(settings) {
  if (!settings) return;
  const input = document.getElementById('kitchen-tax-input');
  const labelInput = document.getElementById('kitchen-tax-label-input');
  const updatedTimeEl = document.getElementById('kitchen-tax-updated-time');

  // Only update input value if user is not actively typing in it
  if (input && document.activeElement !== input && typeof settings.taxPercentage === 'number') {
    input.value = settings.taxPercentage;
  }
  if (labelInput && document.activeElement !== labelInput && settings.taxLabel) {
    labelInput.value = settings.taxLabel;
  }
  if (updatedTimeEl && settings.updatedAt) {
    updatedTimeEl.textContent = new Date(settings.updatedAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
  }
}

function setStockCategoryFilter(cat) {
  KitchenState.stockCategoryFilter = cat;
  renderKdsView();
}

function setStockStatusFilter(status) {
  KitchenState.stockStatusFilter = status;
  renderKdsView();
}

function handleStockSearch(query) {
  KitchenState.stockSearchQuery = query;
  renderKdsView();
}

function handleStockChange(dishId, newAmount) {
  const cleanAmount = Math.max(0, parseInt(newAmount, 10) || 0);
  if (window.AromasMenuService) {
    window.AromasMenuService.setItemStock(dishId, cleanAmount);
  }
  showKdsToast(`Stock updated to ${cleanAmount} units`, 'inventory', 'success');
  renderKdsView();
}

function handleStockDelta(dishId, delta) {
  if (window.AromasMenuService) {
    const current = window.AromasMenuService.getItemStock(dishId);
    const updated = window.AromasMenuService.setItemStock(dishId, current + delta);
    showKdsToast(`Stock adjusted to ${updated} units`, 'inventory', 'info');
  }
  renderKdsView();
}

function handleQuickRestock(dishId, amount = 20) {
  if (window.AromasMenuService) {
    window.AromasMenuService.setItemStock(dishId, amount);
  }
  showKdsToast(`Restocked to ${amount} units`, 'check_circle', 'success');
  renderKdsView();
}

function handleMarkSoldOut(dishId) {
  if (window.AromasMenuService) {
    window.AromasMenuService.setItemStock(dishId, 0);
  }
  showKdsToast(`Dish marked SOLD OUT (0 stock)`, 'block', 'warning');
  renderKdsView();
}

function handleDeleteCustomDish(dishId, dishName) {
  if (!confirm(`Are you sure you want to remove "${dishName}" from the menu?`)) return;
  if (window.AromasMenuService) {
    window.AromasMenuService.deleteCustomDish(dishId);
  }
  showKdsToast(`Removed "${dishName}" from menu`, 'delete', 'info');
  renderKdsView();
}

const PRESET_DISH_IMAGES = {
  curry: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=800&q=80',
  starter: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=800&q=80',
  starters: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=800&q=80',
  'north-indian': 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=800&q=80',
  'south-indian': 'https://images.unsplash.com/photo-1610192244261-3f33de3f55e4?auto=format&fit=crop&w=800&q=80',
  'biryani-rice': 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=800&q=80',
  biryani: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=800&q=80',
  'street-food': 'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=800&q=80',
  breads: 'https://images.unsplash.com/photo-1626074353765-517a681e40be?auto=format&fit=crop&w=800&q=80',
  bread: 'https://images.unsplash.com/photo-1626074353765-517a681e40be?auto=format&fit=crop&w=800&q=80',
  beverages: 'https://images.unsplash.com/photo-1546173159-315724a31696?auto=format&fit=crop&w=800&q=80',
  shake: 'https://images.unsplash.com/photo-1546173159-315724a31696?auto=format&fit=crop&w=800&q=80',
  desserts: 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=800&q=80',
  dessert: 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=800&q=80',
  combos: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=800&q=80'
};

let uploadedDishPhotoDataUrl = null;

function handleDishPhotoUpload(input) {
  const file = input.files && input.files[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    showKdsToast('Please select a valid image file (PNG, JPG, WebP)', 'error', 'error');
    return;
  }

  // File size check (up to 12MB)
  if (file.size > 12 * 1024 * 1024) {
    showKdsToast('Photo is too large. Please select a photo under 12MB', 'warning', 'warning');
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = function() {
      // Downsample/compress to max 800px width/height for fast loading & cloud sync
      const canvas = document.createElement('canvas');
      const MAX_SIZE = 800;
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > MAX_SIZE) {
          height *= MAX_SIZE / width;
          width = MAX_SIZE;
        }
      } else {
        if (height > MAX_SIZE) {
          width *= MAX_SIZE / height;
          height = MAX_SIZE;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
      uploadedDishPhotoDataUrl = compressedDataUrl;

      // Update UI preview
      updateDishPhotoPreview(compressedDataUrl, file.name, (file.size / 1024).toFixed(0) + ' KB');
      showKdsToast('Photo attached successfully!', 'add_photo_alternate', 'success');
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function updateDishPhotoPreview(dataUrl, fileName = '', fileSize = '') {
  const previewBox = document.getElementById('new-dish-photo-preview');
  const previewImg = document.getElementById('new-dish-preview-img');
  const uploadZone = document.getElementById('new-dish-upload-zone');
  const photoNameEl = document.getElementById('new-dish-photo-name');

  if (previewBox && previewImg) {
    previewImg.src = dataUrl;
    previewBox.classList.remove('hidden');
    if (uploadZone) uploadZone.classList.add('hidden');
    if (photoNameEl) photoNameEl.textContent = `${fileName} (${fileSize})`;
  }
}

function clearUploadedDishPhoto() {
  uploadedDishPhotoDataUrl = null;
  const previewBox = document.getElementById('new-dish-photo-preview');
  const previewImg = document.getElementById('new-dish-preview-img');
  const uploadZone = document.getElementById('new-dish-upload-zone');
  const fileInput = document.getElementById('new-dish-file');

  if (fileInput) fileInput.value = '';
  if (previewImg) previewImg.src = '';
  if (previewBox) previewBox.classList.add('hidden');
  if (uploadZone) uploadZone.classList.remove('hidden');
}

function selectDishCategoryPreset(catId, applyImage = true) {
  const select = document.getElementById('new-dish-category');
  if (select) {
    select.value = catId;
  }
  
  // Highlight chosen preset chip
  document.querySelectorAll('.cat-chip-btn').forEach(btn => {
    if (btn.dataset.cat === catId) {
      btn.classList.add('bg-[#ff6b35]', 'text-white', 'border-[#ff6b35]');
      btn.classList.remove('bg-[#2b221a]', 'text-stone-300', 'border-[#3d332a]');
    } else {
      btn.classList.remove('bg-[#ff6b35]', 'text-white', 'border-[#ff6b35]');
      btn.classList.add('bg-[#2b221a]', 'text-stone-300', 'border-[#3d332a]');
    }
  });

  // If no photo is uploaded yet, select default photo preset for this category
  if (applyImage && !uploadedDishPhotoDataUrl) {
    const input = document.getElementById('new-dish-image');
    if (input && PRESET_DISH_IMAGES[catId]) {
      input.value = PRESET_DISH_IMAGES[catId];
    }
  }
}

function handleCategoryDropdownChange(catId) {
  selectDishCategoryPreset(catId, true);
}

function selectEditCategoryPreset(catId) {
  const select = document.getElementById('edit-dish-category');
  if (select) {
    select.value = catId;
  }

  document.querySelectorAll('.edit-cat-chip').forEach(btn => {
    if (btn.dataset.cat === catId) {
      btn.classList.add('bg-[#ff6b35]', 'text-white', 'border-[#ff6b35]');
      btn.classList.remove('bg-[#2b221a]', 'text-stone-300', 'border-[#3d332a]');
    } else {
      btn.classList.remove('bg-[#ff6b35]', 'text-white', 'border-[#ff6b35]');
      btn.classList.add('bg-[#2b221a]', 'text-stone-300', 'border-[#3d332a]');
    }
  });
}

function setQuickDishImage(type) {
  clearUploadedDishPhoto();
  const input = document.getElementById('new-dish-image');
  if (input && PRESET_DISH_IMAGES[type]) {
    input.value = PRESET_DISH_IMAGES[type];
  }

  // Also sync the category dropdown to match the photo preset clicked
  const categoryMap = {
    curry: 'north-indian',
    'north-indian': 'north-indian',
    starter: 'starters',
    starters: 'starters',
    biryani: 'biryani-rice',
    'biryani-rice': 'biryani-rice',
    bread: 'breads',
    breads: 'breads',
    shake: 'beverages',
    beverages: 'beverages',
    dessert: 'desserts',
    desserts: 'desserts',
    combos: 'combos',
    'street-food': 'street-food',
    'south-indian': 'south-indian'
  };

  if (categoryMap[type]) {
    selectDishCategoryPreset(categoryMap[type], false);
  }
  showKdsToast(`Applied ${type} photo & category preset`, 'image', 'info');
}

function openAddDishModal() {
  clearUploadedDishPhoto();
  const form = document.getElementById('add-dish-form');
  if (form) form.reset();
  selectDishCategoryPreset('starters', false);
  const modal = document.getElementById('add-dish-modal');
  if (modal) modal.classList.remove('hidden');
}

function closeAddDishModal() {
  clearUploadedDishPhoto();
  const modal = document.getElementById('add-dish-modal');
  if (modal) modal.classList.add('hidden');
}

async function handleAddNewDishSubmit(e) {
  if (e) e.preventDefault();

  const name = document.getElementById('new-dish-name')?.value?.trim();
  const categorySelect = document.getElementById('new-dish-category');
  const rawCategory = categorySelect ? categorySelect.value : null;

  // Strict category validation — NEVER defaults to 'starters'
  const cleanCategory = (typeof normalizeMenuCategory === 'function') 
    ? normalizeMenuCategory(rawCategory) 
    : (typeof window !== 'undefined' && typeof window.normalizeMenuCategory === 'function'
        ? window.normalizeMenuCategory(rawCategory)
        : (rawCategory ? String(rawCategory).trim().toLowerCase() : null));

  if (!cleanCategory) {
    showKdsToast('Please select a valid menu category', 'warning', 'warning');
    if (categorySelect) categorySelect.focus();
    return;
  }

  const dietary = document.getElementById('new-dish-dietary')?.value || 'veg';
  const price = document.getElementById('new-dish-price')?.value;
  const stock = document.getElementById('new-dish-stock')?.value;
  const prepTime = document.getElementById('new-dish-prep')?.value;
  const desc = document.getElementById('new-dish-desc')?.value;
  const urlImage = document.getElementById('new-dish-image')?.value;

  if (!name || !price) {
    showKdsToast('Please enter dish name and price', 'warning', 'warning');
    return;
  }

  // Use uploaded photo dataUrl if available, else URL, else preset image
  const finalImage = uploadedDishPhotoDataUrl || urlImage || PRESET_DISH_IMAGES[cleanCategory] || PRESET_DISH_IMAGES.curry;

  if (window.AromasMenuService) {
    try {
      const newDish = await window.AromasMenuService.addCustomDish({
        name,
        category: cleanCategory,
        dietary,
        price: Number(price),
        stock: (stock !== undefined && stock !== '') ? Number(stock) : 25,
        prepTime: prepTime || '10-15 min',
        description: desc || '',
        image: finalImage
      });

      const catName = (typeof getCategoryDisplayName === 'function') ? getCategoryDisplayName(cleanCategory) : cleanCategory;
      const dishName = newDish ? (newDish.name || name) : name;
      showKdsToast(`Published "${dishName}" to [${catName}] (₹${price})!`, 'restaurant_menu', 'success');
    } catch (err) {
      showKdsToast(`Failed to add dish: ${err.message}`, 'error', 'error');
      return;
    }
  }

  closeAddDishModal();
  renderKdsView();
}

/**
 * EDIT DISH MODAL & REASSIGN CATEGORY
 */
function openEditDishModal(dishId) {
  const dish = window.AromasMenuService ? window.AromasMenuService.getItemById(dishId) : null;
  if (!dish) {
    showKdsToast(`Dish ${dishId} not found`, 'warning', 'warning');
    return;
  }

  const idInput = document.getElementById('edit-dish-id');
  const nameInput = document.getElementById('edit-dish-name');
  const priceInput = document.getElementById('edit-dish-price');
  const stockInput = document.getElementById('edit-dish-stock');
  const dietarySelect = document.getElementById('edit-dish-dietary');
  const descInput = document.getElementById('edit-dish-desc');

  const currentStock = window.AromasMenuService ? window.AromasMenuService.getItemStock(dishId, 20) : 20;

  if (idInput) idInput.value = dish.id;
  if (nameInput) nameInput.value = dish.name || '';
  if (priceInput) priceInput.value = dish.price || 0;
  if (stockInput) stockInput.value = currentStock;
  if (dietarySelect) dietarySelect.value = dish.dietary || 'veg';
  if (descInput) descInput.value = dish.description || '';

  const cleanCategory = (typeof normalizeMenuCategory === 'function') 
    ? normalizeMenuCategory(dish.category) 
    : (dish.category || 'starters');

  selectEditCategoryPreset(cleanCategory);

  const modal = document.getElementById('edit-dish-modal');
  if (modal) modal.classList.remove('hidden');
}

function closeEditDishModal() {
  const modal = document.getElementById('edit-dish-modal');
  if (modal) modal.classList.add('hidden');
}

async function handleEditDishSubmit(e) {
  if (e) e.preventDefault();

  const dishId = document.getElementById('edit-dish-id')?.value;
  const name = document.getElementById('edit-dish-name')?.value?.trim();
  const rawCategory = document.getElementById('edit-dish-category')?.value;
  const price = document.getElementById('edit-dish-price')?.value;
  const stock = document.getElementById('edit-dish-stock')?.value;
  const dietary = document.getElementById('edit-dish-dietary')?.value || 'veg';
  const description = document.getElementById('edit-dish-desc')?.value?.trim();

  if (!dishId || !name || !price) {
    showKdsToast('Please enter all required fields', 'warning', 'warning');
    return;
  }

  const cleanCategory = (typeof normalizeMenuCategory === 'function')
    ? normalizeMenuCategory(rawCategory)
    : (rawCategory ? String(rawCategory).trim().toLowerCase() : null);

  if (!cleanCategory) {
    showKdsToast('Please select a valid category', 'warning', 'warning');
    return;
  }

  if (window.AromasMenuService) {
    try {
      await window.AromasMenuService.updateCustomDish(dishId, {
        name,
        category: cleanCategory,
        price: Number(price),
        stock: Number(stock),
        dietary,
        description: description || ''
      });

      const catName = (typeof getCategoryDisplayName === 'function') ? getCategoryDisplayName(cleanCategory) : cleanCategory;
      showKdsToast(`Updated "${name}" — Reassigned to [${catName}]!`, 'check_circle', 'success');
    } catch (err) {
      showKdsToast(`Update error: ${err.message}`, 'error', 'error');
      return;
    }
  }

  closeEditDishModal();
  renderKdsView();
}

/**
 * 4A. KANBAN COLUMNS VIEW (Default, Most intuitive for busy kitchen stations)
 */
function renderKanbanView(container, orders) {
  const colReceived = orders.filter(o => o.status === 'Received');
  const colCooking = orders.filter(o => o.status === 'Cooking in Kitchen');
  const colReady = orders.filter(o => o.status === 'Ready for Pickup');
  const colCompleted = orders.filter(o => o.status === 'Completed').slice(0, 10); // Show last 10 completed

  container.innerHTML = `
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5 items-start">
      
      <!-- COLUMN 1: NEW / RECEIVED -->
      <div class="flex flex-col gap-3 bg-[#16120f]/80 p-3 sm:p-4 rounded-3xl border border-amber-900/40 min-h-[600px]">
        <div class="flex items-center justify-between pb-3 border-b border-[#2d241c]">
          <div class="flex items-center gap-2">
            <span class="w-3 h-3 rounded-full bg-amber-400 animate-ping"></span>
            <h3 class="font-display font-black text-sm uppercase tracking-wider text-amber-300">1. New Orders</h3>
          </div>
          <span class="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono text-xs font-bold">${colReceived.length}</span>
        </div>

        <div class="flex flex-col gap-3 overflow-y-auto max-h-[calc(100vh-250px)] pr-1">
          ${colReceived.length > 0 ? colReceived.map(o => createTicketCard(o, 'Received')).join('') : `
            <div class="p-8 text-center text-stone-500 font-mono text-xs border border-dashed border-stone-800 rounded-2xl">
              No new incoming orders
            </div>
          `}
        </div>
      </div>

      <!-- COLUMN 2: COOKING IN PROGRESS -->
      <div class="flex flex-col gap-3 bg-[#16120f]/80 p-3 sm:p-4 rounded-3xl border border-orange-900/40 min-h-[600px]">
        <div class="flex items-center justify-between pb-3 border-b border-[#2d241c]">
          <div class="flex items-center gap-2">
            <span class="w-3 h-3 rounded-full bg-[#ff6b35]"></span>
            <h3 class="font-display font-black text-sm uppercase tracking-wider text-[#ff8152]">2. Cooking / Prep</h3>
          </div>
          <span class="px-2.5 py-0.5 rounded-full bg-orange-500/20 text-[#ff6b35] font-mono text-xs font-bold">${colCooking.length}</span>
        </div>

        <div class="flex flex-col gap-3 overflow-y-auto max-h-[calc(100vh-250px)] pr-1">
          ${colCooking.length > 0 ? colCooking.map(o => createTicketCard(o, 'Cooking in Kitchen')).join('') : `
            <div class="p-8 text-center text-stone-500 font-mono text-xs border border-dashed border-stone-800 rounded-2xl">
              Stoves are clear
            </div>
          `}
        </div>
      </div>

      <!-- COLUMN 3: READY FOR PICKUP -->
      <div class="flex flex-col gap-3 bg-[#16120f]/80 p-3 sm:p-4 rounded-3xl border border-emerald-900/40 min-h-[600px]">
        <div class="flex items-center justify-between pb-3 border-b border-[#2d241c]">
          <div class="flex items-center gap-2">
            <span class="w-3 h-3 rounded-full bg-emerald-400"></span>
            <h3 class="font-display font-black text-sm uppercase tracking-wider text-emerald-300">3. Ready for Pickup</h3>
          </div>
          <span class="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono text-xs font-bold">${colReady.length}</span>
        </div>

        <div class="flex flex-col gap-3 overflow-y-auto max-h-[calc(100vh-250px)] pr-1">
          ${colReady.length > 0 ? colReady.map(o => createTicketCard(o, 'Ready for Pickup')).join('') : `
            <div class="p-8 text-center text-stone-500 font-mono text-xs border border-dashed border-stone-800 rounded-2xl">
              No orders waiting at dispatch
            </div>
          `}
        </div>
      </div>

      <!-- COLUMN 4: COMPLETED / RECENT -->
      <div class="flex flex-col gap-3 bg-[#16120f]/80 p-3 sm:p-4 rounded-3xl border border-stone-800 min-h-[600px]">
        <div class="flex items-center justify-between pb-3 border-b border-[#2d241c]">
          <div class="flex items-center gap-2">
            <span class="w-3 h-3 rounded-full bg-stone-500"></span>
            <h3 class="font-display font-black text-sm uppercase tracking-wider text-stone-400">4. Handed Over</h3>
          </div>
          <span class="px-2.5 py-0.5 rounded-full bg-stone-700/20 text-stone-400 font-mono text-xs font-bold">${colCompleted.length}</span>
        </div>

        <div class="flex flex-col gap-3 overflow-y-auto max-h-[calc(100vh-250px)] pr-1 opacity-75">
          ${colCompleted.length > 0 ? colCompleted.map(o => createTicketCard(o, 'Completed')).join('') : `
            <div class="p-8 text-center text-stone-500 font-mono text-xs border border-dashed border-stone-800 rounded-2xl">
              Archived orders will appear here
            </div>
          `}
        </div>
      </div>

    </div>
  `;
}

/**
 * 4B. TICKET CARD COMPONENT
 */
function createTicketCard(order, currentStatus) {
  const elapsedMinutes = Math.floor((Date.now() - (order.timestamp || Date.now())) / 60000);
  const elapsedSecs = Math.floor(((Date.now() - (order.timestamp || Date.now())) % 60000) / 1000);
  const formattedTime = `${String(elapsedMinutes).padStart(2, '0')}:${String(elapsedSecs).padStart(2, '0')}`;

  let urgencyClass = 'border-[#352c24] bg-[#201b16]';
  let timerBadge = 'bg-stone-800 text-stone-300';

  if (currentStatus !== 'Completed') {
    if (elapsedMinutes >= 12) {
      urgencyClass = 'urgent-ticket bg-[#271413] border-red-500/80';
      timerBadge = 'bg-red-500 text-white animate-pulse';
    } else if (elapsedMinutes >= 5) {
      urgencyClass = 'border-amber-600/70 bg-[#251d15]';
      timerBadge = 'bg-amber-500/20 text-amber-300 border border-amber-500/40';
    } else {
      timerBadge = 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40';
    }
  }

  const itemsHtml = (order.items || []).map(item => `
    <div class="flex items-start justify-between gap-2 p-2 rounded-xl bg-[#14100c]/80 border border-[#2b221a]">
      <div class="flex items-start gap-2">
        <span class="w-6 h-6 rounded-lg bg-[#ff6b35]/20 text-[#ff6b35] font-mono text-xs font-black flex items-center justify-center flex-shrink-0 mt-0.5">
          ${item.qty}x
        </span>
        <div>
          <span class="text-xs font-bold text-stone-100">${item.name}</span>
          ${item.selectedOptions && item.selectedOptions.length > 0 ? `
            <div class="text-[10px] text-amber-400/90 font-mono mt-0.5">
              + ${item.selectedOptions.map(o => o.name).join(', ')}
            </div>
          ` : ''}
        </div>
      </div>
    </div>
  `).join('');

  return `
    <div class="rounded-2xl p-4 border shadow-xl flex flex-col gap-3 transition-all ${urgencyClass}" id="ticket-${order.id}">
      
      <!-- Card Header: Token & Timer -->
      <div class="flex items-start justify-between gap-2 pb-2.5 border-b border-[#352c24]">
        <div>
          <div class="flex items-center gap-2">
            <span class="font-display text-2xl sm:text-3xl font-black text-[#ff6b35] tracking-tight">#${order.token || '0'}</span>
            <span class="px-2 py-0.5 rounded-lg bg-stone-800 text-stone-400 text-[10px] font-mono">${order.id}</span>
          </div>
          <p class="text-[11px] font-mono text-stone-400 mt-0.5 flex items-center gap-1">
            <span>📍 ${order.location || 'Campus'}</span>
            <span>•</span>
            <span>👤 ${order.userPhone ? order.userPhone.slice(-4) : 'Walk-in'}</span>
          </p>
        </div>

        <div class="flex flex-col items-end gap-1">
          <!-- Live Prep Timer -->
          <span class="px-2.5 py-1 rounded-lg text-xs font-mono font-bold flex items-center gap-1 ${timerBadge}">
            <span class="material-symbols-outlined text-xs">timer</span>
            <span data-timestamp="${order.timestamp}">${formattedTime}</span>
          </span>
          <span class="text-[10px] font-mono ${order.paymentStatus?.includes('Pending') ? 'text-amber-400' : 'text-emerald-400'} font-bold">
            ${order.paymentMethod || 'Paid'}
          </span>
        </div>
      </div>

      <!-- Items Section -->
      <div class="flex flex-col gap-1.5 py-0.5">
        <span class="text-[10px] font-mono uppercase font-bold text-stone-400 tracking-wider">Order Items:</span>
        ${itemsHtml}
      </div>

      <!-- Action Footer -->
      <div class="pt-2 border-t border-[#352c24] flex items-center gap-2">
        ${currentStatus === 'Received' ? `
          <button onclick="updateOrderStatus('${order.id}', 'Cooking in Kitchen')" class="flex-1 py-2.5 px-3 rounded-xl bg-gradient-to-r from-[#ff6b35] to-[#ab3500] hover:from-orange-500 hover:to-orange-700 text-white font-mono text-xs font-bold shadow-md shadow-orange-950/40 active:scale-95 transition-all flex items-center justify-center gap-1.5">
            <span class="material-symbols-outlined text-base">outdoor_grill</span>
            <span>Start Cooking</span>
          </button>
        ` : ''}

        ${currentStatus === 'Cooking in Kitchen' ? `
          <button onclick="updateOrderStatus('${order.id}', 'Ready for Pickup')" class="flex-1 py-2.5 px-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white font-mono text-xs font-bold shadow-md shadow-emerald-950/40 active:scale-95 transition-all flex items-center justify-center gap-1.5">
            <span class="material-symbols-outlined text-base">notifications_active</span>
            <span>Mark Ready & Ring</span>
          </button>
        ` : ''}

        ${currentStatus === 'Ready for Pickup' ? `
          <button onclick="updateOrderStatus('${order.id}', 'Completed')" class="flex-1 py-2.5 px-3 rounded-xl bg-gradient-to-r from-stone-700 to-stone-800 hover:from-stone-600 hover:to-stone-700 text-white font-mono text-xs font-bold shadow-md active:scale-95 transition-all flex items-center justify-center gap-1.5">
            <span class="material-symbols-outlined text-base">check_circle</span>
            <span>Hand Over</span>
          </button>
        ` : ''}

        ${currentStatus === 'Completed' ? `
          <button onclick="updateOrderStatus('${order.id}', 'Cooking in Kitchen')" class="flex-1 py-2 px-2.5 rounded-xl bg-[#2b231d] hover:bg-[#382e26] text-stone-300 font-mono text-[11px] font-bold transition-all flex items-center justify-center gap-1">
            <span class="material-symbols-outlined text-sm">replay</span>
            <span>Recall Order</span>
          </button>
        ` : ''}

        <!-- Print KOT Icon Button -->
        <button onclick="openKotModal('${order.id}')" class="p-2.5 rounded-xl bg-[#27201a] hover:bg-[#342b23] text-stone-300 hover:text-white transition-colors" title="Print Thermal KOT Ticket">
          <span class="material-symbols-outlined text-base">print</span>
        </button>
      </div>

    </div>
  `;
}

/**
 * 4C. GRID MATRIX VIEW
 */
function renderGridView(container, orders) {
  let activeList = orders;
  if (KitchenState.filterStatus === 'active') {
    activeList = orders.filter(o => o.status !== 'Completed' && o.status !== 'Cancelled');
  } else if (KitchenState.filterStatus !== 'all') {
    activeList = orders.filter(o => o.status === KitchenState.filterStatus);
  }

  container.innerHTML = `
    <div class="flex flex-col gap-4">
      <div class="flex items-center justify-between">
        <span class="text-xs font-mono text-stone-400">Showing ${activeList.length} tickets in Matrix Grid</span>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        ${activeList.length > 0 ? activeList.map(o => createTicketCard(o, o.status)).join('') : `
          <div class="col-span-full p-16 text-center text-stone-500 font-mono text-sm border border-dashed border-stone-800 rounded-3xl">
            No active orders matching filters
          </div>
        `}
      </div>
    </div>
  `;
}

/**
 * 4D. SPEED DISPATCH TABLE VIEW (High volume table view)
 */
function renderTableView(container, orders) {
  let activeList = orders;
  if (KitchenState.filterStatus === 'active') {
    activeList = orders.filter(o => o.status !== 'Completed' && o.status !== 'Cancelled');
  } else if (KitchenState.filterStatus !== 'all') {
    activeList = orders.filter(o => o.status === KitchenState.filterStatus);
  }

  const rowsHtml = activeList.map(order => {
    const elapsedMinutes = Math.floor((Date.now() - (order.timestamp || Date.now())) / 60000);
    let statusBadge = 'bg-amber-500/20 text-amber-300';
    if (order.status === 'Cooking in Kitchen') statusBadge = 'bg-orange-500/20 text-[#ff6b35]';
    if (order.status === 'Ready for Pickup') statusBadge = 'bg-emerald-500/20 text-emerald-300';
    if (order.status === 'Completed') statusBadge = 'bg-stone-700/20 text-stone-400';

    return `
      <tr class="border-b border-[#2b221a] hover:bg-[#1f1914] transition-colors font-mono text-xs">
        <td class="p-3.5 font-black text-base text-[#ff6b35]">#${order.token || '0'}</td>
        <td class="p-3.5 text-stone-400">${order.id}</td>
        <td class="p-3.5 text-stone-300">
          <div class="flex flex-col gap-0.5">
            ${(order.items || []).map(i => `<span class="font-bold">${i.qty}x ${i.name}</span>`).join('')}
          </div>
        </td>
        <td class="p-3.5 text-stone-400">${order.location}</td>
        <td class="p-3.5 font-bold ${elapsedMinutes > 12 ? 'text-red-400' : 'text-stone-300'}">${elapsedMinutes} min ago</td>
        <td class="p-3.5">
          <span class="px-2.5 py-1 rounded-lg text-[11px] font-bold ${statusBadge}">
            ${order.status}
          </span>
        </td>
        <td class="p-3.5 text-right">
          <div class="flex items-center justify-end gap-1.5">
            ${order.status === 'Received' ? `
              <button onclick="updateOrderStatus('${order.id}', 'Cooking in Kitchen')" class="px-3 py-1.5 rounded-lg bg-[#ff6b35] text-white text-[11px] font-bold hover:bg-orange-600">Start</button>
            ` : ''}
            ${order.status === 'Cooking in Kitchen' ? `
              <button onclick="updateOrderStatus('${order.id}', 'Ready for Pickup')" class="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] font-bold hover:bg-emerald-500">Ready</button>
            ` : ''}
            ${order.status === 'Ready for Pickup' ? `
              <button onclick="updateOrderStatus('${order.id}', 'Completed')" class="px-3 py-1.5 rounded-lg bg-stone-700 text-white text-[11px] font-bold hover:bg-stone-600">Handover</button>
            ` : ''}
            <button onclick="openKotModal('${order.id}')" class="p-1.5 rounded-lg bg-[#27201a] text-stone-300 hover:text-white" title="Print KOT">
              <span class="material-symbols-outlined text-sm">print</span>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  container.innerHTML = `
    <div class="bg-[#171310] rounded-3xl border border-[#2e241c] overflow-hidden shadow-xl">
      <table class="w-full text-left border-collapse">
        <thead>
          <tr class="bg-[#201b16] border-b border-[#30261f] font-mono text-[11px] uppercase tracking-wider text-stone-400">
            <th class="p-3.5">Token</th>
            <th class="p-3.5">Order ID</th>
            <th class="p-3.5">Items</th>
            <th class="p-3.5">Location</th>
            <th class="p-3.5">Time</th>
            <th class="p-3.5">Status</th>
            <th class="p-3.5 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml || `<tr><td colspan="7" class="p-12 text-center text-stone-500 font-mono">No orders found</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

/**
 * ============================================================================
 * 5. ORDER STATUS WORKFLOW ACTIONS
 * ============================================================================
 */
async function updateOrderStatus(orderId, newStatus) {
  if (window.AromasFirebaseService) {
    await window.AromasFirebaseService.updateOrderStatusInFirebase(orderId, newStatus);
  }

  // Update in local state
  const order = KitchenState.orders.find(o => o.id === orderId);
  if (order) {
    order.status = newStatus;
    order.updatedAt = new Date().toISOString();
  }

  if (newStatus === 'Ready for Pickup') {
    playOrderReadyBell();
    showKdsToast(`🔔 Token #${order?.token || ''} is READY! Customer notified.`, 'notifications_active', 'success');
  } else if (newStatus === 'Cooking in Kitchen') {
    showKdsToast(`Token #${order?.token || ''} cooking started.`, 'outdoor_grill', 'success');
  } else if (newStatus === 'Completed') {
    showKdsToast(`Token #${order?.token || ''} fulfilled & handed over.`, 'check_circle', 'info');
  }

  updateCounters(KitchenState.orders);
  renderKdsView();
}

/**
 * ============================================================================
 * 6. KOT (KITCHEN ORDER TICKET) PRINTING
 * ============================================================================
 */
function openKotModal(orderId) {
  const order = KitchenState.orders.find(o => o.id === orderId);
  if (!order) return;

  const modal = document.getElementById('kot-modal');
  const printArea = document.getElementById('kot-print-area');
  if (!modal || !printArea) return;

  const dateStr = new Date(order.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  printArea.innerHTML = `
    <div style="text-align: center; border-bottom: 1px dashed #000; padding-bottom: 8px; margin-bottom: 8px;">
      <h2 style="font-size: 16px; font-weight: bold; margin: 0;">AROMAS KITCHEN TICKET</h2>
      <p style="font-size: 11px; margin: 2px 0;">${order.location || 'Main Campus'} Station</p>
      <div style="font-size: 24px; font-weight: 900; margin: 6px 0; border: 2px solid #000; padding: 4px; display: inline-block;">
        TOKEN #${order.token || '0'}
      </div>
      <p style="font-size: 10px; margin: 2px 0;">Order: ${order.id} | Time: ${dateStr}</p>
    </div>

    <div style="margin-bottom: 8px;">
      <table style="width: 100%; font-size: 12px; border-collapse: collapse;">
        <thead>
          <tr style="border-bottom: 1px solid #000; text-align: left;">
            <th style="padding: 2px 0;">QTY</th>
            <th style="padding: 2px 0;">ITEM</th>
          </tr>
        </thead>
        <tbody>
          ${(order.items || []).map(item => `
            <tr style="border-bottom: 1px dotted #ccc;">
              <td style="font-weight: bold; vertical-align: top; width: 35px; padding: 4px 0;">[ ] ${item.qty}x</td>
              <td style="padding: 4px 0;">
                <span style="font-weight: bold;">${item.name}</span>
                ${item.selectedOptions && item.selectedOptions.length > 0 ? `
                  <div style="font-size: 10px; color: #444;">
                    + ${item.selectedOptions.map(o => o.name).join(', ')}
                  </div>
                ` : ''}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    <div style="border-top: 1px dashed #000; padding-top: 6px; font-size: 10px; text-align: center;">
      <p style="margin: 2px 0;">Server: Digital Kiosk | Cust: ${order.userPhone || 'Walk-in'}</p>
      <p style="margin: 2px 0; font-weight: bold;">-- PREPARATION CHECKLIST --</p>
    </div>
  `;

  modal.classList.remove('hidden');
}

function closeKotModal() {
  const modal = document.getElementById('kot-modal');
  if (modal) modal.classList.add('hidden');
}

/**
 * ============================================================================
 * 7. VIEW MODE, FILTERS & CONTROLS
 * ============================================================================
 */
function setKdsViewMode(mode) {
  KitchenState.viewMode = mode;

  // Update buttons
  const btnKanban = document.getElementById('view-mode-kanban');
  const btnGrid = document.getElementById('view-mode-grid');
  const btnTable = document.getElementById('view-mode-table');

  [btnKanban, btnGrid, btnTable].forEach(b => {
    if (b) {
      b.className = 'px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1.5 text-stone-400 hover:text-stone-100';
    }
  });

  const activeBtn = document.getElementById(`view-mode-${mode}`);
  if (activeBtn) {
    activeBtn.className = 'px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1.5 bg-[#ff6b35] text-white shadow-sm';
  }

  renderKdsView();
}

function setKdsStatusFilter(status) {
  KitchenState.filterStatus = status;

  const btnActive = document.getElementById('status-btn-active');
  const btnAll = document.getElementById('status-btn-all');

  if (btnActive && btnAll) {
    if (status === 'active') {
      btnActive.className = 'px-3 py-1 rounded-lg text-xs font-mono font-bold bg-[#ff6b35] text-white';
      btnAll.className = 'px-3 py-1 rounded-lg text-xs font-mono font-bold text-stone-400 hover:text-white';
    } else if (status === 'all') {
      btnAll.className = 'px-3 py-1 rounded-lg text-xs font-mono font-bold bg-[#ff6b35] text-white';
      btnActive.className = 'px-3 py-1 rounded-lg text-xs font-mono font-bold text-stone-400 hover:text-white';
    }
  }

  renderKdsView();
}

function handleLocationFilterChange(location) {
  KitchenState.filterLocation = location;
  renderKdsView();
}

function handleSearch(query) {
  KitchenState.searchQuery = query;
  renderKdsView();
}

function refreshKdsOrders(manual = true) {
  loadOrders(manual);
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(err => {
      console.warn("Fullscreen request error:", err);
    });
  } else {
    document.exitFullscreen().catch(err => {
      console.warn("Exit fullscreen error:", err);
    });
  }
}

function startDigitalClock() {
  const clockEl = document.getElementById('kds-live-clock');
  function tick() {
    if (clockEl) {
      const now = new Date();
      clockEl.textContent = now.toLocaleTimeString();
    }
  }
  tick();
  KitchenState.clockTimer = setInterval(tick, 1000);
}

function updateAllElapsedTimers() {
  document.querySelectorAll('[data-timestamp]').forEach(el => {
    const timestamp = parseInt(el.getAttribute('data-timestamp'), 10);
    if (timestamp) {
      const elapsedMinutes = Math.floor((Date.now() - timestamp) / 60000);
      const elapsedSecs = Math.floor(((Date.now() - timestamp) % 60000) / 1000);
      el.textContent = `${String(elapsedMinutes).padStart(2, '0')}:${String(elapsedSecs).padStart(2, '0')}`;
    }
  });
}

/**
 * ============================================================================
 * 8. TOAST SYSTEM
 * ============================================================================
 */
function showKdsToast(message, icon = 'info', type = 'info') {
  let container = document.getElementById('kds-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'kds-toast-container';
    container.className = 'fixed bottom-5 left-5 z-50 flex flex-col gap-2 pointer-events-none';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  let borderColor = 'border-[#ff6b35]/60';
  let iconColor = 'text-[#ff6b35]';

  if (type === 'success' || icon.includes('notifications') || icon.includes('verified')) {
    borderColor = 'border-emerald-500';
    iconColor = 'text-emerald-400';
  } else if (type === 'error') {
    borderColor = 'border-red-500';
    iconColor = 'text-red-400';
  }

  toast.className = `p-3.5 px-4 rounded-2xl bg-[#1c1713]/95 backdrop-blur-md border ${borderColor} text-white text-xs font-mono flex items-center gap-2.5 shadow-2xl animate-fade-in pointer-events-auto`;
  toast.innerHTML = `
    <span class="material-symbols-outlined ${iconColor} text-lg">${icon}</span>
    <span>${message}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}
