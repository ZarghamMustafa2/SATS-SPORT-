// scripts/test_no_flicker_deposit_withdrawal.js
// Comprehensive Verification for Deposit & Withdrawal Zero-Flicker Continuous Visibility
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const PROD_URL = 'https://satsportco.vercel.app';
const ARTIFACTS_DIR = 'C:\\Users\\NEW PC TECH\\.gemini\\antigravity\\brain\\18b5e61b-2c45-401f-9613-7c2e2081b00b';

function createTestPngBuffer() {
  const samplePngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAALEwAACxMBAJqcGAAAAFFJREFUeJztwTEBAAAAwqD1T20JT6AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4Mde+AAB4aB40gAAAABJRU5ErkJggg==';
  return Buffer.from(samplePngBase64, 'base64');
}

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
  console.log('🚀 TESTING DEPOSIT & WITHDRAWAL CONTINUOUS VISIBILITY / ZERO FLICKER');
  console.log('🌐 Target URL:', PROD_URL);
  console.log('================================================================\n');

  const ts = Date.now().toString().slice(-6);
  const userA = 'flicker_a_' + ts;
  const userB = 'flicker_b_' + ts;
  const pass = 'FlickerPass123!';

  // --- 1. Register User A and User B ---
  console.log('--- Step 1: Registering User A & User B ---');
  for (const u of [userA, userB]) {
    const regRes = await fetchWithRetry(`${PROD_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: u, password: pass, phone: '03001234567' })
    });
    console.log(`Registered ${u}: HTTP ${regRes.status}`);
  }

  // Login User A
  const loginARes = await fetchWithRetry(`${PROD_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: userA, password: pass })
  });
  const tokenA = (await loginARes.json()).token;

  // Login User B
  const loginBRes = await fetchWithRetry(`${PROD_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: userB, password: pass })
  });
  const tokenB = (await loginBRes.json()).token;

  // Login Admin
  const adminLoginRes = await fetchWithRetry(`${PROD_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'supermaster_1', password: 'SuperMaster@123' })
  });
  const adminData = await adminLoginRes.json();
  const adminToken = adminData.token;
  console.log('Admin logged in:', Boolean(adminToken));

  // Get Bank for Deposit
  const banksRes = await fetchWithRetry(`${PROD_URL}/api/payments/banks`);
  const banksData = await banksRes.json();
  const activeBank = (banksData.banks && banksData.banks[0]) || { id: 'bank_mzn_001' };

  // --- 2. Create Deposit Request for User A & User B ---
  console.log('\n--- Step 2: User A & User B submit Deposit Requests ---');
  const samplePngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  const depARes = await fetchWithRetry(`${PROD_URL}/api/payments/deposit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenA}` },
    body: JSON.stringify({
      amount: 15000,
      bankAccountId: activeBank.id,
      screenshot: `data:image/png;base64,${samplePngBase64}`,
      note: 'User A Flicker Test Deposit'
    })
  });
  const depAData = await depARes.json();
  const depAId = depAData.request?.id;
  console.log('User A Deposit Created:', depAId);

  const depBRes = await fetchWithRetry(`${PROD_URL}/api/payments/deposit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenB}` },
    body: JSON.stringify({
      amount: 25000,
      bankAccountId: activeBank.id,
      screenshot: `data:image/png;base64,${samplePngBase64}`,
      note: 'User B Flicker Test Deposit'
    })
  });
  const depBData = await depBRes.json();
  const depBId = depBData.request?.id;
  console.log('User B Deposit Created:', depBId);

  // --- 3. Launch Playwright for Admin Verification ---
  console.log('\n--- Step 3: Launching Playwright Admin Session ---');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

  await context.addInitScript(({ token, user }) => {
    localStorage.setItem('admin_auth_token', token);
    localStorage.setItem('admin_user', JSON.stringify(user));
    localStorage.setItem('auth_token', token);
  }, { token: adminToken, user: adminData.user });

  const page = await context.newPage();

  // Navigate to Admin Deposit Requests
  console.log('Navigating to Admin Deposit Requests...');
  await page.goto(`${PROD_URL}/admin.html#deposits`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Ensure Deposit section visible
  await page.evaluate(() => {
    if (typeof navigateAdmin === 'function') navigateAdmin('/finance/deposits');
    else if (typeof loadAdminDepositRequests === 'function') loadAdminDepositRequests();
  });
  await page.waitForTimeout(2000);

  // Take initial screenshot
  const initDepShotPath = path.join(ARTIFACTS_DIR, 'admin_deposit_queue_initial.png');
  await page.screenshot({ path: initDepShotPath, fullPage: true });
  console.log('Saved initial deposit screenshot:', initDepShotPath);

  // Verify both deposits are visible
  let rowAExists = await page.evaluate((id) => document.getElementById('adminDepositRequestsTbody')?.innerText.includes(id), depAId);
  let rowBExists = await page.evaluate((id) => document.getElementById('adminDepositRequestsTbody')?.innerText.includes(id), depBId);
  console.log(`Deposit A (${depAId}) visible:`, rowAExists);
  console.log(`Deposit B (${depBId}) visible:`, rowBExists);

  if (!rowAExists || !rowBExists) {
    console.warn('Initial deposit rows not found immediately, calling loadAdminDepositRequests()...');
    await page.evaluate(() => loadAdminDepositRequests());
    await page.waitForTimeout(2000);
    rowAExists = await page.evaluate((id) => document.getElementById('adminDepositRequestsTbody')?.innerText.includes(id), depAId);
    rowBExists = await page.evaluate((id) => document.getElementById('adminDepositRequestsTbody')?.innerText.includes(id), depBId);
    console.log(`Deposit A visible after reload: ${rowAExists}, Deposit B: ${rowBExists}`);
  }

  // --- 4. 10 Consecutive Polling Cycles on Deposit Requests (Verify Zero-Flicker) ---
  console.log('\n--- Step 4: Running 10 Consecutive Polling Cycles (Zero-Flicker Test) ---');
  let flickerDetected = false;

  for (let cycle = 1; cycle <= 10; cycle++) {
    process.stdout.write(`Cycle ${cycle}/10: Polling deposit requests... `);

    // Call background load
    const pollPromise = page.evaluate(() => loadAdminDepositRequests(true));

    // Sample DOM every 50ms during the fetch to ensure rows NEVER disappear
    for (let sample = 0; sample < 10; sample++) {
      await sleep(60);
      const isVisibleDuringFetch = await page.evaluate((id) => {
        const tbody = document.getElementById('adminDepositRequestsTbody');
        if (!tbody) return false;
        // If it shows loading spinner while polling, that's a flicker violation!
        const hasSpinner = tbody.innerText.includes('Loading deposit requests');
        const hasRow = tbody.innerText.includes(id);
        return hasRow && !hasSpinner;
      }, depAId);

      if (!isVisibleDuringFetch) {
        flickerDetected = true;
        console.log(`\n❌ FLICKER DETECTED at cycle ${cycle}, sample ${sample}! Row disappeared or was replaced with spinner.`);
        break;
      }
    }

    await pollPromise;
    await sleep(200);

    const isVisibleAfter = await page.evaluate((id) => {
      const tbody = document.getElementById('adminDepositRequestsTbody');
      return tbody ? tbody.innerText.includes(id) : false;
    }, depAId);

    if (!isVisibleAfter) {
      flickerDetected = true;
      console.log(`\n❌ Row missing after cycle ${cycle}!`);
      break;
    }

    console.log('PASSED (row continuously visible, 0 flicker)');
  }

  console.log('\nDeposit Zero-Flicker 10-Cycle Result:', flickerDetected ? '❌ FAILED' : '✅ 100% PASSED');

  // --- 5. Manual Browser Refresh Test ---
  console.log('\n--- Step 5: Testing Manual Page Refresh ---');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.evaluate(() => {
    if (typeof navigateAdmin === 'function') navigateAdmin('/finance/deposits');
  });
  await page.waitForTimeout(2000);

  const rowAAfterRefresh = await page.evaluate((id) => document.getElementById('adminDepositRequestsTbody')?.innerText.includes(id), depAId);
  console.log(`Deposit A visible after browser refresh:`, rowAAfterRefresh);

  // --- 6. Approve Deposit A so User A has Balance for Withdrawal ---
  console.log('\n--- Step 6: Approving Deposit A & Testing Terminal State Removal ---');
  const approveRes = await fetchWithRetry(`${PROD_URL}/api/payments/admin/approve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`,
      'X-Admin-Token': adminToken,
      'X-Admin-Request': 'true'
    },
    body: JSON.stringify({ requestId: depAId, adminNote: 'Verified & Approved' })
  });
  const approveData = await approveRes.json();
  console.log('Approved Deposit A:', approveData.status);

  // Refresh admin deposit table
  await page.evaluate(() => loadAdminDepositRequests());
  await page.waitForTimeout(1500);

  // With filter 'PENDING', Deposit A should now be gone from Pending list
  const rowAStillPending = await page.evaluate((id) => document.getElementById('adminDepositRequestsTbody')?.innerText.includes(id), depAId);
  console.log(`Deposit A removed from Pending queue after approval:`, !rowAStillPending);

  // --- 7. Create Withdrawal Request for User A ---
  console.log('\n--- Step 7: Creating Withdrawal Request for User A ---');
  const withRes = await fetchWithRetry(`${PROD_URL}/api/payments/withdraw`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenA}` },
    body: JSON.stringify({
      amount: 5000,
      bankName: 'HBL Bank',
      accountHolderName: 'Flicker User A',
      accountNumber: 'PK99HBLB00001234567890',
      iban: 'PK99HBLB00001234567890',
      bankDetails: {
        bankName: 'HBL Bank',
        accountHolderName: 'Flicker User A',
        accountNumber: 'PK99HBLB00001234567890',
        iban: 'PK99HBLB00001234567890'
      },
      note: 'User A Test Withdrawal'
    })
  });
  const withData = await withRes.json();
  const withId = withData.request?.id;
  console.log('Withdrawal Request Created:', withId, 'Status:', withRes.status);
  if (!withId) {
    throw new Error('Failed to create withdrawal request: ' + JSON.stringify(withData));
  }

  // --- 8. Navigate to Withdrawal Requests in Admin ---
  console.log('\n--- Step 8: Navigating to Withdrawal Requests in Admin ---');
  await page.evaluate(() => {
    if (typeof navigateAdmin === 'function') navigateAdmin('/finance/withdrawals');
    else if (typeof loadAdminWithdrawalRequests === 'function') loadAdminWithdrawalRequests();
  });
  await page.waitForTimeout(2000);

  const initWithShotPath = path.join(ARTIFACTS_DIR, 'admin_withdrawal_queue_initial.png');
  await page.screenshot({ path: initWithShotPath, fullPage: true });
  console.log('Saved initial withdrawal screenshot:', initWithShotPath);

  let withRowExists = await page.evaluate((id) => document.getElementById('adminWithdrawalRequestsTbody')?.innerText.includes(id), withId);
  console.log(`Withdrawal (${withId}) visible in Admin:`, withRowExists);

  if (!withRowExists) {
    await page.evaluate(() => loadAdminWithdrawalRequests());
    await page.waitForTimeout(2000);
    withRowExists = await page.evaluate((id) => document.getElementById('adminWithdrawalRequestsTbody')?.innerText.includes(id), withId);
    console.log(`Withdrawal visible after reload:`, withRowExists);
  }

  // --- 9. 10 Consecutive Polling Cycles on Withdrawal Requests (Zero-Flicker) ---
  console.log('\n--- Step 9: Running 10 Consecutive Polling Cycles on Withdrawals ---');
  let withFlickerDetected = false;

  for (let cycle = 1; cycle <= 10; cycle++) {
    process.stdout.write(`Withdrawal Cycle ${cycle}/10: Polling... `);

    const pollPromise = page.evaluate(() => loadAdminWithdrawalRequests(true));

    for (let sample = 0; sample < 10; sample++) {
      await sleep(60);
      const isVisibleDuringFetch = await page.evaluate((id) => {
        const tbody = document.getElementById('adminWithdrawalRequestsTbody');
        if (!tbody) return false;
        const hasSpinner = tbody.innerText.includes('Loading withdrawal requests');
        const hasRow = tbody.innerText.includes(id);
        return hasRow && !hasSpinner;
      }, withId);

      if (!isVisibleDuringFetch) {
        withFlickerDetected = true;
        console.log(`\n❌ WITHDRAWAL FLICKER DETECTED at cycle ${cycle}, sample ${sample}!`);
        break;
      }
    }

    await pollPromise;
    await sleep(200);

    const isVisibleAfter = await page.evaluate((id) => {
      const tbody = document.getElementById('adminWithdrawalRequestsTbody');
      return tbody ? tbody.innerText.includes(id) : false;
    }, withId);

    if (!isVisibleAfter) {
      withFlickerDetected = true;
      console.log(`\n❌ Withdrawal row missing after cycle ${cycle}!`);
      break;
    }

    console.log('PASSED (row continuously visible, 0 flicker)');
  }

  console.log('\nWithdrawal Zero-Flicker 10-Cycle Result:', withFlickerDetected ? '❌ FAILED' : '✅ 100% PASSED');

  // --- 10. Transient Network Error / Offline Simulation Test ---
  console.log('\n--- Step 10: Testing Transient Error Handling (Must NOT wipe rows) ---');
  // Intercept the API route to simulate a 500 error
  await page.route('**/api/payments/admin/requests*', route => {
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'error', message: 'Simulated 500 Internal Server Error' })
    });
  });

  console.log('Simulating 500 error on /api/payments/admin/requests...');
  await page.evaluate(() => loadAdminWithdrawalRequests(false));
  await page.waitForTimeout(1000);

  // Check that row is STILL rendered
  const rowPreservedOnError = await page.evaluate((id) => {
    const tbody = document.getElementById('adminWithdrawalRequestsTbody');
    return tbody ? tbody.innerText.includes(id) : false;
  }, withId);

  // Check that warning badge is visible
  const warningBadgeVisible = await page.evaluate(() => {
    const w = document.getElementById('adminWithPollWarning');
    return w && w.style.display !== 'none';
  });

  console.log(`Row preserved on 500 server error:`, rowPreservedOnError ? '✅ YES' : '❌ NO (WIPED OUT)');
  console.log(`Sync warning badge shown on error:`, warningBadgeVisible ? '✅ YES' : '❌ NO');

  const errorStateShotPath = path.join(ARTIFACTS_DIR, 'admin_withdrawal_error_preserved.png');
  await page.screenshot({ path: errorStateShotPath, fullPage: true });

  // Unroute to restore normal operation
  await page.unroute('**/api/payments/admin/requests*');
  console.log('Restored normal network routing.');
  await page.evaluate(() => loadAdminWithdrawalRequests(false));
  await page.waitForTimeout(1500);

  const warningBadgeCleared = await page.evaluate(() => {
    const w = document.getElementById('adminWithPollWarning');
    return !w || w.style.display === 'none';
  });
  console.log(`Sync warning badge cleared after recovery:`, warningBadgeCleared ? '✅ YES' : '❌ NO');

  // --- 11. Final Clean-up / Reject Remaining Test Requests ---
  console.log('\n--- Step 11: Cleaning up test requests ---');
  if (depBId) {
    await fetchWithRetry(`${PROD_URL}/api/payments/admin/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}`, 'X-Admin-Token': adminToken, 'X-Admin-Request': 'true' },
      body: JSON.stringify({ requestId: depBId, reason: 'Automated test cleanup' })
    });
  }
  if (withId) {
    await fetchWithRetry(`${PROD_URL}/api/payments/admin/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}`, 'X-Admin-Token': adminToken, 'X-Admin-Request': 'true' },
      body: JSON.stringify({ requestId: withId, reason: 'Automated test cleanup' })
    });
  }

  const finalShotPath = path.join(ARTIFACTS_DIR, 'admin_final_clean_state.png');
  await page.evaluate(() => {
    if (typeof loadAdminDepositRequests === 'function') loadAdminDepositRequests();
    if (typeof loadAdminWithdrawalRequests === 'function') loadAdminWithdrawalRequests();
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: finalShotPath, fullPage: true });
  console.log('Saved final screenshot:', finalShotPath);

  await browser.close();

  console.log('\n================================================================');
  console.log('🎉 ALL CONTINUOUS VISIBILITY & ZERO-FLICKER CHECKS COMPLETED!');
  console.log('================================================================');
}

main().catch(err => {
  console.error('Fatal error during verification:', err);
  process.exit(1);
});
