/**
 * Aromas - Core Application Engine & State Controller
 * Handles routing, reactive cart, Firebase phone auth, interactive payment methods,
 * previous orders history, green kitchen progress tracker, and the Kitchen Staff Display System (KDS).
 */

// Application State Store
const AppState = {
  location: 'Main Campus',
  cart: [],
  activeCategory: 'all',
  dietaryFilter: 'all',
  searchQuery: '',
  appliedCoupon: null,
  activeRoute: 'menu',
  activeOrdersTab: 'live',
  activeCustomizingItem: null,
  currentUser: null,
  userOrders: [],
  orders: [], // Local active orders session for current authenticated user
  knownOrderStatuses: {}, // Tracks order status changes to trigger real-time alerts
  pendingAddItem: null, // Queued item waiting for user to log in
  selectedPaymentMethod: 'upi', // 'upi' | 'card' | 'counter'
  authCountdownTimer: null,
  userOrdersUnsubscriber: null
};

if (typeof window !== 'undefined') {
  window.AppState = AppState;
}

// LocalStorage & SessionStorage Keys
const STORAGE_KEYS = {
  LOCATION: 'aromas_location',
  CART: 'aromas_cart',
  COUPON: 'aromas_coupon',
  ORDERS: 'aromas_orders'
};

// Initialize application on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  initializeApp();
});

function initializeApp() {
  // Load state from local storage or set initial defaults
  loadPersistedState();

  // Load existing session if present
  ensureUserSession();

  // Initialize Firebase Auth listener
  if (window.AromasFirebaseService) {
    window.AromasFirebaseService.onAuthStateChanged(handleAuthChange);
  }

  // Handle hash change routing
  window.addEventListener('hashchange', handleRoute);
  
  // Set initial route based on URL hash or default to menu
  const initialHash = window.location.hash.replace('#', '') || 'menu';
  navigateTo(initialHash, false);

  // Setup global event listeners
  setupGlobalEvents();

  // Render initial components
  updateCartBadge();
  updateLocationHeader();
  updateHeaderUserUI();
}

function ensureUserSession() {
  if (!AppState.currentUser) {
    let stored = null;
    try {
      const u = localStorage.getItem('aromas_auth_user');
      if (u) stored = JSON.parse(u);
    } catch(e) {}

    if (stored && stored.uid) {
      AppState.currentUser = stored;
      if (window.AromasFirebaseService) {
        window.AromasFirebaseService.setStoredUser(stored);
      }
    } else {
      AppState.currentUser = null;
    }
    updateHeaderUserUI();
  }
  return AppState.currentUser;
}

function setupGlobalEvents() {
  if (window.AromasFirebaseService) {
    // 1. Real-time Menu Listener (onSnapshot)
    window.AromasFirebaseService.subscribeToMenu(() => {
      if (AppState.activeRoute === 'menu') {
        renderMenuView();
      }
    });

    // 2. Real-time Stock Listener (onSnapshot)
    window.AromasFirebaseService.subscribeToStock((stockMap) => {
      if (AppState.activeRoute === 'menu') {
        renderMenuItems();
      }
      updateCartStockLimits(stockMap);
    });

    // 3. Real-time Sales Listener (onSnapshot)
    window.AromasFirebaseService.subscribeToSales(() => {
      if (AppState.activeRoute === 'menu') {
        renderMenuItems();
      }
    });

    // 4. Real-time Billing Settings Listener (settings/billing)
    window.AromasFirebaseService.subscribeToBillingSettings((settings) => {
      AppState.billingSettings = settings;
      if (AppState.activeRoute === 'bill') {
        renderBillView();
      }
      updateCartFloatingBar();
    });

    // 5. Connection State Listener
    window.AromasFirebaseService.subscribeToConnectionState((isLive) => {
      updateConnectionBadgeUI(isLive);
    });
  }

  // Cross-Window and Custom Sync Events
  window.addEventListener('aromas_sync_event', () => {
    if (AppState.activeRoute === 'menu') {
      renderMenuItems();
    }
  });

  window.addEventListener('storage', (e) => {
    if (!e.key || e.key.includes('aromas')) {
      if (AppState.activeRoute === 'menu') {
        renderMenuView();
      }
      if (AppState.activeRoute === 'orders') {
        loadUserOrders();
      }
    }
  });
}

function updateCartStockLimits(stockMap) {
  if (!Array.isArray(AppState.cart) || AppState.cart.length === 0) return;
  let cartChanged = false;

  AppState.cart.forEach(item => {
    const available = stockMap[item.id] !== undefined ? Number(stockMap[item.id]) : 20;
    if (item.qty > available) {
      if (available <= 0) {
        showToast(`"${item.name}" was just marked sold out in the kitchen and removed from your cart.`, 'inventory', 'warning');
      } else {
        showToast(`"${item.name}" quantity adjusted to ${available} (available kitchen stock).`, 'inventory', 'info');
      }
      item.qty = Math.max(0, available);
      cartChanged = true;
    }
  });

  if (cartChanged) {
    AppState.cart = AppState.cart.filter(item => item.qty > 0);
    saveCartState();
    updateCartBadge();
    if (AppState.activeRoute === 'bill') {
      renderBillView();
    }
  }
}

function updateConnectionBadgeUI(isConnected) {
  const badge = document.getElementById('live-connection-badge');
  const text = document.getElementById('live-connection-text');
  if (!badge || !text) return;

  if (isConnected) {
    badge.className = 'hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-950/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 text-[11px] font-mono font-bold';
    text.textContent = 'Live';
    if (text.previousElementSibling) text.previousElementSibling.className = 'w-2 h-2 rounded-full bg-emerald-500 animate-pulse';
  } else {
    badge.className = 'hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-950/10 text-red-600 dark:text-red-400 border border-red-500/20 text-[11px] font-mono font-bold';
    text.textContent = 'Offline';
    if (text.previousElementSibling) text.previousElementSibling.className = 'w-2 h-2 rounded-full bg-red-500';
  }
}

/**
 * Handle Auth State Changes with Strict User & Order Isolation
 */
async function handleAuthChange(user) {
  // 1. Unsubscribe previous real-time listener if any
  if (AppState.userOrdersUnsubscriber) {
    try {
      AppState.userOrdersUnsubscriber();
    } catch (e) {}
    AppState.userOrdersUnsubscriber = null;
  }

  // 2. Immediately wipe previous user's order and session state
  AppState.orders = [];
  AppState.userOrders = [];
  AppState.knownOrderStatuses = {};
  AppState.lastPaidOrder = null;

  if (user && user.uid) {
    AppState.currentUser = user;
    updateHeaderUserUI();

    // 3. Clear UI immediately before data arrives
    const container = document.getElementById('orders-content-container');
    if (container && AppState.activeRoute === 'orders') {
      container.innerHTML = `
        <div class="py-16 text-center text-on-surface-variant flex flex-col items-center">
          <span class="material-symbols-outlined text-4xl animate-spin text-primary mb-3">progress_activity</span>
          <p class="font-mono text-xs">Loading your orders securely...</p>
        </div>
      `;
    }

    // 4. Subscribe to current user's authoritative orders
    if (window.AromasFirebaseService) {
      AppState.userOrdersUnsubscriber = window.AromasFirebaseService.subscribeToUserOrders(user.uid, (orders) => {
        AppState.userOrders = orders || [];
        AppState.orders = orders || [];
        (orders || []).forEach(order => {
          const prevStatus = AppState.knownOrderStatuses[order.id];
          if (prevStatus && prevStatus !== 'Ready for Pickup' && order.status === 'Ready for Pickup') {
            triggerOrderReadyNotification(order.id, order.token, order.location);
          }
          AppState.knownOrderStatuses[order.id] = order.status;
        });
        updateOrdersBadge();
        if (AppState.activeRoute === 'orders') {
          renderOrdersView();
        }
      });
    }
  } else {
    AppState.currentUser = null;
    AppState.cart = [];
    AppState.appliedCoupon = null;
    saveCartState();
    updateHeaderUserUI();
    updateOrdersBadge();
  }

  // Re-render active views
  if (AppState.activeRoute === 'menu') {
    renderMenuView();
  } else if (AppState.activeRoute === 'orders') {
    renderOrdersView();
  } else if (AppState.activeRoute === 'bill') {
    renderBillView();
  }
}

async function loadUserOrders() {
  if (!AppState.currentUser || !AppState.currentUser.uid || !window.AromasFirebaseService) {
    AppState.userOrders = [];
    AppState.orders = [];
    updateOrdersBadge();
    return;
  }

  try {
    const orders = await window.AromasFirebaseService.fetchUserOrders(AppState.currentUser);
    AppState.userOrders = orders || [];
    AppState.orders = orders || [];
    
    // Check for status transitions
    (orders || []).forEach(order => {
      const prevStatus = AppState.knownOrderStatuses[order.id];
      if (prevStatus && prevStatus !== 'Ready for Pickup' && order.status === 'Ready for Pickup') {
        triggerOrderReadyNotification(order.id, order.token, order.location);
      }
      AppState.knownOrderStatuses[order.id] = order.status;
    });

    updateOrdersBadge();
    if (AppState.activeRoute === 'orders') {
      renderOrdersView();
    }
  } catch (err) {
    console.warn("Could not load user orders:", err);
  }
}

function updateOrdersBadge() {
  const count = (AppState.userOrders || []).length;
  const navBadge = document.getElementById('nav-orders-badge');
  const tabBadge = document.getElementById('tab-history-count');
  
  if (navBadge) {
    navBadge.textContent = count;
    if (count > 0) navBadge.classList.remove('hidden');
    else navBadge.classList.add('hidden');
  }

  if (tabBadge) {
    tabBadge.textContent = count;
  }
}

/**
 * Persist & Load State
 */
function loadPersistedState() {
  try {
    const savedLocation = localStorage.getItem(STORAGE_KEYS.LOCATION);
    if (savedLocation) {
      AppState.location = savedLocation;
    }

    const savedCart = localStorage.getItem(STORAGE_KEYS.CART);
    if (savedCart) {
      AppState.cart = JSON.parse(savedCart);
    } else {
      AppState.cart = [];
    }

    const savedCoupon = localStorage.getItem(STORAGE_KEYS.COUPON);
    if (savedCoupon && COUPONS[savedCoupon]) {
      AppState.appliedCoupon = { code: savedCoupon, ...COUPONS[savedCoupon] };
    }

    // Do NOT load shared global orders from localStorage. Orders are strictly loaded per authenticated user UID.
    AppState.orders = [];
    AppState.userOrders = [];
  } catch (e) {
    console.error("Error loading persisted state:", e);
  }
}

function saveCartState() {
  localStorage.setItem(STORAGE_KEYS.CART, JSON.stringify(AppState.cart));
  updateCartBadge();
}

function saveLocationState() {
  localStorage.setItem(STORAGE_KEYS.LOCATION, AppState.location);
  updateLocationHeader();
}

/**
 * Client-Side Router
 */
function handleRoute() {
  const hash = window.location.hash.replace('#', '') || 'menu';
  navigateTo(hash, false);
}

function navigateTo(routeName, updateHash = true) {
  AppState.activeRoute = routeName;
  if (updateHash) {
    window.location.hash = routeName;
  }

  // Update Nav links active states
  document.querySelectorAll('[data-path]').forEach(link => {
    const path = link.getAttribute('data-path');
    if (path === routeName) {
      link.classList.add('text-primary', 'font-bold');
      link.classList.remove('text-on-surface-variant');
      link.setAttribute('aria-current', 'page');
    } else {
      link.classList.remove('text-primary', 'font-bold');
      link.classList.add('text-on-surface-variant');
      link.removeAttribute('aria-current');
    }
  });

  // Toggle View Containers
  const views = ['location-view', 'menu-view', 'bill-view', 'orders-view'];
  views.forEach(viewId => {
    const el = document.getElementById(viewId);
    if (el) {
      if (viewId === `${routeName}-view`) {
        el.classList.remove('hidden');
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        el.classList.add('hidden');
      }
    }
  });

  // Re-render corresponding view content
  if (routeName === 'location') {
    renderLocationView();
  } else if (routeName === 'menu') {
    renderMenuView();
  } else if (routeName === 'bill') {
    renderBillView();
  } else if (routeName === 'orders') {
    renderOrdersView();
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * Global Event Listeners
 */
function setupGlobalEvents() {
  // Cart Drawer open/close
  const cartButtons = document.querySelectorAll('.cart-trigger');
  cartButtons.forEach(btn => {
    btn.addEventListener('click', toggleCartDrawer);
  });

  const closeCartBtn = document.getElementById('close-cart-btn');
  if (closeCartBtn) {
    closeCartBtn.addEventListener('click', closeCartDrawer);
  }

  const drawerBackdrop = document.getElementById('cart-drawer-backdrop');
  if (drawerBackdrop) {
    drawerBackdrop.addEventListener('click', closeCartDrawer);
  }

  // Search Input Listener
  const searchInput = document.getElementById('menu-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      AppState.searchQuery = e.target.value.trim().toLowerCase();
      renderMenuItems();
    });
  }

  // Click outside to close dropdowns
  document.addEventListener('click', (e) => {
    const locContainer = document.querySelector('.location-dropdown-container');
    if (locContainer && !locContainer.contains(e.target)) {
      closeLocationDropdown();
    }
    const userContainer = document.getElementById('header-user-container');
    if (userContainer && !userContainer.contains(e.target)) {
      closeUserDropdown();
    }
  });
}

/**
 * Location Dropdown Controller
 */
function toggleLocationDropdown(event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  const menu = document.getElementById('location-dropdown-menu');
  const arrow = document.getElementById('location-dropdown-arrow');
  if (!menu) return;

  if (menu.classList.contains('hidden')) {
    menu.classList.remove('hidden');
    if (arrow) arrow.classList.add('rotate-180');
    updateDropdownCheckmarks();
  } else {
    menu.classList.add('hidden');
    if (arrow) arrow.classList.remove('rotate-180');
  }
}

function closeLocationDropdown() {
  const menu = document.getElementById('location-dropdown-menu');
  const arrow = document.getElementById('location-dropdown-arrow');
  if (menu) menu.classList.add('hidden');
  if (arrow) arrow.classList.remove('rotate-180');
}

function updateDropdownCheckmarks() {
  document.querySelectorAll('.check-main-campus').forEach(el => {
    el.style.opacity = AppState.location === 'Main Campus' ? '1' : '0';
  });
  document.querySelectorAll('.check-au-quasar').forEach(el => {
    el.style.opacity = AppState.location === 'AU Quasar' ? '1' : '0';
  });
}

function updateLocationHeader() {
  const locationEls = document.querySelectorAll('.active-location-name');
  locationEls.forEach(el => {
    el.textContent = AppState.location;
  });
  updateDropdownCheckmarks();
}

function updateCartBadge() {
  const count = AppState.cart.reduce((sum, item) => sum + item.qty, 0);
  const badgeEls = document.querySelectorAll('.cart-count-badge');
  badgeEls.forEach(el => {
    el.textContent = count;
    if (count > 0) {
      el.classList.remove('hidden');
    } else {
      el.classList.add('hidden');
    }
  });

  renderCartDrawerContent();
}

/**
 * ==========================================================================
 * USER AUTHENTICATION & HEADER UI
 * ==========================================================================
 */

function updateHeaderUserUI() {
  const container = document.getElementById('header-user-container');
  if (!container) return;

  if (AppState.currentUser) {
    const phone = AppState.currentUser.phoneNumber || '+91 98765 43210';
    const shortPhone = phone.length > 10 ? phone.slice(-10) : phone;

    container.innerHTML = `
      <div class="relative user-dropdown-container">
        <button onclick="toggleUserDropdown(event)" class="flex items-center gap-2 py-1.5 px-3 sm:px-3.5 rounded-full bg-surface-container hover:bg-surface-container-high border border-outline-variant/40 transition-all cursor-pointer shadow-sm">
          <div class="w-7 h-7 rounded-full bg-primary text-on-primary flex items-center justify-center text-xs font-mono font-bold">
            <span class="material-symbols-outlined text-[16px]">person</span>
          </div>
          <div class="hidden sm:flex flex-col text-left leading-tight">
            <span class="text-xs font-receipt font-bold text-on-surface">${shortPhone}</span>
            <span class="text-[9px] font-mono text-veg flex items-center gap-0.5">
              <span class="w-1.5 h-1.5 rounded-full bg-veg"></span> Verified
            </span>
          </div>
          <span id="user-dropdown-arrow" class="material-symbols-outlined text-on-surface-variant text-sm transition-transform duration-200">expand_more</span>
        </button>

        <!-- Profile Dropdown Popover -->
        <div id="user-dropdown-menu" class="hidden absolute right-0 top-full mt-2 w-64 bg-surface-container-lowest rounded-2xl shadow-2xl border border-surface-container-high p-2 z-50 animate-fadeIn">
          <div class="px-3 py-2.5 bg-surface-container/60 rounded-xl mb-1 border border-surface-container-high">
            <p class="text-[11px] font-mono text-on-surface-variant uppercase tracking-wider font-bold">Signed in as</p>
            <p class="text-sm font-receipt font-bold text-primary truncate">${phone}</p>
          </div>

          <div class="flex flex-col gap-1">
            <div onclick="navigateTo('orders'); setOrdersTab('history'); closeUserDropdown();" class="flex items-center gap-2.5 p-2.5 rounded-xl hover:bg-surface-container cursor-pointer transition-colors text-xs font-medium text-on-surface group">
              <span class="material-symbols-outlined text-primary text-lg group-hover:scale-110 transition-transform">history</span>
              <span>My Previous Orders</span>
              <span class="ml-auto px-1.5 py-0.5 rounded bg-primary-fixed text-on-primary-fixed text-[10px] font-mono font-bold">${AppState.userOrders.length}</span>
            </div>

            <a href="kitchen.html" target="_blank" onclick="closeUserDropdown();" class="flex items-center gap-2.5 p-2.5 rounded-xl hover:bg-surface-container cursor-pointer transition-colors text-xs font-medium text-on-surface group">
              <span class="material-symbols-outlined text-primary text-lg group-hover:scale-110 transition-transform">restaurant</span>
              <span>Staff Kitchen KDS ↗</span>
            </a>

            <div onclick="openFirebaseSettingsModal(); closeUserDropdown();" class="flex items-center gap-2.5 p-2.5 rounded-xl hover:bg-surface-container cursor-pointer transition-colors text-xs font-medium text-on-surface group">
              <span class="material-symbols-outlined text-on-surface-variant text-lg group-hover:text-primary transition-colors">cloud_sync</span>
              <span>Firebase Configuration</span>
            </div>

            <div class="border-t border-surface-container-high my-1"></div>

            <div onclick="logoutUser()" class="flex items-center gap-2.5 p-2.5 rounded-xl hover:bg-error-container/30 text-error cursor-pointer transition-colors text-xs font-bold">
              <span class="material-symbols-outlined text-lg">logout</span>
              <span>Log Out</span>
            </div>
          </div>
        </div>
      </div>
    `;
  } else {
    container.innerHTML = `
      <button onclick="openAuthModal()" class="flex items-center gap-1.5 sm:gap-2 py-2 px-3 sm:px-4 rounded-full bg-primary text-on-primary font-button text-xs font-bold hover:bg-primary-container shadow-sm hover:scale-105 transition-all">
        <span class="material-symbols-outlined text-[17px]">smartphone</span>
        <span>Login</span>
      </button>
    `;
  }
}

function toggleUserDropdown(event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  const menu = document.getElementById('user-dropdown-menu');
  const arrow = document.getElementById('user-dropdown-arrow');
  if (!menu) return;

  if (menu.classList.contains('hidden')) {
    menu.classList.remove('hidden');
    if (arrow) arrow.classList.add('rotate-180');
  } else {
    menu.classList.add('hidden');
    if (arrow) arrow.classList.remove('rotate-180');
  }
}

function closeUserDropdown() {
  const menu = document.getElementById('user-dropdown-menu');
  const arrow = document.getElementById('user-dropdown-arrow');
  if (menu) menu.classList.add('hidden');
  if (arrow) arrow.classList.remove('rotate-180');
}

/**
 * Phone Auth Modal Controllers
 */
function openAuthModal(reason = null) {
  const modal = document.getElementById('auth-modal');
  if (!modal) return;

  backToPhoneStep();
  if (reason) {
    const subtitle = document.getElementById('auth-modal-subtitle');
    if (subtitle) subtitle.textContent = reason;
  }
  modal.classList.remove('hidden');

  if (window.AromasFirebase) {
    window.AromasFirebase.setupRecaptcha('recaptcha-container');
  }

  setTimeout(() => {
    const input = document.getElementById('auth-phone-input');
    if (input) input.focus();
  }, 100);
}

function closeAuthModal() {
  const modal = document.getElementById('auth-modal');
  if (modal) modal.classList.add('hidden');
}

function fillQuickTestPhone() {
  const input = document.getElementById('auth-phone-input');
  if (input) {
    input.value = '9876543210';
    requestPhoneOtp();
  }
}

async function loginAsQuickGuest(phone = '+91 98765 43210') {
  const cleanDigits = phone.replace(/\D/g, '').slice(-10);
  const user = {
    uid: 'usr_' + (cleanDigits || Date.now().toString().slice(-6)),
    phoneNumber: phone,
    displayName: `Diner (${phone.slice(-4)})`
  };

  AppState.currentUser = user;
  localStorage.setItem('aromas_auth_user', JSON.stringify(user));
  localStorage.setItem('aromas_user_phone', phone);

  if (window.AromasFirebaseService) {
    window.AromasFirebaseService.setStoredUser(user);
  }

  await handleAuthChange(user);

  updateHeaderUserUI();
  closeAuthModal();
  showToast(`Welcome! Signed in as ${phone}`, 'verified', 'success');

  if (AppState.pendingAddItem) {
    const { itemId, selectedOptions } = AppState.pendingAddItem;
    AppState.pendingAddItem = null;
    addItemToCart(itemId, selectedOptions);
  } else if (AppState.activeRoute === 'bill') {
    renderBillView();
    openPaymentModal();
  }
}

function backToPhoneStep() {
  const stepPhone = document.getElementById('auth-step-phone');
  const stepOtp = document.getElementById('auth-step-otp');
  const title = document.getElementById('auth-modal-title');
  const subtitle = document.getElementById('auth-modal-subtitle');

  if (stepPhone) stepPhone.classList.remove('hidden');
  if (stepOtp) stepOtp.classList.add('hidden');
  if (title) title.textContent = 'Sign in with Phone';
  if (subtitle) subtitle.textContent = 'Login with your phone number to start ordering food and view order history.';

  if (AppState.authCountdownTimer) {
    clearInterval(AppState.authCountdownTimer);
  }
}

async function requestPhoneOtp() {
  const input = document.getElementById('auth-phone-input');
  const sendBtn = document.getElementById('auth-send-otp-btn');
  if (!input) return;

  const rawPhone = input.value.trim();
  if (!rawPhone || rawPhone.length < 10) {
    showToast('Please enter a valid 10-digit mobile number', 'error', 'error');
    input.focus();
    return;
  }

  const fullPhone = '+91' + rawPhone.replace(/\D/g, '').slice(-10);

  if (sendBtn) {
    sendBtn.disabled = true;
    sendBtn.innerHTML = `<span class="material-symbols-outlined text-lg animate-spin">progress_activity</span> Sending Code...`;
  }

  try {
    const verifier = window.AromasFirebase ? window.AromasFirebase.recaptchaVerifier : null;
    const result = await window.AromasFirebaseService.sendPhoneOtp(fullPhone, verifier);

    document.getElementById('auth-step-phone').classList.add('hidden');
    document.getElementById('auth-step-otp').classList.remove('hidden');

    document.getElementById('auth-modal-title').textContent = 'Verify Phone Number';
    document.getElementById('auth-modal-subtitle').textContent = 'Enter the 6-digit verification code sent to your phone.';
    document.getElementById('auth-target-phone-display').textContent = fullPhone;

    const demoBanner = document.getElementById('auth-demo-code-banner');
    const demoVal = document.getElementById('auth-demo-code-val');

    if (result.mode === 'mock' || result.demoCode) {
      if (demoBanner && demoVal) {
        demoBanner.classList.remove('hidden');
        demoVal.textContent = result.demoCode || '123456';
      }
      showToast(`Verification code sent! Demo Code: ${result.demoCode || '123456'}`, 'sms', 'success');
    } else {
      if (demoBanner) demoBanner.classList.add('hidden');
      showToast(`Verification code sent to ${fullPhone}`, 'sms', 'success');
    }

    startOtpCountdown();

    const otpInput = document.getElementById('auth-otp-input');
    if (otpInput) {
      otpInput.value = '';
      otpInput.focus();
    }

  } catch (err) {
    showToast(err.message || 'Failed to send verification code. Try again.', 'error', 'error');
  } finally {
    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.innerHTML = `<span class="material-symbols-outlined text-lg">sms</span><span>Send Verification Code</span>`;
    }
  }
}

function startOtpCountdown() {
  let seconds = 30;
  const resendBtn = document.getElementById('auth-resend-btn');
  if (!resendBtn) return;

  resendBtn.disabled = true;
  resendBtn.classList.add('opacity-50', 'pointer-events-none');
  resendBtn.textContent = `Resend Code (${seconds}s)`;

  if (AppState.authCountdownTimer) {
    clearInterval(AppState.authCountdownTimer);
  }

  AppState.authCountdownTimer = setInterval(() => {
    seconds--;
    if (seconds <= 0) {
      clearInterval(AppState.authCountdownTimer);
      resendBtn.disabled = false;
      resendBtn.classList.remove('opacity-50', 'pointer-events-none');
      resendBtn.textContent = `Resend Code`;
    } else {
      resendBtn.textContent = `Resend Code (${seconds}s)`;
    }
  }, 1000);
}

async function submitPhoneOtp() {
  const otpInput = document.getElementById('auth-otp-input');
  const verifyBtn = document.getElementById('auth-verify-otp-btn');
  if (!otpInput) return;

  const otpCode = otpInput.value.trim();
  if (!otpCode || otpCode.length < 6) {
    showToast('Please enter the complete 6-digit OTP code', 'warning', 'warning');
    otpInput.focus();
    return;
  }

  if (verifyBtn) {
    verifyBtn.disabled = true;
    verifyBtn.innerHTML = `<span class="material-symbols-outlined text-lg animate-spin">progress_activity</span> Verifying...`;
  }

  try {
    const authResult = await window.AromasFirebaseService.verifyPhoneOtp(otpCode);
    closeAuthModal();
    showToast(`Welcome! Logged in as ${authResult.user.phoneNumber}`, 'verified', 'success');

    // Fulfill pending queued item if any
    if (AppState.pendingAddItem) {
      const pending = AppState.pendingAddItem;
      AppState.pendingAddItem = null;
      addItemToCart(pending.itemId, pending.selectedOptions);
      toggleCartDrawer();
    }
  } catch (err) {
    showToast(err.message || 'Invalid verification code', 'error', 'error');
    otpInput.focus();
  } finally {
    if (verifyBtn) {
      verifyBtn.disabled = false;
      verifyBtn.innerHTML = `<span class="material-symbols-outlined text-lg">verified_user</span><span>Verify & Log In</span>`;
    }
  }
}

async function logoutUser() {
  // 1. Unsubscribe real-time user order listener
  if (AppState.userOrdersUnsubscriber) {
    try {
      AppState.userOrdersUnsubscriber();
    } catch (e) {}
    AppState.userOrdersUnsubscriber = null;
  }

  // 2. Clear in-memory session, orders, cart, and tracking
  AppState.currentUser = null;
  AppState.orders = [];
  AppState.userOrders = [];
  AppState.cart = [];
  AppState.appliedCoupon = null;
  AppState.lastPaidOrder = null;
  AppState.knownOrderStatuses = {};

  // 3. Purge user-specific and shared order storage
  try {
    localStorage.removeItem('aromas_auth_user');
    localStorage.removeItem('aromas_user_phone');
    localStorage.removeItem('aromas_orders');
    localStorage.removeItem('aromas_cart');
    localStorage.removeItem('aromas_last_paid_order');
    localStorage.removeItem('aromas_coupon');
  } catch (e) {}

  // 4. Sign out from Firebase
  if (window.AromasFirebaseService) {
    await window.AromasFirebaseService.signOut();
  }

  closeUserDropdown();
  updateHeaderUserUI();
  updateCartBadge();
  updateOrdersBadge();

  if (AppState.activeRoute === 'orders') {
    renderOrdersView();
  } else if (AppState.activeRoute === 'bill') {
    renderBillView();
  }

  showToast('Logged out successfully', 'logout', 'info');
}

/**
 * Firebase Settings Modal
 */
function openFirebaseSettingsModal() {
  const modal = document.getElementById('firebase-settings-modal');
  if (!modal) return;

  const config = window.AromasFirebase ? window.AromasFirebase.getConfig() : {};
  document.getElementById('fb-cfg-apiKey').value = config.apiKey || '';
  document.getElementById('fb-cfg-authDomain').value = config.authDomain || '';
  document.getElementById('fb-cfg-projectId').value = config.projectId || '';
  document.getElementById('fb-cfg-storageBucket').value = config.storageBucket || '';
  document.getElementById('fb-cfg-appId').value = config.appId || '';

  modal.classList.remove('hidden');
}

function closeFirebaseSettingsModal() {
  const modal = document.getElementById('firebase-settings-modal');
  if (modal) modal.classList.add('hidden');
}

function saveCustomFirebaseConfig() {
  const config = {
    apiKey: document.getElementById('fb-cfg-apiKey').value.trim(),
    authDomain: document.getElementById('fb-cfg-authDomain').value.trim(),
    projectId: document.getElementById('fb-cfg-projectId').value.trim(),
    storageBucket: document.getElementById('fb-cfg-storageBucket').value.trim(),
    appId: document.getElementById('fb-cfg-appId').value.trim()
  };

  if (!config.apiKey || !config.projectId) {
    showToast('Please enter at least an API Key and Project ID', 'warning', 'warning');
    return;
  }

  if (window.AromasFirebase) {
    window.AromasFirebase.saveConfig(config);
    window.AromasFirebase.init();
  }

  closeFirebaseSettingsModal();
  showToast('Firebase credentials saved! Reloading...', 'cloud_done', 'success');
  setTimeout(() => window.location.reload(), 1000);
}

function resetFirebaseConfigDefault() {
  localStorage.removeItem('aromas_firebase_config');
  localStorage.removeItem('aromas_firebase_custom_enabled');
  closeFirebaseSettingsModal();
  showToast('Reset to Demo Firebase configuration.', 'restart_alt', 'info');
  setTimeout(() => window.location.reload(), 1000);
}

/**
 * ==========================================================================
 * 1. LOCATION VIEW LOGIC
 * ==========================================================================
 */
function renderLocationView() {
  const container = document.getElementById('location-cards-container');
  if (!container) return;

  container.innerHTML = LOCATIONS.map(loc => {
    const isSelected = AppState.location === loc.name;
    return `
      <div class="location-card-item relative group cursor-pointer bg-surface-container rounded-3xl overflow-hidden transition-all duration-300 ${isSelected ? 'ring-4 ring-primary shadow-lg scale-[1.01]' : 'hover:shadow-md'}" onclick="selectLocationOption('${loc.name}')">
        <div class="relative h-64 md:h-80 w-full overflow-hidden">
          <img src="${loc.image}" alt="${loc.name}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out" onerror="this.src='https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=800&q=80'" />
          <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent"></div>
          <div class="absolute top-4 left-4">
            <span class="font-label-mono text-xs px-3 py-1.5 rounded-full bg-surface-container-lowest/90 backdrop-blur-md text-on-surface font-semibold shadow-sm">
              ${loc.badge}
            </span>
          </div>
          <div class="absolute bottom-4 left-4 right-4 text-white">
            <span class="text-xs uppercase tracking-wider text-primary-fixed-dim font-receipt">${loc.code}</span>
            <h3 class="text-2xl md:text-3xl font-display font-bold">${loc.name}</h3>
          </div>
        </div>
        <div class="p-6 md:p-8 flex flex-col gap-3 relative">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2 text-sm text-on-surface-variant font-medium">
              <span class="material-symbols-outlined text-primary text-base">schedule</span>
              <span>${loc.status}</span>
            </div>
            <div class="selection-indicator w-8 h-8 rounded-full ${isSelected ? 'bg-primary border-primary' : 'bg-surface-container-high border-outline-variant'} border-2 flex items-center justify-center transition-colors">
              <span class="material-symbols-outlined ${isSelected ? 'text-on-primary' : 'text-transparent'} text-lg font-bold">check</span>
            </div>
          </div>
          <p class="text-sm text-on-surface-variant leading-relaxed">${loc.description}</p>
          <div class="mt-2 pt-3 border-t border-surface-container-high flex items-center justify-between text-xs text-on-surface-variant font-mono">
            <span>Avg. Prep: <strong class="text-on-surface font-bold">${loc.prepTimeAvg}</strong></span>
            <span class="text-primary font-bold flex items-center gap-1 group-hover:translate-x-1 transition-transform">Select Location &rarr;</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  const actionSection = document.getElementById('location-action-section');
  if (actionSection) {
    actionSection.classList.remove('opacity-0', 'translate-y-4', 'pointer-events-none');
  }
}

function selectLocationOption(locationName) {
  AppState.location = locationName;
  saveLocationState();
  updateLocationHeader();
  updateDropdownCheckmarks();

  if (AppState.activeRoute === 'location') {
    renderLocationView();
  } else if (AppState.activeRoute === 'bill') {
    renderBillView();
  }
  showToast(`Location set to ${locationName}`, 'location_on', 'info');

  const actionSection = document.getElementById('location-action-section');
  if (actionSection) {
    actionSection.classList.remove('opacity-0', 'translate-y-4', 'pointer-events-none');
  }
}

/**
 * ==========================================================================
 * 2. MENU VIEW LOGIC
 * ==========================================================================
 */
function renderMenuView() {
  renderCategoryTabs();
  renderDietaryFilters();
  renderMenuItems();
}

function renderCategoryTabs() {
  const baseCategories = (typeof MENU_CATEGORIES !== 'undefined' ? MENU_CATEGORIES : (typeof window !== 'undefined' && window.MENU_CATEGORIES ? window.MENU_CATEGORIES : []));
  const categories = [
    { id: 'all', label: 'All Items', icon: 'restaurant_menu' },
    ...baseCategories.map(c => ({ id: c.id, label: c.name, icon: c.icon }))
  ];

  const container = document.getElementById('category-tabs-bar');
  if (!container) return;

  container.innerHTML = categories.map(cat => {
    const isActive = AppState.activeCategory === cat.id;
    return `
      <button onclick="setCategoryFilter('${cat.id}')" class="px-6 py-3 rounded-full font-button text-sm font-bold whitespace-nowrap transition-all duration-300 flex items-center gap-2 cursor-pointer ${isActive ? 'bg-on-background text-on-primary shadow-md scale-105' : 'bg-surface-container hover:bg-surface-container-high text-on-surface border border-transparent hover:border-outline-variant'}">
        <span class="material-symbols-outlined text-[18px]">${cat.icon}</span>
        ${cat.label}
      </button>
    `;
  }).join('');
}

function setCategoryFilter(categoryId) {
  AppState.activeCategory = categoryId;
  renderCategoryTabs();
  renderMenuItems();
}

function renderDietaryFilters() {
  const dietaryOptions = [
    { id: 'all', label: 'All Diets' },
    { id: 'veg', label: '🥬 Vegetarian' },
    { id: 'non-veg', label: '🍗 Non-Veg' },
    { id: 'vegan', label: '🌱 Vegan' },
    { id: 'spicy', label: '🌶️ Spicy' }
  ];

  const container = document.getElementById('dietary-chips-bar');
  if (!container) return;

  container.innerHTML = dietaryOptions.map(opt => {
    const isActive = AppState.dietaryFilter === opt.id;
    return `
      <button onclick="setDietaryFilter('${opt.id}')" class="px-4 py-1.5 rounded-full text-xs font-mono font-medium transition-all cursor-pointer ${isActive ? 'bg-primary text-on-primary shadow-sm' : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-variant'}">
        ${opt.label}
      </button>
    `;
  }).join('');
}

function setDietaryFilter(dietId) {
  AppState.dietaryFilter = dietId;
  renderDietaryFilters();
  renderMenuItems();
}

function renderMenuItems() {
  const container = document.getElementById('menu-items-grid');
  if (!container) return;

  const allMenu = window.AromasMenuService ? window.AromasMenuService.getActiveMenu() : MENU_DATA;
  let filtered = allMenu;

  // Filter strictly by canonical Category ID
  if (AppState.activeCategory !== 'all') {
    filtered = filtered.filter(item => {
      const itemCat = (typeof normalizeMenuCategory === 'function')
        ? normalizeMenuCategory(item.category)
        : (item.category ? String(item.category).trim().toLowerCase() : '');
      return itemCat === AppState.activeCategory;
    });
  }

  if (AppState.dietaryFilter !== 'all') {
    if (AppState.dietaryFilter === 'spicy') {
      filtered = filtered.filter(item => item.tagType === 'spicy' || (item.description && item.description.toLowerCase().includes('spicy')));
    } else {
      filtered = filtered.filter(item => item.dietary === AppState.dietaryFilter);
    }
  }

  if (AppState.searchQuery) {
    const q = AppState.searchQuery.toLowerCase().trim();
    filtered = filtered.filter(item => {
      const catDisplayName = (typeof getCategoryDisplayName === 'function') ? getCategoryDisplayName(item.category) : (item.category || '');
      return (item.name && item.name.toLowerCase().includes(q)) || 
             (item.description && item.description.toLowerCase().includes(q)) ||
             (item.category && item.category.toLowerCase().includes(q)) ||
             catDisplayName.toLowerCase().includes(q);
    });
  }

  const countEl = document.getElementById('total-menu-count');
  if (countEl) countEl.textContent = filtered.length;

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="col-span-full py-16 flex flex-col items-center justify-center text-center">
        <span class="material-symbols-outlined text-6xl text-outline-variant mb-4">search_off</span>
        <h3 class="font-headline text-xl text-on-surface mb-2">No menu items found</h3>
        <p class="text-sm text-on-surface-variant max-w-sm mb-6">Try searching with a different keyword or reset your dietary filters.</p>
        <button onclick="resetMenuFilters()" class="px-6 py-2.5 bg-primary text-on-primary rounded-full font-button text-sm">Reset Filters</button>
      </div>
    `;
    return;
  }

  const mostSelling = window.AromasMenuService ? window.AromasMenuService.getMostSellingStats() : { topDishId: null, topSalesCount: 0 };

  let authNotice = '';
  if (!AppState.currentUser) {
    authNotice = `
      <div class="col-span-full mb-4 p-4 sm:p-5 rounded-3xl bg-primary-fixed/50 border border-primary/20 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm animate-fadeIn">
        <div class="flex items-center gap-3.5">
          <div class="w-11 h-11 rounded-2xl bg-primary text-on-primary flex items-center justify-center shadow-sm">
            <span class="material-symbols-outlined text-2xl">lock</span>
          </div>
          <div>
            <h4 class="font-display text-sm sm:text-base font-bold text-on-surface">Please log in to order food</h4>
            <p class="text-xs text-on-surface-variant">Login with your mobile number to add items to your live bill and track kitchen preparation.</p>
          </div>
        </div>
        <button onclick="openAuthModal('Please log in with your phone number to start adding food to your order.')" class="w-full sm:w-auto whitespace-nowrap px-6 py-2.5 bg-primary text-on-primary font-button text-xs font-bold rounded-full shadow-md hover:bg-primary-container hover:scale-105 transition-all flex items-center justify-center gap-1.5">
          <span class="material-symbols-outlined text-base">smartphone</span>
          <span>Login to Order</span>
        </button>
      </div>
    `;
  }

  const itemsHtml = filtered.map(item => {
    const cartItem = AppState.cart.find(c => c.id === item.id);
    const qty = cartItem ? cartItem.qty : 0;
    const stock = window.AromasMenuService ? window.AromasMenuService.getItemStock(item.id) : 20;
    const isOutOfStock = stock <= 0;
    const isLowStock = stock > 0 && stock <= 3;
    const isTopSeller = (item.id === mostSelling.topDishId && mostSelling.topSalesCount > 0);

    let tagBadge = '';
    if (isOutOfStock) {
      tagBadge = `
        <div class="absolute top-3 left-3 bg-red-600 text-white backdrop-blur-md px-3 py-1 rounded-full flex items-center gap-1 shadow-md z-20">
          <span class="material-symbols-outlined text-[14px]">block</span>
          <span class="font-receipt text-[11px] font-black tracking-wide uppercase">Not Available</span>
        </div>
      `;
    } else if (isLowStock) {
      tagBadge = `
        <div class="absolute top-3 left-3 bg-gradient-to-r from-amber-600 to-orange-600 text-white backdrop-blur-md px-3 py-1 rounded-full flex items-center gap-1 shadow-md z-20 animate-pulse">
          <span class="material-symbols-outlined text-[14px]">bolt</span>
          <span class="font-receipt text-[11px] font-bold tracking-wide">Only ${stock} Left!</span>
        </div>
      `;
    } else if (isTopSeller) {
      tagBadge = `
        <div class="absolute top-3 left-3 bg-gradient-to-r from-orange-600 to-amber-600 text-white backdrop-blur-md px-3 py-1 rounded-full flex items-center gap-1 shadow-md z-20">
          <span class="material-symbols-outlined text-[14px]">local_fire_department</span>
          <span class="font-receipt text-[11px] font-bold tracking-wide">#1 Top Selling (${mostSelling.topSalesCount}+ Ordered)</span>
        </div>
      `;
    } else if (item.tag) {
      let badgeClass = 'badge-primary';
      let icon = 'star';
      if (item.tagType === 'veg') { badgeClass = 'badge-veg'; icon = 'eco'; }
      else if (item.tagType === 'spicy') { badgeClass = 'badge-spicy'; icon = 'local_fire_department'; }
      else if (item.tagType === 'vegan') { badgeClass = 'badge-vegan'; icon = 'spa'; }
      
      tagBadge = `
        <div class="absolute top-3 left-3 ${badgeClass} backdrop-blur-md px-3 py-1 rounded-full flex items-center gap-1 shadow-sm z-20">
          <span class="material-symbols-outlined text-[14px]">${icon}</span>
          <span class="font-receipt text-[11px] font-bold tracking-wide">${item.tag}</span>
        </div>
      `;
    }

    const stockWarningHtml = isOutOfStock ? `
      <p class="text-[11px] text-red-600 dark:text-red-400 font-mono font-bold mb-2 flex items-center gap-1">
        <span class="material-symbols-outlined text-sm">error</span>
        <span>Item is currently not available (Sold Out in Kitchen)</span>
      </p>
    ` : isLowStock ? `
      <p class="text-[11px] text-amber-700 dark:text-amber-400 font-mono font-bold mb-2 flex items-center gap-1">
        <span class="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
        <span>High Demand — Only ${stock} remaining in kitchen!</span>
      </p>
    ` : '';

    return `
      <div class="food-card flex flex-col group relative bg-surface-container-lowest rounded-[24px] shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden border ${isOutOfStock ? 'border-red-500/30 bg-red-950/[0.03] opacity-80' : 'border-surface-container-high/60'}">
        <div class="relative w-full h-52 sm:h-56 bg-surface-container overflow-hidden">
          <img src="${item.image}" alt="${item.name}" loading="lazy" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out ${isOutOfStock ? 'grayscale-[40%]' : ''}" onerror="this.src='https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80'" />
          <div class="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-60"></div>
          
          ${isOutOfStock ? `
            <div class="absolute inset-0 bg-stone-950/75 backdrop-blur-[2px] flex flex-col items-center justify-center text-center p-3 z-10">
              <div class="w-10 h-10 rounded-full bg-red-600/90 text-white flex items-center justify-center shadow-lg mb-1.5 animate-pulse">
                <span class="material-symbols-outlined text-xl">remove_shopping_cart</span>
              </div>
              <span class="font-display font-black text-xs uppercase tracking-widest text-white px-3 py-1 rounded-full bg-red-600 shadow-md">Item Not Available</span>
              <span class="text-[10px] font-mono text-red-200 mt-1 font-medium">Currently Sold Out</span>
            </div>
          ` : ''}

          ${tagBadge}
          <div class="absolute bottom-3 right-3 font-receipt text-[11px] px-2.5 py-1 rounded-md bg-black/60 backdrop-blur-md text-white font-medium z-10">
            ${item.prepTime || '10 min'}
          </div>
        </div>

        <div class="p-6 flex flex-col flex-grow">
          <div class="flex justify-between items-start mb-2 gap-2">
            <h3 class="font-headline text-[18px] sm:text-[20px] leading-snug text-on-surface group-hover:text-primary transition-colors ${isOutOfStock ? 'line-through text-on-surface-variant/70' : ''}">${item.name}</h3>
            <span class="font-receipt text-lg font-extrabold text-on-surface whitespace-nowrap ${isOutOfStock ? 'text-on-surface-variant/70' : ''}">₹${item.price}</span>
          </div>

          <p class="font-body text-on-surface-variant text-[13px] leading-relaxed line-clamp-2 mb-3">
            ${item.description}
          </p>

          ${stockWarningHtml}

          <div class="mt-auto pt-4 border-t border-surface-container flex items-center justify-between gap-3">
            <button onclick="${isOutOfStock ? `showToast('${item.name} is currently not available', 'block', 'warning')` : `openCustomizeModal('${item.id}')`}" class="text-xs font-semibold ${isOutOfStock ? 'text-on-surface-variant/40 cursor-not-allowed' : 'text-on-surface-variant hover:text-primary'} flex items-center gap-1 transition-colors">
              <span class="material-symbols-outlined text-[16px]">tune</span> Customize
            </button>

            <div class="w-36 flex justify-end">
              ${isOutOfStock ? `
                <button disabled class="w-full py-2.5 px-2 rounded-full bg-red-950/20 text-red-600 dark:text-red-400 font-button text-xs font-black cursor-not-allowed border border-red-500/30 flex items-center justify-center gap-1 shadow-sm">
                  <span class="material-symbols-outlined text-[16px]">block</span> Not Available
                </button>
              ` : qty > 0 ? `
                <div class="flex items-center justify-between w-full bg-surface-container-high rounded-full p-1 border border-outline-variant/40 shadow-inner">
                  <button onclick="updateItemQuantity('${item.id}', -1)" class="w-8 h-8 rounded-full flex items-center justify-center text-on-surface hover:bg-surface-container-highest transition-colors active:scale-95">
                    <span class="material-symbols-outlined text-sm">remove</span>
                  </button>
                  <span class="font-receipt text-sm font-bold text-on-surface px-2">${qty}</span>
                  <button onclick="updateItemQuantity('${item.id}', 1)" class="w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center hover:bg-primary-container transition-colors shadow-sm active:scale-95">
                    <span class="material-symbols-outlined text-sm">add</span>
                  </button>
                </div>
              ` : `
                <button onclick="addItemToCart('${item.id}')" class="w-full py-2.5 px-4 rounded-full bg-surface-container-high hover:bg-primary text-on-surface hover:text-on-primary font-button text-xs font-bold transition-all flex justify-center items-center gap-1.5 hover:shadow-md hover:shadow-primary/20 active:scale-95">
                  <span class="material-symbols-outlined text-[18px]">add</span> Add
                </button>
              `}
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = authNotice + itemsHtml;
}

function resetMenuFilters() {
  AppState.activeCategory = 'all';
  AppState.dietaryFilter = 'all';
  AppState.searchQuery = '';
  const input = document.getElementById('menu-search-input');
  if (input) input.value = '';
  renderMenuView();
}

/**
 * ==========================================================================
 * 3. CART & QUANTITY MANAGEMENT (STRICT LOGIN CHECK & STOCK VALIDATION)
 * ==========================================================================
 */
function addItemToCart(itemId, selectedOptions = []) {
  ensureUserSession();

  const menuItem = window.AromasMenuService ? window.AromasMenuService.getItemById(itemId) : MENU_DATA.find(m => m.id === itemId);
  if (!menuItem) return;

  const stock = window.AromasMenuService ? window.AromasMenuService.getItemStock(itemId) : 20;
  if (stock <= 0) {
    showToast(`Sorry, ${menuItem.name} is currently out of stock!`, 'block', 'error');
    return;
  }

  const existing = AppState.cart.find(c => c.id === itemId);
  if (existing) {
    if (existing.qty >= stock) {
      showToast(`Only ${stock} portions of ${menuItem.name} available in kitchen!`, 'warning', 'warning');
      return;
    }
    existing.qty += 1;
  } else {
    AppState.cart.push({
      id: menuItem.id,
      name: menuItem.name,
      price: menuItem.price,
      qty: 1,
      image: menuItem.image,
      category: menuItem.category,
      selectedOptions: selectedOptions
    });
  }

  saveCartState();
  renderMenuItems();
  showToast(`Added ${menuItem.name} to cart`, 'shopping_bag', 'success');
}

function updateItemQuantity(itemId, delta) {
  if (delta > 0 && !AppState.currentUser) {
    showToast('Please log in with your phone number to order food', 'smartphone', 'warning');
    openAuthModal('Please sign in to order food.');
    return;
  }

  const stock = window.AromasMenuService ? window.AromasMenuService.getItemStock(itemId) : 20;

  const index = AppState.cart.findIndex(c => c.id === itemId);
  if (index > -1) {
    if (delta > 0 && AppState.cart[index].qty + delta > stock) {
      showToast(`Only ${stock} portions available in kitchen!`, 'warning', 'warning');
      return;
    }
    AppState.cart[index].qty += delta;
    if (AppState.cart[index].qty <= 0) {
      const removed = AppState.cart.splice(index, 1);
      showToast(`Removed ${removed[0].name}`, 'delete', 'info');
    }
  } else if (delta > 0) {
    addItemToCart(itemId);
    return;
  }

  saveCartState();
  renderMenuItems();
  if (AppState.activeRoute === 'bill') {
    renderBillView();
  }
}

function removeCartItem(itemId) {
  const index = AppState.cart.findIndex(c => c.id === itemId);
  if (index > -1) {
    const removed = AppState.cart.splice(index, 1);
    saveCartState();
    renderMenuItems();
    if (AppState.activeRoute === 'bill') {
      renderBillView();
    }
    showToast(`Removed ${removed[0].name}`, 'delete', 'info');
  }
}

function clearCart() {
  AppState.cart = [];
  AppState.appliedCoupon = null;
  localStorage.removeItem(STORAGE_KEYS.COUPON);
  saveCartState();
  renderMenuItems();
  if (AppState.activeRoute === 'bill') {
    renderBillView();
  }
  showToast('Cart cleared', 'remove_shopping_cart', 'info');
}

function calculateOrderTotals() {
  const subtotal = AppState.cart.reduce((sum, item) => {
    const optionsCost = (item.selectedOptions || []).reduce((oSum, opt) => oSum + (opt.price || 0), 0);
    return sum + ((item.price + optionsCost) * item.qty);
  }, 0);

  let discount = 0;
  if (AppState.appliedCoupon && subtotal > 0) {
    if (AppState.appliedCoupon.discountPercent) {
      discount = Math.round((subtotal * AppState.appliedCoupon.discountPercent) / 100);
    } else if (AppState.appliedCoupon.flatDiscount) {
      discount = Math.min(AppState.appliedCoupon.flatDiscount, subtotal);
    }
  }

  const taxPercentage = (AppState.billingSettings && typeof AppState.billingSettings.taxPercentage === 'number')
    ? AppState.billingSettings.taxPercentage
    : (window.AromasFirebaseService ? window.AromasFirebaseService.getTaxPercentage() : 5.0);

  const taxLabel = (AppState.billingSettings && AppState.billingSettings.taxLabel)
    ? AppState.billingSettings.taxLabel
    : (window.AromasFirebaseService ? window.AromasFirebaseService.getTaxLabel() : 'GST');

  const taxableAmount = Math.max(0, subtotal - discount);
  const tax = Number(((taxableAmount * taxPercentage) / 100).toFixed(2));
  const packagingFee = subtotal > 0 ? 15 : 0;
  const total = Number((taxableAmount + tax + packagingFee).toFixed(2));

  return { subtotal, discount, tax, taxPercentage, taxLabel, packagingFee, total };
}

/**
 * ==========================================================================
 * 4. RECEIPT & BILL VIEW LOGIC
 * ==========================================================================
 */
function renderBillView(orderIdToRender = null) {
  const container = document.getElementById('bill-receipt-container');
  if (!container) return;

  // Determine if we are rendering a specific Paid Order vs the Active Draft Cart
  let paidOrder = null;
  if (orderIdToRender) {
    paidOrder = AppState.userOrders.find(o => o.id === orderIdToRender) || AppState.orders.find(o => o.id === orderIdToRender);
  } else if (AppState.cart.length === 0 && AppState.lastPaidOrder) {
    paidOrder = AppState.lastPaidOrder;
  }

  const isPaid = !!paidOrder;
  const items = isPaid ? (paidOrder.items || []) : AppState.cart;
  const totals = isPaid ? {
    subtotal: paidOrder.subtotal !== undefined ? paidOrder.subtotal : (paidOrder.total || 0),
    discount: paidOrder.discount || 0,
    tax: paidOrder.taxAmount !== undefined ? paidOrder.taxAmount : (paidOrder.tax || 0),
    taxPercentage: paidOrder.taxPercentage !== undefined ? paidOrder.taxPercentage : 5,
    taxLabel: paidOrder.taxLabel || 'GST',
    packagingFee: paidOrder.packagingFee !== undefined ? paidOrder.packagingFee : 0,
    total: paidOrder.total
  } : calculateOrderTotals();

  const location = isPaid ? (paidOrder.location || AppState.location) : AppState.location;
  const orderId = isPaid ? paidOrder.id : `ARM-${Math.floor(10000 + Math.random() * 90000)}`;
  const dateStr = isPaid ? (paidOrder.dateFull || paidOrder.date || new Date().toLocaleDateString('en-GB')) : new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const timeStr = isPaid ? (paidOrder.date || new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })) : new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  const customerPhone = isPaid ? paidOrder.userPhone : (AppState.currentUser ? AppState.currentUser.phoneNumber : '+91 98765 43210');

  if (!isPaid && items.length === 0) {
    const lastOrder = AppState.lastPaidOrder || (AppState.userOrders.length > 0 ? AppState.userOrders[0] : null);
    container.innerHTML = `
      <div class="receipt-paper relative w-full max-w-[420px] p-8 sm:p-10 text-center rounded-2xl mx-auto">
        <div class="py-10 flex flex-col items-center">
          <div class="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant mb-4">
            <span class="material-symbols-outlined text-3xl">receipt_long</span>
          </div>
          <h2 class="font-headline text-xl text-on-surface mb-2">No Items in Active Cart</h2>
          <p class="font-body text-sm text-on-surface-variant mb-6">Choose delicious items from the menu to generate a live bill.</p>
          
          <div class="flex flex-col gap-2.5 w-full">
            <button onclick="navigateTo('menu')" class="w-full py-3.5 bg-primary text-on-primary font-button text-sm rounded-full shadow-md hover:scale-105 transition-all">
              Explore Menu &rarr;
            </button>
            ${lastOrder ? `
              <button onclick="renderBillView('${lastOrder.id}')" class="w-full py-2.5 bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-mono font-bold rounded-full transition-colors flex items-center justify-center gap-1.5 border border-surface-container-high">
                <span class="material-symbols-outlined text-sm text-emerald-500">receipt</span>
                <span>View Last Paid Receipt (#${lastOrder.token || lastOrder.id})</span>
              </button>
            ` : ''}
          </div>
        </div>
      </div>
    `;
    return;
  }

  const itemsHtml = items.map(item => {
    const optionsCost = (item.selectedOptions || []).reduce((oSum, opt) => oSum + (opt.price || 0), 0);
    const itemTotal = (item.price + optionsCost) * item.qty;
    const optionsText = item.selectedOptions && item.selectedOptions.length > 0 
      ? `<span class="block text-[11px] text-on-surface-variant opacity-80">+ ${item.selectedOptions.map(o => o.name).join(', ')}</span>`
      : '';

    return `
      <div class="flex justify-between items-start font-receipt text-[13px] sm:text-[14px] text-on-surface leading-tight py-1 group">
        <div class="flex-1 pr-2">
          <span class="font-medium">${item.name}</span>
          ${optionsText}
        </div>
        <div class="w-14 text-center text-on-surface-variant flex items-center justify-center gap-1">
          ${!isPaid ? `
            <button onclick="updateItemQuantity('${item.id}', -1)" class="w-4 h-4 rounded text-xs bg-surface-container-high hover:bg-primary hover:text-white flex items-center justify-center no-print">-</button>
          ` : ''}
          <span class="font-bold font-mono">${item.qty}</span>
          ${!isPaid ? `
            <button onclick="updateItemQuantity('${item.id}', 1)" class="w-4 h-4 rounded text-xs bg-surface-container-high hover:bg-primary hover:text-white flex items-center justify-center no-print">+</button>
          ` : ''}
        </div>
        <span class="w-20 text-right font-semibold">₹${itemTotal}</span>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="w-full max-w-xl flex flex-col items-center">
      <div class="receipt-paper relative w-full max-w-[440px] p-6 sm:p-8 text-on-surface mx-auto">
        
        <!-- Paid Stamp Badge (Rendered ONLY if order is paid) -->
        ${isPaid ? `
          <div class="mb-4 p-3 rounded-2xl bg-emerald-950/20 dark:bg-emerald-900/30 border-2 border-emerald-500/40 text-emerald-800 dark:text-emerald-300 flex items-center justify-between shadow-sm animate-fadeIn">
            <div class="flex items-center gap-2">
              <span class="material-symbols-outlined text-xl text-emerald-500">verified</span>
              <div>
                <p class="font-display font-extrabold text-xs tracking-wider uppercase">Official Paid Bill</p>
                <p class="font-mono text-[10px] opacity-80">${paidOrder.paymentMethod || 'Paid Online'} • ${paidOrder.status || 'Received'}</p>
              </div>
            </div>
            <span class="px-2.5 py-1 rounded-xl bg-emerald-500 text-white font-mono font-black text-xs shadow-sm">
              TOKEN #${paidOrder.token || ''}
            </span>
          </div>
        ` : ''}

        <!-- Receipt Header -->
        <div class="flex flex-col items-center mb-6 text-center">
          <div class="flex items-center gap-2 mb-1">
            <img src="assets/logo.png" alt="Aromas" class="h-8 w-auto object-contain" onerror="this.style.display='none'" />
            <h1 class="font-display text-3xl text-on-surface tracking-widest uppercase font-extrabold">Aromas</h1>
          </div>
          <p class="font-receipt text-[11px] text-on-surface-variant uppercase tracking-widest">Contemporary Food & Beverage</p>
        </div>

        <!-- Metadata -->
        <div class="font-receipt text-[12px] leading-relaxed text-on-surface mb-6 flex flex-col items-center opacity-85 bg-surface-container/50 py-2.5 px-4 rounded-xl border border-surface-container-high">
          <span class="font-semibold text-primary">Location: ${location}</span>
          <span>Order Reference: <strong class="text-on-surface">${orderId}</strong></span>
          <span>Date: ${dateStr} | Time: ${timeStr}</span>
          <span class="text-[11px] text-primary font-bold mt-0.5">👤 ${customerPhone}</span>
        </div>

        <!-- Divider -->
        <div class="w-full border-t border-dashed border-outline/40 mb-4"></div>

        <!-- Table Header -->
        <div class="flex justify-between font-receipt text-[12px] font-bold text-on-surface mb-3 uppercase tracking-wider opacity-90 border-b border-surface-container-high pb-2">
          <span class="flex-1">Item</span>
          <span class="w-14 text-center">Qty</span>
          <span class="w-20 text-right">Amount</span>
        </div>

        <!-- Items List -->
        <div class="flex flex-col gap-2 mb-6">
          ${itemsHtml}
        </div>

        <!-- Divider -->
        <div class="w-full border-t border-dashed border-outline/40 mb-4"></div>

        <!-- Calculations Breakdown -->
        <div class="flex flex-col gap-2 font-receipt text-[13px] text-on-surface mb-6">
          <div class="flex justify-between opacity-80">
            <span>Subtotal</span>
            <span>₹${Number(totals.subtotal).toFixed(2)}</span>
          </div>

          ${totals.discount > 0 ? `
            <div class="flex justify-between text-veg font-semibold">
              <span>Discount</span>
              <span>-₹${Number(totals.discount).toFixed(2)}</span>
            </div>
          ` : ''}

          <div class="flex justify-between opacity-80">
            <span>${totals.taxLabel || 'GST'} (${totals.taxPercentage !== undefined ? totals.taxPercentage : 5}%)</span>
            <span>₹${Number(totals.tax).toFixed(2)}</span>
          </div>

          <div class="flex justify-between opacity-80">
            <span>Eco Packaging</span>
            <span>₹${Number(totals.packagingFee).toFixed(2)}</span>
          </div>

          <!-- TOTAL -->
          <div class="flex justify-between items-center font-display text-[26px] leading-[34px] text-primary mt-3 pt-3 border-t-2 border-primary/20 font-black">
            <span>TOTAL</span>
            <span>₹${Number(totals.total).toFixed(2)}</span>
          </div>
        </div>

        ${!isPaid ? `
          <!-- Coupon Promo Box (Only before payment) -->
          <div class="no-print mb-6 p-3.5 bg-surface-container rounded-2xl border border-surface-container-high">
            <label class="block text-xs font-mono font-semibold text-on-surface-variant mb-1.5">Apply Promo Code</label>
            <div class="flex gap-2">
              <input type="text" id="coupon-code-input" placeholder="e.g. AROMAS20" value="${AppState.appliedCoupon ? AppState.appliedCoupon.code : ''}" class="flex-1 uppercase font-receipt text-xs px-3 py-2 rounded-xl bg-surface-container-lowest border border-outline-variant focus:outline-none focus:border-primary text-on-surface" />
              <button onclick="applyCouponCode()" class="px-4 py-2 bg-on-background text-on-primary font-button text-xs rounded-xl hover:bg-primary transition-colors">
                ${AppState.appliedCoupon ? 'Applied' : 'Apply'}
              </button>
            </div>
            <div class="flex flex-wrap gap-1.5 mt-2">
              <span onclick="setCouponQuick('AROMAS20')" class="cursor-pointer text-[10px] font-mono bg-surface-container-highest px-2 py-0.5 rounded text-on-surface-variant hover:text-primary">AROMAS20 (20% Off)</span>
              <span onclick="setCouponQuick('WELCOME50')" class="cursor-pointer text-[10px] font-mono bg-surface-container-highest px-2 py-0.5 rounded text-on-surface-variant hover:text-primary">WELCOME50 (₹50 Off)</span>
            </div>
          </div>
        ` : ''}

        <!-- Footer Message -->
        <div class="text-center font-receipt text-[11px] text-on-surface-variant leading-relaxed opacity-75 mt-6 mb-2">
          <p>Thank you for dining with Aromas.</p>
          <p class="font-semibold text-primary">Fresh food. Effortless indulgence.</p>
        </div>

        <!-- Torn Paper Edge Bottom -->
        <div class="torn-edge"></div>
      </div>

      ${isPaid ? `
        <!-- SHARE & EXPORT TOOLBAR (Active ONLY After Payment) -->
        <div class="no-print mt-5 w-full max-w-[440px] mx-auto px-2 animate-fadeIn">
          <div class="bg-surface-container rounded-3xl p-4 border border-surface-container-high shadow-sm">
            <div class="flex items-center justify-between mb-3 px-1">
              <span class="text-xs font-mono font-bold text-on-surface-variant uppercase tracking-wider flex items-center gap-1.5">
                <span class="material-symbols-outlined text-base text-emerald-500">share</span>
                <span>Share Paid Bill & Receipt</span>
              </span>
              <span class="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">Verified 80mm Slip</span>
            </div>

            <div class="grid grid-cols-4 gap-2">
              <!-- WhatsApp Button -->
              <button onclick="shareBillViaWhatsApp('${paidOrder.id}')" class="flex flex-col items-center justify-center gap-1.5 p-2.5 rounded-2xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 transition-all hover:scale-105 active:scale-95 group shadow-sm" title="Share Bill on WhatsApp">
                <div class="w-9 h-9 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-md shadow-emerald-500/20 group-hover:scale-110 transition-transform">
                  <span class="material-symbols-outlined text-lg">chat</span>
                </div>
                <span class="text-[11px] font-mono font-bold">WhatsApp</span>
              </button>

              <!-- Email / Mail Button -->
              <button onclick="shareBillViaEmail('${paidOrder.id}')" class="flex flex-col items-center justify-center gap-1.5 p-2.5 rounded-2xl bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 transition-all hover:scale-105 active:scale-95 group shadow-sm" title="Share Bill via Email">
                <div class="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-600/20 group-hover:scale-110 transition-transform">
                  <span class="material-symbols-outlined text-lg">mail</span>
                </div>
                <span class="text-[11px] font-mono font-bold">Email</span>
              </button>

              <!-- Export Image (PNG) Button -->
              <button onclick="exportBillAsImage('bill-receipt-container', 'Aromas_Receipt_${paidOrder.token || paidOrder.id}.png')" class="flex flex-col items-center justify-center gap-1.5 p-2.5 rounded-2xl bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-900/50 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 transition-all hover:scale-105 active:scale-95 group shadow-sm" title="Download Receipt as PNG Image">
                <div class="w-9 h-9 rounded-full bg-amber-600 text-white flex items-center justify-center shadow-md shadow-amber-600/20 group-hover:scale-110 transition-transform">
                  <span class="material-symbols-outlined text-lg">image</span>
                </div>
                <span class="text-[11px] font-mono font-bold">Save PNG</span>
              </button>

              <!-- Print / PDF Slip Button (80mm) -->
              <button onclick="printReceiptSlip('${paidOrder.id}')" class="flex flex-col items-center justify-center gap-1.5 p-2.5 rounded-2xl bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/40 dark:hover:bg-purple-900/50 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 transition-all hover:scale-105 active:scale-95 group shadow-sm" title="Print Compact 80mm Receipt Slip / PDF">
                <div class="w-9 h-9 rounded-full bg-purple-600 text-white flex items-center justify-center shadow-md shadow-purple-600/20 group-hover:scale-110 transition-transform">
                  <span class="material-symbols-outlined text-lg">print</span>
                </div>
                <span class="text-[11px] font-mono font-bold">Print Slip</span>
              </button>
            </div>

            <!-- Quick Copy Text / Share Option -->
            <div class="mt-2.5 pt-2.5 border-t border-surface-container-highest flex items-center justify-between text-xs">
              <button onclick="shareBillReceipt('${paidOrder.id}')" class="text-on-surface-variant hover:text-primary transition-colors flex items-center gap-1 font-mono text-[11px] font-medium">
                <span class="material-symbols-outlined text-sm">ios_share</span>
                <span>More Share Options</span>
              </button>
              <button onclick="copyReceiptToClipboard(formatReceiptSummaryText(${JSON.stringify(paidOrder).replace(/"/g, '&quot;')}))" class="text-on-surface-variant hover:text-primary transition-colors flex items-center gap-1 font-mono text-[11px] font-medium">
                <span class="material-symbols-outlined text-sm">content_copy</span>
                <span>Copy Bill Text</span>
              </button>
            </div>
          </div>

          <!-- Action Buttons for Paid Receipt -->
          <div class="flex gap-2.5 mt-4">
            <button onclick="navigateTo('orders')" class="flex-1 py-3.5 bg-primary text-on-primary font-button text-xs font-bold rounded-full shadow-md hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-1.5">
              <span class="material-symbols-outlined text-base">outdoor_grill</span>
              <span>Track Live Order</span>
            </button>
            <button onclick="navigateTo('menu')" class="flex-1 py-3.5 bg-surface-container hover:bg-surface-container-high text-on-surface font-button text-xs font-bold rounded-full border border-surface-container-high transition-colors flex items-center justify-center gap-1.5">
              <span class="material-symbols-outlined text-base">restaurant_menu</span>
              <span>Order More</span>
            </button>
          </div>
        </div>
      ` : `
        <!-- Pre-Payment Locked Message & Checkout Action -->
        <div class="no-print mt-3 w-full max-w-[440px] mx-auto px-2 flex flex-col gap-3">
          <div class="p-3 bg-surface-container/70 rounded-2xl border border-surface-container-high text-center text-xs font-mono text-on-surface-variant flex items-center justify-center gap-2">
            <span class="material-symbols-outlined text-base text-primary">lock</span>
            <span>Official bill sharing (WhatsApp, Email, PDF) unlocks after payment</span>
          </div>

          <!-- Receipt Bottom Action - Pay Button -->
          <button onclick="handlePayButtonClick()" class="w-full py-4 px-6 bg-primary hover:bg-primary-container text-on-primary font-button text-base rounded-full flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-95 shadow-xl shadow-primary/25 transition-all select-none font-bold">
            <span class="material-symbols-outlined text-2xl">payments</span>
            <span class="whitespace-nowrap">Pay ₹${totals.total}</span>
          </button>
        </div>
      `}
    </div>
  `;
}

function handlePayButtonClick() {
  ensureUserSession();
  openPaymentModal();
}

function applyCouponCode() {
  const input = document.getElementById('coupon-code-input');
  if (!input) return;
  const code = input.value.trim().toUpperCase();

  if (!code) {
    AppState.appliedCoupon = null;
    localStorage.removeItem(STORAGE_KEYS.COUPON);
    renderBillView();
    showToast('Promo removed', 'info', 'info');
    return;
  }

  if (COUPONS[code]) {
    const totals = calculateOrderTotals();
    if (COUPONS[code].minOrder && totals.subtotal < COUPONS[code].minOrder) {
      showToast(`Minimum order ₹${COUPONS[code].minOrder} required for ${code}`, 'warning', 'warning');
      return;
    }
    AppState.appliedCoupon = { code, ...COUPONS[code] };
    localStorage.setItem(STORAGE_KEYS.COUPON, code);
    renderBillView();
    showToast(`Applied ${code}! ${COUPONS[code].description}`, 'loyalty', 'success');
  } else {
    showToast('Invalid promo code. Try AROMAS20', 'error', 'error');
  }
}

function setCouponQuick(code) {
  const input = document.getElementById('coupon-code-input');
  if (input) {
    input.value = code;
    applyCouponCode();
  }
}

/**
 * ==========================================================================
 * BILL RECEIPT SHARING & EXPORT UTILITIES (WhatsApp, Email, PNG, 80mm Print)
 * ==========================================================================
 */
function formatReceiptSummaryText(orderData = null) {
  const isHistorical = !!orderData;
  const totals = isHistorical ? {
    subtotal: orderData.subtotal !== undefined ? orderData.subtotal : (orderData.total || 0),
    discount: orderData.discount || 0,
    tax: orderData.taxAmount !== undefined ? orderData.taxAmount : (orderData.tax || 0),
    taxPercentage: orderData.taxPercentage !== undefined ? orderData.taxPercentage : 5,
    taxLabel: orderData.taxLabel || 'GST',
    packagingFee: orderData.packagingFee !== undefined ? orderData.packagingFee : 0,
    total: orderData.total
  } : calculateOrderTotals();

  const items = isHistorical ? (orderData.items || []) : AppState.cart;
  const location = isHistorical ? (orderData.location || AppState.location) : AppState.location;
  const token = isHistorical ? (orderData.token || orderData.id) : (AppState.activeToken ? `#${AppState.activeToken}` : 'Live Bill');
  const dateStr = isHistorical ? (orderData.dateFull || orderData.date || new Date().toLocaleDateString('en-GB')) : new Date().toLocaleDateString('en-GB');
  const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

  let text = `🧾 *AROMAS — DINING BILL & RECEIPT*\n`;
  text += `━━━━━━━━━━━━━━━━━━━━━\n`;
  text += `📍 Location: ${location}\n`;
  text += `🏷️ Token / Ref: ${token}\n`;
  text += `📅 Date: ${dateStr} | ${timeStr}\n`;
  if (AppState.currentUser && AppState.currentUser.phoneNumber) {
    text += `👤 Customer: ${AppState.currentUser.phoneNumber}\n`;
  }
  text += `━━━━━━━━━━━━━━━━━━━━━\n`;
  text += `🍽️ *ITEMS:*\n`;

  if (items.length === 0) {
    text += `• (No items in bill)\n`;
  } else {
    items.forEach((item, idx) => {
      const opts = (item.selectedOptions && item.selectedOptions.length > 0)
        ? ` (+${item.selectedOptions.map(o => o.name).join(', ')})`
        : '';
      const itemTotal = (item.price + (item.selectedOptions || []).reduce((s, o) => s + (o.price || 0), 0)) * item.qty;
      text += `${idx + 1}. *${item.name}* x${item.qty}${opts} — ₹${itemTotal}\n`;
    });
  }

  text += `━━━━━━━━━━━━━━━━━━━━━\n`;
  text += `• Subtotal: ₹${Number(totals.subtotal).toFixed(2)}\n`;
  if (totals.discount > 0) {
    text += `• Discount: -₹${Number(totals.discount).toFixed(2)}\n`;
  }
  if (totals.tax > 0) {
    text += `• ${totals.taxLabel || 'GST'} (${totals.taxPercentage !== undefined ? totals.taxPercentage : 5}%): ₹${Number(totals.tax).toFixed(2)}\n`;
  }
  if (totals.packagingFee > 0) {
    text += `• Packaging: ₹${Number(totals.packagingFee).toFixed(2)}\n`;
  }
  text += `━━━━━━━━━━━━━━━━━━━━━\n`;
  text += `💰 *TOTAL AMOUNT: ₹${Number(totals.total).toFixed(2)}*\n`;
  text += `━━━━━━━━━━━━━━━━━━━━━\n`;
  text += `✨ Fresh Food. Effortless Indulgence.\n`;
  text += `🌐 View Online: ${window.location.origin + window.location.pathname}#bill`;

  return text;
}

function shareBillViaWhatsApp(orderId = null) {
  let orderData = null;
  if (orderId) {
    orderData = AppState.userOrders.find(o => o.id === orderId) || AppState.orders.find(o => o.id === orderId);
  } else if (AppState.lastPaidOrder) {
    orderData = AppState.lastPaidOrder;
  } else if (AppState.userOrders.length > 0) {
    orderData = AppState.userOrders[0];
  }

  if (!orderData) {
    showToast('Bill sharing is available after completing payment', 'lock', 'warning');
    return;
  }

  const message = formatReceiptSummaryText(orderData);
  const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
  window.open(whatsappUrl, '_blank');
  showToast('Opening WhatsApp with your official receipt...', 'chat', 'success');
}

function shareBillViaEmail(orderId = null) {
  let orderData = null;
  if (orderId) {
    orderData = AppState.userOrders.find(o => o.id === orderId) || AppState.orders.find(o => o.id === orderId);
  } else if (AppState.lastPaidOrder) {
    orderData = AppState.lastPaidOrder;
  } else if (AppState.userOrders.length > 0) {
    orderData = AppState.userOrders[0];
  }

  if (!orderData) {
    showToast('Bill sharing is available after completing payment', 'lock', 'warning');
    return;
  }

  const totals = { total: orderData.total };
  const token = orderData.token ? `#${orderData.token}` : (orderData.id || 'Paid Bill');
  const subject = `Aromas Receipt - Order ${token} (Total: ₹${totals.total})`;
  const body = formatReceiptSummaryText(orderData);
  
  window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  showToast('Opening email client with your official receipt...', 'mail', 'info');
}

function shareBillReceipt(orderId = null) {
  let orderData = null;
  if (orderId) {
    orderData = AppState.userOrders.find(o => o.id === orderId) || AppState.orders.find(o => o.id === orderId);
  } else if (AppState.lastPaidOrder) {
    orderData = AppState.lastPaidOrder;
  } else if (AppState.userOrders.length > 0) {
    orderData = AppState.userOrders[0];
  }

  if (!orderData) {
    showToast('Bill sharing is available after completing payment', 'lock', 'warning');
    return;
  }

  const summary = formatReceiptSummaryText(orderData);
  const token = orderData.token ? `#${orderData.token}` : orderData.id;

  if (navigator.share) {
    navigator.share({
      title: `Aromas Bill Receipt ${token}`,
      text: summary,
      url: window.location.href
    }).then(() => {
      showToast('Bill receipt shared successfully!', 'share', 'success');
    }).catch((err) => {
      if (err.name !== 'AbortError') {
        copyReceiptToClipboard(summary);
      }
    });
  } else {
    copyReceiptToClipboard(summary);
  }
}

function copyReceiptToClipboard(text) {
  if (!text) {
    text = formatReceiptSummaryText();
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      showToast('Bill receipt text copied to clipboard!', 'content_copy', 'success');
    }).catch(() => {
      fallbackCopyText(text);
    });
  } else {
    fallbackCopyText(text);
  }
}

function fallbackCopyText(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand('copy');
    showToast('Bill receipt text copied to clipboard!', 'content_copy', 'success');
  } catch (err) {
    showToast('Unable to copy bill text', 'error', 'error');
  }
  document.body.removeChild(textarea);
}

function exportBillAsImage(targetElementId = 'bill-receipt-container', filename = 'Aromas_Receipt.png') {
  const container = document.getElementById(targetElementId);
  if (!container) {
    showToast('Could not find receipt to export', 'error', 'error');
    return;
  }

  const receiptPaper = container.querySelector('.receipt-paper') || container;
  showToast('Generating high-res PNG receipt slip...', 'image', 'info');

  if (window.html2canvas) {
    window.html2canvas(receiptPaper, {
      scale: 2.5, // 2.5x resolution for ultra-crisp output
      useCORS: true,
      backgroundColor: '#fcfaf8',
      logging: false
    }).then(canvas => {
      const imgData = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = filename;
      link.href = imgData;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast('Bill receipt image downloaded (PNG)!', 'download_done', 'success');
    }).catch(err => {
      console.error('Receipt image export error:', err);
      showToast('Opening print preview slip...', 'print', 'info');
      window.print();
    });
  } else {
    window.print();
  }
}

function preparePrintReceipt(orderId = null) {
  let printSec = document.getElementById('print-receipt-section');
  if (!printSec) {
    printSec = document.createElement('div');
    printSec.id = 'print-receipt-section';
    document.body.appendChild(printSec);
  }

  // Clear any existing contents
  printSec.innerHTML = '';

  // 1. If an explicit orderId was provided:
  if (orderId) {
    const order = AppState.userOrders.find(o => o.id === orderId) || AppState.orders.find(o => o.id === orderId);
    if (order) {
      printSec.innerHTML = generatePrintReceiptHtml(order);
      return;
    }
  }

  // 2. If past receipt modal is open and visible:
  const pastModal = document.getElementById('past-receipt-modal');
  if (pastModal && !pastModal.classList.contains('hidden')) {
    const pastContent = document.getElementById('past-receipt-content');
    const paper = pastContent ? pastContent.querySelector('.receipt-paper') : null;
    if (paper) {
      const clone = paper.cloneNode(true);
      clone.querySelectorAll('.no-print').forEach(el => el.remove());
      printSec.appendChild(clone);
      return;
    }
  }

  // 3. If on live bill view and cart has items:
  const billContainer = document.getElementById('bill-receipt-container');
  const billPaper = billContainer ? billContainer.querySelector('.receipt-paper') : null;
  if (billPaper && AppState.cart.length > 0) {
    const clone = billPaper.cloneNode(true);
    clone.querySelectorAll('.no-print').forEach(el => el.remove());
    printSec.appendChild(clone);
    return;
  }

  // 4. If an active order or recent order exists:
  const activeOrder = AppState.orders[AppState.orders.length - 1] || AppState.userOrders[0];
  if (activeOrder) {
    printSec.innerHTML = generatePrintReceiptHtml(activeOrder);
    return;
  }

  // 5. Fallback live cart:
  printSec.innerHTML = generatePrintReceiptHtml(null);
}

function generatePrintReceiptHtml(order = null) {
  const isCart = !order;
  const totals = isCart ? calculateOrderTotals() : {
    subtotal: order.subtotal !== undefined ? order.subtotal : (order.total || 0),
    discount: order.discount || 0,
    tax: order.taxAmount !== undefined ? order.taxAmount : (order.tax || 0),
    taxPercentage: order.taxPercentage !== undefined ? order.taxPercentage : 5,
    taxLabel: order.taxLabel || 'GST',
    packagingFee: order.packagingFee !== undefined ? order.packagingFee : 0,
    total: order.total
  };
  const items = isCart ? AppState.cart : (order.items || []);
  const location = isCart ? AppState.location : (order.location || AppState.location);
  const token = isCart ? (AppState.activeToken ? `#${AppState.activeToken}` : 'Live Bill') : (order.token ? `#${order.token}` : (order.id || 'Order'));
  const dateStr = isCart ? new Date().toLocaleDateString('en-GB') : (order.dateFull || order.date || new Date().toLocaleDateString('en-GB'));
  const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

  const itemsHtml = items.length === 0 
    ? '<div style="text-align:center; padding:10px; font-size:11px;">(No items in bill)</div>'
    : items.map(i => {
        const opts = (i.selectedOptions && i.selectedOptions.length > 0)
          ? `<div style="font-size:10px; color:#555;">+ ${i.selectedOptions.map(o => o.name).join(', ')}</div>`
          : '';
        const itemTotal = (i.price + ((i.selectedOptions || []).reduce((s, o) => s + (o.price || 0), 0))) * i.qty;
        return `
          <div style="display:flex; justify-content:space-between; margin-bottom:4px; font-size:12px; font-family:monospace;">
            <div style="flex:1; padding-right:8px;">
              <span style="font-weight:600;">${i.name}</span>
              ${opts}
            </div>
            <div style="width:28px; text-align:center;">x${i.qty}</div>
            <div style="width:55px; text-align:right; font-weight:bold;">₹${itemTotal}</div>
          </div>
        `;
      }).join('');

  return `
    <div class="receipt-paper" style="width:100%; max-width:80mm; margin:0 auto; padding:12px; font-family: monospace; color:#000; background:#fff; border:1px dashed #333;">
      <div style="text-align:center; margin-bottom:10px;">
        <h1 style="font-size:22px; margin:0; font-weight:900; letter-spacing:2px; text-transform:uppercase;">Aromas</h1>
        <p style="font-size:10px; margin:2px 0 0 0; text-transform:uppercase; color:#444;">Contemporary Food & Beverage</p>
      </div>

      <div style="font-size:11px; margin-bottom:8px; padding:6px; border:1px solid #ddd; background:#fbfbfb; text-align:center; border-radius:6px;">
        <div><strong>Location:</strong> ${location}</div>
        <div><strong>Token / Ref:</strong> ${token}</div>
        <div><strong>Date:</strong> ${dateStr} ${timeStr}</div>
        ${AppState.currentUser ? `<div><strong>Phone:</strong> ${AppState.currentUser.phoneNumber}</div>` : ''}
      </div>

      <div style="border-top:1px dashed #888; margin:6px 0;"></div>

      <div style="display:flex; justify-content:space-between; font-weight:bold; font-size:11px; text-transform:uppercase; margin-bottom:6px; border-bottom:1px solid #ddd; padding-bottom:3px;">
        <span style="flex:1;">Item</span>
        <span style="width:28px; text-align:center;">Qty</span>
        <span style="width:55px; text-align:right;">Amt</span>
      </div>

      <div style="margin-bottom:8px;">
        ${itemsHtml}
      </div>

      <div style="border-top:1px dashed #888; margin:6px 0;"></div>

      <div style="font-size:11px; display:flex; flex-direction:column; gap:3px;">
        <div style="display:flex; justify-content:space-between;">
          <span>Subtotal</span>
          <span>₹${Number(totals.subtotal).toFixed(2)}</span>
        </div>
        ${totals.discount > 0 ? `
          <div style="display:flex; justify-content:space-between; font-weight:600;">
            <span>Discount</span>
            <span>-₹${Number(totals.discount).toFixed(2)}</span>
          </div>
        ` : ''}
        ${totals.tax > 0 ? `
          <div style="display:flex; justify-content:space-between;">
            <span>${totals.taxLabel || 'GST'} (${totals.taxPercentage !== undefined ? totals.taxPercentage : 5}%)</span>
            <span>₹${Number(totals.tax).toFixed(2)}</span>
          </div>
        ` : ''}
        ${totals.packagingFee > 0 ? `
          <div style="display:flex; justify-content:space-between;">
            <span>Eco Packaging</span>
            <span>₹${Number(totals.packagingFee).toFixed(2)}</span>
          </div>
        ` : ''}
        <div style="display:flex; justify-content:space-between; font-size:16px; font-weight:bold; margin-top:5px; padding-top:5px; border-top:2px solid #000;">
          <span>TOTAL</span>
          <span>₹${Number(totals.total).toFixed(2)}</span>
        </div>
      </div>

      <div style="text-align:center; font-size:10px; color:#555; margin-top:10px;">
        <p style="margin:0;">Thank you for dining with Aromas.</p>
        <p style="margin:2px 0 0 0; font-weight:bold;">Fresh food. Effortless indulgence.</p>
      </div>
    </div>
  `;
}

function printReceiptSlip(orderId = null) {
  preparePrintReceipt(orderId);
  window.print();
}

function downloadOrPrintReceipt() {
  printReceiptSlip();
}

// Global print lifecycle hooks
window.addEventListener('beforeprint', () => {
  preparePrintReceipt();
});

window.addEventListener('afterprint', () => {
  const printSec = document.getElementById('print-receipt-section');
  if (printSec) {
    printSec.innerHTML = '';
  }
});

/**
 * ==========================================================================
 * 5. QUICK CART SLIDE-OVER DRAWER
 * ==========================================================================
 */
function toggleCartDrawer() {
  const drawer = document.getElementById('cart-drawer');
  if (!drawer) return;

  if (drawer.classList.contains('hidden')) {
    drawer.classList.remove('hidden');
    renderCartDrawerContent();
  } else {
    drawer.classList.add('hidden');
  }
}

function closeCartDrawer() {
  const drawer = document.getElementById('cart-drawer');
  if (drawer) {
    drawer.classList.add('hidden');
  }
}

function renderCartDrawerContent() {
  const itemsContainer = document.getElementById('drawer-items-list');
  const totalsContainer = document.getElementById('drawer-totals-box');
  if (!itemsContainer || !totalsContainer) return;

  if (AppState.cart.length === 0) {
    itemsContainer.innerHTML = `
      <div class="py-16 text-center text-on-surface-variant flex flex-col items-center">
        <span class="material-symbols-outlined text-5xl text-outline-variant mb-2">shopping_bag</span>
        <p class="font-medium text-sm">Your cart is empty</p>
      </div>
    `;
    totalsContainer.classList.add('hidden');
    return;
  }

  totalsContainer.classList.remove('hidden');
  const totals = calculateOrderTotals();

  itemsContainer.innerHTML = AppState.cart.map(item => `
    <div class="flex items-center gap-3 p-3 bg-surface-container rounded-2xl">
      <img src="${item.image}" alt="${item.name}" class="w-14 h-14 rounded-xl object-cover" />
      <div class="flex-1 min-w-0">
        <h4 class="text-sm font-headline font-bold truncate text-on-surface">${item.name}</h4>
        <p class="text-xs font-receipt text-primary font-bold">₹${item.price}</p>
      </div>
      <div class="flex items-center gap-1.5 bg-surface-container-high rounded-full px-2 py-1">
        <button onclick="updateItemQuantity('${item.id}', -1)" class="w-5 h-5 flex items-center justify-center font-bold text-xs hover:text-primary">-</button>
        <span class="font-receipt text-xs font-bold px-1">${item.qty}</span>
        <button onclick="updateItemQuantity('${item.id}', 1)" class="w-5 h-5 flex items-center justify-center font-bold text-xs hover:text-primary">+</button>
      </div>
    </div>
  `).join('');

  document.getElementById('drawer-subtotal').textContent = `₹${totals.subtotal}`;
  document.getElementById('drawer-total').textContent = `₹${totals.total}`;
}

/**
 * ==========================================================================
 * 6. CUSTOMIZATION MODAL
 * ==========================================================================
function openCustomizeModal(itemId) {
  const item = window.AromasMenuService ? window.AromasMenuService.getItemById(itemId) : MENU_DATA.find(m => m.id === itemId);
  if (!item) return;

  const stock = window.AromasMenuService ? window.AromasMenuService.getItemStock(itemId) : 20;
  if (stock <= 0) {
    showToast(`Sorry, ${item.name} is currently sold out in the kitchen!`, 'block', 'warning');
    return;
  }

  AppState.activeCustomizingItem = item;
  const modal = document.getElementById('customize-modal');
  const modalContent = document.getElementById('customize-modal-content');
  if (!modal || !modalContent) return;

  const options = item.options || [
    { name: "Extra Spices / Herbs", price: 15 },
    { name: "Double Dip Sauce", price: 20 }
  ];

  modalContent.innerHTML = `
    <div class="relative">
      <img src="${item.image}" alt="${item.name}" class="w-full h-44 object-cover rounded-2xl mb-4" />
      <button onclick="closeCustomizeModal()" class="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center">
        <span class="material-symbols-outlined text-sm">close</span>
      </button>
    </div>
    <h3 class="font-headline text-xl text-on-surface mb-1">${item.name}</h3>
    <p class="text-xs text-on-surface-variant mb-4">${item.description}</p>
    
    <h4 class="font-mono text-xs font-bold uppercase tracking-wider text-on-surface mb-2">Available Add-ons</h4>
    <div class="flex flex-col gap-2 mb-6" id="customize-options-list">
      ${options.map((opt) => `
        <label class="flex items-center justify-between p-3 rounded-xl bg-surface-container hover:bg-surface-container-high cursor-pointer transition-colors">
          <div class="flex items-center gap-3">
            <input type="checkbox" data-name="${opt.name}" data-price="${opt.price}" class="w-4 h-4 accent-primary option-checkbox" />
            <span class="text-sm font-medium text-on-surface">${opt.name}</span>
          </div>
          <span class="font-receipt text-xs font-bold text-primary">+₹${opt.price}</span>
        </label>
      `).join('')}
    </div>

    <button onclick="submitCustomizedItem('${item.id}')" class="w-full py-3.5 bg-primary text-on-primary font-button text-sm rounded-full shadow-md hover:bg-primary-container transition-all">
      Add to Cart
    </button>
  `;

  modal.classList.remove('hidden');
}

function closeCustomizeModal() {
  const modal = document.getElementById('customize-modal');
  if (modal) modal.classList.add('hidden');
  AppState.activeCustomizingItem = null;
}

function submitCustomizedItem(itemId) {
  const checkboxes = document.querySelectorAll('.option-checkbox:checked');
  const selectedOptions = Array.from(checkboxes).map(cb => ({
    name: cb.getAttribute('data-name'),
    price: parseInt(cb.getAttribute('data-price'), 10)
  }));

  addItemToCart(itemId, selectedOptions);
  closeCustomizeModal();
}

/**
 * ==========================================================================
 * 7. INTERACTIVE PAYMENT MODAL (CARD DETAILS & PAY AT COUNTER)
 * ==========================================================================
 */
function openPaymentModal() {
  ensureUserSession();

  const totals = calculateOrderTotals();
  if (totals.total <= 0 || AppState.cart.length === 0) {
    showToast('Your cart is empty. Please add items before proceeding.', 'shopping_bag', 'warning');
    return;
  }

  const modal = document.getElementById('payment-modal');
  if (!modal) return;

  renderPaymentModalBody();
  modal.classList.remove('hidden');
}

function selectPaymentMethod(method) {
  AppState.selectedPaymentMethod = method;
  renderPaymentModalBody();
}

function renderPaymentModalBody() {
  const modalContent = document.getElementById('payment-modal-content');
  if (!modalContent) return;

  const user = ensureUserSession();
  const totals = calculateOrderTotals();
  const method = AppState.selectedPaymentMethod;

  let dynamicPaymentForm = '';

  if (method === 'upi') {
    const defaultVpa = (user && user.phoneNumber) ? user.phoneNumber.replace(/\D/g, '').slice(-10) + '@upi' : '9876543210@okhdfcbank';
    dynamicPaymentForm = `
      <div class="p-4 rounded-2xl bg-surface-container border border-surface-container-high flex flex-col gap-3 animate-fadeIn">
        <label class="block text-xs font-mono font-bold text-on-surface uppercase tracking-wider">
          Enter UPI ID / VPA
        </label>
        <div class="flex gap-2">
          <input 
            type="text" 
            id="pay-upi-id" 
            placeholder="e.g. mobile@okhdfcbank" 
            value="${defaultVpa}" 
            class="flex-1 px-4 py-2.5 rounded-xl bg-surface-container-lowest border border-outline-variant font-mono text-xs text-on-surface focus:outline-none focus:border-primary"
          />
          <button type="button" onclick="showToast('UPI VPA Verified', 'verified', 'success')" class="px-3 py-2 bg-surface-container-highest rounded-xl text-xs font-mono font-bold text-primary hover:bg-primary hover:text-white transition-colors">
            Verify
          </button>
        </div>
        <div class="flex flex-wrap gap-2 text-[10px] font-mono text-on-surface-variant">
          <span class="px-2.5 py-1 rounded-lg bg-surface-container-highest flex items-center gap-1 font-bold text-on-surface">
            <span class="w-2 h-2 rounded-full bg-emerald-500"></span> Google Pay
          </span>
          <span class="px-2.5 py-1 rounded-lg bg-surface-container-highest flex items-center gap-1 font-bold text-on-surface">
            <span class="w-2 h-2 rounded-full bg-purple-500"></span> PhonePe
          </span>
          <span class="px-2.5 py-1 rounded-lg bg-surface-container-highest flex items-center gap-1 font-bold text-on-surface">
            <span class="w-2 h-2 rounded-full bg-blue-500"></span> Paytm
          </span>
        </div>
      </div>
    `;
  } else if (method === 'card') {
    dynamicPaymentForm = `
      <div class="p-4 rounded-2xl bg-surface-container border border-primary/30 flex flex-col gap-3.5 animate-fadeIn">
        <div class="flex justify-between items-center">
          <span class="text-xs font-mono font-bold uppercase tracking-wider text-on-surface">Campus / Debit / Credit Card</span>
          <button type="button" onclick="fillQuickTestCard()" class="text-[10px] font-mono font-bold text-primary bg-primary-fixed px-2.5 py-1 rounded-full hover:underline">
            Quick Fill Test Card
          </button>
        </div>

        <div>
          <label class="block text-[11px] font-mono font-bold text-on-surface-variant uppercase mb-1">16-Digit Card Number</label>
          <div class="relative">
            <input 
              type="text" 
              id="pay-card-num" 
              placeholder="4532 8821 9012 3456" 
              value="4532 8821 9012 3456"
              maxlength="19" 
              class="w-full px-4 py-2.5 rounded-xl bg-surface-container-lowest border border-outline-variant font-receipt text-xs text-on-surface focus:outline-none focus:border-primary tracking-wider"
              oninput="formatCardNumberInput(this)"
            />
            <span class="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-lg">credit_card</span>
          </div>
        </div>

        <div>
          <label class="block text-[11px] font-mono font-bold text-on-surface-variant uppercase mb-1">Cardholder / Student Name</label>
          <input 
            type="text" 
            id="pay-card-name" 
            placeholder="Student Name / Faculty ID" 
            value="${(user && user.displayName) || 'Campus Diner'}" 
            class="w-full px-4 py-2.5 rounded-xl bg-surface-container-lowest border border-outline-variant font-mono text-xs text-on-surface focus:outline-none focus:border-primary uppercase"
          />
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-[11px] font-mono font-bold text-on-surface-variant uppercase mb-1">Expiry (MM/YY)</label>
            <input 
              type="text" 
              id="pay-card-expiry" 
              placeholder="12/28" 
              value="12/28"
              maxlength="5" 
              class="w-full px-4 py-2.5 rounded-xl bg-surface-container-lowest border border-outline-variant font-receipt text-xs text-on-surface text-center focus:outline-none focus:border-primary"
            />
          </div>
          <div>
            <label class="block text-[11px] font-mono font-bold text-on-surface-variant uppercase mb-1">CVV / Security Code</label>
            <input 
              type="password" 
              id="pay-card-cvv" 
              placeholder="•••" 
              value="888"
              maxlength="4" 
              class="w-full px-4 py-2.5 rounded-xl bg-surface-container-lowest border border-outline-variant font-receipt text-xs text-on-surface text-center focus:outline-none focus:border-primary"
            />
          </div>
        </div>
      </div>
    `;
  } else if (method === 'counter') {
    dynamicPaymentForm = `
      <div class="p-4 rounded-2xl bg-primary-fixed/40 border border-primary/30 flex flex-col gap-2 animate-fadeIn">
        <div class="flex items-center gap-2 text-primary font-bold text-xs font-mono uppercase tracking-wider">
          <span class="material-symbols-outlined text-lg">storefront</span>
          <span>Pay at Counter & Instant Token</span>
        </div>
        <p class="text-xs text-on-surface-variant leading-relaxed">
          Your order ticket will be dispatched to the kitchen instantly and you will receive a <strong>Live Token Number</strong>.
        </p>
        <p class="text-xs text-on-surface-variant leading-relaxed">
          Present this token at the collection counter to pay (Cash/Card/UPI) when your food is ready.
        </p>
      </div>
    `;
  }

  const rawPhone = (user && user.phoneNumber) ? user.phoneNumber.replace(/\D/g, '').slice(-10) : '9876543210';

  modalContent.innerHTML = `
    <div class="flex justify-between items-start mb-4">
      <div>
        <h3 class="font-display text-xl font-bold text-on-surface">Select Payment Method</h3>
        <p class="font-receipt text-xs text-on-surface-variant">Amount Payable: <strong class="text-primary font-bold text-sm">₹${totals.total}</strong></p>
      </div>
      <button onclick="closePaymentModal()" class="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center hover:bg-surface-container-high transition-colors">
        <span class="material-symbols-outlined text-sm">close</span>
      </button>
    </div>

    <!-- Phone Number Field for Order Alerts & Live Tracking -->
    <div class="p-3 bg-surface-container rounded-2xl mb-4 border border-surface-container-high flex flex-col gap-1.5">
      <div class="flex items-center justify-between text-xs font-receipt">
        <span class="text-on-surface-variant font-mono font-bold uppercase text-[10px]">Mobile for Live Order Tracking:</span>
        <span class="text-[10px] text-primary font-bold">Token SMS / WhatsApp</span>
      </div>
      <div class="flex items-center gap-2">
        <span class="text-xs font-mono font-bold text-on-surface-variant bg-surface-container-high px-2.5 py-1.5 rounded-xl border border-outline-variant/30">🇮🇳 +91</span>
        <input 
          type="tel" 
          id="pay-order-phone" 
          value="${rawPhone}" 
          placeholder="98765 43210" 
          maxlength="10" 
          class="flex-1 px-3 py-1.5 rounded-xl bg-surface-container-lowest border border-outline-variant/60 font-receipt font-bold text-sm text-on-surface focus:outline-none focus:border-primary"
          oninput="if(AppState.currentUser) AppState.currentUser.phoneNumber = '+91 ' + this.value;"
        />
      </div>
    </div>

    <!-- Payment Method Cards -->
    <div class="flex flex-col gap-2.5 mb-4">
      <!-- UPI Option -->
      <div onclick="selectPaymentMethod('upi')" class="p-3.5 rounded-2xl ${method === 'upi' ? 'bg-surface-container-lowest border-2 border-primary shadow-sm' : 'bg-surface-container hover:bg-surface-container-high border border-transparent'} cursor-pointer flex items-center justify-between transition-all">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-full ${method === 'upi' ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface'} flex items-center justify-center">
            <span class="material-symbols-outlined text-xl">qr_code_scanner</span>
          </div>
          <div>
            <h4 class="font-bold text-xs sm:text-sm text-on-surface">UPI Instant Pay</h4>
            <p class="text-[11px] text-on-surface-variant">Google Pay, PhonePe, Paytm</p>
          </div>
        </div>
        <span class="material-symbols-outlined ${method === 'upi' ? 'text-primary' : 'text-outline-variant'}">${method === 'upi' ? 'radio_button_checked' : 'radio_button_unchecked'}</span>
      </div>

      <!-- Campus Card / Credit Card Option -->
      <div onclick="selectPaymentMethod('card')" class="p-3.5 rounded-2xl ${method === 'card' ? 'bg-surface-container-lowest border-2 border-primary shadow-sm' : 'bg-surface-container hover:bg-surface-container-high border border-transparent'} cursor-pointer flex items-center justify-between transition-all">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-full ${method === 'card' ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface'} flex items-center justify-center">
            <span class="material-symbols-outlined text-xl">credit_card</span>
          </div>
          <div>
            <h4 class="font-bold text-xs sm:text-sm text-on-surface">Campus Card / Credit Card</h4>
            <p class="text-[11px] text-on-surface-variant">Tap, campus swipe or credit/debit</p>
          </div>
        </div>
        <span class="material-symbols-outlined ${method === 'card' ? 'text-primary' : 'text-outline-variant'}">${method === 'card' ? 'radio_button_checked' : 'radio_button_unchecked'}</span>
      </div>

      <!-- Pay at Counter Option -->
      <div onclick="selectPaymentMethod('counter')" class="p-3.5 rounded-2xl ${method === 'counter' ? 'bg-surface-container-lowest border-2 border-primary shadow-sm' : 'bg-surface-container hover:bg-surface-container-high border border-transparent'} cursor-pointer flex items-center justify-between transition-all">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-full ${method === 'counter' ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface'} flex items-center justify-center">
            <span class="material-symbols-outlined text-xl">storefront</span>
          </div>
          <div>
            <h4 class="font-bold text-xs sm:text-sm text-on-surface">Pay at Counter</h4>
            <p class="text-[11px] text-on-surface-variant">Get token & pay cash/card on pickup</p>
          </div>
        </div>
        <span class="material-symbols-outlined ${method === 'counter' ? 'text-primary' : 'text-outline-variant'}">${method === 'counter' ? 'radio_button_checked' : 'radio_button_unchecked'}</span>
      </div>
    </div>

    <!-- Dynamic Form Body -->
    <div class="mb-5">
      ${dynamicPaymentForm}
    </div>

    <!-- Action Button -->
    <button id="pay-confirm-btn" onclick="processOrderPayment()" class="w-full py-4 bg-primary text-on-primary font-button text-sm rounded-full shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2 font-bold">
      <span class="material-symbols-outlined text-lg">${method === 'counter' ? 'confirmation_number' : 'check_circle'}</span>
      <span>${method === 'counter' ? `Generate Token & Order (₹${totals.total})` : `Confirm & Pay ₹${totals.total}`}</span>
    </button>
  `;
}

function formatCardNumberInput(input) {
  let val = input.value.replace(/\D/g, '').slice(0, 16);
  let parts = [];
  for (let i = 0; i < val.length; i += 4) {
    parts.push(val.substring(i, i + 4));
  }
  input.value = parts.join(' ');
}

function fillQuickTestCard() {
  const cardNum = document.getElementById('pay-card-num');
  const cardName = document.getElementById('pay-card-name');
  const cardExp = document.getElementById('pay-card-expiry');
  const cardCvv = document.getElementById('pay-card-cvv');

  if (cardNum) cardNum.value = '4532 8821 9012 3456';
  if (cardName) cardName.value = (AppState.currentUser && AppState.currentUser.displayName) || 'Campus Student ID #2026';
  if (cardExp) cardExp.value = '12/28';
  if (cardCvv) cardCvv.value = '888';

  showToast('Test card details filled', 'credit_card', 'info');
}

function closePaymentModal() {
  const modal = document.getElementById('payment-modal');
  if (modal) modal.classList.add('hidden');
}

async function processOrderPayment() {
  const user = AppState.currentUser || (window.AromasFirebaseService ? window.AromasFirebaseService.getCurrentUser() : null);
  if (!user || !user.uid) {
    showToast('Please sign in with your phone number to complete payment.', 'lock', 'warning');
    closePaymentModal();
    openAuthModal('Please sign in with your mobile number to complete payment.');
    return;
  }

  const totals = calculateOrderTotals();
  const method = AppState.selectedPaymentMethod;

  if (totals.total <= 0 || AppState.cart.length === 0) {
    showToast('Your cart is empty. Please add items to order.', 'shopping_bag', 'warning');
    closePaymentModal();
    return;
  }

  // Read mobile number from field if present
  const phoneInput = document.getElementById('pay-order-phone');
  let userPhone = user.phoneNumber || '+91 98765 43210';
  if (phoneInput && phoneInput.value && typeof phoneInput.value === 'string' && phoneInput.value.trim()) {
    userPhone = '+91 ' + phoneInput.value.trim().replace(/\D/g, '').slice(-10);
    user.phoneNumber = userPhone;
    localStorage.setItem('aromas_user_phone', userPhone);
  }

  const payBtn = document.getElementById('pay-confirm-btn');
  if (payBtn) {
    payBtn.disabled = true;
    payBtn.innerHTML = `<span class="material-symbols-outlined text-lg animate-spin">progress_activity</span><span>Processing Order & Stock...</span>`;
  }

  const tokenNum = Math.floor(10 + Math.random() * 90);
  const orderId = `ARM-${Math.floor(10000 + Math.random() * 90000)}`;
  const now = new Date();

  let paymentMethodLabel = 'UPI Instant Pay';
  let paymentStatusLabel = 'Paid Online';

  if (method === 'card') {
    paymentMethodLabel = 'Campus Card / Card';
    paymentStatusLabel = 'Paid Online';
  } else if (method === 'counter') {
    paymentMethodLabel = 'Pay at Counter';
    paymentStatusLabel = 'Pay at Counter (Pending)';
  }

  const newOrder = {
    id: orderId,
    token: tokenNum,
    date: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    dateFull: now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
    timestamp: Date.now(),
    location: AppState.location,
    userPhone: userPhone,
    userId: user.uid,
    customer: {
      userId: user.uid,
      phone: userPhone,
      name: user.displayName || `Diner (${userPhone.slice(-4)})`
    },
    paymentMethod: paymentMethodLabel,
    paymentStatus: paymentStatusLabel,
    items: [...AppState.cart],
    subtotal: totals.subtotal,
    discount: totals.discount,
    tax: totals.tax,
    packagingFee: totals.packagingFee,
    total: totals.total,
    status: 'Received'
  };

  AppState.knownOrderStatuses[newOrder.id] = 'Received';

  // Atomic Firestore Transaction for Order Creation & Stock Deduction
  if (window.AromasFirebaseService) {
    try {
      if (typeof window.AromasFirebaseService.createOrderWithAtomicStock === 'function') {
        await window.AromasFirebaseService.createOrderWithAtomicStock(newOrder, user);
      } else if (typeof window.AromasFirebaseService.createOrder === 'function') {
        await window.AromasFirebaseService.createOrder(newOrder, user);
      } else if (typeof window.AromasFirebaseService.saveOrderToFirebase === 'function') {
        await window.AromasFirebaseService.saveOrderToFirebase(newOrder, user);
      } else if (typeof window.AromasFirebaseService.addOrder === 'function') {
        await window.AromasFirebaseService.addOrder(newOrder, user);
      }
      await loadUserOrders();
    } catch (err) {
      showToast(err.message || 'Stock conflict during checkout. Please review cart.', 'block', 'warning');
      if (payBtn) {
        payBtn.disabled = false;
        payBtn.innerHTML = `<span>Retry Payment</span>`;
      }
      return;
    }
  }

  // Clear cart and record last paid order
  AppState.cart = [];
  AppState.appliedCoupon = null;
  AppState.lastPaidOrder = newOrder;
  localStorage.setItem('aromas_last_paid_order', JSON.stringify(newOrder));
  localStorage.removeItem(STORAGE_KEYS.COUPON);
  saveCartState();

  closePaymentModal();
  
  if (method === 'counter') {
    showToast(`Order Placed! Live Token #${tokenNum} Generated for Counter Pickup`, 'confirmation_number', 'success');
  } else {
    showToast(`Payment Confirmed! Token #${tokenNum} sent to Kitchen`, 'verified', 'success');
  }

  // Switch to live tracker and navigate
  AppState.activeOrdersTab = 'live';
  navigateTo('orders');
}

/**
 * ==========================================================================
 * 8. LIVE ORDER TRACKING & PREVIOUS ORDERS VIEW (VIBRANT GREEN PROGRESS)
 * ==========================================================================
 */

function setOrdersTab(tab) {
  AppState.activeOrdersTab = tab;
  
  const liveBtn = document.getElementById('tab-orders-live');
  const histBtn = document.getElementById('tab-orders-history');

  if (tab === 'live') {
    if (liveBtn) {
      liveBtn.className = 'px-6 py-2.5 rounded-full font-button text-xs sm:text-sm font-bold transition-all duration-300 flex items-center gap-2 bg-on-background text-on-primary shadow-sm';
    }
    if (histBtn) {
      histBtn.className = 'px-6 py-2.5 rounded-full font-button text-xs sm:text-sm font-bold transition-all duration-300 flex items-center gap-2 text-on-surface hover:text-primary';
    }
  } else {
    if (liveBtn) {
      liveBtn.className = 'px-6 py-2.5 rounded-full font-button text-xs sm:text-sm font-bold transition-all duration-300 flex items-center gap-2 text-on-surface hover:text-primary';
    }
    if (histBtn) {
      histBtn.className = 'px-6 py-2.5 rounded-full font-button text-xs sm:text-sm font-bold transition-all duration-300 flex items-center gap-2 bg-on-background text-on-primary shadow-sm';
    }
  }

  renderOrdersView();
}

function renderOrdersView() {
  const container = document.getElementById('orders-content-container');
  if (!container) return;

  if (AppState.activeOrdersTab === 'live') {
    renderLiveOrdersTab(container);
  } else {
    renderPreviousOrdersTab(container);
  }
}

function renderLiveOrdersTab(container) {
  if (AppState.orders.length === 0) {
    container.innerHTML = `
      <div class="py-16 text-center text-on-surface-variant flex flex-col items-center bg-surface-container/50 rounded-3xl border border-surface-container-high p-8">
        <div class="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant mb-4">
          <span class="material-symbols-outlined text-3xl">outdoor_grill</span>
        </div>
        <h3 class="font-headline text-xl text-on-surface mb-2">No Active Order in Kitchen</h3>
        <p class="font-body text-sm text-on-surface-variant max-w-md mb-6">
          Order your favourites from our curated menu to watch live kitchen preparation and get your pickup token.
        </p>
        <button onclick="navigateTo('menu')" class="px-8 py-3.5 bg-primary text-on-primary rounded-full font-button text-sm shadow-md hover:scale-105 transition-all">
          Explore Menu Catalog &rarr;
        </button>
      </div>
    `;
    return;
  }

  const latestOrder = AppState.orders[0];
  const status = latestOrder.status || 'Received';

  const isCooking = status === 'Cooking in Kitchen';
  const isReady = status === 'Ready for Pickup';
  const isCompleted = status === 'Completed';

  // Step 1: Placed & Received (always green)
  const step1Active = true;
  // Step 2: Cooking in Kitchen (green if cooking, ready, or completed)
  const step2Active = isCooking || isReady || isCompleted;
  // Step 3: Ready for Pickup (green if ready or completed)
  const step3Active = isReady || isCompleted;

  let activeStatusAlertBanner = '';

  if (isCooking) {
    activeStatusAlertBanner = `
      <div class="p-4 sm:p-5 bg-gradient-to-r from-emerald-50 via-emerald-100/70 to-emerald-50 border-2 border-emerald-500 rounded-3xl flex items-center justify-between gap-4 mb-6 shadow-md shadow-emerald-500/10 animate-fadeIn">
        <div class="flex items-center gap-3.5">
          <div class="w-12 h-12 rounded-2xl bg-veg text-white flex items-center justify-center shadow-md">
            <span class="material-symbols-outlined text-2xl animate-spin">soup_kitchen</span>
          </div>
          <div>
            <div class="flex items-center gap-2">
              <span class="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></span>
              <h4 class="font-display font-extrabold text-sm sm:text-base text-emerald-950">Food Being Cooked in Kitchen!</h4>
            </div>
            <p class="text-xs text-emerald-800 font-medium mt-0.5">The chef is preparing your meal hot and fresh. Tracker has turned <strong class="text-emerald-700 font-bold">Green</strong>.</p>
          </div>
        </div>
        <span class="hidden sm:inline-block px-3 py-1.5 rounded-full bg-veg text-white font-mono text-xs font-bold shadow-sm">
          👨‍🍳 Active on Stove
        </span>
      </div>
    `;
  } else if (isReady) {
    activeStatusAlertBanner = `
      <div class="p-5 bg-gradient-to-r from-emerald-600 to-green-600 text-white rounded-3xl flex items-center justify-between gap-4 mb-6 shadow-xl shadow-emerald-600/25 animate-bounce">
        <div class="flex items-center gap-3.5">
          <div class="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center shadow-inner">
            <span class="material-symbols-outlined text-3xl animate-pulse">notifications_active</span>
          </div>
          <div>
            <h4 class="font-display text-base sm:text-lg font-black tracking-wide">🎉 Your Order is Cooked & Ready for Pickup!</h4>
            <p class="text-xs sm:text-sm text-emerald-100 mt-0.5 font-medium">Please present <strong class="text-white underline font-bold">Token #${latestOrder.token}</strong> at the collection counter.</p>
          </div>
        </div>
        <button onclick="printReceiptSlip()" class="hidden sm:flex px-4 py-2.5 bg-white text-emerald-800 font-button text-xs font-bold rounded-2xl shadow-md hover:scale-105 transition-all items-center gap-1.5">
          <span class="material-symbols-outlined text-sm">print</span> Print
        </button>
      </div>
    `;
  }

  container.innerHTML = `
    <div class="flex flex-col gap-6">
      ${activeStatusAlertBanner}

      <!-- Active Token Card -->
      <div id="orders-tracker-content" class="bg-surface-container rounded-3xl p-6 sm:p-8 shadow-md border ${isCooking || isReady ? 'border-veg/50 ring-2 ring-veg/20' : 'border-primary/20'} relative overflow-hidden">
        <div class="absolute top-0 right-0 w-64 h-64 ${isCooking || isReady ? 'bg-veg/10' : 'bg-primary/10'} rounded-full blur-3xl -z-0"></div>
        
        <div class="relative z-10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <span class="font-mono text-xs ${isCooking || isReady ? 'text-veg' : 'text-primary'} font-bold uppercase tracking-wider">[ Live Kitchen Pickup Token ]</span>
            <div class="font-display text-5xl sm:text-6xl font-black ${isCooking || isReady ? 'text-veg' : 'text-primary'} mt-1">#${latestOrder.token}</div>
            <p class="font-receipt text-xs text-on-surface-variant mt-1">Order Ref: <strong class="text-on-surface">${latestOrder.id}</strong> • 📍 ${latestOrder.location}</p>
          </div>
          <div class="flex flex-col items-end gap-1.5">
            <div class="px-4 py-2 rounded-full ${isReady ? 'bg-veg text-white pulse-beacon-green' : isCooking ? 'bg-veg text-white pulse-beacon-green' : 'bg-primary-fixed text-on-primary-fixed'} font-mono text-xs font-bold flex items-center gap-2 shadow-sm">
              <span class="w-2.5 h-2.5 rounded-full bg-white"></span>
              ${status}
            </div>
            <span class="text-[11px] font-mono text-on-surface-variant">${latestOrder.paymentMethod} • ${latestOrder.paymentStatus}</span>
          </div>
        </div>

        <!-- Progress Timeline WITH GREEN COLORS -->
        <div class="relative flex justify-between items-center py-6 border-y border-surface-container-high">
          
          <!-- STEP 1: Received -->
          <div class="flex flex-col items-center gap-2 text-center z-10">
            <div class="w-11 h-11 rounded-full bg-veg text-white flex items-center justify-center font-bold text-sm shadow-md ring-4 ring-emerald-100">
              <span class="material-symbols-outlined text-lg">check</span>
            </div>
            <span class="text-xs font-bold text-emerald-800">Order Placed</span>
          </div>

          <!-- CONNECTING LINE 1 -> 2 (Turns vibrant green when cooking/ready) -->
          <div class="flex-1 h-1.5 ${step2Active ? 'bg-veg shadow-[0_0_10px_rgba(22,163,74,0.5)]' : 'bg-surface-container-highest'} mx-2 rounded-full transition-all duration-700"></div>

          <!-- STEP 2: Cooking in Kitchen (Turns green when active) -->
          <div class="flex flex-col items-center gap-2 text-center z-10">
            <div class="w-11 h-11 rounded-full ${isCooking ? 'pulse-beacon-green bg-veg text-white ring-4 ring-emerald-200 shadow-xl' : step2Active ? 'bg-veg text-white shadow-md' : 'bg-surface-container-highest text-on-surface-variant'} flex items-center justify-center font-bold text-sm transition-all duration-500">
              <span class="material-symbols-outlined text-lg ${isCooking ? 'animate-spin' : ''}">outdoor_grill</span>
            </div>
            <span class="text-xs font-bold ${step2Active ? 'text-emerald-700 font-extrabold' : 'text-on-surface-variant'} flex items-center gap-0.5">
              <span>👨‍🍳</span> <span>Cooking</span>
            </span>
          </div>

          <!-- CONNECTING LINE 2 -> 3 (Turns vibrant green when ready) -->
          <div class="flex-1 h-1.5 ${step3Active ? 'bg-veg shadow-[0_0_10px_rgba(22,163,74,0.5)]' : 'bg-surface-container-highest'} mx-2 rounded-full transition-all duration-700"></div>

          <!-- STEP 3: Ready for Pickup (Turns green when ready) -->
          <div class="flex flex-col items-center gap-2 text-center z-10">
            <div class="w-11 h-11 rounded-full ${isReady ? 'pulse-beacon-green bg-veg text-white ring-4 ring-emerald-200 shadow-xl' : step3Active ? 'bg-veg text-white shadow-md' : 'bg-surface-container-highest text-on-surface-variant'} flex items-center justify-center font-bold text-sm transition-all duration-500">
              <span class="material-symbols-outlined text-lg ${isReady ? 'animate-bounce' : ''}">notifications_active</span>
            </div>
            <span class="text-xs font-bold ${step3Active ? 'text-emerald-700 font-extrabold' : 'text-on-surface-variant'} flex items-center gap-0.5">
              <span>🔔</span> <span>Ready</span>
            </span>
          </div>
        </div>

        <!-- Items Ordered -->
        <div class="mt-6 flex flex-col gap-2 font-receipt text-xs">
          <h4 class="font-bold text-on-surface uppercase tracking-wide">Ordered Items:</h4>
          ${latestOrder.items.map(i => `
            <div class="flex justify-between items-center py-1 border-b border-surface-container-high/40">
              <div class="flex items-center gap-2">
                <img src="${i.image}" alt="${i.name}" class="w-8 h-8 rounded-lg object-cover" />
                <span class="font-medium text-on-surface">${i.name} <strong class="text-primary font-bold">x${i.qty}</strong></span>
              </div>
              <span class="font-bold">₹${i.price * i.qty}</span>
            </div>
          `).join('')}
          <div class="flex justify-between font-bold text-sm text-on-surface pt-3">
            <span>Total Payable / Paid</span>
            <span class="${isCooking || isReady ? 'text-veg' : 'text-primary'} text-base font-extrabold">₹${latestOrder.total}</span>
          </div>

          <!-- Share & Export Action Toolbar for Live Tracker Order -->
          <div class="no-print mt-4 pt-3 border-t border-surface-container-high">
            <span class="block text-[10px] font-mono font-bold text-on-surface-variant uppercase tracking-wider text-center mb-2">Share & Export Order Receipt</span>
            <div class="grid grid-cols-4 gap-2">
              <button onclick="shareBillViaWhatsApp('${latestOrder.id}')" class="flex flex-col items-center justify-center gap-1 p-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition-all hover:scale-105 active:scale-95" title="Share via WhatsApp">
                <span class="material-symbols-outlined text-base">chat</span>
                <span class="text-[9px] font-mono font-bold">WhatsApp</span>
              </button>
              <button onclick="shareBillViaEmail('${latestOrder.id}')" class="flex flex-col items-center justify-center gap-1 p-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition-all hover:scale-105 active:scale-95" title="Share via Email">
                <span class="material-symbols-outlined text-base">mail</span>
                <span class="text-[9px] font-mono font-bold">Email</span>
              </button>
              <button onclick="exportBillAsImage('orders-tracker-content', 'Aromas_Token_${latestOrder.token || latestOrder.id}.png')" class="flex flex-col items-center justify-center gap-1 p-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 transition-all hover:scale-105 active:scale-95" title="Save Token Slip as PNG">
                <span class="material-symbols-outlined text-base">image</span>
                <span class="text-[9px] font-mono font-bold">Save PNG</span>
              </button>
              <button onclick="printReceiptSlip()" class="flex flex-col items-center justify-center gap-1 p-2 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 transition-all hover:scale-105 active:scale-95" title="Print 80mm Receipt Slip">
                <span class="material-symbols-outlined text-base">print</span>
                <span class="text-[9px] font-mono font-bold">Print Slip</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="flex justify-center gap-4">
        <button onclick="navigateTo('menu')" class="px-8 py-3.5 bg-primary text-on-primary font-button text-sm rounded-full shadow-md hover:scale-105 transition-all">
          Order More Items &rarr;
        </button>
      </div>
    </div>
  `;
}

/**
 * Trigger Order Ready Notification & Audio Bell Chime
 */
function triggerOrderReadyNotification(orderId, token, location) {
  // 1. Play synthetic bell chime
  playOrderReadyChime();

  // 2. Open Celebratory Modal
  const modal = document.getElementById('order-ready-modal');
  const tokenEl = document.getElementById('order-ready-modal-token');
  const locEl = document.getElementById('order-ready-modal-loc');
  const msgEl = document.getElementById('order-ready-modal-msg');

  if (tokenEl) tokenEl.textContent = `#${token}`;
  if (locEl) locEl.textContent = `📍 ${location || 'Main Campus Counter'}`;
  if (msgEl) msgEl.textContent = `Your fresh food order (Ref: ${orderId}) is freshly prepared and ready for collection!`;

  if (modal) {
    modal.classList.remove('hidden');
  }

  // 3. Show high-priority Toast
  showToast(`🔔 ORDER READY! Token #${token} is cooked & ready for pickup at the counter!`, 'notifications_active', 'success');
}

function closeOrderReadyModal() {
  const modal = document.getElementById('order-ready-modal');
  if (modal) modal.classList.add('hidden');
}

function playOrderReadyChime() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;

    const ctx = new AudioContext();
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6 pleasant major chord chime
    
    notes.forEach((freq, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + (index * 0.1));

      gain.gain.setValueAtTime(0, ctx.currentTime + (index * 0.1));
      gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + (index * 0.1) + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (index * 0.1) + 0.6);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime + (index * 0.1));
      osc.stop(ctx.currentTime + (index * 0.1) + 0.65);
    });
  } catch (e) {
    console.warn("Audio chime playback error:", e);
  }
}

function renderPreviousOrdersTab(container) {
  if (!AppState.currentUser) {
    container.innerHTML = `
      <div class="bg-surface-container rounded-3xl p-8 sm:p-12 text-center border border-surface-container-high shadow-md max-w-xl mx-auto flex flex-col items-center">
        <div class="w-16 h-16 rounded-3xl bg-primary-fixed text-primary flex items-center justify-center mb-4 shadow-sm">
          <span class="material-symbols-outlined text-3xl">phone_iphone</span>
        </div>
        <span class="font-mono text-xs text-primary font-bold uppercase tracking-wider">[ Firebase Cloud Sync ]</span>
        <h3 class="font-display text-2xl font-black text-on-surface mt-1 mb-2">Access Your Previous Orders</h3>
        <p class="font-body text-sm text-on-surface-variant mb-6 leading-relaxed">
          Log in with your phone number to view all your previous dining orders, reorder your favourites in 1-click, and download historical receipts.
        </p>
        <button onclick="openAuthModal('Please log in with your phone number to access your previous orders.')" class="px-8 py-4 bg-primary text-on-primary font-button text-sm rounded-full shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all flex items-center gap-2">
          <span class="material-symbols-outlined text-lg">smartphone</span>
          <span>Login with Phone Number</span>
        </button>
      </div>
    `;
    return;
  }

  const orders = AppState.userOrders;

  if (orders.length === 0) {
    container.innerHTML = `
      <div class="bg-surface-container/50 rounded-3xl p-10 text-center border border-surface-container-high max-w-xl mx-auto flex flex-col items-center">
        <span class="material-symbols-outlined text-5xl text-outline-variant mb-3">receipt_long</span>
        <h3 class="font-headline text-xl text-on-surface mb-2">No Past Orders Found</h3>
        <p class="font-body text-xs text-on-surface-variant max-w-sm mb-6">
          You haven't placed any orders with phone number <strong class="text-primary font-bold">${AppState.currentUser.phoneNumber}</strong> yet.
        </p>
        <button onclick="navigateTo('menu')" class="px-8 py-3 bg-primary text-on-primary rounded-full font-button text-xs font-bold shadow-md hover:scale-105 transition-all">
          Browse Menu &rarr;
        </button>
      </div>
    `;
    return;
  }

  const ordersCardsHtml = orders.map((order) => {
    const itemsPreview = order.items.map(i => `
      <div class="flex items-center gap-2 py-1">
        <img src="${i.image}" alt="${i.name}" class="w-9 h-9 rounded-lg object-cover bg-surface-container flex-shrink-0" onerror="this.src='https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=100&q=80'" />
        <div class="flex-1 min-w-0">
          <p class="text-xs font-headline font-bold text-on-surface truncate">${i.name}</p>
          <p class="text-[11px] font-receipt text-on-surface-variant">Qty: ${i.qty} • ₹${i.price * i.qty}</p>
        </div>
      </div>
    `).join('');

    return `
      <div class="bg-surface-container-lowest rounded-3xl p-5 sm:p-6 border border-surface-container-high shadow-sm hover:shadow-lg transition-all flex flex-col gap-4">
        
        <div class="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-surface-container-high">
          <div>
            <div class="flex items-center gap-2">
              <span class="font-display text-lg font-extrabold text-on-surface">Token #${order.token || '0'}</span>
              <span class="px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant text-[10px] font-mono font-bold">${order.id}</span>
            </div>
            <p class="text-xs font-receipt text-on-surface-variant mt-0.5 flex items-center gap-1.5">
              <span class="material-symbols-outlined text-[15px] text-primary">location_on</span> ${order.location || 'Main Campus'} • 
              <span>${order.dateFull || order.date || 'Recent'}</span>
            </p>
          </div>

          <div class="flex items-center gap-2">
            <span class="px-3 py-1 rounded-full ${order.status === 'Completed' ? 'bg-veg/10 text-veg border border-veg/20' : order.status === 'Ready for Pickup' ? 'bg-veg text-white' : 'bg-primary-fixed text-on-primary-fixed'} text-xs font-mono font-bold">
              ${order.status || 'Received'}
            </span>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          ${itemsPreview}
        </div>

        <div class="pt-3 border-t border-surface-container-high flex flex-wrap items-center justify-between gap-3">
          <div>
            <span class="text-[11px] font-mono text-on-surface-variant uppercase">Total Paid / Due</span>
            <div class="font-display text-xl font-black text-primary">₹${order.total}</div>
          </div>

          <div class="flex items-center gap-2">
            <button onclick="viewPastOrderReceipt('${order.id}')" class="px-4 py-2 rounded-full border border-outline-variant hover:border-primary text-xs font-button font-bold text-on-surface hover:text-primary transition-colors flex items-center gap-1">
              <span class="material-symbols-outlined text-[16px]">receipt</span>
              <span>View Receipt</span>
            </button>

            <button onclick="reorderPastItems('${order.id}')" class="px-4 py-2 rounded-full bg-primary text-on-primary text-xs font-button font-bold shadow-sm hover:scale-105 hover:bg-primary-container transition-all flex items-center gap-1">
              <span class="material-symbols-outlined text-[16px]">replay</span>
              <span>Reorder All</span>
            </button>
          </div>
        </div>

      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="flex flex-col gap-6">
      <div class="flex flex-wrap items-center justify-between gap-3 px-2">
        <div class="flex items-center gap-2 text-xs font-mono text-on-surface-variant">
          <span class="w-2 h-2 rounded-full bg-veg"></span>
          <span>Synced with Firebase for <strong class="text-on-surface">${AppState.currentUser.phoneNumber}</strong></span>
        </div>
        <button onclick="loadUserOrders(); showToast('Refreshed orders from Firebase', 'cloud_done', 'info');" class="text-xs font-mono text-primary font-bold hover:underline flex items-center gap-1">
          <span class="material-symbols-outlined text-sm">refresh</span> Refresh Cloud
        </button>
      </div>

      <div class="flex flex-col gap-4">
        ${ordersCardsHtml}
      </div>
    </div>
  `;
}

/**
 * Reorder Items & Past Receipt Modal
 */
function reorderPastItems(orderId) {
  if (!AppState.currentUser) {
    showToast('Please log in with your phone number to reorder items', 'smartphone', 'warning');
    openAuthModal('Please sign in with your phone number to reorder.');
    return;
  }

  const order = AppState.userOrders.find(o => o.id === orderId) || AppState.orders.find(o => o.id === orderId);
  if (!order || !order.items) return;

  order.items.forEach(item => {
    const existing = AppState.cart.find(c => c.id === item.id);
    if (existing) {
      existing.qty += item.qty;
    } else {
      AppState.cart.push({ ...item });
    }
  });

  saveCartState();
  renderMenuItems();
  showToast(`Added ${order.items.length} items from Order #${order.token || order.id} to Cart!`, 'shopping_bag', 'success');
  toggleCartDrawer();
}

function viewPastOrderReceipt(orderId) {
  const order = AppState.userOrders.find(o => o.id === orderId) || AppState.orders.find(o => o.id === orderId);
  if (!order) return;

  const modal = document.getElementById('past-receipt-modal');
  const content = document.getElementById('past-receipt-content');
  if (!modal || !content) return;

  const itemsHtml = order.items.map(item => `
    <div class="flex justify-between font-receipt text-[13px] text-on-surface py-1">
      <span class="flex-1 font-medium">${item.name}</span>
      <span class="w-12 text-center text-on-surface-variant font-bold">${item.qty}</span>
      <span class="w-16 text-right font-semibold">₹${item.price * item.qty}</span>
    </div>
  `).join('');

  content.innerHTML = `
    <div class="receipt-paper relative w-full max-w-[400px] p-6 sm:p-8 text-on-surface mx-auto">
      <div class="flex flex-col items-center mb-4 text-center">
        <h1 class="font-display text-2xl text-on-surface tracking-widest uppercase font-extrabold">Aromas</h1>
        <p class="font-receipt text-[10px] text-on-surface-variant uppercase tracking-widest">Historical Order Record</p>
      </div>

      <div class="font-receipt text-[11px] leading-relaxed text-on-surface mb-4 flex flex-col items-center opacity-85 bg-surface-container/50 py-2 px-3 rounded-xl border border-surface-container-high">
        <span class="font-semibold text-primary">Location: ${order.location}</span>
        <span>Order Token: <strong>#${order.token || order.id}</strong></span>
        <span>Date: ${order.dateFull || order.date || 'Recent'}</span>
        <span>Phone: ${order.userPhone || AppState.currentUser?.phoneNumber || 'N/A'}</span>
        <span>Payment: ${order.paymentMethod || 'Paid'} (${order.paymentStatus || 'Completed'})</span>
      </div>

      <div class="w-full border-t border-dashed border-outline/40 mb-3"></div>

      <div class="flex justify-between font-receipt text-[11px] font-bold text-on-surface mb-2 uppercase opacity-90 border-b border-surface-container-high pb-1">
        <span class="flex-1">Item</span>
        <span class="w-12 text-center">Qty</span>
        <span class="w-16 text-right">Amount</span>
      </div>

      <div class="flex flex-col gap-1.5 mb-4">
        ${itemsHtml}
      </div>

      <div class="w-full border-t border-dashed border-outline/40 mb-3"></div>

      <div class="flex flex-col gap-1.5 font-receipt text-[12px] text-on-surface mb-4">
        <div class="flex justify-between opacity-80">
          <span>Subtotal</span>
          <span>₹${order.subtotal || order.total}</span>
        </div>
        ${order.discount ? `
          <div class="flex justify-between text-veg font-semibold">
            <span>Discount</span>
            <span>-₹${order.discount}</span>
          </div>
        ` : ''}
        <div class="flex justify-between opacity-80">
          <span>GST (5%)</span>
          <span>₹${order.tax || 0}</span>
        </div>
        <div class="flex justify-between items-center font-display text-[22px] text-primary mt-2 pt-2 border-t-2 border-primary/20 font-black">
          <span>TOTAL</span>
          <span>₹${order.total}</span>
        </div>
      </div>

      <div class="text-center font-receipt text-[10px] text-on-surface-variant opacity-75 mt-4">
        <p>Aromas Dining Experience • Firebase Verified</p>
      </div>

      <!-- Share & Export Action Toolbar for Past Receipt -->
      <div class="no-print mt-4 pt-3 border-t border-surface-container-high">
        <span class="block text-[10px] font-mono font-bold text-on-surface-variant uppercase tracking-wider text-center mb-2">Share & Export Historical Bill</span>
        <div class="grid grid-cols-4 gap-1.5">
          <!-- WhatsApp Button -->
          <button onclick="shareBillViaWhatsApp('${order.id}')" class="flex flex-col items-center justify-center gap-1 p-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition-all hover:scale-105 active:scale-95" title="Share via WhatsApp">
            <span class="material-symbols-outlined text-base">chat</span>
            <span class="text-[9px] font-mono font-bold">WhatsApp</span>
          </button>

          <!-- Email Button -->
          <button onclick="shareBillViaEmail('${order.id}')" class="flex flex-col items-center justify-center gap-1 p-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition-all hover:scale-105 active:scale-95" title="Share via Email">
            <span class="material-symbols-outlined text-base">mail</span>
            <span class="text-[9px] font-mono font-bold">Email</span>
          </button>

          <!-- PNG Image Export -->
          <button onclick="exportBillAsImage('past-receipt-content', 'Aromas_Receipt_${order.id}.png')" class="flex flex-col items-center justify-center gap-1 p-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 transition-all hover:scale-105 active:scale-95" title="Save Receipt as PNG">
            <span class="material-symbols-outlined text-base">image</span>
            <span class="text-[9px] font-mono font-bold">Save PNG</span>
          </button>

          <!-- 80mm Print Slip -->
          <button onclick="printReceiptSlip()" class="flex flex-col items-center justify-center gap-1 p-2 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 transition-all hover:scale-105 active:scale-95" title="Print 80mm Receipt Slip">
            <span class="material-symbols-outlined text-base">print</span>
            <span class="text-[9px] font-mono font-bold">Print Slip</span>
          </button>
        </div>
      </div>

      <div class="torn-edge"></div>
    </div>
  `;

  modal.classList.remove('hidden');
}

function closePastReceiptModal() {
  const modal = document.getElementById('past-receipt-modal');
  if (modal) modal.classList.add('hidden');
}



/**
 * ==========================================================================
 * 10. TOAST NOTIFICATIONS
 * ==========================================================================
 */
function showToast(message, icon = 'info', type = 'info') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  let toastBorder = '';
  if (type === 'success' || icon.includes('notifications') || icon.includes('verified')) {
    toastBorder = 'border-2 border-veg';
  }

  const toast = document.createElement('div');
  toast.className = `toast-item ${toastBorder}`;
  toast.innerHTML = `
    <span class="material-symbols-outlined ${type === 'success' ? 'text-veg' : 'text-primary-container'} text-xl">${icon}</span>
    <span>${message}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 4000);
}
