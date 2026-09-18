/* ============================================================
   PDFForge core — state, storage, router, UI primitives
   ============================================================ */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 10);
const fmtBytes = b => {
  if (!b && b !== 0) return '—';
  const u = ['B', 'KB', 'MB', 'GB']; let i = 0, n = b;
  while (n >= 1024 && i < 3) { n /= 1024; i++; }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
};
const fmtDate = ts => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const fmtTime = ts => {
  const d = Math.floor((Date.now() - ts) / 1000);
  if (d < 60) return 'just now';
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  if (d < 604800) return `${Math.floor(d / 86400)}d ago`;
  return fmtDate(ts);
};
const dl = (blob, name) => {
  const u = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = u; a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(u); a.remove(); }, 400);
};
const baseName = n => n.replace(/\.[^.]+$/, '');
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* ---------------- persistent store ---------------- */
const DB_KEY = 'pdfforge.v1';
const Store = {
  d: null,
  seed() {
    return {
      user: null,
      plan: 'free',
      billing: 'monthly',
      usage: { month: new Date().toISOString().slice(0, 7), ops: 0 },
      jobs: [],
      keys: [{ id: uid(), label: 'Default key', token: 'pk_live_' + uid() + uid(), created: Date.now() - 864e5 * 12, calls: 1284 }],
      settings: { autoDownload: true, keepHistory: true, theme: 'dark' },
    };
  },
  load() {
    try { this.d = JSON.parse(localStorage.getItem(DB_KEY)) || this.seed(); }
    catch { this.d = this.seed(); }
    const m = new Date().toISOString().slice(0, 7);
    if (this.d.usage.month !== m) this.d.usage = { month: m, ops: 0 };
    return this.d;
  },
  save() { try { localStorage.setItem(DB_KEY, JSON.stringify(this.d)); } catch {} },
  reset() { localStorage.removeItem(DB_KEY); this.d = this.seed(); this.save(); },
};

const PLANS = {
  free:  { name: 'Free',    quota: 15,       size: 15,  monthly: 0,  yearly: 0,   pro: false },
  pro:   { name: 'Pro',     quota: Infinity, size: 200, monthly: 12, yearly: 115, pro: true },
  team:  { name: 'Team',    quota: Infinity, size: 500, monthly: 29, yearly: 278, pro: true },
  ent:   { name: 'Enterprise', quota: Infinity, size: 2000, monthly: 0, yearly: 0, pro: true },
};
const plan = () => PLANS[Store.d.plan] || PLANS.free;
const quotaLeft = () => plan().quota === Infinity ? Infinity : Math.max(0, plan().quota - Store.d.usage.ops);

function logJob(tool, detail, outName, size) {
  Store.d.usage.ops++;
  if (Store.d.settings.keepHistory) {
    Store.d.jobs.unshift({ id: uid(), tool, detail, outName, size, ts: Date.now(), status: 'done' });
    Store.d.jobs = Store.d.jobs.slice(0, 60);
  }
  Store.save();
  document.dispatchEvent(new CustomEvent('pf:usage'));
}

/* ---------------- toasts ---------------- */
function toast(msg, kind = '') {
  let box = $('.toasts');
  if (!box) { box = document.createElement('div'); box.className = 'toasts'; document.body.appendChild(box); }
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  const ic = kind === 'ok' ? IC.checkC : kind === 'bad' ? IC.alert : IC.bolt;
  el.innerHTML = `<span style="color:${kind === 'ok' ? 'var(--ok)' : kind === 'bad' ? 'var(--bad)' : 'var(--brand)'}">${ic}</span><span>${esc(msg)}</span>`;
  box.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateX(30px)'; el.style.transition = '.25s'; setTimeout(() => el.remove(), 260); }, 3400);
}

/* ---------------- busy overlay ---------------- */
let busyEl = null;
function busy(on, label = 'Processing…', sub = '') {
  if (!on) { busyEl?.remove(); busyEl = null; return; }
  if (!busyEl) {
    busyEl = document.createElement('div');
    busyEl.className = 'busy';
    busyEl.innerHTML = `<div class="busy-box"><div class="spin"></div><div style="font-weight:650" id="busyL"></div><div class="dim" style="font-size:13px;margin-top:5px" id="busyS"></div></div>`;
    document.body.appendChild(busyEl);
  }
  $('#busyL', busyEl).textContent = label;
  $('#busyS', busyEl).textContent = sub;
}

/* ---------------- modal ---------------- */
function modal(html, opts = {}) {
  const ovl = document.createElement('div');
  ovl.className = 'ovl';
  ovl.innerHTML = `<div class="modal ${opts.wide ? 'wide' : ''}" style="position:relative">
    <button class="ico-btn modal-x">${IC.x}</button>${html}</div>`;
  document.body.appendChild(ovl);
  document.body.classList.add('noscroll');
  const close = () => { ovl.remove(); document.body.classList.remove('noscroll'); opts.onClose?.(); };
  $('.modal-x', ovl).onclick = close;
  ovl.onclick = e => { if (e.target === ovl) close(); };
  document.addEventListener('keydown', function k(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', k); } });
  return { el: ovl, close };
}

/* ---------------- auth ---------------- */
function authModal(mode = 'signup', after) {
  const isUp = mode === 'signup';
  const m = modal(`
    <div style="text-align:center;margin-bottom:22px">
      <div class="logo-mark" style="margin:0 auto 14px;width:44px;height:44px;border-radius:13px">${IC.logo}</div>
      <h3 class="h-md">${isUp ? 'Create your account' : 'Welcome back'}</h3>
      <p class="muted" style="font-size:14px;margin-top:7px">${isUp ? 'Free forever plan. No card required.' : 'Sign in to your workspace.'}</p>
    </div>
    <form id="authF">
      ${isUp ? `<div class="field"><label>Full name</label><input class="inp" name="name" placeholder="Aarav Sharma" required></div>` : ''}
      <div class="field"><label>Work email</label><input class="inp" type="email" name="email" placeholder="you@company.com" required></div>
      <div class="field"><label>Password</label><input class="inp" type="password" name="pw" placeholder="••••••••" minlength="6" required></div>
      <button class="btn btn-p btn-block btn-lg" style="margin-top:6px">${isUp ? 'Create free account' : 'Sign in'}</button>
    </form>
    <p class="tc dim" style="font-size:13px;margin-top:18px">
      ${isUp ? 'Already have an account?' : "Don't have an account?"}
      <a href="#" id="swap" style="color:var(--brand);font-weight:600">${isUp ? 'Sign in' : 'Sign up free'}</a>
    </p>
    <p class="tc dim" style="font-size:11.5px;margin-top:14px;line-height:1.5">Demo account — data is stored locally in your browser only.</p>
  `);
  $('#swap', m.el).onclick = e => { e.preventDefault(); m.close(); authModal(isUp ? 'signin' : 'signup', after); };
  $('#authF', m.el).onsubmit = e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const email = f.get('email');
    const name = f.get('name') || email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    Store.d.user = { name, email, since: Store.d.user?.since || Date.now() };
    Store.save();
    m.close();
    toast(`Signed in as ${email}`, 'ok');
    after ? after() : location.assign('app.html');
  };
}

function requireAuth() {
  if (!Store.d.user) {
    Store.d.user = { name: 'Demo User', email: 'demo@pdfforge.io', since: Date.now() };
    Store.save();
  }
  return Store.d.user;
}

/* ---------------- quota gate ---------------- */
function gate(needPro = false) {
  if (needPro && !plan().pro) { upsell('This tool is part of PDFForge Pro.'); return false; }
  if (quotaLeft() <= 0) { upsell(`You've used all ${plan().quota} free operations this month.`); return false; }
  return true;
}
function upsell(msg) {
  modal(`
    <div style="text-align:center">
      <div class="t-ic" style="margin:0 auto 14px;width:50px;height:50px;background:var(--grad-soft);border-color:rgba(255,107,53,.3)">
        <span style="color:var(--brand);display:grid">${IC.zap}</span></div>
      <h3 class="h-md">Upgrade to Pro</h3>
      <p class="muted" style="font-size:14.5px;margin:10px auto 0;max-width:34ch">${esc(msg)}</p>
      <ul style="list-style:none;text-align:left;margin:22px 0;display:flex;flex-direction:column;gap:11px">
        ${['Unlimited operations, forever', 'Files up to 200 MB', 'All 20 pro tools unlocked', 'Batch processing & API access', 'No watermarks on exports']
          .map(t => `<li style="display:flex;gap:10px;font-size:14px;color:var(--txt-2)"><span style="color:var(--ok);display:grid;width:16px">${IC.check}</span>${t}</li>`).join('')}
      </ul>
      <button class="btn btn-p btn-block btn-lg" id="up">Upgrade — $12/mo</button>
      <a href="pricing.html" class="btn btn-ghost btn-block" style="margin-top:9px">Compare all plans</a>
    </div>`);
  $('#up').onclick = () => { Store.d.plan = 'pro'; Store.save(); location.reload(); };
}

/* ---------------- shared chrome ---------------- */
function navBar(active) {
  const links = [['Tools', 'app.html'], ['Pricing', 'pricing.html'], ['Security', 'index.html#security'], ['Docs', 'index.html#faq']];
  const signedIn = !!Store.d.user;
  return `<nav class="nav"><div class="wrap nav-in">
    <a href="index.html" class="logo"><span class="logo-mark">${IC.logo}</span>PDF<span class="grad-txt">Forge</span></a>
    <div class="nav-links" id="navL">${links.map(([t, h]) => `<a href="${h}" class="${active === t ? 'on' : ''}">${t}</a>`).join('')}</div>
    <div class="row gap8">
      ${signedIn
        ? `<a href="app.html" class="btn btn-g btn-sm">${IC.grid} Dashboard</a>
           <a href="account.html" class="av" style="width:32px;height:32px;font-size:12.5px" title="${esc(Store.d.user.email)}">${esc(Store.d.user.name[0].toUpperCase())}</a>`
        : `<button class="btn btn-ghost" onclick="authModal('signin')">Sign in</button>
           <button class="btn btn-p btn-sm" onclick="authModal('signup')">Start free</button>`}
      <button class="burger" onclick="document.getElementById('navL').classList.toggle('open')">${IC.menu}</button>
    </div>
  </div></nav>`;
}

function footer() {
  const cols = [
    ['Product', [['All tools', 'app.html'], ['Pricing', 'pricing.html'], ['Changelog', '#'], ['Roadmap', '#']]],
    ['Tools', [['Merge PDF', 'app.html#merge'], ['Split PDF', 'app.html#split'], ['Compress PDF', 'app.html#compress'], ['Sign PDF', 'app.html#sign']]],
    ['Company', [['Security', 'index.html#security'], ['Privacy', '#'], ['Terms', '#'], ['Contact', '#']]],
  ];
  return `<footer class="foot"><div class="wrap">
    <div class="foot-grid">
      <div>
        <a href="index.html" class="logo" style="margin-bottom:13px">
          <span class="logo-mark">${IC.logo}</span>PDF<span class="grad-txt">Forge</span></a>
        <p class="muted" style="font-size:14px;max-width:34ch">The all-in-one PDF workspace that runs entirely in your browser. Your documents never touch a server.</p>
        <div class="row gap8" style="margin-top:16px">
          <span class="chip chip-ok"><span class="dot"></span>All systems operational</span>
        </div>
      </div>
      ${cols.map(([h, ls]) => `<div><h5>${h}</h5><ul>${ls.map(([t, u]) => `<li><a href="${u}">${t}</a></li>`).join('')}</ul></div>`).join('')}
    </div>
    <div class="foot-bot">
      <span>© ${new Date().getFullYear()} PDFForge Inc. A demo SaaS product.</span>
      <span class="row gap16"><span>SOC 2 Type II</span><span>GDPR</span><span>ISO 27001</span></span>
    </div>
  </div></footer>`;
}

/* ---------------- drag & drop helper ---------------- */
function dropZone(el, cb, accept = '.pdf') {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = accept; inp.multiple = true; inp.style.display = 'none';
  el.appendChild(inp);
  el.addEventListener('click', e => { if (e.target.tagName !== 'BUTTON') inp.click(); });
  inp.addEventListener('change', () => { if (inp.files.length) cb([...inp.files]); inp.value = ''; });
  ['dragenter', 'dragover'].forEach(v => el.addEventListener(v, e => { e.preventDefault(); el.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(v => el.addEventListener(v, e => { e.preventDefault(); el.classList.remove('over'); }));
  el.addEventListener('drop', e => { const f = [...e.dataTransfer.files]; if (f.length) cb(f); });
  return inp;
}

Store.load();
