# 🍲 Aromas — Restaurant Billing & Kitchen Display System (KDS)

[![Live Demo Available](https://img.shields.io/badge/Status-Ready%20to%20Deploy-success.svg)](#quick-start)
[![Frontend](https://img.shields.io/badge/Stack-HTML5%20%7C%20TailwindCSS%20%7C%20Vanilla%20JS-orange.svg)](#tech-stack)
[![Database](https://img.shields.io/badge/Database-Firebase%20Firestore%20%2F%20LocalStorage-yellow.svg)](#cloud-sync--offline-fallback)
[![Tunnel](https://img.shields.io/badge/Tunnel-Cloudflare%20Zero%20Trust-blue.svg)](#public-access-via-cloudflare-tunnel)

**Aromas** is a modern, high-performance web application designed for campus cafes, restaurants, and food courts. It features an editorial customer-facing ordering experience, real-time digital billing, and a high-contrast **Kitchen Display System (KDS)** with live ticket tracking, audio cues, and thermal KOT support.

---

## 📸 Key Interfaces

| 🛍️ Customer Ordering & Menu | 🧑‍🍳 Kitchen Display System (KDS) |
|:---:|:---:|
| Location selection, curated categories, customizer modal & digital receipts | Kanban / Grid / Table views, prep timers, sound chimes & KOT thermal printing |
| [`index.html`](index.html) | [`kitchen.html`](kitchen.html) |

---

## ✨ Features

### 🛒 1. Customer Ordering Portal (`index.html`)
- **Multi-Location Selection**: Switch between branches (e.g., *Main Campus* vs *AU Quasar*).
- **Curated Menu Directory**: Filter across Starters, North Indian, South Indian, Biryani & Rice, Street Food/Chaat, Breads, Desserts, Beverages, and Value Combos.
- **Dietary & Search Filters**: Instant search bar with Veg / Non-Veg toggles.
- **Item Customization**: Configurable spice levels, add-ons, and portion sizes with dynamic cart pricing.
- **Coupon Engine**: Apply promo codes with automatic subtotal validation.
- **Interactive Payments**: Support for **UPI** (QR & intent links), **Cards**, and **Pay at Counter**.
- **Digital Receipt & Download**: Live generated receipt with one-click PNG image export powered by `html2canvas`.
- **Live Order Status Tracker**: Visual step-by-step progress indicator (*Order Received* ➔ *Cooking in Kitchen* ➔ *Ready for Pickup* ➔ *Completed*).

### 👨‍🍳 2. Kitchen Display System (KDS) (`kitchen.html`)
- **High-Contrast Dark Theme**: Purpose-built for kitchen tablets, monitors, and harsh lighting conditions.
- **PIN Authentication**: Secure staff access with quick numeric keypad entry (Master PIN: `8888` or `2026`).
- **Multiple Layout Views**:
  - **Kanban Board**: Drag or click to advance orders across prep stages.
  - **Compact Grid**: Dense card layout for high-volume order rushes.
  - **Table View**: Fast-scan operational matrix.
- **Dynamic Elapsed Timers**: Visual warning indicators as prep times increase.
- **Web Audio Chimes**: Auditory alerts triggered whenever a new order is received.
- **Thermal KOT Printing**: One-click standard 80mm / 58mm Kitchen Order Ticket receipt printing.
- **Inventory & 86-ing Tracker**: Mark menu items as *In Stock*, *Low Stock*, or *Sold Out* on the fly.

### ⚡ 3. Dual-Mode Architecture (Zero-Config or Firebase)
- **Offline / Local Mock Mode (Default)**: Runs straight out of the box using browser storage and session broadcasting—no setup or database accounts required!
- **Live Firebase Firestore Mode**: Built-in Firebase SDK adapter with real-time snapshot listeners for multi-device sync across different networks.

---

## 🚀 Quick Start

### Option A: Quick Launch with Batch Scripts (Windows)
Double-click any of the helper scripts in the project directory:

1. **Local Server**: Run `start_server.bat`
   - Starts Python local HTTP server on `http://localhost:8085`
   - Automatically opens your browser.
2. **Cloudflare Public Tunnel**: Run `start_tunnel.bat`
   - Starts the server and launches `cloudflared.exe`
   - Gives you a free `https://*.trycloudflare.com` URL to open on your phone or tablet anywhere.

---

### Option B: Run via Terminal / Command Line

```bash
# Clone the repository
git clone https://github.com/pradeepzxi/billing.git
cd billing

# Start a simple HTTP server (Python 3)
python -m http.server 8085
```

Open your browser and navigate to:
- **Customer App**: [http://localhost:8085/](http://localhost:8085/) or [http://localhost:8085/index.html](http://localhost:8085/index.html)
- **Kitchen KDS**: [http://localhost:8085/kitchen.html](http://localhost:8085/kitchen.html)

---

## 🔑 Default Credentials (KDS Access)

To unlock the Kitchen Display System (`kitchen.html`), enter any of the following PINs on the keypad:

| Role | PIN |
|:---|:---|
| **Kitchen Master PIN** | `8888` |
| **Shift Lead PIN** | `2026` |
| **Standard Staff PINs** | `1234`, `0000`, `9999`, `1111`, `2222` |

---

## 🌐 Public Access via Cloudflare Tunnel

To test orders between a customer's smartphone and a tablet in the kitchen over different Wi-Fi/cellular networks:

```bash
.\cloudflared.exe tunnel --url http://localhost:8085
```

Copy the generated `https://<random-subdomain>.trycloudflare.com` URL and open it on any mobile device.

---

## 🛠️ Project Structure

```text
├── index.html                 # Main customer application & ordering portal
├── kitchen.html               # Kitchen Display System (KDS) for staff
├── location.html              # Location selection landing redirect
├── menu.html                  # Direct route to menu view
├── bill.html                  # Direct route to order bill / receipt
│
├── js/
│   ├── app.js                 # Customer state store, cart, checkout & routing
│   ├── kitchen.js             # KDS state, timer logic, audio cues & KOT print
│   ├── menu-data.js           # Full culinary menu items & categories
│   ├── firebase-config.js     # Firebase connection & credential manager
│   └── firebase-service.js    # Firestore real-time queries & listeners
│
├── styles/
│   └── main.css               # Core styling & custom animations
│
├── assets/                    # Photography, logos, and UI asset graphics
├── start_server.bat           # 1-click Windows local server starter
├── start_tunnel.bat           # 1-click Windows Cloudflare Tunnel starter
└── firestore.rules            # Security rules for production Firebase Firestore
```

---

## ⚙️ Connecting Your Own Firebase Project (Optional)

1. Go to the [Firebase Console](https://console.firebase.google.com/) and create a project.
2. Enable **Firestore Database** and **Phone Authentication** (or Anonymous).
3. Open the Aromas Customer App or KDS in your browser.
4. Click on the **Database / Cloud** settings icon in the top navigation bar.
5. Paste your Firebase Web Config JSON object and click **Save & Connect**.

---

## 📄 License

This project is open-source and available under the [MIT License](LICENSE).
