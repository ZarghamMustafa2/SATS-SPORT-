const http = require('http');
const { chromium } = require('playwright');

const PORT = 4010;
process.env.PORT = String(PORT);
process.env.SPORTS_DATA_PROVIDER = 'diamond';

// Start server
const server = require('../server');

async function runLocalAudit() {
  console.log('Waiting 1s for local server to start...');
  await new Promise(r => setTimeout(r, 1000));

  console.log('Launching Playwright Chromium browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  const consoleLogs = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleLogs.push(`[CONSOLE ERROR] ${msg.text()}`);
  });
  page.on('pageerror', err => {
    consoleLogs.push(`[PAGE ERROR] ${err.message}`);
  });

  console.log(`Navigating to http://localhost:${PORT} ...`);
  await page.goto(`http://localhost:${PORT}`, { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Wait for feeds to fetch and populate live arrays
  console.log('Waiting for live feeds to resolve...');
  await page.waitForFunction(() => {
    return (window.liveDiamondCricketMatches && window.liveDiamondCricketMatches.length > 0) &&
           (window.liveDiamondSoccerMatches && window.liveDiamondSoccerMatches.length > 0) &&
           (window.liveDiamondTennisMatches && window.liveDiamondTennisMatches.length > 0);
  }, { timeout: 30000 });
  console.log('Live feeds resolved!');
  await page.waitForTimeout(1500);

  async function getRenderedMatches() {
    return await page.evaluate(() => {
      const cards = document.querySelectorAll('#sportsMatchesContainer .default-game-box, #sportsMatchesContainer .inplay-match-card, #sportsMatchesContainer .match-row');
      const list = [];
      cards.forEach(c => {
        const team1El = c.querySelector('.def-runner-team.text-right, .inplay-team-names span:first-child');
        const team2El = c.querySelector('.def-runner-team.text-left, .inplay-team-names span:last-child');
        const compEl = c.querySelector('.competition-name, .inplay_matches_box_header span');
        const b1El = c.querySelector('.box.special-a span, .inplay-odds-box.back span');
        const l1El = c.querySelector('.box.special-b span, .inplay-odds-box.lay span');
        const b2El = c.querySelector('.def-game-box-right .sp-b:last-child .box.special-a span');
        const l2El = c.querySelector('.def-game-box-right .sp-b:last-child .box.special-b span');
        const liveBadge = c.querySelector('.live-badge');
        const timeBadge = c.querySelector('.upcoming-time-badge');
        
        list.push({
          team1: team1El ? team1El.innerText.trim() : '',
          team2: team2El ? team2El.innerText.trim() : '',
          competition: compEl ? compEl.innerText.trim() : '',
          b1: b1El ? b1El.innerText.trim() : '',
          l1: l1El ? l1El.innerText.trim() : '',
          b2: b2El ? b2El.innerText.trim() : '',
          l2: l2El ? l2El.innerText.trim() : '',
          isLive: Boolean(liveBadge),
          timeText: timeBadge ? timeBadge.innerText.trim() : (liveBadge ? 'LIVE' : '')
        });
      });
      return list;
    });
  }

  // 1. IN-PLAY VIEW
  console.log('\n=== 1. IN-PLAY VIEW ===');
  const inplayMatches = await getRenderedMatches();
  console.log(`Rendered matches in In-Play: ${inplayMatches.length}`);
  console.log(`Sample In-Play matches:`);
  inplayMatches.slice(0, 5).forEach((m, i) => console.log(`  ${i+1}. [${m.isLive ? 'LIVE' : m.timeText}] ${m.team1} vs ${m.team2} (${m.competition}) Back1:${m.b1} Lay1:${m.l1}`));

  // 2. CRICKET VIEW
  console.log('\n=== 2. CRICKET VIEW ===');
  await page.evaluate(() => selectSport('cricket'));
  await page.waitForTimeout(1500);
  const cricketMatches = await getRenderedMatches();
  console.log(`Rendered matches in Cricket: ${cricketMatches.length}`);
  console.log(`Sample Cricket matches:`);
  cricketMatches.slice(0, 5).forEach((m, i) => console.log(`  ${i+1}. [${m.isLive ? 'LIVE' : m.timeText}] ${m.team1} vs ${m.team2} (${m.competition}) Back1:${m.b1} Lay1:${m.l1}`));

  // 3. SOCCER VIEW
  console.log('\n=== 3. SOCCER VIEW ===');
  await page.evaluate(() => selectSport('soccer'));
  await page.waitForTimeout(1500);
  const soccerMatches = await getRenderedMatches();
  console.log(`Rendered matches in Soccer: ${soccerMatches.length}`);
  console.log(`Sample Soccer matches:`);
  soccerMatches.slice(0, 5).forEach((m, i) => console.log(`  ${i+1}. [${m.isLive ? 'LIVE' : m.timeText}] ${m.team1} vs ${m.team2} (${m.competition}) Back1:${m.b1} Lay1:${m.l1}`));

  // 4. TENNIS VIEW
  console.log('\n=== 4. TENNIS VIEW ===');
  await page.evaluate(() => selectSport('tennis'));
  await page.waitForTimeout(1500);
  const tennisMatches = await getRenderedMatches();
  console.log(`Rendered matches in Tennis: ${tennisMatches.length}`);
  console.log(`Sample Tennis matches:`);
  tennisMatches.slice(0, 5).forEach((m, i) => console.log(`  ${i+1}. [${m.isLive ? 'LIVE' : m.timeText}] ${m.team1} vs ${m.team2} (${m.competition}) Back1:${m.b1} Lay1:${m.l1}`));

  // 5. TEST MATCH CLICKTHROUGH (openMatchDetails)
  console.log('\n=== 5. MATCH CLICKTHROUGH TEST ===');
  const clicked = await page.evaluate(() => {
    const firstMatch = document.querySelector('#sportsMatchesContainer .default-game-box-left > div');
    if (firstMatch) {
      firstMatch.click();
      return true;
    }
    return false;
  });
  console.log('Clicked first match:', clicked);
  await page.waitForTimeout(2000);
  const detailsVisible = await page.evaluate(() => {
    const details = document.getElementById('matchDetailsContainer');
    return details && details.style.display !== 'none' && details.classList.contains('show');
  });
  console.log('Match details visible:', detailsVisible);

  const marketLadderRows = await page.evaluate(() => {
    const rows = document.querySelectorAll('#matchDetailsContainer .match-runner-row');
    return rows.length;
  });
  console.log('Market ladder runner rows rendered:', marketLadderRows);

  // 6. CHECK FOR CONSOLE ERRORS
  console.log('\n=== 6. CONSOLE ERRORS CHECK ===');
  if (consoleLogs.length === 0) {
    console.log('ZERO console/page errors detected.');
  } else {
    console.log('Detected errors:');
    consoleLogs.forEach(e => console.log('  ', e));
  }

  await browser.close();
  server.close();
  console.log('\nAudit completed successfully.');
  process.exit(0);
}

runLocalAudit().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
