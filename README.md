# 🧾 Receipt Taker

Fast, minimal-effort receipt tracking app. Snap a photo → AI extracts the data → appended to your spreadsheet. Done.

## Features

- **📸 Camera Scan** — Take a photo of any receipt, AI (GPT-4o Vision) extracts all the details
- **✏️ Manual Entry** — Quick form with auto GST calculation
- **📊 Spreadsheet Integration** — Auto-appends to `data/receipts.xlsx` with formatted rows and hyperlinks
- **📁 Receipt Storage** — Images stored with `yyyymmdd_Vendor_Description` naming in organized folders
- **📱 Mobile Ready** — PWA design, works on any phone browser. Capacitor ready for native apps
- **🎨 Premium Dark UI** — Beautiful, responsive interface optimized for speed

## Quick Start

### Prerequisites
- Node.js 18+
- OpenAI API key (for receipt scanning)

### 1. Backend
```bash
cd backend
cp .env.example .env
# Edit .env and add your OPENAI_API_KEY
npm install
npm run dev
```

### 2. Frontend
```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173** in your browser.

## Project Structure

```
005_Receipt taker/
├── frontend/          # React + Vite PWA
│   └── src/
│       ├── pages/     # Home, Scan, Manual, History
│       ├── components/ # Navigation, Toast
│       └── services/  # API client
├── backend/           # Express API server
│   └── src/
│       ├── routes/    # Receipt CRUD endpoints
│       ├── services/  # OCR, Spreadsheet, Storage
│       └── database/  # SQLite schema
└── data/              # Generated data
    ├── receipts.xlsx  # The master spreadsheet
    ├── receipts/      # Stored receipt images
    └── receipts.db    # SQLite index
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/receipts/scan` | Upload receipt → OCR → return extracted data |
| POST | `/api/receipts/confirm` | Confirm & save to spreadsheet |
| POST | `/api/receipts/manual` | Manual entry |
| GET | `/api/receipts` | List all receipts |
| GET | `/api/receipts/:id/image` | Serve receipt image |
| DELETE | `/api/receipts/:id` | Delete receipt |

## Tech Stack

- **Frontend**: React, TypeScript, Vite, Vanilla CSS
- **Backend**: Express, TypeScript
- **AI/OCR**: OpenAI GPT-4o Vision
- **Spreadsheet**: ExcelJS
- **Database**: SQLite (sql.js)
- **Mobile**: Capacitor-ready PWA
