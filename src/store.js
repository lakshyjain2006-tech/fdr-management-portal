// Centralized datastore abstraction.
// In cloud/serverless environments (like Vercel / AWS Lambda), the deployment root is read-only.
// We dynamically use os.tmpdir() so writes to db.json succeed without EROFS errors.
const fs = require('fs'), path = require('path'), os = require('os');

const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const DATA_DIR = isServerless ? path.join(os.tmpdir(), 'fdr-data') : path.join(__dirname, '..', 'data');
const UPLOAD_DIR = isServerless ? path.join(os.tmpdir(), 'fdr-uploads') : path.join(__dirname, '..', 'uploads');
const FILE = path.join(DATA_DIR, 'db.json');
const BUNDLED_FILE = path.join(__dirname, '..', 'data', 'db.json');

let db = { users: [], fdrs: [], audit: [], notifications: [], config: { alertDays: [90, 60, 30, 7], escalateDays: 30 } };

function load() {
  try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); } catch {}

  if (isServerless && !fs.existsSync(FILE) && fs.existsSync(BUNDLED_FILE)) {
    try {
      fs.copyFileSync(BUNDLED_FILE, FILE);
    } catch (e) {
      console.warn('Could not copy bundled db.json to tmp:', e.message);
    }
  }

  if (fs.existsSync(FILE)) {
    try {
      db = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    } catch {}
  } else if (fs.existsSync(BUNDLED_FILE)) {
    try {
      db = JSON.parse(fs.readFileSync(BUNDLED_FILE, 'utf8'));
    } catch {}
  }
  return db;
}

function save() {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(db));
  } catch (err) {
    console.warn('Notice: Could not persist to disk (' + err.message + '). Data remains in memory.');
  }
}

module.exports = { get db() { return db; }, load, save, FILE, UPLOAD_DIR, isServerless };

