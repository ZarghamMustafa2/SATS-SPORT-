const sportsHandler = require('../api/sports/index');
const authDb = require('../lib/auth_db');
const http = require('http');

function mockRequest(method, url, body = null, headers = {}) {
  const req = new (require('stream').Readable)();
  req.method = method;
  req.url = url;
  req.headers = { host: 'localhost:4000', ...headers };
  if (body) {
    req.push(JSON.stringify(body));
  }
  req.push(null);

  const res = {
    statusCode: 200,
    headers: {},
    body: '',
    setHeader(k, v) { this.headers[k] = v; },
    end(data) {
      if (data) this.body += data;
    }
  };

  return new Promise((resolve) => {
    res.end = function(data) {
      if (data) this.body += data;
      let json = null;
      try { json = JSON.parse(this.body); } catch(e) {}
      resolve({ statusCode: this.statusCode, headers: this.headers, json, raw: this.body });
    };
    sportsHandler(req, res).catch(err => {
      resolve({ statusCode: 500, error: err.message });
    });
  });
}

async function runTests() {
  console.log('=== TESTING API/SPORTS DIAMOND INTEGRATION ===\n');

  // 1. All Matches with Diamond
  console.log('1. Testing /api/sports?action=allmatches&sport=cricket&provider=diamond...');
  const resMatches = await mockRequest('GET', '/api/sports?action=allmatches&sport=cricket&provider=diamond');
  console.log('Status:', resMatches.statusCode);
  console.log('Payload summary:', {
    status: resMatches.json?.status,
    dataSource: resMatches.json?.dataSource,
    isLiveDiamond: resMatches.json?.isLiveDiamond,
    count: resMatches.json?.count,
    matchesCount: resMatches.json?.matches?.length
  });
  if (resMatches.json?.matches?.length > 0) {
    const m = resMatches.json.matches[0];
    console.log('Sample match:', { id: m.id, name: m.name, inPlay: m.inPlay, b1: m.b1, l1: m.l1, b2: m.b2, l2: m.l2 });
  }

  // 2. Fetch Match Details & Markets
  console.log('\n2. Testing /api/sports?action=fetchmatch&sport=cricket&match=640154297&provider=diamond...');
  const resFetch = await mockRequest('GET', '/api/sports?action=fetchmatch&sport=cricket&match=640154297&provider=diamond');
  console.log('Status:', resFetch.statusCode);
  console.log('Payload summary:', {
    status: resFetch.json?.status,
    dataSource: resFetch.json?.dataSource,
    isLiveDiamond: resFetch.json?.isLiveDiamond,
    hasMatchOdds: !!resFetch.json?.markets?.matchOdds,
    bookmakersCount: resFetch.json?.markets?.bookmakers?.length,
    fancyCount: resFetch.json?.markets?.fancy?.length
  });
  if (resFetch.json?.markets?.matchOdds) {
    console.log('Match Odds market:', {
      marketId: resFetch.json.markets.matchOdds.marketId,
      runners: resFetch.json.markets.matchOdds.runners.map(r => ({ name: r.runnerName, back: r.back[0], lay: r.lay[0] }))
    });
  }

  // 3. Casino Tables
  console.log('\n3. Testing /api/sports?action=casino_tables...');
  const resCasinoTables = await mockRequest('GET', '/api/sports?action=casino_tables');
  console.log('Status:', resCasinoTables.statusCode, 'Tables count:', resCasinoTables.json?.tables?.length);

  // 4. Casino Data
  console.log('\n4. Testing /api/sports?action=casino_data&type=worli3...');
  const resCasinoData = await mockRequest('GET', '/api/sports?action=casino_data&type=worli3');
  console.log('Status:', resCasinoData.statusCode, 'Rounds count:', resCasinoData.json?.data?.length);

  // 5. Test Connection (Company Account authorized)
  console.log('\n5. Testing /api/sports?action=api_test_connection (Diamond)...');
  const resConnTest = await mockRequest('POST', '/api/sports?action=api_test_connection', { provider: 'diamond' }, { 'x-company-key': 'satsport_root_company_key_2026' });
  console.log('Status:', resConnTest.statusCode);
  console.log('Test Result:', resConnTest.json?.testResult);

  // 6. API Overview (Company Account authorized)
  console.log('\n6. Testing /api/sports?action=api_overview...');
  const resOverview = await mockRequest('GET', '/api/sports?action=api_overview', null, { 'x-company-key': 'satsport_root_company_key_2026' });
  console.log('Status:', resOverview.statusCode);
  console.log('Diamond status in overview:', resOverview.json?.providers?.diamond);

  console.log('\nALL API/SPORTS TESTS COMPLETED!');
}

runTests().catch(console.error);
