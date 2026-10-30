// Demo data. Passwords for all demo users: demo123
const bcrypt = require('bcryptjs'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const store = require('./store'), audit = require('./audit');
const UP = path.join(__dirname, '..', 'uploads');
const day = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

function samplePdf(text) {
  const body = `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 400 200]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n4 0 obj<</Length 60>>stream\nBT /F1 14 Tf 20 100 Td (${text}) Tj ET\nendstream endobj\n5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF`;
  const name = 'doc-' + crypto.randomBytes(4).toString('hex') + '.pdf';
  fs.mkdirSync(UP, { recursive: true });
  fs.writeFileSync(path.join(UP, name), body);
  return { originalName: 'FDR-scan.pdf', storedName: name, size: body.length, mime: 'application/pdf', sha256: crypto.createHash('sha256').update(body).digest('hex') };
}

function seed() {
  const db = store.db; if (db.users.length) return;
  const mk = (id, name, email, role, institutionName) => db.users.push({ id, name, email, role, institutionName, active: true, passwordHash: bcrypt.hashSync('demo123', 8) });
  mk('U-admin', 'Dr. Meera Iyer (Authority)', 'admin@demo.in', 'admin');
  mk('U-officer', 'Rahul Verma (AICTE Officer)', 'officer@demo.in', 'officer');
  mk('U-inst1', 'Registrar, Bhopal Institute of Technology', 'bit@demo.in', 'institution', 'Bhopal Institute of Technology');
  mk('U-inst2', 'Registrar, Sagar College of Engineering', 'sagar@demo.in', 'institution', 'Sagar College of Engineering');
  store.save();
  const [, officer, u1, u2] = db.users;
  const add = (u, fdrNumber, bank, amount, issue, mat, status, extra = {}) => {
    const f = { id: 'FDR-' + String(db.fdrs.length + 1).padStart(4, '0'), institutionId: u.id, institutionName: u.institutionName, fdrNumber, bankName: bank, branch: 'Main Branch',
      amount, issueDate: day(issue), maturityDate: day(mat), purpose: 'AICTE security deposit', status, bankStatus: status === 'ACTIVE' ? 'VERIFIED' : 'PENDING',
      bankReference: status === 'ACTIVE' ? 'MOCK-SEED' : null, file: samplePdf(fdrNumber), discrepancies: [], alertsSent: [], escalations: [], createdAt: new Date().toISOString(), ...extra };
    db.fdrs.push(f);
    audit.log(u, 'FDR_SUBMITTED', f.id, { fdrNumber, bankName: bank, amount, sha256: f.file.sha256 });
    if (status === 'ACTIVE') { audit.log(officer, 'OFFICER_VERIFIED', f.id, { observation: 'Documents in order.' }); audit.log(officer, 'BANK_VERIFIED', f.id, { reference: 'MOCK-SEED' }); }
    return f;
  };
  add(u1, 'SBI/BPL/2024/118842', 'State Bank of India', 2000000, -640, 85, 'ACTIVE');
  add(u1, 'PNB/BPL/2023/550931', 'Punjab National Bank', 1500000, -700, 25, 'ACTIVE');
  add(u1, 'HDFC/BPL/2022/771204', 'HDFC Bank', 3000000, -1090, 5, 'ACTIVE');
  add(u2, 'BOI/SGR/2022/230017', 'Bank of India', 1000000, -1100, -3, 'ACTIVE');
  add(u2, 'CBI/SGR/2024/660245', 'Central Bank of India', 2500000, -90, 640, 'ACTIVE');
  add(u2, 'SBI/SGR/2025/990871', 'State Bank of India', 1800000, -20, 700, 'PENDING_OFFICER');
  add(u1, 'FAKE/BPL/2025/000001', 'Union Bank of India', 500000, -10, 400, 'FLAGGED', {
    discrepancies: [{ code: 'DEMO', severity: 'medium', msg: 'Demo record: the "FAKE" number will fail bank verification.' }] });
  store.save();
  console.log('Seeded demo data. Demo password for all users: demo123');
}
module.exports = { seed };
