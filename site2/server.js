const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const mergeJoin = require('../shared/merge_join');

// ============================================================
// Site 2: Authors Site — Port 5002
// Luu tru bang Authors, ho tro sort va merge-join (Strategy A)
// ============================================================

const app = express();
const PORT = 5002;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// ============================================================
// FAILURE SIMULATION
// ============================================================
let isDelayed = false;
let delayMs = 0;

app.use((req, res, next) => {
  if (isDelayed && req.path !== '/status' && req.path !== '/recover' && req.path !== '/simulate-crash' && req.path !== '/simulate-delay') {
    console.log(`[Site 2] Simulating ${delayMs}ms network delay...`);
    setTimeout(next, delayMs);
  } else {
    next();
  }
});

// Doc du lieu Authors tu CSV
const DATA_PATH = path.join(__dirname, 'data', 'authors.csv');
let authorsData = [];

function loadData() {
  const content = fs.readFileSync(DATA_PATH, 'utf-8');
  authorsData = parse(content, { columns: true, skip_empty_lines: true, trim: true });
  authorsData.forEach(row => {
    row.author_id = parseInt(row.author_id);
    row.books_count = parseInt(row.books_count) || 0;
  });
  console.log(`[Site 2] Loaded ${authorsData.length} authors`);
}

// GET / — Trang chu
app.get('/', (req, res) => {
  res.send(`
    <html>
    <head><title>Site 2 - Authors</title>
    <style>
      body { font-family: 'Segoe UI', sans-serif; background: #0f172a; color: #e2e8f0; padding: 40px; }
      h1 { color: #a78bfa; }
      .status { color: #4ade80; font-weight: bold; }
    </style>
    </head>
    <body>
      <h1>Site 2 — Authors</h1>
      <p>Port: <code>5002</code> | Status: <span class="status">ONLINE</span> | Records: <strong>${authorsData.length}</strong></p>
    </body></html>
  `);
});

// GET /status — Health check
app.get('/status', (req, res) => {
  res.json({ site: 'Site 2 - Authors', status: 'online', records: authorsData.length });
});

// GET /data — Tra raw data (unsorted)
app.get('/data', (req, res) => {
  res.json({ data: authorsData, count: authorsData.length });
});

// POST /sort — Sort authors theo author_id
app.post('/sort', (req, res) => {
  const startTime = process.hrtime.bigint();
  const sorted = [...authorsData].sort((a, b) => a.author_id - b.author_id);
  const endTime = process.hrtime.bigint();
  const sortTimeMs = Number(endTime - startTime) / 1_000_000;

  console.log(`[Site 2] Sorted ${sorted.length} authors in ${sortTimeMs.toFixed(2)}ms`);

  res.json({
    data: sorted,
    count: sorted.length,
    sort_time_ms: sortTimeMs,
    site: 'Site 2',
    sorted_by: 'author_id',
  });
});

// POST /merge-join — Strategy A: nhan sorted Books tu Site 1, merge voi local sorted Authors
app.post('/merge-join', (req, res) => {
  const { sorted_books } = req.body;

  if (!sorted_books || !Array.isArray(sorted_books)) {
    return res.status(400).json({ error: 'Missing sorted_books in request body' });
  }

  // Buoc 1: Sort local Authors
  const sortStart = process.hrtime.bigint();
  const sortedAuthors = [...authorsData].sort((a, b) => a.author_id - b.author_id);
  const sortEnd = process.hrtime.bigint();
  const localSortTimeMs = Number(sortEnd - sortStart) / 1_000_000;

  // Buoc 2: Merge Join
  const mergeStart = process.hrtime.bigint();
  const result = mergeJoin(sorted_books, sortedAuthors);
  const mergeEnd = process.hrtime.bigint();
  const mergeTimeMs = Number(mergeEnd - mergeStart) / 1_000_000;

  console.log(`[Site 2] Strategy A — Merge join: ${result.length} results in ${mergeTimeMs.toFixed(2)}ms`);

  res.json({
    data: result,
    count: result.length,
    local_sort_time_ms: localSortTimeMs,
    merge_time_ms: mergeTimeMs,
    strategy: 'A',
  });
});

// ============================================================
// FAILURE SIMULATION ENDPOINTS
// ============================================================
app.post('/simulate-crash', (req, res) => {
  const crashDelay = req.body.delay || 1000;
  console.log(`\n[Site 2] CRASH SIMULATED! Server se tat sau ${crashDelay}ms...\n`);
  res.json({ message: 'Site 2 is crashing...', delay: crashDelay });
  setTimeout(() => {
    console.log('[Site 2] Server da tat.');
    process.exit(1);
  }, crashDelay);
});

app.post('/simulate-delay', (req, res) => {
  delayMs = req.body.delay || 3000;
  isDelayed = true;
  console.log(`[Site 2] Delay simulation ON: ${delayMs}ms`);
  res.json({ message: `Site 2 delay set to ${delayMs}ms`, delay: delayMs });
});

app.post('/recover', (req, res) => {
  isDelayed = false;
  delayMs = 0;
  console.log(`[Site 2] Recovered — delay OFF`);
  res.json({ message: 'Site 2 recovered', delay: 0 });
});

// Khoi dong server
loadData();
const server = app.listen(PORT, () => {
  console.log(`\nSite 2 (Authors) running at http://localhost:${PORT}`);
  console.log(`   Records: ${authorsData.length} authors`);
  console.log(`   Data: UNSORTED\n`);
});

process.on('SIGTERM', () => {
  console.log('[Site 2] Received SIGTERM, shutting down...');
  server.close(() => process.exit(0));
});
