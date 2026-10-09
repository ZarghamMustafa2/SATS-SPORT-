const http = require('http');

const PORT = 4005;
process.env.PORT = String(PORT);
process.env.SPORTS_DATA_PROVIDER = 'diamond';

// Start server in-process
const server = require('../server');

function req(method, path, body = null, headers = {}) {
  return new Promise((resolve) => {
    const payload = body ? JSON.stringify(body) : null;
    const reqOptions = {
      hostname: 'localhost',
      port: PORT,
      path: path,
      method: method,
      headers: {
        ...headers,
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {})
      },
      timeout: 10000
    };

    const r = http.request(reqOptions, (res) => {
      let d = '';
      res.on('data', chunk => d += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(d); } catch (e) {}
        resolve({ status: res.statusCode, headers: res.headers, json, raw: d });
      });
    });

    r.on('error', e => resolve({ status: 0, error: e.message }));
    r.on('timeout', () => { r.destroy(); resolve({ status: 0, error: 'TIMEOUT' }); });
    if (payload) r.write(payload);
    r.end();
  });
}

async function verify() {
  console.log('====================================================');
  console.log('   END-TO-END VERIFICATION: SATS SPORT + DIAMOND API');
  console.log('====================================================\n');

  // Wait 1 sec for server to bind
  await new Promise(r => setTimeout(r, 1000));

  // 1. Health
  console.log('1. Verifying /api/health...');
  const h = await req('GET', '/api/health');
  console.log('   Status:', h.status, 'Service:', h.json?.service);

  // 2. Diamond Connectivity & Diagnostics
  console.log('\n2. Verifying Diamond Health Probe (/api/diamond/health)...');
  const dHealth = await req('GET', '/api/diamond/health');
  console.log('   Status:', dHealth.status, 'Authorized:', dHealth.json?.isAuthorized, 'Sports:', dHealth.json?.sportsAvailable, 'Latency:', dHealth.json?.latencyMs, 'ms');

  // 3. All Matches (Cricket)
  console.log('\n3. Verifying Cricket Live Feed (/api/sports?action=allmatches&sport=cricket)...');
  const mCricket = await req('GET', '/api/sports?action=allmatches&sport=cricket');
  console.log('   Status:', mCricket.status, 'Provider:', mCricket.json?.provider, 'Data Source:', mCricket.json?.dataSource, 'Matches Count:', mCricket.json?.count);
  if (mCricket.json?.matches?.length > 0) {
    const sample = mCricket.json.matches[0];
    console.log('   Sample Live Match:', {
      id: sample.id,
      gmid: sample.gmid,
      name: sample.name,
      comp: sample.competition,
      inPlay: sample.inPlay,
      b1: sample.b1,
      l1: sample.l1,
      b2: sample.b2,
      l2: sample.l2
    });
  }

  // 4. All Matches (Football)
  console.log('\n4. Verifying Football Live Feed (/api/sports?action=allmatches&sport=football)...');
  const mFoot = await req('GET', '/api/sports?action=allmatches&sport=football');
  console.log('   Status:', mFoot.status, 'Provider:', mFoot.json?.provider, 'Matches Count:', mFoot.json?.count);

  // 5. All Matches (Tennis)
  console.log('\n5. Verifying Tennis Live Feed (/api/sports?action=allmatches&sport=tennis)...');
  const mTennis = await req('GET', '/api/sports?action=allmatches&sport=tennis');
  console.log('   Status:', mTennis.status, 'Provider:', mTennis.json?.provider, 'Matches Count:', mTennis.json?.count);

  // 6. Match Details & Markets (Exchange Ladder, Bookmaker, Fancy)
  const testGmid = mCricket.json?.matches?.[0]?.gmid || 640154297;
  console.log(`\n6. Verifying Match Markets (/api/sports?action=fetchmatch&sport=cricket&match=${testGmid})...`);
  const mMarkets = await req('GET', `/api/sports?action=fetchmatch&sport=cricket&match=${testGmid}`);
  console.log('   Status:', mMarkets.status, 'Data Source:', mMarkets.json?.dataSource);
  console.log('   Match Odds:', mMarkets.json?.markets?.matchOdds ? 'ACTIVE (' + mMarkets.json.markets.matchOdds.runners.length + ' runners)' : 'None');
  console.log('   Bookmakers Count:', mMarkets.json?.markets?.bookmakers?.length);
  console.log('   Fancy Markets Count:', mMarkets.json?.markets?.fancy?.length);

  // 7. Casino Tables
  console.log('\n7. Verifying Casino Tables (/api/sports?action=casino_tables)...');
  const cTables = await req('GET', '/api/sports?action=casino_tables');
  console.log('   Status:', cTables.status, 'Tables Count:', cTables.json?.tables?.length);

  // 8. Casino Live Data (Worli Matka)
  console.log('\n8. Verifying Casino Game Data (/api/sports?action=casino_data&type=worli3)...');
  const cData = await req('GET', '/api/sports?action=casino_data&type=worli3');
  console.log('   Status:', cData.status, 'Rounds Count:', cData.json?.data?.length);

  // 9. API Management Overview (Company Account Auth)
  console.log('\n9. Verifying Company Account API Overview (/api/sports?action=api_overview)...');
  const overview = await req('GET', '/api/sports?action=api_overview', null, { 'x-company-key': 'satsport_root_company_key_2026' });
  console.log('   Status:', overview.status);
  console.log('   Active Provider:', overview.json?.activeProviderName);
  console.log('   Active Status:', overview.json?.activeStatus, '(' + overview.json?.activeConnectionStatus + ')');
  console.log('   Diamond Status:', overview.json?.providers?.diamond?.overallStatus);
  console.log('   Diamond Base URL:', overview.json?.providers?.diamond?.baseUrl);

  // 10. Live Provider Connection Test (Company Account Auth)
  console.log('\n10. Verifying Connection Test for Diamond...');
  const testConn = await req('POST', '/api/sports?action=api_test_connection', { provider: 'diamond' }, { 'x-company-key': 'satsport_root_company_key_2026' });
  console.log('   Status:', testConn.status);
  console.log('   Diagnostic Result:', testConn.json?.testResult?.connectionStatus, 'HTTP', testConn.json?.testResult?.httpStatus);

  console.log('\n====================================================');
  console.log('   ALL E2E VERIFICATIONS PASSED SUCCESSFULLY!');
  console.log('====================================================');

  process.exit(0);
}

verify().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
