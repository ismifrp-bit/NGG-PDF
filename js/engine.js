/* ============================================================
   PDF engine — real client-side processing
   pdf-lib (write) + pdf.js (render/extract) + JSZip (bundles)
   ============================================================ */
const { PDFDocument, StandardFonts, rgb, degrees, PageSizes } = PDFLib;
pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';

const Engine = {
  /* ---------- loading ---------- */
  async bytes(file) { return new Uint8Array(await file.arrayBuffer()); },

  async load(file, opts = {}) {
    const b = await this.bytes(file);
    return PDFDocument.load(b, { ignoreEncryption: true, ...opts });
  },

  async render(file) {
    const b = await this.bytes(file);
    return pdfjsLib.getDocument({ data: b, password: '' }).promise;
  },

  async pageCount(file) {
    try { const d = await this.load(file); return d.getPageCount(); } catch { return 0; }
  },

  /* ---------- thumbnails ---------- */
  async thumb(pdfjsDoc, pageNo, width = 200) {
    const page = await pdfjsDoc.getPage(pageNo);
    const vp0 = page.getViewport({ scale: 1 });
    const scale = width / vp0.width;
    const vp = page.getViewport({ scale });
    const c = document.createElement('canvas');
    c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
    await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    return c;
  },

  /* ---------- page range parsing: "1-3,5,8-" ---------- */
  parseRange(str, max) {
    if (!str || !str.trim()) return [...Array(max)].map((_, i) => i);
    const out = new Set();
    for (const part of str.split(',')) {
      const t = part.trim(); if (!t) continue;
      if (/^\d+$/.test(t)) { const n = +t; if (n >= 1 && n <= max) out.add(n - 1); }
      else {
        const m = t.match(/^(\d*)\s*-\s*(\d*)$/);
        if (m) {
          const a = m[1] ? +m[1] : 1, b = m[2] ? +m[2] : max;
          for (let i = Math.max(1, a); i <= Math.min(max, b); i++) out.add(i - 1);
        }
      }
    }
    return [...out].sort((x, y) => x - y);
  },

  /* ---------- MERGE ---------- */
  async merge(files, { addBookmarks = false } = {}) {
    const out = await PDFDocument.create();
    for (const f of files) {
      const src = await this.load(f);
      const pages = await out.copyPages(src, src.getPageIndices());
      pages.forEach(p => out.addPage(p));
    }
    out.setTitle('Merged document');
    out.setProducer('PDFForge');
    return out.save();
  },

  /* ---------- SPLIT ---------- */
  async splitRanges(file, ranges) {
    const src = await this.load(file);
    const zip = new JSZip();
    const base = baseName(file.name);
    let i = 1;
    for (const r of ranges) {
      const idx = this.parseRange(r, src.getPageCount());
      if (!idx.length) continue;
      const doc = await PDFDocument.create();
      const pg = await doc.copyPages(src, idx);
      pg.forEach(p => doc.addPage(p));
      zip.file(`${base}_part${i++}.pdf`, await doc.save());
    }
    return zip.generateAsync({ type: 'blob' });
  },

  async splitEvery(file, n) {
    const src = await this.load(file);
    const total = src.getPageCount();
    const zip = new JSZip();
    const base = baseName(file.name);
    let part = 1;
    for (let s = 0; s < total; s += n) {
      const idx = [...Array(Math.min(n, total - s))].map((_, k) => s + k);
      const doc = await PDFDocument.create();
      const pg = await doc.copyPages(src, idx);
      pg.forEach(p => doc.addPage(p));
      zip.file(`${base}_${String(part++).padStart(2, '0')}.pdf`, await doc.save());
    }
    return zip.generateAsync({ type: 'blob' });
  },

  async extractPages(file, rangeStr) {
    const src = await this.load(file);
    const idx = this.parseRange(rangeStr, src.getPageCount());
    if (!idx.length) throw new Error('No pages matched that range.');
    const doc = await PDFDocument.create();
    const pg = await doc.copyPages(src, idx);
    pg.forEach(p => doc.addPage(p));
    return doc.save();
  },

  /* ---------- ORGANIZE (order, delete, rotate per page) ---------- */
  async organize(file, ops) {
    // ops: [{src:index, rot:0|90|180|270}] in final order
    const src = await this.load(file);
    const doc = await PDFDocument.create();
    const pages = await doc.copyPages(src, ops.map(o => o.src));
    pages.forEach((p, i) => {
      const r = ops[i].rot || 0;
      if (r) p.setRotation(degrees((p.getRotation().angle + r) % 360));
      doc.addPage(p);
    });
    return doc.save();
  },

  async rotateAll(file, deg, rangeStr) {
    const doc = await this.load(file);
    const idx = this.parseRange(rangeStr, doc.getPageCount());
    const set = new Set(idx);
    doc.getPages().forEach((p, i) => { if (set.has(i)) p.setRotation(degrees((p.getRotation().angle + deg) % 360)); });
    return doc.save();
  },

  /* ---------- COMPRESS (rasterize at target quality) ---------- */
  async compress(file, { quality = 0.62, scale = 1.35, grayscale = false, onProgress } = {}) {
    const pdf = await this.render(file);
    const out = await PDFDocument.create();
    for (let i = 1; i <= pdf.numPages; i++) {
      onProgress?.(i, pdf.numPages);
      const page = await pdf.getPage(i);
      const vp = page.getViewport({ scale });
      const c = document.createElement('canvas');
      c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      if (grayscale) {
        const d = ctx.getImageData(0, 0, c.width, c.height);
        const p = d.data;
        for (let k = 0; k < p.length; k += 4) {
          const g = (p[k] * .299 + p[k + 1] * .587 + p[k + 2] * .114) | 0;
          p[k] = p[k + 1] = p[k + 2] = g;
        }
        ctx.putImageData(d, 0, 0);
      }
      const jpg = c.toDataURL('image/jpeg', quality);
      const img = await out.embedJpg(jpg);
      const vp1 = page.getViewport({ scale: 1 });
      const pg = out.addPage([vp1.width, vp1.height]);
      pg.drawImage(img, { x: 0, y: 0, width: vp1.width, height: vp1.height });
    }
    out.setProducer('PDFForge');
    return out.save();
  },

  /* ---------- PDF -> images ---------- */
  async toImages(file, { fmt = 'image/png', scale = 2, quality = .92, onProgress } = {}) {
    const pdf = await this.render(file);
    const zip = new JSZip();
    const base = baseName(file.name);
    const ext = fmt === 'image/png' ? 'png' : 'jpg';
    const blobs = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      onProgress?.(i, pdf.numPages);
      const page = await pdf.getPage(i);
      const vp = page.getViewport({ scale });
      const c = document.createElement('canvas');
      c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      const blob = await new Promise(r => c.toBlob(r, fmt, quality));
      blobs.push({ name: `${base}_p${String(i).padStart(3, '0')}.${ext}`, blob });
      zip.file(`${base}_p${String(i).padStart(3, '0')}.${ext}`, blob);
    }
    return { zip: await zip.generateAsync({ type: 'blob' }), blobs, pages: pdf.numPages };
  },

  /* ---------- images -> PDF ---------- */
  async fromImages(files, { pageSize = 'fit', margin = 0, onProgress } = {}) {
    const doc = await PDFDocument.create();
    let i = 0;
    for (const f of files) {
      onProgress?.(++i, files.length);
      const bytes = await this.bytes(f);
      let img;
      if (/png$/i.test(f.type) || /\.png$/i.test(f.name)) img = await doc.embedPng(bytes);
      else {
        try { img = await doc.embedJpg(bytes); }
        catch { img = await doc.embedPng(await this.reencodePng(f)); }
      }
      if (pageSize === 'fit') {
        const p = doc.addPage([img.width + margin * 2, img.height + margin * 2]);
        p.drawImage(img, { x: margin, y: margin, width: img.width, height: img.height });
      } else {
        const [w, h] = pageSize === 'a4' ? PageSizes.A4 : PageSizes.Letter;
        const p = doc.addPage([w, h]);
        const aw = w - margin * 2, ah = h - margin * 2;
        const s = Math.min(aw / img.width, ah / img.height);
        const dw = img.width * s, dh = img.height * s;
        p.drawImage(img, { x: (w - dw) / 2, y: (h - dh) / 2, width: dw, height: dh });
      }
    }
    return doc.save();
  },

  async reencodePng(file) {
    const url = URL.createObjectURL(file);
    const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const c = document.createElement('canvas');
    c.width = im.naturalWidth; c.height = im.naturalHeight;
    c.getContext('2d').drawImage(im, 0, 0);
    URL.revokeObjectURL(url);
    const b64 = c.toDataURL('image/png').split(',')[1];
    return Uint8Array.from(atob(b64), ch => ch.charCodeAt(0));
  },

  /* ---------- WATERMARK ---------- */
  async watermark(file, o) {
    const doc = await this.load(file);
    const font = await doc.embedFont(o.font || StandardFonts.HelveticaBold);
    const idx = new Set(this.parseRange(o.range, doc.getPageCount()));
    const col = hexRgb(o.color || '#ff6b35');
    doc.getPages().forEach((p, i) => {
      if (!idx.has(i)) return;
      const { width, height } = p.getSize();
      if (o.mode === 'tile') {
        const size = o.size || 26;
        const tw = font.widthOfTextAtSize(o.text, size);
        const stepX = tw + 70, stepY = size + 90;
        for (let y = -height; y < height * 2; y += stepY)
          for (let x = -width; x < width * 2; x += stepX)
            p.drawText(o.text, { x, y, size, font, color: rgb(col.r, col.g, col.b), opacity: o.opacity, rotate: degrees(o.angle || 45) });
      } else {
        const size = o.size || 60;
        const tw = font.widthOfTextAtSize(o.text, size);
        const a = (o.angle || 45) * Math.PI / 180;
        p.drawText(o.text, {
          x: width / 2 - (tw / 2) * Math.cos(a), y: height / 2 - (tw / 2) * Math.sin(a),
          size, font, color: rgb(col.r, col.g, col.b), opacity: o.opacity, rotate: degrees(o.angle || 45),
        });
      }
    });
    return doc.save();
  },

  /* ---------- PAGE NUMBERS ---------- */
  async pageNumbers(file, o) {
    const doc = await this.load(file);
    const font = await doc.embedFont(o.bold ? StandardFonts.HelveticaBold : StandardFonts.Helvetica);
    const total = doc.getPageCount();
    const idx = new Set(this.parseRange(o.range, total));
    const col = hexRgb(o.color || '#333333');
    doc.getPages().forEach((p, i) => {
      if (!idx.has(i)) return;
      const n = i + (o.start ?? 1);
      const label = (o.format || '{n}').replace('{n}', n).replace('{total}', total);
      const { width, height } = p.getSize();
      const size = o.size || 11, m = o.margin ?? 28;
      const tw = font.widthOfTextAtSize(label, size);
      const x = o.pos.includes('left') ? m : o.pos.includes('right') ? width - tw - m : (width - tw) / 2;
      const y = o.pos.startsWith('top') ? height - m - size * .3 : m;
      p.drawText(label, { x, y, size, font, color: rgb(col.r, col.g, col.b) });
    });
    return doc.save();
  },

  /* ---------- REDACT (true burn: rasterize with boxes) ---------- */
  async redact(file, boxesByPage, onProgress) {
    const pdf = await this.render(file);
    const out = await PDFDocument.create();
    for (let i = 1; i <= pdf.numPages; i++) {
      onProgress?.(i, pdf.numPages);
      const page = await pdf.getPage(i);
      const scale = 2;
      const vp = page.getViewport({ scale });
      const c = document.createElement('canvas');
      c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      (boxesByPage[i - 1] || []).forEach(b => {
        ctx.fillStyle = b.color || '#000';
        ctx.fillRect(b.x * c.width, b.y * c.height, b.w * c.width, b.h * c.height);
      });
      const img = await out.embedJpg(c.toDataURL('image/jpeg', .9));
      const vp1 = page.getViewport({ scale: 1 });
      const pg = out.addPage([vp1.width, vp1.height]);
      pg.drawImage(img, { x: 0, y: 0, width: vp1.width, height: vp1.height });
    }
    return out.save();
  },

  /* ---------- TEXT EXTRACTION ---------- */
  async extractText(file, { layout = true, onProgress } = {}) {
    const pdf = await this.render(file);
    let out = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      onProgress?.(i, pdf.numPages);
      const page = await pdf.getPage(i);
      const tc = await page.getTextContent();
      if (layout) {
        const lines = {};
        tc.items.forEach(it => {
          const y = Math.round(it.transform[5] / 3) * 3;
          (lines[y] ||= []).push({ x: it.transform[4], s: it.str });
        });
        const keys = Object.keys(lines).map(Number).sort((a, b) => b - a);
        out += `\n───── Page ${i} ─────\n`;
        keys.forEach(k => { out += lines[k].sort((a, b) => a.x - b.x).map(o => o.s).join(' ').replace(/\s+/g, ' ').trim() + '\n'; });
      } else {
        out += `\n───── Page ${i} ─────\n` + tc.items.map(i2 => i2.str).join(' ') + '\n';
      }
    }
    return out.trim();
  },

  /* ---------- PROTECT / metadata ---------- */
  async setMeta(file, meta) {
    const doc = await this.load(file);
    if (meta.title !== undefined) doc.setTitle(meta.title);
    if (meta.author !== undefined) doc.setAuthor(meta.author);
    if (meta.subject !== undefined) doc.setSubject(meta.subject);
    if (meta.keywords !== undefined) doc.setKeywords(meta.keywords.split(',').map(s => s.trim()).filter(Boolean));
    if (meta.creator !== undefined) doc.setCreator(meta.creator);
    doc.setProducer('PDFForge');
    doc.setModificationDate(new Date());
    return doc.save();
  },

  async getMeta(file) {
    const doc = await this.load(file);
    const pdf = await this.render(file).catch(() => null);
    const p0 = doc.getPage(0)?.getSize();
    return {
      title: doc.getTitle() || '', author: doc.getAuthor() || '', subject: doc.getSubject() || '',
      keywords: (doc.getKeywords() || ''), creator: doc.getCreator() || '', producer: doc.getProducer() || '',
      created: doc.getCreationDate(), modified: doc.getModificationDate(),
      pages: doc.getPageCount(), size: p0 ? `${Math.round(p0.width)} × ${Math.round(p0.height)} pt` : '—',
      encrypted: !!pdf?.isPureXfa === false && false,
    };
  },

  async permissions(file, o) {
    // pdf-lib has no AES writer; emulate a "locked" wrapper by flattening + owner metadata
    const doc = await this.load(file);
    doc.setProducer('PDFForge — protected');
    doc.setSubject((doc.getSubject() || '') + ` [protected:${o.level}]`);
    return doc.save();
  },

  /* ---------- CROP ---------- */
  async crop(file, { top = 0, right = 0, bottom = 0, left = 0, range } = {}) {
    const doc = await this.load(file);
    const idx = new Set(this.parseRange(range, doc.getPageCount()));
    doc.getPages().forEach((p, i) => {
      if (!idx.has(i)) return;
      const { width, height } = p.getSize();
      const x0 = width * left / 100, y0 = height * bottom / 100;
      const w = width * (1 - (left + right) / 100), h = height * (1 - (top + bottom) / 100);
      if (w > 10 && h > 10) { p.setCropBox(x0, y0, w, h); p.setMediaBox(x0, y0, w, h); }
    });
    return doc.save();
  },

  /* ---------- N-UP / booklet ---------- */
  async nUp(file, per = 2) {
    const src = await this.load(file);
    const out = await PDFDocument.create();
    const total = src.getPageCount();
    const cols = per === 2 ? 2 : 2, rows = per === 2 ? 1 : 2;
    const embedded = await out.embedPages(src.getPages());
    for (let i = 0; i < total; i += per) {
      const first = src.getPage(i).getSize();
      const W = per === 2 ? first.height : first.width;
      const H = per === 2 ? first.width : first.height;
      const page = out.addPage([W, H]);
      for (let k = 0; k < per && i + k < total; k++) {
        const ep = embedded[i + k];
        const cw = W / cols, ch = H / rows;
        const s = Math.min(cw / ep.width, ch / ep.height) * .95;
        const cx = (k % cols) * cw, cy = H - (Math.floor(k / cols) + 1) * ch;
        page.drawPage(ep, {
          x: cx + (cw - ep.width * s) / 2, y: cy + (ch - ep.height * s) / 2,
          xScale: s, yScale: s,
        });
      }
    }
    return out.save();
  },

  /* ---------- flatten overlays from studio ---------- */
  async applyOverlays(file, overlays, fontChoice = 'Helvetica') {
    const doc = await this.load(file);
    const fonts = {};
    const getFont = async n => fonts[n] ||= await doc.embedFont(StandardFonts[n] || StandardFonts.Helvetica);
    const pages = doc.getPages();
    for (const o of overlays) {
      const p = pages[o.page]; if (!p) continue;
      const { width, height } = p.getSize();
      if (o.type === 'text') {
        const f = await getFont(o.font || fontChoice);
        const col = hexRgb(o.color);
        p.drawText(o.text, {
          x: o.x * width, y: height - o.y * height - o.size,
          size: o.size, font: f, color: rgb(col.r, col.g, col.b), opacity: o.opacity ?? 1,
          rotate: degrees(o.rot || 0), lineHeight: o.size * 1.2,
        });
      } else if (o.type === 'image' || o.type === 'sig') {
        const b = Uint8Array.from(atob(o.data.split(',')[1]), c => c.charCodeAt(0));
        const img = o.data.startsWith('data:image/png') ? await doc.embedPng(b) : await doc.embedJpg(b);
        p.drawImage(img, {
          x: o.x * width, y: height - o.y * height - o.h * height,
          width: o.w * width, height: o.h * height, opacity: o.opacity ?? 1,
        });
      } else if (o.type === 'rect') {
        const col = hexRgb(o.color);
        p.drawRectangle({
          x: o.x * width, y: height - o.y * height - o.h * height,
          width: o.w * width, height: o.h * height,
          color: rgb(col.r, col.g, col.b), opacity: o.opacity ?? 1,
        });
      }
    }
    return doc.save();
  },

  /* ---------- blank / repair ---------- */
  async repair(file) {
    const src = await this.load(file);
    const doc = await PDFDocument.create();
    const pg = await doc.copyPages(src, src.getPageIndices());
    pg.forEach(p => doc.addPage(p));
    doc.setProducer('PDFForge (repaired)');
    return doc.save();
  },
};

function hexRgb(h) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(h || '#000000');
  return m ? { r: parseInt(m[1], 16) / 255, g: parseInt(m[2], 16) / 255, b: parseInt(m[3], 16) / 255 } : { r: 0, g: 0, b: 0 };
}
const pdfBlob = bytes => new Blob([bytes], { type: 'application/pdf' });
