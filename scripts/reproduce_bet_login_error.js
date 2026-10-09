const { chromium } = require('playwright');

async function reproduceBetLoginError() {
  console.log('=== PART 1: FORENSIC REPRODUCTION OF BET PLACEMENT LOGIN ERROR ===');
  console.log('Target: https://satsportco.vercel.app\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  const networkRequests = [];
  page.on('request', req => {
    if (req.url().includes('/api/')) {
      networkRequests.push({
        url: req.url(),
        method: req.method(),
        headers: req.headers(),
        postData: req.postData()
      });
    }
  });

  const networkResponses = [];
  page.on('response', async res => {
    if (res.url().includes('/api/')) {
      let body = '';
      try { body = await res.text(); } catch (e) { body = '<error reading body>'; }
      networkResponses.push({
        url: res.url(),
        status: res.status(),
        body: body
      });
    }
  });

  const consoleLogs = [];
  page.on('console', msg => {
    consoleLogs.push({ type: msg.type(), text: msg.text() });
  });

  console.log('Step 1: Navigating to https://satsportco.vercel.app...');
  await page.goto('https://satsportco.vercel.app', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);

  const testUser = 'bettor_' + Math.floor(1000 + Math.random() * 9000);
  const testPass = 'AuditPass123!';

  console.log(`Step 2: Registering a new Normal User: ${testUser}...`);
  // Open register modal or call registration API
  const regResult = await page.evaluate(async ({ u, p }) => {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: u, password: p, confirmPassword: p })
    });
    const data = await res.json();
    if (data.status === 'success') {
      if (data.token) localStorage.setItem('auth_token', data.token);
      if (data.user) localStorage.setItem('current_user', JSON.stringify(data.user));
      if (typeof updateUserLoggedInState === 'function') updateUserLoggedInState(data.user);
    }
    return data;
  }, { u: testUser, p: testPass });

  console.log('Registration response status:', regResult.status, 'user:', regResult.user?.username);

  // Reload or re-evaluate to ensure frontend auth state is fully populated
  await page.waitForTimeout(1000);
  const authState = await page.evaluate(() => {
    return {
      localStorage_authToken: localStorage.getItem('auth_token'),
      localStorage_token: localStorage.getItem('token'),
      localStorage_currentUser: localStorage.getItem('current_user'),
      window_currentUser: window.currentUser,
      headerUserName: document.getElementById('headerUserName')?.innerText,
      desktopLoggedInDisplay: document.getElementById('desktopLoggedIn')?.style.display,
      desktopLoggedOutDisplay: document.getElementById('desktopLoggedOut')?.style.display
    };
  });
  console.log('\nFrontend Auth State:');
  console.log(JSON.stringify(authState, null, 2));

  // Check cookies
  const cookies = await context.cookies();
  console.log('\nCookies present:');
  cookies.forEach(c => console.log(` - ${c.name}=${c.value.slice(0, 15)}... (HttpOnly: ${c.httpOnly})`));

  console.log('\nStep 3: Opening Cricket Sport view and selecting first match...');
  await page.evaluate(() => selectSport('cricket'));
  await page.waitForTimeout(3000);

  // Click on the first match to open details
  const matchClicked = await page.evaluate(() => {
    const firstBox = document.querySelector('#sportsMatchesContainer .default-game-box');
    if (!firstBox) return false;
    const clickTarget = firstBox.querySelector('.default-game-box-left > div') || firstBox;
    clickTarget.click();
    return true;
  });
  console.log('Match clicked:', matchClicked);
  await page.waitForTimeout(2000);

  // Click Back or Lay button inside modal
  console.log('Step 4: Clicking Back odds button to populate betslip...');
  const oddsClicked = await page.evaluate(() => {
    // Check if match detail modal is open
    const modal = document.getElementById('matchDetailsModal');
    const backBtn = modal ? modal.querySelector('.special-a, .back-btn, [class*="back"]') : null;
    if (backBtn) {
      backBtn.click();
      return { success: true, text: backBtn.innerText.trim() };
    }
    // Fallback: trigger openBetslip directly
    if (typeof openBetslip === 'function') {
      openBetslip({ stopPropagation: () => {} }, 'Afghanistan v Bangladesh', 'Afghanistan', 'back', 1.85);
      return { success: true, text: 'openBetslip called' };
    }
    return { success: false };
  });
  console.log('Odds click result:', oddsClicked);
  await page.waitForTimeout(1000);

  // Check betslip state
  const betslipState = await page.evaluate(() => {
    return {
      betslipDisplay: document.getElementById('mobileBetslipModal')?.style.display || document.getElementById('betslipContainer')?.style.display,
      activeBet: window.activeBet,
      stakeVal: document.getElementById('betslipStakeInput')?.value || document.getElementById('desktopStakeInput')?.value
    };
  });
  console.log('Betslip state:', JSON.stringify(betslipState));

  // Clear network logs before clicking placeBet
  networkRequests.length = 0;
  networkResponses.length = 0;

  console.log('\nStep 5: Clicking Place Bet (triggering placeBet())...');
  const placeBetResult = await page.evaluate(() => {
    let capturedToast = null;
    const origShowToast = window.showToast;
    window.showToast = function(msg, type) {
      capturedToast = msg;
      if (origShowToast) origShowToast(msg, type);
    };

    // Execute placeBet
    placeBet();

    return {
      capturedToast: capturedToast,
      tokenEvaluatedInPlaceBet: (typeof getAuthToken === 'function' ? getAuthToken() : null) || localStorage.getItem('token') || (window.currentUser && window.currentUser.token)
    };
  });

  console.log('\nResult of placeBet():');
  console.log('Captured Toast Message:', placeBetResult.capturedToast);
  console.log('token evaluated by line 10155:', placeBetResult.tokenEvaluatedInPlaceBet);

  console.log('\nNetwork Requests triggered by placeBet():');
  if (networkRequests.length === 0) {
    console.log(' [ZERO REQUESTS SENT TO BACKEND]');
  } else {
    networkRequests.forEach(r => {
      console.log(` - ${r.method} ${r.url}`);
      console.log('   Headers:', JSON.stringify(r.headers));
      console.log('   Body:', r.postData);
    });
  }

  console.log('\nNetwork Responses:');
  networkResponses.forEach(r => {
    console.log(` - ${r.status} ${r.url}: ${r.body.slice(0, 150)}`);
  });

  await browser.close();
  console.log('\n=== REPRODUCTION COMPLETE ===');
}

reproduceBetLoginError().catch(err => {
  console.error('Reproduction failed:', err);
  process.exit(1);
});
