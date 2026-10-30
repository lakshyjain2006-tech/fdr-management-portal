const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inr = n => '₹' + Number(n).toLocaleString('en-IN');
const dt = s => s ? new Date(s).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '';
const d0 = s => s ? new Date(s + 'T00:00:00').toLocaleDateString('en-IN', { dateStyle: 'medium' }) : '';
let me = null, unread = 0;

const STATUS = {
  PENDING_OFFICER: ['Awaiting officer', 'p-blue'], FLAGGED: ['Flagged', 'p-amber'], OFFICER_VERIFIED: ['Awaiting bank', 'p-blue'], ACTIVE: ['Active', 'p-green'],
  RELEASE_REQUESTED: ['Release requested', 'p-amber'], RELEASE_RECOMMENDED: ['Release recommended', 'p-amber'], CLOSED: ['Closed', 'p-grey'], REJECTED: ['Rejected', 'p-red']
};
const pill = s => { const [t, c] = STATUS[s] || [s, 'p-grey']; return `<span class="pill ${c}">${t}</span>`; };
const bankPill = s => s === 'VERIFIED' ? '<span class="pill p-green">Verified by bank</span>' : s === 'FAILED' ? '<span class="pill p-red">Bank check failed</span>' : '<span class="pill p-grey">Bank check pending</span>';
const dayTxt = n => n == null ? '' : n < 0 ? `<span class="neg">${-n} d overdue</span>` : n <= 30 ? `<b style="color:var(--amber)">${n} d</b>` : `${n} d`;

async function api(p, o = {}) {
  const h = { ...(o.headers || {}) }, t = localStorage.getItem('tok'); if (t) h.Authorization = 'Bearer ' + t;
  let body = o.body; if (body && !(body instanceof FormData) && typeof body === 'object') { h['Content-Type'] = 'application/json'; body = JSON.stringify(body); }
  const r = await fetch('/api' + p, { ...o, headers: h, body });
  if (r.status === 401 && p !== '/auth/login') { logout(); throw new Error('Your session ended. Please sign in again.'); }
  const json = (r.headers.get('content-type') || '').includes('json'); const d = json ? await r.json() : await r.blob();
  if (!r.ok) throw new Error(d.error || 'Request failed'); return d;
}
function toast(m, bad) { const t = $('#toast'); t.textContent = m; t.className = 'show' + (bad ? ' bad' : ''); clearTimeout(toast.t); toast.t = setTimeout(() => t.className = '', 3500); }
function logout() { localStorage.removeItem('tok'); me = null; location.hash = '#/login'; render(); }

// modal form: fields = [{name,label,type,required,options}] -> resolves object or null
function ask(title, fields, okText = 'Save') {
  return new Promise(res => {
    const dlg = $('#dlg'), f = $('#dlgForm');
    f.innerHTML = `<h2>${esc(title)}</h2>` + fields.map(x => `<label for="d_${x.name}">${esc(x.label)}</label>` +
      (x.type === 'textarea' ? `<textarea id="d_${x.name}" name="${x.name}" rows="3" ${x.required ? 'required' : ''}></textarea>` : `<input id="d_${x.name}" name="${x.name}" type="${x.type || 'text'}" ${x.required ? 'required' : ''}>`)).join('') +
      `<div class="row" style="margin-top:1rem;justify-content:flex-end"><button type="button" class="btn sec" id="dCancel">Cancel</button><button class="btn" value="ok">${esc(okText)}</button></div>`;
    let done = false;
    f.onsubmit = e => { e.preventDefault(); if (done) return; done = true; const o = Object.fromEntries(new FormData(f)); dlg.close(); res(o); };
    $('#dCancel').onclick = () => { done = true; dlg.close(); res(null); };
    dlg.oncancel = () => { done = true; res(null); };
    dlg.showModal();
  });
}
async function act(btn, fn, okMsg) {
  btn.disabled = true;
  try { await fn(); if (okMsg) toast(okMsg); await render(); } catch (e) { toast(e.message, true); btn.disabled = false; }
}

// ---------- views
function shell(inner, active) {
  const nav = [['#/dashboard', 'Today', 'dashboard'], ['#/fdrs', me.role === 'institution' ? 'My FDRs' : 'All FDRs', 'fdrs']];
  if (me.role === 'institution') nav.push(['#/new', 'Submit an FDR', 'new']);
  nav.push(['#/alerts', 'Alerts', 'alerts']);
  if (me.role !== 'institution') nav.push(['#/audit', 'Audit trail', 'audit']);
  if (me.role === 'admin') nav.push(['#/admin', 'Admin', 'admin']);
  return `<div class="shell"><aside><div class="brand"><b>FDR Portal</b><span>Security deposits · AICTE</span></div>
  <nav>${nav.map(([h, t, k]) => `<a href="${h}" class="${active === k ? 'on' : ''}">${t}${k === 'alerts' && unread ? `<span class="badge-n">${unread}</span>` : ''}</a>`).join('')}</nav>
  <div class="me"><b>${esc(me.name)}</b><br>${me.role}<br><button id="out">Sign out</button></div></aside><main>${inner}</main></div>`;
}

function loginView() {
  return `<div class="login"><h1>FDR Management Portal</h1><p class="sub">Security deposit / FDR lifecycle, from submission to release.</p>
  <div class="card"><form id="lf"><label for="em">Email</label><input id="em" type="email" required autocomplete="username"><label for="pw">Password</label><input id="pw" type="password" required autocomplete="current-password">
  <button class="btn" style="margin-top:1rem;width:100%">Sign in</button><p class="err" id="le" role="alert"></p></form></div>
  <div class="card" style="margin-top:1rem;background:#fafbfc;border-color:var(--line)">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem">
      <h3 style="margin:0;font-size:.9rem;color:var(--navy)">Quick Test Accounts</h3>
      <span style="font-size:.78rem;background:#e9edf1;padding:.15rem .45rem;border-radius:4px;color:var(--ink)">Password: <b>demo123</b></span>
    </div>
    <p style="font-size:.8rem;color:var(--mute);margin:0 0 .7rem">Click any role below to autofill and test:</p>
    <div style="display:grid;gap:.4rem">
      <button type="button" class="demo-card-btn" data-e="officer@demo.in" style="display:flex;justify-content:space-between;align-items:center;background:#fff;border:1px solid var(--line);border-radius:5px;padding:.5rem .7rem;cursor:pointer;text-align:left">
        <div><b style="font-size:.85rem;color:var(--ink)">AICTE Officer</b><br><span style="font-size:.78rem;color:var(--mute)">officer@demo.in</span></div>
        <span class="pill p-blue" style="font-size:.75rem">Fill &rarr;</span>
      </button>
      <button type="button" class="demo-card-btn" data-e="admin@demo.in" style="display:flex;justify-content:space-between;align-items:center;background:#fff;border:1px solid var(--line);border-radius:5px;padding:.5rem .7rem;cursor:pointer;text-align:left">
        <div><b style="font-size:.85rem;color:var(--ink)">Admin / Authority</b><br><span style="font-size:.78rem;color:var(--mute)">admin@demo.in</span></div>
        <span class="pill p-amber" style="font-size:.75rem">Fill &rarr;</span>
      </button>
      <button type="button" class="demo-card-btn" data-e="bit@demo.in" style="display:flex;justify-content:space-between;align-items:center;background:#fff;border:1px solid var(--line);border-radius:5px;padding:.5rem .7rem;cursor:pointer;text-align:left">
        <div><b style="font-size:.85rem;color:var(--ink)">Institution (BIT)</b><br><span style="font-size:.78rem;color:var(--mute)">bit@demo.in</span></div>
        <span class="pill p-green" style="font-size:.75rem">Fill &rarr;</span>
      </button>
      <button type="button" class="demo-card-btn" data-e="sagar@demo.in" style="display:flex;justify-content:space-between;align-items:center;background:#fff;border:1px solid var(--line);border-radius:5px;padding:.5rem .7rem;cursor:pointer;text-align:left">
        <div><b style="font-size:.85rem;color:var(--ink)">Institution (Sagar)</b><br><span style="font-size:.78rem;color:var(--mute)">sagar@demo.in</span></div>
        <span class="pill p-green" style="font-size:.75rem">Fill &rarr;</span>
      </button>
    </div>
  </div></div>`;
}
function bindLogin() {
  document.querySelectorAll('.demo-card-btn').forEach(b => b.onclick = () => {
    $('#em').value = b.dataset.e;
    $('#pw').value = 'demo123';
    $('#le').textContent = '';
  });
  $('#lf').onsubmit = async e => {
    e.preventDefault();
    try {
      const r = await api('/auth/login', { method: 'POST', body: { email: $('#em').value, password: $('#pw').value } });
      localStorage.setItem('tok', r.token);
      me = r.user;
      location.hash = '#/dashboard';
      render();
    } catch (x) {
      $('#le').textContent = x.message;
    }
  };
}

function fdrTable(list, extra) {
  if (!list.length) return '<div class="empty">Nothing here.</div>';
  return `<div class="tw"><table><thead><tr><th>FDR</th>${me.role !== 'institution' ? '<th>Institution</th>' : ''}<th>Bank</th><th>Amount</th><th>Maturity</th><th>Status</th>${extra ? `<th>${extra.h}</th>` : ''}</tr></thead><tbody>` +
    list.map(f => `<tr class="click" tabindex="0" data-id="${f.id}"><td><b>${esc(f.fdrNumber)}</b><br><span class="hash">${f.id}</span></td>${me.role !== 'institution' ? `<td>${esc(f.institutionName)}</td>` : ''}<td>${esc(f.bankName)}</td><td>${inr(f.amount)}</td><td>${d0(f.maturityDate)}<br>${dayTxt(f.daysLeft)}</td><td>${pill(f.status)}<br>${bankPill(f.bankStatus)}</td>${extra ? `<td>${extra.c(f)}</td>` : ''}</tr>`).join('') + '</tbody></table></div>';
}
function bindRows() { document.querySelectorAll('tr.click').forEach(r => { const go = () => location.hash = '#/fdr/' + r.dataset.id; r.onclick = go; r.onkeydown = e => e.key === 'Enter' && go(); }); }

async function dashboardView() {
  const d = await api('/dashboard');
  const n = d.needsAction;
  return shell(`<div class="head"><div><h1>${n.length ? `${n.length} item${n.length > 1 ? 's' : ''} need${n.length > 1 ? '' : 's'} your action today` : 'Nothing needs your action today'}</h1><p class="sub">Only exceptions are listed here. Everything else is on track.</p></div>${me.role === 'institution' ? '<a class="btn" href="#/new">Submit an FDR</a>' : ''}</div>
  <div class="grid g4"><div class="card"><div class="stat">${d.totals.records}<small>Records</small></div></div><div class="card"><div class="stat">${d.totals.active}<small>Active FDRs</small></div></div>
  <div class="card"><div class="stat">${inr(d.totals.activeAmount)}<small>Held in active FDRs</small></div></div><div class="card"><div class="stat" style="color:${d.overdue.length ? 'var(--red)' : 'var(--navy)'}">${d.overdue.length}<small>Overdue (matured, no action)</small></div></div></div>
  <div class="card"><h2>Needs action</h2>${fdrTable(n, { h: 'Why', c: f => esc(f.why) })}</div>
  <div class="card"><h2>Maturing within 90 days</h2>${fdrTable(d.expiring)}</div>`, 'dashboard');
}

async function listView() {
  const l = await api('/fdrs');
  window.__l = l;
  return shell(`<div class="head"><div><h1>${me.role === 'institution' ? 'My FDRs' : 'All FDRs'}</h1><p class="sub">${l.length} record(s). Select a row to open it.</p></div>
  <div><label for="flt" style="margin:0">Filter by status</label><select id="flt"><option value="">All</option>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}">${v[0]}</option>`).join('')}</select></div></div>
  <div class="card" id="lst">${fdrTable(l)}</div>`, 'fdrs');
}
function bindList(l) { $('#flt').onchange = e => { $('#lst').innerHTML = fdrTable(l.filter(f => !e.target.value || f.status === e.target.value)); bindRows(); }; }

const STEPS = [['Submitted', ['PENDING_OFFICER', 'FLAGGED']], ['Officer verified', ['OFFICER_VERIFIED']], ['Bank confirmed · Active', ['ACTIVE']], ['Release requested', ['RELEASE_REQUESTED']], ['Release approved', ['RELEASE_RECOMMENDED']], ['Closed', ['CLOSED']]];
function lifecycle(s) {
  if (s === 'REJECTED') return '<div class="note">This record was rejected and the lifecycle stopped.</div>';
  const cur = STEPS.findIndex(x => x[1].includes(s));
  return `<div class="life">${STEPS.map((x, i) => `<div class="${i < cur ? 'done' : i === cur ? 'cur' : ''}">${x[0]}</div>`).join('')}</div>`;
}

async function detailView(id) {
  const [f, h] = await Promise.all([api('/fdrs/' + id), api(`/fdrs/${id}/history`)]);
  const staff = me.role !== 'institution', own = me.role === 'institution';
  const b = [];
  if (staff && ['PENDING_OFFICER', 'FLAGGED'].includes(f.status)) b.push(['Verify documents', 'verify', ''], ['Reject', 'reject', 'warn']);
  if (staff && f.status === 'OFFICER_VERIFIED') b.push(['Confirm with bank', 'bank', 'ok'], ['Record manual bank confirmation', 'manual', 'sec']);
  if (staff && f.status === 'RELEASE_REQUESTED') b.push(['Recommend release', 'rel-ok', 'ok'], ['Reject release', 'rel-no', 'warn']);
  if (me.role === 'admin' && f.status === 'RELEASE_RECOMMENDED') b.push(['Give final approval', 'rel-ok', 'ok'], ['Reject release', 'rel-no', 'warn']);
  if (own && f.status === 'ACTIVE') b.push(['Renew / replace', 'renew', 'sec'], ['Request release', 'release', '']);
  const rel = f.release;
  const html = `<p><a href="#/fdrs">← Back to FDRs</a></p><div class="head"><div><h1>${esc(f.fdrNumber)}</h1><p class="sub">${f.id} · ${esc(f.institutionName)}</p></div><div class="row">${b.map(x => `<button class="btn ${x[2]}" data-a="${x[1]}">${x[0]}</button>`).join('')}</div></div>
  ${lifecycle(f.status)}
  <div class="trust"><div class="t-ok"><b>Submitted by institution</b><small>${esc(f.institutionName)} · ${dt(f.createdAt)}</small></div>
  <div class="${f.bankStatus === 'VERIFIED' ? 't-ok' : f.bankStatus === 'FAILED' ? 't-bad' : 't-wait'}"><b>${f.bankStatus === 'VERIFIED' ? 'Verified by bank' : f.bankStatus === 'FAILED' ? 'Bank verification failed' : 'Not yet verified by bank'}</b><small>${f.bankReference ? 'Ref ' + esc(f.bankReference) : 'Claimed by the institution until the bank confirms'}</small></div></div>
  <div class="grid g2" style="margin-top:1rem"><div class="card"><h2>Details</h2><table><tbody>
  <tr><th>Status</th><td>${pill(f.status)} ${dayTxt(f.daysLeft)}</td></tr><tr><th>Bank / branch</th><td>${esc(f.bankName)} ${esc(f.branch)}</td></tr><tr><th>Amount</th><td>${inr(f.amount)}</td></tr>
  <tr><th>Issued</th><td>${d0(f.issueDate)}</td></tr><tr><th>Maturity</th><td>${d0(f.maturityDate)}</td></tr><tr><th>Purpose</th><td>${esc(f.purpose)}</td></tr>
  ${f.officerObservation ? `<tr><th>Officer note</th><td>${esc(f.officerObservation)}</td></tr>` : ''}</tbody></table></div>
  <div class="card"><h2>Document</h2>${f.file ? `<p>${esc(f.file.originalName)} (${Math.round(f.file.size / 1024) || 1} KB)</p><p class="hash">SHA-256 ${f.file.sha256}</p><button class="btn sec" id="openf">Open document (checks hash)</button>` : '<p class="neg">No document attached.</p>'}
  <h2 style="margin-top:1rem">Discrepancies</h2>${f.discrepancies.length ? f.discrepancies.map(d => `<div class="flag ${d.severity}"><b>${esc(d.code.replace(/_/g, ' ').toLowerCase())}</b> · ${esc(d.msg)}</div>`).join('') : '<p class="pos">None found by the automatic checks.</p>'}</div></div>
  ${rel ? `<div class="card"><h2>Release</h2><p>Requested ${dt(rel.requestedAt)}${rel.premature ? ' <span class="pill p-amber">Before maturity</span>' : ''}<br>Reason: ${esc(rel.reason)}</p>${rel.approvals.map(a => `<p>Level ${a.level} approved by ${esc(a.by)} · ${dt(a.at)} ${a.remarks ? '· ' + esc(a.remarks) : ''}</p>`).join('')}${rel.rejected ? `<p class="neg">Rejected by ${esc(rel.rejected.by)}: ${esc(rel.rejected.remarks)}</p>` : ''}</div>` : ''}
  <div class="card"><h2>History (who did what, when)</h2><ul class="tl">${h.map(a => `<li><b>${esc(a.action.replace(/_/g, ' ').toLowerCase())}</b> by ${esc(a.actorName)}<div class="m">${dt(a.at)} · #${a.seq} · hash ${a.hash.slice(0, 12)}…</div>${a.details && (a.details.observation || a.details.remarks || a.details.reason) ? `<div>${esc(a.details.observation || a.details.remarks || a.details.reason)}</div>` : ''}</li>`).join('')}</ul></div>`;
  return { html: shell(html, 'fdrs'), f };
}
function bindDetail(f) {
  const o = $('#openf'); if (o) o.onclick = async () => { try { const bl = await api(`/fdrs/${f.id}/file`); window.open(URL.createObjectURL(bl), '_blank'); } catch (e) { toast(e.message, true); } };
  document.querySelectorAll('[data-a]').forEach(btn => btn.onclick = async () => {
    const a = btn.dataset.a, P = `/fdrs/${f.id}`;
    if (a === 'verify') { const r = await ask('Verify this FDR', [{ name: 'observation', label: 'Observation (required if flagged)', type: 'textarea' }], 'Mark as verified'); if (r) act(btn, () => api(P + '/verify', { method: 'POST', body: { decision: 'approve', observation: r.observation } }), 'Verified by officer'); }
    if (a === 'reject') { const r = await ask('Reject this FDR', [{ name: 'observation', label: 'Reason for rejection', type: 'textarea', required: true }], 'Reject'); if (r) act(btn, () => api(P + '/verify', { method: 'POST', body: { decision: 'reject', observation: r.observation } }), 'Rejected'); }
    if (a === 'bank') act(btn, () => api(P + '/bank-verify', { method: 'POST', body: {} }), 'Bank check complete');
    if (a === 'manual') { const r = await ask('Manual bank confirmation', [{ name: 'manualReference', label: 'Bank letter / reference number', required: true }], 'Confirm'); if (r) act(btn, () => api(P + '/bank-verify', { method: 'POST', body: r }), 'Confirmed manually'); }
    if (a === 'release') { const r = await ask('Request release / refund', [{ name: 'reason', label: 'Reason', type: 'textarea', required: true }], 'Send request'); if (r) act(btn, () => api(P + '/release-request', { method: 'POST', body: r }), 'Release requested'); }
    if (a === 'rel-ok') { const r = await ask('Approve release', [{ name: 'remarks', label: 'Remarks (required for release before maturity)', type: 'textarea' }], 'Approve'); if (r) act(btn, () => api(P + '/release-decision', { method: 'POST', body: { decision: 'approve', remarks: r.remarks } }), 'Approval recorded'); }
    if (a === 'rel-no') { const r = await ask('Reject release', [{ name: 'remarks', label: 'Reason', type: 'textarea', required: true }], 'Reject'); if (r) act(btn, () => api(P + '/release-decision', { method: 'POST', body: { decision: 'reject', remarks: r.remarks } }), 'Release rejected'); }
    if (a === 'renew') location.hash = '#/renew/' + f.id;
  });
}

function formView(f) {
  const renew = !!f; f = f || {};
  return shell(`<p><a href="${renew ? '#/fdr/' + f.id : '#/fdrs'}">← Back</a></p><h1>${renew ? 'Renew or replace ' + esc(f.fdrNumber) : 'Submit an FDR'}</h1>
  <p class="sub">${renew ? 'Enter the new FDR details. The officer and bank will verify them again.' : 'Fill in the FDR details and attach the scanned document (PDF, PNG or JPG, up to 5 MB).'}</p>
  <div class="card"><form id="ff"><div class="f2"><div><label for="fdrNumber">FDR number</label><input id="fdrNumber" name="fdrNumber" required value="${renew ? '' : ''}"></div>
  <div><label for="bankName">Bank</label><input id="bankName" name="bankName" required value="${esc(f.bankName || '')}"></div>
  <div><label for="branch">Branch</label><input id="branch" name="branch" value="${esc(f.branch || '')}"></div>
  <div><label for="amount">Amount (₹)</label><input id="amount" name="amount" type="number" min="1" required value="${f.amount || ''}"></div>
  <div><label for="issueDate">Issue date</label><input id="issueDate" name="issueDate" type="date" required></div>
  <div><label for="maturityDate">Maturity date</label><input id="maturityDate" name="maturityDate" type="date" required></div></div>
  ${renew ? '' : '<label for="purpose">Purpose</label><input id="purpose" name="purpose" value="AICTE security deposit">'}
  <label for="document">FDR document</label><input id="document" name="document" type="file" accept=".pdf,.png,.jpg,.jpeg" ${renew ? 'required' : ''}>
  <div class="row" style="margin-top:1.2rem"><button class="btn">${renew ? 'Submit renewal' : 'Submit FDR'}</button></div><p class="err" id="fe" role="alert"></p></form></div>`, 'new');
}
function bindForm(f) {
  $('#ff').onsubmit = async e => {
    e.preventDefault(); const btn = e.target.querySelector('button'); btn.disabled = true; $('#fe').textContent = '';
    try { const r = await api(f ? `/fdrs/${f.id}/renew` : '/fdrs', { method: 'POST', body: new FormData(e.target) }); toast(f ? 'Renewal submitted' : 'FDR submitted'); location.hash = '#/fdr/' + r.id; }
    catch (x) { $('#fe').textContent = x.message; btn.disabled = false; }
  };
}

async function alertsView() {
  const l = await api('/notifications'); await api('/notifications/read', { method: 'POST' }).catch(() => { }); unread = 0;
  return shell(`<h1>Alerts</h1><p class="sub">Reminders at 90, 60, 30 and 7 days; then escalation to the officer, the senior officer, and the overdue list. Email and SMS are simulated in the server console.</p>
  <div class="card">${l.length ? `<table><tbody>${l.map(n => `<tr class="click" data-id="${n.fdrId}"><td style="width:1%"><span class="pill ${n.level === 'critical' ? 'p-red' : n.level === 'warning' ? 'p-amber' : 'p-blue'}">${n.level}</span></td><td>${esc(n.message)}<br><span class="hash">${dt(n.at)}</span></td></tr>`).join('')}</tbody></table>` : '<div class="empty">No alerts yet.</div>'}</div>`, 'alerts');
}

async function auditView() {
  const r = await api('/audit'), i = r.integrity;
  return shell(`<h1>Audit trail</h1><p class="sub">Append-only. Each entry carries the hash of the one before it, so edits or deletions break the chain.</p>
  <div class="card"><b>Chain integrity:</b> ${i.ok ? `<span class="pos">intact · ${i.count} entries checked</span>` : `<span class="neg">broken at entry #${i.brokenAt}</span>`}</div>
  <div class="card tw"><table><thead><tr><th>#</th><th>When</th><th>Who</th><th>Action</th><th>FDR</th><th>Hash</th></tr></thead><tbody>${r.entries.map(a => `<tr><td>${a.seq}</td><td>${dt(a.at)}</td><td>${esc(a.actorName)}<br><span class="hash">${a.role}</span></td><td>${esc(a.action.replace(/_/g, ' ').toLowerCase())}</td><td>${a.fdrId ? `<a href="#/fdr/${a.fdrId}">${a.fdrId}</a>` : ''}</td><td class="hash">${a.hash.slice(0, 14)}…</td></tr>`).join('')}</tbody></table></div>`, 'audit');
}

async function adminView() {
  const [cfg, users] = await Promise.all([api('/admin/config'), api('/admin/users')]);
  return shell(`<h1>Admin</h1><div class="grid g2"><div class="card"><h2>Alert rules</h2><form id="cf"><label for="ad">Reminder days before maturity (comma separated)</label><input id="ad" value="${cfg.alertDays.join(', ')}">
  <label for="ed">Escalate to officer at (days)</label><input id="ed" type="number" value="${cfg.escalateDays}"><div class="row" style="margin-top:1rem"><button class="btn">Save rules</button><button type="button" class="btn sec" id="runA">Run daily check now</button></div></form></div>
  <div class="card"><h2>Add a user</h2><form id="uf"><label for="un">Name</label><input id="un" required><label for="ue">Email</label><input id="ue" type="email" required><label for="up">Password (8+ characters)</label><input id="up" type="password" minlength="8" required>
  <label for="ur">Role</label><select id="ur"><option value="institution">Institution</option><option value="officer">AICTE officer</option><option value="admin">Admin / Authority</option></select><label for="ui">Institution name (institutions only)</label><input id="ui"><button class="btn" style="margin-top:1rem">Create user</button></form></div></div>
  <div class="card tw"><h2>Users</h2><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Active</th></tr></thead><tbody>${users.map(u => `<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${u.role}</td><td><input type="checkbox" style="width:auto" aria-label="Active" data-u="${u.id}" ${u.active ? 'checked' : ''}></td></tr>`).join('')}</tbody></table></div>`, 'admin');
}
function bindAdmin() {
  $('#cf').onsubmit = async e => { e.preventDefault(); try { await api('/admin/config', { method: 'PUT', body: { alertDays: $('#ad').value.split(',').map(s => s.trim()), escalateDays: $('#ed').value } }); toast('Alert rules saved'); } catch (x) { toast(x.message, true); } };
  $('#runA').onclick = async () => { try { const r = await api('/admin/run-alerts', { method: 'POST' }); toast(`Check done: ${r.sent} alert(s), ${r.escalated} escalation(s)`); } catch (x) { toast(x.message, true); } };
  $('#uf').onsubmit = async e => { e.preventDefault(); try { await api('/admin/users', { method: 'POST', body: { name: $('#un').value, email: $('#ue').value, password: $('#up').value, role: $('#ur').value, institutionName: $('#ui').value } }); toast('User created'); render(); } catch (x) { toast(x.message, true); } };
  document.querySelectorAll('[data-u]').forEach(c => c.onchange = async () => { try { await api(`/admin/users/${c.dataset.u}/active`, { method: 'POST', body: { active: c.checked } }); toast('Updated'); } catch (x) { toast(x.message, true); c.checked = !c.checked; } });
}

// ---------- router
async function render() {
  const app = $('#app'), h = location.hash || '#/dashboard';
  if (!localStorage.getItem('tok')) { app.innerHTML = loginView(); bindLogin(); return; }
  try {
    if (!me) me = await api('/me');
    try { const n = await api('/notifications'); unread = n.filter(x => !x.read).length; } catch { }
    const [, route, arg] = h.split('/');
    if (route === 'login') { location.hash = '#/dashboard'; return; }
    if (route === 'fdrs') { app.innerHTML = await listView(); const l = window.__l; bindList(l); bindRows(); }
    else if (route === 'new' && me.role === 'institution') { app.innerHTML = formView(); bindForm(); }
    else if (route === 'renew') { const f = await api('/fdrs/' + arg); app.innerHTML = formView(f); bindForm(f); }
    else if (route === 'fdr') { const r = await detailView(arg); app.innerHTML = r.html; bindDetail(r.f); }
    else if (route === 'alerts') { app.innerHTML = await alertsView(); bindRows(); }
    else if (route === 'audit' && me.role !== 'institution') app.innerHTML = await auditView();
    else if (route === 'admin' && me.role === 'admin') { app.innerHTML = await adminView(); bindAdmin(); }
    else { app.innerHTML = await dashboardView(); bindRows(); }
    const o = $('#out'); if (o) o.onclick = logout;
    window.scrollTo(0, 0);
  } catch (e) { if (localStorage.getItem('tok')) { app.innerHTML = shell(`<div class="card"><h2>Something went wrong</h2><p class="err">${esc(e.message)}</p><a class="btn" href="#/dashboard">Go to Today</a></div>`, ''); const o = $('#out'); if (o) o.onclick = logout; } }
}
window.addEventListener('hashchange', render);
render();
