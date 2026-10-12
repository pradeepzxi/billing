/**
 * Aromas - Centralized Real-time Firebase & Firestore Service Layer
 * Single authoritative source of truth for Menu, Stock, Orders, and Sales
 * Provides real-time onSnapshot listeners, atomic Firestore transactions, and cross-tab sync
 */

const AUTH_STORAGE_KEY = 'aromas_auth_user';
const CACHE_KEYS = {
  MENU: 'aromas_cache_menu',
  STOCK: 'aromas_cache_stock',
  ORDERS: 'aromas_cache_orders',
  SALES: 'aromas_cache_sales',
  BILLING_SETTINGS: 'aromas_cache_billing_settings',
  PHONE: 'aromas_user_phone'
};

class CentralFirebaseService {
  constructor() {
    this.currentMenu = [];
    this.currentStock = {};
    this.currentSales = {};
    this.currentOrders = [];
    this.currentBillingSettings = {
      taxEnabled: true,
      taxPercentage: 5.0,
      taxLabel: 'GST',
      updatedAt: new Date().toISOString(),
      updatedBy: 'kitchen'
    };
    this.currentUser = null;

    this.menuListeners = [];
    this.stockListeners = [];
    this.salesListeners = [];
    this.orderListeners = [];
    this.userOrderListeners = [];
    this.kitchenOrderListeners = [];
    this.billingListeners = [];
    this.connectionListeners = [];
    this.authListeners = [];

    this.isLive = false;
    this.isConnected = true;
    this.demoOtpCode = '123456';
    this.currentConfirmationResult = null;
    this.broadcastChannel = null;
    this.unsubscribers = [];

    // Initialize local cache into memory
    this.loadLocalCache();

    // BroadcastChannel for instant cross-tab sync in multi-window desktop tests
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.broadcastChannel = new BroadcastChannel('aromas_realtime_data_bus');
        this.broadcastChannel.onmessage = (event) => this.handleBroadcastMessage(event.data);
      } catch (e) {}
    }

    // Initialize on start
    this.init();
  }

  loadLocalCache() {
    try {
      const cachedMenu = localStorage.getItem(CACHE_KEYS.MENU);
      if (cachedMenu) {
        const parsed = JSON.parse(cachedMenu);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.currentMenu = parsed;
        }
      }

      const baseMenu = (typeof window !== 'undefined' && window.MENU_DATA) ? window.MENU_DATA : (typeof MENU_DATA !== 'undefined' ? MENU_DATA : []);
      if ((!this.currentMenu || this.currentMenu.length === 0) && Array.isArray(baseMenu) && baseMenu.length > 0) {
        this.currentMenu = [...baseMenu];
      }

      const cachedStock = localStorage.getItem(CACHE_KEYS.STOCK);
      if (cachedStock) this.currentStock = JSON.parse(cachedStock);

      const cachedSales = localStorage.getItem(CACHE_KEYS.SALES);
      if (cachedSales) this.currentSales = JSON.parse(cachedSales);

      const cachedOrders = localStorage.getItem(CACHE_KEYS.ORDERS);
      if (cachedOrders) this.currentOrders = JSON.parse(cachedOrders);

      const cachedBilling = localStorage.getItem(CACHE_KEYS.BILLING_SETTINGS);
      if (cachedBilling) {
        try {
          const parsedBilling = JSON.parse(cachedBilling);
          if (parsedBilling && typeof parsedBilling.taxPercentage === 'number') {
            this.currentBillingSettings = {
              taxEnabled: parsedBilling.taxEnabled !== false,
              taxPercentage: Number(parsedBilling.taxPercentage),
              taxLabel: parsedBilling.taxLabel || 'GST',
              updatedAt: parsedBilling.updatedAt || new Date().toISOString(),
              updatedBy: parsedBilling.updatedBy || 'kitchen'
            };
          }
        } catch (e) {}
      }
    } catch (e) {
      console.warn("Error reading local cache:", e);
    }
  }

  saveLocalCache() {
    try {
      localStorage.setItem(CACHE_KEYS.MENU, JSON.stringify(this.currentMenu));
      localStorage.setItem(CACHE_KEYS.STOCK, JSON.stringify(this.currentStock));
      localStorage.setItem(CACHE_KEYS.SALES, JSON.stringify(this.currentSales));
      localStorage.setItem(CACHE_KEYS.ORDERS, JSON.stringify(this.currentOrders));
      localStorage.setItem(CACHE_KEYS.BILLING_SETTINGS, JSON.stringify(this.currentBillingSettings));
    } catch (e) {}
  }

  broadcast(type, payload) {
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage({ type, payload, timestamp: Date.now() });
      } catch (e) {}
    }
    // Also dispatch in-window CustomEvent
    window.dispatchEvent(new CustomEvent('aromas_sync_event', { detail: { type, payload } }));
  }

  handleBroadcastMessage(data) {
    if (!data || !data.type) return;

    if (data.type === 'MENU_UPDATED') {
      this.currentMenu = data.payload;
      this.saveLocalCache();
      this.notifyMenuListeners();
    } else if (data.type === 'STOCK_UPDATED') {
      this.currentStock = { ...this.currentStock, ...data.payload };
      this.saveLocalCache();
      this.notifyStockListeners();
    } else if (data.type === 'ORDERS_UPDATED') {
      this.currentOrders = data.payload;
      this.saveLocalCache();
      this.notifyOrderListeners();
      this.notifyKitchenOrderListeners();
    } else if (data.type === 'SALES_UPDATED') {
      this.currentSales = { ...this.currentSales, ...data.payload };
      this.saveLocalCache();
      this.notifySalesListeners();
    } else if (data.type === 'BILLING_SETTINGS_UPDATED') {
      this.currentBillingSettings = data.payload;
      this.saveLocalCache();
      this.notifyBillingListeners();
    }
  }

  init() {
    // Check if live Firebase is active
    if (window.AromasFirebase && window.AromasFirebase.isInitialized) {
      this.isLive = window.AromasFirebase.isLiveFirebase;
      this.initAuthObserver();
      this.initRealtimeFirestore();
    } else {
      // Retry in 300ms if script loaded earlier
      setTimeout(() => {
        if (window.AromasFirebase && window.AromasFirebase.isInitialized) {
          this.isLive = window.AromasFirebase.isLiveFirebase;
          this.initAuthObserver();
          this.initRealtimeFirestore();
        } else {
          this.initFallbackRealtime();
        }
      }, 300);
    }
  }

  initAuthObserver() {
    if (window.AromasFirebase && window.AromasFirebase.auth) {
      window.AromasFirebase.auth.onAuthStateChanged((user) => {
        if (user) {
          const formattedUser = {
            uid: user.uid,
            phoneNumber: user.phoneNumber || null,
            displayName: user.displayName || (user.phoneNumber ? 'Diner ' + user.phoneNumber.slice(-4) : 'Aromas Diner'),
            isAnonymous: user.isAnonymous
          };
          this.currentUser = formattedUser;
          this.setStoredUser(formattedUser);
          this.notifyAuthListeners(formattedUser);
        } else {
          this.currentUser = null;
          this.setStoredUser(null);
          this.notifyAuthListeners(null);
        }
      });
    } else {
      const stored = this.getStoredUser();
      this.currentUser = stored;
      this.notifyAuthListeners(stored);
    }
  }

  /**
   * =========================================================================
   * REAL-TIME FIRESTORE SUBSCRIPTIONS (onSnapshot)
   * =========================================================================
   */
  initRealtimeFirestore() {
    const db = window.AromasFirebase ? window.AromasFirebase.db : null;
    if (!db || !this.isLive) {
      this.initFallbackRealtime();
      return;
    }

    console.log("🔥 Connecting authoritative real-time Firestore listeners...");
    this.setConnectionState(true);

    // 1. Real-time Menu Listener
    try {
      const unsubMenu = db.collection('menu').onSnapshot((snapshot) => {
        if (snapshot.empty) {
          // Auto-seed base catalog if Firestore is fresh
          this.seedInitialCatalogToFirestore();
        } else {
          const menuList = [];
          snapshot.forEach(doc => {
            menuList.push({ id: doc.id, ...doc.data() });
          });
          this.currentMenu = menuList;
          this.saveLocalCache();
          this.notifyMenuListeners();
        }
      }, (err) => {
        console.warn("Firestore menu listener warning:", err);
      });
      this.unsubscribers.push(unsubMenu);
    } catch (e) {
      console.warn("Menu onSnapshot setup error:", e);
    }

    // 2. Real-time Stock Listener
    try {
      const unsubStock = db.collection('stock').onSnapshot((snapshot) => {
        const stockMap = {};
        snapshot.forEach(doc => {
          stockMap[doc.id] = Number(doc.data().quantity !== undefined ? doc.data().quantity : 20);
        });
        this.currentStock = stockMap;
        this.saveLocalCache();
        this.notifyStockListeners();
      }, (err) => {
        console.warn("Firestore stock listener warning:", err);
      });
      this.unsubscribers.push(unsubStock);
    } catch (e) {
      console.warn("Stock onSnapshot setup error:", e);
    }

    // 3. Real-time Orders Listener
    try {
      const unsubOrders = db.collection('orders').orderBy('timestamp', 'desc').limit(100).onSnapshot((snapshot) => {
        const ordersList = [];
        snapshot.forEach(doc => {
          ordersList.push({ id: doc.id, ...doc.data() });
        });
        this.currentOrders = ordersList;
        this.saveLocalCache();
        this.notifyOrderListeners();
        this.notifyKitchenOrderListeners();
      }, (err) => {
        console.warn("Firestore orders listener warning:", err);
      });
      this.unsubscribers.push(unsubOrders);
    } catch (e) {
      console.warn("Orders onSnapshot setup error:", e);
    }

    // 4. Real-time Sales Listener
    try {
      const unsubSales = db.collection('sales').onSnapshot((snapshot) => {
        const salesMap = {};
        snapshot.forEach(doc => {
          salesMap[doc.id] = Number(doc.data().totalQuantity || 0);
        });
        this.currentSales = salesMap;
        this.saveLocalCache();
        this.notifySalesListeners();
      }, (err) => {
        console.warn("Firestore sales listener warning:", err);
      });
      this.unsubscribers.push(unsubSales);
    } catch (e) {
      console.warn("Sales onSnapshot setup error:", e);
    }

    // 5. Real-time Billing Settings Listener (settings/billing)
    try {
      const unsubBilling = db.collection('settings').doc('billing').onSnapshot((doc) => {
        if (doc.exists) {
          const d = doc.data();
          const tax = Number(d.taxPercentage);
          this.currentBillingSettings = {
            taxEnabled: d.taxEnabled !== false,
            taxPercentage: isNaN(tax) ? 5.0 : Math.max(0, Math.min(100, tax)),
            taxLabel: (d.taxLabel || 'GST').trim() || 'GST',
            updatedAt: d.updatedAt ? (d.updatedAt.toDate ? d.updatedAt.toDate().toISOString() : String(d.updatedAt)) : new Date().toISOString(),
            updatedBy: d.updatedBy || 'kitchen'
          };
          this.saveLocalCache();
          this.notifyBillingListeners();
        } else {
          // Initialize billing doc if missing
          db.collection('settings').doc('billing').set({
            taxEnabled: true,
            taxPercentage: 5.0,
            taxLabel: 'GST',
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedBy: 'system'
          }, { merge: true }).catch(() => {});
        }
      }, (err) => {
        console.warn("Firestore billing settings listener warning:", err);
      });
      this.unsubscribers.push(unsubBilling);
    } catch (e) {
      console.warn("Billing settings onSnapshot setup error:", e);
    }
  }

  initFallbackRealtime() {
    // Ensure initial catalog has items from MENU_DATA
    if ((!this.currentMenu || this.currentMenu.length === 0) && typeof MENU_DATA !== 'undefined') {
      this.currentMenu = [...MENU_DATA];
      this.saveLocalCache();
    }

    // Ensure baseline sales seed for realistic top sellers
    if (Object.keys(this.currentSales).length === 0) {
      this.currentSales = {
        "biryani-chicken": 52,
        "main-butter-chicken": 45,
        "bev-masala-chai": 41,
        "starter-samosa": 38,
        "starter-paneer-tikka": 29
      };
      this.saveLocalCache();
    }

    this.notifyMenuListeners();
    this.notifyStockListeners();
    this.notifySalesListeners();
    this.notifyBillingListeners();
    this.notifyOrderListeners();
    this.notifyKitchenOrderListeners();
  }

  async seedInitialCatalogToFirestore() {
    if (!this.isLive || !window.AromasFirebase || !window.AromasFirebase.db) return;
    const db = window.AromasFirebase.db;

    if (typeof MENU_DATA === 'undefined') return;

    console.log("🌱 Seeding initial 60 items into Cloud Firestore...");
    const batch = db.batch();

    MENU_DATA.forEach(item => {
      const menuRef = db.collection('menu').doc(item.id);
      batch.set(menuRef, {
        ...item,
        active: true,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      const stockRef = db.collection('stock').doc(item.id);
      batch.set(stockRef, {
        quantity: 20,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    });

    try {
      await batch.commit();
      console.log("✅ Initial Firestore catalog seeded successfully!");
    } catch (err) {
      console.warn("Batch seed warning:", err);
    }
  }

  setConnectionState(status) {
    this.isConnected = status;
    this.connectionListeners.forEach(cb => {
      try { cb(status); } catch (e) {}
    });
  }

  /**
   * =========================================================================
   * 1. MENU APIS (Real-Time Synchronized)
   * =========================================================================
   */
  subscribeToMenu(callback) {
    if (typeof callback === 'function') {
      this.menuListeners.push(callback);
      callback(this.getMenu());
    }
  }

  notifyMenuListeners() {
    const menu = this.getMenu();
    this.menuListeners.forEach(cb => {
      try { cb(menu); } catch (e) { console.error("Menu listener error:", e); }
    });
  }

  getMenu() {
    if (this.currentMenu && this.currentMenu.length > 0) {
      return this.currentMenu;
    }
    const baseMenu = (typeof window !== 'undefined' && window.MENU_DATA) ? window.MENU_DATA : (typeof MENU_DATA !== 'undefined' ? MENU_DATA : []);
    if (Array.isArray(baseMenu) && baseMenu.length > 0) {
      this.currentMenu = [...baseMenu];
      return this.currentMenu;
    }
    return [];
  }

  getMenuItem(itemId) {
    const all = this.getMenu();
    return all.find(i => i.id === itemId) || null;
  }

  /**
   * =========================================================================
   * DISH IMAGE MANAGEMENT & OPTIMIZATION APIS
   * =========================================================================
   */
  getDishImage(dish) {
    const DEFAULT_FALLBACK = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80';
    if (!dish) return DEFAULT_FALLBACK;
    return dish.imageUrl || dish.image || DEFAULT_FALLBACK;
  }

  validateDishImage(file) {
    if (!file) {
      return { valid: false, error: "No image file selected." };
    }

    const validMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const mime = file.type ? file.type.toLowerCase() : '';
    const name = file.name ? file.name.toLowerCase() : '';
    const hasValidExt = name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.png') || name.endsWith('.webp');

    if (!validMimeTypes.includes(mime) && !hasValidExt) {
      return {
        valid: false,
        error: "Invalid file format. Supported image formats: JPG, JPEG, PNG, WEBP."
      };
    }

    // Max 5 MB limit
    const MAX_BYTES = 5 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      return {
        valid: false,
        error: `Image size is too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). Please select an image under 5 MB.`
      };
    }

    return { valid: true };
  }

  async optimizeDishImage(file, maxDimension = 1200, quality = 0.85) {
    return new Promise((resolve, reject) => {
      const validation = this.validateDishImage(file);
      if (!validation.valid) {
        return reject(new Error(validation.error));
      }

      if (typeof window === 'undefined' || typeof document === 'undefined') {
        return resolve({ blob: file, dataUrl: '', width: 800, height: 800, size: file.size });
      }

      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Failed to read image file."));
      reader.onload = (e) => {
        const img = new Image();
        img.onerror = () => reject(new Error("Failed to load image element for optimization."));
        img.onload = () => {
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > maxDimension) {
              height = Math.round(height * (maxDimension / width));
              width = maxDimension;
            }
          } else {
            if (height > maxDimension) {
              width = Math.round(width * (maxDimension / height));
              height = maxDimension;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          // Try exporting to WebP first, fallback to JPEG
          let dataUrl = '';
          try {
            dataUrl = canvas.toDataURL('image/webp', quality);
            if (!dataUrl.startsWith('data:image/webp')) {
              dataUrl = canvas.toDataURL('image/jpeg', quality);
            }
          } catch (err) {
            dataUrl = canvas.toDataURL('image/jpeg', quality);
          }

          if (canvas.toBlob) {
            canvas.toBlob((blob) => {
              if (blob) {
                resolve({ blob, dataUrl, width, height, size: blob.size });
              } else {
                resolve({ blob: file, dataUrl, width, height, size: file.size });
              }
            }, 'image/webp', quality);
          } else {
            resolve({ blob: file, dataUrl, width, height, size: file.size });
          }
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  async uploadDishImage(fileOrBlob, dishId = 'dish', onProgress = null) {
    const cleanId = (dishId || 'dish').toString().replace(/[^a-zA-Z0-9_-]/g, '_');
    
    // 1. Client-Side Optimization & Compression
    let optimized = null;
    if (fileOrBlob instanceof File) {
      optimized = await this.optimizeDishImage(fileOrBlob, 1200, 0.85);
    } else if (fileOrBlob instanceof Blob) {
      optimized = { blob: fileOrBlob, dataUrl: '' };
    } else if (typeof fileOrBlob === 'string' && fileOrBlob.startsWith('data:')) {
      return { success: true, imageUrl: fileOrBlob, isLocal: true, imageVersion: Date.now() };
    } else {
      throw new Error("Invalid image data provided for upload.");
    }

    if (onProgress) onProgress(25);

    // 2. Firebase Storage Upload if Live
    if (this.isLive && window.AromasFirebase && window.AromasFirebase.storage) {
      try {
        const storage = window.AromasFirebase.storage;
        const filename = `img_${Date.now()}_${Math.random().toString(36).substr(2, 6)}.webp`;
        const storagePath = `dish-images/${cleanId}/${filename}`;
        const storageRef = storage.ref().child(storagePath);

        const uploadTask = storageRef.put(optimized.blob, {
          contentType: 'image/webp',
          cacheControl: 'public, max-age=31536000'
        });

        const downloadUrl = await new Promise((resolve, reject) => {
          uploadTask.on(
            'state_changed',
            (snapshot) => {
              if (snapshot.totalBytes > 0) {
                const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
                if (onProgress) onProgress(Math.min(95, Math.max(25, pct)));
              }
            },
            (err) => {
              console.warn("Firebase Storage upload error, falling back:", err);
              reject(err);
            },
            async () => {
              try {
                const url = await uploadTask.snapshot.ref.getDownloadURL();
                resolve(url);
              } catch (e) {
                reject(e);
              }
            }
          );
        });

        if (onProgress) onProgress(100);
        return {
          success: true,
          imageUrl: downloadUrl,
          storagePath: storagePath,
          imageVersion: Date.now()
        };
      } catch (storageError) {
        console.warn("Storage upload failed, using optimized local data URL fallback:", storageError);
      }
    }

    // 3. Fallback / Offline / Demo Data URL handling
    if (onProgress) {
      onProgress(75);
      setTimeout(() => onProgress(100), 100);
    }

    return {
      success: true,
      imageUrl: optimized.dataUrl || (fileOrBlob instanceof File ? URL.createObjectURL(fileOrBlob) : ''),
      isLocal: true,
      imageVersion: Date.now()
    };
  }

  async addMenuItem(dishData) {
    if (!dishData || !dishData.name || !dishData.name.trim()) {
      throw new Error("Dish name is required.");
    }

    const rawCategory = dishData.category;
    const cleanCategory = (typeof normalizeMenuCategory === 'function') 
      ? normalizeMenuCategory(rawCategory) 
      : (typeof window !== 'undefined' && typeof window.normalizeMenuCategory === 'function' 
          ? window.normalizeMenuCategory(rawCategory) 
          : (rawCategory ? String(rawCategory).trim().toLowerCase() : null));

    if (!cleanCategory) {
      throw new Error("Please select a valid menu category. Dish was not saved.");
    }

    const rawId = dishData.name.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 20);
    const itemId = `${rawId}-${Date.now().toString().slice(-6)}`;
    const finalImage = dishData.imageUrl || dishData.image || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80';

    const newDish = {
      id: itemId,
      name: dishData.name.trim(),
      category: cleanCategory,
      price: Number(dishData.price) || 99,
      dietary: dishData.dietary || 'veg',
      tag: dishData.tag || 'Kitchen Special',
      tagType: dishData.dietary === 'veg' ? 'veg' : 'primary',
      rating: 4.9,
      calories: dishData.calories || '320 kcal',
      prepTime: dishData.prepTime || '10-15 min',
      description: dishData.description || 'Specially crafted culinary creation from the master kitchen team.',
      imageUrl: finalImage,
      image: finalImage,
      imageVersion: dishData.imageVersion || Date.now(),
      options: dishData.options || [],
      active: true,
      isCustom: true
    };

    const initialStock = (dishData.stock !== undefined && dishData.stock !== null) ? Math.max(0, parseInt(dishData.stock, 10)) : 20;

    // 1. Update in Firestore if live
    if (this.isLive && window.AromasFirebase && window.AromasFirebase.db) {
      try {
        const db = window.AromasFirebase.db;
        const batch = db.batch();
        batch.set(db.collection('menu').doc(itemId), {
          ...newDish,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        batch.set(db.collection('stock').doc(itemId), {
          quantity: initialStock,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        await batch.commit();
        console.log("☁️ Dish created in Cloud Firestore:", itemId, "Category:", cleanCategory);
      } catch (err) {
        console.warn("Could not save dish to Firestore:", err);
      }
    }

    // 2. In-memory & reactive update
    this.currentMenu.unshift(newDish);
    this.currentStock[itemId] = initialStock;
    this.saveLocalCache();

    // 3. Broadcast to all open tabs immediately
    this.broadcast('MENU_UPDATED', this.currentMenu);
    this.broadcast('STOCK_UPDATED', { [itemId]: initialStock });

    this.notifyMenuListeners();
    this.notifyStockListeners();
    return newDish;
  }

  async updateMenuItem(itemId, updateData) {
    const existingIndex = this.currentMenu.findIndex(i => i.id === itemId);
    if (existingIndex === -1) {
      throw new Error(`Menu item not found: ${itemId}`);
    }
    const existing = this.currentMenu[existingIndex];

    let cleanCategory = existing.category;
    if (updateData.category !== undefined) {
      cleanCategory = (typeof normalizeMenuCategory === 'function')
        ? normalizeMenuCategory(updateData.category)
        : (typeof window !== 'undefined' && typeof window.normalizeMenuCategory === 'function'
            ? window.normalizeMenuCategory(updateData.category)
            : (updateData.category ? String(updateData.category).trim().toLowerCase() : null));

      if (!cleanCategory) {
        throw new Error("A valid menu category is required for update.");
      }
    }

    const finalImage = (updateData.imageUrl !== undefined)
      ? updateData.imageUrl
      : (updateData.image !== undefined ? updateData.image : (existing.imageUrl || existing.image));

    const updatedDish = {
      ...existing,
      ...updateData,
      category: cleanCategory,
      price: updateData.price !== undefined ? Number(updateData.price) : existing.price,
      imageUrl: finalImage,
      image: finalImage || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80',
      imageVersion: updateData.imageVersion || Date.now(),
      updatedAt: new Date().toISOString()
    };

    // 1. Update Firestore
    if (this.isLive && window.AromasFirebase && window.AromasFirebase.db) {
      try {
        const db = window.AromasFirebase.db;
        const batch = db.batch();
        batch.set(db.collection('menu').doc(itemId), {
          ...updatedDish,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        if (updateData.stock !== undefined) {
          batch.set(db.collection('stock').doc(itemId), {
            quantity: Math.max(0, parseInt(updateData.stock, 10)),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          }, { merge: true });
        }
        await batch.commit();
        console.log("☁️ Dish updated in Cloud Firestore:", itemId, "Category:", cleanCategory);
      } catch (err) {
        console.warn("Could not update dish in Firestore:", err);
      }
    }

    // 2. In-memory update
    this.currentMenu[existingIndex] = updatedDish;
    if (updateData.stock !== undefined) {
      this.currentStock[itemId] = Math.max(0, parseInt(updateData.stock, 10));
    }
    this.saveLocalCache();

    // 3. Broadcast
    this.broadcast('MENU_UPDATED', this.currentMenu);
    if (updateData.stock !== undefined) {
      this.broadcast('STOCK_UPDATED', { [itemId]: this.currentStock[itemId] });
    }
    this.notifyMenuListeners();
    this.notifyStockListeners();

    return updatedDish;
  }

  async deleteMenuItem(itemId) {
    if (this.isLive && window.AromasFirebase && window.AromasFirebase.db) {
      try {
        await window.AromasFirebase.db.collection('menu').doc(itemId).delete();
        await window.AromasFirebase.db.collection('stock').doc(itemId).set({ quantity: 0 }, { merge: true });
      } catch (err) {
        console.warn("Could not delete from Firestore:", err);
      }
    }

    this.currentMenu = this.currentMenu.filter(item => item.id !== itemId);
    this.currentStock[itemId] = 0;
    this.saveLocalCache();

    this.broadcast('MENU_UPDATED', this.currentMenu);
    this.broadcast('STOCK_UPDATED', { [itemId]: 0 });

    this.notifyMenuListeners();
    this.notifyStockListeners();
    return true;
  }

  /**
   * =========================================================================
   * 2. STOCK APIS (Real-Time Synchronized)
   * =========================================================================
   */
  subscribeToStock(callback) {
    if (typeof callback === 'function') {
      this.stockListeners.push(callback);
      callback(this.getAllStock());
    }
  }

  notifyStockListeners() {
    const stockMap = this.getAllStock();
    this.stockListeners.forEach(cb => {
      try { cb(stockMap); } catch (e) { console.error("Stock listener error:", e); }
    });
  }

  getStock(itemId) {
    if (this.currentStock[itemId] !== undefined && this.currentStock[itemId] !== null) {
      return Number(this.currentStock[itemId]);
    }
    // Default initial stock is 20 if unset
    this.currentStock[itemId] = 20;
    return 20;
  }

  getAllStock() {
    // Populate any missing base dishes with default 20
    const menu = this.getMenu();
    menu.forEach(item => {
      if (this.currentStock[item.id] === undefined) {
        this.currentStock[item.id] = 20;
      }
    });
    return { ...this.currentStock };
  }

  async updateStock(itemId, quantity) {
    const cleanQty = Math.max(0, parseInt(quantity, 10) || 0);

    // 1. Write to Firestore if live
    if (this.isLive && window.AromasFirebase && window.AromasFirebase.db) {
      try {
        await window.AromasFirebase.db.collection('stock').doc(itemId).set({
          quantity: cleanQty,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedBy: 'kitchen'
        }, { merge: true });
      } catch (err) {
        console.warn("Could not write stock to Firestore:", err);
      }
    }

    // 2. In-memory update & broadcast
    this.currentStock[itemId] = cleanQty;
    this.saveLocalCache();

    this.broadcast('STOCK_UPDATED', { [itemId]: cleanQty });
    this.notifyStockListeners();
    return cleanQty;
  }

  async incrementStock(itemId, amount = 1) {
    const current = this.getStock(itemId);
    return this.updateStock(itemId, current + amount);
  }

  async decrementStock(itemId, amount = 1) {
    const current = this.getStock(itemId);
    return this.updateStock(itemId, Math.max(0, current - amount));
  }

  /**
   * =========================================================================
   * 3. ATOMIC ORDER CREATION & STOCK TRANSACTION
   * =========================================================================
   */
  async _processOrderWithAtomicStock(orderData, user) {
    const authUser = user || this.getCurrentUser();
    if (!authUser || !authUser.uid) {
      throw new Error("Please log in with your phone number before placing an order.");
    }

    const userId = authUser.uid;
    const userPhone = authUser.phoneNumber || orderData.userPhone || '+91 98765 43210';
    const customerName = authUser.displayName || (userPhone ? `Diner (${userPhone.slice(-4)})` : 'Aromas Diner');

    // Authoritative calculation of billing snapshot
    const billingSettings = this.getBillingSettings();
    const taxPercentage = (billingSettings && typeof billingSettings.taxPercentage === 'number') 
      ? billingSettings.taxPercentage 
      : 5.0;
    const taxLabel = (billingSettings && billingSettings.taxLabel) ? billingSettings.taxLabel : 'GST';

    const subtotal = (orderData.items || []).reduce((sum, item) => {
      const opts = (item.selectedOptions || []).reduce((s, o) => s + (o.price || 0), 0);
      return sum + ((item.price + opts) * (item.qty || 1));
    }, 0);

    const discount = Number(orderData.discount || 0);
    const taxableAmount = Math.max(0, subtotal - discount);
    const taxAmount = Number(((taxableAmount * taxPercentage) / 100).toFixed(2));
    const packagingFee = orderData.packagingFee !== undefined ? Number(orderData.packagingFee) : (subtotal > 0 ? 15 : 0);
    const finalTotal = Number((taxableAmount + taxAmount + packagingFee).toFixed(2));

    const orderPayload = {
      ...orderData,
      userId: userId,
      userPhone: userPhone,
      customer: {
        userId: userId,
        phone: userPhone,
        name: customerName
      },
      customerName: customerName,
      subtotal: subtotal,
      discount: discount,
      taxPercentage: taxPercentage,
      taxAmount: taxAmount,
      tax: taxAmount, // backward compatibility
      taxLabel: taxLabel,
      packagingFee: packagingFee,
      total: finalTotal,
      createdAtIso: new Date().toISOString(),
      timestamp: orderData.timestamp || Date.now(),
      status: 'Received',
      stockDeducted: true
    };

    // 1. Firestore Atomic Transaction
    if (this.isLive && window.AromasFirebase && window.AromasFirebase.db) {
      const db = window.AromasFirebase.db;
      try {
        await db.runTransaction(async (transaction) => {
          // Read all items stock first
          const stockDocs = [];
          for (const item of orderData.items) {
            const stockRef = db.collection('stock').doc(item.id);
            const stockDoc = await transaction.get(stockRef);
            stockDocs.push({ item, stockRef, stockDoc });
          }

          // Validate stock
          for (const entry of stockDocs) {
            const currentQty = entry.stockDoc.exists ? (Number(entry.stockDoc.data().quantity) || 0) : 20;
            if (currentQty < entry.item.qty) {
              throw new Error(`Sorry, "${entry.item.name}" has only ${currentQty} portion(s) remaining in the kitchen!`);
            }
          }

          // Deduct stock and increment sales atomically
          for (const entry of stockDocs) {
            const currentQty = entry.stockDoc.exists ? (Number(entry.stockDoc.data().quantity) || 0) : 20;
            const newQty = currentQty - entry.item.qty;
            transaction.set(entry.stockRef, {
              quantity: newQty,
              updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            const salesRef = db.collection('sales').doc(entry.item.id);
            transaction.set(salesRef, {
              totalQuantity: firebase.firestore.FieldValue.increment(entry.item.qty),
              totalOrders: firebase.firestore.FieldValue.increment(1)
            }, { merge: true });
          }

          // Create order document
          const orderRef = db.collection('orders').doc(orderData.id);
          transaction.set(orderRef, {
            ...orderPayload,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          });
        });

        console.log("✅ Order & stock atomically committed in Cloud Firestore:", orderData.id);
      } catch (transactionErr) {
        console.error("Atomic transaction failed:", transactionErr);
        throw transactionErr;
      }
    } else {
      // 2. Local Fallback Atomic Validation
      for (const item of orderData.items) {
        const available = this.getStock(item.id);
        if (available < item.qty) {
          throw new Error(`Sorry, "${item.name}" has only ${available} portion(s) remaining in the kitchen!`);
        }
      }

      // Deduct stock in-memory
      const stockDeltas = {};
      const salesDeltas = {};
      for (const item of orderData.items) {
        const available = this.getStock(item.id);
        const newQty = Math.max(0, available - item.qty);
        this.currentStock[item.id] = newQty;
        stockDeltas[item.id] = newQty;

        const currentSales = Number(this.currentSales[item.id] || 0);
        this.currentSales[item.id] = currentSales + item.qty;
        salesDeltas[item.id] = this.currentSales[item.id];
      }

      this.currentOrders.unshift(orderPayload);
      this.saveLocalCache();

      this.broadcast('STOCK_UPDATED', stockDeltas);
      this.broadcast('SALES_UPDATED', salesDeltas);
      this.broadcast('ORDERS_UPDATED', this.currentOrders);
    }

    this.notifyStockListeners();
    this.notifySalesListeners();
    this.notifyOrderListeners();
    this.notifyKitchenOrderListeners();

    return orderPayload;
  }

  /**
   * =========================================================================
   * 4. ORDERS & KITCHEN REAL-TIME APIS (STRICT USER ISOLATION)
   * =========================================================================
   */
  subscribeToUserOrders(userId, callback) {
    if (!userId || typeof userId !== 'string' || !userId.trim()) {
      if (typeof callback === 'function') callback([]);
      return () => {};
    }

    const cleanUid = userId.trim();

    // 1. Live Cloud Firestore User-Scoped Listener (WHERE userId == cleanUid)
    if (this.isLive && window.AromasFirebase && window.AromasFirebase.db) {
      const db = window.AromasFirebase.db;
      try {
        const unsub = db.collection('orders')
          .where('userId', '==', cleanUid)
          .orderBy('timestamp', 'desc')
          .onSnapshot((snapshot) => {
            const userOrders = [];
            snapshot.forEach(doc => {
              userOrders.push({ id: doc.id, ...doc.data() });
            });
            if (typeof callback === 'function') callback(userOrders);
          }, (err) => {
            console.warn("Firestore subscribeToUserOrders warning (falling back to memory):", err);
            const memoryOrders = this.currentOrders.filter(o => o.userId === cleanUid);
            if (typeof callback === 'function') callback(memoryOrders);
          });

        return unsub;
      } catch (e) {
        console.warn("subscribeToUserOrders error:", e);
      }
    }

    // 2. Local Fallback Listener (Isolated strictly by userId)
    const listenerObj = { userId: cleanUid, callback };
    this.userOrderListeners.push(listenerObj);

    const initialUserOrders = this.currentOrders.filter(o => o.userId === cleanUid);
    if (typeof callback === 'function') {
      callback(initialUserOrders);
    }

    return () => {
      this.userOrderListeners = this.userOrderListeners.filter(l => l !== listenerObj);
    };
  }

  // Deprecated global customer listener (kept for backward compatibility, returns empty or current user orders)
  subscribeToOrders(callback) {
    if (typeof callback === 'function') {
      const user = this.getCurrentUser();
      if (user && user.uid) {
        return this.subscribeToUserOrders(user.uid, callback);
      }
      this.orderListeners.push(callback);
      callback([]);
    }
    return () => {};
  }

  subscribeToKitchenOrders(callback) {
    if (typeof callback === 'function') {
      this.kitchenOrderListeners.push(callback);
      callback(this.currentOrders);
    }
  }

  notifyOrderListeners() {
    // Notify user-specific listeners strictly with their own orders
    this.userOrderListeners.forEach(listener => {
      const userOrders = this.currentOrders.filter(o => o.userId === listener.userId);
      try {
        listener.callback(userOrders);
      } catch (e) {
        console.error("User order listener error:", e);
      }
    });

    this.orderListeners.forEach(cb => {
      try {
        const user = this.getCurrentUser();
        const filtered = user ? this.currentOrders.filter(o => o.userId === user.uid) : [];
        cb(filtered);
      } catch (e) {}
    });
  }

  notifyKitchenOrderListeners() {
    this.kitchenOrderListeners.forEach(cb => {
      try { cb(this.currentOrders); } catch (e) { console.error("Kitchen order listener error:", e); }
    });
  }

  async updateOrderStatus(orderId, newStatus) {
    if (this.isLive && window.AromasFirebase && window.AromasFirebase.db) {
      try {
        await window.AromasFirebase.db.collection('orders').doc(orderId).update({
          status: newStatus,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      } catch (err) {
        console.warn("Could not update order status in Firestore:", err);
      }
    }

    const idx = this.currentOrders.findIndex(o => o.id === orderId);
    if (idx > -1) {
      this.currentOrders[idx].status = newStatus;
      this.currentOrders[idx].updatedAt = new Date().toISOString();
      this.saveLocalCache();
    }

    this.broadcast('ORDERS_UPDATED', this.currentOrders);
    this.notifyOrderListeners();
    this.notifyKitchenOrderListeners();
    return { success: true, orderId, status: newStatus };
  }

  async fetchAllOrdersForKitchen() {
    return this.currentOrders;
  }

  async fetchUserOrders(user) {
    const targetUid = user ? (user.uid || (typeof user === 'string' ? user : null)) : null;
    if (!targetUid) return [];

    if (this.isLive && window.AromasFirebase && window.AromasFirebase.db) {
      try {
        const snapshot = await window.AromasFirebase.db.collection('orders')
          .where('userId', '==', targetUid)
          .orderBy('timestamp', 'desc')
          .get();

        const orders = [];
        snapshot.forEach(doc => orders.push({ id: doc.id, ...doc.data() }));
        return orders;
      } catch (err) {
        console.warn("Firestore fetchUserOrders error:", err);
      }
    }

    return this.currentOrders.filter(o => o.userId === targetUid);
  }

  seedSampleOrdersForUser(user) {
    // Safe no-op: Do NOT inject fake sample orders into live customer sessions
    return [];
  }

  /**
   * =========================================================================
   * 5. SALES & BESTSELLER APIS
   * =========================================================================
   */
  subscribeToSales(callback) {
    if (typeof callback === 'function') {
      this.salesListeners.push(callback);
      callback(this.currentSales);
    }
  }

  notifySalesListeners() {
    this.salesListeners.forEach(cb => {
      try { cb(this.currentSales); } catch (e) { console.error("Sales listener error:", e); }
    });
  }

  getMostSellingStats() {
    let topDishId = null;
    let topSalesCount = 0;

    Object.entries(this.currentSales).forEach(([dishId, count]) => {
      if (count > topSalesCount) {
        topSalesCount = count;
        topDishId = dishId;
      }
    });

    return {
      topDishId,
      topSalesCount,
      salesMap: { ...this.currentSales }
    };
  }

  subscribeToConnectionState(callback) {
    if (typeof callback === 'function') {
      this.connectionListeners.push(callback);
      callback(this.isConnected);
    }
  }

  /**
   * =========================================================================
   * 6. BILLING & TAX CONFIGURATION APIS (Central Firebase settings/billing)
   * =========================================================================
   */
  getBillingSettings() {
    return { ...this.currentBillingSettings };
  }

  getTaxPercentage() {
    return typeof this.currentBillingSettings.taxPercentage === 'number' 
      ? this.currentBillingSettings.taxPercentage 
      : 5.0;
  }

  getTaxLabel() {
    return this.currentBillingSettings.taxLabel || 'GST';
  }

  async updateBillingSettings(settings) {
    if (!settings || typeof settings !== 'object') {
      throw new Error('Invalid billing settings configuration');
    }

    const rawTax = settings.taxPercentage;
    const numTax = Number(rawTax);

    if (rawTax === '' || rawTax === null || rawTax === undefined || isNaN(numTax)) {
      throw new Error('Tax percentage must be a valid number (e.g. 0, 5, 12, 18)');
    }

    if (numTax < 0 || numTax > 100) {
      throw new Error('Tax percentage must be between 0% and 100%');
    }

    const cleanTaxPercentage = Number(numTax.toFixed(2));
    const cleanTaxLabel = (settings.taxLabel || 'GST').trim() || 'GST';
    const updatedAtIso = new Date().toISOString();

    const payload = {
      taxEnabled: settings.taxEnabled !== false,
      taxPercentage: cleanTaxPercentage,
      taxLabel: cleanTaxLabel,
      updatedAt: updatedAtIso,
      updatedBy: settings.updatedBy || 'kitchen'
    };

    // 1. Write to Cloud Firestore
    if (this.isLive && window.AromasFirebase && window.AromasFirebase.db) {
      try {
        const db = window.AromasFirebase.db;
        await db.collection('settings').doc('billing').set({
          taxEnabled: payload.taxEnabled,
          taxPercentage: payload.taxPercentage,
          taxLabel: payload.taxLabel,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedBy: payload.updatedBy
        }, { merge: true });
        console.log("✅ Billing tax settings saved to Cloud Firestore:", payload);
      } catch (err) {
        console.error("Failed to write billing settings in Firestore:", err);
        throw new Error('Unable to update tax settings in Firebase. Please try again.');
      }
    }

    // 2. Local State & Real-time propagation
    this.currentBillingSettings = payload;
    this.saveLocalCache();
    this.broadcast('BILLING_SETTINGS_UPDATED', payload);
    this.notifyBillingListeners();

    return { success: true, settings: payload };
  }

  subscribeToBillingSettings(callback) {
    if (typeof callback === 'function') {
      this.billingListeners.push(callback);
      callback(this.getBillingSettings());
    }
  }

  notifyBillingListeners() {
    const settings = this.getBillingSettings();
    this.billingListeners.forEach(cb => {
      try { cb(settings); } catch (e) { console.error("Billing listener error:", e); }
    });
  }

  /**
   * =========================================================================
   * 7. AUTHENTICATION HELPERS
   * =========================================================================
   */
  getStoredUser() {
    try {
      const u = localStorage.getItem(AUTH_STORAGE_KEY);
      return u ? JSON.parse(u) : null;
    } catch (e) {
      return null;
    }
  }

  setStoredUser(user) {
    if (user) {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
      if (user.phoneNumber) {
        localStorage.setItem(CACHE_KEYS.PHONE, user.phoneNumber);
      }
    } else {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  }

  getCurrentUser() {
    return this.currentUser || this.getStoredUser();
  }

  onAuthStateChanged(callback) {
    if (typeof callback === 'function') {
      this.authListeners.push(callback);
      callback(this.getCurrentUser());
    }
  }

  notifyAuthListeners(user) {
    this.authListeners.forEach(cb => {
      try { cb(user); } catch (e) { console.error("Auth listener error:", e); }
    });
  }

  async sendPhoneOtp(phoneNumber, recaptchaVerifier) {
    let cleanPhone = phoneNumber.replace(/[\s\-]/g, '');
    if (!cleanPhone.startsWith('+')) {
      cleanPhone = '+91' + cleanPhone;
    }

    if (this.isLive && window.AromasFirebase && window.AromasFirebase.auth && recaptchaVerifier) {
      try {
        console.log("📡 Sending OTP via Firebase Phone Auth to:", cleanPhone);
        const confirmationResult = await window.AromasFirebase.auth.signInWithPhoneNumber(cleanPhone, recaptchaVerifier);
        this.currentConfirmationResult = confirmationResult;
        return {
          success: true,
          mode: 'firebase',
          phoneNumber: cleanPhone,
          message: `Verification code sent via SMS to ${cleanPhone}`
        };
      } catch (error) {
        console.warn("Firebase Phone Auth fallback to demo mode:", error);
        return this.sendMockOtp(cleanPhone, error.message);
      }
    } else {
      return this.sendMockOtp(cleanPhone);
    }
  }

  sendMockOtp(cleanPhone, originalError = null) {
    this.demoOtpCode = '123456';
    const digits = cleanPhone.replace(/\D/g, '').slice(-10);
    const stableUid = 'usr_' + (digits || '9876543210');

    this.currentConfirmationResult = {
      phoneNumber: cleanPhone,
      isMock: true,
      confirm: async (otp) => {
        if (otp === this.demoOtpCode || otp === '123456' || (typeof otp === 'string' && otp.trim().length === 6)) {
          const mockUser = {
            uid: stableUid,
            phoneNumber: cleanPhone,
            displayName: `Diner (${cleanPhone.slice(-4)})`,
            createdAt: new Date().toISOString()
          };
          return { user: mockUser };
        } else {
          throw new Error("Invalid 6-digit OTP code. Please try again.");
        }
      }
    };

    return {
      success: true,
      mode: 'mock',
      phoneNumber: cleanPhone,
      demoCode: this.demoOtpCode,
      originalError: originalError,
      message: `Verification code generated for ${cleanPhone}: ${this.demoOtpCode}`
    };
  }

  async verifyPhoneOtp(otpCode) {
    if (!this.currentConfirmationResult) {
      throw new Error("No active OTP request found. Please request a new verification code.");
    }

    try {
      const result = await this.currentConfirmationResult.confirm(otpCode);
      const user = {
        uid: result.user.uid,
        phoneNumber: result.user.phoneNumber || this.currentConfirmationResult.phoneNumber,
        displayName: result.user.displayName || `Aromas Member (${(result.user.phoneNumber || this.currentConfirmationResult.phoneNumber).slice(-4)})`
      };

      this.setStoredUser(user);
      this.currentUser = user;
      this.notifyAuthListeners(user);
      this.currentConfirmationResult = null;

      return { success: true, user };
    } catch (err) {
      throw new Error(err.message || "Invalid OTP code. Please check and try again.");
    }
  }

  async signOut() {
    if (this.isLive && window.AromasFirebase && window.AromasFirebase.auth) {
      try {
        await window.AromasFirebase.auth.signOut();
      } catch (e) {}
    }

    try {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      localStorage.removeItem(CACHE_KEYS.PHONE);
      localStorage.removeItem('aromas_orders');
      localStorage.removeItem('aromas_last_paid_order');
      localStorage.removeItem('aromas_cart');
      localStorage.removeItem('aromas_coupon');
    } catch (e) {}

    this.currentUser = null;
    this.notifyAuthListeners(null);
    return { success: true };
  }

  // Compatibility aliases
  createOrderWithAtomicStock(orderData, user) {
    return this._processOrderWithAtomicStock(orderData, user);
  }

  createOrder(orderData, user) {
    return this._processOrderWithAtomicStock(orderData, user);
  }

  saveOrderToFirebase(orderData, user) {
    return this._processOrderWithAtomicStock(orderData, user);
  }

  addOrder(orderData, user) {
    return this._processOrderWithAtomicStock(orderData, user);
  }

  saveOrder(orderData, user) {
    return this._processOrderWithAtomicStock(orderData, user);
  }

  updateOrderStatusInFirebase(orderId, newStatus) {
    return this.updateOrderStatus(orderId, newStatus);
  }

  onOrdersUpdated(callback) {
    this.subscribeToOrders(callback);
  }
}

// Global Singleton Instance
const serviceInstance = new CentralFirebaseService();
if (typeof window !== 'undefined') {
  window.AromasFirebaseService = serviceInstance;
  window.AromasFirebaseService.createOrderWithAtomicStock = function(orderData, user) {
    return serviceInstance._processOrderWithAtomicStock(orderData, user);
  };
  window.AromasFirebaseService.createOrder = function(orderData, user) {
    return serviceInstance._processOrderWithAtomicStock(orderData, user);
  };
  window.AromasFirebaseService.saveOrderToFirebase = function(orderData, user) {
    return serviceInstance._processOrderWithAtomicStock(orderData, user);
  };
}
