export const INPUTS = {
  png: ['jpg', 'webp', 'pdf'], jpg: ['png', 'webp', 'pdf'], jpeg: ['png', 'webp', 'pdf'],
  webp: ['png', 'jpg', 'pdf'], gif: ['png', 'jpg', 'webp', 'pdf'], bmp: ['png', 'jpg', 'webp', 'pdf'],
  pdf: ['png', 'jpg', 'txt'], docx: ['txt', 'html'], txt: ['pdf'],
  csv: ['xlsx', 'json', 'tsv'], tsv: ['xlsx', 'json', 'csv'],
  xlsx: ['csv', 'json', 'tsv'], json: ['csv', 'xlsx', 'tsv'],
};
export const ACCEPT = Object.keys(INPUTS).map(x => `.${x}`).join(',');
export const MAX_FILE = 25 * 1024 * 1024;
export const MAX_TOTAL = 100 * 1024 * 1024;
export const MAX_COUNT = 20;
export const extension = name => name.split('.').pop().toLowerCase();
export const stem = name => name.replace(/\.[^.]+$/, '') || 'converted';
export function category(ext) {
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].includes(ext)) return 'image';
  if (['pdf', 'docx', 'txt'].includes(ext)) return 'document';
  return 'data';
}
export function formatBytes(n) {
  return n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;
}
export function validateFile(file, files) {
  if (!INPUTS[extension(file.name)]) return 'ยังไม่รองรับไฟล์ชนิดนี้ ดูรายการรูปแบบที่รองรับได้ด้านล่าง';
  if (!file.size) return 'ไฟล์ว่าง กรุณาเลือกไฟล์ที่มีข้อมูล';
  if (file.size > MAX_FILE) return 'ไฟล์ใหญ่เกิน 25 MB';
  if (files.length >= MAX_COUNT) return 'เพิ่มได้สูงสุด 20 ไฟล์ต่อครั้ง';
  if (files.reduce((n, x) => n + (x.file || x).size, 0) + file.size > MAX_TOTAL) return 'ขนาดไฟล์รวมต้องไม่เกิน 100 MB';
  return null;
}
export function normalizeRows(input) {
  if (!Array.isArray(input) || !input.length) throw new Error('JSON ต้องเป็นอาร์เรย์ของออบเจ็กต์หรืออาร์เรย์ของแถวที่มีข้อมูล');
  if (input.length > 100000) throw new Error('รองรับตารางสูงสุด 100,000 แถว');
  if (input.every(Array.isArray)) return input.map(row => row.map(scalar));
  if (input.every(row => row && typeof row === 'object' && !Array.isArray(row))) {
    const headers = [...new Set(input.flatMap(Object.keys))];
    return [headers, ...input.map(row => headers.map(key => scalar(row[key] ?? '')))];
  }
  throw new Error('ทุกแถวใน JSON ต้องเป็นออบเจ็กต์เหมือนกัน หรืออาร์เรย์เหมือนกัน');
}
function scalar(value) {
  return value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : value;
}
export function uniqueName(name, used) {
  let result = name, i = 2;
  while (used.has(result)) {
    const dot = name.lastIndexOf('.');
    result = dot > 0 ? `${name.slice(0, dot)} (${i++})${name.slice(dot)}` : `${name} (${i++})`;
  }
  used.add(result);
  return result;
}
