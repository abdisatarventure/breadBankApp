// Renders the markdown policy docs in frontend/breadBank/public/legal/*.md into
// matching *.pdf files (served from Settings → Legal & compliance documents).
// Pure-JS (pdfkit), no system dependencies. Run: node backend/scripts/generate-legal-pdfs.mjs
import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LEGAL_DIR = path.resolve(__dirname, '../../frontend/breadBank/public/legal');

const DOCS = [
  'BreadBank-Information-Security-Policy',
  'BreadBank-Privacy-Policy',
  'BreadBank-Data-Retention-Policy',
];

const ACCENT = '#6C4ED4';
const INK = '#1a1a2e';
const MUTED = '#6b7280';

function stripMd(s) {
  return s.replace(/\*\*(.+?)\*\*/g, '$1').replace(/_(.+?)_/g, '$1').trim();
}

// Write a line of text with inline **bold** / _italic_ runs honoured.
function inline(doc, text, opts = {}) {
  const parts = text.split(/(\*\*[^*]+\*\*|_[^_]+_)/g).filter((p) => p !== '');
  parts.forEach((p, i) => {
    let font = 'Helvetica';
    let str = p;
    if (p.startsWith('**') && p.endsWith('**')) { font = 'Helvetica-Bold'; str = p.slice(2, -2); }
    else if (p.startsWith('_') && p.endsWith('_')) { font = 'Helvetica-Oblique'; str = p.slice(1, -1); }
    doc.font(font).text(str, { continued: i < parts.length - 1, ...opts });
  });
}

function table(doc, rows) {
  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  const cols = rows[0].length;
  const colW = width / cols;
  doc.fontSize(9);
  rows.forEach((row, ri) => {
    const y = doc.y;
    let maxH = 0;
    row.forEach((cell) => {
      const h = doc.heightOfString(stripMd(cell), { width: colW - 10 });
      if (h > maxH) maxH = h;
    });
    if (y + maxH + 8 > doc.page.height - doc.page.margins.bottom) { doc.addPage(); }
    const rowY = doc.y;
    row.forEach((cell, ci) => {
      doc.font(ri === 0 ? 'Helvetica-Bold' : 'Helvetica')
        .fillColor(ri === 0 ? INK : '#333')
        .text(stripMd(cell), left + ci * colW + 5, rowY + 3, { width: colW - 10 });
    });
    doc.y = rowY + maxH + 8;
    doc.moveTo(left, doc.y - 3).lineTo(left + width, doc.y - 3)
      .strokeColor('#e5e7eb').lineWidth(0.5).stroke();
  });
  doc.x = left;
  doc.fillColor(INK);
}

function render(name) {
  const mdPath = path.join(LEGAL_DIR, `${name}.md`);
  const pdfPath = path.join(LEGAL_DIR, `${name}.pdf`);
  const lines = fs.readFileSync(mdPath, 'utf8').split('\n');

  const doc = new PDFDocument({ size: 'LETTER', margins: { top: 64, bottom: 64, left: 64, right: 64 } });
  doc.pipe(fs.createWriteStream(pdfPath));

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trimEnd();

    if (line.trim() === '' || line.trim() === '---') { doc.moveDown(0.5); continue; }

    // Table block: collect consecutive '|' lines, drop the |---| separator row.
    if (line.trim().startsWith('|')) {
      const block = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) { block.push(lines[i]); i++; }
      i--;
      const rows = block
        .map((r) => r.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim()))
        .filter((cells) => !cells.every((c) => /^:?-{1,}:?$/.test(c) || c === ''));
      doc.moveDown(0.3);
      table(doc, rows);
      doc.moveDown(0.5);
      continue;
    }

    if (line.startsWith('# ')) {
      doc.moveDown(0.2).fillColor(INK).fontSize(22).font('Helvetica-Bold').text(line.slice(2));
      doc.moveTo(doc.page.margins.left, doc.y + 2)
        .lineTo(doc.page.width - doc.page.margins.right, doc.y + 2)
        .strokeColor(ACCENT).lineWidth(2).stroke();
      doc.moveDown(0.6);
      continue;
    }
    if (line.startsWith('## ')) {
      doc.moveDown(0.5).fillColor(ACCENT).fontSize(14).font('Helvetica-Bold').text(line.slice(3));
      doc.moveDown(0.2).fillColor(INK);
      continue;
    }
    if (line.startsWith('- ')) {
      doc.fontSize(10.5).fillColor(INK);
      const save = doc.x;
      doc.text('•  ', { continued: true, indent: 6 });
      inline(doc, line.slice(2), {});
      doc.x = save;
      continue;
    }
    // Italic-only meta line like "_Version 1.0 · …_"
    if (/^_.+_$/.test(line.trim())) {
      doc.fontSize(9.5).fillColor(MUTED).font('Helvetica-Oblique').text(stripMd(line));
      doc.moveDown(0.3).fillColor(INK);
      continue;
    }
    // Paragraph
    doc.fontSize(10.5).fillColor(INK);
    inline(doc, line, { lineGap: 1.5 });
    doc.moveDown(0.2);
  }

  doc.end();
  return pdfPath;
}

for (const name of DOCS) {
  const out = render(name);
  console.log('wrote', path.basename(out));
}
