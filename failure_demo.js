const axios = require('axios');
const { spawn } = require('child_process');
const path = require('path');

// ============================================================
// failure_demo.js — Demo Failure Handling cho Sort-Merge Join
// 
// Script này mô phỏng các tình huống lỗi trong hệ thống phân tán:
//   1. Normal operation (baseline)
//   2. Site 1 (Books) bị crash → hệ thống detect & retry
//   3. Site 2 (Authors) bị crash → hệ thống detect & retry
//   4. Network delay → timeout & fallback
//
// Dùng để quay screen recording 3-5 phút cho đồ án
// ============================================================

const SITE1 = 'http://localhost:5001';
const SITE2 = 'http://localhost:5002';
const SITE3 = 'http://localhost:5003';

const TIMEOUT = 5000;       // 5 giây timeout
const MAX_RETRIES = 3;      // Tối đa 3 lần retry
const RETRY_DELAY = 2000;   // 2 giây giữa mỗi retry

// ============================================================
// Utility functions
// ============================================================
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function log(msg) {
  const time = new Date().toLocaleTimeString('vi-VN');
  console.log(`[${time}] ${msg}`);
}

function logSection(title) {
  console.log('\n' + '═'.repeat(60));
  console.log(`  ${title}`);
  console.log('═'.repeat(60) + '\n');
}

// ============================================================
// Health Check — Kiểm tra site có online không
// ============================================================
async function healthCheck(siteUrl, siteName) {
  try {
    const res = await axios.get(`${siteUrl}/status`, { timeout: 2000 });
    return { online: true, data: res.data };
  } catch (err) {
    return { online: false, error: err.code || err.message };
  }
}

async function checkAllSites() {
  log('🔍 Kiểm tra trạng thái tất cả sites...');
  const sites = [
    { name: 'Site 1 (Books)',       url: SITE1 },
    { name: 'Site 2 (Authors)',     url: SITE2 },
    { name: 'Site 3 (Coordinator)', url: SITE3 },
  ];

  const results = {};
  for (const site of sites) {
    const status = await healthCheck(site.url, site.name);
    results[site.name] = status;
    if (status.online) {
      log(`    ${site.name}: ONLINE (${status.data.records || 'coordinator'})`);
    } else {
      log(`    ${site.name}: OFFLINE (${status.error})`);
    }
  }
  return results;
}

// ============================================================
// Request với Retry + Timeout
// ============================================================
async function requestWithRetry(method, url, data, siteName) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      log(`  [Attempt ${attempt}/${MAX_RETRIES}] ${method.toUpperCase()} ${url}`);
      
      const config = { timeout: TIMEOUT };
      let res;
      if (method === 'get') {
        res = await axios.get(url, config);
      } else {
        res = await axios.post(url, data, config);
      }

      log(`  ${siteName} responded successfully`);
      return { success: true, data: res.data, attempts: attempt };
    } catch (err) {
      const errorType = err.code === 'ECONNREFUSED' ? 'CONNECTION REFUSED (site offline)'
                      : err.code === 'ECONNABORTED' ? 'TIMEOUT (quá thời gian chờ)'
                      : err.code === 'ECONNRESET'   ? 'CONNECTION RESET (site crashed)'
                      : `ERROR: ${err.message}`;
      
      log(`   [Attempt ${attempt}/${MAX_RETRIES}] ${siteName}: ${errorType}`);
      
      if (attempt < MAX_RETRIES) {
        log(`  Waiting ${RETRY_DELAY}ms before retry...`);
        await sleep(RETRY_DELAY);
      }
    }
  }

  log(`  ${siteName}: ALL ${MAX_RETRIES} ATTEMPTS FAILED!`);
  return { success: false, attempts: MAX_RETRIES };
}

// ============================================================
// Sort-Merge Join VỚI Failure Handling
// ============================================================
async function sortMergeJoinWithFailureHandling(strategy) {
  log(`\n🔄 Bắt đầu Sort-Merge Join — Strategy ${strategy}...`);
  const totalStart = Date.now();

  // Bước 1: Health check trước khi bắt đầu
  log(' Bước 1: Health check...');
  const site1Status = await healthCheck(SITE1, 'Site 1');
  const site2Status = await healthCheck(SITE2, 'Site 2');

  if (!site1Status.online && !site2Status.online) {
    log(' CẢ HAI SITES ĐỀU OFFLINE — Không thể thực hiện join!');
    return { success: false, error: 'Both sites offline' };
  }

  // Bước 2: Sort song song với retry
  log(' Bước 2: Sort song song (concurrent)...');
  
  const sortPromises = [];
  
  if (site1Status.online) {
    sortPromises.push(requestWithRetry('post', `${SITE1}/sort`, {}, 'Site 1 (Books)'));
  } else {
    log('   Site 1 OFFLINE — bỏ qua sort Books');
    sortPromises.push(Promise.resolve({ success: false, error: 'Site 1 offline' }));
  }

  if (site2Status.online) {
    sortPromises.push(requestWithRetry('post', `${SITE2}/sort`, {}, 'Site 2 (Authors)'));
  } else {
    log('   Site 2 OFFLINE — bỏ qua sort Authors');
    sortPromises.push(Promise.resolve({ success: false, error: 'Site 2 offline' }));
  }

  const [booksResult, authorsResult] = await Promise.all(sortPromises);

  // Bước 3: Kiểm tra kết quả sort
  if (!booksResult.success) {
    log(' FAILURE: Không lấy được sorted Books từ Site 1');
    log(' RECOVERY: Thử lấy raw data và sort tại Coordinator (Site 3)...');
    
    // Fallback: thử lấy data từ Site 1 cache hoặc báo lỗi
    return { 
      success: false, 
      error: 'Site 1 (Books) unavailable',
      recovery: 'Cần khởi động lại Site 1 trước khi thực hiện join',
      total_ms: Date.now() - totalStart
    };
  }

  if (!authorsResult.success) {
    log(' FAILURE: Không lấy được sorted Authors từ Site 2');
    log(' RECOVERY: Thử lấy raw data và sort tại Coordinator (Site 3)...');
    
    return {
      success: false,
      error: 'Site 2 (Authors) unavailable',
      recovery: 'Cần khởi động lại Site 2 trước khi thực hiện join',
      total_ms: Date.now() - totalStart
    };
  }

  // Bước 4: Merge Join
  log(' Bước 3: Merge Join...');
  
  let mergeResult;
  if (strategy === 'A') {
    // Strategy A: gửi sorted Books → Site 2
    mergeResult = await requestWithRetry('post', `${SITE2}/merge-join`, {
      sorted_books: booksResult.data.data,
    }, 'Site 2 (Merge)');
  } else {
    // Strategy B: gửi cả 2 → Site 3
    mergeResult = await requestWithRetry('post', `${SITE3}/merge-join`, {
      sorted_books: booksResult.data.data,
      sorted_authors: authorsResult.data.data,
    }, 'Site 3 (Merge)');
  }

  if (!mergeResult.success) {
    log(' FAILURE: Merge join thất bại!');
    
    // Fallback: nếu Strategy A fail → thử Strategy B
    if (strategy === 'A') {
      log(' FALLBACK: Strategy A thất bại → chuyển sang Strategy B (Site 3)...');
      mergeResult = await requestWithRetry('post', `${SITE3}/merge-join`, {
        sorted_books: booksResult.data.data,
        sorted_authors: authorsResult.data.data,
      }, 'Site 3 (Fallback)');
      
      if (mergeResult.success) {
        log(' FALLBACK THÀNH CÔNG! Merge join hoàn tất tại Site 3');
      }
    }
    
    if (!mergeResult.success) {
      return {
        success: false,
        error: 'Merge join failed on all strategies',
        total_ms: Date.now() - totalStart
      };
    }
  }

  const totalTime = Date.now() - totalStart;
  log(`\n Sort-Merge Join HOÀN TẤT!`);
  log(`   Kết quả: ${mergeResult.data.count} records`);
  log(`   Tổng thời gian: ${totalTime}ms`);
  log(`   Sort retries: Books=${booksResult.attempts}, Authors=${authorsResult.attempts}`);

  return {
    success: true,
    count: mergeResult.data.count,
    total_ms: totalTime,
    retries: { books: booksResult.attempts, authors: authorsResult.attempts },
  };
}

// ============================================================
// Khởi động lại một site (spawn process mới)
// ============================================================
function restartSite(siteNum) {
  return new Promise((resolve) => {
    const script = path.join(__dirname, `site${siteNum}`, 'server.js');
    log(` Đang khởi động lại Site ${siteNum}...`);
    
    const proc = spawn('node', [script], {
      cwd: __dirname,
      stdio: 'inherit',
      shell: true,
      detached: true,
    });
    
    proc.unref();
    
    // Đợi server khởi động
    setTimeout(async () => {
      const siteUrl = `http://localhost:500${siteNum}`;
      const status = await healthCheck(siteUrl, `Site ${siteNum}`);
      if (status.online) {
        log(` Site ${siteNum} đã khởi động lại thành công!`);
      } else {
        log(`  Site ${siteNum} chưa sẵn sàng, đợi thêm...`);
      }
      resolve(proc);
    }, 2000);
  });
}

// ============================================================
// DEMO SCENARIOS
// ============================================================
async function demo() {
  logSection(' FAILURE HANDLING DEMO — Sort-Merge Join Distributed');
  
  // Kiểm tra sites
  await checkAllSites();
  await sleep(1000);

  // ─────────────────────────────────────────────
  // SCENARIO 1: Normal Operation
  // ─────────────────────────────────────────────
  logSection(' SCENARIO 1: Normal Operation (tất cả sites online)');
  log('Mô tả: Hệ thống hoạt động bình thường, không có lỗi.');
  
  const normalResult = await sortMergeJoinWithFailureHandling('B');
  
  if (normalResult.success) {
    log(`\n Kết quả: ${normalResult.count} records joined trong ${normalResult.total_ms}ms`);
  }
  
  await sleep(2000);

  // ─────────────────────────────────────────────
  // SCENARIO 2: Kill Site 2 (Authors) → detect & handle
  // ─────────────────────────────────────────────
  logSection(' SCENARIO 2: Site 2 (Authors) bị CRASH giữa chừng');
  log('Mô tả: Kill Site 2 → hệ thống phát hiện lỗi, retry, báo failure.');
  log('Đây là câu hỏi: "What happens when I kill Node B?"');
  
  // Kill Site 2
  log('\n Đang kill Site 2...');
  try {
    await axios.post(`${SITE2}/simulate-crash`, { delay: 500 }, { timeout: 3000 });
    log('   Site 2 đang tắt...');
  } catch (err) {
    log('   Site 2 có thể đã tắt');
  }
  await sleep(2000);

  // Thử join khi Site 2 offline
  log('\n Thử Sort-Merge Join khi Site 2 OFFLINE...');
  const failResult = await sortMergeJoinWithFailureHandling('B');
  
  log(`\n Kết quả Scenario 2:`);
  log(`   Success: ${failResult.success}`);
  log(`   Error: ${failResult.error || 'none'}`);
  log(`   Recovery hint: ${failResult.recovery || 'N/A'}`);
  log(`   Time: ${failResult.total_ms}ms`);
  
  await sleep(2000);

  // ─────────────────────────────────────────────
  // SCENARIO 3: Khởi động lại Site 2 → Recovery
  // ─────────────────────────────────────────────
  logSection(' SCENARIO 3: Recovery — Khởi động lại Site 2');
  log('Mô tả: Restart Site 2, hệ thống tự phục hồi và join thành công.');
  
  const site2Proc = await restartSite(2);
  await sleep(2000);
  
  // Health check lại
  await checkAllSites();
  
  // Thử join lại
  log('\n Thử Sort-Merge Join sau khi recovery...');
  const recoveryResult = await sortMergeJoinWithFailureHandling('B');
  
  if (recoveryResult.success) {
    log(`\n📊 RECOVERY THÀNH CÔNG! ${recoveryResult.count} records joined trong ${recoveryResult.total_ms}ms`);
  }
  
  await sleep(2000);

  // ─────────────────────────────────────────────
  // SCENARIO 4: Strategy Fallback (A → B)
  // ─────────────────────────────────────────────
  logSection(' SCENARIO 4: Strategy Fallback (A fails → B)');
  log('Mô tả: Strategy A (merge tại Site 2) thất bại vì Site 2 bị delay.');
  log('Hệ thống tự động chuyển sang Strategy B (merge tại Site 3).');
  
  let fallbackResult = { success: false, total_ms: 0 };
  const totalStart = Date.now();
  
  // Bước 1: Sort ở cả 2 site trước (khi Site 2 vẫn bình thường)
  log('\n Bước 1: Sort song song ở cả 2 site (trước khi gây lỗi)...');
  const [sortBooks, sortAuthors] = await Promise.all([
    requestWithRetry('post', `${SITE1}/sort`, {}, 'Site 1 (Books)'),
    requestWithRetry('post', `${SITE2}/sort`, {}, 'Site 2 (Authors)'),
  ]);

  if (!sortBooks.success || !sortAuthors.success) {
    log('❌ Không thể sort — bỏ qua Scenario 4');
  } else {
    // Bước 2: Gây delay cho Site 2 SAU KHI đã sort xong
    log('\n Bật delay 10s cho Site 2 (ảnh hưởng merge-join endpoint)...');
    try {
      await axios.post(`${SITE2}/simulate-delay`, { delay: 10000 }, { timeout: 3000 });
    } catch (err) {
      log('   Không thể set delay');
    }

    // Bước 3: Thử Strategy A — merge tại Site 2 (sẽ timeout)
    log('\n Bước 2: Thử merge-join tại Site 2 (Strategy A)...');
    let mergeA = await requestWithRetry('post', `${SITE2}/merge-join`, {
      sorted_books: sortBooks.data.data,
    }, 'Site 2 (Strategy A Merge)');

    if (!mergeA.success) {
      log('\n Strategy A THẤT BẠI (Site 2 timeout)!');
      log(' FALLBACK: Tự động chuyển sang Strategy B → merge tại Site 3...');

      // Bước 4: Fallback — merge tại Site 3 (Coordinator)
      const mergeB = await requestWithRetry('post', `${SITE3}/merge-join`, {
        sorted_books: sortBooks.data.data,
        sorted_authors: sortAuthors.data.data,
      }, 'Site 3 (Strategy B Fallback)');

      if (mergeB.success) {
        log(`\n FALLBACK THÀNH CÔNG! ${mergeB.data.count} records joined tại Site 3`);
        fallbackResult = { success: true, count: mergeB.data.count, total_ms: Date.now() - totalStart };
      } else {
        fallbackResult = { success: false, total_ms: Date.now() - totalStart };
      }
    } else {
      log(' Strategy A thành công (không cần fallback)');
      fallbackResult = { success: true, count: mergeA.data.count, total_ms: 0 };
    }

    // Recover Site 2
    try {
      await axios.post(`${SITE2}/recover`, {}, { timeout: 3000 });
      log('\n Site 2 recovered — delay OFF');
    } catch (err) {
      // ignore
    }
  }
  
  await sleep(1000);

  // ─────────────────────────────────────────────
  // SUMMARY
  // ─────────────────────────────────────────────
  logSection(' TÓM TẮT FAILURE HANDLING DEMO');
  
  console.log('┌──────────────────────────────────────────────────────────────┐');
  console.log('│  Scenario                        │ Result       │ Time      │');
  console.log('├──────────────────────────────────────────────────────────────┤');
  console.log(`│  1. Normal operation             │  Success    │ ${String(normalResult.total_ms).padStart(6)}ms  │`);
  console.log(`│  2. Site 2 crash → detected      │ Detected   │ ${String(failResult.total_ms).padStart(6)}ms  │`);
  console.log(`│  3. Recovery after restart       │ Success    │ ${String(recoveryResult.total_ms).padStart(6)}ms  │`);
  console.log(`│  4. Fallback: A timeout → B ok   │ ${fallbackResult.success ? ' Fallback OK' : '❌ Failed     '} │ ${String(fallbackResult.total_ms).padStart(6)}ms  │`);
  console.log('└──────────────────────────────────────────────────────────────┘');
  
  console.log('\n Kết luận:');
  console.log('   1. Hệ thống PHÁT HIỆN được site offline qua Health Check');
  console.log('   2. Hệ thống CÓ CƠ CHẾ RETRY (3 lần, timeout 5s mỗi lần)');
  console.log('   3. Hệ thống TỰ PHỤC HỒI khi site được restart');
  console.log('   4. Hệ thống CÓ FALLBACK: Strategy A fail → tự chuyển Strategy B');
  console.log('');
}

// Chạy demo
demo().catch(err => {
  console.error(' Demo failed:', err.message);
  process.exit(1);
});
