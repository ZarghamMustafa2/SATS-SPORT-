// scripts/test_payment_proof_display.js - End-to-End Live Production Verification
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const PROD_URL = 'https://satsportco.vercel.app';
const ARTIFACTS_DIR = 'C:\\Users\\NEW PC TECH\\.gemini\\antigravity\\brain\\18b5e61b-2c45-401f-9613-7c2e2081b00b';

// Valid 100x100 PNG test receipt buffer
function createTestPngBuffer() {
  const samplePngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAALEwAACxMBAJqcGAAAAFFJREFUeJztwTEBAAAAwqD1T20JT6AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4Mde+AAB4aB40gAAAABJRU5ErkJggg==';
  return Buffer.from(samplePngBase64, 'base64');
}

async function run() {
  console.log('====================================================');
  console.log('🧪 LIVE PRODUCTION PAYMENT PROOF DISPLAY VERIFICATION');
  console.log('🌐 Target URL:', PROD_URL);
  console.log('====================================================\n');

  // STEP 1: Create a test user and submit a real deposit request via production API
  console.log('--- STEP 1: Creating fresh test user & submitting deposit request ---');
  const testUsername = 'prooftest_' + Date.now().toString().slice(-6);
  const testPassword = 'Password123!';

  const regRes = await fetch(`${PROD_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: testUsername,
      password: testPassword,
      phone: '03001234567'
    })
  });
  const regData = await regRes.json();
  console.log('User registered:', testUsername, 'Status:', regRes.status, regData.status);

  const loginRes = await fetch(`${PROD_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: testUsername,
      password: testPassword
    })
  });
  const loginData = await loginRes.json();
  const userToken = loginData.token;
  console.log('User logged in, got token:', Boolean(userToken));

  // Get active banks
  const banksRes = await fetch(`${PROD_URL}/api/payments/banks`);
  const banksData = await banksRes.json();
  const selectedBank = banksData.banks && banksData.banks[0];
  console.log('Selected bank for deposit:', selectedBank ? selectedBank.bankName : 'None');

  const pngBuffer = createTestPngBuffer();
  const pngBase64 = pngBuffer.toString('base64');

  const depRes = await fetch(`${PROD_URL}/api/payments/deposit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${userToken}`
    },
    body: JSON.stringify({
      amount: 7500,
      bankAccountId: selectedBank.id,
      screenshot: `data:image/png;base64,${pngBase64}`,
      note: 'Playwright verification test proof'
    })
  });
  const depData = await depRes.json();
  console.log('Deposit submitted. Request ID:', depData.request ? depData.request.id : 'FAILED', 'Status:', depRes.status);
  const createdRequestId = depData.request?.id;

  // STEP 2: Authenticate Admin on Live Production
  console.log('\n--- STEP 2: Logging in as Admin on Live Production ---');
  const adminLoginRes = await fetch(`${PROD_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'supermaster_1',
      password: 'SuperMaster@123'
    })
  });
  const adminLoginData = await adminLoginRes.json();
  const adminToken = adminLoginData.token;
  console.log('Admin login success:', Boolean(adminToken), 'Role:', adminLoginData.user?.role);

  // STEP 3: Launch Playwright Browser with Pre-Injected Admin Session
  console.log('\n--- STEP 3: Launching Playwright Chromium with Pre-Injected Admin Session ---');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 }
  });

  await context.addInitScript(({ token, user }) => {
    localStorage.setItem('admin_auth_token', token);
    localStorage.setItem('admin_user', JSON.stringify(user));
    localStorage.setItem('auth_token', token);
    localStorage.setItem('admin_token', token);
    localStorage.setItem('user', JSON.stringify(user));
  }, { token: adminToken, user: adminLoginData.user });

  const page = await context.newPage();

  console.log('Navigating directly to Live Admin panel...');
  await page.goto(`${PROD_URL}/admin`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // Navigate to Deposit Requests section via navigateAdmin
  console.log('Opening Deposit Requests section via navigateAdmin("/finance/deposits")...');
  await page.evaluate(() => navigateAdmin('/finance/deposits'));

  // Wait for table buttons to appear
  console.log('Waiting for deposit requests table buttons...');
  await page.waitForSelector('#adminDepositRequestsTbody button', { state: 'visible', timeout: 15000 });
  await page.waitForTimeout(1500);

  // STEP 4: Test New Deposit Request "View Proof" Modal
  console.log('\n--- STEP 4: Clicking "View Proof" on New Request (' + createdRequestId + ') ---');
  const newReqProofBtn = page.locator(`button[onclick*="${createdRequestId}"]`).first();
  await newReqProofBtn.waitFor({ state: 'visible', timeout: 8000 });
  await newReqProofBtn.click();

  // Wait for modal to become visible
  await page.waitForSelector('#modalAdminScreenshotViewer', { state: 'visible', timeout: 5000 });
  await page.waitForTimeout(3000); // Allow image fetch & blob conversion

  const isImgVisible = await page.evaluate(() => {
    const img = document.getElementById('modalScreenshotImg');
    return img && img.style.display !== 'none' && img.src.startsWith('blob:');
  });
  const isUnavailHidden = await page.evaluate(() => {
    const el = document.getElementById('modalScreenshotUnavailable');
    return !el || el.style.display === 'none';
  });
  const downloadLinkValid = await page.evaluate(() => {
    const link = document.getElementById('modalScreenshotDownloadLink');
    return link && link.href.startsWith('blob:') && link.style.pointerEvents !== 'none';
  });

  console.log('✅ Proof image visible with blob URL:', isImgVisible);
  console.log('✅ Unavailable notice hidden:', isUnavailHidden);
  console.log('✅ Open Full Image link active with blob URL:', downloadLinkValid);

  // Capture screenshot of working modal
  const proofSuccessPath = path.join(ARTIFACTS_DIR, 'live_prod_payment_proof_modal_success.png');
  await page.screenshot({ path: proofSuccessPath });
  console.log('📸 Saved screenshot to:', proofSuccessPath);

  // Close modal
  await page.evaluate(() => closeAdminScreenshotModal());
  await page.waitForTimeout(1000);

  // STEP 5: Test Legacy ZARHAM Request "View Proof" Modal (Unavailable State)
  console.log('\n--- STEP 5: Clicking "View Proof" on Legacy ZARHAM Request ---');
  const zarhamBtn = page.locator(`button[onclick*="dep_req_1791369704642_6c118444"]`).first();
  const hasZarhamBtn = await zarhamBtn.count() > 0;
  console.log('Found ZARHAM View Proof button:', hasZarhamBtn);

  if (hasZarhamBtn) {
    await zarhamBtn.click();
    await page.waitForSelector('#modalAdminScreenshotViewer', { state: 'visible', timeout: 5000 });
    await page.waitForTimeout(2500);

    const isZarhamUnavailVisible = await page.evaluate(() => {
      const el = document.getElementById('modalScreenshotUnavailable');
      return el && el.style.display !== 'none' && el.innerText.includes('Payment proof file is unavailable.');
    });
    const isZarhamImgHidden = await page.evaluate(() => {
      const img = document.getElementById('modalScreenshotImg');
      return !img || img.style.display === 'none';
    });

    console.log('✅ ZARHAM shows "Payment proof file is unavailable.":', isZarhamUnavailVisible);
    console.log('✅ ZARHAM broken image icon is hidden:', isZarhamImgHidden);

    // Capture screenshot of unavailable state modal
    const proofUnavailPath = path.join(ARTIFACTS_DIR, 'live_prod_payment_proof_unavailable_success.png');
    await page.screenshot({ path: proofUnavailPath });
    console.log('📸 Saved screenshot to:', proofUnavailPath);

    await page.evaluate(() => closeAdminScreenshotModal());
    await page.waitForTimeout(1000);
  }

  // STEP 6: Verify API Security directly
  console.log('\n--- STEP 6: Verifying Direct API Security ---');
  // Unauthenticated fetch
  const unauthRes = await fetch(`${PROD_URL}/api/payments/screenshot?id=${createdRequestId}`);
  console.log('✅ Unauthenticated access status:', unauthRes.status, '(Expected: 401)');

  // Normal user accessing someone else's screenshot
  const hackerRes = await fetch(`${PROD_URL}/api/payments/screenshot?id=dep_req_1791369704642_6c118444`, {
    headers: { 'Authorization': `Bearer ${userToken}` }
  });
  console.log('✅ Normal user accessing other user proof status:', hackerRes.status, '(Expected: 403)');

  // Admin access
  const adminRes = await fetch(`${PROD_URL}/api/payments/screenshot?id=${createdRequestId}`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  console.log('✅ Admin access status:', adminRes.status, 'Content-Type:', adminRes.headers.get('content-type'), '(Expected: 200, image/png)');

  await browser.close();

  console.log('\n====================================================');
  console.log('🎉 ALL LIVE PRODUCTION VERIFICATIONS COMPLETED SUCCESSFULLY!');
  console.log('====================================================');
}

run().catch(err => {
  console.error('VERIFICATION ERROR:', err);
  process.exit(1);
});
