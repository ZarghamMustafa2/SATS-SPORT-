const http = require('http');
const fs = require('fs');

const BASE = 'http://46.202.166.33:3009';

async function get(path) {
  return new Promise((resolve) => {
    const start = Date.now();
    http.get(BASE + path, { timeout: 15000 }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(d); } catch (e) {}
        resolve({
          path,
          status: res.statusCode,
          headers: res.headers,
          durationMs: Date.now() - start,
          isJson: !!json,
          data: json,
          raw: d
        });
      });
    }).on('error', e => resolve({ path, error: e.message }))
      .on('timeout', () => resolve({ path, error: 'TIMEOUT' }));
  });
}

async function post(path, body) {
  return new Promise((resolve) => {
    const start = Date.now();
    const payload = JSON.stringify(body);
    const req = http.request(BASE + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: 15000
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(d); } catch (e) {}
        resolve({
          path,
          method: 'POST',
          status: res.statusCode,
          headers: res.headers,
          durationMs: Date.now() - start,
          isJson: !!json,
          data: json,
          raw: d
        });
      });
    });
    req.on('error', e => resolve({ path, method: 'POST', error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ path, method: 'POST', error: 'TIMEOUT' }); });
    req.write(payload);
    req.end();
  });
}

async function audit() {
  console.log('=== FORENSIC LIVE AUDIT OF 46.202.166.33:3009 ===\n');
  const results = {};

  // 1. /allSportid
  console.log('--- 1. Testing /allSportid ---');
  const rSports = await get('/allSportid');
  results['/allSportid'] = rSports;
  console.log('Status:', rSports.status, 'Duration:', rSports.durationMs, 'ms');
  console.log('Sports count:', Array.isArray(rSports.data?.data) ? rSports.data.data.length : 'N/A');
  if (Array.isArray(rSports.data?.data)) {
    console.log('Sample sports:', rSports.data.data.slice(0, 5));
  }

  // 2. /tree
  console.log('\n--- 2. Testing /tree ---');
  const rTree = await get('/tree');
  results['/tree'] = rTree;
  console.log('Status:', rTree.status, 'Duration:', rTree.durationMs, 'ms');
  const sportsTree = rTree.data?.data?.t1 || [];
  console.log('Sports in tree:', sportsTree.map(s => ({ etid: s.etid, name: s.name, compCount: (s.children || []).length })));

  // Extract real live sample match IDs for testing
  let sampleGmid = null;
  let sampleSid = 4; // Cricket default
  let sampleMatchName = '';
  let sampleGtv = null;

  // 3. /esid
  console.log('\n--- 3. Testing /esid?sid=4 (Cricket) ---');
  const rEsidCricket = await get('/esid?sid=4');
  results['/esid?sid=4'] = rEsidCricket;
  console.log('Status:', rEsidCricket.status, 'Duration:', rEsidCricket.durationMs, 'ms');
  console.log('Matches count:', Array.isArray(rEsidCricket.data?.data) ? rEsidCricket.data.data.length : 'N/A');

  if (Array.isArray(rEsidCricket.data?.data) && rEsidCricket.data.data.length > 0) {
    const m = rEsidCricket.data.data[0];
    sampleGmid = m.gmid || m.id || m.event_id;
    sampleSid = 4;
    sampleMatchName = m.name || m.mname || m.ename || '';
    sampleGtv = m.gtv || null;
    console.log('Sample match from /esid:', { gmid: sampleGmid, sid: sampleSid, name: sampleMatchName, gtv: sampleGtv });
    console.log('Full sample match object keys:', Object.keys(m));
    console.log('Sample match fields preview:', JSON.stringify(m).slice(0, 400));
  } else {
    // search in tree
    for (const sport of sportsTree) {
      if (sport.children) {
        for (const comp of sport.children) {
          if (comp.children && comp.children.length > 0) {
            const m = comp.children[0];
            sampleGmid = m.gmid;
            sampleSid = sport.etid;
            sampleMatchName = m.name;
            break;
          }
        }
      }
      if (sampleGmid) break;
    }
  }

  console.log('\nSelected sample for deep tests -> gmid:', sampleGmid, 'sid:', sampleSid, 'name:', sampleMatchName);

  // Also test /esid for Football (1) and Tennis (2)
  const rEsidFoot = await get('/esid?sid=1');
  console.log('Testing /esid?sid=1 (Football) -> Status:', rEsidFoot.status, 'Matches:', Array.isArray(rEsidFoot.data?.data) ? rEsidFoot.data.data.length : 'N/A');
  const rEsidTennis = await get('/esid?sid=2');
  console.log('Testing /esid?sid=2 (Tennis) -> Status:', rEsidTennis.status, 'Matches:', Array.isArray(rEsidTennis.data?.data) ? rEsidTennis.data.data.length : 'N/A');

  // 4. /getDetailsData
  console.log('\n--- 4. Testing /getDetailsData ---');
  let rDetails = null;
  if (sampleGmid) {
    rDetails = await get('/getDetailsData?gmid=' + sampleGmid + '&sid=' + sampleSid);
    results['/getDetailsData'] = rDetails;
    console.log('Status:', rDetails.status, 'Duration:', rDetails.durationMs, 'ms');
    console.log('Response keys:', rDetails.data ? Object.keys(rDetails.data) : null);
    if (rDetails.data?.data) {
      console.log('Data keys:', Object.keys(rDetails.data.data));
      if (rDetails.data.data.gtv) sampleGtv = rDetails.data.data.gtv;
      console.log('Details preview:', JSON.stringify(rDetails.data.data).slice(0, 400));
    }
  }

  // 5. /getPriveteData
  console.log('\n--- 5. Testing /getPriveteData (Odds, Bookmaker, Fancy) ---');
  let rPrivate = null;
  if (sampleGmid) {
    rPrivate = await get('/getPriveteData?gmid=' + sampleGmid + '&sid=' + sampleSid);
    results['/getPriveteData'] = rPrivate;
    console.log('Status:', rPrivate.status, 'Duration:', rPrivate.durationMs, 'ms');
    console.log('Response keys:', rPrivate.data ? Object.keys(rPrivate.data) : null);
    if (rPrivate.data?.data) {
      console.log('Private data keys:', Object.keys(rPrivate.data.data));
      console.log('Odds / Markets preview:', JSON.stringify(rPrivate.data.data).slice(0, 600));
    }
  }

  // 6. /score
  console.log('\n--- 6. Testing /score ---');
  const testGtv = sampleGtv || sampleGmid || 1;
  const rScore = await get('/score?gtv=' + testGtv + '&sid=' + sampleSid);
  results['/score'] = rScore;
  console.log('Status:', rScore.status, 'Duration:', rScore.durationMs, 'ms');
  console.log('Score response preview:', rScore.raw.slice(0, 300));

  // 7. /casino/tableid
  console.log('\n--- 7. Testing /casino/tableid ---');
  const rCasinoTables = await get('/casino/tableid');
  results['/casino/tableid'] = rCasinoTables;
  console.log('Status:', rCasinoTables.status, 'Duration:', rCasinoTables.durationMs, 'ms');
  let sampleCasinoType = null;
  let sampleTable = null;
  const casinoList = rCasinoTables.data?.data?.t1 || [];
  console.log('Casino tables count:', casinoList.length);
  if (casinoList.length > 0) {
    sampleTable = casinoList[0];
    sampleCasinoType = sampleTable.gid || sampleTable.gmid || sampleTable.cid || 1;
    console.log('Sample casino table:', sampleTable);
  }

  // 8. /casino/data
  console.log('\n--- 8. Testing /casino/data ---');
  let rCasinoData = null;
  let sampleRoundMid = null;
  if (sampleCasinoType) {
    // test both numeric and string type
    rCasinoData = await get('/casino/data?type=' + sampleCasinoType);
    results['/casino/data'] = rCasinoData;
    console.log('Status (/casino/data?type=' + sampleCasinoType + '):', rCasinoData.status, 'Duration:', rCasinoData.durationMs, 'ms');
    console.log('Casino data preview:', JSON.stringify(rCasinoData.data).slice(0, 400));
    if (rCasinoData.data?.data?.mid) sampleRoundMid = rCasinoData.data.data.mid;
    else if (rCasinoData.data?.mid) sampleRoundMid = rCasinoData.data.mid;
  }

  // Also test with gmid if gmid is string
  if (sampleTable && sampleTable.gmid && sampleTable.gmid !== sampleCasinoType) {
    const rCasinoData2 = await get('/casino/data?type=' + sampleTable.gmid);
    console.log('Status (/casino/data?type=' + sampleTable.gmid + '):', rCasinoData2.status);
    console.log('Casino data preview:', JSON.stringify(rCasinoData2.data).slice(0, 400));
    if (rCasinoData2.data?.data?.mid) sampleRoundMid = rCasinoData2.data.data.mid;
  }

  // 9. /casino/result
  console.log('\n--- 9. Testing /casino/result ---');
  if (sampleCasinoType) {
    const rCasinoResult = await get('/casino/result?type=' + sampleCasinoType);
    results['/casino/result'] = rCasinoResult;
    console.log('Status:', rCasinoResult.status, 'Duration:', rCasinoResult.durationMs, 'ms');
    console.log('Casino result preview:', JSON.stringify(rCasinoResult.data).slice(0, 400));
  }

  // 10. /casino/detail_result
  console.log('\n--- 10. Testing /casino/detail_result ---');
  if (sampleCasinoType) {
    const midTest = sampleRoundMid || 1;
    const rCasinoDetail = await get('/casino/detail_result?type=' + sampleCasinoType + '&mid=' + midTest);
    results['/casino/detail_result'] = rCasinoDetail;
    console.log('Status (mid=' + midTest + '):', rCasinoDetail.status, 'Duration:', rCasinoDetail.durationMs, 'ms');
    console.log('Casino detail result preview:', JSON.stringify(rCasinoDetail.data).slice(0, 400));
  }

  // 11. /get_placed_bets
  console.log('\n--- 11. Testing /get_placed_bets ---');
  const rPlaced = await get('/get_placed_bets?event_id=' + (sampleGmid || 45554544));
  results['/get_placed_bets'] = rPlaced;
  console.log('Status:', rPlaced.status, 'Duration:', rPlaced.durationMs, 'ms');
  console.log('Get placed bets preview:', JSON.stringify(rPlaced.data).slice(0, 400));

  // 12. /placed_bets (POST) - Safe schema verification
  console.log('\n--- 12. Testing /placed_bets (POST) validation ---');
  // Send incomplete payload to test validation response safely
  const rPlacedPostTest = await post('/placed_bets', {
    event_id: 0,
    event_name: 'TEST_DISCOVERY',
    market_id: 0,
    market_name: 'TEST_DISCOVERY',
    market_type: 'FANCY'
  });
  results['/placed_bets'] = rPlacedPostTest;
  console.log('Status:', rPlacedPostTest.status, 'Duration:', rPlacedPostTest.durationMs, 'ms');
  console.log('Placed bets POST preview:', JSON.stringify(rPlacedPostTest.data).slice(0, 400));

  // 13. /get-result (POST) - Safe schema verification
  console.log('\n--- 13. Testing /get-result (POST) validation ---');
  const rGetResultPostTest = await post('/get-result', {
    event_id: sampleGmid || 45554544,
    market_id: 45554544,
    event_name: 'IND vs AUS',
    market_name: '10 OVER RUNS AUS(IND vs AUS)ADV'
  });
  results['/get-result'] = rGetResultPostTest;
  console.log('Status:', rGetResultPostTest.status, 'Duration:', rGetResultPostTest.durationMs, 'ms');
  console.log('Get-result POST preview:', JSON.stringify(rGetResultPostTest.data).slice(0, 400));

  fs.writeFileSync('audit_results.json', JSON.stringify(results, null, 2));
  console.log('\nAudit complete! Saved detailed results to audit_results.json');
}

audit();
