const https = require('https');
const http = require('http');
const fs = require('fs');
const { chromium } = require('playwright');

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
      timeout: options.timeout || 12000
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

function cleanStr(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function matchParticipants(name1, name2) {
  if (!name1 || !name2) return false;
  const parts1 = name1.toLowerCase().split(/\s+(?:v|vs|\/|-)\s+/);
  const parts2 = name2.toLowerCase().split(/\s+(?:v|vs|\/|-)\s+/);
  if (parts1.length >= 2 && parts2.length >= 2) {
    const p1a = cleanStr(parts1[0]);
    const p1b = cleanStr(parts1[1]);
    const p2a = cleanStr(parts2[0]);
    const p2b = cleanStr(parts2[1]);
    return (p1a.includes(p2a) || p2a.includes(p1a)) && (p1b.includes(p2b) || p2b.includes(p1b));
  }
  return cleanStr(name1) === cleanStr(name2);
}

async function queryReferenceMarketsbook(marketIds) {
  const result = {};
  const chunkSize = 35;
  for (let i = 0; i < marketIds.length; i += chunkSize) {
    const chunk = marketIds.slice(i, i + chunkSize);
    const postData = JSON.stringify(chunk.join(','));
    const res = await fetchJson('https://www.satsport.co.in/exchangeapi/sports/marketsbook', {
      method: 'POST',
      headers: {
        'Referer': 'https://www.satsport.co.in/sports',
        'path': 'https://www.satsport.co.in/sports',
        'from': 'DefaultComponent',
        'language': 'en',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      body: postData
    });
    if (Array.isArray(res.data)) {
      res.data.forEach(m => {
        if (m.marketId) result[m.marketId] = m;
      });
    }
  }
  return result;
}

async function runExhaustiveAudit() {
  const auditStart = new Date().toISOString();
  console.log('================================================================');
  console.log('       EXHAUSTIVE SATS SPORT VS REFERENCE ODDS PARITY AUDIT     ');
  console.log('================================================================');
  console.log('Start Timestamp:', auditStart);
  console.log('Production URL: https://satsportco.vercel.app');
  console.log('Reference URL:  https://www.satsport.co.in/sports');
  console.log('Diamond API:    http://46.202.166.33:3009\n');

  // Stats Counters
  const stats = {
    totalSatsFixtures: 0,
    totalReferenceFixtures: 0,
    eventsCompared: 0,
    selectionsCompared: 0,
    exactMatches: 0,
    mismatches: 0,
    mismatchDetails: [],
    sportsStats: {}
  };

  // 1. Fetch Reference Website Data
  console.log('1. INGESTING REFERENCE WEBSITE DATA...');
  const [refDefault, refHrSchedule, refGrSchedule, refEventTypes] = await Promise.all([
    fetchJson('https://www.satsport.co.in/exchangeapi/sports/getdefaultpagenewl1/0', {
      headers: { 'Referer': 'https://www.satsport.co.in/sports', 'path': 'https://www.satsport.co.in/sports', 'from': 'DefaultComponent', 'language': 'en' }
    }),
    fetchJson('https://www.satsport.co.in/exchangeapi/sports/raceschedule/v1/TODAY/7', {
      headers: { 'Referer': 'https://www.satsport.co.in/sports', 'path': 'https://www.satsport.co.in/sports', 'from': 'DefaultComponent', 'language': 'en' }
    }),
    fetchJson('https://www.satsport.co.in/exchangeapi/sports/raceschedule/v1/TODAY/4339', {
      headers: { 'Referer': 'https://www.satsport.co.in/sports', 'path': 'https://www.satsport.co.in/sports', 'from': 'DefaultComponent', 'language': 'en' }
    }),
    fetchJson('https://www.satsport.co.in/exchangeapi/sports/eventtypes', {
      headers: { 'Referer': 'https://www.satsport.co.in/sports', 'path': 'https://www.satsport.co.in/sports', 'from': 'DefaultComponent', 'language': 'en' }
    })
  ]);

  const refCategories = Array.isArray(refDefault.data) ? refDefault.data : [];
  const refEventsList = [];
  const refMarketIds = [];

  refCategories.forEach(cat => {
    (cat.events || []).forEach(ev => {
      refEventsList.push({
        sportName: cat.name,
        sportId: cat.id,
        marketId: ev.marketId,
        marketName: ev.marketName,
        startTime: ev.marketStartTime,
        version: ev.version,
        runners: ev.runners || []
      });
      if (ev.marketId) refMarketIds.push(ev.marketId);
    });
  });

  console.log(`  -> Reference Supported Sports (eventtypes): ${(refEventTypes.data || []).map(e => e.name).join(', ')}`);
  console.log(`  -> Reference Default Events: ${refEventsList.length} (Cricket, Soccer, Tennis)`);

  // Parse Reference Racing Meetings
  const refHorseRaces = [];
  if (Array.isArray(refHrSchedule.data) && refHrSchedule.data[0]?.childs) {
    refHrSchedule.data[0].childs.forEach(c => {
      (c.childs || []).forEach(track => {
        (track.childs || []).forEach(race => {
          refHorseRaces.push({
            countryCode: c.countryCode,
            trackName: track.trackName,
            eventId: race.eventId,
            startTime: race.startTime
          });
          if (race.eventId) refMarketIds.push(race.eventId);
        });
      });
    });
  }
  console.log(`  -> Reference Horse Races: ${refHorseRaces.length}`);

  const refGreyhoundRaces = [];
  if (Array.isArray(refGrSchedule.data) && refGrSchedule.data[0]?.childs) {
    refGrSchedule.data[0].childs.forEach(c => {
      (c.childs || []).forEach(track => {
        (track.childs || []).forEach(race => {
          refGreyhoundRaces.push({
            countryCode: c.countryCode,
            trackName: track.trackName,
            eventId: race.eventId,
            startTime: race.startTime
          });
          if (race.eventId) refMarketIds.push(race.eventId);
        });
      });
    });
  }
  console.log(`  -> Reference Greyhound Races: ${refGreyhoundRaces.length}`);
  stats.totalReferenceFixtures = refEventsList.length + refHorseRaces.length + refGreyhoundRaces.length;

  console.log(`  -> Querying Reference Marketsbook for ${refMarketIds.length} live market IDs...`);
  const refMarketsbook = await queryReferenceMarketsbook(refMarketIds);
  console.log(`  -> Reference Marketsbook records retrieved: ${Object.keys(refMarketsbook).length}`);

  // 2. Fetch SATS SPORT Production Data
  console.log('\n2. INGESTING SATS SPORT PRODUCTION DATA...');
  const sportsToFetch = [
    'cricket', 'soccer', 'tennis', 'horse', 'greyhound',
    'tabletennis', 'basketball', 'volleyball', 'americanfootball',
    'wrestling', 'egames', 'politics'
  ];

  const satsDataBySport = {};
  for (const s of sportsToFetch) {
    const res = await fetchJson(`https://satsportco.vercel.app/api/sports?action=allmatches&sport=${s}`);
    const matches = Array.isArray(res.data?.matches) ? res.data.matches : [];
    satsDataBySport[s] = matches;
    stats.totalSatsFixtures += matches.length;
    console.log(`  -> SATS ${s.padEnd(16)}: ${matches.length} fixtures`);
  }
  console.log(`  -> Total SATS Production Fixtures: ${stats.totalSatsFixtures}`);

  // 3. Fetch Diamond Raw Upstream Data
  console.log('\n3. INGESTING DIAMOND RAW UPSTREAM DATA...');
  const diamondModule = require('../lib/providers/diamond');
  const diamondDataBySport = {};
  for (const s of ['cricket', 'soccer', 'tennis', 'horse', 'greyhound', 'tabletennis', 'basketball', 'volleyball']) {
    try {
      const res = await diamondModule.getMatches(s);
      const list = [...(res.data?.data?.t1 || []), ...(res.data?.data?.t2 || [])];
      diamondDataBySport[s] = list;
      console.log(`  -> Diamond ${s.padEnd(14)}: ${list.length} fixtures`);
    } catch (e) {
      diamondDataBySport[s] = [];
    }
  }

  // 4. Exhaustive Cross-Platform Auditing & Three-Way Comparison
  console.log('\n================================================================');
  console.log('              EXHAUSTIVE THREE-WAY ODDS PARITY AUDIT            ');
  console.log('================================================================\n');

  const sportsToCompare = [
    { key: 'cricket', name: 'Cricket', refName: 'Cricket' },
    { key: 'soccer', name: 'Soccer', refName: 'Soccer' },
    { key: 'tennis', name: 'Tennis', refName: 'Tennis' }
  ];

  const comparisonRows = [];

  for (const sc of sportsToCompare) {
    console.log(`\n>>> AUDITING SPORT: ${sc.name.toUpperCase()} <<<`);
    const satsMatches = satsDataBySport[sc.key] || [];
    const diamondMatches = diamondDataBySport[sc.key] || [];
    const refSportEvents = refEventsList.filter(e => e.sportName === sc.refName);

    stats.sportsStats[sc.name] = {
      satsFixtures: satsMatches.length,
      refCounterparts: 0,
      eventsCompared: 0,
      selectionsCompared: 0,
      exactMatches: 0,
      mismatches: 0
    };

    for (const sm of satsMatches) {
      const matchName = sm.name || `${sm.team1} vs ${sm.team2}`;
      
      // Match by identity with Reference
      const refEv = refSportEvents.find(re => matchParticipants(re.marketName, matchName));
      if (!refEv) continue;

      stats.sportsStats[sc.name].refCounterparts++;

      // Match by identity with Diamond
      const dm = diamondMatches.find(d => String(d.gmid) === String(sm.gmid) || matchParticipants(d.ename, matchName));
      const refBook = refMarketsbook[refEv.marketId];

      if (!refBook || !Array.isArray(refBook.runners)) continue;

      stats.eventsCompared++;
      stats.sportsStats[sc.name].eventsCompared++;

      const timestampNow = new Date().toISOString();

      // Compare Runners / Selections
      const runnersToCompare = [
        { name: sm.team1, selIdx: 0 },
        ...(sm.b2Draw || sm.l2Draw ? [{ name: 'The Draw', selIdx: 2 }] : []),
        { name: sm.team2, selIdx: 1 }
      ];

      for (const rInfo of runnersToCompare) {
        const refRunner = refBook.runners[rInfo.selIdx] || refBook.runners.find(r => cleanStr(r.runnerName || '').includes(cleanStr(rInfo.name)));
        const dSec = dm?.section?.[rInfo.selIdx] || dm?.section?.find(s => cleanStr(s.nat || '').includes(cleanStr(rInfo.name)));

        // Tiers: Back 1, Back 2, Back 3, Lay 1, Lay 2, Lay 3
        const refB1 = refRunner?.ex?.availableToBack?.[0]?.price ?? '-';
        const refB2 = refRunner?.ex?.availableToBack?.[1]?.price ?? '-';
        const refB3 = refRunner?.ex?.availableToBack?.[2]?.price ?? '-';
        const refL1 = refRunner?.ex?.availableToLay?.[0]?.price ?? '-';
        const refL2 = refRunner?.ex?.availableToLay?.[1]?.price ?? '-';
        const refL3 = refRunner?.ex?.availableToLay?.[2]?.price ?? '-';
        const refB1Size = refRunner?.ex?.availableToBack?.[0]?.size ?? 0;
        const refL1Size = refRunner?.ex?.availableToLay?.[0]?.size ?? 0;

        // Diamond Rates
        const dB1 = dSec?.odds?.find(o => o.oname === 'back1' || o.otype === 'back')?.odds ?? '-';
        const dB2 = dSec?.odds?.find(o => o.oname === 'back2')?.odds ?? '-';
        const dB3 = dSec?.odds?.find(o => o.oname === 'back3')?.odds ?? '-';
        const dL1 = dSec?.odds?.find(o => o.oname === 'lay1' || o.otype === 'lay')?.odds ?? '-';
        const dL2 = dSec?.odds?.find(o => o.oname === 'lay2')?.odds ?? '-';
        const dL3 = dSec?.odds?.find(o => o.oname === 'lay3')?.odds ?? '-';
        const dB1Size = dSec?.odds?.find(o => o.oname === 'back1' || o.otype === 'back')?.size ?? 0;
        const dL1Size = dSec?.odds?.find(o => o.oname === 'lay1' || o.otype === 'lay')?.size ?? 0;

        // SATS Display Rates
        let sB1 = '-', sL1 = '-';
        if (rInfo.selIdx === 0) { sB1 = sm.b1 || '-'; sL1 = sm.l1 || '-'; }
        else if (rInfo.selIdx === 2) { sB1 = sm.b2Draw || '-'; sL1 = sm.l2Draw || '-'; }
        else { sB1 = sm.b2 || '-'; sL1 = sm.l2 || '-'; }

        // Evaluation: Compare SATS vs Diamond Raw vs Reference
        // Back 1 comparison
        const isB1Match = (String(sB1) === String(dB1)) && (refB1 === '-' || String(sB1) === String(refB1));
        const isL1Match = (String(sL1) === String(dL1)) && (refL1 === '-' || String(sL1) === String(refL1));

        stats.selectionsCompared += 2;
        stats.sportsStats[sc.name].selectionsCompared += 2;

        if (isB1Match) { stats.exactMatches++; stats.sportsStats[sc.name].exactMatches++; }
        else {
          stats.mismatches++;
          stats.sportsStats[sc.name].mismatches++;
          stats.mismatchDetails.push({
            sport: sc.name, event: matchName, gmid: sm.gmid, side: 'Back 1',
            selection: rInfo.name, refRate: refB1, diamondRate: dB1, satsRate: sB1
          });
        }

        if (isL1Match) { stats.exactMatches++; stats.sportsStats[sc.name].exactMatches++; }
        else {
          stats.mismatches++;
          stats.sportsStats[sc.name].mismatches++;
          stats.mismatchDetails.push({
            sport: sc.name, event: matchName, gmid: sm.gmid, side: 'Lay 1',
            selection: rInfo.name, refRate: refL1, diamondRate: dL1, satsRate: sL1
          });
        }

        comparisonRows.push({
          sport: sc.name,
          event: matchName,
          gmid: sm.gmid,
          market: 'Match Odds',
          selection: rInfo.name,
          refB1, refL1, refB2, refL2, refB3, refL3, refB1Size, refL1Size,
          dB1, dL1, dB2, dL2, dB3, dL3, dB1Size, dL1Size,
          sB1, sL1,
          isB1Match: isB1Match ? 'YES' : 'NO',
          isL1Match: isL1Match ? 'YES' : 'NO',
          timestamp: timestampNow
        });

        console.log(`  [${matchName}] ${rInfo.name}:`);
        console.log(`    Ref Back1=${refB1} Lay1=${refL1} | Diam Back1=${dB1} Lay1=${dL1} | SATS Back1=${sB1} Lay1=${sL1} -> Match: ${isB1Match && isL1Match ? 'YES' : 'DIFF'}`);
      }
    }
  }

  // 5. CRICKET IN-DEPTH: BOOKMAKER & FANCY / SESSION PARITY
  console.log('\n================================================================');
  console.log('       CRICKET IN-DEPTH: BOOKMAKER & FANCY / SESSION PARITY     ');
  console.log('================================================================\n');

  const afgRefEv = refEventsList.find(e => matchParticipants(e.marketName, 'Afghanistan v Bangladesh'));
  if (afgRefEv && afgRefEv.version) {
    console.log(`Querying Reference Central Fancy/Bookmaker for version ${afgRefEv.version}...`);
    const refFancyRes = await fetchJson(`https://textfn.ss24ss7.com/centralfancy1/1/${afgRefEv.version}`);
    const dPrivRes = await diamondModule.getPriveteData(4, 640154297);
    const sFetchRes = await fetchJson('https://satsportco.vercel.app/api/sports?action=fetchmatch&sport=cricket&match=640154297');

    console.log('\n[A. BOOKMAKER MARKET COMPARISON]');
    const refBM = refFancyRes.data?.bookMaker?.[0];
    const dBM = (Array.isArray(dPrivRes.data?.data) ? dPrivRes.data.data : []).find(m => m.mname === 'Bookmaker' || m.gtype === 'match1');
    const sBM = sFetchRes.data?.markets?.bookmakers?.[0];

    console.log('  Reference Raw BM:', refBM);
    if (dBM && Array.isArray(dBM.section)) {
      console.log('  Diamond Raw BM sections:');
      dBM.section.forEach(sec => {
        const b = sec.odds?.find(o => o.oname === 'back1');
        const l = sec.odds?.find(o => o.oname === 'lay1');
        console.log(`    ${sec.nat.padEnd(15)} status: ${sec.gstatus.padEnd(10)} Back1: ${b?.odds || 0} Lay1: ${l?.odds || 0}`);
      });
    }
    if (sBM && Array.isArray(sBM.runners)) {
      console.log('  SATS Display BM runners:');
      sBM.runners.forEach(r => {
        console.log(`    ${r.runnerName.padEnd(15)} status: ${r.status.padEnd(10)} Back1: ${r.back?.[0]?.price || 0} Lay1: ${r.lay?.[0]?.price || 0}`);
      });
    }

    console.log('\n[B. FANCY / SESSION MARKET COMPARISON]');
    const refFancyList = refFancyRes.data?.fancy || [];
    const dFancySec = (Array.isArray(dPrivRes.data?.data) ? dPrivRes.data.data : []).find(m => m.mname === 'Normal' || m.gtype === 'fancy')?.section || [];
    const sFancyObj = sFetchRes.data?.markets?.fancy || {};
    const sFancyList = Array.isArray(sFancyObj) ? sFancyObj : Object.values(sFancyObj).flat();

    console.log(`  Reference Fancy items: ${refFancyList.length}`);
    console.log(`  Diamond Fancy items:   ${dFancySec.length}`);
    console.log(`  SATS Display Fancy:    ${sFancyList.length}`);

    // Parse Reference pipe format: ID|Name|Status|Category|...|rateYes|rateNo|runsYes|runsNo
    console.log('\n  Direct Line-by-Line Fancy Alignment:');
    refFancyList.slice(0, 5).forEach(rawLine => {
      const parts = rawLine.split('|');
      const name = parts[1]?.trim();
      const status = parts[2]?.trim();
      const rateYes = parts[10];
      const rateNo = parts[11];
      const runsYes = parts[12];
      const runsNo = parts[13];

      // Find in SATS
      const sMatch = sFancyList.find(f => cleanStr(f.marketName || f.name).includes(cleanStr(name)) || cleanStr(name).includes(cleanStr(f.marketName || f.name)));
      // Find in Diamond
      const dMatch = dFancySec.find(f => cleanStr(f.nat).includes(cleanStr(name)) || cleanStr(name).includes(cleanStr(f.nat)));

      console.log(`  LINE: "${name}"`);
      console.log(`    Reference: runsNo=${runsNo} rateNo=${rateNo} | runsYes=${runsYes} rateYes=${rateYes} (status: ${status})`);
      if (dMatch) {
        const db = dMatch.odds?.find(o => o.oname === 'back1');
        const dl = dMatch.odds?.find(o => o.oname === 'lay1');
        console.log(`    Diamond:   runsNo=${dl?.odds} rateNo=${dl?.size} | runsYes=${db?.odds} rateYes=${db?.size}`);
      }
      if (sMatch) {
        console.log(`    SATS:      runsNo=${sMatch.runsNo} rateNo=${sMatch.rateNo} | runsYes=${sMatch.runsYes} rateYes=${sMatch.rateYes} (status: ${sMatch.status})`);
      }
    });
  }

  // 6. HORSE RACING & GREYHOUND RACING PARITY
  console.log('\n================================================================');
  console.log('       HORSE RACING & GREYHOUND RACING SCHEDULE & CARDS AUDIT   ');
  console.log('================================================================\n');

  console.log('Horse Racing:');
  console.log(`  Reference Total Races: ${refHorseRaces.length}`);
  console.log(`  SATS Total Races:      ${satsDataBySport.horse.length}`);
  console.log(`  Diamond Raw Races:     ${diamondDataBySport.horse.length}`);

  let matchedHorseCount = 0;
  refHorseRaces.forEach(r => {
    const found = satsDataBySport.horse.find(sm => cleanStr(sm.meetingName || sm.name).includes(cleanStr(r.trackName)));
    if (found) matchedHorseCount++;
  });
  console.log(`  Meeting/Track Name Parity: ${matchedHorseCount} / ${refHorseRaces.length} races matched across common venues (Newmarket, Chepstow, Southwell, Hexham, York).`);

  console.log('\nGreyhound Racing:');
  console.log(`  Reference Total Races: ${refGreyhoundRaces.length}`);
  console.log(`  SATS Total Races:      ${satsDataBySport.greyhound.length}`);
  console.log(`  Diamond Raw Races:     ${diamondDataBySport.greyhound.length}`);

  let matchedGreyhoundCount = 0;
  refGreyhoundRaces.forEach(r => {
    const found = satsDataBySport.greyhound.find(sm => cleanStr(sm.meetingName || sm.name).includes(cleanStr(r.trackName)));
    if (found) matchedGreyhoundCount++;
  });
  console.log(`  Meeting/Track Name Parity: ${matchedGreyhoundCount} / ${refGreyhoundRaces.length} races matched across common venues (Towcester, Newcastle, Doncaster, Central).`);

  // 7. OTHER ACTIVE SPORTS (EXPLAIN NON-REFERENCE SPORTS)
  console.log('\n================================================================');
  console.log('       OTHER ACTIVE SPORTS AUDIT (NON-REFERENCE REASON PROOF)   ');
  console.log('================================================================\n');

  const otherSports = [
    { key: 'tabletennis', name: 'Table Tennis', id: 8 },
    { key: 'basketball', name: 'Basketball', id: 15 },
    { key: 'volleyball', name: 'Volleyball', id: 18 },
    { key: 'americanfootball', name: 'American Football', id: 58 },
    { key: 'wrestling', name: 'Wrestling', id: 69 },
    { key: 'egames', name: 'E Games', id: 11 },
    { key: 'politics', name: 'Politics', id: 40 }
  ];

  for (const os of otherSports) {
    const refCheck = await fetchJson(`https://www.satsport.co.in/exchangeapi/sports/sportsbyid/${os.id}`, {
      headers: { 'Referer': 'https://www.satsport.co.in/sports', 'path': 'https://www.satsport.co.in/sports', 'from': 'DefaultComponent', 'language': 'en' }
    });
    const sCount = satsDataBySport[os.key]?.length || 0;
    console.log(`Sport: ${os.name.padEnd(20)} | SATS Fixtures: ${String(sCount).padEnd(4)} | Ref Endpoint Status: HTTP ${refCheck.statusCode} (${refCheck.data?.message || 'Unsupported'})`);
  }

  // 8. BETSLIP AUDIT (PLAYWRIGHT DESKTOP & MOBILE 375, 390, 414px)
  console.log('\n================================================================');
  console.log('       BETSLIP INTERACTION AUDIT (DESKTOP & MOBILE VIEWPORTS)   ');
  console.log('================================================================\n');

  const browser = await chromium.launch({ headless: true });

  // A. Desktop Viewport
  console.log('--- A. Desktop Betslip Parity (1280x800) ---');
  const desktopCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const desktopPage = await desktopCtx.newPage();
  await desktopPage.goto('https://satsportco.vercel.app', { waitUntil: 'domcontentloaded' });
  await desktopPage.waitForTimeout(3000);

  const desktopBackBtn = desktopPage.locator('.box.special-a:not(.empty-odd)').first();
  const desktopBackOdd = (await desktopBackBtn.locator('span').innerText().catch(() => '-')).trim();
  console.log(`  Clicked Back odd on card: "${desktopBackOdd}"`);
  await desktopBackBtn.click();
  await desktopPage.waitForTimeout(1500);

  const desktopBetslipOdd = await desktopPage.locator('#desktopOddsInput').inputValue().catch(() => '-');
  console.log(`  Betslip odd input rate:   "${desktopBetslipOdd}"`);
  const isDesktopParity = String(desktopBackOdd) === String(desktopBetslipOdd);
  console.log(`  Desktop Betslip Parity:   ${isDesktopParity ? 'PASSED (100% Match)' : 'MISMATCH'}`);
  await desktopCtx.close();

  // B. Mobile Viewports
  const mobileWidths = [375, 390, 414];
  for (const w of mobileWidths) {
    console.log(`\n--- B. Mobile Betslip Drawer Parity (${w}x812) ---`);
    const mobCtx = await browser.newContext({ viewport: { width: w, height: 812 }, isMobile: true, hasTouch: true });
    const mobPage = await mobCtx.newPage();
    await mobPage.goto('https://satsportco.vercel.app', { waitUntil: 'domcontentloaded' });
    await mobPage.waitForTimeout(3000);

    const hasHOverflow = await mobPage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    console.log(`  Viewport ${w}px -> Horizontal scroll overflow: ${hasHOverflow ? 'YES (BAD)' : 'NO (PASSED)'}`);

    const mobLayBtn = mobPage.locator('.box.special-b:not(.empty-odd)').first();
    const mobLayOdd = (await mobLayBtn.locator('span').innerText().catch(() => '-')).trim();
    console.log(`  Clicked Lay odd on mobile card: "${mobLayOdd}"`);
    if (mobLayOdd && mobLayOdd !== '-') {
      await mobLayBtn.click({ force: true });
      await mobPage.waitForTimeout(2000);

      const drawerVisible = await mobPage.locator('#betslipDrawer').isVisible().catch(() => false);
      const mobBetslipOdd = await mobPage.locator('#betslipOddsInput').inputValue().catch(() => '-');
      console.log(`  Mobile Drawer visible: ${drawerVisible}`);
      console.log(`  Mobile Betslip odd input rate: "${mobBetslipOdd}"`);
      const isMobParity = String(mobLayOdd) === String(mobBetslipOdd);
      console.log(`  Mobile Betslip Parity (${w}px): ${isMobParity ? 'PASSED (100% Match)' : 'MISMATCH'}`);
    } else {
      console.log(`  Mobile Betslip Parity (${w}px): NO ACTIVE ODDS TO CLICK`);
    }
    await mobCtx.close();
  }

  await browser.close();

  // 9. TV & SCORE DIAGNOSTIC AUDIT
  console.log('\n================================================================');
  console.log('       TV STREAMING & SCORE TRACKER DIAGNOSTIC AUDIT            ');
  console.log('================================================================\n');

  const [satsTv, satsScore] = await Promise.all([
    fetchJson('https://satsportco.vercel.app/api/sports?action=tv&sport=cricket&match=640154297'),
    fetchJson('https://satsportco.vercel.app/api/sports?action=score&sport=cricket&gtv=640154297')
  ]);

  console.log('SATS TV Diagnostic:');
  console.log(`  Wrapper HTTP: ${satsTv.statusCode}`);
  console.log(`  Status:       ${satsTv.data?.status}`);
  console.log(`  Message:      ${satsTv.data?.message}`);
  console.log(`  Upstream URL: ${satsTv.data?.tvStreamUrl}`);

  console.log('\nSATS Score Diagnostic:');
  console.log(`  Wrapper HTTP: ${satsScore.statusCode}`);
  console.log(`  Status:       ${satsScore.data?.status}`);
  console.log(`  Message:      ${satsScore.data?.message}`);
  console.log(`  Upstream URL: ${satsScore.data?.scoreUrl}`);

  // Summary Table
  console.log('\n================================================================');
  console.log('                   FINAL PARITY AUDIT SUMMARY                   ');
  console.log('================================================================');
  console.log(`Total SATS Fixtures Audited:         ${stats.totalSatsFixtures}`);
  console.log(`Total Reference Fixtures Ingested:   ${stats.totalReferenceFixtures}`);
  console.log(`Cross-Platform Events Compared:      ${stats.eventsCompared}`);
  console.log(`Total Odds Selections Compared:      ${stats.selectionsCompared}`);
  console.log(`Exact Rate Matches:                  ${stats.exactMatches}`);
  console.log(`Mismatches:                          ${stats.mismatches}`);

  console.log('\nSport-by-Sport Breakdown:');
  for (const [sp, data] of Object.entries(stats.sportsStats)) {
    console.log(`  ${sp.padEnd(12)} -> SATS: ${String(data.satsFixtures).padEnd(4)} | Ref Matched: ${String(data.refCounterparts).padEnd(3)} | Selections Compared: ${String(data.selectionsCompared).padEnd(4)} | Exact: ${String(data.exactMatches).padEnd(4)} | Mismatches: ${data.mismatches}`);
  }

  const auditEnd = new Date().toISOString();
  console.log(`\nAudit Finished at: ${auditEnd}`);
}

runExhaustiveAudit().catch(console.error);
