// scripts/test_company_self_recharge_dashboard_sync.js
// Verification for Company Account Dashboard Balance Sync with Self Recharge
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const PROD_URL = 'https://satsportco.vercel.app';
const ARTIFACTS_DIR = 'C:\\Users\\NEW PC TECH\\.gemini\\antigravity\\brain\\18b5e61b-2c45-401f-9613-7c2e2081b00b';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, options = {}, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fetch(url, options);
    } catch (err) {
      if (i === retries - 1) throw err;
      await sleep(1000);
    }
  }
}

async function main() {
  console.log('================================================================');
  console.log('🚀 TESTING COMPANY ACCOUNT DASHBOARD BALANCE SYNC WITH SELF RECHARGE');
  console.log('🌐 Target URL:', PROD_URL);
  console.log('================================================================\n');

  // 1. Authenticate Company Account via API to get token
  console.log('--- Step 1: Authenticating Company Account ---');
  const compLoginRes = await fetchWithRetry(`${PROD_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'superadmin_1', password: 'SuperAdmin@123' })
  });
  const compLoginData = await compLoginRes.json();
  const companyToken = compLoginData.token;
  console.log('Company Account logged in:', Boolean(companyToken), 'Role:', compLoginData.user?.role);
  if (!companyToken) {
    throw new Error('Failed to obtain Company Account session: ' + JSON.stringify(compLoginData));
  }

  // 2. Reset starting balance to 0 for pristine repeatable testing
  console.log('\n--- Step 2: Resetting Starting Balance to 0 ---');
  const resetRes = await fetchWithRetry(`${PROD_URL}/api/admin/users?action=self_recharge`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + companyToken,
      'X-Admin-Token': companyToken,
      'X-Admin-Request': 'true'
    },
    body: JSON.stringify({ action: 'reset_balance', setBalance: 0 })
  });
  const resetData = await resetRes.json();
  console.log('Reset Response:', resetData.message, 'Numeric Bal:', resetData.numericBalance);

  // 3. Launch browser session
  console.log('\n--- Step 3: Launching Playwright Browser ---');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // Go to Admin login page
  await page.goto(`${PROD_URL}/admin`, { waitUntil: 'domcontentloaded' });
  await sleep(1000);

  // Log in as Company Account
  await page.fill('#user_Username', 'superadmin_1');
  await page.fill('#user_Password', 'SuperAdmin@123');
  await page.click('#adminLoginSubmitBtn');
  await page.waitForSelector('#adminAppContainer', { timeout: 15000 });
  await sleep(3000);

  // =========================================================================
  // TEST 1: Starting balance = 0, Self Recharge = 50,000
  // Expected: Self Recharge page = 50,000, Dashboard balance/credit field = 50,000
  // =========================================================================
  console.log('\n================================================================');
  console.log('TEST 1: STARTING BALANCE 0 -> SELF RECHARGE 50,000');
  console.log('================================================================');

  // Verify initial dashboard balance is 0
  const initialCreditRemaining = (await page.innerText('#sumCreditRemaining')).trim();
  console.log('Initial Dashboard Credit Remaining:', initialCreditRemaining);
  if (initialCreditRemaining !== '0' && initialCreditRemaining !== '0.00') {
    throw new Error(`Expected initial Credit Remaining to be 0, got: ${initialCreditRemaining}`);
  }

  // Record initial Users count and P/L Downline for Test 5 comparison
  const initialUsersCount = (await page.innerText('#sumUsersCount')).trim();
  const initialPLDownline = (await page.innerText('#sumPLDownline')).trim();
  console.log('Initial Users Count:', initialUsersCount, '| Initial P/L Downline:', initialPLDownline);

  // Navigate to Self Recharge page
  console.log('Navigating to Self Recharge view...');
  await page.evaluate(() => navigateAdmin('/Finance/SelfRecharge'));
  await page.waitForSelector('#viewSelfRecharge', { state: 'visible', timeout: 10000 });
  await sleep(1000);

  // Check Self Recharge initial balance is 0
  const srInitialBalText = (await page.innerText('#selfRechargeCurrentBalDisplay')).trim();
  console.log('Initial Self Recharge Page Balance:', srInitialBalText);

  // Perform Self Recharge = 50,000
  console.log('Submitting Self Recharge = 50,000...');
  await page.fill('#selfRechargeAmountInput', '50000');
  await page.fill('#selfRechargeNoteInput', 'Test Initial Liquidity 50k');
  await page.click('#selfRechargeSubmitBtn');

  // Wait for recharge confirmation alert
  await page.waitForSelector('#selfRechargeAlertMsg.alert-success', { timeout: 15000 });
  await sleep(2000);

  // Check Self Recharge page balance after 50k
  const srBal50kText = (await page.innerText('#selfRechargeCurrentBalDisplay')).trim();
  console.log('Self Recharge Page Balance after 50k:', srBal50kText);
  if (!srBal50kText.includes('50,000')) {
    throw new Error(`Expected Self Recharge page to display 50,000, got: ${srBal50kText}`);
  }

  // Navigate back to Dashboard
  console.log('Navigating back to Dashboard...');
  await page.evaluate(() => navigateAdmin('/admin'));
  await page.waitForSelector('#viewDashboard', { state: 'visible', timeout: 10000 });
  await sleep(2000);

  // Verify Dashboard summary table Credit Remaining
  const dashCredit50k = (await page.innerText('#sumCreditRemaining')).trim();
  const headerBal50k = (await page.innerText('#headerWalletBal')).trim();
  console.log('Dashboard Credit Remaining after 50k:', dashCredit50k);
  console.log('Header Balance (B:) after 50k:', headerBal50k);

  if (dashCredit50k !== '50,000') {
    throw new Error(`Expected Dashboard Credit Remaining to be 50,000, got: ${dashCredit50k}`);
  }
  if (headerBal50k !== '50,000') {
    throw new Error(`Expected Header Balance to be 50,000, got: ${headerBal50k}`);
  }
  console.log('✅ TEST 1 PASSED: Self Recharge page = 50,000 & Dashboard Credit Remaining = 50,000');

  const shot50kPath = path.join(ARTIFACTS_DIR, 'live_company_self_recharge_50k_dashboard.png');
  await page.screenshot({ path: shot50kPath, fullPage: false });
  console.log('📸 Saved 50k Dashboard Screenshot:', shot50kPath);

  // =========================================================================
  // TEST 2: Recharge another 20,000 -> Both locations = 70,000
  // =========================================================================
  console.log('\n================================================================');
  console.log('TEST 2: RECHARGE ANOTHER 20,000 -> BOTH LOCATIONS = 70,000');
  console.log('================================================================');

  // Navigate to Self Recharge page
  await page.evaluate(() => navigateAdmin('/Finance/SelfRecharge'));
  await page.waitForSelector('#viewSelfRecharge', { state: 'visible', timeout: 10000 });
  await sleep(1000);

  // Submit another 20,000
  console.log('Submitting Self Recharge = 20,000...');
  await page.fill('#selfRechargeAmountInput', '20000');
  await page.fill('#selfRechargeNoteInput', 'Test Additional Liquidity 20k');
  await page.click('#selfRechargeSubmitBtn');

  await page.waitForSelector('#selfRechargeAlertMsg.alert-success', { timeout: 15000 });
  await sleep(2000);

  // Check Self Recharge page balance after 20k added (total 70k)
  const srBal70kText = (await page.innerText('#selfRechargeCurrentBalDisplay')).trim();
  console.log('Self Recharge Page Balance after additional 20k:', srBal70kText);
  if (!srBal70kText.includes('70,000')) {
    throw new Error(`Expected Self Recharge page to display 70,000, got: ${srBal70kText}`);
  }

  // Navigate to Dashboard
  await page.evaluate(() => navigateAdmin('/admin'));
  await page.waitForSelector('#viewDashboard', { state: 'visible', timeout: 10000 });
  await sleep(2000);

  const dashCredit70k = (await page.innerText('#sumCreditRemaining')).trim();
  const headerBal70k = (await page.innerText('#headerWalletBal')).trim();
  console.log('Dashboard Credit Remaining after 70k:', dashCredit70k);
  console.log('Header Balance (B:) after 70k:', headerBal70k);

  if (dashCredit70k !== '70,000') {
    throw new Error(`Expected Dashboard Credit Remaining to be 70,000, got: ${dashCredit70k}`);
  }
  if (headerBal70k !== '70,000') {
    throw new Error(`Expected Header Balance to be 70,000, got: ${headerBal70k}`);
  }
  console.log('✅ TEST 2 PASSED: Both locations updated to 70,000');

  const shot70kPath = path.join(ARTIFACTS_DIR, 'live_company_self_recharge_70k_dashboard.png');
  await page.screenshot({ path: shot70kPath, fullPage: false });
  console.log('📸 Saved 70k Dashboard Screenshot:', shot70kPath);

  // Capture targeted screenshot of the exact table shown in user screenshot
  await page.evaluate(() => navigateAdmin('/Accounts/Chart'));
  await page.waitForSelector('#Tabletoreplace', { state: 'visible', timeout: 10000 });
  await sleep(1500);
  const tableEl = await page.$('#Tabletoreplace');
  const tableShotPath = path.join(ARTIFACTS_DIR, 'live_company_accounts_chart_table_70k.png');
  if (tableEl) {
    await tableEl.screenshot({ path: tableShotPath });
    console.log('📸 Saved 70k Summary Table Screenshot:', tableShotPath);
  }
  await page.evaluate(() => navigateAdmin('/admin'));
  await sleep(1000);

  // =========================================================================
  // TEST 3: Refresh page -> Both remain 70,000
  // =========================================================================
  console.log('\n================================================================');
  console.log('TEST 3: REFRESH PAGE PERSISTENCE');
  console.log('================================================================');

  console.log('Reloading dashboard page...');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await sleep(3000);

  const dashCreditAfterReload = (await page.innerText('#sumCreditRemaining')).trim();
  const headerBalAfterReload = (await page.innerText('#headerWalletBal')).trim();
  console.log('Dashboard Credit Remaining after reload:', dashCreditAfterReload);
  console.log('Header Balance after reload:', headerBalAfterReload);

  if (dashCreditAfterReload !== '70,000') {
    throw new Error(`Expected Credit Remaining to remain 70,000 after reload, got: ${dashCreditAfterReload}`);
  }

  // Check Self Recharge page after reload
  await page.evaluate(() => navigateAdmin('/Finance/SelfRecharge'));
  await page.waitForSelector('#viewSelfRecharge', { state: 'visible', timeout: 10000 });
  await sleep(1500);

  const srBalAfterReload = (await page.innerText('#selfRechargeCurrentBalDisplay')).trim();
  console.log('Self Recharge page balance after reload:', srBalAfterReload);
  if (!srBalAfterReload.includes('70,000')) {
    throw new Error(`Expected Self Recharge page to remain 70,000 after reload, got: ${srBalAfterReload}`);
  }
  console.log('✅ TEST 3 PASSED: Both locations remain 70,000 after page refresh');

  // =========================================================================
  // TEST 4: Logout / Login -> Both remain 70,000
  // =========================================================================
  console.log('\n================================================================');
  console.log('TEST 4: LOGOUT / LOGIN PERSISTENCE');
  console.log('================================================================');

  // Log out
  console.log('Executing Admin Logout...');
  await page.evaluate(() => executeAdminLogout());
  await sleep(2000);

  // Log back in
  console.log('Logging back in as Company Account...');
  await page.fill('#user_Username', 'superadmin_1');
  await page.fill('#user_Password', 'SuperAdmin@123');
  await page.click('#adminLoginSubmitBtn');
  await page.waitForSelector('#adminAppContainer', { timeout: 15000 });
  await sleep(3000);

  // Verify Dashboard Credit Remaining
  const dashCreditAfterRelogin = (await page.innerText('#sumCreditRemaining')).trim();
  console.log('Dashboard Credit Remaining after relogin:', dashCreditAfterRelogin);
  if (dashCreditAfterRelogin !== '70,000') {
    throw new Error(`Expected Credit Remaining to remain 70,000 after relogin, got: ${dashCreditAfterRelogin}`);
  }

  // Verify Self Recharge page
  await page.evaluate(() => navigateAdmin('/Finance/SelfRecharge'));
  await page.waitForSelector('#viewSelfRecharge', { state: 'visible', timeout: 10000 });
  await sleep(1500);
  const srBalAfterRelogin = (await page.innerText('#selfRechargeCurrentBalDisplay')).trim();
  console.log('Self Recharge balance after relogin:', srBalAfterRelogin);
  if (!srBalAfterRelogin.includes('70,000')) {
    throw new Error(`Expected Self Recharge balance to remain 70,000 after relogin, got: ${srBalAfterRelogin}`);
  }
  console.log('✅ TEST 4 PASSED: Both locations remain 70,000 after logout/login');

  // =========================================================================
  // TEST 5: Verify P/L Downline and Users were NOT changed by recharge
  // =========================================================================
  console.log('\n================================================================');
  console.log('TEST 5: VERIFY P/L DOWNLINE AND USERS WERE NOT CHANGED');
  console.log('================================================================');

  await page.evaluate(() => navigateAdmin('/admin'));
  await page.waitForSelector('#viewDashboard', { state: 'visible', timeout: 10000 });
  await sleep(2000);

  const finalUsersCount = (await page.innerText('#sumUsersCount')).trim();
  const finalPLDownline = (await page.innerText('#sumPLDownline')).trim();
  console.log(`Users Count - Initial: ${initialUsersCount}, Final: ${finalUsersCount}`);
  console.log(`P/L Downline - Initial: ${initialPLDownline}, Final: ${finalPLDownline}`);

  if (finalUsersCount !== initialUsersCount) {
    throw new Error(`Users count changed! Initial: ${initialUsersCount}, Final: ${finalUsersCount}`);
  }
  if (finalPLDownline !== initialPLDownline) {
    throw new Error(`P/L Downline changed! Initial: ${initialPLDownline}, Final: ${finalPLDownline}`);
  }
  console.log('✅ TEST 5 PASSED: P/L Downline and Users count were strictly preserved');

  await browser.close();

  console.log('\n================================================================');
  console.log('🎉 ALL 5 COMPANY ACCOUNT BALANCE SYNC TESTS PASSED COMPLETELY!');
  console.log('================================================================');
}

main().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
