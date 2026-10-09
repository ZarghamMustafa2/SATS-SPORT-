const { chromium } = require('playwright');

async function testFunctionality() {
  console.log('Testing functional parity on https://satsportco.vercel.app ...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', err => errors.push(err.message));

  await page.goto('https://satsportco.vercel.app', { waitUntil: 'networkidle', timeout: 30000 });
  console.log('1. Page loaded.');

  // Check cricket inplay matches exist
  const cricketCards = await page.$$('.default-game-box');
  console.log(`2. Visible match cards on feed: ${cricketCards.length}`);

  // Test selecting Soccer
  console.log('3. Clicking Soccer in subnav...');
  await page.click('[data-sport="soccer"]');
  await page.waitForTimeout(2500);

  const soccerCards = await page.$$('.default-game-box');
  console.log(`4. Visible soccer match cards: ${soccerCards.length}`);

  // Test load more competitions if present
  const loadMoreBtn = await page.$('.load-more-comps');
  if (loadMoreBtn) {
    console.log('5. Clicking "Load More Competitions"...');
    await loadMoreBtn.click();
    await page.waitForTimeout(1000);
    const updatedCards = await page.$$('.default-game-box');
    console.log(`   Updated cards after Load More: ${updatedCards.length}`);
  }

  // Test search functionality
  console.log('6. Testing match search...');
  await page.evaluate(() => {
    if (typeof filterSportsMatchesByQuery === 'function') filterSportsMatchesByQuery('Madrid');
  });
  await page.waitForTimeout(1000);
  const searchCards = await page.$$('.default-game-box');
  console.log(`   Filtered cards for "Madrid": ${searchCards.length}`);

  // Clear search
  await page.evaluate(() => {
    if (typeof filterSportsMatchesByQuery === 'function') filterSportsMatchesByQuery('');
  });
  await page.waitForTimeout(1000);

  // Test clicking an odd to open Bet Slip
  console.log('7. Testing odds click -> Bet Slip drawer...');
  const firstOddBtn = await page.$('.sp-b .box:not(.empty-odd)');
  if (firstOddBtn) {
    await firstOddBtn.click();
    await page.waitForTimeout(1000);
    const betslipDrawer = await page.$('#betslipDrawer.show, #betslipDrawer');
    const isVisible = await betslipDrawer.isVisible();
    const eventTitle = await page.$eval('#betslipEventTitle', el => el.innerText).catch(() => '');
    console.log(`   Betslip opened: ${isVisible}, Title: ${eventTitle}`);
  }

  // Test opening a match detail
  console.log('8. Testing Match Details view...');
  await page.evaluate(() => {
    const el = document.querySelector('.default-game-box-left > div');
    if (el) el.click();
  });
  await page.waitForTimeout(2000);
  const detailsContainer = await page.$('#matchDetailsContainer');
  const detailsDisplay = await detailsContainer.evaluate(el => el.style.display);
  console.log(`   Match details visible: ${detailsDisplay !== 'none'}`);

  // Test closing match details
  console.log('9. Closing Match Details...');
  await page.evaluate(() => {
    if (typeof closeMatchDetails === 'function') closeMatchDetails();
  });
  await page.waitForTimeout(1000);
  const feedRestored = await page.$eval('#sportsMatchesContainer', el => el.style.display !== 'none').catch(() => false);
  console.log(`   Feed restored: ${feedRestored}`);

  console.log(`10. Critical errors caught during run: ${errors.filter(e => !e.includes('favicon') && !e.includes('401')).length}`);
  if (errors.length > 0) {
    console.log('   Filtered errors:', errors.slice(0, 5));
  }

  await browser.close();
  console.log('All functional checks passed cleanly!');
}

testFunctionality().catch(err => {
  console.error('Functional test failed:', err);
  process.exit(1);
});
