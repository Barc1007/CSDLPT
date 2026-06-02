const axios = require('axios');

// ============================================================
// benchmark.js — Chạy benchmark so sánh các chiến lược
// 
// Strategy A: Site 1 gửi sorted Books → Site 2 (merge tại Site 2)
// Strategy B: Cả 2 site gửi sorted data → Site 3 (merge tại Site 3)
// Baseline:   Gộp tất cả data, sort tuần tự trên 1 site
// ============================================================

const SITE1 = 'http://localhost:5001';
const SITE2 = 'http://localhost:5002';
const SITE3 = 'http://localhost:5003';

const NUM_RUNS = 5; // Chạy nhiều lần để lấy trung bình

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Kiểm tra tất cả sites có online không
async function checkSites() {
  console.log('🔍 Kiểm tra kết nối các sites...\n');
  for (const [name, url] of [['Site 1', SITE1], ['Site 2', SITE2], ['Site 3', SITE3]]) {
    try {
      const res = await axios.get(`${url}/status`);
      console.log(`    ${name}: ${res.data.status} (${res.data.records || 'coordinator'} records)`);
    } catch (err) {
      console.error(`    ${name} OFFLINE — Hãy chạy "node run_all.js" trước!`);
      process.exit(1);
    }
  }
  console.log('');
}

// ============================================================
// Strategy A: Site 1 → sort → gửi sorted Books → Site 2 merge join
// ============================================================
async function runStrategyA() {
  const totalStart = Date.now();

  // Bước 1: Song song sort cả 2 site
  const [booksRes, authorsRes] = await Promise.all([
    axios.post(`${SITE1}/sort`),
    axios.post(`${SITE2}/sort`), // Site 2 cũng sort sẵn để so sánh
  ]);

  const parallelSortTime = Math.max(booksRes.data.sort_time_ms, authorsRes.data.sort_time_ms);
  const site1SortTime = booksRes.data.sort_time_ms;
  const site2SortTime = authorsRes.data.sort_time_ms;

  // Bước 2: Gửi sorted books từ Site 1 → Site 2
  const transferStart = Date.now();
  const mergeRes = await axios.post(`${SITE2}/merge-join`, {
    sorted_books: booksRes.data.data,
  });
  const transferAndMergeTime = Date.now() - transferStart;

  const totalTime = Date.now() - totalStart;

  return {
    strategy: 'A',
    description: 'Site 1 → sorted Books → Site 2 (merge tại Site 2)',
    site1_sort_ms: site1SortTime,
    site2_sort_ms: site2SortTime,
    parallel_sort_ms: parallelSortTime,
    transfer_and_merge_ms: transferAndMergeTime,
    merge_ms: mergeRes.data.merge_time_ms,
    total_ms: totalTime,
    result_count: mergeRes.data.count,
  };
}

// ============================================================
// Strategy B: Cả 2 site → sort → gửi sorted data → Site 3 merge
// ============================================================
async function runStrategyB() {
  const totalStart = Date.now();

  // Bước 1: Song song sort cả 2 site
  const [booksRes, authorsRes] = await Promise.all([
    axios.post(`${SITE1}/sort`),
    axios.post(`${SITE2}/sort`),
  ]);

  const parallelSortTime = Math.max(booksRes.data.sort_time_ms, authorsRes.data.sort_time_ms);
  const site1SortTime = booksRes.data.sort_time_ms;
  const site2SortTime = authorsRes.data.sort_time_ms;

  // Bước 2: Gửi cả 2 sorted data → Site 3
  const transferStart = Date.now();
  const mergeRes = await axios.post(`${SITE3}/merge-join`, {
    sorted_books: booksRes.data.data,
    sorted_authors: authorsRes.data.data,
  });
  const transferAndMergeTime = Date.now() - transferStart;

  const totalTime = Date.now() - totalStart;

  return {
    strategy: 'B',
    description: 'Cả 2 site → sorted data → Site 3 (merge tại Site 3)',
    site1_sort_ms: site1SortTime,
    site2_sort_ms: site2SortTime,
    parallel_sort_ms: parallelSortTime,
    transfer_and_merge_ms: transferAndMergeTime,
    merge_ms: mergeRes.data.merge_time_ms,
    total_ms: totalTime,
    result_count: mergeRes.data.count,
  };
}

// ============================================================
// Baseline: Gộp tất cả, sort tuần tự trên 1 site
// ============================================================
async function runBaseline() {
  const totalStart = Date.now();

  // Lấy raw data từ cả 2 site
  const [booksRes, authorsRes] = await Promise.all([
    axios.get(`${SITE1}/data`),
    axios.get(`${SITE2}/data`),
  ]);

  // Gửi tất cả data → Site 3 để sort + join tuần tự
  const result = await axios.post(`${SITE3}/single-sort-join`, {
    books: booksRes.data.data,
    authors: authorsRes.data.data,
  });

  const totalTime = Date.now() - totalStart;

  return {
    strategy: 'Baseline',
    description: 'Gộp tất cả data → sort tuần tự trên 1 site',
    sequential_sort_ms: result.data.sort_time_ms,
    merge_ms: result.data.merge_time_ms,
    total_ms: totalTime,
    result_count: result.data.count,
  };
}

// ============================================================
// Chạy benchmark chính
// ============================================================
async function runBenchmark() {
  console.log('═══════════════════════════════════════════════════');
  console.log('   SORT-MERGE JOIN — DISTRIBUTED BENCHMARK');
  console.log('  Topic 19: Book-Authors');
  console.log('═══════════════════════════════════════════════════\n');

  await checkSites();

  const results = {
    strategy_A: [],
    strategy_B: [],
    baseline: [],
  };

  console.log(`Chạy benchmark ${NUM_RUNS} lần để lấy trung bình...\n`);

  for (let run = 1; run <= NUM_RUNS; run++) {
    console.log(`--- Run ${run}/${NUM_RUNS} ---`);

    // Strategy A
    const a = await runStrategyA();
    results.strategy_A.push(a);
    console.log(`   Strategy A: total=${a.total_ms}ms (sort=${a.parallel_sort_ms.toFixed(2)}ms, transfer+merge=${a.transfer_and_merge_ms}ms)`);

    await sleep(200);

    // Strategy B
    const b = await runStrategyB();
    results.strategy_B.push(b);
    console.log(`   Strategy B: total=${b.total_ms}ms (sort=${b.parallel_sort_ms.toFixed(2)}ms, transfer+merge=${b.transfer_and_merge_ms}ms)`);

    await sleep(200);

    // Baseline
    const bl = await runBaseline();
    results.baseline.push(bl);
    console.log(`   Baseline:   total=${bl.total_ms}ms (sort=${bl.sequential_sort_ms.toFixed(2)}ms, merge=${bl.merge_ms.toFixed(2)}ms)`);

    await sleep(200);
    console.log('');
  }

  // ============================================================
  // Tính trung bình
  // ============================================================
  const avg = (arr, key) => arr.reduce((sum, x) => sum + (x[key] || 0), 0) / arr.length;

  const summary = {
    timestamp: new Date().toISOString(),
    num_runs: NUM_RUNS,
    dataset: {
      books_count: results.strategy_A[0].result_count,
      note: 'Goodreads Books Dataset',
    },
    averages: {
      strategy_A: {
        parallel_sort_ms: avg(results.strategy_A, 'parallel_sort_ms').toFixed(2),
        transfer_and_merge_ms: avg(results.strategy_A, 'transfer_and_merge_ms').toFixed(2),
        total_ms: avg(results.strategy_A, 'total_ms').toFixed(2),
      },
      strategy_B: {
        parallel_sort_ms: avg(results.strategy_B, 'parallel_sort_ms').toFixed(2),
        transfer_and_merge_ms: avg(results.strategy_B, 'transfer_and_merge_ms').toFixed(2),
        total_ms: avg(results.strategy_B, 'total_ms').toFixed(2),
      },
      baseline: {
        sequential_sort_ms: avg(results.baseline, 'sequential_sort_ms').toFixed(2),
        total_ms: avg(results.baseline, 'total_ms').toFixed(2),
      },
    },
    speedup: {
      parallel_vs_sequential: (
        avg(results.baseline, 'sequential_sort_ms') /
        avg(results.strategy_A, 'parallel_sort_ms')
      ).toFixed(2),
      strategy_A_vs_baseline: (
        avg(results.baseline, 'total_ms') /
        avg(results.strategy_A, 'total_ms')
      ).toFixed(2),
      strategy_B_vs_baseline: (
        avg(results.baseline, 'total_ms') /
        avg(results.strategy_B, 'total_ms')
      ).toFixed(2),
    },
    raw_results: results,
  };

  // Lưu báo cáo
  try {
    await axios.post(`${SITE3}/save-benchmark`, summary);
  } catch (err) {
    console.error(' Không thể lưu benchmark report');
  }

  // In kết quả
  console.log('═══════════════════════════════════════════════════');
  console.log('  KẾT QUẢ BENCHMARK (Trung bình)');
  console.log('═══════════════════════════════════════════════════\n');

  console.log('┌──────────────┬────────────────┬──────────────────┬───────────┐');
  console.log('│   Strategy   │ Parallel Sort  │ Transfer + Merge │   Total   │');
  console.log('├──────────────┼────────────────┼──────────────────┼───────────┤');
  console.log(`│ Strategy A   │ ${summary.averages.strategy_A.parallel_sort_ms.padStart(11)}ms │ ${summary.averages.strategy_A.transfer_and_merge_ms.padStart(13)}ms │ ${summary.averages.strategy_A.total_ms.padStart(6)}ms │`);
  console.log(`│ Strategy B   │ ${summary.averages.strategy_B.parallel_sort_ms.padStart(11)}ms │ ${summary.averages.strategy_B.transfer_and_merge_ms.padStart(13)}ms │ ${summary.averages.strategy_B.total_ms.padStart(6)}ms │`);
  console.log(`│ Baseline     │ ${summary.averages.baseline.sequential_sort_ms.padStart(11)}ms │           N/A    │ ${summary.averages.baseline.total_ms.padStart(6)}ms │`);
  console.log('└──────────────┴────────────────┴──────────────────┴───────────┘\n');

  console.log(' SPEEDUP:');
  console.log(`   Sort song song vs tuần tự:  ${summary.speedup.parallel_vs_sequential}x`);
  console.log(`   Strategy A vs Baseline:     ${summary.speedup.strategy_A_vs_baseline}x`);
  console.log(`   Strategy B vs Baseline:     ${summary.speedup.strategy_B_vs_baseline}x`);
  console.log('');
  console.log(` Báo cáo đầy đủ: site3/results/benchmark_report.json`);
  console.log(` Kết quả join:    site3/results/joined_result.csv`);
  console.log('');
}

runBenchmark().catch(err => {
  console.error('Benchmark failed:', err.message);
  process.exit(1);
});
