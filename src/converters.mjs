import { category, extension, stem, normalizeRows, uniqueName } from './model.mjs';

const MAX_PIXELS = 20000000;
const MAX_OUTPUT = 100 * 1024 * 1024;
function canvasBlob(canvas, mime, quality) {
  return new Promise((resolve, reject) => canvas.toBlob(blob => {
    if (!blob || blob.type !== mime) reject(new Error('เบราว์เซอร์นี้ไม่รองรับการสร้างไฟล์ชนิดที่เลือก'));
    else resolve(blob);
  }, mime, quality));
}
function makeCanvas(width, height) {
  if (width * height > MAX_PIXELS) throw new Error('ภาพมีความละเอียดสูงเกิน 20 ล้านพิกเซล กรุณาลดขนาดก่อน');
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(width); canvas.height = Math.ceil(height);
  return canvas;
}
async function openImage(file) {
  const image = await createImageBitmap(file);
  try { return { image, canvas: makeCanvas(image.width, image.height) }; }
  catch (error) { image.close(); throw error; }
}
export async function zipFiles(files) {
  const { zipSync } = await import('fflate');
  const used = new Set(); const entries = {};
  let total = 0;
  for (const file of files) {
    total += file.blob.size;
    if (total > MAX_OUTPUT) throw new Error('ไฟล์ผลลัพธ์รวมเกิน 100 MB กรุณาดาวน์โหลดแยกไฟล์');
    entries[uniqueName(file.name, used)] = new Uint8Array(await file.blob.arrayBuffer());
  }
  return new Blob([zipSync(entries, { level: 0 })], { type: 'application/zip' });
}
async function checkOfficeArchive(buffer) {
  const { unzipSync } = await import('fflate');
  let total = 0, count = 0;
  unzipSync(new Uint8Array(buffer), { filter(entry) {
    total += entry.originalSize; count++;
    if (total > MAX_OUTPUT || count > 2000) throw new Error('เอกสารมีข้อมูลภายในมากเกินขีดจำกัด');
    return false;
  } });
}
export async function convertFile(file, target, options, report = () => {}) {
  const ext = extension(file.name), base = stem(file.name);
  report(10);
  let blob;
  if (category(ext) === 'image') {
    const { image, canvas } = await openImage(file);
    const ctx = canvas.getContext('2d');
    if (target === 'jpg' || target === 'pdf') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    ctx.drawImage(image, 0, 0); image.close(); report(50);
    if (target === 'pdf') {
      const { PDFDocument } = await import('pdf-lib');
      const pdf = await PDFDocument.create();
      const png = await canvasBlob(canvas, 'image/png');
      const embedded = await pdf.embedPng(await png.arrayBuffer());
      const landscape = canvas.width > canvas.height;
      const [w, h] = landscape ? [841.89, 595.28] : [595.28, 841.89];
      const size = embedded.scaleToFit(w - 48, h - 48);
      const page = pdf.addPage([w, h]);
      page.drawImage(embedded, { x: (w - size.width) / 2, y: (h - size.height) / 2, ...size });
      blob = new Blob([await pdf.save()], { type: 'application/pdf' });
    } else blob = await canvasBlob(canvas, `image/${target === 'jpg' ? 'jpeg' : target}`, options.quality);
    canvas.width = canvas.height = 0;
  } else if (ext === 'pdf') {
    const pdfjs = await import('pdfjs-dist');
    const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false, useSystemFonts: true });
    let pdf;
    try {
      pdf = await task.promise;
      if (pdf.numPages > 60) throw new Error('รองรับ PDF สูงสุด 60 หน้า กรุณาแบ่งไฟล์ก่อน');
      const outputs = []; const texts = []; let outputSize = 0;
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        if (target === 'txt') {
          const content = await page.getTextContent();
          texts.push(content.items.map(item => `${item.str || ''}${item.hasEOL ? '\n' : ' '}`).join('').trim());
        } else {
          const viewport = page.getViewport({ scale: options.scale });
          const canvas = makeCanvas(viewport.width, viewport.height);
          await page.render({ canvasContext: canvas.getContext('2d'), viewport, background: '#ffffff' }).promise;
          const image = await canvasBlob(canvas, target === 'jpg' ? 'image/jpeg' : 'image/png', options.quality);
          outputSize += image.size;
          if (outputSize > MAX_OUTPUT) throw new Error('ผลลัพธ์เกิน 100 MB กรุณาลดความละเอียดหรือแบ่ง PDF');
          outputs.push({ name: `${base}-page-${String(i).padStart(3, '0')}.${target}`, blob: image });
          canvas.width = canvas.height = 0;
        }
        page.cleanup(); report(10 + Math.round(i / pdf.numPages * 85));
      }
      if (target === 'txt') {
        if (!texts.some(text => text.trim())) throw new Error('PDF นี้ไม่มีข้อความที่ดึงออกได้ อาจเป็นไฟล์สแกน (ยังไม่รองรับ OCR)');
        blob = new Blob([texts.join('\n\n---\n\n')], { type: 'text/plain;charset=utf-8' });
      } else if (outputs.length === 1) return outputs[0];
      else return { name: `${base}-${target}.zip`, blob: await zipFiles(outputs) };
    } finally { await task.destroy(); }
  } else if (ext === 'docx') {
    const buffer = await file.arrayBuffer(); await checkOfficeArchive(buffer);
    const module = await import('mammoth/mammoth.browser.js');
    const mammoth = module.default || module;
    report(40);
    if (target === 'txt') {
      const result = await mammoth.extractRawText({ arrayBuffer: buffer });
      blob = new Blob([result.value], { type: 'text/plain;charset=utf-8' });
    } else {
      const { default: purify } = await import('dompurify');
      const result = await mammoth.convertToHtml({ arrayBuffer: buffer }, { externalFileAccess: false });
      const clean = purify.sanitize(result.value, { FORBID_TAGS: ['style', 'script', 'iframe', 'form'] });
      blob = new Blob([`<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Converted document</title><style>body{max-width:850px;margin:40px auto;padding:24px;font:16px/1.8 system-ui}img{max-width:100%}table{border-collapse:collapse}td,th{border:1px solid #ddd;padding:8px}</style><body>${clean}</body></html>`], { type: 'text/html;charset=utf-8' });
    }
  } else if (ext === 'txt') {
    blob = await textPdf(await file.text(), report);
  } else {
    blob = await convertTable(file, ext, target, report);
    if (blob.name) return blob;
  }
  report(100);
  return { name: `${base}.${target}`, blob };
}
function cellValue(cell) {
  const value = cell.value;
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    if ('formula' in value || 'sharedFormula' in value) return value.result ?? '';
    if ('richText' in value) return value.richText.map(x => x.text).join('');
    return value.text ?? value.error ?? '';
  }
  return value;
}
async function convertTable(file, ext, target, report) {
  const { default: Papa } = await import('papaparse');
  let sheets;
  if (ext === 'xlsx') {
    const buffer = await file.arrayBuffer(); await checkOfficeArchive(buffer);
    const { default: ExcelJS } = await import('exceljs');
    const book = new ExcelJS.Workbook(); await book.xlsx.load(buffer);
    sheets = book.worksheets.map(sheet => {
      if (sheet.rowCount > 100000 || sheet.columnCount > 1000) throw new Error('ตารางใหญ่เกิน 100,000 แถว หรือ 1,000 คอลัมน์');
      const rows = [];
      sheet.eachRow({ includeEmpty: true }, row => {
        const values = [];
        for (let col = 1; col <= sheet.columnCount; col++) values.push(cellValue(row.getCell(col)));
        rows.push(values);
      });
      return { name: sheet.name, rows };
    });
  } else if (ext === 'json') {
    const input = JSON.parse(await file.text());
    if (!Array.isArray(input) && Array.isArray(input?.sheets)) {
      sheets = input.sheets.map((sheet, i) => ({ name: String(sheet.name || `Sheet ${i + 1}`), rows: normalizeRows(sheet.rows) }));
    } else sheets = [{ name: 'Sheet 1', rows: normalizeRows(input) }];
  } else {
    const result = Papa.parse(await file.text(), { delimiter: ext === 'tsv' ? '\t' : ',', skipEmptyLines: 'greedy' });
    if (result.errors.length) throw new Error(`อ่านตารางไม่ได้: ${result.errors[0].message}`);
    sheets = [{ name: 'Sheet 1', rows: result.data }];
  }
  report(60);
  if (!sheets.length || !sheets.some(s => s.rows.length)) throw new Error('ไม่พบข้อมูลในตาราง');
  for (const sheet of sheets) {
    if (sheet.rows.length > 100000 || sheet.rows.some(row => row.length > 1000)) throw new Error('ตารางใหญ่เกินขีดจำกัด');
  }
  if (target === 'xlsx') {
    const { default: ExcelJS } = await import('exceljs');
    const book = new ExcelJS.Workbook(); const names = new Set();
    for (const sheet of sheets) {
      const safe = sheet.name.replace(/[\\/*?:\[\]]/g, '_').slice(0, 25) || 'Sheet';
      const name = uniqueName(safe, names);
      const ws = book.addWorksheet(name);
      ws.addRows(sheet.rows);
      ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6357ED' } };
      ws.columns.forEach(col => { col.width = 22; });
      ws.views = [{ state: 'frozen', ySplit: 1 }];
    }
    return new Blob([await book.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }
  if (target === 'json') return new Blob([JSON.stringify(sheets.length === 1 ? sheets[0].rows : { sheets }, null, 2)], { type: 'application/json;charset=utf-8' });
  const output = sheets.map(sheet => ({
    name: `${stem(file.name)}-${sheet.name.replace(/[\\/:*?"<>|]/g, '_')}.${target}`,
    blob: new Blob(['\uFEFF', Papa.unparse(sheet.rows, { delimiter: target === 'tsv' ? '\t' : ',', escapeFormulae: true })], { type: `${target === 'tsv' ? 'text/tab-separated-values' : 'text/csv'};charset=utf-8` }),
  }));
  return output.length === 1 ? output[0].blob : { name: `${stem(file.name)}-${target}.zip`, blob: await zipFiles(output) };
}
async function textPdf(text, report) {
  if (text.length > 200000) throw new Error('รองรับข้อความสูงสุด 200,000 ตัวอักษรต่อไฟล์');
  const { PDFDocument } = await import('pdf-lib');
  await document.fonts.ready;
  const pdf = await PDFDocument.create();
  const canvas = makeCanvas(1240, 1754), ctx = canvas.getContext('2d');
  ctx.font = '24px Tahoma, sans-serif';
  const lines = [];
  const segmenter = new Intl.Segmenter('th', { granularity: 'word' });
  for (const paragraph of text.replace(/\r\n?/g, '\n').split('\n')) {
    let line = '';
    for (const { segment } of segmenter.segment(paragraph)) {
      for (const char of segment) {
        if (ctx.measureText(line + char).width > 1080) { lines.push(line); line = ''; }
        line += char;
      }
    }
    lines.push(line);
  }
  const pageCount = Math.max(1, Math.ceil(lines.length / 43));
  if (pageCount > 60) throw new Error('ข้อความยาวเกิน 60 หน้า กรุณาแบ่งไฟล์ก่อน');
  for (let i = 0; i < pageCount; i++) {
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#202030';
    lines.slice(i * 43, i * 43 + 43).forEach((line, y) => ctx.fillText(line, 80, 100 + y * 36));
    const image = await pdf.embedPng(await (await canvasBlob(canvas, 'image/png')).arrayBuffer());
    pdf.addPage([595.28, 841.89]).drawImage(image, { x: 0, y: 0, width: 595.28, height: 841.89 });
    report(10 + Math.round((i + 1) / pageCount * 85));
  }
  canvas.width = canvas.height = 0;
  return new Blob([await pdf.save()], { type: 'application/pdf' });
}
