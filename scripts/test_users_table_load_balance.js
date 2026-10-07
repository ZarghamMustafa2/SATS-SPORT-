const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const PROD_URL = process.env.TEST_URL || 'https://satsportco.vercel.app';
const ARTIFACTS_DIR = 'C:\\Users\\NEW PC TECH\\.gemini\\antigravity\\brain\\18b5e61b-2c45-401f-9613-7c2e2081b00b';

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  console.log('================================================================');
  console.log('🚀 TESTING USERS TABLE: HIDDEN BY DEFAULT, SHOW ON LOAD BALANCE');
  console.log('🌐 Target URL:', PROD_URL);
  console.log('================================================================');

  const browser = await chromium.launch({ headless: true });
  const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await desktopContext.newPage();

  // -------------------------------------------------------------------------
  // TEST 1: Company Account Initial Open -> User details hidden, button ready
  // -------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log('TEST 1: COMPANY ACCOUNT - INITIAL OPEN (/Accounts/Chart)');
  console.log('================================================================');

  await page.goto(`${PROD_URL}/admin`, { waitUntil: 'domcontentloaded' });
  await sleep(1000);
  await page.fill('#user_Username', 'superadmin_1');
  await page.fill('#user_Password', 'SuperAdmin@123');
  await page.click('#adminLoginSubmitBtn');
  await page.waitForSelector('#adminAppContainer', { timeout: 15000 });
  await sleep(2000);

  // Navigate to Users (/Accounts/Chart)
  console.log('Navigating to /Accounts/Chart...');
  await page.evaluate(() => navigateAdmin('/Accounts/Chart'));
  await sleep(2000);

  // Verify initial state
  const initialDesktopState = await page.evaluate(() => {
    const table = document.getElementById('tableLedger');
    const loadBtn = document.getElementById('btnLoadBalance');
    const rowLoad = document.getElementById('rowLoadBalance');
    const rowCols = document.getElementById('rowAccountsColumns');
    const rowTotal = document.getElementById('rowAccountsTotal');
    const tbody = document.getElementById('clientsTableBody');
    const info = document.getElementById('tableLedger_info');

    return {
      hasBalancesHiddenClass: table ? table.classList.contains('balances-hidden') : false,
      loadBtnVisible: loadBtn ? window.getComputedStyle(loadBtn).display !== 'none' : false,
      loadBtnText: loadBtn ? loadBtn.innerText.trim() : null,
      rowColsVisible: rowCols ? window.getComputedStyle(rowCols).display !== 'none' : false,
      rowTotalVisible: rowTotal ? window.getComputedStyle(rowTotal).display !== 'none' : false,
      tbodyRowCount: tbody ? tbody.children.length : 0,
      infoText: info ? info.innerText.trim() : ''
    };
  });

  console.log('Initial Desktop State:', initialDesktopState);

  if (!initialDesktopState.loadBtnVisible) {
    throw new Error('TEST 1 FAILED: Load Balance button is not visible on initial open');
  }
  if (initialDesktopState.rowColsVisible) {
    throw new Error('TEST 1 FAILED: Accounts columns row is visible before clicking Load Balance');
  }
  if (initialDesktopState.rowTotalVisible) {
    throw new Error('TEST 1 FAILED: Accounts summary/total row is visible before clicking Load Balance');
  }
  if (initialDesktopState.tbodyRowCount > 0) {
    throw new Error(`TEST 1 FAILED: Expected 0 user rows in tbody before click, found ${initialDesktopState.tbodyRowCount}`);
  }

  const initialShotPath = path.join(ARTIFACTS_DIR, 'live_company_initial_hidden_desktop.png');
  await page.screenshot({ path: initialShotPath });
  console.log('📸 Saved Initial Hidden Desktop Screenshot:', initialShotPath);
  console.log('✅ TEST 1 PASSED: User details are cleanly hidden by default, Load Balance ready');

  // -------------------------------------------------------------------------
  // TEST 2: Click "Load Balance" -> Loading state -> Real users rendered
  // -------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log('TEST 2: CLICK "LOAD BALANCE" -> FETCH REAL DATA & RENDER');
  console.log('================================================================');

  // Click Load Balance
  console.log('Clicking Load Balance button...');
  await page.click('#btnLoadBalance');

  // Check loading state quickly
  const loadingState = await page.evaluate(() => {
    const btn = document.getElementById('btnLoadBalance');
    return {
      disabled: btn ? btn.disabled : false,
      text: btn ? btn.innerText.trim() : ''
    };
  });
  console.log('Button State immediately after click:', loadingState);

  // Wait for fetch to complete and table to render
  await sleep(3500);

  const loadedDesktopState = await page.evaluate(() => {
    const table = document.getElementById('tableLedger');
    const loadBtn = document.getElementById('btnLoadBalance');
    const rowCols = document.getElementById('rowAccountsColumns');
    const tbody = document.getElementById('clientsTableBody');
    const info = document.getElementById('tableLedger_info');
    const userRows = Array.from(tbody.querySelectorAll('tr.user-main-row'));

    return {
      hasBalancesHiddenClass: table ? table.classList.contains('balances-hidden') : false,
      loadBtnVisible: loadBtn ? window.getComputedStyle(loadBtn).display !== 'none' : false,
      loadBtnDisabled: loadBtn ? loadBtn.disabled : true,
      loadBtnText: loadBtn ? loadBtn.innerText.trim() : null,
      rowColsVisible: rowCols ? window.getComputedStyle(rowCols).display !== 'none' : false,
      tbodyRowCount: tbody ? tbody.children.length : 0,
      userMainRowCount: userRows.length,
      infoText: info ? info.innerText.trim() : '',
      sampleUsers: userRows.slice(0, 3).map(r => ({
        username: r.getAttribute('data-username'),
        credit: r.querySelector('.credit-cell') ? r.querySelector('.credit-cell').innerText : '',
        balance: r.querySelector('.balance-cell') ? r.querySelector('.balance-cell').innerText : '',
        pl: r.querySelector('.pl-cell') ? r.querySelector('.pl-cell').innerText : '',
        avail: r.querySelector('.avail-cell') ? r.querySelector('.avail-cell').innerText : ''
      }))
    };
  });

  console.log('Loaded Desktop State:', loadedDesktopState);

  if (loadedDesktopState.hasBalancesHiddenClass) {
    throw new Error('TEST 2 FAILED: Table still has balances-hidden class after clicking Load Balance');
  }
  if (!loadedDesktopState.rowColsVisible) {
    throw new Error('TEST 2 FAILED: Column headers row not visible after loading');
  }
  if (loadedDesktopState.userMainRowCount === 0) {
    throw new Error('TEST 2 FAILED: No user rows rendered after clicking Load Balance');
  }
  if (loadedDesktopState.loadBtnDisabled) {
    throw new Error('TEST 2 FAILED: Load Balance button remained disabled after loading');
  }

  const loadedShotPath = path.join(ARTIFACTS_DIR, 'live_company_loaded_desktop.png');
  await page.screenshot({ path: loadedShotPath });
  console.log('📸 Saved Loaded Desktop Screenshot:', loadedShotPath);
  console.log('✅ TEST 2 PASSED: Real user details rendered properly upon clicking Load Balance');

  // -------------------------------------------------------------------------
  // TEST 3: Browser Refresh (F5 / reload) -> Details hidden again automatically
  // -------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log('TEST 3: REFRESH BEHAVIOR -> DETAILS AUTOMATICALLY HIDDEN AGAIN');
  console.log('================================================================');

  console.log('Reloading page (F5)...');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await sleep(3000);

  // Navigate to Users if landed on dashboard
  await page.evaluate(() => navigateAdmin('/Accounts/Chart'));
  await sleep(1500);

  const afterReloadState = await page.evaluate(() => {
    const table = document.getElementById('tableLedger');
    const loadBtn = document.getElementById('btnLoadBalance');
    const rowCols = document.getElementById('rowAccountsColumns');
    const rowTotal = document.getElementById('rowAccountsTotal');
    const tbody = document.getElementById('clientsTableBody');
    const info = document.getElementById('tableLedger_info');

    // Also check storage persistence violation
    const localLoaded = localStorage.getItem('balanceLoaded') || localStorage.getItem('isBalancesLoaded');
    const sessionLoaded = sessionStorage.getItem('balanceLoaded') || sessionStorage.getItem('isBalancesLoaded');

    return {
      hasBalancesHiddenClass: table ? table.classList.contains('balances-hidden') : false,
      loadBtnVisible: loadBtn ? window.getComputedStyle(loadBtn).display !== 'none' : false,
      loadBtnText: loadBtn ? loadBtn.innerText.trim() : null,
      rowColsVisible: rowCols ? window.getComputedStyle(rowCols).display !== 'none' : false,
      rowTotalVisible: rowTotal ? window.getComputedStyle(rowTotal).display !== 'none' : false,
      tbodyRowCount: tbody ? tbody.children.length : 0,
      infoText: info ? info.innerText.trim() : '',
      storageViolation: !!(localLoaded || sessionLoaded)
    };
  });

  console.log('State After Page Refresh:', afterReloadState);

  if (afterReloadState.storageViolation) {
    throw new Error('TEST 3 FAILED: Persistence violation! State was saved in localStorage/sessionStorage');
  }
  if (!afterReloadState.loadBtnVisible) {
    throw new Error('TEST 3 FAILED: Load Balance button is not visible after reload');
  }
  if (afterReloadState.rowColsVisible) {
    throw new Error('TEST 3 FAILED: Column headers row is visible after reload without clicking Load Balance');
  }
  if (afterReloadState.tbodyRowCount > 0) {
    throw new Error(`TEST 3 FAILED: Found ${afterReloadState.tbodyRowCount} rows in tbody after reload without clicking Load Balance`);
  }

  const afterRefreshShotPath = path.join(ARTIFACTS_DIR, 'live_company_after_refresh_hidden.png');
  await page.screenshot({ path: afterRefreshShotPath });
  console.log('📸 Saved After Refresh Screenshot:', afterRefreshShotPath);
  console.log('✅ TEST 3 PASSED: User details are automatically hidden again on page reload');

  // -------------------------------------------------------------------------
  // TEST 4: Re-click "Load Balance" -> Details reload cleanly
  // -------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log('TEST 4: RE-CLICK "LOAD BALANCE" AFTER REFRESH');
  console.log('================================================================');

  await page.click('#btnLoadBalance');
  await sleep(3500);

  const reloadedCount = await page.evaluate(() => {
    return document.querySelectorAll('#clientsTableBody tr.user-main-row').length;
  });
  console.log('User row count after re-clicking Load Balance:', reloadedCount);
  if (reloadedCount === 0) {
    throw new Error('TEST 4 FAILED: User details did not reload after re-clicking Load Balance');
  }
  console.log('✅ TEST 4 PASSED: User details reload successfully on re-click');

  // -------------------------------------------------------------------------
  // TEST 5: Admin Account Verification
  // -------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log('TEST 5: ADMIN ACCOUNT VERIFICATION');
  console.log('================================================================');

  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto(`${PROD_URL}/admin`, { waitUntil: 'domcontentloaded' });
  await sleep(1000);

  await page.fill('#user_Username', 'supermaster_1');
  await page.fill('#user_Password', 'SuperMaster@123');
  await page.click('#adminLoginSubmitBtn');
  await page.waitForSelector('#adminAppContainer', { timeout: 15000 });
  await sleep(2000);

  await page.evaluate(() => navigateAdmin('/Accounts/Chart'));
  await sleep(2000);

  const adminInitialState = await page.evaluate(() => {
    const loadBtn = document.getElementById('btnLoadBalance');
    const rowCols = document.getElementById('rowAccountsColumns');
    const tbody = document.getElementById('clientsTableBody');
    return {
      loadBtnVisible: loadBtn ? window.getComputedStyle(loadBtn).display !== 'none' : false,
      rowColsVisible: rowCols ? window.getComputedStyle(rowCols).display !== 'none' : false,
      tbodyRowCount: tbody ? tbody.children.length : 0
    };
  });
  console.log('Admin Account Initial State:', adminInitialState);
  if (!adminInitialState.loadBtnVisible || adminInitialState.rowColsVisible || adminInitialState.tbodyRowCount > 0) {
    throw new Error('TEST 5 FAILED: Admin account details not hidden by default on initial open');
  }

  // Admin clicks Load Balance
  await page.click('#btnLoadBalance');
  await sleep(3500);

  const adminLoadedCount = await page.evaluate(() => {
    return document.querySelectorAll('#clientsTableBody tr.user-main-row').length;
  });
  console.log('Admin Account User Row Count after click:', adminLoadedCount);
  if (adminLoadedCount === 0) {
    throw new Error('TEST 5 FAILED: Admin account failed to load user rows');
  }

  // Admin reloads
  await page.reload({ waitUntil: 'domcontentloaded' });
  await sleep(3000);
  await page.evaluate(() => navigateAdmin('/Accounts/Chart'));
  await sleep(1500);

  const adminAfterReloadCount = await page.evaluate(() => {
    const tbody = document.getElementById('clientsTableBody');
    return tbody ? tbody.children.length : 0;
  });
  console.log('Admin Account Row Count after reload:', adminAfterReloadCount);
  if (adminAfterReloadCount > 0) {
    throw new Error('TEST 5 FAILED: Admin account details were not hidden after reload');
  }

  const adminShotPath = path.join(ARTIFACTS_DIR, 'live_admin_load_balance_verified.png');
  await page.screenshot({ path: adminShotPath });
  console.log('📸 Saved Admin Load Balance Screenshot:', adminShotPath);
  console.log('✅ TEST 5 PASSED: Admin account follows identical hidden by default & reload behavior');

  // -------------------------------------------------------------------------
  // TEST 6: Mobile Viewport Verification
  // -------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log('TEST 6: MOBILE VIEWPORT VERIFICATION (375x667)');
  console.log('================================================================');

  const mobileContext = await browser.newContext({ viewport: { width: 375, height: 667 }, isMobile: true });
  const mobilePage = await mobileContext.newPage();

  await mobilePage.goto(`${PROD_URL}/admin`, { waitUntil: 'domcontentloaded' });
  await sleep(1000);
  await mobilePage.fill('#user_Username', 'superadmin_1');
  await mobilePage.fill('#user_Password', 'SuperAdmin@123');
  await mobilePage.click('#adminLoginSubmitBtn');
  await mobilePage.waitForSelector('#adminAppContainer', { timeout: 15000 });
  await sleep(2000);

  await mobilePage.evaluate(() => navigateAdmin('/Accounts/Chart'));
  await sleep(2000);

  const mobileInitialState = await mobilePage.evaluate(() => {
    const loadBtn = document.getElementById('btnLoadBalance');
    const rowLoad = document.getElementById('rowLoadBalance');
    const rowTotal = document.getElementById('rowAccountsTotal');
    const rowCols = document.getElementById('rowAccountsColumns');
    const tbody = document.getElementById('clientsTableBody');

    return {
      loadBtnVisible: loadBtn ? window.getComputedStyle(loadBtn).display !== 'none' : false,
      rowLoadVisible: rowLoad ? window.getComputedStyle(rowLoad).display !== 'none' : false,
      rowTotalVisible: rowTotal ? window.getComputedStyle(rowTotal).display !== 'none' : false,
      rowColsVisible: rowCols ? window.getComputedStyle(rowCols).display !== 'none' : false,
      tbodyRowCount: tbody ? tbody.children.length : 0
    };
  });
  console.log('Mobile Initial State:', mobileInitialState);

  if (!mobileInitialState.loadBtnVisible) {
    throw new Error('TEST 6 FAILED: Load Balance button not visible on mobile');
  }
  if (mobileInitialState.rowTotalVisible) {
    throw new Error('TEST 6 FAILED: Mobile top green summary row is visible before clicking Load Balance');
  }
  if (mobileInitialState.rowColsVisible) {
    throw new Error('TEST 6 FAILED: Mobile columns row is visible before clicking Load Balance');
  }
  if (mobileInitialState.tbodyRowCount > 0) {
    throw new Error('TEST 6 FAILED: Mobile tbody has rows before clicking Load Balance');
  }

  const mobileInitialShot = path.join(ARTIFACTS_DIR, 'live_company_mobile_initial_hidden.png');
  await mobilePage.screenshot({ path: mobileInitialShot });
  console.log('📸 Saved Mobile Initial Hidden Screenshot:', mobileInitialShot);

  // Click Load Balance on Mobile
  console.log('Clicking Load Balance on Mobile...');
  await mobilePage.click('#btnLoadBalance');
  await sleep(3500);

  const mobileLoadedState = await mobilePage.evaluate(() => {
    const rowTotal = document.getElementById('rowAccountsTotal');
    const rowCols = document.getElementById('rowAccountsColumns');
    const tbody = document.getElementById('clientsTableBody');
    const userRows = Array.from(tbody.querySelectorAll('tr.user-main-row'));

    return {
      rowTotalVisible: rowTotal ? window.getComputedStyle(rowTotal).display !== 'none' : false,
      rowColsVisible: rowCols ? window.getComputedStyle(rowCols).display !== 'none' : false,
      userMainRowCount: userRows.length
    };
  });
  console.log('Mobile Loaded State:', mobileLoadedState);

  if (mobileLoadedState.userMainRowCount === 0) {
    throw new Error('TEST 6 FAILED: Mobile user rows did not render after clicking Load Balance');
  }

  // Test tap-to-expand child details row on mobile
  await mobilePage.evaluate(() => {
    const firstUserRow = document.querySelector('#clientsTableBody tr.user-main-row');
    if (firstUserRow) firstUserRow.click();
  });
  await sleep(1000);

  const mobileExpandedVisible = await mobilePage.evaluate(() => {
    const firstChild = document.querySelector('#clientsTableBody tr.user-child-row');
    return firstChild ? firstChild.classList.contains('show') : false;
  });
  console.log('Mobile first child row expanded:', mobileExpandedVisible);

  const mobileLoadedShot = path.join(ARTIFACTS_DIR, 'live_company_mobile_loaded.png');
  await mobilePage.screenshot({ path: mobileLoadedShot });
  console.log('📸 Saved Mobile Loaded Screenshot:', mobileLoadedShot);

  // Reload on mobile -> details hidden again
  console.log('Reloading on mobile (F5)...');
  await mobilePage.reload({ waitUntil: 'domcontentloaded' });
  await sleep(3000);
  await mobilePage.evaluate(() => navigateAdmin('/Accounts/Chart'));
  await sleep(1500);

  const mobileAfterReloadCount = await mobilePage.evaluate(() => {
    const tbody = document.getElementById('clientsTableBody');
    return tbody ? tbody.children.length : 0;
  });
  console.log('Mobile Row Count after reload:', mobileAfterReloadCount);
  if (mobileAfterReloadCount > 0) {
    throw new Error('TEST 6 FAILED: Mobile user rows still present after reload');
  }

  const mobileAfterReloadShot = path.join(ARTIFACTS_DIR, 'live_company_mobile_after_refresh_hidden.png');
  await mobilePage.screenshot({ path: mobileAfterReloadShot });
  console.log('📸 Saved Mobile After Reload Screenshot:', mobileAfterReloadShot);
  console.log('✅ TEST 6 PASSED: Mobile view follows identical hidden by default & reload behavior');

  console.log('\n================================================================');
  console.log('🎉 ALL 6 COMPREHENSIVE TESTS PASSED SUCCESSFULLY!');
  console.log('================================================================');

  await browser.close();
}

main().catch(err => {
  console.error('\n❌ TEST RUNNER FATAL ERROR:', err);
  process.exit(1);
});
