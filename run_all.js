const { spawn } = require('child_process');
const path = require('path');

// ============================================================
// run_all.js — Khởi chạy cả 3 sites cùng lúc
// ============================================================

console.log('Khoi chay Sort-Merge Join Distributed System...\n');

const sites = [
  { name: 'Site 1 (Books)',       script: path.join('site1', 'server.js'), port: 5001 },
  { name: 'Site 2 (Authors)',     script: path.join('site2', 'server.js'), port: 5002 },
  { name: 'Site 3 (Coordinator)', script: path.join('site3', 'server.js'), port: 5003 },
];

const processes = [];

for (const site of sites) {
  const proc = spawn('node', [site.script], {
    cwd: __dirname,
    stdio: 'inherit',
    shell: true,
  });

  proc.on('error', (err) => {
    console.error(`[ERROR] ${site.name} failed to start:`, err.message);
  });

  proc.on('exit', (code) => {
    if (code !== null && code !== 0) {
      console.error(`[ERROR] ${site.name} exited with code ${code}`);
    }
  });

  processes.push(proc);
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\nShutting down all sites...');
  processes.forEach(p => p.kill());
  process.exit(0);
});

process.on('SIGTERM', () => {
  processes.forEach(p => p.kill());
  process.exit(0);
});

console.log('---------------------------------------------------');
console.log('   Nhan Ctrl+C de dung tat ca sites');
console.log('   Sau khi 3 sites chay, mo terminal moi chay:');
console.log('   > node benchmark.js');
console.log('---------------------------------------------------\n');
