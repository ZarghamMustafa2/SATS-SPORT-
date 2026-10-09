const { chromium } = require('playwright');

async function auditProduction() {
  console.log('Launching browser to inspect https://satsportco.vercel.app ...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  console.log('Navigating to https://satsportco.vercel.app ...');
  await page.goto('https://satsportco.vercel.app', { waitUntil: 'domcontentloaded', timeout: 30000 });
  console.log('DOM loaded. Waiting 3 seconds for initial render...');
  await page.waitForTimeout(3000);

  // Helper to extract visible matches from #sportsMatchesContainer
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
        
        list.push({
          team1: team1El ? team1El.innerText.trim() : '',
          team2: team2El ? team2El.innerText.trim() : '',
          competition: compEl ? compEl.innerText.trim() : '',
          b1: b1El ? b1El.innerText.trim() : '',
          l1: l1El ? l1El.innerText.trim() : ''
        });
      });
      return list;
    });
  }

  // 1. Initial view (In-Play)
  console.log('\n=== 1. CURRENT IN-PLAY VIEW ===');
  const inplayMatches = await getRenderedMatches();
  console.log('Rendered match count in In-Play:', inplayMatches.length);
  inplayMatches.forEach((m, idx) => console.log(`  ${idx+1}. ${m.team1} vs ${m.team2} (${m.competition})`));

  // 2. Click Cricket
  console.log('\n=== 2. CRICKET VIEW ===');
  await page.evaluate(() => selectSport('cricket'));
  await page.waitForTimeout(1500);
  const cricketMatches = await getRenderedMatches();
  console.log('Rendered match count in Cricket:', cricketMatches.length);
  cricketMatches.forEach((m, idx) => console.log(`  ${idx+1}. ${m.team1} vs ${m.team2} (${m.competition})`));

  // 3. Click Soccer
  console.log('\n=== 3. SOCCER VIEW ===');
  await page.evaluate(() => selectSport('soccer'));
  await page.waitForTimeout(1500);
  const soccerMatches = await getRenderedMatches();
  console.log('Rendered match count in Soccer:', soccerMatches.length);
  soccerMatches.forEach((m, idx) => console.log(`  ${idx+1}. ${m.team1} vs ${m.team2} (${m.competition})`));

  // 4. Click Tennis
  console.log('\n=== 4. TENNIS VIEW ===');
  await page.evaluate(() => selectSport('tennis'));
  await page.waitForTimeout(1500);
  const tennisMatches = await getRenderedMatches();
  console.log('Rendered match count in Tennis:', tennisMatches.length);
  tennisMatches.forEach((m, idx) => console.log(`  ${idx+1}. ${m.team1} vs ${m.team2} (${m.competition})`));

  await browser.close();
  console.log('\nAudit complete.');
}

auditProduction().catch(console.error);
