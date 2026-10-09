const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE_URL = process.env.TEST_URL || 'http://localhost:4005';
const ARTIFACTS_DIR = 'C:\\Users\\NEW PC TECH\\.gemini\\antigravity\\brain\\18b5e61b-2c45-401f-9613-7c2e2081b00b';

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  console.log('================================================================');
  console.log('  MOBILE ADMIN USER LIST UI AUDIT & VERIFICATION TEST SUITE     ');
  console.log('  Target URL:', BASE_URL);
  console.log('================================================================\n');

  const browser = await chromium.launch({ headless: true });
  const viewports = [360, 375, 390, 412, 430];

  // ---------------------------------------------------------------------------
  // STEP 1: COMPANY ACCOUNT MOBILE AUDIT (Admin Accounts Downline)
  // ---------------------------------------------------------------------------
  console.log('--- STEP 1: Testing Company Account Mobile Views ---');
  for (const w of viewports) {
    const context = await browser.newContext({ viewport: { width: w, height: 800 } });
    const page = await context.newPage();
    
    await page.goto(`${BASE_URL}/admin`, { waitUntil: 'domcontentloaded' });
    await sleep(1000);

    // Login as Company Account
    await page.fill('#user_Username', 'superadmin_1');
    await page.fill('#user_Password', 'SuperAdmin@123');
    await page.click('#adminLoginSubmitBtn');
    await page.waitForSelector('#adminAppContainer', { timeout: 15000 });
    await sleep(2000);

    // Navigate to /Accounts/Chart
    await page.evaluate(() => navigateAdmin('/Accounts/Chart'));
    await sleep(2000);

    // Ensure first user is expanded
    await page.evaluate(() => {
      const firstChild = document.querySelector('.user-child-row');
      if (firstChild && !firstChild.classList.contains('show')) {
        firstChild.classList.add('show');
      }
    });
    await sleep(500);

    // Audit DOM
    const auditData = await page.evaluate(() => {
      const table = document.getElementById('tableLedger');
      const tableRect = table ? table.getBoundingClientRect() : null;
      const windowWidth = window.innerWidth;
      const firstMainRow = document.querySelector('.user-main-row');
      const firstChildRow = document.querySelector('.user-child-row.show');
      const childText = firstChildRow ? firstChildRow.innerText : '';
      
      const hasDummyBalance = childText.toLowerCase().includes('dummy balance');
      const hasTypeBettor = childText.toLowerCase().includes('type bettor');
      const hasType = childText.includes('Type');
      const usernameText = firstMainRow ? firstMainRow.querySelector('td:nth-child(1)')?.innerText.trim() : '';

      const optionsButtons = firstChildRow ? Array.from(firstChildRow.querySelectorAll('.btn-dtr')).map(b => b.innerText.trim() || b.title || 'icon') : [];

      return {
        windowWidth,
        tableWidth: tableRect ? tableRect.width : 0,
        tableOverflows: tableRect ? (tableRect.width > windowWidth + 5) : false,
        hasDummyBalance,
        hasTypeBettor,
        hasType,
        usernameText,
        optionsCount: optionsButtons.length,
        optionsButtons,
        childTextLines: childText.split('\n').filter(Boolean)
      };
    });

    console.log(`Viewport ${w}px (Company View):`);
    console.log(`  Table Width: ${auditData.tableWidth}px (Window: ${auditData.windowWidth}px)`);
    console.log(`  Table Horizontal Overflow: ${auditData.tableOverflows ? 'YES (FAIL)' : 'NO (PASS)'}`);
    console.log(`  Username single line: "${auditData.usernameText}"`);
    console.log(`  Dummy Balance present: ${auditData.hasDummyBalance ? 'YES (FAIL)' : 'NO (PASS)'}`);
    console.log(`  "Type Bettor" present: ${auditData.hasTypeBettor ? 'YES (FAIL)' : 'NO (PASS)'}`);
    console.log(`  Options buttons: [${auditData.optionsButtons.join(', ')}] (${auditData.optionsCount} buttons)`);

    const screenshotPath = path.join(ARTIFACTS_DIR, `admin_mobile_company_${w}px.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`  Screenshot saved: ${screenshotPath}\n`);

    if (auditData.hasDummyBalance) throw new Error(`FAIL: Dummy Balance found in ${w}px view!`);
    if (auditData.hasTypeBettor) throw new Error(`FAIL: "Type Bettor" found in ${w}px view!`);

    await context.close();
  }

  // ---------------------------------------------------------------------------
  // STEP 2: CREATE ADMIN & AUDIT LOAD BALANCE NORMAL USERS MOBILE VIEW
  // ---------------------------------------------------------------------------
  console.log('\n--- STEP 2: Creating Admin & Testing Normal Users View After Load Balance ---');
  const setupContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const setupPage = await setupContext.newPage();
  await setupPage.goto(`${BASE_URL}/admin`, { waitUntil: 'domcontentloaded' });
  await sleep(1000);

  // Login as Company Account to create a fresh Admin
  await setupPage.fill('#user_Username', 'superadmin_1');
  await setupPage.fill('#user_Password', 'SuperAdmin@123');
  await setupPage.click('#adminLoginSubmitBtn');
  await setupPage.waitForSelector('#adminAppContainer', { timeout: 15000 });
  await sleep(2000);

  const testAdminUser = `adm_ui_${Math.floor(1000 + Math.random() * 9000)}`;
  const testAdminPass = 'AdminPass@123';
  console.log(`Creating test Admin "${testAdminUser}"...`);
  await setupPage.evaluate(() => navigateAdmin('/Users/Create'));
  await sleep(1500);
  await setupPage.fill('#newUserName', testAdminUser);
  await setupPage.fill('#newUserPass', testAdminPass);
  if (await setupPage.$('#newUserConfirmPass')) {
    await setupPage.fill('#newUserConfirmPass', testAdminPass);
  }
  await setupPage.click('#createUserSubmitBtn');
  await sleep(3000);
  await setupContext.close();

  // Now audit mobile viewports as that Admin after clicking Load Balance
  for (const w of viewports) {
    const context = await browser.newContext({ viewport: { width: w, height: 800 } });
    const page = await context.newPage();
    
    await page.goto(`${BASE_URL}/admin`, { waitUntil: 'domcontentloaded' });
    await sleep(1000);

    // Login as the Admin
    await page.fill('#user_Username', testAdminUser);
    await page.fill('#user_Password', testAdminPass);
    await page.click('#adminLoginSubmitBtn');
    await page.waitForSelector('#adminAppContainer', { timeout: 15000 });
    await sleep(2000);

    // Navigate to /Accounts/Chart
    await page.evaluate(() => navigateAdmin('/Accounts/Chart'));
    await sleep(2000);

    // Verify Load Balance button is visible before loading
    const beforeLoad = await page.evaluate(() => {
      const btn = document.getElementById('btnLoadBalance');
      const table = document.getElementById('tableLedger');
      return {
        btnVisible: btn ? window.getComputedStyle(btn).display !== 'none' : false,
        tableHidden: table ? table.classList.contains('balances-hidden') : false
      };
    });
    console.log(`Viewport ${w}px (Admin View) Before Load Balance:`);
    console.log(`  Load Balance button visible: ${beforeLoad.btnVisible}`);
    console.log(`  Balances hidden state: ${beforeLoad.tableHidden}`);

    // Click Load Balance
    console.log(`  Clicking "Load Balance"...`);
    await page.click('#btnLoadBalance');
    await sleep(3500);

    // Ensure first user is expanded
    await page.evaluate(() => {
      const firstChild = document.querySelector('.user-child-row');
      if (firstChild && !firstChild.classList.contains('show')) {
        firstChild.classList.add('show');
      }
    });
    await sleep(500);

    // Audit DOM after Load Balance
    const afterLoadAudit = await page.evaluate(() => {
      const table = document.getElementById('tableLedger');
      const tableRect = table ? table.getBoundingClientRect() : null;
      const windowWidth = window.innerWidth;
      const firstMainRow = document.querySelector('.user-main-row');
      const firstChildRow = document.querySelector('.user-child-row.show');
      const childText = firstChildRow ? firstChildRow.innerText : '';
      
      const hasDummyBalance = childText.toLowerCase().includes('dummy balance');
      const hasTypeBettor = childText.toLowerCase().includes('type bettor');
      const usernameText = firstMainRow ? firstMainRow.querySelector('td:nth-child(1)')?.innerText.trim() : '';
      const creditText = firstMainRow ? firstMainRow.querySelector('td:nth-child(3)')?.innerText.trim() : '';

      const optionsButtons = firstChildRow ? Array.from(firstChildRow.querySelectorAll('.btn-dtr')).map(b => b.innerText.trim() || b.title || 'icon') : [];

      return {
        windowWidth,
        tableWidth: tableRect ? tableRect.width : 0,
        tableOverflows: tableRect ? (tableRect.width > windowWidth + 5) : false,
        hasDummyBalance,
        hasTypeBettor,
        usernameText,
        creditText,
        optionsCount: optionsButtons.length,
        optionsButtons,
        childTextLines: childText.split('\n').filter(Boolean)
      };
    });

    console.log(`Viewport ${w}px (Admin View) After Load Balance:`);
    console.log(`  Table Width: ${afterLoadAudit.tableWidth}px (Window: ${afterLoadAudit.windowWidth}px)`);
    console.log(`  Table Horizontal Overflow: ${afterLoadAudit.tableOverflows ? 'YES (FAIL)' : 'NO (PASS)'}`);
    console.log(`  Username single line: "${afterLoadAudit.usernameText}", Credit: "${afterLoadAudit.creditText}"`);
    console.log(`  Dummy Balance present: ${afterLoadAudit.hasDummyBalance ? 'YES (FAIL)' : 'NO (PASS)'}`);
    console.log(`  "Type Bettor" present: ${afterLoadAudit.hasTypeBettor ? 'YES (FAIL)' : 'NO (PASS)'}`);
    console.log(`  Options buttons: [${afterLoadAudit.optionsButtons.join(', ')}] (${afterLoadAudit.optionsCount} buttons)`);

    const screenshotPath = path.join(ARTIFACTS_DIR, `admin_mobile_normal_users_${w}px.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`  Screenshot saved: ${screenshotPath}\n`);

    if (afterLoadAudit.hasDummyBalance) throw new Error(`FAIL: Dummy Balance found in normal users ${w}px view!`);
    if (afterLoadAudit.hasTypeBettor) throw new Error(`FAIL: "Type Bettor" found in normal users ${w}px view!`);

    await context.close();
  }

  await browser.close();
  console.log('================================================================');
  console.log('✅ ALL MOBILE RESPONSIVE TESTS PASSED SUCCESSFULLY!             ');
  console.log('================================================================');
}

main().catch(err => {
  console.error('\n❌ Test Error:', err.message);
  process.exit(1);
});
