require('dotenv').config();

const express     = require('express');
const path        = require('path');
const PDFDocument = require('pdfkit');
const ExcelJS     = require('exceljs');
const { MongoClient } = require('mongodb');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Database ──────────────────────────────────────────────────────────────────

if (!process.env.MONGO_URI) {
  console.error('ERROR: MONGO_URI environment variable is not set.');
  process.exit(1);
}

let _db = null;

async function getDb() {
  if (_db) return _db;
  const client = new MongoClient(process.env.MONGO_URI);
  await client.connect();
  _db = client.db('tracker');
  return _db;
}

function submissions(db) {
  return db.collection('submissions');
}

// ── Pages ─────────────────────────────────────────────────────────────────────

const page = name => (req, res) =>
  res.sendFile(path.join(__dirname, 'public', name));

app.get('/',       page('client.html'));
app.get('/client', page('client.html'));
app.get('/admin',  page('admin.html'));

// ── Submission API ────────────────────────────────────────────────────────────

app.post('/api/submit', async (req, res) => {
  const { customerName, loadDate, preparedBy, flavors } = req.body;
  if (!customerName || !loadDate || !preparedBy) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  const submission = {
    id: Date.now().toString(),
    submittedAt: new Date().toISOString(),
    customerName,
    loadDate,
    preparedBy,
    flavors: flavors ?? [],
  };
  try {
    const db = await getDb();
    await submissions(db).insertOne(submission);
    res.json({ success: true, id: submission.id });
  } catch (err) {
    console.error('Submit error:', err);
    res.status(500).json({ error: 'Failed to save submission' });
  }
});

app.get('/api/submissions', async (req, res) => {
  try {
    const db   = await getDb();
    const list = await submissions(db)
      .find({}, { projection: { _id: 0 } })
      .sort({ submittedAt: -1 })
      .toArray();
    res.json(list);
  } catch (err) {
    console.error('Fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch submissions' });
  }
});

app.get('/api/submissions/:id', async (req, res) => {
  try {
    const db = await getDb();
    const s  = await submissions(db).findOne(
      { id: req.params.id },
      { projection: { _id: 0 } }
    );
    if (!s) return res.status(404).json({ error: 'Not found' });
    res.json(s);
  } catch (err) {
    console.error('Fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch submission' });
  }
});

app.delete('/api/submissions/:id', async (req, res) => {
  try {
    const db = await getDb();
    await submissions(db).deleteOne({ id: req.params.id });
    res.json({ success: true });
  } catch (err) {
    console.error('Delete error:', err);
    res.status(500).json({ error: 'Failed to delete submission' });
  }
});

// ── Pick Sheet PDF ────────────────────────────────────────────────────────────

app.get('/api/pick-sheet/:id/pdf', async (req, res) => {
  try {
    const db = await getDb();
    const s  = await submissions(db).findOne(
      { id: req.params.id },
      { projection: { _id: 0 } }
    );
    if (!s) return res.status(404).send('Submission not found');

    const safeName = s.customerName.replace(/[^a-z0-9]/gi, '-');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition',
      `attachment; filename="PickSheet-${safeName}-${s.loadDate}.pdf"`);

    generatePDF(res, s);
  } catch (err) {
    console.error('PDF error:', err);
    res.status(500).send('Failed to generate PDF');
  }
});

function formatLoadDate(d) {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return new Date(+y, +m - 1, +day).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
}

function generatePDF(res, s) {
  const doc = new PDFDocument({ size: 'A4', margin: 0 });
  doc.pipe(res);

  const PW = doc.page.width;
  const M  = 50;
  const CW = PW - 2 * M;

  // ── Header ────────────────────────────────────────────────────────────────
  const HDR_H = 88;
  doc.rect(0, 0, PW, HDR_H).fill('#1a2f4e');

  doc.fillColor('#93c5fd').fontSize(7).font('Helvetica-Bold')
     .text('247 PACKAGING CORP', M, 18, { characterSpacing: 2 });
  doc.fillColor('#ffffff').fontSize(23).font('Helvetica-Bold')
     .text('PICK SHEET', M, 31);
  doc.fillColor('rgba(255,255,255,0.45)').fontSize(8).font('Helvetica')
     .text(`Ref: #${s.id}`, M, 65);

  const printedStr =
    new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
    '  ' +
    new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  doc.fillColor('#93c5fd').fontSize(7).font('Helvetica-Bold')
     .text('PRINTED', PW - M - 150, 18, { width: 150, align: 'right', characterSpacing: 1 });
  doc.fillColor('rgba(255,255,255,0.75)').fontSize(8).font('Helvetica')
     .text(printedStr, PW - M - 150, 31, { width: 150, align: 'right' });

  // ── Info section ──────────────────────────────────────────────────────────
  let y = HDR_H;
  const INFO_H = 56;
  doc.rect(M, y, CW, INFO_H).fill('#f8fafc');
  doc.rect(M, y, CW, INFO_H).stroke('#e2e8f0').lineWidth(0.5);

  const infoItems = [
    ['CUSTOMER',    s.customerName],
    ['LOAD DATE',   formatLoadDate(s.loadDate)],
    ['PREPARED BY', s.preparedBy],
  ];
  const colW = CW / 3;

  infoItems.forEach(([label, value], i) => {
    if (i > 0) {
      doc.moveTo(M + i * colW, y + 8).lineTo(M + i * colW, y + INFO_H - 8)
         .strokeColor('#e2e8f0').lineWidth(0.75).stroke();
    }
    const cx = M + i * colW + 12;
    doc.fillColor('#94a3b8').fontSize(6.5).font('Helvetica-Bold')
       .text(label, cx, y + 10, { width: colW - 24, characterSpacing: 0.8 });
    doc.fillColor('#1e293b').fontSize(10).font('Helvetica-Bold')
       .text(value || '—', cx, y + 24, { width: colW - 24 });
  });

  y += INFO_H + 20;

  // ── Flavor table ──────────────────────────────────────────────────────────
  doc.fillColor('#94a3b8').fontSize(6.5).font('Helvetica-Bold')
     .text('FLAVOR DETAILS', M, y, { characterSpacing: 1 });
  y += 14;

  const cols = [
    ['#',         28,     'center'],
    ['FLAVOR',    90,     'left'  ],
    ['BATCH #',   82,     'left'  ],
    ['PALLETS',   54,     'center'],
    ['CANS',      54,     'center'],
    ['CASES',     54,     'center'],
    ['CAN SPEC',  133.28, 'left'  ],
  ];
  const HDR_ROW  = 24;
  const DATA_ROW = 22;

  doc.rect(M, y, CW, HDR_ROW).fill('#1a2f4e');
  let cx = M;
  cols.forEach(([label, w, align]) => {
    doc.fillColor('#ffffff').fontSize(7).font('Helvetica-Bold')
       .text(label, cx + 5, y + 8, { width: w - 10, align, characterSpacing: 0.4 });
    cx += w;
  });
  y += HDR_ROW;

  const flavors = s.flavors ?? [];
  flavors.forEach((f, i) => {
    const note  = f.note?.trim() || '';
    const rowH  = note ? 34 : DATA_ROW;
    const textY = note ? y + 3 : y + 6;

    doc.rect(M, y, CW, rowH).fill(i % 2 === 0 ? '#ffffff' : '#f8fafc');
    doc.rect(M, y, CW, rowH).stroke('#e5e7eb').lineWidth(0.4);

    const vals = [
      String(i + 1), f.flavor || '—', f.batchNumber || '—',
      f.pallets || '0', f.cans || '0', f.cases || '0', f.canSpec || '—',
    ];
    cx = M;
    vals.forEach((val, j) => {
      doc.fillColor('#1e293b').fontSize(9).font('Helvetica')
         .text(val, cx + 5, textY, { width: cols[j][1] - 10, align: cols[j][2], lineBreak: false });
      cx += cols[j][1];
    });

    if (note) {
      doc.fillColor('#94a3b8').fontSize(7.5).font('Helvetica-Oblique')
         .text(`Note: ${note}`, M + cols[0][1] + 5, y + 20,
           { width: CW - cols[0][1] - 10, lineBreak: false });
    }

    y += rowH;
  });

  const totals = {
    pallets: flavors.reduce((n, f) => n + (+f.pallets || 0), 0),
    cans:    flavors.reduce((n, f) => n + (+f.cans    || 0), 0),
    cases:   flavors.reduce((n, f) => n + (+f.cases   || 0), 0),
  };
  doc.rect(M, y, CW, DATA_ROW).fill('#e8edf2');
  doc.rect(M, y, CW, DATA_ROW).stroke('#cbd5e1').lineWidth(0.75);
  const labelW = cols[0][1] + cols[1][1] + cols[2][1];
  doc.fillColor('#1a2f4e').fontSize(8).font('Helvetica-Bold')
     .text('TOTALS', M + 5, y + 7, { width: labelW - 10 });
  cx = M + labelW;
  [totals.pallets, totals.cans, totals.cases].forEach((n, i) => {
    doc.fillColor('#1a2f4e').fontSize(9).font('Helvetica-Bold')
       .text(String(n), cx + 5, y + 6, { width: cols[3 + i][1] - 10, align: 'center' });
    cx += cols[3 + i][1];
  });
  doc.fillColor('#94a3b8').fontSize(9).font('Helvetica')
     .text('—', cx + 5, y + 6, { width: cols[6][1] - 10 });
  y += DATA_ROW + 28;

  // ── Notes ─────────────────────────────────────────────────────────────────
  doc.moveTo(M, y).lineTo(M + CW, y).strokeColor('#e2e8f0').lineWidth(1.5).stroke();
  y += 18;

  doc.fillColor('#64748b').fontSize(6.5).font('Helvetica-Bold')
     .text('NOTES', M, y, { characterSpacing: 0.6 });
  y += 12;

  doc.rect(M, y, CW, 60).stroke('#cbd5e1').lineWidth(0.75);

  doc.end();
}

// ── Excel Export ──────────────────────────────────────────────────────────────

app.get('/api/export/excel', async (req, res) => {
  try {
    const db   = await getDb();
    const list = await submissions(db)
      .find({}, { projection: { _id: 0 } })
      .sort({ submittedAt: -1 })
      .toArray();

    const wb = new ExcelJS.Workbook();
    wb.creator = '247 Packaging Corp';
    wb.created = new Date();

    const ws = wb.addWorksheet('Load Submissions');

    ws.columns = [
      { header: 'Customer Name', key: 'customerName', width: 22 },
      { header: 'Load Date',     key: 'loadDate',     width: 14 },
      { header: 'Prepared By',   key: 'preparedBy',   width: 18 },
      { header: 'Submitted At',  key: 'submittedAt',  width: 24 },
      { header: 'Flavor',        key: 'flavor',       width: 18 },
      { header: 'Batch #',       key: 'batchNumber',  width: 16 },
      { header: 'Pallets',       key: 'pallets',      width: 10 },
      { header: 'Cans',          key: 'cans',         width: 10 },
      { header: 'Cases',         key: 'cases',        width: 10 },
      { header: 'Can Spec',      key: 'canSpec',      width: 16 },
      { header: 'Note',          key: 'note',         width: 30 },
    ];

    const headerRow = ws.getRow(1);
    headerRow.font      = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    headerRow.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1a2f4e' } };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.height    = 22;

    list.forEach(s => {
      const flavors = s.flavors ?? [];
      const submittedAt = new Date(s.submittedAt).toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });

      if (!flavors.length) {
        ws.addRow({
          customerName: s.customerName, loadDate: s.loadDate,
          preparedBy: s.preparedBy,     submittedAt,
          flavor: '', batchNumber: '', pallets: '', cans: '', cases: '', canSpec: '', note: '',
        });
      } else {
        flavors.forEach(f => {
          ws.addRow({
            customerName: s.customerName,
            loadDate:     s.loadDate,
            preparedBy:   s.preparedBy,
            submittedAt,
            flavor:       f.flavor,
            batchNumber:  f.batchNumber,
            pallets:      isNaN(+f.pallets) ? f.pallets : +f.pallets,
            cans:         isNaN(+f.cans)    ? f.cans    : +f.cans,
            cases:        isNaN(+f.cases)   ? f.cases   : +f.cases,
            canSpec:      f.canSpec,
            note:         f.note || '',
          });
        });
      }
    });

    ws.eachRow((row, rowNum) => {
      row.eachCell(cell => {
        cell.border = {
          top:    { style: 'thin', color: { argb: 'FFE5E7EB' } },
          bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          left:   { style: 'thin', color: { argb: 'FFE5E7EB' } },
          right:  { style: 'thin', color: { argb: 'FFE5E7EB' } },
        };
      });
      if (rowNum > 1) {
        const bg = rowNum % 2 === 0 ? 'FFF8FAFC' : 'FFFFFFFF';
        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      }
    });

    ws.views = [{ state: 'frozen', ySplit: 1 }];

    const date = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition',
      `attachment; filename="LoadSubmissions-${date}.xlsx"`);

    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Excel export error:', err);
    res.status(500).send('Failed to export');
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('\n  247 Packaging Corp — Logistics Tracker');
  console.log(`  http://localhost:${PORT}\n`);
  console.log('  /       Client form');
  console.log('  /admin  Admin dashboard\n');
});
