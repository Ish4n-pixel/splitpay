# SplitPay 🧾💸

> **Smart group dining, fair itemized splits, one seamless payment.**

SplitPay is a real-time group dining and bill-settlement web application designed to eliminate the awkwardness and mathematical chaos of dining in large groups. Instead of forcing waitstaff to split cards or forcing one person to front a massive bill and chase friends for payment, SplitPay digitizes the receipt, calculates individual shares down to the paise, collects payments into a centralized pool via dynamic UPI QR codes, and ensures the venue receives a single accurate settlement.

**Live Application:** [https://splitpay-4aut.onrender.com](https://splitpay-4aut.onrender.com)

---

## Features

- **Receipt OCR & Ingestion:** Snap a receipt photo with your smartphone camera or file upload (powered by client-side Tesseract.js with auto-contrast filtering) or enter dishes manually via a fast entry form.
- **Portion-Based Dish Claiming:** Claim exact portions of grouped dishes (e.g. claim 1 out of 3 Chicken Tikkas) rather than being forced to take all 3. Pay strictly for what you ate.
- **Claim Locking Protection:** Dishes or portions already claimed by earlier diners are automatically locked to prevent latecomers from over-claiming or claiming someone else's food.
- **Fair Proportional Fee Allocation:** Taxes, GST, tips, and service charges are distributed proportionally to each person's food spend so lighter eaters never subsidize heavy eaters. Flat equal division is also available with a single toggle.
- **Flexible Tax & Tip Modes:** Add GST, service charges, or tips as either percentage (`%`) or fixed rupee amount (`₹ Fixed`).
- **Host Self-Dish Verification:** Hosts can claim their own dishes directly from the Host Dashboard with 1-click quick-claim buttons. Host-claimed items automatically advance the settled progress bar.
- **Zero-Penny Invariant Precision:** 100% of arithmetic is computed in integer paise using the **Largest-Remainder (Hamilton-Hare)** method, guaranteeing mathematical zero-discrepancy down to the penny.
- **Zero App Installation Friction:** Guests scan a table QR code or open a short link in their mobile browser—no downloads, logins, or app store installs required.
- **Real-Time Live Sync:** Powered by Socket.IO, the entire table updates simultaneously as diners claim items, log cash, or make payments.
- **Dynamic UPI Settlement:** Generates individual UPI QR codes mapped to the host's UPI ID (`upi://pay?pa=...`), pre-filled with each diner's exact amount due.
- **Mixed Payment Support:** Real-time cash logging ("Paid Cash") and 1-tap proxy covers ("A covers B").

---

## 🛠️ Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS + Lucide Icons
- **Real-Time Synchronization:** Socket.IO
- **Database:** SQLite (`better-sqlite3`) with WAL mode
- **OCR Engine:** Tesseract.js
- **Testing:** Vitest (22 automated unit & invariant tests) + End-to-End simulation script

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ or 20+ LTS
- npm

### Installation & Run

```bash
# Clone the repository
git clone https://github.com/<your-username>/splitpay.git
cd splitpay

# Install dependencies
npm install

# Run unit & engine tests
npm test

# Run development server with live reload
npm run dev

# Or build and run production server
npm run build
npm start
```

Open `http://localhost:3000` (or the network IP shown in your terminal for phones on local Wi-Fi).

---

## Deployment

SplitPay is containerized with Docker and deployed with continuous integration:

### Production Environment
- **Live URL:** [https://splitpay-4aut.onrender.com](https://splitpay-4aut.onrender.com)
- **Container Runtime:** Docker on a Linux web service (Singapore region for low latency).
- **Automated CI/CD:** Connected directly to this repository's `main` branch. Any commit pushed to `main` automatically triggers a fresh Docker build and rolling deploy.
- **Server Architecture:** Unified HTTP server running Next.js 14 request handling alongside Socket.IO WebSockets on port `3000`.
- **Database:** SQLite (`better-sqlite3`) with WAL journal mode enabled and configurable storage path via `DATA_DIR`.

### Running Locally with Docker Compose

To build and run the production container locally:

```bash
docker compose up -d --build
```

This launches the container with a local Docker volume (`splitpay_data`) mounted to `/app/data`.

---

## 🧪 Testing

```bash
# Run unit tests
npm test

# Run full end-to-end simulation
npx tsx test-e2e.ts
```

---

## 📄 License

MIT
