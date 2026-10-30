// Automatic discrepancy engine: runs on every submission / renewal.
const today = () => new Date().toISOString().slice(0, 10);
const norm = s => String(s || '').trim().toLowerCase();

function check(f, all, file) {
  const d = [];
  const add = (code, severity, msg) => d.push({ code, severity, msg });
  if (!file) add('MISSING_DOC', 'high', 'No FDR document attached.');
  if (!(Number(f.amount) > 0)) add('BAD_AMOUNT', 'high', 'Amount must be greater than zero.');
  const iss = Date.parse(f.issueDate), mat = Date.parse(f.maturityDate);
  if (isNaN(iss) || isNaN(mat)) add('BAD_DATE', 'high', 'Issue or maturity date is not a valid date.');
  else {
    if (mat <= iss) add('IMPOSSIBLE_DATES', 'high', 'Maturity date is not after the issue date.');
    if (f.issueDate > today()) add('FUTURE_ISSUE', 'high', 'Issue date is in the future.');
    if (f.maturityDate < today()) add('ALREADY_MATURED', 'medium', 'FDR has already matured.');
    if ((mat - iss) / 864e5 < 365) add('SHORT_TENURE', 'low', 'Tenure is under one year - confirm it meets AICTE requirements.');
  }
  for (const o of all) {
    if (o.id === f.id || ['REJECTED', 'CLOSED'].includes(o.status)) continue;
    if (norm(o.fdrNumber) === norm(f.fdrNumber) && norm(o.bankName) === norm(f.bankName))
      add('DUPLICATE_FDR', 'high', `Same FDR no. and bank already recorded (${o.id}, ${o.institutionName}).`);
    else if (file && o.file && o.file.sha256 === file.sha256)
      add('DUPLICATE_FILE', 'high', `This exact document is already attached to ${o.id} (${o.institutionName}).`);
  }
  return d;
}
module.exports = { check };
