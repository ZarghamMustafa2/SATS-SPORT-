// scripts/test_user_account_statement.js
// Comprehensive Verification for User Account Statement (Combined Deposit & Withdrawal History)
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
      const res = await fetch(url, options);
      return res;
    } catch (err) {
      if (i === retries - 1) throw err;
      await sleep(1000);
    }
  }
}

async function main() {
  console.log('================================================================');
  console.log('🚀 TESTING USER ACCOUNT STATEMENT (DEPOSIT & WITHDRAWAL HISTORY)');
  console.log('🌐 Target URL:', PROD_URL);
  console.log('================================================================\n');

  const ts = Date.now().toString().slice(-6);
  const testUser = 'statement_usr_' + ts;
  const otherUser = 'statement_other_' + ts;
  const testPass = 'StmtPass123!';

  // --- Step 1: Register and login test user ---
  console.log('--- Step 1: Registering Test User ---', testUser);
  const regRes = await fetchWithRetry(`${PROD_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: testUser, password: testPass, phone: '03001234567' })
  });
  console.log('User registration status:', regRes.status);

  const loginRes = await fetchWithRetry(`${PROD_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: testUser, password: testPass })
  });
  const loginData = await loginRes.json();
  const userToken = loginData.token;
  const userObj = loginData.user;
  console.log('Test user logged in:', Boolean(userToken), 'UserId:', userObj.id || userObj.userId);

  // Admin login
  console.log('\n--- Step 2: Logging in as Admin ---');
  const adminLoginRes = await fetchWithRetry(`${PROD_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'supermaster_1', password: 'SuperMaster@123' })
  });
  const adminData = await adminLoginRes.json();
  const adminToken = adminData.token;
  console.log('Admin login status:', Boolean(adminToken));

  // Get active bank account for deposit
  const banksRes = await fetchWithRetry(`${PROD_URL}/api/payments/banks`);
  const banksData = await banksRes.json();
  const activeBank = (banksData.banks && banksData.banks[0]) || { id: 'bank_mzn_001', bankName: 'Meezan Bank' };
  console.log('Using Receiving Bank:', activeBank.bankName, activeBank.id);

  // --- Step 3: Submit Deposit Request ---
  console.log('\n--- Step 3: Submitting Deposit Request (₹ 8,000) ---');
  const samplePngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const depRes = await fetchWithRetry(`${PROD_URL}/api/payments/deposit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${userToken}`
    },
    body: JSON.stringify({
      amount: 8000,
      bankAccountId: activeBank.id,
      screenshot: `data:image/png;base64,${samplePngBase64}`,
      note: 'Deposit for Account Statement verification'
    })
  });
  const depData = await depRes.json();
  console.log('Deposit submission result:', depData.status, 'RequestId:', depData.request?.id);
  const depositRequestId = depData.request?.id;

  // Verify Statement API shows Pending Deposit
  console.log('\n--- Step 4: Verifying Statement API shows Pending Deposit ---');
  const stmtRes1 = await fetchWithRetry(`${PROD_URL}/api/payments/statement`, {
    headers: { 'Authorization': `Bearer ${userToken}` }
  });
  const stmtData1 = await stmtRes1.json();
  console.log('Statement items count:', stmtData1.total);
  console.log('Item 0:', stmtData1.statement[0]?.type, stmtData1.statement[0]?.status, '₹' + stmtData1.statement[0]?.amount);

  if (stmtData1.statement[0]?.status !== 'PENDING' || stmtData1.statement[0]?.type !== 'DEPOSIT') {
    throw new Error('Expected 1 PENDING DEPOSIT in statement, got: ' + JSON.stringify(stmtData1));
  }

  // --- Step 5: Admin Approves Deposit ---
  console.log('\n--- Step 5: Admin Approving Deposit Request ---', depositRequestId);
  const approveDepRes = await fetchWithRetry(`${PROD_URL}/api/payments/admin/approve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`,
      'X-Admin-Token': adminToken,
      'X-Admin-Request': 'true'
    },
    body: JSON.stringify({ requestId: depositRequestId, adminNote: 'Verified deposit receipt' })
  });
  const approveDepData = await approveDepRes.json();
  console.log('Admin approve deposit status:', approveDepData.status);

  // Verify Statement API shows Approved Deposit with +₹ 8,000.00 balanceImpact
  const stmtRes2 = await fetchWithRetry(`${PROD_URL}/api/payments/statement`, {
    headers: { 'Authorization': `Bearer ${userToken}` }
  });
  const stmtData2 = await stmtRes2.json();
  console.log('Statement after deposit approval:', stmtData2.statement[0]?.status, 'Impact:', stmtData2.statement[0]?.balanceImpact);
  if (stmtData2.statement[0]?.status !== 'APPROVED' || stmtData2.statement[0]?.balanceImpact !== 8000) {
    throw new Error('Expected APPROVED DEPOSIT with +8000 balance impact, got: ' + JSON.stringify(stmtData2));
  }

  // --- Step 6: Submit Withdrawal Request ---
  console.log('\n--- Step 6: Submitting Withdrawal Request (₹ 3,500) ---');
  const withRes = await fetchWithRetry(`${PROD_URL}/api/payments/withdraw`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${userToken}`
    },
    body: JSON.stringify({
      amount: 3500,
      bankName: 'Standard Chartered',
      accountHolderName: 'Statement Test User',
      accountNumber: '9988776655',
      note: 'Withdrawal for Account Statement verification'
    })
  });
  const withData = await withRes.json();
  console.log('Withdrawal submission result:', withData.status, 'RequestId:', withData.request?.id);
  const withdrawalRequestId = withData.request?.id;

  // Verify Statement API shows BOTH Deposit and Withdrawal
  console.log('\n--- Step 7: Verifying Statement API shows BOTH Deposit and Withdrawal ---');
  const stmtRes3 = await fetchWithRetry(`${PROD_URL}/api/payments/statement`, {
    headers: { 'Authorization': `Bearer ${userToken}` }
  });
  const stmtData3 = await stmtRes3.json();
  console.log('Statement count with both requests:', stmtData3.total);
  stmtData3.statement.forEach(s => {
    console.log(`  -> [${s.type}] ${s.id} | Amount: ₹${s.amount} | Status: ${s.status} | Impact: ${s.balanceImpact}`);
  });

  if (stmtData3.total < 2) {
    throw new Error('Expected at least 2 items in statement (both deposit and withdrawal), got: ' + stmtData3.total);
  }

  // --- Step 8: Admin Rejects Withdrawal ---
  console.log('\n--- Step 8: Admin Rejecting Withdrawal Request ---', withdrawalRequestId);
  const rejectWithRes = await fetchWithRetry(`${PROD_URL}/api/payments/admin/reject`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`,
      'X-Admin-Token': adminToken,
      'X-Admin-Request': 'true'
    },
    body: JSON.stringify({ requestId: withdrawalRequestId, reason: 'KYC identity verification pending' })
  });
  const rejectWithData = await rejectWithRes.json();
  console.log('Admin reject withdrawal status:', rejectWithData.status);

  // Verify Statement API preserves both: Deposit Approved & Withdrawal Rejected
  const stmtRes4 = await fetchWithRetry(`${PROD_URL}/api/payments/statement`, {
    headers: { 'Authorization': `Bearer ${userToken}` }
  });
  const stmtData4 = await stmtRes4.json();
  console.log('\n--- Statement after Withdrawal Rejection:');
  stmtData4.statement.forEach(s => {
    console.log(`  -> [${s.type}] ${s.id} | Amount: ₹${s.amount} | Status: ${s.status} | Impact: ${s.balanceImpact} | Reason: ${s.rejectionReason || '-'}`);
  });

  const withItem = stmtData4.statement.find(s => s.id === withdrawalRequestId);
  const depItem = stmtData4.statement.find(s => s.id === depositRequestId);

  if (!withItem || withItem.status !== 'REJECTED') {
    throw new Error('Withdrawal request not found or not REJECTED in statement: ' + JSON.stringify(withItem));
  }
  if (!depItem || depItem.status !== 'APPROVED') {
    throw new Error('Deposit request disappeared or not APPROVED in statement: ' + JSON.stringify(depItem));
  }
  console.log('✅ BOTH DEPOSIT AND WITHDRAWAL PERSISTED CORRECTLY IN API STATEMENT!');

  // --- Step 9: User Isolation Check ---
  console.log('\n--- Step 9: Checking User Isolation ---');
  await fetchWithRetry(`${PROD_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: otherUser, password: testPass, phone: '03007654321' })
  });
  const otherLoginRes = await fetchWithRetry(`${PROD_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: otherUser, password: testPass })
  });
  const otherToken = (await otherLoginRes.json()).token;

  const otherStmtRes = await fetchWithRetry(`${PROD_URL}/api/payments/statement`, {
    headers: { 'Authorization': `Bearer ${otherToken}` }
  });
  const otherStmtData = await otherStmtRes.json();
  console.log('Other user statement items count:', otherStmtData.total);
  if (otherStmtData.total !== 0) {
    throw new Error('User isolation failure: other user saw ' + otherStmtData.total + ' items!');
  }
  console.log('✅ Strict user scoping verified: Other user has 0 items.');

  // --- Step 10: Browser E2E Test with Playwright ---
  console.log('\n--- Step 10: Launching Playwright to test User UI ---');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();

  // Navigate to login page
  console.log('Navigating to login page...');
  await page.goto(`${PROD_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#loginUsername', { timeout: 8000 });
  await page.locator('#loginUsername').fill(testUser);
  await page.locator('#loginPassword').fill(testPass);
  await page.click('#btnLoginSubmit');

  // Wait for login redirect to home
  await page.waitForFunction(() => {
    const el = document.getElementById('desktopLoggedIn');
    return el && window.getComputedStyle(el).display !== 'none';
  }, { timeout: 10000 });
  console.log('Logged into user interface successfully!');
  await sleep(1000);

  // Trigger openAccountModal('statement')
  console.log('Opening Account Statement modal...');
  await page.evaluate(() => {
    if (typeof openAccountModal === 'function') {
      openAccountModal('statement');
    }
  });

  // Wait for statement table to render
  console.log('Waiting for statement table in UI...');
  await page.waitForSelector('#statementTableContainer table', { timeout: 10000 });
  await sleep(1500);

  // Check UI contents
  const modalText = await page.innerText('#genericDialogModal');
  console.log('Modal text snippet:\n', modalText.slice(0, 300));

  const hasDeposit = modalText.includes('DEPOSIT') || modalText.includes('Deposit');
  const hasWithdrawal = modalText.includes('WITHDRAWAL') || modalText.includes('Withdrawal');
  const hasApproved = modalText.includes('Approved');
  const hasRejected = modalText.includes('Rejected');
  const hasAmount8k = modalText.includes('8,000');
  const hasAmount3k5 = modalText.includes('3,500');

  console.log('UI Verification Checks:');
  console.log('- Has DEPOSIT:', hasDeposit);
  console.log('- Has WITHDRAWAL:', hasWithdrawal);
  console.log('- Has Approved badge:', hasApproved);
  console.log('- Has Rejected badge:', hasRejected);
  console.log('- Has 8,000 amount:', hasAmount8k);
  console.log('- Has 3,500 amount:', hasAmount3k5);

  if (!hasDeposit || !hasWithdrawal || !hasApproved || !hasRejected || !hasAmount8k || !hasAmount3k5) {
    throw new Error('UI failed to display both deposit and withdrawal with correct statuses!');
  }

  // Take screenshot of the combined statement modal
  const screenshotPath = path.join(ARTIFACTS_DIR, 'live_user_account_statement_combined.png');
  await page.screenshot({ path: screenshotPath, fullPage: false });
  console.log('📸 Saved UI Screenshot artifact to:', screenshotPath);

  // Test Filter Buttons
  console.log('\n--- Step 11: Testing UI Filter Tabs ---');
  // Click "Deposits"
  await page.evaluate(() => filterUserStatement('DEPOSIT'));
  await sleep(500);
  const depFilterText = await page.innerText('#statementTableContainer');
  console.log('Filtered by Deposits contains DEPOSIT:', depFilterText.includes('DEPOSIT'), 'contains WITHDRAWAL:', depFilterText.includes('WITHDRAWAL'));

  // Click "Withdrawals"
  await page.evaluate(() => filterUserStatement('WITHDRAWAL'));
  await sleep(500);
  const withFilterText = await page.innerText('#statementTableContainer');
  console.log('Filtered by Withdrawals contains WITHDRAWAL:', withFilterText.includes('WITHDRAWAL'), 'contains DEPOSIT:', withFilterText.includes('DEPOSIT'));

  // Click "All"
  await page.evaluate(() => filterUserStatement('ALL'));
  await sleep(500);
  const allFilterText = await page.innerText('#statementTableContainer');
  console.log('Filtered by All contains both:', allFilterText.includes('DEPOSIT') && allFilterText.includes('WITHDRAWAL'));

  await browser.close();

  console.log('\n================================================================');
  console.log('🎉 ALL USER ACCOUNT STATEMENT TESTS PASSED COMPLETELY!');
  console.log('================================================================');
}

main().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
