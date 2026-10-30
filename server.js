const express = require('express'), path = require('path'), fs = require('fs'), crypto = require('crypto');
const jwt = require('jsonwebtoken'), bcrypt = require('bcryptjs'), multer = require('multer');
try { for (const l of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; } } catch {}
const store = require('./src/store'), audit = require('./src/audit'), { check } = require('./src/discrepancy');
const bank = require('./src/bank'), alerts = require('./src/alerts');
store.load(); require('./src/seed').seed();

const PORT = process.env.PORT || 3000, SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const UP = store.UPLOAD_DIR; try { fs.mkdirSync(UP, { recursive: true }); } catch {}
const app = express(); app.use(express.json());
const db = () => store.db;
const fail = (s, m) => { const e = new Error(m); e.status = s; throw e; };
const wrap = fn => async (req, res, next) => { try { await fn(req, res); } catch (e) { next(e); } };
const uid = p => p + '-' + crypto.randomBytes(4).toString('hex');
const roleIs = (...r) => (req, res, next) => r.includes(req.user.role) ? next() : res.status(403).json({ error: 'Your role is not permitted to do this.' });

function auth(req, res, next) {
  const h = req.headers.authorization || '';
  try {
    const p = jwt.verify(h.startsWith('Bearer ') ? h.slice(7) : '', SECRET);
    const u = db().users.find(x => x.id === p.id && x.active !== false);
    if (!u) throw new Error('no user');
    req.user = u; next();
  } catch { res.status(401).json({ error: 'Please sign in again.' }); }
}
const pub = f => { const { file, ...r } = f; return { ...r, file: file ? { originalName: file.originalName, size: file.size, sha256: file.sha256 } : null, daysLeft: f.status === 'ACTIVE' ? alerts.daysLeft(f.maturityDate) : null }; };
const getFdr = (req) => {
  const f = db().fdrs.find(x => x.id === req.params.id);
  if (!f) fail(404, 'FDR not found.');
  if (req.user.role === 'institution' && f.institutionId !== req.user.id) fail(403, 'This FDR belongs to another institution.');
  return f;
};

// ---- uploads: type whitelist, magic-byte check, SHA-256 fingerprint
const upload = multer({
  storage: multer.diskStorage({ destination: UP, filename: (r, f, cb) => cb(null, uid('doc') + path.extname(f.originalname).toLowerCase()) }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (r, f, cb) => /\.(pdf|png|jpe?g)$/i.test(f.originalname) ? cb(null, true) : cb(Object.assign(new Error('Only PDF, PNG or JPG files are allowed.'), { status: 400 }))
});
function fingerprint(file) {
  if (!file) return null;
  const buf = fs.readFileSync(file.path);
  const ok = buf.slice(0, 4).toString() === '%PDF' || buf.slice(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])) || buf.slice(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
  if (!ok) { fs.unlinkSync(file.path); fail(400, 'File content does not match a PDF/PNG/JPG - upload rejected.'); }
  return { originalName: file.originalname, storedName: file.filename, size: file.size, mime: file.mimetype, sha256: audit.sha(buf) };
}
const needFields = (b, keys) => { for (const k of keys) if (!String(b[k] ?? '').trim()) fail(400, `Please fill in "${k}".`); };

// ---- auth
app.post('/api/auth/login', wrap(async (req, res) => {
  const { email, password } = req.body || {};
  const u = db().users.find(x => x.email.toLowerCase() === String(email || '').toLowerCase() && x.active !== false);
  if (!u || !bcrypt.compareSync(String(password || ''), u.passwordHash)) { audit.log(null, 'LOGIN_FAILED', null, { email }); fail(401, 'Email or password is incorrect.'); }
  audit.log(u, 'LOGIN', null, {});
  res.json({ token: jwt.sign({ id: u.id, role: u.role }, SECRET, { expiresIn: '8h' }), user: { id: u.id, name: u.name, role: u.role, institutionName: u.institutionName } });
}));
app.use('/api', (req, res, next) => req.path === '/auth/login' ? next() : auth(req, res, next));
app.get('/api/me', (req, res) => { const u = req.user; res.json({ id: u.id, name: u.name, role: u.role, institutionName: u.institutionName }); });

// ---- FDR lifecycle
app.get('/api/fdrs', (req, res) => {
  let l = db().fdrs; if (req.user.role === 'institution') l = l.filter(f => f.institutionId === req.user.id);
  res.json(l.map(pub).reverse());
});
app.get('/api/fdrs/:id', wrap((req, res) => res.json(pub(getFdr(req)))));
app.get('/api/fdrs/:id/history', wrap((req, res) => { const f = getFdr(req); res.json(db().audit.filter(a => a.fdrId === f.id)); }));
app.get('/api/fdrs/:id/file', wrap((req, res) => {
  const f = getFdr(req); if (!f.file) fail(404, 'No document attached.');
  let p = path.join(UP, f.file.storedName);
  if (!fs.existsSync(p)) {
    const fallback = path.join(__dirname, 'uploads', f.file.storedName);
    if (fs.existsSync(fallback)) p = fallback;
    else fail(404, 'Stored file is missing.');
  }
  if (audit.sha(fs.readFileSync(p)) !== f.file.sha256) { audit.log(req.user, 'FILE_TAMPER_DETECTED', f.id, {}); fail(409, 'Integrity check failed: file hash does not match the hash recorded at upload.'); }
  res.setHeader('Content-Disposition', `inline; filename="${f.file.originalName.replace(/"/g, '')}"`);
  res.type(f.file.mime || 'application/octet-stream').sendFile(p);
}));

app.post('/api/fdrs', roleIs('institution'), upload.single('document'), wrap((req, res) => {
  const b = req.body; needFields(b, ['fdrNumber', 'bankName', 'amount', 'issueDate', 'maturityDate']);
  const file = fingerprint(req.file);
  const f = { id: 'FDR-' + String(db().fdrs.length + 1).padStart(4, '0'), institutionId: req.user.id, institutionName: req.user.institutionName,
    fdrNumber: b.fdrNumber.trim(), bankName: b.bankName.trim(), branch: (b.branch || '').trim(), amount: Number(b.amount), issueDate: b.issueDate, maturityDate: b.maturityDate,
    purpose: (b.purpose || 'AICTE security deposit').trim(), bankStatus: 'PENDING', bankReference: null, file, alertsSent: [], escalations: [], createdAt: new Date().toISOString() };
  f.discrepancies = check(f, db().fdrs, file);
  const dup = f.discrepancies.find(d => d.code === 'DUPLICATE_FDR');
  if (dup) { if (req.file) fs.unlinkSync(req.file.path); audit.log(req.user, 'DUPLICATE_BLOCKED', null, { fdrNumber: f.fdrNumber, bankName: f.bankName }); fail(409, dup.msg + ' Submission blocked.'); }
  f.status = f.discrepancies.some(d => d.severity === 'high') ? 'FLAGGED' : 'PENDING_OFFICER';
  db().fdrs.push(f);
  audit.log(req.user, 'FDR_SUBMITTED', f.id, { fdrNumber: f.fdrNumber, bankName: f.bankName, amount: f.amount, sha256: file && file.sha256 });
  if (f.discrepancies.length) audit.log(null, 'DISCREPANCIES_FLAGGED', f.id, { codes: f.discrepancies.map(d => d.code) });
  alerts.notify({ role: 'officer', fdrId: f.id, level: f.status === 'FLAGGED' ? 'warning' : 'info', message: `New FDR ${f.fdrNumber} from ${f.institutionName} awaits verification${f.status === 'FLAGGED' ? ' (flagged)' : ''}.` });
  store.save(); res.status(201).json(pub(f));
}));

app.post('/api/fdrs/:id/verify', roleIs('officer', 'admin'), wrap((req, res) => {
  const f = getFdr(req); const { decision, observation } = req.body || {};
  if (!['PENDING_OFFICER', 'FLAGGED'].includes(f.status)) fail(409, `Cannot verify an FDR in status ${f.status}.`);
  if (!['approve', 'reject'].includes(decision)) fail(400, 'Decision must be approve or reject.');
  if ((decision === 'reject' || f.discrepancies.some(d => d.severity === 'high')) && !String(observation || '').trim()) fail(400, 'Please record an observation - this record has high-severity flags or is being rejected.');
  f.status = decision === 'approve' ? 'OFFICER_VERIFIED' : 'REJECTED';
  f.officerObservation = observation || '';
  audit.log(req.user, decision === 'approve' ? 'OFFICER_VERIFIED' : 'OFFICER_REJECTED', f.id, { observation });
  alerts.notify({ userId: f.institutionId, fdrId: f.id, level: decision === 'approve' ? 'info' : 'warning', message: `FDR ${f.fdrNumber} was ${decision === 'approve' ? 'verified by the AICTE officer; bank confirmation is next' : 'rejected: ' + observation}.` });
  store.save(); res.json(pub(f));
}));

app.post('/api/fdrs/:id/bank-verify', roleIs('officer', 'admin'), wrap(async (req, res) => {
  const f = getFdr(req); const { manualReference } = req.body || {};
  if (f.status !== 'OFFICER_VERIFIED') fail(409, 'Bank confirmation happens after officer verification.');
  let r;
  if (manualReference) r = { verified: true, reference: String(manualReference).trim(), reason: 'Manually confirmed by officer.', manual: true };
  else r = await bank.verify(f);
  if (r.verified) { f.status = 'ACTIVE'; f.bankStatus = 'VERIFIED'; f.bankReference = r.reference; f.bankVerifiedAt = new Date().toISOString(); f.alertsSent = []; f.escalations = []; }
  else { f.status = 'FLAGGED'; f.bankStatus = 'FAILED'; f.discrepancies.push({ code: 'BANK_MISMATCH', severity: 'high', msg: r.reason }); }
  audit.log(req.user, r.verified ? 'BANK_VERIFIED' : 'BANK_VERIFICATION_FAILED', f.id, { adapter: r.manual ? 'manual' : bank.name, reference: r.reference, reason: r.reason });
  alerts.notify({ userId: f.institutionId, fdrId: f.id, level: r.verified ? 'info' : 'critical', message: r.verified ? `FDR ${f.fdrNumber} is now Verified by bank and ACTIVE.` : `Bank verification failed for FDR ${f.fdrNumber}: ${r.reason}` });
  if (r.verified) alerts.run();
  store.save(); res.json(pub(f));
}));

app.post('/api/fdrs/:id/renew', roleIs('institution'), upload.single('document'), wrap((req, res) => {
  const f = getFdr(req); if (f.status !== 'ACTIVE') fail(409, 'Only ACTIVE FDRs can be renewed or replaced.');
  const b = req.body; needFields(b, ['fdrNumber', 'bankName', 'issueDate', 'maturityDate', 'amount']);
  const file = fingerprint(req.file);
  const prev = { fdrNumber: f.fdrNumber, bankName: f.bankName, amount: f.amount, issueDate: f.issueDate, maturityDate: f.maturityDate, sha256: f.file && f.file.sha256 };
  const draft = { ...f, fdrNumber: b.fdrNumber.trim(), bankName: b.bankName.trim(), amount: Number(b.amount), issueDate: b.issueDate, maturityDate: b.maturityDate };
  const flags = check(draft, db().fdrs, file);
  if (!file) { const i = flags.findIndex(d => d.code === 'MISSING_DOC'); if (i >= 0) flags.splice(i, 1, { code: 'MISSING_DOC', severity: 'high', msg: 'Renewal needs the new FDR document.' }); }
  const dup = flags.find(d => d.code === 'DUPLICATE_FDR'); if (dup) { if (req.file) fs.unlinkSync(req.file.path); fail(409, dup.msg); }
  Object.assign(f, { fdrNumber: draft.fdrNumber, bankName: draft.bankName, amount: draft.amount, issueDate: draft.issueDate, maturityDate: draft.maturityDate, file: file || f.file });
  f.renewals = [...(f.renewals || []), { at: new Date().toISOString(), previous: prev }];
  f.discrepancies = flags; f.bankStatus = 'PENDING'; f.bankReference = null; f.alertsSent = []; f.escalations = [];
  f.status = flags.some(d => d.severity === 'high') ? 'FLAGGED' : 'PENDING_OFFICER';
  audit.log(req.user, 'FDR_RENEWED', f.id, { previous: prev, new: { fdrNumber: f.fdrNumber, maturityDate: f.maturityDate, amount: f.amount, sha256: f.file && f.file.sha256 } });
  alerts.notify({ role: 'officer', fdrId: f.id, level: 'info', message: `Renewal/replacement for ${f.id} (${f.institutionName}) awaits re-verification.` });
  store.save(); res.json(pub(f));
}));

app.post('/api/fdrs/:id/release-request', roleIs('institution'), wrap((req, res) => {
  const f = getFdr(req); if (f.status !== 'ACTIVE') fail(409, 'Only ACTIVE FDRs can be released.');
  const reason = String((req.body || {}).reason || '').trim(); if (!reason) fail(400, 'Please give a reason for the release request.');
  const matured = f.maturityDate <= new Date().toISOString().slice(0, 10);
  f.status = 'RELEASE_REQUESTED'; f.release = { reason, requestedAt: new Date().toISOString(), premature: !matured, approvals: [] };
  audit.log(req.user, 'RELEASE_REQUESTED', f.id, { reason, premature: !matured });
  alerts.notify({ role: 'officer', fdrId: f.id, level: matured ? 'info' : 'warning', message: `Release requested for ${f.fdrNumber} by ${f.institutionName}${matured ? '' : ' - PREMATURE (before maturity)'}.` });
  store.save(); res.json(pub(f));
}));

app.post('/api/fdrs/:id/release-decision', roleIs('officer', 'admin'), wrap((req, res) => {
  const f = getFdr(req); const { decision, remarks } = req.body || {};
  if (!['approve', 'reject'].includes(decision)) fail(400, 'Decision must be approve or reject.');
  if (decision === 'reject' && !String(remarks || '').trim()) fail(400, 'Please give a reason for rejecting.');
  if (f.status === 'RELEASE_REQUESTED') {                                       // level 1: officer recommends
    if (decision === 'approve') { f.status = 'RELEASE_RECOMMENDED'; f.release.approvals.push({ level: 1, by: req.user.name, at: new Date().toISOString(), remarks }); }
  } else if (f.status === 'RELEASE_RECOMMENDED') {                              // level 2: authority signs off
    if (req.user.role !== 'admin') fail(403, 'Final sign-off is reserved for the Authority.');
    if (decision === 'approve') {
      if (f.release.premature && !String(remarks || '').trim()) fail(400, 'Premature release needs written remarks from the Authority.');
      f.status = 'CLOSED'; f.release.approvals.push({ level: 2, by: req.user.name, at: new Date().toISOString(), remarks }); f.closedAt = new Date().toISOString();
    }
  } else fail(409, 'No release request is waiting for a decision.');
  if (decision === 'reject') { f.status = 'ACTIVE'; f.release.rejected = { by: req.user.name, remarks, at: new Date().toISOString() }; }
  audit.log(req.user, decision === 'approve' ? (f.status === 'CLOSED' ? 'RELEASE_APPROVED_FINAL' : 'RELEASE_RECOMMENDED') : 'RELEASE_REJECTED', f.id, { remarks });
  alerts.notify({ userId: f.institutionId, fdrId: f.id, level: 'info', message: `Release of ${f.fdrNumber}: ${f.status === 'CLOSED' ? 'approved - FDR closed / refund released' : f.status === 'ACTIVE' ? 'rejected - ' + remarks : 'recommended by officer, awaiting final approval'}.` });
  if (f.status === 'RELEASE_RECOMMENDED') alerts.notify({ role: 'admin', fdrId: f.id, level: 'info', message: `Release of ${f.fdrNumber} (${f.institutionName}) awaits your final approval.` });
  store.save(); res.json(pub(f));
}));

// ---- exception-first dashboard
app.get('/api/dashboard', (req, res) => {
  const u = req.user; const all = db().fdrs.filter(f => u.role !== 'institution' || f.institutionId === u.id);
  const by = fn => all.filter(fn).map(pub);
  const active = all.filter(f => f.status === 'ACTIVE');
  const out = {
    role: u.role,
    totals: { records: all.length, active: active.length, activeAmount: active.reduce((s, f) => s + f.amount, 0), closed: all.filter(f => f.status === 'CLOSED').length },
    expiring: by(f => f.status === 'ACTIVE' && alerts.daysLeft(f.maturityDate) >= 0 && alerts.daysLeft(f.maturityDate) <= 90).sort((a, b) => a.daysLeft - b.daysLeft),
    overdue: by(f => f.status === 'ACTIVE' && alerts.daysLeft(f.maturityDate) < 0)
  };
  if (u.role === 'institution') {
    out.needsAction = [...by(f => f.status === 'REJECTED' || f.status === 'FLAGGED').map(f => ({ ...f, why: f.status === 'REJECTED' ? 'Rejected - see officer observation' : 'Flagged - waiting on officer' })),
      ...out.overdue.map(f => ({ ...f, why: 'Matured - renew or request release' }))];
  } else {
    out.needsAction = [
      ...by(f => ['PENDING_OFFICER', 'FLAGGED'].includes(f.status)).map(f => ({ ...f, why: f.status === 'FLAGGED' ? 'Flagged - review discrepancies' : 'Awaiting verification' })),
      ...by(f => f.status === 'OFFICER_VERIFIED').map(f => ({ ...f, why: 'Awaiting bank confirmation' })),
      ...by(f => f.status === 'RELEASE_REQUESTED').map(f => ({ ...f, why: f.release.premature ? 'Premature release - recommend?' : 'Release - recommend?' })),
      ...(u.role === 'admin' ? by(f => f.status === 'RELEASE_RECOMMENDED').map(f => ({ ...f, why: 'Final release sign-off' })) : []),
      ...out.overdue.map(f => ({ ...f, why: 'OVERDUE - no action taken' }))
    ];
  }
  res.json(out);
});

app.get('/api/notifications', (req, res) => {
  const u = req.user; const l = db().notifications.filter(n => n.userId === u.id || n.role === u.role || (u.role === 'admin' && n.role === 'officer' && false));
  res.json(l.slice(-100).reverse());
});
app.post('/api/notifications/read', (req, res) => { for (const n of db().notifications) if (n.userId === req.user.id || n.role === req.user.role) n.read = true; store.save(); res.json({ ok: true }); });

// ---- audit & admin
app.get('/api/audit', roleIs('officer', 'admin'), (req, res) => res.json({ entries: db().audit.slice(-300).reverse(), integrity: audit.verify() }));
app.get('/api/admin/config', roleIs('admin'), (req, res) => res.json(db().config));
app.put('/api/admin/config', roleIs('admin'), wrap((req, res) => {
  const days = (req.body.alertDays || []).map(Number).filter(n => n > 0).sort((a, b) => b - a);
  if (!days.length) fail(400, 'Give at least one alert day, e.g. 90,60,30,7.');
  db().config = { alertDays: days, escalateDays: Number(req.body.escalateDays) || 30 };
  audit.log(req.user, 'ALERT_RULES_CHANGED', null, db().config); res.json(db().config);
}));
app.post('/api/admin/run-alerts', roleIs('admin'), (req, res) => { const r = alerts.run(); audit.log(req.user, 'ALERT_JOB_RUN_MANUAL', null, r); res.json(r); });
app.get('/api/admin/users', roleIs('admin'), (req, res) => res.json(db().users.map(({ passwordHash, ...u }) => u)));
app.post('/api/admin/users', roleIs('admin'), wrap((req, res) => {
  const b = req.body || {}; needFields(b, ['name', 'email', 'password', 'role']);
  if (!['institution', 'officer', 'admin'].includes(b.role)) fail(400, 'Role must be institution, officer or admin.');
  if (b.role === 'institution') needFields(b, ['institutionName']);
  if (String(b.password).length < 8) fail(400, 'Password must be at least 8 characters.');
  if (db().users.some(u => u.email.toLowerCase() === b.email.toLowerCase())) fail(409, 'A user with this email already exists.');
  const u = { id: uid('U'), name: b.name, email: b.email, role: b.role, institutionName: b.institutionName, active: true, passwordHash: bcrypt.hashSync(b.password, 10) };
  db().users.push(u); audit.log(req.user, 'USER_CREATED', null, { email: u.email, role: u.role }); const { passwordHash, ...r } = u; res.status(201).json(r);
}));
app.post('/api/admin/users/:id/active', roleIs('admin'), wrap((req, res) => {
  const u = db().users.find(x => x.id === req.params.id); if (!u) fail(404, 'User not found.'); if (u.id === req.user.id) fail(400, 'You cannot deactivate yourself.');
  u.active = !!req.body.active; audit.log(req.user, u.active ? 'USER_ENABLED' : 'USER_DISABLED', null, { email: u.email }); store.save(); res.json({ ok: true });
}));
// There is intentionally NO delete endpoint for FDRs or audit entries.

app.use(express.static(path.join(__dirname, 'public')));
app.use((err, req, res, next) => { if (err.status !== 400 && err.status !== 409 && err.status !== 403 && err.status !== 404 && err.status !== 401) console.error(err); res.status(err.status || (err.code === 'LIMIT_FILE_SIZE' ? 400 : 500)).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'File is larger than 5 MB.' : err.message }); });

if (require.main === module) {
  alerts.run(); setInterval(() => alerts.run(), 24 * 3600 * 1000);   // daily maturity job
  app.listen(PORT, () => console.log(`FDR Management Portal running at http://localhost:${PORT}`));
}
module.exports = app;
