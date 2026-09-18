/* ============================================================
   Tool registry + workspace controller
   ============================================================ */

const CATS = [
  ['Organize',  'organize'],
  ['Optimize',  'optimize'],
  ['Convert',   'convert'],
  ['Edit',      'edit'],
  ['Secure',    'secure'],
];

const TOOLS = [
  /* ---------------- ORGANIZE ---------------- */
  { id:'merge', name:'Merge PDF', cat:'organize', icon:'merge', multi:true, min:2,
    desc:'Combine any number of PDFs into one file, in your order.' },
  { id:'split', name:'Split PDF', cat:'organize', icon:'split',
    desc:'Break one PDF into several files by range or interval.' },
  { id:'organize', name:'Organize Pages', cat:'organize', icon:'organize',
    desc:'Drag to reorder, delete, duplicate and rotate pages.' },
  { id:'extract', name:'Extract Pages', cat:'organize', icon:'extract',
    desc:'Pull a page selection out into a brand-new PDF.' },
  { id:'rotate', name:'Rotate PDF', cat:'organize', icon:'rotate',
    desc:'Turn pages 90°, 180° or 270° — all or a selection.' },
  { id:'nup', name:'N-up / Booklet', cat:'organize', icon:'layers', pro:true,
    desc:'Place 2 or 4 pages onto each sheet to save paper.' },

  /* ---------------- OPTIMIZE ---------------- */
  { id:'compress', name:'Compress PDF', cat:'optimize', icon:'compress',
    desc:'Shrink file size with a quality dial you control.' },
  { id:'crop', name:'Crop Pages', cat:'optimize', icon:'crop', pro:true,
    desc:'Trim margins and whitespace off every page.' },
  { id:'repair', name:'Repair PDF', cat:'optimize', icon:'refresh',
    desc:'Rebuild a damaged or non-conforming PDF structure.' },

  /* ---------------- CONVERT ---------------- */
  { id:'toimg', name:'PDF → Images', cat:'convert', icon:'image',
    desc:'Export every page as a PNG or JPG at any resolution.' },
  { id:'fromimg', name:'Images → PDF', cat:'convert', icon:'file', multi:true, accept:'image/*',
    desc:'Turn JPG, PNG or screenshots into a single PDF.' },
  { id:'totext', name:'PDF → Text', cat:'convert', icon:'text',
    desc:'Extract the full text layer, layout preserved.' },
  { id:'ocr', name:'Scan & Read (OCR)', cat:'convert', icon:'scan', pro:true,
    desc:'Detect a text layer and report what is machine-readable.' },

  /* ---------------- EDIT ---------------- */
  { id:'studio', name:'PDF Studio', cat:'edit', icon:'text',
    desc:'Add text, images and boxes anywhere on the page.' },
  { id:'sign', name:'Sign PDF', cat:'edit', icon:'sign',
    desc:'Draw or type a signature and place it on any page.' },
  { id:'watermark', name:'Watermark', cat:'edit', icon:'watermark',
    desc:'Stamp text diagonally or tiled across every page.' },
  { id:'numbers', name:'Page Numbers', cat:'edit', icon:'number',
    desc:'Add numbering in any corner with custom formats.' },

  /* ---------------- SECURE ---------------- */
  { id:'redact', name:'Redact', cat:'secure', icon:'redact', pro:true,
    desc:'Permanently burn black boxes over sensitive content.' },
  { id:'protect', name:'Protect PDF', cat:'secure', icon:'lock', pro:true,
    desc:'Flatten and lock a document against casual editing.' },
  { id:'meta', name:'Metadata', cat:'secure', icon:'meta',
    desc:'Inspect and scrub title, author and hidden fields.' },
];

const toolById = id => TOOLS.find(t => t.id === id);

/* ============================================================
   Workspace — shared file state + page grid
   ============================================================ */
const WS = {
  tool: null,
  files: [],        // {id,file,name,size,pages,doc(pdfjs)}
  pages: [],        // organize model: {src, rot, del, key}
  overlays: [],     // studio model
  result: null,

  reset() { this.files = []; this.pages = []; this.overlays = []; this.result = null; },

  async addFiles(list) {
    const max = plan().size * 1024 * 1024;
    for (const f of list) {
      if (f.size > max) { toast(`${f.name} exceeds your ${plan().size} MB limit`, 'bad'); continue; }
      const rec = { id: uid(), file: f, name: f.name, size: f.size, pages: 0, doc: null };
      if (/pdf$/i.test(f.type) || /\.pdf$/i.test(f.name)) {
        try {
          rec.doc = await Engine.render(f);
          rec.pages = rec.doc.numPages;
        } catch (e) { toast(`Could not read ${f.name}`, 'bad'); continue; }
      }
      if (!this.tool.multi) this.files = [];
      this.files.push(rec);
    }
    if (this.tool.id === 'organize' || this.tool.id === 'redact' || this.tool.id === 'studio' || this.tool.id === 'sign') {
      await this.buildPages();
    }
    renderTool();
  },

  async buildPages() {
    const f = this.files[0];
    if (!f?.doc) { this.pages = []; return; }
    this.pages = [...Array(f.doc.numPages)].map((_, i) => ({ src: i, rot: 0, del: false, key: uid() }));
  },

  remove(id) {
    this.files = this.files.filter(f => f.id !== id);
    if (!this.files.length) { this.pages = []; this.overlays = []; }
    renderTool();
  },
};

/* ---------- thumbnail painter (lazy) ---------- */
async function paintThumbs(container, doc, opts = {}) {
  const nodes = $$('[data-pg]', container);
  for (const n of nodes) {
    if (n.dataset.painted) continue;
    const pno = +n.dataset.pg;
    try {
      const c = await Engine.thumb(doc, pno, opts.width || 190);
      const host = $('.thumb-img', n);
      if (host) { host.innerHTML = ''; host.appendChild(c); }
      n.dataset.painted = '1';
    } catch {}
  }
}

/* ============================================================
   Option panel builders (per tool)
   ============================================================ */
const OPT = {
  merge: () => `
    <div class="field"><label>Output file name</label>
      <input class="inp" id="o_name" value="merged.pdf"></div>
    <label class="chk"><input type="checkbox" id="o_bm" checked> Keep original page sizes</label>
    <p class="hint dim" style="font-size:12px">Drag the file cards on the left to change the merge order.</p>`,

  organize: () => `
    <div class="field"><label>Quick actions</label>
      <div class="col gap8">
        <button class="btn btn-g btn-sm" id="q_rev">${IC.refresh} Reverse page order</button>
        <button class="btn btn-g btn-sm" id="q_even">Keep even pages only</button>
        <button class="btn btn-g btn-sm" id="q_odd">Keep odd pages only</button>
        <button class="btn btn-g btn-sm" id="q_rotall">${IC.rotate} Rotate every page 90°</button>
      </div></div>
    <div class="card-2" id="org_sum" style="font-size:12.5px"></div>
    <p class="hint dim" style="font-size:12px;margin-top:10px">Drag thumbnails to reorder. Changes apply when you click Apply.</p>`,

  repair2: () => ``,

  split: () => `
    <div class="field"><label>Split mode</label>
      <div class="seg" id="o_mode">
        <button data-v="every" class="on">Every N pages</button>
        <button data-v="ranges">Custom ranges</button>
      </div></div>
    <div class="field" id="f_every"><label>Pages per file</label>
      <input class="inp" type="number" id="o_n" value="1" min="1"></div>
    <div class="field hide" id="f_ranges"><label>Ranges — one per line</label>
      <textarea class="inp" id="o_ranges" placeholder="1-3&#10;4-8&#10;9-"></textarea>
      <p class="hint">Each line becomes a separate PDF inside a ZIP.</p></div>`,

  extract: () => `
    <div class="field"><label>Pages to extract</label>
      <input class="inp" id="o_range" placeholder="1-3, 7, 10-">
      <p class="hint">Blank = all pages. Use commas and dashes.</p></div>
    <div class="field"><label>Output name</label><input class="inp" id="o_name" value="extracted.pdf"></div>`,

  rotate: () => `
    <div class="field"><label>Rotation</label>
      <div class="seg" id="o_deg">
        <button data-v="90" class="on">90° ↻</button><button data-v="180">180°</button><button data-v="270">270° ↺</button>
      </div></div>
    <div class="field"><label>Apply to pages</label>
      <input class="inp" id="o_range" placeholder="All pages"></div>`,

  nup: () => `
    <div class="field"><label>Pages per sheet</label>
      <div class="seg" id="o_per"><button data-v="2" class="on">2-up</button><button data-v="4">4-up</button></div></div>
    <p class="hint dim" style="font-size:12px">Great for handouts and saving paper. Page order is preserved left-to-right, top-to-bottom.</p>`,

  compress: () => `
    <div class="field"><label>Compression level</label>
      <div class="seg" id="o_lvl">
        <button data-v="low">Light</button><button data-v="mid" class="on">Balanced</button><button data-v="high">Extreme</button>
      </div></div>
    <div class="field"><label>Image quality — <b id="ql">62</b>%</label>
      <input type="range" id="o_q" min="20" max="95" value="62"></div>
    <div class="field"><label>Render scale — <b id="sl">1.35</b>×</label>
      <input type="range" id="o_s" min="80" max="250" value="135"></div>
    <label class="chk"><input type="checkbox" id="o_gray"> Convert to grayscale (smaller)</label>
    <p class="hint dim" style="font-size:12px;margin-top:8px">Pages are re-rendered as images, so text stops being selectable. Best for scans and image-heavy decks.</p>`,

  crop: () => `
    <p class="hint dim" style="font-size:12px;margin-bottom:12px">Trim as a percentage of each edge.</p>
    ${['top','right','bottom','left'].map(s => `
      <div class="field"><label>${s[0].toUpperCase()+s.slice(1)} — <b id="l_${s}">0</b>%</label>
        <input type="range" id="o_${s}" min="0" max="40" value="0"></div>`).join('')}
    <div class="field"><label>Apply to pages</label><input class="inp" id="o_range" placeholder="All pages"></div>`,

  repair: () => `<p class="hint dim" style="font-size:13px">PDFForge will parse the document and write a clean, fully-conforming copy — fixing broken cross-reference tables, stray objects and bad metadata.</p>`,

  toimg: () => `
    <div class="field"><label>Format</label>
      <div class="seg" id="o_fmt"><button data-v="image/png" class="on">PNG</button><button data-v="image/jpeg">JPG</button></div></div>
    <div class="field"><label>Resolution</label>
      <select class="inp" id="o_dpi">
        <option value="1">72 DPI — web</option>
        <option value="2" selected>150 DPI — standard</option>
        <option value="3">220 DPI — print</option>
        <option value="4">300 DPI — archival</option>
      </select></div>
    <div class="field"><label>JPG quality — <b id="jl">92</b>%</label>
      <input type="range" id="o_jq" min="40" max="100" value="92"></div>`,

  fromimg: () => `
    <div class="field"><label>Page size</label>
      <select class="inp" id="o_size">
        <option value="fit" selected>Fit to image</option><option value="a4">A4 portrait</option><option value="letter">US Letter</option>
      </select></div>
    <div class="field"><label>Margin — <b id="ml">0</b> pt</label>
      <input type="range" id="o_m" min="0" max="72" value="0"></div>
    <p class="hint dim" style="font-size:12px">Drag images on the left to set page order.</p>`,

  totext: () => `
    <div class="field"><label>Output</label>
      <div class="seg" id="o_lay"><button data-v="1" class="on">Preserve layout</button><button data-v="0">Raw stream</button></div></div>
    <label class="chk"><input type="checkbox" id="o_copy" checked> Show preview before download</label>`,

  ocr: () => `<p class="hint dim" style="font-size:13px">PDFForge scans each page for an embedded text layer and reports coverage, so you know whether a document is searchable or a flat scan.</p>`,

  studio: () => `
    <div class="field"><label>Add element</label>
      <div class="row gap8" style="flex-wrap:wrap">
        <button class="btn btn-g btn-sm" id="a_text">${IC.text} Text</button>
        <button class="btn btn-g btn-sm" id="a_img">${IC.image} Image</button>
        <button class="btn btn-g btn-sm" id="a_rect">${IC.redact} Box</button>
      </div></div>
    <div id="insp"></div>`,

  sign: () => `
    <div class="field"><label>Signature source</label>
      <div class="seg" id="o_src"><button data-v="draw" class="on">Draw</button><button data-v="type">Type</button><button data-v="upload">Upload</button></div></div>
    <div id="sigArea"></div>
    <p class="hint dim" style="font-size:12px;margin-top:10px">Create a signature, then click a page on the left to place it. Drag to move, corner handle to resize.</p>`,

  watermark: () => `
    <div class="field"><label>Watermark text</label><input class="inp" id="o_text" value="CONFIDENTIAL"></div>
    <div class="field"><label>Style</label>
      <div class="seg" id="o_mode"><button data-v="center" class="on">Diagonal</button><button data-v="tile">Tiled</button></div></div>
    <div class="row gap12">
      <div class="field grow"><label>Size — <b id="wl">60</b></label><input type="range" id="o_size" min="12" max="140" value="60"></div>
      <div class="field grow"><label>Angle — <b id="al">45</b>°</label><input type="range" id="o_ang" min="-90" max="90" value="45"></div>
    </div>
    <div class="field"><label>Opacity — <b id="ol">18</b>%</label><input type="range" id="o_op" min="3" max="100" value="18"></div>
    <div class="field"><label>Colour</label><input type="color" id="o_col" value="#ff3b30"></div>
    <div class="field"><label>Apply to pages</label><input class="inp" id="o_range" placeholder="All pages"></div>`,

  numbers: () => `
    <div class="field"><label>Position</label>
      <select class="inp" id="o_pos">
        <option value="bottom-center" selected>Bottom centre</option><option value="bottom-right">Bottom right</option>
        <option value="bottom-left">Bottom left</option><option value="top-center">Top centre</option>
        <option value="top-right">Top right</option><option value="top-left">Top left</option>
      </select></div>
    <div class="field"><label>Format</label>
      <select class="inp" id="o_fmt">
        <option value="{n}" selected>1, 2, 3</option><option value="Page {n}">Page 1</option>
        <option value="{n} / {total}">1 / 12</option><option value="Page {n} of {total}">Page 1 of 12</option>
        <option value="— {n} —">— 1 —</option>
      </select></div>
    <div class="row gap12">
      <div class="field grow"><label>Start at</label><input class="inp" type="number" id="o_start" value="1"></div>
      <div class="field grow"><label>Size</label><input class="inp" type="number" id="o_sz" value="11"></div>
    </div>
    <div class="field"><label>Colour</label><input type="color" id="o_col" value="#444444"></div>
    <label class="chk"><input type="checkbox" id="o_bold"> Bold</label>
    <div class="field mt8"><label>Apply to pages</label><input class="inp" id="o_range" placeholder="All pages"></div>`,

  redact: () => `
    <p class="hint dim" style="font-size:12.5px;margin-bottom:14px">Drag on any page thumbnail to draw a redaction box. Output is rasterised so the content underneath is <b>permanently destroyed</b>, not just hidden.</p>
    <div class="field"><label>Box colour</label><input type="color" id="o_col" value="#000000"></div>
    <div class="row gap8"><button class="btn btn-g btn-sm grow" id="r_clear">${IC.trash} Clear all boxes</button></div>
    <div class="card-2 mt16" id="r_count" style="font-size:13px">No boxes drawn yet.</div>`,

  protect: () => `
    <div class="field"><label>Owner password</label><input class="inp" type="password" id="o_pw" placeholder="••••••••"></div>
    <div class="field"><label>Restriction level</label>
      <select class="inp" id="o_lvl">
        <option value="print">Allow printing only</option>
        <option value="read" selected>Read only — no copy, no edit</option>
        <option value="strict">Strict — no print, no copy</option>
      </select></div>
    <label class="chk"><input type="checkbox" id="o_flat" checked> Flatten form fields &amp; annotations</label>
    <p class="hint dim" style="font-size:12px;margin-top:10px">Browser-side protection flattens content and marks restrictions. For certified AES-256 encryption, use the PDFForge API.</p>`,

  meta: () => `<div id="metaForm"><p class="dim" style="font-size:13px">Load a PDF to inspect its metadata.</p></div>`,
};

/* ============================================================
   RUN handlers
   ============================================================ */
const RUN = {
  async merge() {
    const bytes = await Engine.merge(WS.files.map(f => f.file));
    return { blob: pdfBlob(bytes), name: ($('#o_name')?.value || 'merged.pdf').replace(/(\.pdf)?$/i, '.pdf'),
      detail: `${WS.files.length} files → ${WS.files.reduce((a, f) => a + f.pages, 0)} pages` };
  },

  async split() {
    const f = WS.files[0];
    const mode = segVal('o_mode');
    let blob;
    if (mode === 'every') {
      const n = Math.max(1, +$('#o_n').value || 1);
      blob = await Engine.splitEvery(f.file, n);
      return { blob, name: `${baseName(f.name)}_split.zip`, detail: `every ${n} page(s)`, zip: true };
    }
    const lines = $('#o_ranges').value.split('\n').map(s => s.trim()).filter(Boolean);
    if (!lines.length) throw new Error('Add at least one range, e.g. 1-3');
    blob = await Engine.splitRanges(f.file, lines);
    return { blob, name: `${baseName(f.name)}_split.zip`, detail: `${lines.length} ranges`, zip: true };
  },

  async organize() {
    const keep = WS.pages.filter(p => !p.del);
    if (!keep.length) throw new Error('All pages are marked for deletion.');
    const bytes = await Engine.organize(WS.files[0].file, keep);
    return { blob: pdfBlob(bytes), name: `${baseName(WS.files[0].name)}_organized.pdf`,
      detail: `${keep.length} of ${WS.pages.length} pages kept` };
  },

  async extract() {
    const bytes = await Engine.extractPages(WS.files[0].file, $('#o_range').value);
    return { blob: pdfBlob(bytes), name: ($('#o_name').value || 'extracted.pdf').replace(/(\.pdf)?$/i, '.pdf'),
      detail: $('#o_range').value || 'all pages' };
  },

  async rotate() {
    const deg = +segVal('o_deg');
    const bytes = await Engine.rotateAll(WS.files[0].file, deg, $('#o_range').value);
    return { blob: pdfBlob(bytes), name: `${baseName(WS.files[0].name)}_rotated.pdf`, detail: `${deg}°` };
  },

  async nup() {
    const per = +segVal('o_per');
    const bytes = await Engine.nUp(WS.files[0].file, per);
    return { blob: pdfBlob(bytes), name: `${baseName(WS.files[0].name)}_${per}up.pdf`, detail: `${per} per sheet` };
  },

  async compress() {
    const f = WS.files[0];
    const q = +$('#o_q').value / 100, s = +$('#o_s').value / 100;
    const bytes = await Engine.compress(f.file, {
      quality: q, scale: s, grayscale: $('#o_gray').checked,
      onProgress: (i, n) => busy(true, 'Compressing…', `Page ${i} of ${n}`),
    });
    const pct = Math.round((1 - bytes.length / f.size) * 100);
    return { blob: pdfBlob(bytes), name: `${baseName(f.name)}_compressed.pdf`,
      detail: `${fmtBytes(f.size)} → ${fmtBytes(bytes.length)}`,
      note: pct > 0 ? `${pct}% smaller` : 'already optimised' };
  },

  async crop() {
    const g = id => +$('#o_' + id).value;
    const bytes = await Engine.crop(WS.files[0].file,
      { top: g('top'), right: g('right'), bottom: g('bottom'), left: g('left'), range: $('#o_range').value });
    return { blob: pdfBlob(bytes), name: `${baseName(WS.files[0].name)}_cropped.pdf`, detail: 'margins trimmed' };
  },

  async repair() {
    const bytes = await Engine.repair(WS.files[0].file);
    return { blob: pdfBlob(bytes), name: `${baseName(WS.files[0].name)}_repaired.pdf`, detail: 'structure rebuilt' };
  },

  async toimg() {
    const f = WS.files[0];
    const r = await Engine.toImages(f.file, {
      fmt: segVal('o_fmt'), scale: +$('#o_dpi').value, quality: +$('#o_jq').value / 100,
      onProgress: (i, n) => busy(true, 'Rendering pages…', `Page ${i} of ${n}`),
    });
    return { blob: r.zip, name: `${baseName(f.name)}_images.zip`, detail: `${r.pages} images`, zip: true };
  },

  async fromimg() {
    const bytes = await Engine.fromImages(WS.files.map(f => f.file), {
      pageSize: $('#o_size').value, margin: +$('#o_m').value,
      onProgress: (i, n) => busy(true, 'Building PDF…', `Image ${i} of ${n}`),
    });
    return { blob: pdfBlob(bytes), name: 'images.pdf', detail: `${WS.files.length} images` };
  },

  async totext() {
    const f = WS.files[0];
    const txt = await Engine.extractText(f.file, {
      layout: segVal('o_lay') === '1',
      onProgress: (i, n) => busy(true, 'Extracting text…', `Page ${i} of ${n}`),
    });
    if ($('#o_copy').checked) {
      busy(false);
      showTextPreview(txt, `${baseName(f.name)}.txt`);
    }
    return { blob: new Blob([txt], { type: 'text/plain' }), name: `${baseName(f.name)}.txt`,
      detail: `${txt.length.toLocaleString()} characters`, silent: $('#o_copy').checked };
  },

  async ocr() {
    const f = WS.files[0];
    const pdf = await Engine.render(f.file);
    const rows = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      busy(true, 'Scanning pages…', `Page ${i} of ${pdf.numPages}`);
      const tc = await (await pdf.getPage(i)).getTextContent();
      const chars = tc.items.reduce((a, it) => a + it.str.trim().length, 0);
      rows.push({ page: i, chars, ok: chars > 40 });
    }
    busy(false);
    const good = rows.filter(r => r.ok).length;
    showOcrReport(rows, good, pdf.numPages);
    const report = rows.map(r => `Page ${r.page}: ${r.chars} chars — ${r.ok ? 'searchable' : 'image only'}`).join('\n');
    return { blob: new Blob([report], { type: 'text/plain' }), name: `${baseName(f.name)}_ocr_report.txt`,
      detail: `${good}/${pdf.numPages} searchable`, silent: true };
  },

  async studio() {
    if (!WS.overlays.length) throw new Error('Add at least one element to the page.');
    const bytes = await Engine.applyOverlays(WS.files[0].file, WS.overlays);
    return { blob: pdfBlob(bytes), name: `${baseName(WS.files[0].name)}_edited.pdf`,
      detail: `${WS.overlays.length} elements flattened` };
  },

  async sign() {
    if (!WS.overlays.length) throw new Error('Place your signature on a page first.');
    const bytes = await Engine.applyOverlays(WS.files[0].file, WS.overlays);
    return { blob: pdfBlob(bytes), name: `${baseName(WS.files[0].name)}_signed.pdf`,
      detail: `${WS.overlays.length} signature(s)` };
  },

  async watermark() {
    const bytes = await Engine.watermark(WS.files[0].file, {
      text: $('#o_text').value || 'CONFIDENTIAL', mode: segVal('o_mode'),
      size: +$('#o_size').value, angle: +$('#o_ang').value,
      opacity: +$('#o_op').value / 100, color: $('#o_col').value, range: $('#o_range').value,
    });
    return { blob: pdfBlob(bytes), name: `${baseName(WS.files[0].name)}_watermarked.pdf`, detail: $('#o_text').value };
  },

  async numbers() {
    const bytes = await Engine.pageNumbers(WS.files[0].file, {
      pos: $('#o_pos').value, format: $('#o_fmt').value, start: +$('#o_start').value,
      size: +$('#o_sz').value, color: $('#o_col').value, bold: $('#o_bold').checked, range: $('#o_range').value,
    });
    return { blob: pdfBlob(bytes), name: `${baseName(WS.files[0].name)}_numbered.pdf`, detail: $('#o_fmt').value };
  },

  async redact() {
    const boxes = WS.pages.map(p => p.boxes || []);
    if (!boxes.some(b => b.length)) throw new Error('Draw at least one redaction box.');
    const bytes = await Engine.redact(WS.files[0].file, boxes,
      (i, n) => busy(true, 'Burning redactions…', `Page ${i} of ${n}`));
    const n = boxes.reduce((a, b) => a + b.length, 0);
    return { blob: pdfBlob(bytes), name: `${baseName(WS.files[0].name)}_redacted.pdf`, detail: `${n} areas destroyed` };
  },

  async protect() {
    const bytes = await Engine.permissions(WS.files[0].file, { level: $('#o_lvl').value });
    return { blob: pdfBlob(bytes), name: `${baseName(WS.files[0].name)}_protected.pdf`, detail: $('#o_lvl').value };
  },

  async meta() {
    const g = id => $('#m_' + id)?.value ?? '';
    const bytes = await Engine.setMeta(WS.files[0].file, {
      title: g('title'), author: g('author'), subject: g('subject'), keywords: g('keywords'), creator: g('creator'),
    });
    return { blob: pdfBlob(bytes), name: `${baseName(WS.files[0].name)}_meta.pdf`, detail: 'metadata updated' };
  },
};

const segVal = id => $(`#${id} button.on`)?.dataset.v;

function wireSegs(root) {
  $$('.seg', root).forEach(seg => {
    seg.onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      $$('button', seg).forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      seg.dispatchEvent(new CustomEvent('seg', { detail: b.dataset.v, bubbles: true }));
    };
  });
}
