/**
 * Drag&Drop — Backend Server
 * ─────────────────────────────────────────────────
 * Handles server-side file conversions:
 *   • Unlock PDF
 *   • Word / PPT / Excel → PDF  (LibreOffice)
 *   • PDF → Word               (LibreOffice)
 *
 * Start:  node server.js
 * Needs:  libreoffice installed on the server
 */

require('dotenv').config();
const express    = require('express');
const multer     = require('multer');
const cors       = require('cors');
const helmet     = require('helmet');
const morgan     = require('morgan');
const path       = require('path');
const fs         = require('fs');
const { v4: uuid } = require('uuid');
const { execFile }  = require('child_process');
const { PDFDocument } = require('pdf-lib');

// ── CONFIG ────────────────────────────────────────────────────────────────────
const app        = express();
const PORT       = process.env.PORT || 4000;
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const OUTPUT_DIR = path.join(__dirname, 'outputs');
const MAX_SIZE   = parseInt(process.env.MAX_FILE_SIZE_MB || '100') * 1024 * 1024;
const TTL_MS     = parseInt(process.env.FILE_TTL_HOURS   || '1')   * 60 * 60 * 1000;
const ORIGIN     = process.env.FRONTEND_URL || 'http://localhost:3000';

[UPLOAD_DIR, OUTPUT_DIR].forEach(d => fs.mkdirSync(d, { recursive: true }));

// ── MIDDLEWARE ────────────────────────────────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin: [ORIGIN, 'http://127.0.0.1:5500', 'http://localhost:5500', 'null'],
  methods: ['GET','POST'],
}));
app.use(morgan('dev'));
app.use(express.json());

// Serve output files for download
app.use('/outputs', express.static(OUTPUT_DIR, {
  setHeaders(res){ res.setHeader('Content-Disposition','attachment'); }
}));

// ── MULTER ────────────────────────────────────────────────────────────────────
const ALLOWED_MIMES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOAD_DIR),
  filename:    (_, file, cb) => cb(null, uuid() + path.extname(file.originalname).toLowerCase()),
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE },
  fileFilter: (_, file, cb) => {
    if (ALLOWED_MIMES.has(file.mimetype)) return cb(null, true);
    cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', `Unsupported type: ${file.mimetype}`));
  },
});

// ── AUTO-DELETE ────────────────────────────────────────────────────────────────
function scheduleDelete(filePath, delay = TTL_MS) {
  setTimeout(() => {
    fs.unlink(filePath, err => {
      if (err && err.code !== 'ENOENT')
        console.error('Cleanup error:', filePath, err.message);
    });
  }, delay);
}

// Sweep old files every 15 minutes
setInterval(() => {
  const now = Date.now();
  [UPLOAD_DIR, OUTPUT_DIR].forEach(dir => {
    fs.readdir(dir, (_, files) => {
      (files||[]).forEach(f => {
        const fp = path.join(dir, f);
        fs.stat(fp, (e, s) => { if (!e && now - s.mtimeMs > TTL_MS) fs.unlink(fp, ()=>{}); });
      });
    });
  });
}, 15 * 60 * 1000);

// ── HELPERS ────────────────────────────────────────────────────────────────────
function outFile(ext) {
  const name = uuid() + '.' + ext;
  return { name, path: path.join(OUTPUT_DIR, name), url: '/outputs/' + name };
}

function libreOfficeConvert(inputPath, outputDir, format = 'pdf') {
  return new Promise((resolve, reject) => {
    execFile(
      'libreoffice',
      ['--headless', '--convert-to', format, '--outdir', outputDir, inputPath],
      { timeout: 120_000 },
      (err, stdout, stderr) => {
        if (err) return reject(new Error(stderr || err.message));
        resolve(stdout);
      }
    );
  });
}

// ── HEALTH ─────────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// ── UNLOCK PDF ─────────────────────────────────────────────────────────────────
// Note: pdf-lib can only remove "user" (open) passwords, not owner passwords.
// For full unlock support, use qpdf: execFile('qpdf', ['--password=...', '--decrypt', input, output])
app.post('/api/pdf/unlock', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  try {
    const bytes = fs.readFileSync(req.file.path);
    const password = req.body.password || '';

    let doc;
    try {
      doc = await PDFDocument.load(bytes, {
        password,
        ignoreEncryption: false,
      });
    } catch {
      // Try without password as fallback
      try {
        doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      } catch (e) {
        return res.status(422).json({ error: 'Could not unlock PDF. The password may be incorrect or the file uses unsupported encryption.' });
      }
    }

    const out = outFile('pdf');
    const saved = await doc.save();
    fs.writeFileSync(out.path, saved);

    scheduleDelete(req.file.path, 60_000);
    scheduleDelete(out.path, TTL_MS);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="unlocked.pdf"`);
    res.sendFile(out.path);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DOCUMENT → PDF  (Word, PPT, Excel) ────────────────────────────────────────
app.post('/api/document/to-pdf', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  try {
    await libreOfficeConvert(req.file.path, OUTPUT_DIR, 'pdf');

    // LibreOffice names the output after the input basename
    const baseName   = path.basename(req.file.path, path.extname(req.file.path));
    const outputPath = path.join(OUTPUT_DIR, baseName + '.pdf');

    if (!fs.existsSync(outputPath))
      return res.status(500).json({ error: 'LibreOffice did not produce output. Is LibreOffice installed?' });

    scheduleDelete(req.file.path, 60_000);
    scheduleDelete(outputPath, TTL_MS);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="converted.pdf"`);
    res.sendFile(outputPath);
  } catch (err) {
    res.status(500).json({ error: 'LibreOffice conversion failed: ' + err.message });
  }
});

// ── PDF → WORD ─────────────────────────────────────────────────────────────────
// LibreOffice can convert PDF → ODT/DOCX (quality varies)
app.post('/api/document/pdf-to-word', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  try {
    await libreOfficeConvert(req.file.path, OUTPUT_DIR, 'docx');

    const baseName   = path.basename(req.file.path, path.extname(req.file.path));
    const outputPath = path.join(OUTPUT_DIR, baseName + '.docx');

    if (!fs.existsSync(outputPath))
      return res.status(500).json({ error: 'Conversion failed. LibreOffice could not convert this PDF to Word.' });

    scheduleDelete(req.file.path, 60_000);
    scheduleDelete(outputPath, TTL_MS);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="converted.docx"`);
    res.sendFile(outputPath);
  } catch (err) {
    res.status(500).json({ error: 'PDF to Word conversion failed: ' + err.message });
  }
});

// ── MULTER & GLOBAL ERROR HANDLER ─────────────────────────────────────────────
app.use((err, req, res, _next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE')
      return res.status(413).json({ error: `File exceeds ${MAX_SIZE/1024/1024}MB limit` });
    return res.status(400).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// ── START ──────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀  Drag&Drop backend running on http://localhost:${PORT}`);
  console.log(`📁  Uploads  : ${UPLOAD_DIR}`);
  console.log(`📤  Outputs  : ${OUTPUT_DIR}`);
  console.log(`🌐  Frontend : ${ORIGIN}\n`);
});

module.exports = app;
