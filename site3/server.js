const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { stringify } = require('csv-stringify/sync');
const mergeJoin = require('../shared/merge_join');

// ============================================================
// Site 3: Coordinator — Port 5003
// Dieu phoi merge join (Strategy B), baseline single-sort,
// va luu ket qua benchmark
// ============================================================

const app = express();
const PORT = 5003;

app.use(cors());
app.use(express.json({ limit: '100mb' }));

// Thu muc luu ket qua
const RESULTS_DIR = path.join(__dirname, 'results');
fs.mkdirSync(RESULTS_DIR, { recursive: true });

// GET / — Trang chu
app.get('/', (req, res) => {
  res.send(`
    <html>
    <head><title>Site 3 - Coordinator</title>
    <style>
      body { font-family: 'Segoe UI', sans-serif; background: #0f172a; color: #e2e8f0; padding: 40px; }
      h1 { color: #fbbf24; }
      .status { color: #4ade80; font-weight: bold; }
    </style>
    </head>
    <body>
      <h1>Site 3 — Coordinator</h1>
      <p>Port: <code>5003</code> | Status: <span class="status">ONLINE</span></p>
    </body></html>
  `);
});

// GET /status
app.get('/status', (req, res) => {
  res.json({ site: 'Site 3 - Coordinator', status: 'online' });
});

// POST /merge-join — Strategy B: nhan sorted data tu CA 2 site, merge tai day
app.post('/merge-join', (req, res) => {
  const { sorted_books, sorted_authors } = req.body;

  if (!sorted_books || !sorted_authors) {
    return res.status(400).json({ error: 'Missing sorted_books or sorted_authors' });
  }

  const mergeStart = process.hrtime.bigint();
  const result = mergeJoin(sorted_books, sorted_authors);
  const mergeEnd = process.hrtime.bigint();
  const mergeTimeMs = Number(mergeEnd - mergeStart) / 1_000_000;

  // Luu ket qua ra CSV
  if (result.length > 0) {
    const csv = stringify(result, { header: true });
    fs.writeFileSync(path.join(RESULTS_DIR, 'joined_result.csv'), csv);
  }

  console.log(`[Site 3] Strategy B — Merge join: ${result.length} results in ${mergeTimeMs.toFixed(2)}ms`);

  res.json({
    data: result,
    count: result.length,
    merge_time_ms: mergeTimeMs,
    strategy: 'B',
  });
});

// POST /single-sort-join — Baseline: gop 2 dataset roi sort tren 1 file
app.post('/single-sort-join', (req, res) => {
  const { books, authors } = req.body;

  if (!books || !authors) {
    return res.status(400).json({ error: 'Missing books or authors' });
  }

  const totalStart = process.hrtime.bigint();

  // Buoc 1: Sort ca 2 dataset tren cung 1 site (tuan tu)
  const sortStart = process.hrtime.bigint();
  const sortedBooks = [...books].sort((a, b) => parseInt(a.author_id) - parseInt(b.author_id));
  const sortedAuthors = [...authors].sort((a, b) => parseInt(a.author_id) - parseInt(b.author_id));
  const sortEnd = process.hrtime.bigint();
  const sortTimeMs = Number(sortEnd - sortStart) / 1_000_000;

  // Buoc 2: Merge join
  const mergeStart = process.hrtime.bigint();
  const result = mergeJoin(sortedBooks, sortedAuthors);
  const mergeEnd = process.hrtime.bigint();
  const mergeTimeMs = Number(mergeEnd - mergeStart) / 1_000_000;

  const totalEnd = process.hrtime.bigint();
  const totalTimeMs = Number(totalEnd - totalStart) / 1_000_000;

  console.log(`[Site 3] Single-sort baseline: sort=${sortTimeMs.toFixed(2)}ms, merge=${mergeTimeMs.toFixed(2)}ms, total=${totalTimeMs.toFixed(2)}ms`);

  res.json({
    count: result.length,
    sort_time_ms: sortTimeMs,
    merge_time_ms: mergeTimeMs,
    total_time_ms: totalTimeMs,
    method: 'single-sort (baseline)',
  });
});

// POST /save-benchmark — Luu ket qua benchmark
app.post('/save-benchmark', (req, res) => {
  const benchmarkData = req.body;
  const filePath = path.join(RESULTS_DIR, 'benchmark_report.json');
  fs.writeFileSync(filePath, JSON.stringify(benchmarkData, null, 2));
  console.log(`[Site 3] Benchmark report saved to ${filePath}`);
  res.json({ message: 'Benchmark saved', path: filePath });
});

// GET /results — Xem ket qua benchmark
app.get('/results', (req, res) => {
  const filePath = path.join(RESULTS_DIR, 'benchmark_report.json');
  if (fs.existsSync(filePath)) {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    res.json(data);
  } else {
    res.status(404).json({ error: 'No benchmark results yet. Run benchmark first.' });
  }
});

// Khoi dong server
app.listen(PORT, () => {
  console.log(`\nSite 3 (Coordinator) running at http://localhost:${PORT}`);
  console.log(`   Ready to receive merge-join requests\n`);
});
