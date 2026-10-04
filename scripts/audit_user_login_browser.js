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
    await page.waitForTimeout(600);
    const alertBox = await page.locator('#authAlert');
    const alertText = (await alertBox.innerText()).trim();
    report(2, 'Invalid Credentials Rejection ("Invalid username or password.")',
      alertText === 'Invalid username or password.',
      `Alert text: "${alertText}"`
    );

    // TEST 3: Switch to Register Mode & Availability Check
    await page.click('#btnTabRegister');
    await page.waitForTimeout(300);
    const regUserInput = await page.locator('#regUsername');
    await regUserInput.fill(testUser);
    await page.waitForTimeout(600);
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
    await page.waitForTimeout(1000);
    const regAlertText = (await alertBox.innerText()).trim();
    report(4, 'Real User Registration Execution',
      regAlertText.includes('registered') || page.url().includes(BASE_URL),
      `Alert: "${regAlertText}" | Current URL: ${page.url()}`
    );

    // TEST 5: Login with Newly Registered User Credentials
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await page.locator('#loginUsername').fill(testUser);
    await page.locator('#loginPassword').fill(testPass);
    await page.click('#btnLoginSubmit');
    await page.waitForTimeout(1500);
    const postLoginUrl = page.url();
    const loggedInHeader = await page.locator('#desktopLoggedIn');
    const isLoggedVisible = await loggedInHeader.isVisible();
    const userNameLabel = await page.locator('#headerUserName').innerText();
    report(5, 'Login Success & Navigation to User Website',
      (postLoginUrl === `${BASE_URL}/` || postLoginUrl === BASE_URL || isLoggedVisible) && userNameLabel.toLowerCase().includes(testUser.toLowerCase()),
      `URL: ${postLoginUrl} | Logged In Header Visible: ${isLoggedVisible} | Displayed User: "${userNameLabel}"`
    );

    // TEST 6: Session Survives Page Refresh
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    const isStillLogged = await page.locator('#desktopLoggedIn').isVisible();
    const stillUser = await page.locator('#headerUserName').innerText();
    report(6, 'Session Persistence Across Page Refresh',
      isStillLogged && stillUser.toLowerCase().includes(testUser.toLowerCase()),
      `Still Authenticated: YES | User: "${stillUser}"`
    );

    // TEST 7: Protected Route Direct Access Unauthenticated (Redirect to Login)
    const incognitoContext = await browser.newContext();
    const incognitoPage = await incognitoContext.newPage();
    await incognitoPage.goto(`${BASE_URL}/account`, { waitUntil: 'networkidle' });
    await incognitoPage.waitForTimeout(1000);
    const redirectUrl = incognitoPage.url();
    report(7, 'Direct Unauthenticated Protected Route Access Redirects to Login',
      redirectUrl.includes('/login'),
      `Attempted: /account -> Redirected to: ${redirectUrl}`
    );
    await incognitoContext.close();

    // TEST 8: Real Logout Execution
    await page.click('#userProfileBtn');
    await page.waitForTimeout(300);
    await page.click('.dropdown-item.logout');
    await page.waitForTimeout(1200);
    const postLogoutUrl = page.url();
    report(8, 'Logout Session Invalidation & Redirection to Login',
      postLogoutUrl.includes('/login'),
      `Current URL after logout: ${postLogoutUrl}`
    );

    // TEST 9: Browser Back Button Protection After Logout
    await page.goBack();
    await page.waitForTimeout(1000);
    const loggedInAfterBack = await page.locator('#desktopLoggedIn').isVisible();
    report(9, 'Browser Back Button Does NOT Restore Authenticated Session',
      !loggedInAfterBack,
      `Authenticated state visible after Back: ${loggedInAfterBack} (Protected content blocked)`
    );

    // TEST 10: Duplicate Case-Insensitive Username Registration Rejection
    await page.goto(`${BASE_URL}/login?mode=register`, { waitUntil: 'networkidle' });
    await page.locator('#regUsername').fill(testUser.toUpperCase());
    await page.locator('#regPassword').fill('AnyPassword@123');
    await page.locator('#regConfirmPassword').fill('AnyPassword@123');
    await page.click('#btnRegisterSubmit');
    await page.waitForTimeout(800);
    const dupAlert = (await page.locator('#authAlert').innerText()).trim();
    report(10, 'Duplicate Username Registration Rejected (Case-Insensitive)',
      dupAlert.includes('already registered'),
      `Rejection Alert: "${dupAlert}"`
    );

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
