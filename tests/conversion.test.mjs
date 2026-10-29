import test from 'node:test';
import assert from 'node:assert/strict';
import { INPUTS, normalizeRows, validateFile, MAX_FILE, uniqueName } from '../src/model.mjs';
import { convertFile, zipFiles } from '../src/converters.mjs';
import { unzipSync, strFromU8 } from 'fflate';
import ExcelJS from 'exceljs';

const options = { quality: .9, scale: 1 };
test('file validation enforces actual type, size, count, and total limits', () => {
  assert.match(validateFile({ name: 'bad.exe', size: 10 }, []), /ยังไม่รองรับ/);
  assert.match(validateFile({ name: 'big.pdf', size: MAX_FILE + 1 }, []), /25 MB/);
  assert.match(validateFile({ name: 'zero.csv', size: 0 }, []), /ไฟล์ว่าง/);
  assert.match(validateFile({ name: 'ok.csv', size: 10 }, Array.from({ length: 20 }, () => ({ size: 1 }))), /20 ไฟล์/);
  assert.match(validateFile({ name: 'ok.csv', size: 10 }, [{ size: 100 * 1024 * 1024 }]), /100 MB/);
});
test('JSON object rows retain union of keys, Thai text, and nested values', () => {
  assert.deepEqual(normalizeRows([{ ชื่อ: 'น้ำ', meta: { a: 1 } }, { ชื่อ: 'ฝน', จำนวน: 5 }]), [['ชื่อ', 'meta', 'จำนวน'], ['น้ำ', '{"a":1}', ''], ['ฝน', '', 5]]);
  assert.throws(() => normalizeRows([1, 2]));
});
test('CSV round trip preserves Thai, commas, quotes, and newlines through XLSX', async () => {
  const file = new File(['ชื่อ,หมายเหตุ\r\nน้ำ,"a,b"\r\nฝน,"สอง\nบรรทัด"'], 'ข้อมูล.csv');
  const out = await convertFile(file, 'xlsx', options);
  const json = await convertFile(new File([out.blob], out.name), 'json', options);
  assert.deepEqual(JSON.parse(await json.blob.text()), [['ชื่อ', 'หมายเหตุ'], ['น้ำ', 'a,b'], ['ฝน', 'สอง\nบรรทัด']]);
});
test('JSON to CSV protects spreadsheet formulas and writes UTF-8 BOM', async () => {
  const out = await convertFile(new File([JSON.stringify([['=HYPERLINK("bad")', '+123', '-7', '@SUM(1)']])], 'formulas.json'), 'csv', options);
  const bytes = new Uint8Array(await out.blob.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 3)], [239, 187, 191]);
  const text = await out.blob.text();
  assert.match(text, /'=HYPERLINK/); assert.match(text, /'\+123/); assert.match(text, /'-7/); assert.match(text, /'@SUM/);
});
test('multiple Excel sheets become distinct CSV files in ZIP', async () => {
  const book = new ExcelJS.Workbook();
  book.addWorksheet('หนึ่ง').addRows([['ชื่อ', 'ค่า'], ['น้ำ', 1]]);
  book.addWorksheet('สอง').addRows([['ชื่อ', 'ค่า'], ['ฝน', 2]]);
  const out = await convertFile(new File([await book.xlsx.writeBuffer()], 'workbook.xlsx'), 'csv', options);
  assert.equal(out.name, 'workbook-csv.zip');
  const archive = unzipSync(new Uint8Array(await out.blob.arrayBuffer()));
  assert.deepEqual(Object.keys(archive), ['workbook-หนึ่ง.csv', 'workbook-สอง.csv']);
  assert.match(strFromU8(archive['workbook-สอง.csv']), /ฝน,2/);
});
test('cached formula values are exported without executing formulas', async () => {
  const book = new ExcelJS.Workbook(); const sheet = book.addWorksheet('Sheet1');
  sheet.addRow(['value']); sheet.addRow([{ formula: '2+3', result: 5 }]);
  const out = await convertFile(new File([await book.xlsx.writeBuffer()], 'formula.xlsx'), 'json', options);
  assert.deepEqual(JSON.parse(await out.blob.text()), [['value'], [5]]);
});
test('ZIP download keeps both files when output filenames collide', async () => {
  const blob = await zipFiles([{ name: 'test.txt', blob: new Blob(['a']) }, { name: 'test.txt', blob: new Blob(['b']) }]);
  const archive = unzipSync(new Uint8Array(await blob.arrayBuffer()));
  assert.deepEqual(Object.keys(archive), ['test.txt', 'test (2).txt']);
  const used = new Set(['a.csv']); assert.equal(uniqueName('a.csv', used), 'a (2).csv');
});
test('invalid table input produces an error, never a renamed file', async () => {
  await assert.rejects(convertFile(new File(['{bad'], 'bad.json'), 'csv', options));
  await assert.rejects(convertFile(new File(['not a zip'], 'bad.xlsx'), 'csv', options));
});
