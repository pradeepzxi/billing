/**
 * Aromas - Firebase Configuration & Initialization
 * Supports live Firebase projects and interactive credentials management
 */

// Default Firebase Project Configuration Placeholder
// Users can provide their own Firebase Web App config via the interactive UI settings modal
const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyDemoPlaceholderKeyForAromasBilling2026",
  authDomain: "aromas-billing-app.firebaseapp.com",
  projectId: "aromas-billing-app",
  storageBucket: "aromas-billing-app.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef1234567890"
};

const FIREBASE_STORAGE_KEYS = {
  CONFIG: 'aromas_firebase_config',
  CUSTOM_ENABLED: 'aromas_firebase_custom_enabled',
  MOCK_MODE: 'aromas_firebase_mock_mode'
};

class FirebaseManager {
  constructor() {
    this.app = null;
    this.auth = null;
    this.db = null;
    this.recaptchaVerifier = null;
    this.isInitialized = false;
    this.isLiveFirebase = false;
    this.init();
  }

  getConfig() {
    try {
      const savedConfig = localStorage.getItem(FIREBASE_STORAGE_KEYS.CONFIG);
      if (savedConfig) {
        return JSON.parse(savedConfig);
      }
    } catch (e) {
      console.warn("Failed to parse custom Firebase config:", e);
    }
    return DEFAULT_FIREBASE_CONFIG;
  }

  saveConfig(config) {
    try {
      localStorage.setItem(FIREBASE_STORAGE_KEYS.CONFIG, JSON.stringify(config, null, 2));
      localStorage.setItem(FIREBASE_STORAGE_KEYS.CUSTOM_ENABLED, 'true');
      return true;
    } catch (e) {
      console.error("Error saving Firebase config:", e);
      return false;
    }
  }

  isCustomConfigSet() {
    return localStorage.getItem(FIREBASE_STORAGE_KEYS.CUSTOM_ENABLED) === 'true';
  }

  init() {
    const config = this.getConfig();

    if (typeof firebase !== 'undefined') {
      try {
        if (!firebase.apps.length) {
          this.app = firebase.initializeApp(config);
        } else {
          this.app = firebase.app();
        }

        this.auth = firebase.auth();
        this.db = firebase.firestore ? firebase.firestore() : null;
        this.storage = firebase.storage ? firebase.storage() : null;
        this.isInitialized = true;

        // Check if config has real keys (not the placeholder key)
        if (config.apiKey && !config.apiKey.includes('PlaceholderKey')) {
          this.isLiveFirebase = true;
          console.log("🔥 Live Firebase initialized successfully with project:", config.projectId);
        } else {
          this.isLiveFirebase = false;
          console.log("ℹ️ Firebase running with demo configuration. You can connect your live Firebase Project in Settings.");
        }
      } catch (err) {
        console.warn("Firebase initialization notice:", err.message);
        this.isInitialized = false;
      }
    } else {
      console.warn("Firebase SDK not loaded yet.");
    }
  }

  setupRecaptcha(containerId = 'recaptcha-container', callback) {
    if (typeof firebase === 'undefined' || !this.auth) {
      return null;
    }

    try {
      if (this.recaptchaVerifier) {
        try { this.recaptchaVerifier.clear(); } catch(e) {}
      }

      this.recaptchaVerifier = new firebase.auth.RecaptchaVerifier(containerId, {
        size: 'invisible',
        callback: (response) => {
          if (callback) callback(response);
        },
        'expired-callback': () => {
          console.warn("reCAPTCHA expired. Please retry.");
        }
      });
      return this.recaptchaVerifier;
    } catch (e) {
      console.warn("Could not create RecaptchaVerifier:", e);
      return null;
    }
  }
}

// Global Firebase Instance
window.AromasFirebase = new FirebaseManager();
