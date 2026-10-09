const { chromium } = require('playwright');

async function testCricketMatchDetails() {
  console.log('================================================================');
  console.log('  TESTING CRICKET MATCH DETAILS (5 LIVE + 5 UPCOMING MATCHES)   ');
  console.log('  Target: https://satsportco.vercel.app                         ');
  console.log('================================================================\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(`[CONSOLE] ${msg.text()}`);
  });
  page.on('pageerror', err => {
    consoleErrors.push(`[PAGE_ERR] ${err.message}`);
  });

  await page.goto('https://satsportco.vercel.app', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => window.liveDiamondCricketMatches && window.liveDiamondCricketMatches.length > 0, { timeout: 30000 });
  await page.waitForTimeout(1000);

  // Switch to Cricket
  await page.evaluate(() => selectSport('cricket'));
  await page.waitForTimeout(1000);

  // Get available matches from window.liveDiamondCricketMatches
  const matches = await page.evaluate(() => {
    return (window.liveDiamondCricketMatches || []).map(m => ({
      gmid: String(m.gmid || m.id || ''),
      name: m.name || (m.team1 + ' vs ' + m.team2),
      team1: m.team1 || '',
      team2: m.team2 || '',
      time: m.time || (m.inPlay ? 'LIVE' : 'Upcoming'),
      inPlay: Boolean(m.inPlay || m.isLive),
      competition: m.competition || m.tournament || '',
      b1: m.b1 || '1.85',
      l1: m.l1 || '1.87',
      b2: m.b2 || '2.10',
      l2: m.l2 || '2.14',
      hasBM: Boolean(m.hasBM),
      hasFancy: Boolean(m.hasFancy)
    }));
  });

  console.log(`Total Diamond Cricket matches in window: ${matches.length}`);
  const liveMatches = matches.filter(m => m.inPlay);
  const upcomingMatches = matches.filter(m => !m.inPlay);
  console.log(`Live matches available: ${liveMatches.length}, Upcoming matches: ${upcomingMatches.length}\n`);

  const selectedLive = liveMatches.slice(0, 5);
  const selectedUpcoming = upcomingMatches.slice(0, 5);

  const results = { live: [], upcoming: [] };

  // Helper to test opening a match
  async function testMatch(m, type) {
    console.log(`--- Testing [${type.toUpperCase()}] Match: ${m.name} (gmid: ${m.gmid}) ---`);
    const res = await page.evaluate(async (matchData) => {
      // Trigger openMatchDetails
      openMatchDetails(
        matchData.team1,
        matchData.team2,
        matchData.time,
        'all',
        matchData.b1,
        matchData.l1,
        matchData.b2,
        matchData.l2,
        matchData.gmid
      );

      // Wait 1.5s for dynamic poll / rendering
      await new Promise(r => setTimeout(r, 1500));

      const details = document.getElementById('matchDetailsContainer');
      const isVisible = details && details.style.display !== 'none' && details.classList.contains('show');
      const titleEl = details ? details.querySelector('.match-details-topbar span:last-child') : null;
      const titleText = titleEl ? titleEl.innerText : '';
      
      const moRunners = details ? details.querySelectorAll('#matchSection-match .match-runner-row').length : 0;
      const bmSec = details ? document.getElementById('matchSection-bookmaker') : null;
      const fancySec = details ? document.getElementById('matchSection-fancy') : null;
      
      const bmVisible = bmSec && bmSec.style.display !== 'none' && !bmSec.innerText.includes('Zero Commission') === false;
      const fancyVisible = fancySec && fancySec.style.display !== 'none';

      // Close details for next test
      closeMatchDetails();

      return {
        isVisible,
        titleText,
        moRunners,
        bmVisible,
        fancyVisible
      };
    }, m);

    console.log(`  Visible: ${res.isVisible} | Title: "${res.titleText}"`);
    console.log(`  Match Odds Runners: ${res.moRunners} | BM Active: ${res.bmVisible} | Fancy Active: ${res.fancyVisible}`);
    
    await page.waitForTimeout(500);
    return { ...m, ...res };
  }

  // Test 5 Live Matches
  console.log('=== 1. TESTING 5 LIVE CRICKET MATCHES ===');
  for (const m of selectedLive) {
    const r = await testMatch(m, 'live');
    results.live.push(r);
  }

  // Test 5 Upcoming Matches
  console.log('\n=== 2. TESTING 5 UPCOMING CRICKET MATCHES ===');
  for (const m of selectedUpcoming) {
    const r = await testMatch(m, 'upcoming');
    results.upcoming.push(r);
  }

  console.log('\n=== 3. CONSOLE ERROR CHECK ===');
  // Filter out 401 on /api/auth/me which is normal for unauthenticated guest
  const relevantErrors = consoleErrors.filter(e => !e.includes('/api/auth/me') && !e.includes('401'));
  if (relevantErrors.length === 0) {
    console.log('PASS: 0 unexpected console or page errors detected.');
  } else {
    console.log(`Notice: Detected ${relevantErrors.length} errors:`, relevantErrors);
  }

  await browser.close();
  console.log('\n================================================================');
  console.log('  MATCH DETAILS TESTING COMPLETED SUCCESSFULLY                   ');
  console.log('================================================================');
}

testCricketMatchDetails().catch(err => {
  console.error('Match details test failed:', err);
  process.exit(1);
});
