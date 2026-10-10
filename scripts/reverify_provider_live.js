const http = require('http');
const https = require('https');

function get(path) {
  return new Promise((resolve) => {
    const start = Date.now();
    const req = http.get('http://46.202.166.33:3009' + path, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      timeout: 8000
    }, res => {
      let d = '';
      res.on('data', chunk => d += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(d); } catch (e) {}
        resolve({
          path,
          statusCode: res.statusCode,
          latencyMs: Date.now() - start,
          isJson: !!json,
          data: json,
          rawBody: d,
          timestamp: new Date().toISOString()
        });
      });
    });
    req.on('error', err => resolve({ path, error: err.message, timestamp: new Date().toISOString() }));
    req.on('timeout', () => { req.destroy(); resolve({ path, error: 'TIMEOUT', timestamp: new Date().toISOString() }); });
  });
}

async function run() {
  console.log('=== REAL-TIME PROVIDER RE-VERIFICATION ===');
  console.log('Timestamp:', new Date().toISOString());

  // 1. Core Endpoints
  const corePaths = [
    '/allSportid',
    '/esid?sid=1',
    '/esid?sid=2',
    '/esid?sid=4',
    '/esid?sid=10',
    '/esid?sid=65',
    '/casino/tableid',
    '/tv',
    '/tv?sid=4&gmid=640154297',
    '/score',
    '/score?sid=4&gtv=640154297'
  ];

  for (const p of corePaths) {
    const res = await get(p);
    const snippet = res.rawBody ? res.rawBody.slice(0, 120).replace(/\s+/g, ' ') : res.error;
    console.log(`[${res.statusCode || 'ERR'}] ${p.padEnd(30)} (${res.latencyMs || 0}ms) -> ${snippet}`);
  }

  // 2. Casino Table IDs and Data / Result Re-verification
  console.log('\n--- CASINO SUITE DEEP RE-TEST ---');
  const tableRes = await get('/casino/tableid');
  if (tableRes.data?.data?.t1) {
    const t1 = tableRes.data.data.t1;
    console.log(`Retrieved ${t1.length} casino tables from /casino/tableid.`);
    // Pick 3 diverse tables: Teenpatti, Roulette, Matka/Worli
    const testTables = t1.slice(0, 3);
    for (const t of testTables) {
      console.log(`\nTesting table: ${t.gmid} (${t.gname}, gid=${t.gid}, cid=${t.cid})`);

      // Test /casino/data with gmid
      const dataGmid = await get(`/casino/data?type=${t.gmid}`);
      console.log(`  /casino/data?type=${t.gmid} -> HTTP ${dataGmid.statusCode}: ${dataGmid.rawBody}`);

      // Test /casino/data with gid
      const dataGid = await get(`/casino/data?type=${t.gid}`);
      console.log(`  /casino/data?type=${t.gid} -> HTTP ${dataGid.statusCode}: ${dataGid.rawBody}`);

      // Test /casino/result with gmid
      const resGmid = await get(`/casino/result?type=${t.gmid}`);
      console.log(`  /casino/result?type=${t.gmid} -> HTTP ${resGmid.statusCode}: ${resGmid.rawBody}`);

      // Test /casino/result with gid
      const resGid = await get(`/casino/result?type=${t.gid}`);
      console.log(`  /casino/result?type=${t.gid} -> HTTP ${resGid.statusCode}: ${resGid.rawBody}`);
    }
  } else {
    console.log('Failed to fetch /casino/tableid:', tableRes.rawBody);
  }
}

run().catch(console.error);
