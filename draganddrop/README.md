# Drag&Drop — Free File Converter

A fast, private, full-stack file conversion tool. All 15 tools enabled.

![License](https://img.shields.io/badge/license-MIT-blue)
![Node](https://img.shields.io/badge/node-%3E%3D18-green)
![Status](https://img.shields.io/badge/status-live-10b981)

---

## 🗂 Project Structure

```
draganddrop/
├── frontend/
│   └── index.html          ← entire frontend (single file)
├── backend/
│   ├── server.js           ← Express API server
│   ├── package.json
│   ├── .env.example        ← copy to .env and edit
│   ├── uploads/            ← temp uploads (auto-deleted)
│   └── outputs/            ← temp outputs (auto-deleted)
├── .gitignore
└── README.md
```

---

## ✅ All 15 Tools

### In-Browser (no server needed)
| Tool | How |
|---|---|
| Merge PDF | pdf-lib |
| Split PDF | pdf-lib |
| Compress PDF | pdf-lib |
| PDF to JPG | PDF.js + Canvas |
| JPG to PDF | pdf-lib |
| Rotate PDF | pdf-lib |
| JPG → PNG | Canvas API |
| PNG → JPG | Canvas API |
| Resize Image | Canvas API |
| Compress Image | Canvas API |

### Via Backend Server
| Tool | How |
|---|---|
| Unlock PDF | pdf-lib |
| Word to PDF | LibreOffice |
| PDF to Word | LibreOffice |
| PPT to PDF | LibreOffice |
| Excel to PDF | LibreOffice |

---

## 🚀 Setup & Run

### 1. Requirements

- **Node.js** v18 or newer → https://nodejs.org
- **LibreOffice** (for document tools)

**Install LibreOffice:**
```bash
# Ubuntu / Debian
sudo apt install libreoffice

# macOS
brew install libreoffice

# Windows
# Download from https://www.libreoffice.org/download
```

---

### 2. Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Create your .env file
cp .env.example .env

# Edit .env — set your frontend URL
nano .env

# Start the server
npm start
```

Server runs at: **http://localhost:4000**

For development with auto-reload:
```bash
npm run dev
```

---

### 3. Frontend Setup

The frontend is a single HTML file — no build step needed.

**Option A — Open directly:**
Just open `frontend/index.html` in your browser.

**Option B — Serve with VS Code Live Server:**
Install the Live Server extension, right-click `index.html` → Open with Live Server.

**Option C — Simple HTTP server:**
```bash
cd frontend
npx serve .
```

---

### 4. Connect Frontend to Backend

Open `frontend/index.html` and find this line near the top of the `<script>`:

```js
const API_URL = 'http://localhost:4000';
```

Change it to your deployed backend URL when going live, e.g.:
```js
const API_URL = 'https://your-backend.railway.app';
```

---

## ☁️ Deployment

### Frontend → GitHub Pages (free)
1. Push repo to GitHub
2. Go to **Settings → Pages**
3. Source: **main branch → /frontend folder**
4. Site live at: `https://yourusername.github.io/draganddrop`

### Backend → Railway (recommended, free tier)
1. Go to https://railway.app → New Project → Deploy from GitHub
2. Select the `backend` folder as root
3. Add environment variables from `.env.example`
4. Railway gives you a URL like `https://draganddrop-backend.up.railway.app`
5. Update `API_URL` in `frontend/index.html` to that URL

### Backend → Render (free tier)
1. Go to https://render.com → New Web Service
2. Connect your GitHub repo
3. Root directory: `backend`
4. Build command: `npm install`
5. Start command: `node server.js`

---

## 🔒 Security & Privacy

- Files are **auto-deleted** from the server after **1 hour**
- A background sweep runs every **15 minutes** to clean old files
- Browser tools process files **100% locally** — zero upload
- CORS is locked to your configured `FRONTEND_URL`
- `helmet.js` adds security headers

---

## 📄 API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Server health check |
| `POST` | `/api/pdf/unlock` | Unlock password-protected PDF |
| `POST` | `/api/document/to-pdf` | Word/PPT/Excel → PDF |
| `POST` | `/api/document/pdf-to-word` | PDF → Word (DOCX) |

All POST endpoints accept `multipart/form-data` with a `file` field.

---

## 📄 License

MIT — free to use, modify and distribute.
