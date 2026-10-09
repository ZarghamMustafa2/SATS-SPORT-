const http = require('http');
const fs = require('fs');

const BASE = 'http://46.202.166.33:3009';

function request(method, path, body = null) {
  return new Promise((resolve) => {
    const start = Date.now();
    const url = new URL(path, BASE);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname + url.search,
      headers: {},
      timeout: 15000
    };

    let payload = null;
    if (body) {
      payload = JSON.stringify(body);
      options.headers['Content-Type'] = 'application/json';
      options.headers['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = http.request(options, (res) => {
      let d = '';
      res.on('data', chunk => d += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(d); } catch (e) {}
        resolve({
          method,
          path,
          status: res.statusCode,
          headers: res.headers,
          durationMs: Date.now() - start,
          isJson: !!json,
          data: json,
          rawPreview: (d || '').slice(0, 500)
        });
      });
    });

    req.on('error', e => resolve({ method, path, error: e.message, status: 0 }));
    req.on('timeout', () => { req.destroy(); resolve({ method, path, error: 'TIMEOUT', status: 0 }); });

    if (payload) req.write(payload);
    req.end();
  });
}

async function runDeepAudit() {
  console.log('================================================================');
  console.log('   DEEP FORENSIC AUDIT OF DIAMOND BETTING API (46.202.166.33:3009)');
  console.log('================================================================\n');

  const report = {};

  // 1. /allSportid
  console.log('1. Testing GET /allSportid...');
  const resAllSports = await request('GET', '/allSportid');
  report['/allSportid'] = resAllSports;
  console.log(`   -> Status: ${resAllSports.status}, Duration: ${resAllSports.durationMs}ms`);
  const sportsList = resAllSports.data?.data || [];
  console.log(`   -> Sports Count: ${sportsList.length}`);
  if (sportsList.length > 0) {
    console.log(`   -> Sample Sport:`, sportsList[0]);
  }

  // 2. /tree
  console.log('\n2. Testing GET /tree...');
  const resTree = await request('GET', '/tree');
  report['/tree'] = resTree;
  console.log(`   -> Status: ${resTree.status}, Duration: ${resTree.durationMs}ms`);
  const treeSports = resTree.data?.data?.t1 || [];
  console.log(`   -> Tree Sports Count: ${treeSports.length}`);

  // Find cricket sport in tree
  const cricketInTree = treeSports.find(s => s.etid === 4 || s.name?.toLowerCase() === 'cricket');
  console.log(`   -> Cricket leagues in tree:`, cricketInTree ? (cricketInTree.children || []).length : 'None');

  // 3. /esid
  console.log('\n3. Testing GET /esid (Cricket sid=4, Football sid=1, Tennis sid=2)...');
  const resEsidCricket = await request('GET', '/esid?sid=4');
  report['/esid?sid=4'] = resEsidCricket;
  console.log(`   -> sid=4 Status: ${resEsidCricket.status}, Duration: ${resEsidCricket.durationMs}ms`);
  
  let matchesT1 = [];
  let matchesT2 = [];
  if (resEsidCricket.data?.data) {
    matchesT1 = resEsidCricket.data.data.t1 || [];
    matchesT2 = resEsidCricket.data.data.t2 || [];
  }
  console.log(`   -> sid=4 matches: t1=${matchesT1.length}, t2=${matchesT2.length}`);

  let activeMatch = matchesT1[0] || matchesT2[0];
  if (!activeMatch && cricketInTree?.children) {
    for (const comp of cricketInTree.children) {
      if (comp.children && comp.children.length > 0) {
        activeMatch = comp.children[0];
        break;
      }
    }
  }

  if (activeMatch) {
    console.log(`   -> Selected Real Cricket Match:`, {
      gmid: activeMatch.gmid,
      ename: activeMatch.ename || activeMatch.name,
      cid: activeMatch.cid,
      cname: activeMatch.cname,
      iplay: activeMatch.iplay,
      stime: activeMatch.stime,
      gtv: activeMatch.gtv,
      sections: activeMatch.section?.length || 0
    });
  } else {
    console.log('   -> No cricket match found directly, searching football...');
    const resEsidFoot = await request('GET', '/esid?sid=1');
    const fT1 = resEsidFoot.data?.data?.t1 || [];
    const fT2 = resEsidFoot.data?.data?.t2 || [];
    activeMatch = fT1[0] || fT2[0];
    if (activeMatch) activeMatch.sid = 1;
  }

  const gmid = activeMatch?.gmid || 640154297;
  const sid = activeMatch?.etid || activeMatch?.sid || 4;
  const gtv = activeMatch?.gtv || null;
  const matchName = activeMatch?.ename || activeMatch?.name || 'Cricket Match';

  console.log(`   -> Testing IDs: gmid=${gmid}, sid=${sid}, gtv=${gtv}, matchName="${matchName}"`);

  // 4. /getDetailsData
  console.log('\n4. Testing GET /getDetailsData...');
  const resDetails = await request('GET', `/getDetailsData?gmid=${gmid}&sid=${sid}`);
  report['/getDetailsData'] = resDetails;
  console.log(`   -> Status: ${resDetails.status}, Duration: ${resDetails.durationMs}ms`);
  console.log(`   -> Data preview:`, resDetails.rawPreview);

  // 5. /getPriveteData
  console.log('\n5. Testing GET /getPriveteData...');
  const resPrivate = await request('GET', `/getPriveteData?gmid=${gmid}&sid=${sid}`);
  report['/getPriveteData'] = resPrivate;
  console.log(`   -> Status: ${resPrivate.status}, Duration: ${resPrivate.durationMs}ms`);
  if (resPrivate.data?.data) {
    const keys = Object.keys(resPrivate.data.data);
    console.log(`   -> Data keys in getPriveteData:`, keys);
    if (resPrivate.data.data.bm) {
      console.log(`   -> Bookmaker markets count:`, resPrivate.data.data.bm.length);
    }
    if (resPrivate.data.data.f) {
      console.log(`   -> Fancy markets count:`, resPrivate.data.data.f.length);
    }
  }

  // 6. /score
  console.log('\n6. Testing GET /score...');
  // Test with gtv if exists, otherwise gmid
  const testGtv = gtv || gmid;
  const resScore = await request('GET', `/score?gtv=${testGtv}&sid=${sid}`);
  report['/score'] = resScore;
  console.log(`   -> Status (/score?gtv=${testGtv}&sid=${sid}): ${resScore.status}, Duration: ${resScore.durationMs}ms`);
  console.log(`   -> Score response preview:`, resScore.rawPreview);

  // Try other sid for score just in case
  const resScore2 = await request('GET', `/score?gtv=1&sid=4`);
  console.log(`   -> Status (/score?gtv=1&sid=4): ${resScore2.status}, Preview: ${resScore2.rawPreview.slice(0, 100)}`);

  // 7. /casino/tableid
  console.log('\n7. Testing GET /casino/tableid...');
  const resCasinoTables = await request('GET', '/casino/tableid');
  report['/casino/tableid'] = resCasinoTables;
  console.log(`   -> Status: ${resCasinoTables.status}, Duration: ${resCasinoTables.durationMs}ms`);
  const tables = resCasinoTables.data?.data?.t1 || [];
  console.log(`   -> Tables Count: ${tables.length}`);
  let sampleTable = tables[0];
  console.log(`   -> Sample Table:`, sampleTable);

  // 8. /casino/data
  console.log('\n8. Testing GET /casino/data...');
  let roundMid = null;
  // Test with table.gmid (e.g. 'worli3')
  const tableSlug = sampleTable?.gmid || 'worli3';
  const resCasinoData = await request('GET', `/casino/data?type=${tableSlug}`);
  report['/casino/data'] = resCasinoData;
  console.log(`   -> Status (/casino/data?type=${tableSlug}): ${resCasinoData.status}, Duration: ${resCasinoData.durationMs}ms`);
  if (Array.isArray(resCasinoData.data?.data) && resCasinoData.data.data.length > 0) {
    roundMid = resCasinoData.data.data[0].mid;
    console.log(`   -> Extracted active round mid:`, roundMid);
    console.log(`   -> Round sample:`, resCasinoData.data.data[0]);
  } else if (resCasinoData.data?.data?.mid) {
    roundMid = resCasinoData.data.data.mid;
    console.log(`   -> Extracted round mid:`, roundMid);
  }

  // Also test with another popular casino game like 'teen20' or 'aaa' or 'dragontiger'
  const teenTable = tables.find(t => t.gmid?.includes('teen') || t.gmid?.includes('dt'));
  if (teenTable) {
    const resTeen = await request('GET', `/casino/data?type=${teenTable.gmid}`);
    console.log(`   -> Status (/casino/data?type=${teenTable.gmid}): ${resTeen.status}`);
    if (resTeen.data?.data) {
      console.log(`   -> ${teenTable.gmid} data preview:`, JSON.stringify(resTeen.data.data).slice(0, 200));
    }
  }

  // 9. /casino/result
  console.log('\n9. Testing GET /casino/result...');
  // Test with tableSlug
  const resCasinoResult = await request('GET', `/casino/result?type=${tableSlug}`);
  report['/casino/result'] = resCasinoResult;
  console.log(`   -> Status (/casino/result?type=${tableSlug}): ${resCasinoResult.status}, Duration: ${resCasinoResult.durationMs}ms`);
  console.log(`   -> Result preview:`, resCasinoResult.rawPreview);

  // Test also with numeric gid
  if (sampleTable?.gid) {
    const resCasinoResultNum = await request('GET', `/casino/result?type=${sampleTable.gid}`);
    console.log(`   -> Status with numeric gid (${sampleTable.gid}): ${resCasinoResultNum.status}, Preview: ${resCasinoResultNum.rawPreview}`);
  }

  // 10. /casino/detail_result
  console.log('\n10. Testing GET /casino/detail_result...');
  const testMid = roundMid || 194261008170332;
  const resCasinoDetail = await request('GET', `/casino/detail_result?type=${tableSlug}&mid=${testMid}`);
  report['/casino/detail_result'] = resCasinoDetail;
  console.log(`   -> Status (/casino/detail_result?type=${tableSlug}&mid=${testMid}): ${resCasinoDetail.status}, Duration: ${resCasinoDetail.durationMs}ms`);
  console.log(`   -> Detail result preview:`, resCasinoDetail.rawPreview);

  // 11. /get_placed_bets
  console.log('\n11. Testing GET /get_placed_bets...');
  const resGetPlacedBets = await request('GET', `/get_placed_bets?event_id=${gmid}`);
  report['/get_placed_bets'] = resGetPlacedBets;
  console.log(`   -> Status (/get_placed_bets?event_id=${gmid}): ${resGetPlacedBets.status}, Duration: ${resGetPlacedBets.durationMs}ms`);
  console.log(`   -> Preview:`, resGetPlacedBets.rawPreview);

  // 12. /placed_bets (POST)
  console.log('\n12. Testing POST /placed_bets (Safe verification)...');
  const betPayload = {
    event_id: parseInt(gmid, 10) || 45554544,
    event_name: matchName,
    market_id: 1,
    market_name: 'Match Odds',
    market_type: 'ODDS'
  };
  const resPlacedBets = await request('POST', '/placed_bets', betPayload);
  report['/placed_bets'] = resPlacedBets;
  console.log(`   -> Status: ${resPlacedBets.status}, Duration: ${resPlacedBets.durationMs}ms`);
  console.log(`   -> Response:`, resPlacedBets.rawPreview);

  // 13. /get-result (POST)
  console.log('\n13. Testing POST /get-result (Safe verification)...');
  const resultPayload = {
    event_id: parseInt(gmid, 10) || 45554544,
    market_id: 1,
    event_name: matchName,
    market_name: 'Match Odds'
  };
  const resGetResult = await request('POST', '/get-result', resultPayload);
  report['/get-result'] = resGetResult;
  console.log(`   -> Status: ${resGetResult.status}, Duration: ${resGetResult.durationMs}ms`);
  console.log(`   -> Response:`, resGetResult.rawPreview);

  // 14. AUTHENTICATION FORENSIC AUDIT
  console.log('\n--- AUTHENTICATION ANALYSIS ---');
  const resWithKey = await request('GET', '/allSportid?key=test_api_key_123');
  const resNoKey = await request('GET', '/allSportid');
  const resWithBadKey = await request('GET', '/allSportid?key=invalid_key_xyz');
  console.log(`   -> /allSportid with key: status ${resWithKey.status}, len ${resWithKey.rawPreview.length}`);
  console.log(`   -> /allSportid no key: status ${resNoKey.status}, len ${resNoKey.rawPreview.length}`);
  console.log(`   -> /allSportid bad key: status ${resWithBadKey.status}, len ${resWithBadKey.rawPreview.length}`);

  // Check headers
  console.log('\nServer Response Headers:');
  console.log(resNoKey.headers);

  // Save full audit report
  fs.writeFileSync('audit_results.json', JSON.stringify(report, null, 2));
  console.log('\nAudit report successfully saved to audit_results.json!');
}

runDeepAudit().catch(console.error);
