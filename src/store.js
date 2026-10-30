// Tiny JSON-file datastore (prototype). Swap for MongoDB in production - all access is via store.db / store.save().
const fs = require('fs'), path = require('path');
const FILE = path.join(__dirname, '..', 'data', 'db.json');
let db = { users: [], fdrs: [], audit: [], notifications: [], config: { alertDays: [90, 60, 30, 7], escalateDays: 30 } };
function load() {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  if (fs.existsSync(FILE)) db = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  return db;
}
function save() {
  fs.writeFileSync(FILE + '.tmp', JSON.stringify(db, null, 2));
  fs.renameSync(FILE + '.tmp', FILE);
}
module.exports = { get db() { return db; }, load, save, FILE };
