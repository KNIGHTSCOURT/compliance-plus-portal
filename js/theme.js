'use strict';

/* Compliance Plus - side menu for the new look (v1.6.0), matching the Knights Court restyle:
   line icons on each menu link, a round button that folds the menu down to icons (remembered on this device),
   and a "Hello" block at the top of the menu.  The look is in theme.css. */

const THEME_SVG = {
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  clients: '<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2"/><path d="M10 21v-3h4v3"/>',
  due: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="M12 13v3l2 1"/>',
  scan: '<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><rect x="8" y="8" width="3" height="3"/><rect x="13" y="8" width="3" height="3"/><rect x="8" y="13" width="3" height="3"/><path d="M13 13h3v3"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  quotes: '<path d="M7 3h8l4 4v14H7z"/><path d="M15 3v4h4"/><path d="M14.5 11.5c-.4-.7-1.1-1-1.9-1-1.2 0-2 .8-2 2 0 1.9.7 2.4.3 4.5h4M10.2 14h3"/>',
  accounts: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/><path d="M16 15h2"/><path d="M6 6V5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
  account: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>',
  // used on the dashboard
  door: '<path d="M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17"/><path d="M3 21h18"/><circle cx="14.5" cy="12" r=".9" fill="currentColor"/>',
  check: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9z"/><path d="M9 14l2 2 4-4"/>',
  alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>',
  flame: '<path d="M12 3c1 3.5 5 5 5 10a5 5 0 0 1-10 0c0-2.5 1.2-3.5 2-5 .6 1.2 1.2 1.7 2 1.7C11.5 8.5 11 6 12 3z"/>',
  chevron: '<path d="M15 6l-6 6 6 6"/>'
};
function themeIcon(name, size) {
  const s = size || 22;
  return `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${THEME_SVG[name] || THEME_SVG.dashboard}</svg>`;
}

function themeDecorateNav() {
  document.querySelectorAll('#nav a[data-nav]').forEach(a => {
    if (a.querySelector('.nav-icon')) return;
    const spans = a.querySelectorAll(':scope > span');
    const label = spans[spans.length - 1];
    if (label) { label.classList.add('nav-label'); a.title = label.textContent; }
    a.insertAdjacentHTML('afterbegin', `<span class="nav-icon">${themeIcon(a.dataset.nav)}</span>`);
  });
}

function themeSetCollapsed(on) {
  document.body.classList.toggle('side-collapsed', on);
  const b = document.querySelector('.side-collapse');
  if (b) { b.title = on ? 'Open The Menu' : 'Fold The Menu'; b.setAttribute('aria-label', b.title); }
  try { localStorage.setItem('cp-side-collapsed', on ? '1' : '0'); } catch (e) { /* private window: just not remembered */ }
}

function themeFoldButton() {
  if (document.querySelector('.side-collapse')) return;
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'side-collapse';
  b.innerHTML = themeIcon('chevron', 16);
  b.onclick = () => themeSetCollapsed(!document.body.classList.contains('side-collapsed'));
  document.body.appendChild(b);
  let saved = '0';
  try { saved = localStorage.getItem('cp-side-collapsed') || '0'; } catch (e) { /* ignore */ }
  themeSetCollapsed(saved === '1');
}

/* "Hello, Gavin!" - the name comes from Settings (Assessor Name), else the sign-in email. */
function themeProfile() {
  const side = document.getElementById('sidebar'), nav = document.getElementById('nav');
  if (!side || !nav) return;
  let name = '';
  try { name = (typeof Store !== 'undefined' && Store.settings && Store.settings.assessorName) || ''; } catch (e) { name = ''; }
  let email = '';
  try { email = (typeof Cloud !== 'undefined' && Cloud.signedIn && Cloud.email) || ''; } catch (e) { email = ''; }
  if (!name && email) {
    const local = email.split('@')[0].replace(/[._-]+/g, ' ');
    if (!/^(admin|info|office|hello|enquiries|contact|mail)$/i.test(local.trim())) name = local;
  }
  const first = (String(name).trim().split(/\s+/)[0] || 'there');
  const nice = first.charAt(0).toUpperCase() + first.slice(1);
  let role = 'Inspector';
  try {
    if (typeof Cloud !== 'undefined' && Cloud.isClient && Cloud.isClient()) {
      const c = Store.get('clients', Cloud.clientId);
      role = c ? c.name : 'Client';
    }
  } catch (e) { /* keep default */ }
  let box = side.querySelector('.side-profile');
  if (!box) {
    box = document.createElement('div'); box.className = 'side-profile';
    box.innerHTML = `<span class="avatar">${themeIcon('account', 26)}</span><span class="who"><b></b><small></small></span>`;
    side.insertBefore(box, nav);
  }
  box.querySelector('b').textContent = nice === 'There' ? 'Hello!' : 'Hello, ' + nice + '!';
  box.querySelector('small').textContent = role;
}

document.addEventListener('DOMContentLoaded', () => {
  themeDecorateNav();
  themeFoldButton();
  themeProfile();
  // refresh the hello block whenever the page changes (sign-in, settings saved)
  window.addEventListener('hashchange', () => setTimeout(themeProfile, 60));
});
