const https = require('https');
const http = require('http');

function fetchJson(url, options = {}) {
  return new Promise((resolve) => {
    const isHttps = url.startsWith('https');
    const client = isHttps ? https : http;
    const req = client.request(url, {
      method: options.method || 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        ...(options.headers || {})
      },
      timeout: 10000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ statusCode: res.statusCode, raw: data });
        }
      });
    });
    req.on('error', (err) => resolve({ statusCode: 500, error: err.message }));
    req.on('timeout', () => { req.destroy(); resolve({ statusCode: 408, error: 'TIMEOUT' }); });
    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

async function runParityAudit() {
  const timestamp = new Date().toISOString();
  console.log('================================================================');
  console.log('       SATS SPORT VS REFERENCE WEBSITE ODDS PARITY AUDIT        ');
  console.log('================================================================');
  console.log('REFERENCE URL: https://www.satsport.co.in/sports');
  console.log('SATS SPORT URL: https://satsportco.vercel.app');
  console.log('DIAMOND UPSTREAM: http://46.202.166.33:3009');
  console.log('Comparison Timestamp:', timestamp);
  console.log('----------------------------------------------------------------\n');

  // 1. Fetch Reference site default page
  console.log('Fetching Reference Website Live Events (/exchangeapi/sports/getdefaultpagenewl1/0)...');
  const refRes = await fetchJson('https://www.satsport.co.in/exchangeapi/sports/getdefaultpagenewl1/0', {
    headers: {
      'Referer': 'https://www.satsport.co.in/sports',
      'path': 'https://www.satsport.co.in/sports',
      'from': 'DefaultComponent',
      'language': 'en'
    }
  });

  const refCats = Array.isArray(refRes.data) ? refRes.data : [];
  console.log(`Reference categories retrieved: ${refCats.length}`);

  // Extract all reference market IDs to query marketsbook
  const allRefEvents = [];
  const allRefMarketIds = [];
  refCats.forEach(cat => {
    (cat.events || []).forEach(ev => {
      allRefEvents.push({ ...ev, sportName: cat.name, sportId: cat.id });
      if (ev.marketId) allRefMarketIds.push(ev.marketId);
    });
  });

  console.log(`Total Reference events found: ${allRefEvents.length}`);
  console.log(`Querying Reference Marketsbook for ${allRefMarketIds.slice(0, 30).length} market IDs...`);

  const refBookRes = await fetchJson('https://www.satsport.co.in/exchangeapi/sports/marketsbook', {
    method: 'POST',
    headers: {
      'Referer': 'https://www.satsport.co.in/sports',
      'path': 'https://www.satsport.co.in/sports',
      'from': 'DefaultComponent',
      'language': 'en',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(allRefMarketIds.slice(0, 40).join(','))
  });

  const refBooks = Array.isArray(refBookRes.data) ? refBookRes.data : [];
  const refBookMap = {};
  refBooks.forEach(b => {
    if (b.marketId) refBookMap[b.marketId] = b;
  });

  console.log(`Reference marketsbook rates mapped: ${Object.keys(refBookMap).length}`);

  // 2. Fetch Diamond Provider matches (/esid for Cricket sid=4, Soccer sid=1, Tennis sid=2)
  console.log('\nFetching Diamond API matches (sid 4, 1, 2)...');
  const [dCricket, dSoccer, dTennis] = await Promise.all([
    fetchJson('http://46.202.166.33:3009/esid?sid=4'),
    fetchJson('http://46.202.166.33:3009/esid?sid=1'),
    fetchJson('http://46.202.166.33:3009/esid?sid=2')
  ]);

  const diamondMatches = {
    cricket: [...(dCricket.data?.data?.t1 || []), ...(dCricket.data?.data?.t2 || [])],
    soccer: [...(dSoccer.data?.data?.t1 || []), ...(dSoccer.data?.data?.t2 || [])],
    tennis: [...(dTennis.data?.data?.t1 || []), ...(dTennis.data?.data?.t2 || [])]
  };

  console.log(`Diamond Cricket matches: ${diamondMatches.cricket.length}`);
  console.log(`Diamond Soccer matches: ${diamondMatches.soccer.length}`);
  console.log(`Diamond Tennis matches: ${diamondMatches.tennis.length}`);

  // 3. Fetch SATS SPORT matches
  console.log('\nFetching SATS SPORT matches from production...');
  const [satsCricket, satsSoccer, satsTennis] = await Promise.all([
    fetchJson('https://satsportco.vercel.app/api/sports?action=allmatches&sport=cricket'),
    fetchJson('https://satsportco.vercel.app/api/sports?action=allmatches&sport=soccer'),
    fetchJson('https://satsportco.vercel.app/api/sports?action=allmatches&sport=tennis')
  ]);

  const satsMatches = {
    cricket: satsCricket.data?.matches || [],
    soccer: satsSoccer.data?.matches || [],
    tennis: satsTennis.data?.matches || []
  };

  console.log(`SATS Cricket matches: ${satsMatches.cricket.length}`);
  console.log(`SATS Soccer matches: ${satsMatches.soccer.length}`);
  console.log(`SATS Tennis matches: ${satsMatches.tennis.length}`);

  // 4. Compare rates across sports
  console.log('\n================================================================');
  console.log('              SIDE-BY-SIDE MATCH ODDS RATE COMPARISON           ');
  console.log('================================================================');

  for (const sport of ['cricket', 'soccer', 'tennis']) {
    console.log(`\n----------------- SPORT: ${sport.toUpperCase()} -----------------`);
    const sList = satsMatches[sport];
    const dList = diamondMatches[sport];

    let comparedCount = 0;
    for (const sm of sList.slice(0, 10)) {
      const matchName = sm.name || `${sm.team1} vs ${sm.team2}`;
      
      // Match with Diamond
      const dm = dList.find(d => String(d.gmid) === String(sm.gmid) || d.ename === sm.name || (d.ename && d.ename.toLowerCase() === matchName.toLowerCase()));

      // Match with Reference
      const refEv = allRefEvents.find(re => {
        const rName = (re.marketName || re.eventName || '').toLowerCase();
        const mName = matchName.toLowerCase();
        return (sm.team1 && rName.includes(sm.team1.toLowerCase())) || (sm.team2 && rName.includes(sm.team2.toLowerCase())) || rName === mName;
      });

      const refBook = refEv ? refBookMap[refEv.marketId] : null;

      console.log(`\nMATCH: "${matchName}" (gmid: ${sm.gmid || sm.id})`);
      console.log(`  Competition: ${sm.competition || sm.tournament}`);

      // Compare SATS Display Rates
      console.log(`  SATS SPORT Display:`);
      console.log(`    Team 1 (${sm.team1}): Back1 = ${sm.b1 || '-'} (${sm.bS1 || ''}), Lay1 = ${sm.l1 || '-'} (${sm.lS1 || ''})`);
      if (sm.b2Draw || sm.l2Draw) {
        console.log(`    The Draw: Back1 = ${sm.b2Draw || '-'} (${sm.bS2Draw || ''}), Lay1 = ${sm.l2Draw || '-'} (${sm.lS2Draw || ''})`);
      }
      console.log(`    Team 2 (${sm.team2}): Back1 = ${sm.b2 || '-'} (${sm.bS2 || ''}), Lay1 = ${sm.l2 || '-'} (${sm.lS2 || ''})`);

      // Compare Diamond Upstream Raw Rates
      if (dm && Array.isArray(dm.section)) {
        console.log(`  Diamond Raw Upstream:`);
        dm.section.forEach((sec, idx) => {
          const b = sec.odds?.find(o => o.oname === 'back1' || o.otype === 'back');
          const l = sec.odds?.find(o => o.oname === 'lay1' || o.otype === 'lay');
          console.log(`    Section[${idx}] "${sec.nat}": Back1 = ${b?.odds || '-'} (size: ${b?.size || 0}), Lay1 = ${l?.odds || '-'} (size: ${l?.size || 0})`);
        });
      } else {
        console.log(`  Diamond Raw Upstream: (No direct /esid match)`);
      }

      // Compare Reference Website Rates
      if (refBook && Array.isArray(refBook.runners)) {
        console.log(`  Reference Website (marketsbook):`);
        refBook.runners.forEach((r, idx) => {
          const b0 = r.ex?.availableToBack?.[0];
          const l0 = r.ex?.availableToLay?.[0];
          console.log(`    Runner[${idx}] (selId: ${r.selectionId}): Back1 = ${b0?.price || '-'} (size: ${b0?.size || 0}), Lay1 = ${l0?.price || '-'} (size: ${l0?.size || 0})`);
        });
      } else {
        console.log(`  Reference Website: (Not currently in top marketsbook sample)`);
      }

      comparedCount++;
    }
  }

  // 5. Compare Fetchmatch (Afghanistan v Bangladesh)
  console.log('\n================================================================');
  console.log('       MATCH DETAILS / BOOKMAKER / FANCY IN-DEPTH PARITY        ');
  console.log('================================================================');
  const dPriv = await fetchJson('http://46.202.166.33:3009/getPriveteData?sid=4&gmid=640154297');
  const sFetch = await fetchJson('https://satsportco.vercel.app/api/sports?action=fetchmatch&sport=cricket&match=640154297');

  console.log('Event: Afghanistan v Bangladesh (gmid: 640154297)');
  console.log('\n[FANCY COMPARISON]');
  const rawPrivList = Array.isArray(dPriv.data?.data) ? dPriv.data.data : (Array.isArray(dPriv.data) ? dPriv.data : []);
  const dFancyList = rawPrivList.filter(m => m.gtype === 'fancy' || m.mname === 'Normal');
  dFancyList.forEach(m => {
    (m.section || []).slice(0, 3).forEach(sec => {
      const b = sec.odds?.find(o => o.otype === 'back');
      const l = sec.odds?.find(o => o.otype === 'lay');
      console.log(`  Diamond Raw: "${sec.nat}" -> Lay (NO): ${l?.odds} @ ${l?.size}, Back (YES): ${b?.odds} @ ${b?.size}`);
    });
  });

  let sFancyList = sFetch.data?.markets?.fancy || [];
  if (!Array.isArray(sFancyList) && typeof sFancyList === 'object') {
    sFancyList = Object.values(sFancyList).flat();
  }
  sFancyList.slice(0, 3).forEach(f => {
    console.log(`  SATS Display: "${f.marketName || f.name}" -> runsNo: ${f.runsNo || f.runners?.[0]?.lay?.[0]?.line} @ ${f.rateNo || f.runners?.[0]?.lay?.[0]?.price}, runsYes: ${f.runsYes || f.runners?.[0]?.back?.[0]?.line} @ ${f.rateYes || f.runners?.[0]?.back?.[0]?.price}`);
  });

  console.log('\n[BOOKMAKER COMPARISON]');
  const dBM = rawPrivList.find(m => m.gtype === 'match1' || m.mname?.includes('BOOKMAKER'));
  if (dBM) {
    (dBM.section || []).forEach(sec => {
      const b = sec.odds?.find(o => o.oname === 'back1');
      const l = sec.odds?.find(o => o.oname === 'lay1');
      console.log(`  Diamond Raw BM: "${sec.nat}" (status: ${sec.gstatus}) -> Back: ${b?.odds || 0}, Lay: ${l?.odds || 0}`);
    });
  }

  const sBM = sFetch.data?.markets?.bookmakers?.[0];
  if (sBM) {
    (sBM.runners || []).forEach(r => {
      console.log(`  SATS Display BM: "${r.runnerName}" (status: ${r.status}) -> Back: ${r.back?.[0]?.price || 0}, Lay: ${r.lay?.[0]?.price || 0}`);
    });
  }
}

runParityAudit().catch(console.error);
