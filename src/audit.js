// Append-only, hash-chained audit log. Every entry stores the hash of the previous one,
// so any edit or deletion of history is detectable via verify().
const crypto = require('crypto');
const store = require('./store');
const sha = s => crypto.createHash('sha256').update(s).digest('hex');

function log(actor, action, fdrId, details) {
  const a = store.db.audit;
  const e = {
    seq: a.length + 1, at: new Date().toISOString(),
    actorId: actor ? actor.id : 'system', actorName: actor ? actor.name : 'System', role: actor ? actor.role : 'system',
    action, fdrId: fdrId || null, details: details || {}, prevHash: a.length ? a[a.length - 1].hash : 'GENESIS'
  };
  e.hash = sha(JSON.stringify(e));
  a.push(e);
  store.save();
  return e;
}
function verify() {
  let prev = 'GENESIS';
  for (const e of store.db.audit) {
    const { hash, ...rest } = e;
    if (rest.prevHash !== prev || sha(JSON.stringify(rest)) !== hash) return { ok: false, brokenAt: e.seq, count: store.db.audit.length };
    prev = hash;
  }
  return { ok: true, count: store.db.audit.length };
}
module.exports = { log, verify, sha };
