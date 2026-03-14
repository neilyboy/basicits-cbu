# Basic ITS - Cost Build Up (CBU)

A modern web application for building cost estimates for Verkada security solutions. Import the full Verkada product catalog, create detailed cost build ups for client projects, and export them in multiple formats.

## Features

- **Product Management** — Full Verkada product catalog with categories (Video Security, Access Control, Intercoms, Alarms, etc.)
- **Smart Import** — Upload Verkada price book (.xlsx) with preview, selective import, and price change detection
- **Product Images** — Auto-fetch product thumbnails from Verkada CDN and cache locally
- **CBU Builder** — Create cost build ups with project details, hardware picker, quantities, and misc charges
- **Folder Organization** — Organize CBUs into nested folders/labels
- **Real-time Search** — Instant search across all CBUs and products
- **Multi-format Export** — PDF, Excel (.xlsx), CSV, JSON, and standalone HTML
- **Share Links** — Generate shareable URLs for read-only CBU views
- **Import/Export CBUs** — Export CBUs as JSON for backup, re-import later
- **Fully Editable** — Add/edit/remove products, categories, and subcategories at any time

## Tech Stack

- **Frontend**: React + Vite + TailwindCSS + Lucide Icons
- **Backend**: Node.js + Express + better-sqlite3
- **Database**: SQLite (file-based, easy backup)
- **Deployment**: Docker Compose

## Quick Start

### 1. Configure Ports

Edit `.env` to set your desired ports (defaults are 8099 for frontend, 3099 for backend):

```env
FRONTEND_PORT=8099
BACKEND_PORT=3099
VITE_API_URL=http://your-server-ip:3099
FRONTEND_URL=http://your-server-ip:8099
```

### 2. Build & Run with Docker Compose

```bash
docker compose up -d --build
```

The app will be available at `http://localhost:8099` (or your configured port).

### 3. Import Products

1. Navigate to **Import Products** in the sidebar
2. Upload the Verkada Reseller Price Book (.xlsx)
3. Preview changes and select what to import
4. After import, go to **Products** and click **Fetch Images** to download thumbnails

### 4. Create a CBU

1. Click **New CBU** from the dashboard
2. Fill in project details (Project Name, Client, Address, etc.)
3. Click **Add Hardware** to open the product picker
4. Browse categories or search, add items with quantities
5. Add any additional misc charges
6. Save and export in your preferred format

## Development

Run backend and frontend separately for development:

```bash
# Backend
cd backend
npm install
DATA_DIR=../data PORT=3099 node src/index.js

# Frontend (in another terminal)
cd frontend
npm install
VITE_API_URL=http://localhost:3099 npx vite
```

## Project Structure

```
├── docker-compose.yml       # Docker Compose config
├── .env                     # Port and URL configuration
├── logo.svg                 # Company logo
├── backend/
│   ├── Dockerfile
│   ├── src/
│   │   ├── index.js         # Express server
│   │   ├── database.js      # SQLite schema & connection
│   │   └── routes/
│   │       ├── products.js  # Product CRUD + categories
│   │       ├── cbus.js      # CBU CRUD + items + charges
│   │       ├── folders.js   # Folder tree management
│   │       ├── import.js    # Verkada price book parser
│   │       ├── export.js    # PDF/XLSX/CSV/JSON/HTML export
│   │       ├── share.js     # Public share link handler
│   │       └── images.js    # Product image fetch/upload
│   └── assets/              # Logo files for PDF export
├── frontend/
│   ├── Dockerfile
│   ├── nginx.conf
│   └── src/
│       ├── App.jsx          # Route definitions
│       ├── api.js           # API client
│       ├── components/
│       │   └── Layout.jsx   # Sidebar + navigation
│       └── pages/
│           ├── Dashboard.jsx
│           ├── CbuList.jsx
│           ├── CbuEditor.jsx
│           ├── CbuView.jsx
│           ├── Products.jsx
│           └── ImportProducts.jsx
└── data/                    # Persistent data (Docker volume)
    ├── cbu.db               # SQLite database
    └── product-images/      # Cached product thumbnails
```

## Data Persistence

All data is stored in the `./data` directory which is mounted as a Docker volume. Back up this directory to preserve your database and images.
