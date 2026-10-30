const fs = require('fs'), path = require('path'), store = require('./store');
try { fs.unlinkSync(store.FILE); } catch {}
const up = path.join(__dirname, '..', 'uploads');
if (fs.existsSync(up)) for (const f of fs.readdirSync(up)) if (f.startsWith('doc-')) fs.unlinkSync(path.join(up, f));
store.load(); require('./seed').seed(); console.log('Database reset.');
