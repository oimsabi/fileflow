import React, { useState, useRef, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowLeftRight, ArrowRight, Upload, FileUp, FileText, Image, Table2, ShieldCheck, Zap, Check, CheckCheck, Download, X, Plus, ChevronRight, CircleHelp, LockKeyhole, Layers, LoaderCircle, CheckCircle2, AlertCircle, FolderOpen, Settings2, Github, Menu } from 'lucide-react';
import { ACCEPT, INPUTS, extension, category, formatBytes, validateFile } from './model.mjs';
import { convertFile, zipFiles } from './converters.mjs';
import './style.css';

const groups = [
  { id: 'all', name: 'ไฟล์ทั้งหมด', icon: Layers },
  { id: 'image', name: 'รูปภาพ', icon: Image },
  { id: 'document', name: 'PDF และเอกสาร', icon: FileText },
  { id: 'data', name: 'ตารางข้อมูล', icon: Table2 },
];
const statusText = { ready: 'พร้อมแปลง', processing: 'กำลังแปลง', done: 'เสร็จแล้ว', error: 'แปลงไม่สำเร็จ' };
function FileIcon({ ext, size = 20 }) {
  const Icon = category(ext) === 'image' ? Image : category(ext) === 'data' ? Table2 : FileText;
  return <Icon size={size} strokeWidth={1.7} />;
}
function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function App() {
  const [page, setPage] = useState('convert');
  const [mode, setMode] = useState('all');
  const [files, setFiles] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [zipping, setZipping] = useState(false);
  const [quality, setQuality] = useState(90);
  const [scale, setScale] = useState(1.5);
  const [mobileNav, setMobileNav] = useState(false);
  const input = useRef(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const outputs = files.filter(f => f.status === 'done');
  const pending = files.filter(f => f.status === 'ready' || f.status === 'error');
  function navigate(next) { setPage(next); setMobileNav(false); }
  function addFiles(incoming) {
    if (busy) return;
    const next = [...files], errors = [];
    for (const file of Array.from(incoming)) {
      const error = validateFile(file, next);
      if (error) { errors.push(`${file.name}: ${error}`); continue; }
      if (next.some(f => f.file.name === file.name && f.file.size === file.size && f.file.lastModified === file.lastModified)) continue;
      next.push({ id: crypto.randomUUID(), file, target: INPUTS[extension(file.name)][0], status: 'ready', progress: 0 });
    }
    setFiles(next); setAlerts(errors); setPage('convert');
  }
  function updateFile(id, patch) { if (alive.current) setFiles(current => current.map(f => f.id === id ? { ...f, ...patch } : f)); }
  async function convert() {
    if (busy || !pending.length) return;
    setBusy(true); setAlerts([]);
    for (const item of pending) {
      updateFile(item.id, { status: 'processing', progress: 0, error: null });
      await new Promise(resolve => setTimeout(resolve, 30));
      try {
        const result = await convertFile(item.file, item.target, { quality: quality / 100, scale }, progress => updateFile(item.id, { progress }));
        updateFile(item.id, { status: 'done', result, progress: 100 });
      } catch (error) {
        const message = error.name === 'PasswordException' ? 'PDF มีรหัสผ่าน กรุณาปลดล็อกไฟล์ก่อน' : error.message || 'ไฟล์เสียหาย หรือมีข้อมูลที่ยังไม่รองรับ';
        updateFile(item.id, { status: 'error', error: message });
      }
    }
    if (alive.current) setBusy(false);
  }
  async function downloadAll() {
    setZipping(true);
    try { saveBlob(await zipFiles(outputs.map(f => f.result)), 'FileFlow-converted.zip'); }
    catch (error) { setAlerts([error.message]); }
    finally { setZipping(false); }
  }
  const visible = files.filter(f => mode === 'all' || category(extension(f.file.name)) === mode);
  const accept = mode === 'all' ? ACCEPT : Object.keys(INPUTS).filter(ext => category(ext) === mode).map(ext => `.${ext}`).join(',');
  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav ? 'is-open' : ''}`}>
      <button className="brand" onClick={() => navigate('convert')} aria-label="FileFlow หน้าแรก"><span className="brand-mark"><ArrowLeftRight size={24} /></span><span>File<span className="brand-light">Flow</span><span className="brand-dot">.</span></span></button>
      <div className="nav-label">WORKSPACE</div>
      <nav aria-label="เมนูหลัก">
        <button className={page === 'convert' ? 'active' : ''} onClick={() => navigate('convert')}><ArrowLeftRight size={19} />แปลงไฟล์<span className="nav-arrow"><ChevronRight size={15} /></span></button>
        <button className={page === 'formats' ? 'active' : ''} onClick={() => navigate('formats')}><Layers size={19} />รูปแบบที่รองรับ</button>
        <button className={page === 'help' ? 'active' : ''} onClick={() => navigate('help')}><CircleHelp size={19} />วิธีใช้งาน</button>
      </nav>
      <div className="sidebar-note"><span className="note-icon"><ShieldCheck size={23} /></span><strong>ไฟล์ของคุณ เป็นของคุณ</strong><p>ทุกการแปลงเกิดขึ้นในเบราว์เซอร์<br />ไฟล์ไม่ถูกส่งไปเก็บบนเซิร์ฟเวอร์</p><div className="note-bottom"><span className="dot" /> PRIVATE BY DESIGN</div></div>
      <div className="sidebar-bottom"><span className="tiny-logo">F</span><div><strong>ทำให้งานไฟล์ง่ายขึ้น</strong><span>FileFlow · เวอร์ชัน 1.0</span></div></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><div className="breadcrumb"><button className="mobile-menu icon-button" onClick={() => setMobileNav(!mobileNav)} aria-label="เปิดเมนู"><Menu size={21} /></button><span>พื้นที่ทำงาน</span><ChevronRight size={14} /><strong>{page === 'convert' ? 'แปลงไฟล์' : page === 'formats' ? 'รูปแบบที่รองรับ' : 'วิธีใช้งาน'}</strong></div><span className="local-badge"><span className="dot" />ประมวลผลบนอุปกรณ์ของคุณ</span></header>
      <main>
        {page === 'convert' ? <>
          <section className="hero">
            <div className="hero-copy"><div className="eyebrow"><span />A LITTLE LESS WORK. A LITTLE MORE FLOW.</div><h1>ทุกไฟล์ <span>ไปต่อได้.</span></h1><p>เปลี่ยนรูปแบบไฟล์ให้พร้อมสำหรับงานถัดไป<br />ง่าย รวดเร็ว และเป็นส่วนตัว ตั้งแต่ไฟล์แรก</p><div className="hero-pills"><span><Check size={14} /> ไม่ต้องสมัครสมาชิก</span><span><Check size={14} /> ใช้งานฟรี</span></div></div>
            <div className="hero-art" aria-hidden="true"><div className="art-orbit" /><div className="floating-file pdf-file"><FileText size={25} /><b>PDF</b><div className="fake-line" /><div className="fake-line short" /></div><div className="art-transfer"><ArrowLeftRight size={25} /></div><div className="floating-file image-file"><div className="mini-image"><Image size={38} strokeWidth={1.1} /></div><b>PNG</b></div><span className="art-spark spark-one">✦</span><span className="art-spark spark-two">+</span><div className="art-caption"><CheckCircle2 size={13} /> พร้อมสำหรับทุกขั้นตอน</div></div>
          </section>
          <section className="converter" aria-label="เครื่องมือแปลงไฟล์">
            <div className="section-heading"><div><h2>เริ่มแปลงไฟล์ของคุณ</h2><p>เลือกไฟล์ แล้วให้เราจัดการขั้นตอนต่อไป</p></div><span className="step-label"><b>01</b><span />UPLOAD & CONVERT</span></div>
            <div className="mode-tabs" role="group" aria-label="ประเภทไฟล์">{groups.map(({ id, name, icon: Icon }) => <button key={id} className={mode === id ? 'selected' : ''} aria-pressed={mode === id} onClick={() => setMode(id)}><Icon size={16} />{name}</button>)}</div>
            <div className="workspace-grid">
              <div className="upload-area">
                <input ref={input} type="file" multiple accept={accept} className="visually-hidden" id="file-input" disabled={busy} onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
                <button className={`dropzone ${dragging ? 'dragging' : ''}`} disabled={busy} onClick={() => input.current.click()} onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}>
                  <span className="upload-icon"><FileUp size={29} strokeWidth={1.6} /><span className="upload-plus"><Plus size={12} /></span></span><strong>{dragging ? 'วางไฟล์ที่นี่ได้เลย' : 'ลากไฟล์มาวางตรงนี้'}</strong><span className="drop-subtitle">หรือเลือกไฟล์จากอุปกรณ์ของคุณ</span><span className="choose-button"><Plus size={16} />เลือกไฟล์</span><span className="upload-limit">สูงสุด 25 MB ต่อไฟล์ · ครั้งละ 20 ไฟล์</span>
                </button>
                <div className="supported-line"><span>รองรับ</span>{['JPG', 'PNG', 'PDF', 'DOCX', 'XLSX', 'CSV'].map(x => <span className="format-chip" key={x}>{x}</span>)}<button onClick={() => navigate('formats')} aria-label="ดูรูปแบบที่รองรับทั้งหมด">+7</button></div>
              </div>
              <div className="settings-panel"><div className="settings-title"><Settings2 size={17} /><h3>ตั้งค่าการแปลง</h3></div><div className="setting-block"><label htmlFor="quality">คุณภาพภาพ <span>{quality}%</span></label><input id="quality" type="range" min="30" max="100" step="5" value={quality} disabled={busy} onChange={e => setQuality(+e.target.value)} /><div className="range-labels"><span>ไฟล์เล็กลง</span><span>คมชัดขึ้น</span></div><p>ใช้กับไฟล์ปลายทาง JPG และ WebP</p></div><div className="setting-block"><label htmlFor="resolution">ความละเอียด PDF → ภาพ</label><select id="resolution" value={scale} disabled={busy} onChange={e => setScale(+e.target.value)}><option value="1">มาตรฐาน · 72 DPI</option><option value="1.5">คมชัด · 108 DPI</option><option value="2">ละเอียดสูง · 144 DPI</option></select></div><div className="settings-tip"><LockKeyhole size={15} /><span>เลือกไฟล์เพื่อกำหนดรูปแบบปลายทาง<br />ให้แต่ละไฟล์ได้อย่างอิสระ</span></div></div>
            </div>
            {alerts.length > 0 && <div className="alert" role="alert"><AlertCircle size={18} /><div>{alerts.map((msg, i) => <p key={i}>{msg}</p>)}</div><button className="icon-button" aria-label="ปิดข้อความ" onClick={() => setAlerts([])}><X size={16} /></button></div>}
            {files.length > 0 && <div className="queue"><div className="queue-heading"><h3>ไฟล์ของคุณ <span>{files.length}</span></h3><button className="text-button" disabled={busy} onClick={() => { setFiles([]); setAlerts([]); }}>ล้างทั้งหมด</button></div>
              {visible.length === 0 && <p className="empty-filter">ไม่มีไฟล์ในหมวดนี้ เลือก “ไฟล์ทั้งหมด” เพื่อดูคิวของคุณ</p>}
              {visible.map(item => <div className={`file-row status-${item.status}`} key={item.id}><span className={`file-icon ${category(extension(item.file.name))}`}><FileIcon ext={extension(item.file.name)} /></span><div className="file-info"><strong title={item.file.name}>{item.file.name}</strong><div className="file-meta">{formatBytes(item.file.size)}<span>·</span><span className={`status-text ${item.status}`}>{item.status === 'done' ? <Check size={12} /> : null}{statusText[item.status]}{item.status === 'processing' ? ` ${item.progress}%` : ''}</span></div>{item.error && <p className="file-error" role="alert">{item.error}</p>}{item.status === 'processing' && <div className="progress"><span style={{ width: `${item.progress}%` }} /></div>}</div><ArrowRight size={15} className="file-arrow" /><select className="target-select" aria-label={`แปลง ${item.file.name} เป็น`} value={item.target} disabled={busy} onChange={e => updateFile(item.id, { target: e.target.value, status: 'ready', result: null, error: null })}>{INPUTS[extension(item.file.name)].map(ext => <option key={ext} value={ext}>{ext.toUpperCase()}</option>)}</select>{item.status === 'done' ? <button className="download-file icon-button" title={`ดาวน์โหลด ${item.result.name}`} aria-label={`ดาวน์โหลด ${item.result.name}`} onClick={() => saveBlob(item.result.blob, item.result.name)}><Download size={18} /></button> : <span className="row-spacer" />}<button className="remove-file icon-button" aria-label={`ลบ ${item.file.name}`} disabled={busy} onClick={() => setFiles(current => current.filter(f => f.id !== item.id))}><X size={17} /></button></div>)}
            </div>}
            <div className="action-bar"><div className="action-summary"><span className={`summary-icon ${outputs.length ? 'complete' : ''}`}>{outputs.length ? <CheckCheck size={18} /> : <FolderOpen size={18} />}</span><div><strong>{files.length ? `${files.length} ไฟล์ · ${formatBytes(files.reduce((sum, item) => sum + item.file.size, 0))}` : 'ยังไม่มีไฟล์ที่เลือก'}</strong><span>{busy ? 'กำลังแปลงไฟล์ กรุณาเปิดหน้านี้ไว้' : outputs.length ? `แปลงสำเร็จ ${outputs.length} จาก ${files.length} ไฟล์` : 'เพิ่มไฟล์เพื่อเริ่มต้นแปลง'}</span></div></div><div className="action-buttons">{outputs.length > 0 && <button className="secondary-button" onClick={downloadAll} disabled={busy || zipping}>{zipping ? <LoaderCircle size={17} className="spin" /> : <Download size={17} />}ดาวน์โหลด ZIP</button>}<button className="primary-button" onClick={convert} disabled={busy || !pending.length}>{busy ? <LoaderCircle size={17} className="spin" /> : <ArrowLeftRight size={17} />}{busy ? 'กำลังแปลงไฟล์...' : `แปลงไฟล์${pending.length ? ` (${pending.length})` : ''}`}<ArrowRight size={16} /></button></div></div>
          </section>
          <section className="benefits" aria-label="ข้อดีของ FileFlow"><div><span className="benefit-icon purple"><Zap size={20} /></span><div><h3>จากไฟล์หนึ่ง สู่อีกความเป็นไปได้</h3><p>ภาพ เอกสาร และตารางข้อมูล ในที่เดียว</p></div></div><div><span className="benefit-icon green"><ShieldCheck size={20} /></span><div><h3>ความเป็นส่วนตัวมาก่อน</h3><p>ไม่อัปโหลด ไม่เก็บไฟล์ ไม่ต้องมีบัญชี</p></div></div><div><span className="benefit-icon amber"><Layers size={20} /></span><div><h3>หลายไฟล์ ในครั้งเดียว</h3><p>จัดการเป็นคิว แล้วดาวน์โหลดรวมเป็น ZIP</p></div></div></section>
          <div className="quick-note"><CircleHelp size={15} /><span>PDF หลายหน้าจะแปลงเป็นภาพแยกหน้าใน ZIP · ไฟล์ GIF ใช้ภาพเฟรมแรก</span><button onClick={() => navigate('help')}>ดูรายละเอียด<ArrowRight size={13} /></button></div>
        </> : page === 'formats' ? <section className="information-page"><div className="eyebrow">MADE FOR YOUR EVERYDAY FILES</div><h1>รูปแบบที่รองรับ<span>.</span></h1><p className="page-intro">เลือกชนิดไฟล์ต้นทาง แล้วดูรูปแบบที่แปลงได้จริง</p><div className="formats-grid">{Object.entries(INPUTS).map(([ext, targets]) => <div className="format-card" key={ext}><span className={`file-icon ${category(ext)}`}><FileIcon ext={ext} /></span><h3>{ext.toUpperCase()}</h3><ArrowRight size={16} /><p>{targets.map(t => <span className="format-chip" key={t}>{t.toUpperCase()}</span>)}</p></div>)}</div><div className="info-callout"><CircleHelp size={20} /><div><strong>ข้อควรรู้ก่อนแปลง</strong><p>รองรับ Word รุ่น .docx และ Excel รุ่น .xlsx ไฟล์ .doc, .xls, HEIC, วิดีโอ และไฟล์มีรหัสผ่านยังไม่รองรับ การแปลงตารางใช้ค่าข้อมูลและผลสูตรที่บันทึกไว้ ไม่รักษารูปแบบหรือคำนวณสูตรใหม่</p></div></div><button className="primary-button" onClick={() => navigate('convert')}>เริ่มแปลงไฟล์<ArrowRight size={16} /></button></section> : <section className="information-page"><div className="eyebrow">LESS FRICTION. MORE FLOW.</div><h1>แค่สามขั้นตอน<span>.</span></h1><p className="page-intro">ไม่ต้องติดตั้งโปรแกรม ไม่ต้องสมัครสมาชิก</p><div className="help-steps">{[{ n: '01', title: 'เลือกไฟล์ของคุณ', body: 'ลากไฟล์มาวาง หรือกดเลือกไฟล์ เพิ่มได้ครั้งละ 20 ไฟล์ ขนาดไม่เกิน 25 MB ต่อไฟล์ และรวมไม่เกิน 100 MB', icon: Upload }, { n: '02', title: 'เลือกรูปแบบ แล้วกดแปลง', body: 'เลือกรูปแบบปลายทางที่อยู่ข้างแต่ละไฟล์ ปรับคุณภาพภาพได้ตามต้องการ แล้วกดแปลงไฟล์', icon: ArrowLeftRight }, { n: '03', title: 'ดาวน์โหลด พร้อมไปต่อ', body: 'ดาวน์โหลดทีละไฟล์ หรือดาวน์โหลดทั้งหมดเป็น ZIP ผลลัพธ์จะอยู่ในหน้านี้จนกว่าจะรีเฟรชหรือปิดหน้าเว็บ', icon: Download }].map(({ n, title, body, icon: Icon }) => <article key={n}><span className="help-number">{n}</span><Icon size={24} /><h3>{title}</h3><p>{body}</p></article>)}</div><div className="faq"><h2>สิ่งที่ควรรู้</h2>{[
          ['ไฟล์ถูกอัปโหลดไปที่ไหน?', 'ไฟล์ถูกอ่านและแปลงในเบราว์เซอร์บนอุปกรณ์ของคุณ ไม่มีเซิร์ฟเวอร์รับไฟล์ และไม่มีระบบเก็บประวัติไฟล์ เมื่อปิดหรือรีเฟรชหน้าเว็บ คิวและผลลัพธ์จะหายไป'],
          ['PDF สแกนแปลงเป็นข้อความได้ไหม?', 'การดึงข้อความรองรับ PDF ที่มีข้อความอยู่แล้ว ยังไม่มี OCR สำหรับเอกสารสแกนหรือข้อความที่อยู่ในภาพ PDF มีรหัสผ่านต้องปลดล็อกก่อน และรองรับสูงสุด 60 หน้า'],
          ['Word แปลงเป็นอะไรได้บ้าง?', 'DOCX แปลงเป็น TXT หรือ HTML ได้ HTML เก็บหัวข้อ ตาราง และภาพเท่าที่อ่านได้ แต่เค้าโครงอาจต่างจาก Word ยังไม่รองรับ Word เป็น PDF แบบรักษาหน้าต้นฉบับ'],
          ['Excel หลายชีตจะเป็นอย่างไร?', 'CSV/TSV จะได้ไฟล์แยกตามชีตใน ZIP ส่วน JSON หลายชีตใช้โครงสร้าง {sheets:[{name,rows}]} ชีตเดียวใช้ array ของแถว ข้อมูล CSV/TSV ส่งออกแบบ UTF-8 พร้อม BOM เพื่อเปิดภาษาไทยใน Excel และเติมอัญประกาศเดี่ยวให้ข้อความที่อาจถูกตีความเป็นสูตร'],
          ['TXT เป็น PDF รองรับภาษาไทยไหม?', 'รองรับข้อความ UTF-8 และภาษาไทยด้วยฟอนต์ของอุปกรณ์ PDF ที่ได้เป็นภาพของแต่ละหน้าขนาด A4 จึงค้นหาหรือเลือกข้อความใน PDF ไม่ได้'],
          ['มีข้อจำกัดเพิ่มเติมไหม?', 'ภาพไม่เกิน 20 ล้านพิกเซล ตารางไม่เกิน 100,000 แถวและ 1,000 คอลัมน์ เอกสาร Office หลังขยายข้อมูลภายในไม่เกิน 100 MB ผลลัพธ์รวมสำหรับ ZIP ไม่เกิน 100 MB ไฟล์ใหญ่ใกล้ขีดจำกัดอาจใช้เวลาและหน่วยความจำมาก แนะนำเบราว์เซอร์ Chrome หรือ Edge รุ่นใหม่'],
        ].map(([q, a]) => <details key={q}><summary>{q}<Plus size={16} /></summary><p>{a}</p></details>)}</div><button className="primary-button" onClick={() => navigate('convert')}>เริ่มแปลงไฟล์<ArrowRight size={16} /></button></section>}
        <footer><span>© {new Date().getFullYear()} FileFlow<span className="footer-separator">·</span>Make files flow.</span><span><LockKeyhole size={13} />สร้างมาเพื่อความเป็นส่วนตัว</span></footer>
      </main>
    </div>
  </div>;
}
createRoot(document.getElementById('root')).render(<App />);
