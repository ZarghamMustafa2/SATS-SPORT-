async function test() {
  const http = require('http');

  function request(url, headers = {}) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const req = http.get(url, { headers }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            latency: Date.now() - start,
            sizeKb: (Buffer.byteLength(data) / 1024).toFixed(2),
            headers: res.headers,
            body: data
          });
        });
      });
      req.on('error', reject);
    });
  }

  console.log('Testing endpoints...');

  // 1. Unauthenticated auth/me
  const authRes = await request('http://localhost:4000/api/auth/me');
  console.log(`1. Unauth /api/auth/me: HTTP ${authRes.status} in ${authRes.latency}ms (${authRes.sizeKb} KB)`);

  // 2. Cricket allmatches
  const cricketRes = await request('http://localhost:4000/api/sports?action=allmatches&sport=cricket');
  console.log(`2. Cricket allmatches: HTTP ${cricketRes.status} in ${cricketRes.latency}ms (${cricketRes.sizeKb} KB) Cache-Control: ${cricketRes.headers['cache-control']}`);

  // 3. Soccer allmatches
  const soccerRes = await request('http://localhost:4000/api/sports?action=allmatches&sport=soccer');
  console.log(`3. Soccer allmatches: HTTP ${soccerRes.status} in ${soccerRes.latency}ms (${soccerRes.sizeKb} KB) Cache-Control: ${soccerRes.headers['cache-control']}`);

  // 4. Tennis allmatches
  const tennisRes = await request('http://localhost:4000/api/sports?action=allmatches&sport=tennis');
  console.log(`4. Tennis allmatches: HTTP ${tennisRes.status} in ${tennisRes.latency}ms (${tennisRes.sizeKb} KB) Cache-Control: ${tennisRes.headers['cache-control']}`);

  // 5. Test cached call
  const cachedSoccer = await request('http://localhost:4000/api/sports?action=allmatches&sport=soccer');
  console.log(`5. Cached Soccer: HTTP ${cachedSoccer.status} in ${cachedSoccer.latency}ms (${cachedSoccer.sizeKb} KB)`);

  // Parse soccer body to verify matches count and structure
  try {
    const json = JSON.parse(soccerRes.body);
    console.log(`Soccer match count: ${json.count || json.matches?.length}, first match: ${json.matches?.[0]?.team1} vs ${json.matches?.[0]?.team2}`);
  } catch (e) {
    console.error('Failed to parse soccer json:', e.message);
  }
}

test().catch(console.error);
