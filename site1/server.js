const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

// ============================================================
// Site 1: Books Site — Port 5001
// Luu tru bang Books, ho tro sort theo author_id
// ============================================================

const app = express();
const PORT = 5001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// ============================================================
// FAILURE SIMULATION — Dung de demo failure handling
// ============================================================
let isDelayed = false;
let delayMs = 0;

// Middleware: mo phong delay neu duoc bat (dat TRUOC cac route)
app.use((req, res, next) => {
  if (isDelayed && req.path !== '/status' && req.path !== '/recover' && req.path !== '/simulate-crash' && req.path !== '/simulate-delay') {
    console.log(`[Site 1] Simulating ${delayMs}ms network delay...`);
    setTimeout(next, delayMs);
  } else {
    next();
  }
});

// Doc du lieu Books tu CSV
const DATA_PATH = path.join(__dirname, 'data', 'books.csv');
let booksData = [];

function loadData() {
  const content = fs.readFileSync(DATA_PATH, 'utf-8');
  booksData = parse(content, { columns: true, skip_empty_lines: true, trim: true });
  booksData.forEach(row => {
    row.author_id = parseInt(row.author_id);
    row.book_id = parseInt(row.book_id);
    row.num_pages = parseInt(row.num_pages) || 0;
    row.average_rating = parseFloat(row.average_rating) || 0;
    row.ratings_count = parseInt(row.ratings_count) || 0;
  });
  console.log(`[Site 1] Loaded ${booksData.length} books`);
}

// GET / — Trang chu
app.get('/', (req, res) => {
  res.send(`
    <html>
    <head><title>Site 1 - Books</title>
    <style>
      body { font-family: 'Segoe UI', sans-serif; background: #0f172a; color: #e2e8f0; padding: 40px; }
      h1 { color: #38bdf8; }
      .status { color: #4ade80; font-weight: bold; }
    </style>
    </head>
    <body>
      <h1>Site 1 — Books</h1>
      <p>Port: <code>5001</code> | Status: <span class="status">ONLINE</span> | Records: <strong>${booksData.length}</strong></p>
    </body></html>
  `);
});

// GET /status — Health check
app.get('/status', (req, res) => {
  res.json({ site: 'Site 1 - Books', status: 'online', records: booksData.length });
});

// GET /data — Tra raw data (unsorted)
app.get('/data', (req, res) => {
  res.json({ data: booksData, count: booksData.length });
});

// POST /sort — Sort books theo author_id va tra ve sorted data
app.post('/sort', (req, res) => {
  const startTime = process.hrtime.bigint();
  const sorted = [...booksData].sort((a, b) => a.author_id - b.author_id);
  const endTime = process.hrtime.bigint();
  const sortTimeMs = Number(endTime - startTime) / 1_000_000;

  console.log(`[Site 1] Sorted ${sorted.length} books in ${sortTimeMs.toFixed(2)}ms`);

  res.json({
    data: sorted,
    count: sorted.length,
    sort_time_ms: sortTimeMs,
    site: 'Site 1',
    sorted_by: 'author_id',
  });
});

// POST /simulate-crash — Tat site de mo phong crash
app.post('/simulate-crash', (req, res) => {
  const crashDelay = req.body.delay || 1000;
  console.log(`\n[Site 1] CRASH SIMULATED! Server se tat sau ${crashDelay}ms...\n`);
  res.json({ message: 'Site 1 is crashing...', delay: crashDelay });
  setTimeout(() => {
    console.log('[Site 1] Server da tat.');
    process.exit(1);
  }, crashDelay);
});

// POST /simulate-delay — Mo phong network latency
app.post('/simulate-delay', (req, res) => {
  delayMs = req.body.delay || 3000;
  isDelayed = true;
  console.log(`[Site 1] Delay simulation ON: ${delayMs}ms`);
  res.json({ message: `Site 1 delay set to ${delayMs}ms`, delay: delayMs });
});

// POST /recover — Tat delay, phuc hoi binh thuong
app.post('/recover', (req, res) => {
  isDelayed = false;
  delayMs = 0;
  console.log(`[Site 1] Recovered — delay OFF`);
  res.json({ message: 'Site 1 recovered', delay: 0 });
});

// Khoi dong server
loadData();
const server = app.listen(PORT, () => {
  console.log(`\nSite 1 (Books) running at http://localhost:${PORT}`);
  console.log(`   Records: ${booksData.length} books`);
  console.log(`   Data: UNSORTED\n`);
});

process.on('SIGTERM', () => {
  console.log('[Site 1] Received SIGTERM, shutting down...');
  server.close(() => process.exit(0));
});
