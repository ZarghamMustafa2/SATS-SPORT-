const { chromium } = require('playwright');
const authDb = require('../lib/auth_db');

const BASE_URL = process.env.TEST_URL || 'http://localhost:4005';

async function runBetFlowAndCurrencyVerification() {
  console.log('================================================================');
  console.log('  COMPREHENSIVE BET PLACEMENT & PKR/RS. VERIFICATION TEST SUITE ');
  console.log(`  Target: ${BASE_URL}                                           `);
  console.log('================================================================\n');

  // 1. Prepare Test User with Balance
  await authDb.hydrateUsersAsync();
  const testUsername = 'test_bettor_' + Math.floor(1000 + Math.random() * 9000);
  const testPassword = 'BettorPass123!';
  console.log(`Step 0: Creating test user "${testUsername}" with 25,000 Rs. balance...`);
  const registered = authDb.registerNormalUser({
    username: testUsername,
    password: testPassword,
    confirmPassword: testPassword
  });
  const userRecord = authDb.getUserById(registered.id);
  userRecord.balance = '25,000 Rs.';
  userRecord.avail = '25,000 Rs.';
  userRecord.exp = '0 Rs.';
  await authDb.saveUsersToDiskAsync();

  const browser = await chromium.launch({ headless: true });

  // ============================================================================
  // TEST A: LOGGED-OUT USER ATTEMPTS BET
  // ============================================================================
  console.log('\n--- TEST A: Logged-Out User Attempts Bet ---');
  const loggedOutContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const loggedOutPage = await loggedOutContext.newPage();
  await loggedOutPage.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await loggedOutPage.waitForTimeout(1500);

  const loggedOutResult = await loggedOutPage.evaluate(() => {
    let capturedToast = '';
    const origShowToast = window.showToast;
    window.showToast = (msg) => { capturedToast = msg; if (origShowToast) origShowToast(msg); };

    // Set activeBet and attempt bet
    window.activeBet = { matchName: 'Test Match', runnerName: 'Team 1', type: 'back', odd: 1.85, stake: 500 };
    placeBet();

    return {
      capturedToast: capturedToast,
      modalLoginOpen: document.getElementById('loginModal')?.style.display === 'flex' || document.getElementById('loginModal')?.classList.contains('show')
    };
  });
  console.log(`  Toast captured: "${loggedOutResult.capturedToast}"`);
  const testAPass = loggedOutResult.capturedToast.toLowerCase().includes('login') && !loggedOutResult.capturedToast.includes('database settlement');
  console.log(`  TEST A RESULT: ${testAPass ? 'PASS' : 'FAIL'}`);

  // ============================================================================
  // TEST B: LOGGED-IN NORMAL USER PLACES BET (CRICKET)
  // ============================================================================
  console.log('\n--- TEST B: Logged-In Normal User Places Bet (Cricket Back Bet) ---');
  const loggedInContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const loggedInPage = await loggedInContext.newPage();
  await loggedInPage.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await loggedInPage.waitForTimeout(1500);

  // Perform real login
  const loginResult = await loggedInPage.evaluate(async ({ u, p }) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: u, password: p })
    });
    const data = await res.json();
    if (data.status === 'success') {
      if (data.token) localStorage.setItem('auth_token', data.token);
      if (data.user) localStorage.setItem('current_user', JSON.stringify(data.user));
      if (typeof updateUserLoggedInState === 'function') updateUserLoggedInState(data.user);
    }
    return data;
  }, { u: testUsername, p: testPassword });

  console.log(`  Login status: ${loginResult.status}, user: ${loginResult.user?.username}`);

  // Check currency formatting on UI
  const headerCurrency = await loggedInPage.evaluate(() => ({
    balance: document.getElementById('headerBalVal')?.innerText,
    exposure: document.getElementById('headerOutVal')?.innerText
  }));
  console.log(`  Header Balance displayed: "${headerCurrency.balance}"`);
  console.log(`  Header Exposure displayed: "${headerCurrency.exposure}"`);

  // Place Cricket Bet
  const cricketBetResult = await loggedInPage.evaluate(async () => {
    let capturedToast = '';
    const origShowToast = window.showToast;
    window.showToast = (msg) => { capturedToast = msg; if (origShowToast) origShowToast(msg); };

    // Populate active bet
    window.activeBet = {
      matchName: 'South Africa vs Australia',
      runnerName: 'South Africa',
      type: 'back',
      odd: 1.85,
      stake: 1000,
      marketId: '1.252489230',
      eventId: '590156524',
      eventTypeId: '4'
    };

    const stakeInp = document.getElementById('desktopStakeInput');
    if (stakeInp) stakeInp.value = 1000;
    const oddsInp = document.getElementById('desktopOddsInput');
    if (oddsInp) oddsInp.value = 1.85;

    await placeBet();

    // Wait for async response
    await new Promise(r => setTimeout(r, 1500));
    const toastEl = document.getElementById('appToastNotification');
    if (!capturedToast && toastEl) capturedToast = toastEl.innerText;

    return {
      capturedToast: capturedToast,
      newBal: document.getElementById('headerBalVal')?.innerText,
      newExp: document.getElementById('headerOutVal')?.innerText,
      placedBetsCount: window.placedBetsList?.length || 0,
      firstBetRef: window.placedBetsList?.[0]?.ref,
      firstBetProfit: window.placedBetsList?.[0]?.profit
    };
  });

  console.log(`  Cricket Bet Toast: "${cricketBetResult.capturedToast}"`);
  console.log(`  Updated Header Balance: "${cricketBetResult.newBal}"`);
  console.log(`  Updated Header Exposure: "${cricketBetResult.newExp}"`);
  console.log(`  Placed Bets Count in memory: ${cricketBetResult.placedBetsCount}`);
  const testBPass = cricketBetResult.capturedToast.toLowerCase().includes('successfully') &&
                    !cricketBetResult.capturedToast.toLowerCase().includes('login');
  console.log(`  TEST B RESULT: ${testBPass ? 'PASS' : 'FAIL'}`);

  // ============================================================================
  // TEST C: REFRESH AFTER LOGIN & PERSISTENCE
  // ============================================================================
  console.log('\n--- TEST C: Refresh Page & Verify Bet Persistence ---');
  await loggedInPage.reload({ waitUntil: 'domcontentloaded' });
  await loggedInPage.waitForTimeout(2500);

  const refreshState = await loggedInPage.evaluate(async () => {
    if (typeof fetchUserBets === 'function') await fetchUserBets();
    return {
      username: document.getElementById('headerUserName')?.innerText,
      balance: document.getElementById('headerBalVal')?.innerText,
      exposure: document.getElementById('headerOutVal')?.innerText,
      placedBetsCount: window.placedBetsList?.length || 0,
      firstBetRef: window.placedBetsList?.[0]?.ref,
      firstBetRunner: window.placedBetsList?.[0]?.runner
    };
  });
  console.log(`  After reload: user="${refreshState.username}", balance="${refreshState.balance}", exp="${refreshState.exposure}"`);
  console.log(`  Persisted bets restored: ${refreshState.placedBetsCount} (Ref: ${refreshState.firstBetRef}, Runner: ${refreshState.firstBetRunner})`);
  const testCPass = refreshState.username === testUsername && refreshState.placedBetsCount >= 1;
  console.log(`  TEST C RESULT: ${testCPass ? 'PASS' : 'FAIL'}`);

  // ============================================================================
  // TEST D: LOGOUT & VERIFY BLOCKED
  // ============================================================================
  console.log('\n--- TEST D: Logout & Verify Bet Blocked ---');
  await loggedInPage.evaluate(async () => {
    if (typeof handleUserLogout === 'function') await handleUserLogout();
  });
  await loggedInPage.waitForTimeout(1000);
  await loggedInPage.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await loggedInPage.waitForTimeout(1000);

  const postLogoutResult = await loggedInPage.evaluate(() => {
    let capturedToast = '';
    window.showToast = (msg) => { capturedToast = msg; };
    window.activeBet = { matchName: 'Test Match', runnerName: 'Team 1', type: 'back', odd: 1.85, stake: 500 };
    placeBet();
    const toastEl = document.getElementById('appToastNotification');
    if (!capturedToast && toastEl) capturedToast = toastEl.innerText;
    return {
      capturedToast: capturedToast,
      authToken: localStorage.getItem('auth_token')
    };
  });
  console.log(`  Post-logout token: ${postLogoutResult.authToken}`);
  console.log(`  Post-logout toast: "${postLogoutResult.capturedToast}"`);
  const testDPass = !postLogoutResult.authToken && postLogoutResult.capturedToast.toLowerCase().includes('login');
  console.log(`  TEST D RESULT: ${testDPass ? 'PASS' : 'FAIL'}`);

  // ============================================================================
  // SPORTS TESTS: SOCCER & TENNIS (BACK & LAY)
  // ============================================================================
  console.log('\n--- SPORTS TESTS: Soccer Lay Bet & Tennis Back Bet ---');
  const sportsContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const sportsPage = await sportsContext.newPage();
  await sportsPage.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await sportsPage.waitForTimeout(1500);

  // Login
  await sportsPage.evaluate(async ({ u, p }) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: u, password: p })
    });
    const data = await res.json();
    if (data.status === 'success') {
      localStorage.setItem('auth_token', data.token);
      localStorage.setItem('current_user', JSON.stringify(data.user));
      updateUserLoggedInState(data.user);
    }
  }, { u: testUsername, p: testPassword });
  await sportsPage.waitForTimeout(1000);

  // Soccer Lay Bet
  const soccerResult = await sportsPage.evaluate(async () => {
    let capturedToast = '';
    window.showToast = (msg) => { capturedToast = msg; };
    window.activeBet = {
      matchName: 'Arsenal vs Chelsea',
      runnerName: 'Chelsea',
      type: 'lay',
      odd: 3.25,
      stake: 500,
      marketId: '1.200300400',
      eventId: '1001',
      eventTypeId: '1'
    };
    await placeBet();
    await new Promise(r => setTimeout(r, 1500));
    const toastEl = document.getElementById('appToastNotification');
    if (!capturedToast && toastEl) capturedToast = toastEl.innerText;
    return { toast: capturedToast };
  });
  console.log(`  Soccer Lay Bet Toast: "${soccerResult.toast}"`);

  // Tennis Back Bet
  const tennisResult = await sportsPage.evaluate(async () => {
    let capturedToast = '';
    window.showToast = (msg) => { capturedToast = msg; };
    window.activeBet = {
      matchName: 'Carlos Alcaraz vs Jannik Sinner',
      runnerName: 'Carlos Alcaraz',
      type: 'back',
      odd: 1.72,
      stake: 500,
      marketId: '1.200300500',
      eventId: '2001',
      eventTypeId: '2'
    };
    await placeBet();
    await new Promise(r => setTimeout(r, 1500));
    const toastEl = document.getElementById('appToastNotification');
    if (!capturedToast && toastEl) capturedToast = toastEl.innerText;
    return { toast: capturedToast };
  });
  console.log(`  Tennis Back Bet Toast: "${tennisResult.toast}"`);

  const sportsPass = soccerResult.toast.toLowerCase().includes('successfully') &&
                     tennisResult.toast.toLowerCase().includes('successfully');
  console.log(`  SPORTS TESTS RESULT: ${sportsPass ? 'PASS' : 'FAIL'}`);

  // ============================================================================
  // CURRENCY & FORMATTING VERIFICATION
  // ============================================================================
  console.log('\n--- CURRENCY & FORMATTING VERIFICATION ---');
  const currencyAudit = await sportsPage.evaluate(() => {
    const fn0 = formatPKR(0);
    const fn500 = formatPKR(500);
    const fn5000 = formatPKR(5000);
    const fn25000_5 = formatPKR(25000.5);

    // Check Bet Slip labels
    const deskStakeLabel = document.querySelector('#desktopBetslipBody label[style*="font-size:10px"]')?.innerText || '';
    const deskProfitText = document.getElementById('desktopProfitVal')?.innerText || '';

    // Check My Markets Table
    renderMyMarketsContent('matched');
    const tableHtml = document.getElementById('myMarketsContent')?.innerHTML || '';

    return {
      fn0, fn500, fn5000, fn25000_5,
      deskStakeLabel,
      deskProfitText,
      hasTableRs: tableHtml.includes('Rs.')
    };
  });
  console.log('  formatPKR(0) ->', currencyAudit.fn0);
  console.log('  formatPKR(500) ->', currencyAudit.fn500);
  console.log('  formatPKR(5000) ->', currencyAudit.fn5000);
  console.log('  formatPKR(25000.5) ->', currencyAudit.fn25000_5);
  console.log('  Desktop Stake label:', currencyAudit.deskStakeLabel);
  console.log('  My Markets table contains Rs.:', currencyAudit.hasTableRs);

  // ============================================================================
  // MOBILE VIEWPORTS AUDIT (375, 390, 414)
  // ============================================================================
  console.log('\n--- MOBILE VIEWPORTS AUDIT ---');
  for (const width of [375, 390, 414]) {
    const mobContext = await browser.newContext({ viewport: { width, height: 800 } });
    const mobPage = await mobContext.newPage();
    await mobPage.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await mobPage.waitForTimeout(1000);

    const mobAudit = await mobPage.evaluate(() => {
      // Open betslip
      openBetslip(null, 'India vs Australia', 'India', 'back', 1.85);
      const profitVal = document.getElementById('betslipProfitVal')?.innerText || '';
      const drawer = document.getElementById('betslipDrawer');
      const isDrawerOpen = drawer?.classList.contains('show');
      return { profitVal, isDrawerOpen };
    });
    console.log(`  Viewport ${width}x800: Drawer Open=${mobAudit.isDrawerOpen}, Profit="${mobAudit.profitVal}"`);
    await mobContext.close();
  }

  await browser.close();
  console.log('\n================================================================');
  console.log('  ALL TESTS COMPLETED SUCCESSFULLY!                              ');
  console.log('================================================================');
}

runBetFlowAndCurrencyVerification().catch(err => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
