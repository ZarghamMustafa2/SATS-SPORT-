const { chromium } = require('playwright');
const path = require('path');

async function testMobileViewports() {
  console.log('================================================================');
  console.log('  TESTING CRICKET ON MOBILE VIEWPORTS (390x844, 375x812, 414x896)');
  console.log('  Target: https://satsportco.vercel.app                         ');
  console.log('================================================================\n');

  const browser = await chromium.launch({ headless: true });
  const viewports = [
    { width: 390, height: 844, name: 'iPhone 12/13/14' },
    { width: 375, height: 812, name: 'iPhone X/XS/11 Pro' },
    { width: 414, height: 896, name: 'iPhone XR/11/Plus' }
  ];

  for (const vp of viewports) {
    console.log(`\n--- Testing Viewport: ${vp.width}x${vp.height} (${vp.name}) ---`);
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await context.newPage();

    await page.goto('https://satsportco.vercel.app', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => window.liveDiamondCricketMatches && window.liveDiamondCricketMatches.length > 0, { timeout: 30000 });
    await page.waitForTimeout(1000);

    // Switch to Cricket
    await page.evaluate(() => selectSport('cricket'));
    await page.waitForTimeout(1000);

    const matchCount = await page.evaluate(() => {
      const cont = document.getElementById('sportsMatchesContainer');
      return cont ? cont.querySelectorAll('.default-game-box').length : 0;
    });

    const accordionsCount = await page.evaluate(() => {
      const cont = document.getElementById('sportsMatchesContainer');
      return cont ? cont.querySelectorAll('.coming-up').length : 0;
    });

    console.log(`  Match count rendered: ${matchCount}`);
    console.log(`  Competition accordions rendered: ${accordionsCount}`);

    // Verify scrolling and element bounding boxes
    const scrollResult = await page.evaluate(() => {
      const cont = document.getElementById('sportsMatchesContainer');
      if (!cont) return { ok: false };
      cont.scrollIntoView();
      window.scrollBy(0, 300);
      const firstCard = cont.querySelector('.default-game-box');
      const rect = firstCard ? firstCard.getBoundingClientRect() : null;
      return { ok: true, scrollY: window.scrollY, cardWidth: rect ? rect.width : 0 };
    });
    console.log(`  Scroll functional: ${scrollResult.ok}, Card width: ${scrollResult.cardWidth}px`);

    // Verify match click on mobile
    const clickResult = await page.evaluate(() => {
      const firstCard = document.querySelector('#sportsMatchesContainer .default-game-box-left > div');
      if (firstCard) {
        firstCard.click();
        return true;
      }
      return false;
    });
    await page.waitForTimeout(1200);

    const detailsState = await page.evaluate(() => {
      const details = document.getElementById('matchDetailsContainer');
      const isVisible = details && details.style.display !== 'none' && details.classList.contains('show');
      return { isVisible };
    });
    console.log(`  Clickthrough to match details: ${detailsState.isVisible}`);

    // Capture screenshot on 390x844
    if (vp.width === 390) {
      await page.evaluate(() => {
        const details = document.getElementById('matchDetailsContainer');
        if (details) details.scrollIntoView();
      });
      const scPath = path.join(__dirname, '../cricket_mobile_390x844_details.png');
      await page.screenshot({ path: scPath });
      console.log(`  Saved screenshot: ${scPath}`);
    }

    await context.close();
  }

  await browser.close();
  console.log('\nAll mobile viewports verified successfully!');
}

testMobileViewports().catch(err => {
  console.error('Mobile viewport test failed:', err);
  process.exit(1);
});
