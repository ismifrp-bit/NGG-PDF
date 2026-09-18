/* ============================================================
   Workspace UI — tool shell, page grid, studio, signature, redact
   ============================================================ */

function toolShell() {
  const t = WS.tool;
  const hasFiles = WS.files.length > 0;
  const needsMore = t.multi && WS.files.length < (t.min || 1);

  return `
  <div class="page-head">
    <div>
      <div class="row gap8" style="margin-bottom:8px">
        <a href="app.html" class="btn btn-ghost btn-sm" style="margin-left:-8px">${IC.left} All tools</a>
        ${t.pro ? '<span class="chip chip-brand">PRO</span>' : ''}
      </div>
      <h1 class="h-md">${t.name}</h1>
      <p class="muted" style="font-size:14.5px;margin-top:6px;max-width:58ch">${t.desc}</p>
    </div>
    <div class="row gap8">
      ${hasFiles ? `<button class="btn btn-g btn-sm" id="clearAll">${IC.refresh} Start over</button>` : ''}
    </div>
  </div>

  <div class="tool-layout">
    <div class="col gap16" style="min-width:0">
      ${!hasFiles ? `
        <div class="panel">
          <div class="dz" id="dz">
            <div class="drop-ic">${IC.upload}</div>
            <h4>Drop ${t.multi ? 'files' : 'a file'} here</h4>
            <p>or click to browse — ${t.accept === 'image/*' ? 'JPG, PNG, WebP' : 'PDF'} up to ${plan().size} MB</p>
            <button class="btn btn-p mt16">${IC.plus} Choose ${t.multi ? 'files' : 'file'}</button>
          </div>
          <div class="row gap16 mt16 dim" style="font-size:12px;justify-content:center;flex-wrap:wrap">
            <span class="row gap8">${iconSpan(IC.shield, 16)} Never uploaded</span>
            <span class="row gap8">${iconSpan(IC.bolt, 16)} Instant, in-browser</span>
            <span class="row gap8">${iconSpan(IC.lock, 16)} Zero retention</span>
          </div>
        </div>` : `
        <div class="panel">
          <div class="row spread" style="margin-bottom:14px">
            <h3 class="h-sm">${WS.files.length} file${WS.files.length > 1 ? 's' : ''}</h3>
            ${t.multi ? `<button class="btn btn-g btn-sm" id="addMore">${IC.plus} Add more</button>` : `<button class="btn btn-g btn-sm" id="addMore">${IC.refresh} Replace</button>`}
          </div>
          <div class="col gap8" id="fileList">
            ${WS.files.map((f, i) => fileRow(f, i)).join('')}
          </div>
          ${needsMore ? `<p class="hint dim mt16" style="font-size:13px">Add at least ${t.min} files to merge.</p>` : ''}
        </div>
        ${pageArea()}
      `}
    </div>

    <div class="panel panel-sticky">
      <h3 class="h-sm" style="margin-bottom:16px">Options</h3>
      <div id="opts" class="${hasFiles ? '' : 'dim'}" style="${hasFiles ? '' : 'opacity:.45;pointer-events:none'}">
        ${OPT[t.id] ? OPT[t.id]() : ''}
      </div>
      <button class="btn btn-p btn-block btn-lg mt24" id="runBtn" ${hasFiles && !needsMore ? '' : 'disabled'}>
        ${IC.zap} ${runLabel(t)}
      </button>
      <div id="resultBox" class="mt16"></div>
      <div class="mt16 dim tc" style="font-size:11.5px">
        ${plan().quota === Infinity ? 'Unlimited operations' : `${quotaLeft()} of ${plan().quota} free operations left`}
      </div>
    </div>
  </div>`;
}

const iconSpan = (svg, s = 16) => `<span style="display:grid;width:${s}px;height:${s}px">${svg}</span>`;

function runLabel(t) {
  return ({ merge: 'Merge PDFs', split: 'Split PDF', organize: 'Apply changes', extract: 'Extract pages',
    rotate: 'Rotate pages', nup: 'Build layout', compress: 'Compress', crop: 'Crop pages', repair: 'Repair file',
    toimg: 'Convert to images', fromimg: 'Create PDF', totext: 'Extract text', ocr: 'Scan document',
    studio: 'Export PDF', sign: 'Apply signature', watermark: 'Add watermark', numbers: 'Add numbers',
    redact: 'Burn redactions', protect: 'Protect PDF', meta: 'Save metadata' })[t.id] || 'Run';
}

function fileRow(f, i) {
  const t = WS.tool;
  const drag = (t.id === 'merge' || t.id === 'fromimg');
  return `<div class="file-row" data-fid="${f.id}" ${drag ? 'draggable="true"' : ''} style="${drag ? 'cursor:grab' : ''}">
    ${drag ? `<span class="dim" style="font-size:13px;font-weight:700;width:16px">${i + 1}</span>` : ''}
    <div class="file-ic">${/pdf/i.test(f.name) ? 'PDF' : 'IMG'}</div>
    <div class="grow" style="min-width:0">
      <b>${esc(f.name)}</b>
      <small>${fmtBytes(f.size)}${f.pages ? ` · ${f.pages} pages` : ''}</small>
    </div>
    <button class="ico-btn dngr" data-rm="${f.id}">${IC.trash}</button>
  </div>`;
}

/* ---------- page area per tool ---------- */
function pageArea() {
  const t = WS.tool;
  if (t.id === 'organize') return organizePanel();
  if (t.id === 'redact') return redactPanel();
  if (t.id === 'studio' || t.id === 'sign') return studioPanel();
  if (t.id === 'meta') return '';
  if (WS.files[0]?.doc && ['split', 'extract', 'rotate', 'compress', 'toimg', 'crop', 'nup', 'watermark', 'numbers', 'protect', 'repair', 'totext', 'ocr'].includes(t.id)) {
    return `<div class="panel">
      <div class="row spread" style="margin-bottom:14px">
        <h3 class="h-sm">Preview</h3>
        <span class="dim" style="font-size:12.5px">${WS.files[0].pages} pages</span>
      </div>
      <div class="thumbs" id="grid">
        ${[...Array(Math.min(WS.files[0].pages, 24))].map((_, i) => `
          <div class="thumb" data-pg="${i + 1}"><div class="thumb-img" style="aspect-ratio:1/1.3;background:var(--bg-3)"></div>
            <div class="thumb-bar"><span>${i + 1}</span></div></div>`).join('')}
      </div>
      ${WS.files[0].pages > 24 ? `<p class="dim tc mt16" style="font-size:12.5px">Showing first 24 of ${WS.files[0].pages} pages</p>` : ''}
    </div>`;
  }
  if (t.id === 'fromimg') {
    return `<div class="panel">
      <h3 class="h-sm" style="margin-bottom:14px">Order</h3>
      <div class="thumbs" id="imgGrid">
        ${WS.files.map((f, i) => `<div class="thumb" data-img="${f.id}">
          <div class="thumb-img" style="background:var(--bg-3)"><img src="${URL.createObjectURL(f.file)}" style="width:100%;display:block"></div>
          <div class="thumb-bar"><span>${i + 1}</span></div></div>`).join('')}
      </div></div>`;
  }
  return '';
}

/* ---------- ORGANIZE ---------- */
function organizePanel() {
  const kept = WS.pages.filter(p => !p.del).length;
  return `<div class="panel">
    <div class="row spread" style="margin-bottom:14px;flex-wrap:wrap;gap:10px">
      <h3 class="h-sm">Pages — <span class="dim" style="font-weight:500">${kept} kept, ${WS.pages.length - kept} removed</span></h3>
      <div class="row gap8">
        <button class="btn btn-g btn-sm" id="selAll">Select all</button>
        <button class="btn btn-g btn-sm" id="rotSel">${IC.rotate} Rotate selected</button>
        <button class="btn btn-danger btn-sm" id="delSel">${IC.trash} Remove selected</button>
        <button class="btn btn-g btn-sm" id="revert">Restore all</button>
      </div>
    </div>
    <div class="thumbs" id="grid">
      ${WS.pages.map((p, i) => `
        <div class="thumb ${p.del ? 'del' : ''} ${p.sel ? 'sel' : ''}" data-pg="${p.src + 1}" data-key="${p.key}" draggable="true">
          <span class="pg-badge">${i + 1}</span>
          <div class="thumb-img" style="aspect-ratio:1/1.3;background:var(--bg-3);transform:rotate(${p.rot}deg)"></div>
          <div class="thumb-bar">
            <span>p${p.src + 1}${p.rot ? ` · ${p.rot}°` : ''}</span>
            <span class="thumb-acts">
              <button class="mini" data-act="rot" data-key="${p.key}" title="Rotate">${IC.rotate}</button>
              <button class="mini" data-act="dup" data-key="${p.key}" title="Duplicate">${IC.copy}</button>
              <button class="mini" data-act="del" data-key="${p.key}" title="${p.del ? 'Restore' : 'Remove'}">${p.del ? IC.refresh : IC.trash}</button>
            </span>
          </div>
        </div>`).join('')}
    </div>
    <p class="dim mt16" style="font-size:12.5px">Drag thumbnails to reorder · click to select · hover for per-page actions</p>
  </div>`;
}

/* ---------- REDACT ---------- */
function redactPanel() {
  const n = WS.pages.reduce((a, p) => a + (p.boxes?.length || 0), 0);
  return `<div class="panel">
    <div class="row spread" style="margin-bottom:14px">
      <h3 class="h-sm">Draw redaction boxes</h3>
      <span class="chip ${n ? 'chip-brand' : ''}">${n} box${n === 1 ? '' : 'es'}</span>
    </div>
    <div class="thumbs" style="grid-template-columns:repeat(auto-fill,minmax(210px,1fr))" id="grid">
      ${WS.pages.map((p, i) => `
        <div class="thumb" data-pg="${p.src + 1}" data-ri="${i}" style="cursor:crosshair">
          <span class="pg-badge">${i + 1}</span>
          <div class="redact-host" style="position:relative">
            <div class="thumb-img" style="aspect-ratio:1/1.3;background:var(--bg-3)"></div>
            <div class="box-layer" style="position:absolute;inset:0;pointer-events:none">
              ${(p.boxes || []).map((b, bi) => `<div style="position:absolute;left:${b.x * 100}%;top:${b.y * 100}%;width:${b.w * 100}%;height:${b.h * 100}%;background:${b.color};outline:1px solid #ff6b35" data-box="${bi}"></div>`).join('')}
            </div>
          </div>
          <div class="thumb-bar"><span>p${p.src + 1}</span><span>${(p.boxes || []).length} box</span></div>
        </div>`).join('')}
    </div>
  </div>`;
}

/* ---------- STUDIO / SIGN ---------- */
function studioPanel() {
  const cur = WS.curPage ?? 0;
  const total = WS.pages.length;
  return `<div class="panel">
    <div class="pgnav">
      <button class="ico-btn" id="pgPrev">${IC.left}</button>
      <span style="font-size:13.5px">Page <b id="pgNum">${cur + 1}</b> / ${total}</span>
      <button class="ico-btn" id="pgNext">${IC.right}</button>
      <span class="dim" style="font-size:12.5px;margin-left:12px">${WS.overlays.length} element(s)</span>
    </div>
    <div class="studio">
      <div class="stage-wrap" id="stageWrap">
        <div class="stage" id="stage"></div>
      </div>
    </div>
  </div>`;
}

/* ============================================================
   RENDER + WIRE
   ============================================================ */
async function renderTool() {
  const host = $('#toolHost');
  host.innerHTML = toolShell();
  wireSegs(host);
  wireCommon();
  wireOptions();

  const t = WS.tool;
  const f = WS.files[0];

  if ($('#grid') && f?.doc) {
    if (t.id === 'studio' || t.id === 'sign') { /* handled below */ }
    else paintThumbs($('#grid'), f.doc, { width: t.id === 'redact' ? 300 : 200 });
  }
  if (t.id === 'organize' && f?.doc) paintOrganize();
  if ((t.id === 'studio' || t.id === 'sign') && f?.doc) await paintStage();
  if (t.id === 'meta' && f) await loadMeta();
  if (t.id === 'redact') wireRedact();
  if (t.id === 'organize') wireOrganize();
  if (t.id === 'sign') wireSign();
  if (t.id === 'studio') wireStudio();
  if (t.id === 'merge' || t.id === 'fromimg') wireFileDrag();
}

function wireCommon() {
  const t = WS.tool;
  const acc = t.accept || '.pdf';
  const dz = $('#dz');
  if (dz) dropZone(dz, fs => WS.addFiles(fs), acc);

  const add = $('#addMore');
  if (add) {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = acc; inp.multiple = !!t.multi; inp.style.display = 'none';
    document.body.appendChild(inp);
    add.onclick = () => inp.click();
    inp.onchange = () => { if (inp.files.length) WS.addFiles([...inp.files]); inp.value = ''; };
  }

  $$('[data-rm]').forEach(b => b.onclick = e => { e.stopPropagation(); WS.remove(b.dataset.rm); });
  const clr = $('#clearAll');
  if (clr) clr.onclick = () => { WS.reset(); renderTool(); };

  // global file drop
  document.ondragover = e => e.preventDefault();
  document.ondrop = e => {
    e.preventDefault();
    const fs = [...e.dataTransfer.files];
    if (fs.length && WS.tool) WS.addFiles(fs);
  };

  const run = $('#runBtn');
  if (run) run.onclick = doRun;
}

/* ---------- live option bindings ---------- */
function wireOptions() {
  const t = WS.tool;
  const bind = (id, lbl, fn = v => v) => {
    const el = $('#' + id), out = $('#' + lbl);
    if (el && out) el.oninput = () => out.textContent = fn(el.value);
  };
  bind('o_q', 'ql'); bind('o_s', 'sl', v => (v / 100).toFixed(2));
  bind('o_jq', 'jl'); bind('o_m', 'ml');
  bind('o_size', 'wl'); bind('o_ang', 'al'); bind('o_op', 'ol');
  ['top', 'right', 'bottom', 'left'].forEach(s => bind('o_' + s, 'l_' + s));

  if (t.id === 'split') {
    $('#o_mode')?.addEventListener('seg', e => {
      $('#f_every').classList.toggle('hide', e.detail !== 'every');
      $('#f_ranges').classList.toggle('hide', e.detail !== 'ranges');
    });
  }
  if (t.id === 'compress') {
    $('#o_lvl')?.addEventListener('seg', e => {
      const p = { low: [82, 180], mid: [62, 135], high: [38, 100] }[e.detail];
      $('#o_q').value = p[0]; $('#ql').textContent = p[0];
      $('#o_s').value = p[1]; $('#sl').textContent = (p[1] / 100).toFixed(2);
    });
  }
}

/* ---------- RUN ---------- */
async function doRun() {
  const t = WS.tool;
  if (!gate(t.pro)) return;
  const box = $('#resultBox');
  box.innerHTML = '';
  busy(true, 'Working…', t.name);
  try {
    const r = await RUN[t.id]();
    busy(false);
    if (!r.silent) {
      if (Store.d.settings.autoDownload) dl(r.blob, r.name);
      box.innerHTML = `<div class="result">
        <div class="ic">${IC.checkC}</div>
        <div class="grow" style="min-width:0">
          <b style="font-size:13.6px;display:block">${esc(r.name)}</b>
          <small class="dim" style="font-size:12px">${fmtBytes(r.blob.size)}${r.note ? ` · ${r.note}` : ''}</small>
        </div>
        <button class="btn btn-p btn-sm" id="dlBtn">${IC.download}</button>
      </div>`;
      $('#dlBtn').onclick = () => dl(r.blob, r.name);
    }
    logJob(t.name, r.detail || '', r.name, r.blob.size);
    toast(`${t.name} complete${r.note ? ' — ' + r.note : ''}`, 'ok');
    renderUsage();
  } catch (e) {
    busy(false);
    console.error(e);
    box.innerHTML = `<div class="err"><b>Couldn't finish.</b><br>${esc(e.message || 'Unexpected error')}</div>`;
    toast(e.message || 'Something went wrong', 'bad');
  }
}

/* ============================================================
   ORGANIZE interactions
   ============================================================ */
async function paintOrganize() {
  const doc = WS.files[0].doc;
  for (const n of $$('[data-key]', $('#grid'))) {
    if (n.dataset.painted) continue;
    const pno = +n.dataset.pg;
    try {
      const c = await Engine.thumb(doc, pno, 190);
      const h = $('.thumb-img', n);
      h.innerHTML = ''; h.style.aspectRatio = ''; h.appendChild(c);
      n.dataset.painted = '1';
    } catch {}
  }
}

function wireOrganize() {
  const grid = $('#grid'); if (!grid) return;
  const find = k => WS.pages.find(p => p.key === k);

  grid.onclick = e => {
    const act = e.target.closest('[data-act]');
    if (act) {
      e.stopPropagation();
      const p = find(act.dataset.key);
      if (act.dataset.act === 'rot') p.rot = (p.rot + 90) % 360;
      if (act.dataset.act === 'del') p.del = !p.del;
      if (act.dataset.act === 'dup') {
        const i = WS.pages.indexOf(p);
        WS.pages.splice(i + 1, 0, { ...p, key: uid(), sel: false });
      }
      return renderTool();
    }
    const th = e.target.closest('.thumb');
    if (th) { const p = find(th.dataset.key); p.sel = !p.sel; th.classList.toggle('sel', p.sel); }
  };

  if (!$('#selAll')) return;
  $('#selAll').onclick = () => { const all = WS.pages.every(p => p.sel); WS.pages.forEach(p => p.sel = !all); renderTool(); };
  $('#delSel').onclick = () => { WS.pages.forEach(p => { if (p.sel) { p.del = true; p.sel = false; } }); renderTool(); };
  $('#rotSel').onclick = () => { WS.pages.forEach(p => { if (p.sel) p.rot = (p.rot + 90) % 360; }); renderTool(); };
  $('#revert').onclick = () => { WS.pages.forEach(p => { p.del = false; p.sel = false; p.rot = 0; }); renderTool(); };

  const q = (id, fn) => { const b = $('#' + id); if (b) b.onclick = () => { fn(); renderTool(); }; };
  q('q_rev', () => WS.pages.reverse());
  q('q_even', () => WS.pages.forEach((p, i) => p.del = (i % 2 === 0)));
  q('q_odd', () => WS.pages.forEach((p, i) => p.del = (i % 2 === 1)));
  q('q_rotall', () => WS.pages.forEach(p => p.rot = (p.rot + 90) % 360));
  const sum = $('#org_sum');
  if (sum) {
    const kept = WS.pages.filter(p => !p.del).length;
    const rot = WS.pages.filter(p => p.rot).length;
    sum.innerHTML = `<div class="row spread"><span class="dim">Pages kept</span><b>${kept}</b></div>
      <div class="row spread"><span class="dim">Removed</span><b>${WS.pages.length - kept}</b></div>
      <div class="row spread"><span class="dim">Rotated</span><b>${rot}</b></div>`;
  }

  // drag reorder
  let src = null;
  $$('.thumb', grid).forEach(el => {
    el.ondragstart = e => { src = el; el.classList.add('drag'); e.dataTransfer.effectAllowed = 'move'; };
    el.ondragend = () => { src?.classList.remove('drag'); $$('.thumb', grid).forEach(x => x.classList.remove('over')); };
    el.ondragover = e => { e.preventDefault(); if (el !== src) el.classList.add('over'); };
    el.ondragleave = () => el.classList.remove('over');
    el.ondrop = e => {
      e.preventDefault(); el.classList.remove('over');
      if (!src || src === el) return;
      const a = WS.pages.findIndex(p => p.key === src.dataset.key);
      const b = WS.pages.findIndex(p => p.key === el.dataset.key);
      const [m] = WS.pages.splice(a, 1);
      WS.pages.splice(b, 0, m);
      renderTool();
    };
  });
}

/* ---------- file card drag (merge / images) ---------- */
function wireFileDrag() {
  const list = $('#fileList'); if (!list) return;
  let src = null;
  $$('.file-row', list).forEach(el => {
    el.ondragstart = () => { src = el; el.style.opacity = '.4'; };
    el.ondragend = () => { if (src) src.style.opacity = ''; };
    el.ondragover = e => { e.preventDefault(); el.style.boxShadow = '-3px 0 0 var(--brand)'; };
    el.ondragleave = () => el.style.boxShadow = '';
    el.ondrop = e => {
      e.preventDefault(); el.style.boxShadow = '';
      if (!src || src === el) return;
      const a = WS.files.findIndex(f => f.id === src.dataset.fid);
      const b = WS.files.findIndex(f => f.id === el.dataset.fid);
      const [m] = WS.files.splice(a, 1);
      WS.files.splice(b, 0, m);
      renderTool();
    };
  });
}

/* ============================================================
   REDACT drawing
   ============================================================ */
function wireRedact() {
  const grid = $('#grid'); if (!grid) return;
  const col = () => $('#o_col')?.value || '#000000';

  $$('.thumb', grid).forEach(th => {
    const host = $('.redact-host', th);
    let start = null, ghost = null;
    host.onpointerdown = e => {
      e.preventDefault();
      host.setPointerCapture(e.pointerId);
      const r = host.getBoundingClientRect();
      start = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
      ghost = document.createElement('div');
      ghost.style.cssText = `position:absolute;background:${col()};opacity:.75;outline:1px solid #ff6b35;pointer-events:none`;
      ($('.box-layer', host) || host).appendChild(ghost);
    };
    host.onpointermove = e => {
      if (!start) return;
      const r = host.getBoundingClientRect();
      const x = clamp((e.clientX - r.left) / r.width, 0, 1), y = clamp((e.clientY - r.top) / r.height, 0, 1);
      const bx = Math.min(x, start.x), by = Math.min(y, start.y);
      ghost.style.left = bx * 100 + '%'; ghost.style.top = by * 100 + '%';
      ghost.style.width = Math.abs(x - start.x) * 100 + '%'; ghost.style.height = Math.abs(y - start.y) * 100 + '%';
    };
    host.onpointerup = e => {
      if (!start) return;
      const r = host.getBoundingClientRect();
      const x = clamp((e.clientX - r.left) / r.width, 0, 1), y = clamp((e.clientY - r.top) / r.height, 0, 1);
      const w = Math.abs(x - start.x), h = Math.abs(y - start.y);
      ghost?.remove(); ghost = null;
      const i = +th.dataset.ri;
      if (w > .015 && h > .01) {
        (WS.pages[i].boxes ||= []).push({ x: Math.min(x, start.x), y: Math.min(y, start.y), w, h, color: col() });
        renderTool();
      }
      start = null;
    };
  });

  const rc = $('#r_clear');
  if (rc) rc.onclick = () => { WS.pages.forEach(p => p.boxes = []); renderTool(); };
  const n = WS.pages.reduce((a, p) => a + (p.boxes?.length || 0), 0);
  const c = $('#r_count');
  if (c) c.innerHTML = n
    ? `<b style="color:var(--brand)">${n}</b> area${n > 1 ? 's' : ''} marked across ${WS.pages.filter(p => p.boxes?.length).length} page(s). Content underneath will be destroyed.`
    : 'No boxes drawn yet.';
}

/* ============================================================
   STUDIO stage
   ============================================================ */
WS.curPage = 0;
WS.pageW = 612;

async function paintStage() {
  const doc = WS.files[0].doc;
  const stage = $('#stage'); if (!stage) return;
  const pno = (WS.curPage ?? 0) + 1;
  const page = await doc.getPage(pno);
  const vp0 = page.getViewport({ scale: 1 });
  const maxW = Math.min(620, $('.studio').clientWidth - 36);
  const scale = maxW / vp0.width;
  const vp = page.getViewport({ scale });
  const c = document.createElement('canvas');
  c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
  await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
  stage.style.width = c.width + 'px'; stage.style.height = c.height + 'px';
  stage.innerHTML = '';
  stage.appendChild(c);
  WS.stageSize = { w: c.width, h: c.height };
  drawOverlays();

  $('#pgPrev').onclick = () => { WS.curPage = Math.max(0, WS.curPage - 1); paintStage(); $('#pgNum').textContent = WS.curPage + 1; };
  $('#pgNext').onclick = () => { WS.curPage = Math.min(WS.pages.length - 1, WS.curPage + 1); paintStage(); $('#pgNum').textContent = WS.curPage + 1; };
}

function drawOverlays() {
  const stage = $('#stage'); if (!stage) return;
  $$('.obj', stage).forEach(o => o.remove());
  const { w, h } = WS.stageSize;
  WS.overlays.filter(o => o.page === WS.curPage).forEach(o => {
    const el = document.createElement('div');
    el.className = 'obj' + (o.id === WS.selObj ? ' on' : '');
    el.dataset.oid = o.id;
    el.style.left = o.x * w + 'px'; el.style.top = o.y * h + 'px';
    if (o.type === 'text') {
      el.innerHTML = `<div class="obj-txt" style="font-size:${o.size * (w / WS.pageW)}px;color:${o.color};font-family:Helvetica,Arial,sans-serif;opacity:${o.opacity ?? 1}">${esc(o.text)}</div>`;
    } else if (o.type === 'rect') {
      el.style.width = o.w * w + 'px'; el.style.height = o.h * h + 'px';
      el.style.background = o.color; el.style.opacity = o.opacity ?? 1;
    } else {
      el.style.width = o.w * w + 'px'; el.style.height = o.h * h + 'px';
      el.innerHTML = `<img src="${o.data}" style="opacity:${o.opacity ?? 1}">`;
    }
    el.insertAdjacentHTML('beforeend', '<span class="hnd"></span><span class="del">×</span>');
    stage.appendChild(el);
    wireObj(el, o);
  });
}

function wireObj(el, o) {
  const { w, h } = WS.stageSize;
  let mode = null, s0 = null;
  el.onpointerdown = e => {
    if (e.target.classList.contains('del')) {
      WS.overlays = WS.overlays.filter(x => x.id !== o.id);
      WS.selObj = null; drawOverlays(); inspector(); return;
    }
    e.stopPropagation();
    WS.selObj = o.id;
    $$('.obj').forEach(x => x.classList.toggle('on', x.dataset.oid === o.id));
    inspector();
    mode = e.target.classList.contains('hnd') ? 'size' : 'move';
    s0 = { mx: e.clientX, my: e.clientY, x: o.x, y: o.y, w: o.w, h: o.h, size: o.size };
    el.setPointerCapture(e.pointerId);
  };
  el.onpointermove = e => {
    if (!mode) return;
    const dx = (e.clientX - s0.mx) / w, dy = (e.clientY - s0.my) / h;
    if (mode === 'move') { o.x = clamp(s0.x + dx, -.1, 1); o.y = clamp(s0.y + dy, -.1, 1); }
    else if (o.type === 'text') { o.size = Math.max(6, s0.size + (e.clientX - s0.mx) * .35); }
    else { o.w = Math.max(.02, s0.w + dx); o.h = Math.max(.01, s0.h + dy); }
    drawOverlays(); 
  };
  el.onpointerup = () => { mode = null; };
}

function inspector() {
  const box = $('#insp'); if (!box) return;
  const o = WS.overlays.find(x => x.id === WS.selObj);
  if (!o) { box.innerHTML = `<p class="dim" style="font-size:12.5px;margin-top:6px">Select an element to edit it.</p>`; return; }
  box.innerHTML = `
    <div style="border-top:1px solid var(--line);margin:16px 0;padding-top:16px">
      <div class="row spread" style="margin-bottom:12px">
        <b style="font-size:13px">${o.type === 'text' ? 'Text' : o.type === 'rect' ? 'Box' : 'Image'}</b>
        <button class="btn btn-danger btn-sm" id="i_del">${IC.trash}</button>
      </div>
      ${o.type === 'text' ? `
        <div class="field"><label>Content</label><textarea class="inp" id="i_text" style="min-height:60px">${esc(o.text)}</textarea></div>
        <div class="field"><label>Size — <b id="i_sl">${Math.round(o.size)}</b>pt</label><input type="range" id="i_size" min="6" max="90" value="${o.size}"></div>
        <div class="field"><label>Font</label><select class="inp" id="i_font">
          ${['Helvetica', 'HelveticaBold', 'TimesRoman', 'TimesRomanBold', 'Courier', 'CourierBold'].map(f => `<option ${o.font === f ? 'selected' : ''}>${f}</option>`).join('')}
        </select></div>` : ''}
      <div class="field"><label>Colour</label><input type="color" id="i_col" value="${o.color || '#000000'}" ${o.type === 'image' || o.type === 'sig' ? 'disabled style="opacity:.4"' : ''}></div>
      <div class="field"><label>Opacity — <b id="i_ol">${Math.round((o.opacity ?? 1) * 100)}</b>%</label><input type="range" id="i_op" min="5" max="100" value="${(o.opacity ?? 1) * 100}"></div>
      <button class="btn btn-g btn-sm btn-block" id="i_all">Apply to all pages</button>
    </div>`;
  const up = () => { drawOverlays(); };
  $('#i_text') && ($('#i_text').oninput = e => { o.text = e.target.value; up(); });
  $('#i_size') && ($('#i_size').oninput = e => { o.size = +e.target.value; $('#i_sl').textContent = e.target.value; up(); });
  $('#i_font') && ($('#i_font').onchange = e => { o.font = e.target.value; up(); });
  $('#i_col').oninput = e => { o.color = e.target.value; up(); };
  $('#i_op').oninput = e => { o.opacity = +e.target.value / 100; $('#i_ol').textContent = e.target.value; up(); };
  $('#i_del').onclick = () => { WS.overlays = WS.overlays.filter(x => x.id !== o.id); WS.selObj = null; drawOverlays(); inspector(); renderCount(); };
  $('#i_all').onclick = () => {
    WS.pages.forEach((_, i) => { if (i !== o.page) WS.overlays.push({ ...o, id: uid(), page: i }); });
    toast(`Copied to all ${WS.pages.length} pages`, 'ok'); renderCount();
  };
}
const renderCount = () => { const n = $('.pgnav .dim'); if (n) n.textContent = `${WS.overlays.length} element(s)`; };

function wireStudio() {
  WS.pageW = 612;
  if (!$('#a_text') || !$('#stage')) return;
  $('#a_text').onclick = () => {
    WS.overlays.push({ id: uid(), type: 'text', page: WS.curPage, x: .12, y: .12, text: 'Your text here', size: 18, color: '#111111', font: 'Helvetica', opacity: 1 });
    WS.selObj = WS.overlays.at(-1).id; drawOverlays(); inspector(); renderCount();
  };
  $('#a_rect').onclick = () => {
    WS.overlays.push({ id: uid(), type: 'rect', page: WS.curPage, x: .15, y: .2, w: .3, h: .08, color: '#ffd60a', opacity: .55 });
    WS.selObj = WS.overlays.at(-1).id; drawOverlays(); inspector(); renderCount();
  };
  $('#a_img').onclick = () => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/png,image/jpeg';
    i.onchange = () => {
      const f = i.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        const im = new Image();
        im.onload = () => {
          const ar = im.height / im.width;
          WS.overlays.push({ id: uid(), type: 'image', page: WS.curPage, x: .2, y: .2, w: .3, h: .3 * ar * (WS.stageSize.w / WS.stageSize.h), data: r.result, opacity: 1 });
          WS.selObj = WS.overlays.at(-1).id; drawOverlays(); inspector(); renderCount();
        };
        im.src = r.result;
      };
      r.readAsDataURL(f);
    };
    i.click();
  };
  $('#stage').onpointerdown = e => { if (e.target.id === 'stage' || e.target.tagName === 'CANVAS') { WS.selObj = null; drawOverlays(); inspector(); } };
  inspector();
}

/* ============================================================
   SIGNATURE
   ============================================================ */
function wireSign() {
  WS.pageW = 612;
  const area = $('#sigArea');
  if (!area || !$('#stage')) return;
  const render = mode => {
    if (mode === 'draw') {
      area.innerHTML = `<div class="field"><label>Draw your signature</label>
        <canvas class="sig-pad" id="pad" height="150"></canvas>
        <div class="row gap8 mt8"><button class="btn btn-g btn-sm grow" id="padClr">Clear</button>
        <button class="btn btn-p btn-sm grow" id="padUse">Use signature</button></div>
        <div class="row gap8 mt8"><label style="font-size:12px" class="dim">Ink</label><input type="color" id="ink" value="#0b1b3f" style="height:28px;flex:1"></div></div>`;
      const pad = $('#pad');
      pad.width = pad.clientWidth * 2; pad.height = 300;
      const ctx = pad.getContext('2d');
      ctx.scale(2, 2);
      ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      let drawing = false, empty = true;
      const pos = e => { const r = pad.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
      pad.onpointerdown = e => { drawing = true; empty = false; pad.setPointerCapture(e.pointerId); ctx.strokeStyle = $('#ink').value; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
      pad.onpointermove = e => { if (!drawing) return; const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); };
      pad.onpointerup = () => drawing = false;
      $('#padClr').onclick = () => { ctx.clearRect(0, 0, pad.width, pad.height); empty = true; };
      $('#padUse').onclick = () => {
        if (empty) return toast('Draw a signature first', 'bad');
        addSig(trimCanvas(pad));
      };
    } else if (mode === 'type') {
      const fonts = ['Dancing Script', 'Brush Script MT', 'Segoe Script', 'Georgia'];
      area.innerHTML = `<div class="field"><label>Type your name</label><input class="inp" id="sigTxt" placeholder="Aarav Sharma"></div>
        <div class="field"><label>Style</label><div class="col gap8" id="sigStyles">
          ${fonts.map((f, i) => `<button class="btn btn-g" data-f="${f}" style="justify-content:flex-start;font-family:'${f}',cursive;font-size:21px;padding:10px 14px">Signature</button>`).join('')}
        </div></div>
        <div class="field"><label>Ink</label><input type="color" id="ink" value="#0b1b3f"></div>
        <button class="btn btn-p btn-block btn-sm" id="typeUse">Use signature</button>`;
      let font = fonts[0];
      $('#sigStyles').onclick = e => { const b = e.target.closest('[data-f]'); if (!b) return; font = b.dataset.f; $$('#sigStyles button').forEach(x => x.style.borderColor = ''); b.style.borderColor = 'var(--brand)'; };
      $('#typeUse').onclick = () => {
        const t = $('#sigTxt').value.trim();
        if (!t) return toast('Type your name first', 'bad');
        const c = document.createElement('canvas');
        c.width = 900; c.height = 260;
        const x = c.getContext('2d');
        x.fillStyle = $('#ink').value;
        x.font = `78px '${font}', cursive`;
        x.textBaseline = 'middle';
        x.fillText(t, 20, 135);
        addSig(trimCanvas(c));
      };
    } else {
      area.innerHTML = `<div class="dz" id="sigDz" style="padding:26px 14px">
        <div class="drop-ic" style="width:42px;height:42px;margin-bottom:10px">${IC.upload}</div>
        <h4 style="font-size:14px">Upload signature image</h4><p style="font-size:12.5px">Transparent PNG works best</p></div>`;
      dropZone($('#sigDz'), fs => {
        const r = new FileReader();
        r.onload = () => addSig(r.result);
        r.readAsDataURL(fs[0]);
      }, 'image/*');
    }
  };
  $('#o_src')?.addEventListener('seg', e => render(e.detail));
  render('draw');
}

function trimCanvas(c) {
  const ctx = c.getContext('2d');
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let t = c.height, l = c.width, r = 0, b = 0;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
    if (d[(y * c.width + x) * 4 + 3] > 8) { if (y < t) t = y; if (y > b) b = y; if (x < l) l = x; if (x > r) r = x; }
  }
  if (r <= l) return c.toDataURL('image/png');
  const p = 8, w = r - l + p * 2, h = b - t + p * 2;
  const o = document.createElement('canvas'); o.width = w; o.height = h;
  o.getContext('2d').drawImage(c, l - p, t - p, w, h, 0, 0, w, h);
  return o.toDataURL('image/png');
}

function addSig(dataUrl) {
  const im = new Image();
  im.onload = () => {
    const ar = im.height / im.width;
    const w = .28;
    WS.overlays.push({ id: uid(), type: 'sig', page: WS.curPage, x: .55, y: .75, w, h: w * ar * (WS.stageSize.w / WS.stageSize.h), data: dataUrl, opacity: 1 });
    WS.selObj = WS.overlays.at(-1).id;
    drawOverlays(); renderCount();
    toast('Signature placed — drag to position', 'ok');
  };
  im.src = dataUrl;
}

/* ============================================================
   METADATA
   ============================================================ */
async function loadMeta() {
  const m = await Engine.getMeta(WS.files[0].file);
  const f = id => `<div class="field"><label>${id[0].toUpperCase() + id.slice(1)}</label><input class="inp" id="m_${id}" value="${esc(m[id] || '')}"></div>`;
  $('#metaForm').innerHTML =
    ['title', 'author', 'subject', 'keywords', 'creator'].map(f).join('') +
    `<div class="card-2" style="font-size:12.5px;line-height:1.9">
      <div class="row spread"><span class="dim">Pages</span><b>${m.pages}</b></div>
      <div class="row spread"><span class="dim">Page size</span><b>${m.size}</b></div>
      <div class="row spread"><span class="dim">Producer</span><b style="max-width:18ch;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(m.producer || '—')}</b></div>
      <div class="row spread"><span class="dim">Created</span><b>${m.created ? fmtDate(m.created) : '—'}</b></div>
    </div>
    <button class="btn btn-danger btn-sm btn-block mt16" id="scrub">${IC.shield} Scrub all metadata</button>`;
  $('#scrub').onclick = () => { ['title', 'author', 'subject', 'keywords', 'creator'].forEach(k => $('#m_' + k).value = ''); toast('Fields cleared — click Save metadata', 'ok'); };
}

/* ============================================================
   Modals: text preview / OCR report
   ============================================================ */
function showTextPreview(txt, name) {
  const m = modal(`<h3 class="h-sm" style="margin-bottom:6px">Extracted text</h3>
    <p class="dim" style="font-size:12.5px;margin-bottom:14px">${txt.length.toLocaleString()} characters</p>
    <textarea class="inp mono" style="height:44vh;font-size:12px;line-height:1.55" readonly>${esc(txt)}</textarea>
    <div class="row gap8 mt16"><button class="btn btn-g grow" id="cp">${IC.copy} Copy</button>
    <button class="btn btn-p grow" id="dn">${IC.download} Download .txt</button></div>`, { wide: true });
  $('#cp', m.el).onclick = () => { navigator.clipboard.writeText(txt); toast('Copied to clipboard', 'ok'); };
  $('#dn', m.el).onclick = () => dl(new Blob([txt], { type: 'text/plain' }), name);
}

function showOcrReport(rows, good, total) {
  const pct = Math.round(good / total * 100);
  modal(`<h3 class="h-sm" style="margin-bottom:4px">Document scan report</h3>
    <p class="dim" style="font-size:12.5px;margin-bottom:16px">Text-layer coverage analysis</p>
    <div class="card-2" style="text-align:center;margin-bottom:16px">
      <b style="font-size:38px;font-weight:850;color:${pct > 70 ? 'var(--ok)' : pct > 30 ? 'var(--warn)' : 'var(--bad)'}">${pct}%</b>
      <p class="dim" style="font-size:13px">${good} of ${total} pages are searchable</p>
    </div>
    <div style="max-height:36vh;overflow:auto"><table>
      <thead><tr><th>Page</th><th>Characters</th><th>Status</th></tr></thead>
      <tbody>${rows.map(r => `<tr><td>${r.page}</td><td class="mono">${r.chars.toLocaleString()}</td>
        <td><span class="chip ${r.ok ? 'chip-ok' : ''}" style="font-size:11px">${r.ok ? 'Searchable' : 'Image only'}</span></td></tr>`).join('')}</tbody>
    </table></div>
    ${pct < 100 ? `<p class="hint dim mt16" style="font-size:12px">Pages marked "image only" are scans without a text layer. Full raster OCR is available on the Team plan.</p>` : ''}`, { wide: true });
}
