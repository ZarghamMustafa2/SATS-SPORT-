// Comprehensive test script for sports integration -> Admin Panel connection
const sportsHandler = require('../api/sports/index');
const authDb = require('../lib/auth_db');

function createMockRes() {
  return {
    statusCode: 200,
    headers: {},
    data: null,
    setHeader(key, value) {
      this.headers[key.toLowerCase()] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.data = body;
      return this;
    },
    end(body) {
      if (body && !this.data) {
        try {
          this.data = JSON.parse(body);
        } catch (e) {
          this.data = body;
        }
      }
      return this;
    }
  };
}

function createMockReq(url, method = 'GET', headers = {}, body = null) {
  return {
    url,
    method,
    headers: { ...headers },
    body
  };
}

async function runTests() {
  console.log('=== Starting Admin Sports Integration Automated Verification ===\n');
  await authDb.hydrateUsersAsync();

  const saUser = authDb.getUserByUsername('superadmin_1');
  const smUser = authDb.getUserByUsername('supermaster_1');

  if (!saUser || !smUser) {
    throw new Error('Required test users superadmin_1 and supermaster_1 not found');
  }

  const saSession = authDb.createSession(saUser);
  const smSession = authDb.createSession(smUser);

  const saHeaders = { authorization: `Bearer ${saSession.token}` };
  const smHeaders = { authorization: `Bearer ${smSession.token}` };

  console.log(`[AUTH] SA User: ${saUser.username} (${saUser.role})`);
  console.log(`[AUTH] SM User: ${smUser.username} (${smUser.role})\n`);

  // ----------------------------------------------------
  // TEST 1: Role Security - Admin role (super_master) must be BLOCKED with 403
  // ----------------------------------------------------
  console.log('--- TEST 1: Role Security Server Guards (Admin role super_master must get 403) ---');
  const guardedEndpoints = [
    { url: '/api/sports?action=api_overview', method: 'GET', name: 'api_overview' },
    { url: '/api/sports?action=admin_fixtures', method: 'GET', name: 'admin_fixtures' },
    { url: '/api/sports?action=admin_fixture_detail&gmid=test123', method: 'GET', name: 'admin_fixture_detail' },
    { url: '/api/sports?action=admin_parity_run', method: 'POST', name: 'admin_parity_run' },
    { url: '/api/sports?action=admin_refresh_summary', method: 'POST', name: 'admin_refresh_summary' }
  ];

  for (const ep of guardedEndpoints) {
    const req = createMockReq(ep.url, ep.method, smHeaders);
    const res = createMockRes();
    await sportsHandler(req, res);
    if (res.statusCode === 403) {
      console.log(`  ✅ [PASS] ${ep.name}: Admin (super_master) correctly blocked with HTTP 403`);
    } else {
      console.error(`  ❌ [FAIL] ${ep.name}: Expected 403, got ${res.statusCode}:`, res.data);
      process.exit(1);
    }
  }

  // ----------------------------------------------------
  // TEST 2: Company Account (super_admin) access to api_overview
  // ----------------------------------------------------
  console.log('\n--- TEST 2: Company Account (super_admin) api_overview Payload Structure ---');
  const overviewReq = createMockReq('/api/sports?action=api_overview', 'GET', saHeaders);
  const overviewRes = createMockRes();
  await sportsHandler(overviewReq, overviewRes);

  if (overviewRes.statusCode !== 200) {
    console.error(`  ❌ [FAIL] api_overview returned ${overviewRes.statusCode}:`, overviewRes.data);
    process.exit(1);
  }
  const ov = overviewRes.data;
  console.log(`  ✅ [PASS] api_overview status 200 OK`);
  console.log(`  Active Provider: ${ov.activeProviderName} (${ov.activeProvider})`);
  console.log(`  Active Status: ${ov.activeStatus} / Connection: ${ov.activeConnectionStatus}`);

  // Provider Summary checks
  const ps = ov.providerSummary;
  if (!ps || !ps.providerName || !ps.mode || !ps.keyConfigured || !ps.providerHealth) {
    console.error(`  ❌ [FAIL] providerSummary missing required fields:`, ps);
    process.exit(1);
  }
  console.log(`  ✅ [PASS] Provider Summary: ${ps.providerName} | Mode: ${ps.mode} | Key Configured: ${ps.keyConfigured} | Health: ${ps.providerHealth}`);

  // Sports Summary checks
  const ss = ov.sportsSummary;
  if (!Array.isArray(ss) || ss.length === 0) {
    console.error(`  ❌ [FAIL] sportsSummary empty or not an array:`, ss);
    process.exit(1);
  }
  console.log(`  ✅ [PASS] Sports Summary: ${ss.length} sports detected.`);
  const cricketSport = ss.find(s => s.name.toLowerCase().includes('cricket'));
  const soccerSport = ss.find(s => s.name.toLowerCase().includes('soccer') || s.name.toLowerCase().includes('football'));
  const tennisSport = ss.find(s => s.name.toLowerCase().includes('tennis'));
  const horseSport = ss.find(s => s.name.toLowerCase().includes('horse'));
  const greyhoundSport = ss.find(s => s.name.toLowerCase().includes('greyhound'));

  console.log(`    - Cricket: ${cricketSport?.totalFixtures} total (${cricketSport?.inPlayCount} in-play, ${cricketSport?.upcomingCount} upcoming)`);
  console.log(`    - Soccer: ${soccerSport?.totalFixtures} total (${soccerSport?.inPlayCount} in-play, ${soccerSport?.upcomingCount} upcoming)`);
  console.log(`    - Tennis: ${tennisSport?.totalFixtures} total (${tennisSport?.inPlayCount} in-play, ${tennisSport?.upcomingCount} upcoming)`);
  console.log(`    - Horse Racing: ${horseSport?.totalFixtures} total`);
  console.log(`    - Greyhound Racing: ${greyhoundSport?.totalFixtures} total`);

  // Racing Diagnostics checks
  const racing = ov.racing;
  if (!racing || !racing.horseRacing || !racing.greyhoundRacing) {
    console.error(`  ❌ [FAIL] racing diagnostics missing:`, racing);
    process.exit(1);
  }
  console.log(`  ✅ [PASS] Racing Diagnostics: Horse Racing ${racing.horseRacing.totalFixtures} races, Greyhound ${racing.greyhoundRacing.totalFixtures} races.`);

  // Casino Diagnostics checks
  const casino = ov.casino;
  if (!casino || !casino.tables || !casino.dataEndpoint || !casino.resultEndpoint) {
    console.error(`  ❌ [FAIL] casino diagnostics missing:`, casino);
    process.exit(1);
  }
  console.log(`  ✅ [PASS] Casino Diagnostics: ${casino.tables} tables | data: ${casino.dataEndpoint} | result: ${casino.resultEndpoint}`);

  // Capabilities Diagnostics checks
  const cap = ov.capabilities;
  if (!cap || !cap.tvStreaming || !cap.scoreboardGtv || !cap.settlementVerification) {
    console.error(`  ❌ [FAIL] capabilities diagnostics missing:`, cap);
    process.exit(1);
  }
  console.log(`  ✅ [PASS] Capabilities Diagnostics: TV status=${cap.tvStreaming.status} | Score status=${cap.scoreboardGtv.status} | Settlement status=${cap.settlementVerification.status}`);

  // Parity checks
  const par = ov.parity;
  if (!par || typeof par.exactMatchRate === 'undefined') {
    console.error(`  ❌ [FAIL] parity missing:`, par);
    process.exit(1);
  }
  console.log(`  ✅ [PASS] Reference Parity: ${par.auditCount} audits | Exact Match Rate: ${par.exactMatchRate}% | Mismatches: ${par.mismatches}`);

  // Diagnostic Logs checks
  const logs = ov.diagnosticLogs;
  if (!Array.isArray(logs)) {
    console.error(`  ❌ [FAIL] diagnosticLogs is not an array:`, logs);
    process.exit(1);
  }
  console.log(`  ✅ [PASS] Diagnostic Logs: ${logs.length} logged events.`);

  // ----------------------------------------------------
  // TEST 3: Company Account Fixtures Pagination and Filtering
  // ----------------------------------------------------
  console.log('\n--- TEST 3: Company Account admin_fixtures Pagination & Filters ---');
  const fixReq = createMockReq('/api/sports?action=admin_fixtures&page=1&limit=10', 'GET', saHeaders);
  const fixRes = createMockRes();
  await sportsHandler(fixReq, fixRes);

  if (fixRes.statusCode !== 200 || !fixRes.data.fixtures) {
    console.error(`  ❌ [FAIL] admin_fixtures failed:`, fixRes.data);
    process.exit(1);
  }
  const fixturesData = fixRes.data;
  console.log(`  ✅ [PASS] admin_fixtures page 1 returned ${fixturesData.fixtures.length} items. Total: ${fixturesData.pagination.total}, Pages: ${fixturesData.pagination.totalPages}`);

  // Filter by sport (cricket)
  const cricketReq = createMockReq('/api/sports?action=admin_fixtures&sport=cricket&page=1&limit=5', 'GET', saHeaders);
  const cricketRes = createMockRes();
  await sportsHandler(cricketReq, cricketRes);
  const allAreCricket = cricketRes.data.fixtures.every(f => f.sport.toLowerCase().includes('cricket'));
  if (allAreCricket && cricketRes.data.fixtures.length > 0) {
    console.log(`  ✅ [PASS] Filter by sport=cricket returned ${cricketRes.data.fixtures.length} cricket fixtures.`);
  } else {
    console.error(`  ❌ [FAIL] Filter by sport=cricket had non-cricket fixtures or zero items:`, cricketRes.data);
    process.exit(1);
  }

  // Filter by status (inplay)
  const inplayReq = createMockReq('/api/sports?action=admin_fixtures&status=inplay&page=1&limit=5', 'GET', saHeaders);
  const inplayRes = createMockRes();
  await sportsHandler(inplayReq, inplayRes);
  const allAreInPlay = inplayRes.data.fixtures.every(f => f.isInPlay === true);
  if (allAreInPlay) {
    console.log(`  ✅ [PASS] Filter by status=inplay returned ${inplayRes.data.fixtures.length} in-play fixtures.`);
  } else {
    console.error(`  ❌ [FAIL] Filter by status=inplay returned non in-play fixtures:`, inplayRes.data.fixtures);
    process.exit(1);
  }

  // ----------------------------------------------------
  // TEST 4: Deep Fixture Detail & Market Diagnostics
  // ----------------------------------------------------
  console.log('\n--- TEST 4: Deep Fixture Detail Diagnostics (admin_fixture_detail) ---');
  const sampleFixture = fixturesData.fixtures[0];
  console.log(`  Inspecting fixture gmid: ${sampleFixture.gmid} (${sampleFixture.eventName})`);

  const detailReq = createMockReq(`/api/sports?action=admin_fixture_detail&gmid=${sampleFixture.gmid}&sid=${sampleFixture.sid || 4}`, 'GET', saHeaders);
  const detailRes = createMockRes();
  await sportsHandler(detailReq, detailRes);

  if (detailRes.statusCode !== 200 || !detailRes.data.diagnostic) {
    console.error(`  ❌ [FAIL] admin_fixture_detail failed:`, detailRes.data);
    process.exit(1);
  }
  const fix = detailRes.data.fixture || {};
  const diag = detailRes.data.diagnostic || {};
  const mkts = diag.markets || {};
  console.log(`  ✅ [PASS] Diagnostic fetched:`);
  console.log(`    - Event: ${fix.event || fix.name} (${fix.sportName})`);
  console.log(`    - Provider HTTP Status: ${diag.httpStatus} (Latency: ${diag.latencyMs}ms)`);
  const moRunners = mkts.matchOdds?.runners || [];
  console.log(`    - Match Odds ladder: ${moRunners.length} runners`);
  if (moRunners.length > 0) {
    moRunners.slice(0, 2).forEach(r => {
      const b1 = r.back && r.back[0] ? `${r.back[0].price} (${r.back[0].size})` : '-';
      const l1 = r.lay && r.lay[0] ? `${r.lay[0].price} (${r.lay[0].size})` : '-';
      console.log(`      * ${r.runnerName || r.name}: Back ${b1} | Lay ${l1}`);
    });
  }
  console.log(`    - Bookmaker: ${mkts.bookmakers ? mkts.bookmakers.length + ' markets' : 'None'}`);
  console.log(`    - Fancy/Session lines: ${mkts.fancy ? mkts.fancy.length + ' lines' : 'None'}`);
  console.log(`    - TV Stream Capability: ${diag.tv?.available ? 'Available' : 'Blocked'} (${diag.tv?.message})`);
  console.log(`    - Score Capability: ${diag.score?.available ? 'Available' : 'Unavailable'} (${diag.score?.message})`);

  // ----------------------------------------------------
  // TEST 5: Reference Odds Parity Run
  // ----------------------------------------------------
  console.log('\n--- TEST 5: Reference Odds Parity Run (admin_parity_run) ---');
  const parityReq = createMockReq('/api/sports?action=admin_parity_run', 'POST', saHeaders);
  const parityRes = createMockRes();
  await sportsHandler(parityReq, parityRes);

  const audit = parityRes.data.parity || parityRes.data.audit;
  if (parityRes.statusCode !== 200 || !audit) {
    console.error(`  ❌ [FAIL] admin_parity_run failed:`, parityRes.data);
    process.exit(1);
  }
  console.log(`  ✅ [PASS] Parity Audit completed:`);
  console.log(`    - Sats Fixtures: ${audit.totalSatsFixtures} | Reference: ${audit.totalReferenceFixtures}`);
  console.log(`    - Selections Compared: ${audit.selectionsCompared}`);
  console.log(`    - Parity Rate: ${audit.parityRate || audit.exactMatchRate + '%'}`);
  console.log(`    - Mismatches: ${audit.mismatches}`);

  console.log('\n======================================================');
  console.log('✅ ALL SERVER-SIDE INTEGRATION TESTS PASSED PERFECTLY!');
  console.log('======================================================');
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
