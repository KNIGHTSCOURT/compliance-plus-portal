'use strict';

/* Compliance Plus — sign-in screens, account page and login management. */

function authShell(inner) {
  document.body.classList.add('auth-mode');
  let el = $('#authScreen');
  if (!el) { el = document.createElement('div'); el.id = 'authScreen'; document.body.appendChild(el); }
  el.innerHTML = `<div class="auth-card">
    <div class="auth-brand"><img src="icon.svg" alt=""><div><div class="auth-name">${esc(Store.settings.businessName)}</div><div class="small muted">Inspection Portal</div></div></div>
    ${inner}</div>`;
  return el;
}
function hideAuth() { document.body.classList.remove('auth-mode'); const el = $('#authScreen'); if (el) el.remove(); }
function authMsg(el, text, ok) { const m = $('.auth-msg', el); m.textContent = text; m.className = 'auth-msg ' + (ok ? 'ok' : 'err'); }

function busyButton(btn, label, fn) {
  return async () => {
    const old = btn.textContent;
    btn.disabled = true; btn.textContent = label;
    try { await fn(); } finally { btn.disabled = false; btn.textContent = old; }
  };
}

function showLogin(message) {
  const el = authShell(`<h2>Sign In</h2>
    <form id="loginForm">
      ${field('Email', 'email', '', { type: 'email', attrs: 'autocomplete="username" required' })}
      ${field('Password', 'password', '', { type: 'password', attrs: 'autocomplete="current-password" required' })}
      <div class="auth-msg"></div>
      <button class="btn primary" style="width:100%;justify-content:center">Sign In</button>
    </form>
    <div class="spread small mt"><a href="#" id="forgotLink">Forgotten Password?</a><a href="#" id="signupLink">First Time Here? (Staff)</a></div>`);
  if (message) authMsg(el, message, false);
  const form = $('#loginForm', el);
  form.onsubmit = e => {
    e.preventDefault();
    const v = formValues(form);
    busyButton($('button', form), 'Signing In…', async () => {
      try { await Cloud.signIn(v.email, v.password); await afterSignIn(); }
      catch (err) { authMsg(el, /invalid/i.test(err.message) ? 'Email or password not recognised.' : err.message, false); }
    })();
  };
  $('#forgotLink', el).onclick = e => { e.preventDefault(); showForgot(); };
  $('#signupLink', el).onclick = e => { e.preventDefault(); showSignUp(); };
}

function showForgot() {
  const el = authShell(`<h2>Reset Password</h2>
    <p class="small">Enter your email and we'll send you a link to set a new password.
      Clients: if no email arrives, ask us for a new login link.</p>
    <form id="fForm">${field('Email', 'email', '', { type: 'email', attrs: 'required' })}<div class="auth-msg"></div>
    <button class="btn primary" style="width:100%;justify-content:center">Send Reset Link</button></form>
    <p class="small mt"><a href="#" id="back">Back To Sign In</a></p>`);
  const form = $('#fForm', el);
  form.onsubmit = e => {
    e.preventDefault();
    busyButton($('button', form), 'Sending…', async () => {
      try { await Cloud.sendReset(formValues(form).email); authMsg(el, 'If that address has an account, a reset link is on its way.', true); }
      catch (err) { authMsg(el, err.message, false); }
    })();
  };
  $('#back', el).onclick = e => { e.preventDefault(); showLogin(); };
}

function showSignUp() {
  const el = authShell(`<h2>Create Staff Account</h2>
    <p class="small">For Compliance Plus staff only. Your email must already be on the staff list; any other account stays locked until access is given. Clients are sent a login link instead.</p>
    <form id="sForm">
      ${field('Email', 'email', '', { type: 'email', attrs: 'autocomplete="username" required' })}
      ${field('Password (At Least 8 Characters)', 'password', '', { type: 'password', attrs: 'autocomplete="new-password" required minlength="8"' })}
      ${field('Confirm Password', 'password2', '', { type: 'password', attrs: 'autocomplete="new-password" required' })}
      <div class="auth-msg"></div>
      <button class="btn primary" style="width:100%;justify-content:center">Create Account</button></form>
    <p class="small mt"><a href="#" id="back">Back To Sign In</a></p>`);
  const form = $('#sForm', el);
  form.onsubmit = e => {
    e.preventDefault();
    const v = formValues(form);
    if (v.password.length < 8) return authMsg(el, 'Use at least 8 characters.', false);
    if (v.password !== v.password2) return authMsg(el, 'The passwords do not match.', false);
    busyButton($('button', form), 'Creating…', async () => {
      try {
        const signedIn = await Cloud.signUp(v.email, v.password);
        if (signedIn) await afterSignIn();
        else authMsg(el, 'Account created. Check your email and click the confirmation link to finish.', true);
      } catch (err) { authMsg(el, err.message, false); }
    })();
  };
  $('#back', el).onclick = e => { e.preventDefault(); showLogin(); };
}

function showSetPassword(kind) {
  const el = authShell(`<h2>${kind === 'invite' ? 'Welcome — Choose A Password' : 'Set A New Password'}</h2>
    <p class="small">Signed in as <b>${esc(Cloud.email)}</b>. You'll use this password next time.</p>
    <form id="pForm">
      ${field('New Password (At Least 8 Characters)', 'password', '', { type: 'password', attrs: 'autocomplete="new-password" required minlength="8"' })}
      ${field('Confirm Password', 'password2', '', { type: 'password', attrs: 'autocomplete="new-password" required' })}
      <div class="auth-msg"></div>
      <button class="btn primary" style="width:100%;justify-content:center">Save Password</button></form>`);
  const form = $('#pForm', el);
  form.onsubmit = e => {
    e.preventDefault();
    const v = formValues(form);
    if (v.password.length < 8) return authMsg(el, 'Use at least 8 characters.', false);
    if (v.password !== v.password2) return authMsg(el, 'The passwords do not match.', false);
    busyButton($('button', form), 'Saving…', async () => {
      try { await Cloud.setPassword(v.password); toast('Password saved'); await afterSignIn(); }
      catch (err) { authMsg(el, err.message, false); }
    })();
  };
}

function showPending() {
  const el = authShell(`<h2>Waiting For Access</h2>
    <p>You're signed in as <b>${esc(Cloud.email)}</b>, but this login hasn't been given access yet.</p>
    <p class="small muted">If you're a client, please use the login link we sent you. If you think this is a mistake, contact us${Store.settings.phone ? ' on ' + esc(Store.settings.phone) : ''}.</p>
    <div class="row"><button class="btn primary" id="retry">Check Again</button><button class="btn" id="out">Sign Out</button></div>`);
  $('#retry', el).onclick = async () => { await Cloud.loadProfile(); afterSignIn(); };
  $('#out', el).onclick = async () => { await Cloud.signOut(); showLogin(); };
}

/* ---------- Account page ---------- */
function syncStatusText() {
  if (!Cloud.configured) return 'Saved on this device only';
  const n = Cloud.pendingCount();
  const s = Cloud.status;
  if (s === 'syncing') return 'Syncing…';
  if (s === 'offline') return `Offline${n ? ` — ${n} change${n === 1 ? '' : 's'} waiting` : ''}`;
  if (s === 'error') return `Sync problem${n ? ` — ${n} waiting` : ''}`;
  if (n && Cloud.isStaff()) return `${n} change${n === 1 ? '' : 's'} waiting to upload`;
  return Cloud.lastSync ? `Synced ${Cloud.lastSync.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : 'Signed in';
}

function viewAccount() {
  setCrumbs([['My Account']]);
  if (!Cloud.configured || !Cloud.signedIn) { $('#view').innerHTML = '<div class="card">Online accounts are not set up on this portal.</div>'; return; }
  const p = Cloud.profile || {};
  const client = p.client_id ? Store.get('clients', p.client_id) : null;
  $('#view').innerHTML = `<h1>My Account</h1>
    <div class="grid2" style="align-items:start">
      <div class="card"><div class="kv">
        <div>Signed In As</div><div>${esc(Cloud.email)}</div>
        <div>Access</div><div>${p.role === 'staff' ? 'Staff — Full Access' : `Client${client ? ' — ' + esc(client.name) : ''} (View Only)`}</div>
        <div>Sync</div><div id="accSync">${esc(syncStatusText())}</div>
        ${Cloud.lastError && Cloud.status === 'error' ? `<div>Last Error</div><div class="small">${esc(Cloud.lastError)}</div>` : ''}
      </div>
      <div class="row mt"><button class="btn" id="syncBtn">Sync Now</button><button class="btn" id="pwBtn">Change Password</button><button class="btn danger" id="outBtn">Sign Out</button></div></div>
      <div class="card staff-only" id="staffCard"><h2>Staff Logins</h2><div id="staffList" class="small muted">Loading…</div>
        <button class="btn mt" id="inviteStaff">+ Invite Staff Member</button></div>
    </div>`;
  $('#syncBtn').onclick = () => Cloud.syncNow();
  $('#pwBtn').onclick = () => openModal({
    title: 'Change Password',
    body: field('New Password (At Least 8 Characters)', 'password', '', { type: 'password', attrs: 'autocomplete="new-password"' }) + field('Confirm Password', 'password2', '', { type: 'password', attrs: 'autocomplete="new-password"' }),
    buttons: [{ label: 'Cancel' }, { label: 'Save Password', cls: 'primary', onClick: async m => {
      const v = formValues(m);
      if (v.password.length < 8) { toast('Use at least 8 characters'); return false; }
      if (v.password !== v.password2) { toast('The passwords do not match'); return false; }
      try { await Cloud.setPassword(v.password); toast('Password changed'); } catch (e) { toast(e.message); return false; }
    } }]
  });
  $('#outBtn').onclick = async () => {
    const n = Cloud.isStaff() ? Cloud.pendingCount() : 0;
    const msg = n ? `<b>${n} change${n === 1 ? ' has' : 's have'} not been uploaded yet</b> and will be lost if you sign out now. Connect to the internet and choose Sync Now first.` : 'Signing out removes the copy of the data on this device. Everything stays safe online.';
    if (await confirmBox('Sign Out', msg, 'Sign Out')) { await Cloud.signOut(); location.hash = '#/'; location.reload(); }
  };
  if (Cloud.isStaff()) {
    renderLoginList($('#staffList'), { role: 'staff' });
    $('#inviteStaff').onclick = () => inviteModal('staff');
  }
}

/* ---------- Login management (staff) ---------- */
async function renderLoginList(box, filter) {
  try {
    const rows = await Cloud.listLogins(filter);
    box.className = '';
    box.innerHTML = rows.length ? rows.map(r => `<div class="row" style="padding:6px 0;border-bottom:1px solid var(--line)">
        <span style="flex:1">${esc(r.email)}</span>
        ${r.id === (Cloud.profile || {}).id ? '<span class="badge b-pass">You</span>' : `<button class="btn small danger" data-revoke="${r.id}">Remove Access</button>`}</div>`).join('')
      : '<p class="small muted">No logins yet.</p>';
    $$('[data-revoke]', box).forEach(b => b.onclick = async () => {
      const r = rows.find(x => x.id === b.dataset.revoke);
      if (!(await confirmBox('Remove Access', `Stop <b>${esc(r.email)}</b> from seeing the portal? Their account stays but shows nothing.`, 'Remove Access'))) return;
      try { await Cloud.revoke(r.id); toast('Access removed'); renderLoginList(box, filter); } catch (e) { toast(e.message); }
    });
  } catch (e) {
    box.innerHTML = `<p class="small muted">${navigator.onLine ? esc(e.message) : 'Connect to the internet to see logins.'}</p>`;
  }
}

function inviteModal(role, client, after) {
  openModal({
    title: role === 'staff' ? 'Invite Staff Member' : `Client Login — ${client.name}`,
    body: `<p class="small">${role === 'staff' ? 'They will have full access to every client and record.' : `They will be able to see <b>${esc(client.name)}</b>'s sites, plans, items, inspection results and reports — and nothing else. They can't change anything.`}</p>
      ${field('Their Email Address', 'email', role === 'client' ? client.email || '' : '', { type: 'email' })}
      <div id="inviteResult"></div>`,
    buttons: [{ label: 'Close' }, { label: 'Create Login Link', cls: 'primary', onClick: async m => {
      const email = formValues(m).email;
      const btn = $('.modal-foot .primary', m.parentElement) || $('.modal-foot .primary');
      btn.disabled = true; btn.textContent = 'Creating…';
      try {
        const r = await Cloud.invite(email, role, client ? client.id : null);
        const subject = `Your ${Store.settings.businessName} portal login`;
        const body = `Hello,\n\nHere is your link to the ${Store.settings.businessName} inspection portal${client ? ` for ${client.name}` : ''}. Click it to choose your password:\n\n${r.link}\n\nAfter that, sign in at ${portalBaseUrl()} with your email and password. You can also scan any of our QR labels to see that item's inspection record.\n\n${Store.settings.assessorName || ''}\n${Store.settings.businessName}`;
        $('#inviteResult', m).innerHTML = `<div class="card" style="box-shadow:none;background:#f6faf7">
          <b>Login link ready</b>${r.existing ? ' (they already had an account — this link lets them set a new password)' : ''}
          <input readonly value="${esc(r.link)}" id="invLink" class="mt">
          <div class="row mt"><button class="btn small primary" id="copyInv" type="button">Copy Link</button>
          <a class="btn small" href="mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}">Open In Email</a></div>
          <p class="small muted">The link works once and expires after a short time (1 hour unless changed in Supabase). If it expires, create a new one here.</p></div>`;
        $('#copyInv', m).onclick = () => navigator.clipboard.writeText(r.link).then(() => toast('Link copied'));
        if (after) after();
      } catch (e) { toast(e.message); }
      btn.disabled = false; btn.textContent = 'Create Login Link';
      return false;
    } }]
  });
}
