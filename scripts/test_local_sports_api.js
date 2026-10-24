const handler = require('../api/sports/index');
const { EventEmitter } = require('events');

function mockReqRes(options) {
  const req = new EventEmitter();
  req.method = options.method || 'GET';
  req.url = options.url || '/api/sports';
  req.headers = options.headers || {};

  const res = {
    statusCode: 200,
    headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    getHeader(k) { return this.headers[k]; },
    data: '',
    end(d) {
      if (d) this.data += d;
      if (options.onEnd) options.onEnd(this);
    }
  };

  return { req, res };
}

async function testEndpoint(url, headers = {}) {
  return new Promise((resolve) => {
    const { req, res } = mockReqRes({
      url,
      headers,
      onEnd: (r) => {
        let json = null;
        try { json = JSON.parse(r.data); } catch (e) {}
        resolve({
          statusCode: r.statusCode,
          headers: r.headers,
          data: json || r.data
        });
      }
    });

    handler(req, res).catch(err => {
      resolve({ statusCode: 500, error: err.message });
    });
  });
}

async function run() {
  console.log('=== TESTING LOCAL SPORTS API ===\n');

  // 1. Directory
  console.log('--- 1. Testing /api/sports?action=directory ---');
  const dirRes = await testEndpoint('/api/sports?action=directory');
  console.log('Status:', dirRes.statusCode);
  console.log('Cache-Control:', dirRes.headers['Cache-Control']);
  console.log('Directory status:', dirRes.data?.status);
  console.log('Primary sports count:', dirRes.data?.primarySports?.length);
  console.log('All sports count:', dirRes.data?.allSportsCount);
  console.log('Sample primary sports:', dirRes.data?.primarySports?.map(s => s.name));

  // 2. allmatches cricket
  console.log('\n--- 2. Testing /api/sports?action=allmatches&sport=cricket ---');
  const cricketRes = await testEndpoint('/api/sports?action=allmatches&sport=cricket');
  console.log('Status:', cricketRes.statusCode);
  console.log('Cache-Control:', cricketRes.headers['Cache-Control']);
  console.log('dataSource:', cricketRes.data?.dataSource);
  console.log('isLiveDiamond:', cricketRes.data?.isLiveDiamond);
  console.log('upstreamStatusCode:', cricketRes.data?.upstreamStatusCode);
  console.log('clientIpSeen:', cricketRes.data?.clientIpSeen);
  console.log('error:', cricketRes.data?.error);
  console.log('Matches count:', cricketRes.data?.matches?.length);

  // 3. allmatches soccer
  console.log('\n--- 3. Testing /api/sports?action=allmatches&sport=soccer ---');
  const soccerRes = await testEndpoint('/api/sports?action=allmatches&sport=soccer');
  console.log('Status:', soccerRes.statusCode);
  console.log('dataSource:', soccerRes.data?.dataSource);
  console.log('Matches count:', soccerRes.data?.matches?.length);

  // 4. allmatches horse
  console.log('\n--- 4. Testing /api/sports?action=allmatches&sport=horse ---');
  const horseRes = await testEndpoint('/api/sports?action=allmatches&sport=horse');
  console.log('Status:', horseRes.statusCode);
  console.log('dataSource:', horseRes.data?.dataSource);
  console.log('Matches count:', horseRes.data?.matches?.length);

  // 5. allmatches greyhound
  console.log('\n--- 5. Testing /api/sports?action=allmatches&sport=greyhound ---');
  const ghRes = await testEndpoint('/api/sports?action=allmatches&sport=greyhound');
  console.log('Status:', ghRes.statusCode);
  console.log('dataSource:', ghRes.data?.dataSource);
  console.log('Matches count:', ghRes.data?.matches?.length);

  // 6. API Overview (Company Account auth header)
  console.log('\n--- 6. Testing /api/sports?action=api_overview ---');
  const authDb = require('../lib/auth_db');
  await authDb.hydrateUsersAsync();
  const companyKey = authDb.COMPANY_MASTER_KEY;
  const overviewRes = await testEndpoint('/api/sports?action=api_overview', {
    'x-company-key': companyKey
  });
  console.log('Status:', overviewRes.statusCode);
  console.log('activeProvider:', overviewRes.data?.activeProvider);
  console.log('activeStatus:', overviewRes.data?.activeStatus);
  console.log('activeAuth:', overviewRes.data?.activeAuth);
  console.log('serverEgressIp:', overviewRes.data?.serverEgressIp);
  console.log('providerSummary mode:', overviewRes.data?.providerSummary?.mode);
  console.log('providerSummary health:', overviewRes.data?.providerSummary?.providerHealth);
  console.log('Diamond capabilities count:', Object.keys(overviewRes.data?.providers?.diamond?.capabilities || {}).length);
  console.log('Diamond sportsFeed capability:', overviewRes.data?.providers?.diamond?.capabilities?.sportsFeed);
}

run().catch(console.error);
