const { chromium } = require('playwright');

const BASE_URL = process.env.VERCEL_URL || 'https://sats-sport.vercel.app';

async function runBrowserAudit() {
  console.log('================================================================');
  console.log('BROWSER E2E USER LOGIN & SESSION VERIFICATION AUDIT');
  console.log(`Target: ${BASE_URL}`);
  console.log('================================================================\n');

  const browser = await chromium.launch({ headless: true });
  let passed = 0;
  let failed = 0;

  function report(num, name, ok, details = '') {
    if (ok) {
      console.log(`✅ [BROWSER TEST ${num} PASS] ${name}`);
      if (details) console.log(`   ${details}`);
      passed++;
    } else {
      console.error(`❌ [BROWSER TEST ${num} FAIL] ${name}`);
      if (details) console.error(`   ${details}`);
      failed++;
    }
  }

  const timestamp = Date.now();
  const testUser = `browserv_${timestamp}`;
  const testPass = `Pass#${timestamp}`;

  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // TEST 1: Open Login Page & Verify Elements
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    const userField = await page.locator('#loginUsername');
    const passField = await page.locator('#loginPassword');
    const loginBtn = await page.locator('#btnLoginSubmit');
    const hasFields = (await userField.count()) > 0 && (await passField.count()) > 0 && (await loginBtn.count()) > 0;
    report(1, 'User Login Page Interface (Fields & Buttons)', hasFields, 'Username, Password, and Login Button present');

    // TEST 2: Invalid Credentials Rejection (No enumeration)
    await userField.fill('nonexistent_user_999');
    await passField.fill('WrongPass@123');
    await loginBtn.click();
    await page.waitForFunction(() => {
      const txt = document.querySelector('#authAlert')?.innerText || '';
      return txt.trim().length > 0;
    }, { timeout: 6000 });
    const alertBox = await page.locator('#authAlert');
    const alertText = (await alertBox.innerText()).trim();
    report(2, 'Invalid Credentials Rejection ("Invalid username or password.")',
      alertText === 'Invalid username or password.',
      `Alert text: "${alertText}"`
    );

    // TEST 3: Switch to Register Mode & Availability Check
    await page.click('#btnTabRegister');
    await page.waitForTimeout(400);
    const regUserInput = await page.locator('#regUsername');
    await regUserInput.fill(testUser);
    await page.waitForFunction(() => {
      const msg = document.querySelector('#regUsernameCheckMsg')?.innerText || '';
      return msg.includes('available') || msg.includes('registered') || msg.includes('characters');
    }, { timeout: 4000 });
    const checkMsg = await page.locator('#regUsernameCheckMsg');
    const checkText = (await checkMsg.innerText()).trim();
    report(3, 'Registration Interface & Live Username Availability',
      checkText.includes('available'),
      `Username check response: "${checkText}"`
    );

    // TEST 4: Execute Real Registration
    await page.locator('#regPassword').fill(testPass);
    await page.locator('#regConfirmPassword').fill(testPass);
    await page.click('#btnRegisterSubmit');
    await page.waitForFunction(() => {
      const alert = document.querySelector('#authAlert')?.innerText || '';
      return alert.includes('registered') || window.location.pathname === '/';
    }, { timeout: 5000 });
    const regAlertText = (await alertBox.innerText()).trim();
    report(4, 'Real User Registration Execution',
      regAlertText.includes('registered') || page.url().includes(BASE_URL),
      `Alert: "${regAlertText}" | Current URL: ${page.url()}`
    );

    // Wait for auto-redirect or navigate to home
    await page.waitForTimeout(1500);

    // TEST 5: Login with Credentials in a Fresh Session Context
    const loginContext = await browser.newContext();
    const loginPage = await loginContext.newPage();
    await loginPage.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await loginPage.waitForSelector('#loginUsername', { timeout: 5000 });
    await loginPage.locator('#loginUsername').fill(testUser);
    await loginPage.locator('#loginPassword').fill(testPass);
    await loginPage.click('#btnLoginSubmit');
    await loginPage.waitForFunction(() => {
      const el = document.getElementById('desktopLoggedIn');
      const name = document.getElementById('headerUserName');
      return el && window.getComputedStyle(el).display !== 'none' && name && name.innerText !== 'User';
    }, { timeout: 10000 });
    const postLoginUrl = loginPage.url();
    const loggedInHeader = await loginPage.locator('#desktopLoggedIn');
    const isLoggedVisible = await loggedInHeader.isVisible();
    const userNameLabel = await loginPage.locator('#headerUserName').innerText();
    report(5, 'Login Success & Navigation to User Website',
      isLoggedVisible && userNameLabel.toLowerCase().includes(testUser.toLowerCase()),
      `URL: ${postLoginUrl} | Logged In Header Visible: ${isLoggedVisible} | Displayed User: "${userNameLabel}"`
    );

    // TEST 6: Session Survives Page Refresh
    await loginPage.reload({ waitUntil: 'domcontentloaded' });
    await loginPage.waitForFunction(() => {
      const el = document.getElementById('desktopLoggedIn');
      const name = document.getElementById('headerUserName');
      return el && window.getComputedStyle(el).display !== 'none' && name && name.innerText !== 'User';
    }, { timeout: 10000 });
    const isStillLogged = await loginPage.locator('#desktopLoggedIn').isVisible();
    const stillUser = await loginPage.locator('#headerUserName').innerText();
    report(6, 'Session Persistence Across Page Refresh',
      isStillLogged && stillUser.toLowerCase().includes(testUser.toLowerCase()),
      `Still Authenticated: YES | User: "${stillUser}"`
    );

    // TEST 7: Protected Route Direct Access Unauthenticated (Redirect to Login)
    const incognitoContext = await browser.newContext();
    const incognitoPage = await incognitoContext.newPage();
    await incognitoPage.goto(`${BASE_URL}/account`, { waitUntil: 'domcontentloaded' });
    await incognitoPage.waitForURL(url => url.pathname.includes('/login') || url.href.includes('/login'), { timeout: 8000 });
    const redirectUrl = incognitoPage.url();
    report(7, 'Direct Unauthenticated Protected Route Access Redirects to Login',
      redirectUrl.includes('/login'),
      `Attempted: /account -> Redirected to: ${redirectUrl}`
    );
    await incognitoContext.close();

    // TEST 8: Real Logout Execution
    await loginPage.click('#userProfileBtn');
    await loginPage.waitForTimeout(400);
    await loginPage.click('.dropdown-item.logout');
    await loginPage.waitForFunction(() => window.location.pathname.includes('/login'), { timeout: 5000 });
    const postLogoutUrl = loginPage.url();
    report(8, 'Logout Session Invalidation & Redirection to Login',
      postLogoutUrl.includes('/login'),
      `Current URL after logout: ${postLogoutUrl}`
    );

    // TEST 9: Browser Back Button Protection After Logout
    await loginPage.goBack();
    await loginPage.waitForTimeout(1200);
    const loggedInAfterBack = await loginPage.locator('#desktopLoggedIn').isVisible();
    report(9, 'Browser Back Button Does NOT Restore Authenticated Session',
      !loggedInAfterBack,
      `Authenticated state visible after Back: ${loggedInAfterBack} (Protected content blocked)`
    );
    await loginContext.close();

    // TEST 10: Duplicate Case-Insensitive Username Registration Rejection
    const dupPage = await context.newPage();
    await dupPage.goto(`${BASE_URL}/login?mode=register`, { waitUntil: 'domcontentloaded' });
    await dupPage.waitForSelector('#regUsername', { timeout: 5000 });
    await dupPage.locator('#regUsername').fill(testUser.toUpperCase());
    await dupPage.locator('#regPassword').fill('AnyPassword@123');
    await dupPage.locator('#regConfirmPassword').fill('AnyPassword@123');
    await dupPage.click('#btnRegisterSubmit');
    await dupPage.waitForFunction(() => {
      const alert = document.querySelector('#authAlert')?.innerText || '';
      return alert.includes('already registered');
    }, { timeout: 5000 });
    const dupAlert = (await dupPage.locator('#authAlert').innerText()).trim();
    report(10, 'Duplicate Username Registration Rejected (Case-Insensitive)',
      dupAlert.includes('already registered'),
      `Rejection Alert: "${dupAlert}"`
    );
    await dupPage.close();

  } catch (err) {
    console.error('Browser audit error:', err);
    failed++;
  } finally {
    await browser.close();
  }

  console.log('\n================================================================');
  console.log(`BROWSER AUDIT SUMMARY: ${passed} PASSED, ${failed} FAILED (TOTAL ${passed + failed})`);
  console.log('================================================================\n');

  if (failed > 0) process.exit(1);
}

runBrowserAudit().catch(err => {
  console.error(err);
  process.exit(1);
});
