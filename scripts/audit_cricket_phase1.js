const { chromium } = require('playwright');

async function auditLiveCricketWebsite() {
  console.log('=== PHASE 1: AUDITING CURRENT LIVE SATS SPORT WEBSITE (CRICKET) ===');
  console.log('Target: https://satsportco.vercel.app\n');

  const browser = await chromium.launch({ headless: true });
  
  // 1. DESKTOP AUDIT
  const contextDesktop = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await contextDesktop.newPage();

  console.log('Navigating to https://satsportco.vercel.app (Desktop 1280x800)...');
  await page.goto('https://satsportco.vercel.app', { waitUntil: 'domcontentloaded', timeout: 30000 });
  
  console.log('Waiting for live Diamond feeds to resolve...');
  await page.waitForFunction(() => {
    return (window.liveDiamondCricketMatches && window.liveDiamondCricketMatches.length > 0);
  }, { timeout: 30000 }).catch(e => console.log('Notice: Live cricket wait timed out or fallback used:', e.message));

  await page.waitForTimeout(2000);

  // Extract from in-play
  const inplayCricket = await page.evaluate(() => {
    const listEl = document.getElementById('list-inplayCricket');
    if (!listEl) return [];
    const rows = listEl.querySelectorAll('.default-game-box');
    const items = [];
    rows.forEach(r => {
      const t1 = r.querySelector('.def-runner-team.text-right')?.innerText.trim() || '';
      const t2 = r.querySelector('.def-runner-team.text-left')?.innerText.trim() || '';
      const comp = r.querySelector('.competition-name')?.innerText.trim() || '';
      const b1 = r.querySelector('.box.special-a span')?.innerText.trim() || '';
      const l1 = r.querySelector('.box.special-b span')?.innerText.trim() || '';
      const isLive = Boolean(r.querySelector('.live-badge'));
      const timeBadge = r.querySelector('.upcoming-time-badge')?.innerText.trim() || '';
      const onclickAttr = r.querySelector('.default-game-box-left > div')?.getAttribute('onclick') || '';
      
      // Parse gmid from onclick: openMatchDetails('cricket', 12345, 'Name')
      const match = onclickAttr.match(/openMatchDetails\([^,]+,\s*['"]?([0-9]+)['"]?/);
      const gmid = match ? match[1] : '';

      const bmBadge = Boolean(r.querySelector('.badge-bm, .badge-bookmaker') || (r.innerText.includes('B') && r.querySelector('.sp-b')));
      const fancyBadge = Boolean(r.querySelector('.badge-fancy') || (r.innerText.includes('F')));

      items.push({
        name: t1 && t2 ? `${t1} vs ${t2}` : (t1 || t2),
        t1, t2, comp, gmid, b1, l1, isLive, timeBadge,
        onclickAttr
      });
    });
    return items;
  });

  console.log(`\nFound ${inplayCricket.length} Cricket matches in Desktop IN-PLAY section.`);

  // Switch to Cricket Sport view
  console.log('\nNavigating to Cricket Sport view (selectSport("cricket"))...');
  await page.evaluate(() => selectSport('cricket'));
  await page.waitForTimeout(2000);

  const cricketPageMatches = await page.evaluate(() => {
    const cont = document.getElementById('sportsMatchesContainer');
    if (!cont) return [];
    const boxes = cont.querySelectorAll('.default-game-box');
    const items = [];
    boxes.forEach(r => {
      const t1 = r.querySelector('.def-runner-team.text-right')?.innerText.trim() || '';
      const t2 = r.querySelector('.def-runner-team.text-left')?.innerText.trim() || '';
      const comp = r.closest('.coming-up')?.querySelector('.league-name, .header-text span')?.innerText.trim() ||
                   r.querySelector('.competition-name')?.innerText.trim() || '';
      const b1 = r.querySelector('.box.special-a span')?.innerText.trim() || '';
      const l1 = r.querySelector('.box.special-b span')?.innerText.trim() || '';
      const isLive = Boolean(r.querySelector('.live-badge'));
      const timeBadge = r.querySelector('.upcoming-time-badge')?.innerText.trim() || '';
      const onclickAttr = r.querySelector('.default-game-box-left > div')?.getAttribute('onclick') || '';
      
      const match = onclickAttr.match(/openMatchDetails\([^,]+,\s*['"]?([0-9]+)['"]?/);
      const gmid = match ? match[1] : '';

      items.push({
        name: t1 && t2 ? `${t1} vs ${t2}` : (t1 || t2),
        t1, t2, comp, gmid, b1, l1, isLive, timeBadge,
        onclickAttr
      });
    });
    return items;
  });

  console.log(`Found ${cricketPageMatches.length} Cricket matches on Cricket Sport page.`);

  // Check window data objects
  const windowDiagnostics = await page.evaluate(() => {
    return {
      liveDiamondCricketCount: window.liveDiamondCricketMatches?.length || 0,
      liveSportbexCricketCount: window.liveSportbexCricketMatches?.length || 0,
      currentSelectedSport: window.currentSelectedSport,
      sportsDataCricketMatchesCount: window.sportsData?.cricket?.matches?.length || 0
    };
  });
  console.log('\nWindow Diagnostics:', windowDiagnostics);

  // 2. MOBILE VIEW (390x844)
  const contextMobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pageMobile = await contextMobile.newPage();
  await pageMobile.goto('https://satsportco.vercel.app', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await pageMobile.waitForFunction(() => window.liveDiamondCricketMatches && window.liveDiamondCricketMatches.length > 0, { timeout: 30000 });
  await pageMobile.evaluate(() => selectSport('cricket'));
  await pageMobile.waitForTimeout(1000);

  const mobileCricketMatches = await pageMobile.evaluate(() => {
    const cont = document.getElementById('sportsMatchesContainer');
    if (!cont) return [];
    const boxes = cont.querySelectorAll('.default-game-box');
    return boxes.length;
  });
  console.log(`Found ${mobileCricketMatches} Cricket matches on Mobile viewport (390x844).`);

  await browser.close();

  // Print Complete Inventory Table
  console.log('\n======================================================');
  console.log('   CURRENT WEBSITE CRICKET INVENTORY (LIVE RENDERED)   ');
  console.log('======================================================');
  console.log(`Total Cricket Matches on Cricket Page: ${cricketPageMatches.length}`);
  cricketPageMatches.forEach((m, idx) => {
    console.log(`${idx + 1}. [gmid: ${m.gmid || 'N/A'}] ${m.name}`);
    console.log(`   Comp: ${m.comp} | In-Play: ${m.isLive ? 'YES' : 'NO'} | Start: ${m.timeBadge || (m.isLive ? 'LIVE' : 'N/A')}`);
    console.log(`   Back1: ${m.b1} | Lay1: ${m.l1} | Handler: ${m.onclickAttr}`);
  });
}

auditLiveCricketWebsite().catch(err => {
  console.error('Phase 1 error:', err);
  process.exit(1);
});
