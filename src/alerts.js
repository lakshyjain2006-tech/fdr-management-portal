// Daily maturity check: 90/60/30/7-day reminders -> officer escalation (<=30d) -> senior officer (<=7d) -> overdue list.
const store = require('./store'), audit = require('./audit');
const DAY = 864e5;
function daysLeft(date, now = new Date()) {
  const a = Date.parse(date + 'T00:00:00Z');
  const b = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((a - b) / DAY);
}
function notify(n) {
  const db = store.db;
  db.notifications.push({ id: 'N-' + (db.notifications.length + 1), at: new Date().toISOString(), read: false, ...n });
  console.log(`[notify -> ${n.userId || n.role}] ${n.message}`); // stands in for Email / SMS gateway
}
function run(now = new Date()) {
  const { fdrs, config } = store.db; let sent = 0, escalated = 0;
  for (const f of fdrs) {
    if (f.status !== 'ACTIVE') continue;
    const d = daysLeft(f.maturityDate, now);
    f.alertsSent = f.alertsSent || []; f.escalations = f.escalations || [];
    const when = d >= 0 ? `matures in ${d} day(s)` : `matured ${-d} day(s) ago`;
    const crossed = config.alertDays.filter(t => d <= t && !f.alertsSent.includes(t)).sort((a, b) => a - b);
    if (crossed.length) {
      f.alertsSent.push(...crossed);
      notify({ userId: f.institutionId, fdrId: f.id, level: crossed[0] <= 7 ? 'critical' : crossed[0] <= 30 ? 'warning' : 'info',
        message: `FDR ${f.fdrNumber} (${f.bankName}) ${when}. Renew it or request release.` });
      audit.log(null, 'ALERT_SENT', f.id, { threshold: crossed[0], daysLeft: d, channels: ['in-app', 'email (mock)'] }); sent++;
    }
    const esc = (key, role, label) => {
      if (f.escalations.includes(key)) return;
      f.escalations.push(key);
      notify({ role, fdrId: f.id, level: 'critical', message: `${label}: ${f.institutionName} - FDR ${f.fdrNumber} ${when} with no action taken.` });
      audit.log(null, 'ESCALATED', f.id, { to: role, level: key, daysLeft: d }); escalated++;
    };
    if (d <= config.escalateDays) esc('OFFICER', 'officer', 'Escalation');
    if (d <= 7) esc('SENIOR', 'admin', 'Senior escalation');
    if (d < 0) esc('OVERDUE', 'officer', 'Overdue');
  }
  store.save();
  return { sent, escalated };
}
module.exports = { run, daysLeft, notify };
