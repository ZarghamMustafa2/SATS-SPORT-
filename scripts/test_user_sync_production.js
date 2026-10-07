const { chromium } = require('playwright');
const https = require('https');

const BASE_URL = 'https://satsportco.vercel.app';

function httpRequest(urlStr, method = 'GET', data = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method,
      headers: { ...headers }
    };
    if (data) {
      const bodyStr = typeof data === 'string' ? data : JSON.stringify(data);
      options.headers['Content-Type'] = 'application/json';
      options.headers['Content-Length'] = Buffer.byteLength(bodyStr);
    }
    const r = https.request(options, (res) => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(b) });
        } catch(e) {
          resolve({ status: res.statusCode, raw: b });
        }
      });
    });
    r.on('error', reject);
    if (data) r.write(typeof data === 'string' ? data : JSON.stringify(data));
    r.end();
  });
}

async function run() {
  console.log(`=====================================================================`);
  console.log(`STARTING PRODUCTION VERIFICATION ON: ${BASE_URL}`);
  console.log(`=====================================================================\n`);

  const uniqueSuffix = Date.now().toString().slice(-6);
  const testUsers = [
    { username: `UserSync_A_${uniqueSuffix}`, password: 'Password@123' },
    { username: `UserSync_B_${uniqueSuffix}`, password: 'Password@123' },
    { username: `UserSync_C_${uniqueSuffix}`, password: 'Password@123' }
  ];

  const results = [];

  // =========================================================================
  // STEP 1: REGISTER EACH USER VIA USER WEBSITE API & VERIFY LOGIN & STORAGE
  // =========================================================================
  console.log('--- STEP 1: REGISTERING 3 NEW USERS ---');
  for (const tu of testUsers) {
    console.log(`\nRegistering ${tu.username}...`);
    const regRes = await httpRequest(`${BASE_URL}/api/auth/register`, 'POST', {
      username: tu.username,
      password: tu.password,
      confirmPassword: tu.password,
      phone: '9876543210'
    });

    console.log(`Registration Response Status: ${regRes.status}`);
    if (regRes.status !== 201 || !regRes.data?.user?.id) {
      throw new Error(`Failed to register ${tu.username}: ${JSON.stringify(regRes.data)}`);
    }

    const regUserId = regRes.data.user.id;
    console.log(`Registered successfully! User ID: ${regUserId}, Role: ${regRes.data.user.role}`);

    // Verify Login
    console.log(`Verifying login for ${tu.username}...`);
    const loginRes = await httpRequest(`${BASE_URL}/api/auth/login`, 'POST', {
      username: tu.username,
      password: tu.password
    });
    console.log(`Login Response Status: ${loginRes.status}, User ID: ${loginRes.data?.user?.id}`);
    if (loginRes.status !== 200 || !loginRes.data?.token) {
      throw new Error(`User ${tu.username} failed to log in!`);
    }

    // Wait 1.5s for cloud persistence to settle
    await new Promise(r => setTimeout(r, 1500));

    // Verify Direct in Persistent ExtendsClass Storage
    console.log(`Verifying ${tu.username} directly in Persistent Cloud Store...`);
    const storageRes = await httpRequest(`https://extendsclass.com/api/json-storage/bin/ffacdbd?_t=${Date.now()}`, 'GET', null, {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache'
    });
    const cloudUsers = storageRes.data;
    const foundInCloud = Array.isArray(cloudUsers) && cloudUsers.find(u => u.username && u.username === tu.username);
    if (!foundInCloud) {
      throw new Error(`User ${tu.username} NOT found in persistent cloud storage!`);
    }
    console.log(`Found in Cloud Store! DB User ID: ${foundInCloud.id}`);

    // Equality Check
    const dbUserId = foundInCloud.id;
    if (regUserId !== dbUserId) {
      throw new Error(`User ID mismatch! Reg ID: ${regUserId} vs DB ID: ${dbUserId}`);
    }

    results.push({
      ...tu,
      regUserId,
      dbUserId
    });
  }

  // =========================================================================
  // STEP 2: VERIFY USERS APPEAR IN COMPANY ACCOUNT ADMIN USERS API
  // =========================================================================
  console.log('\n--- STEP 2: COMPANY ACCOUNT ADMIN USERS API CHECK ---');
  const saLogin = await httpRequest(`${BASE_URL}/api/auth/login`, 'POST', {
    username: 'superadmin_1',
    password: 'SuperAdmin@123'
  });
  const saToken = saLogin.data.token;
  console.log(`Company Account logged in. Calling GET /api/admin/users...`);

  const saUsersRes = await httpRequest(`${BASE_URL}/api/admin/users?_t=${Date.now()}`, 'GET', null, {
    'Authorization': 'Bearer ' + saToken,
    'X-Admin-Token': saToken
  });
  console.log(`Company GET /api/admin/users Status: ${saUsersRes.status}, Total Users: ${saUsersRes.data?.totalUsers}`);

  for (const tu of results) {
    const userInSa = (saUsersRes.data?.users || []).find(u => u.username === tu.username);
    if (!userInSa) {
      throw new Error(`User ${tu.username} NOT present in Company Account users list!`);
    }
    tu.saApiUserId = userInSa.id;
    console.log(`Verified ${tu.username} in Company Account! API User ID: ${userInSa.id}`);
    if (tu.saApiUserId !== tu.dbUserId) {
      throw new Error(`ID Mismatch in Company API for ${tu.username}: ${tu.saApiUserId} !== ${tu.dbUserId}`);
    }
  }

  // =========================================================================
  // STEP 3: VERIFY USERS APPEAR IN ADMIN ACCOUNT USERS API
  // =========================================================================
  console.log('\n--- STEP 3: ADMIN ACCOUNT USERS API CHECK ---');
  const smLogin = await httpRequest(`${BASE_URL}/api/auth/login`, 'POST', {
    username: 'supermaster_1',
    password: 'SuperMaster@123'
  });
  const smToken = smLogin.data.token;
  console.log(`Admin Account logged in. Calling GET /api/admin/users...`);

  const smUsersRes = await httpRequest(`${BASE_URL}/api/admin/users?_t=${Date.now()}`, 'GET', null, {
    'Authorization': 'Bearer ' + smToken,
    'X-Admin-Token': smToken
  });
  console.log(`Admin GET /api/admin/users Status: ${smUsersRes.status}, Total Users: ${smUsersRes.data?.totalUsers}`);

  for (const tu of results) {
    const userInSm = (smUsersRes.data?.users || []).find(u => u.username === tu.username);
    if (!userInSm) {
      throw new Error(`User ${tu.username} NOT present in Admin Account users list!`);
    }
    tu.smApiUserId = userInSm.id;
    console.log(`Verified ${tu.username} in Admin Account! API User ID: ${userInSm.id}`);
    if (tu.smApiUserId !== tu.dbUserId) {
      throw new Error(`ID Mismatch in Admin API for ${tu.username}: ${tu.smApiUserId} !== ${tu.dbUserId}`);
    }
  }

  // =========================================================================
  // STEP 4: VERIFY SEARCH BY USERNAME & SEARCH BY USER ID IN ADMIN API
  // =========================================================================
  console.log('\n--- STEP 4: VERIFYING BACKEND SEARCH BY USERNAME & USER ID ---');
  for (const tu of results) {
    // Search by username
    const searchU = await httpRequest(`${BASE_URL}/api/admin/users?search=${encodeURIComponent(tu.username)}`, 'GET', null, {
      'Authorization': 'Bearer ' + saToken,
      'X-Admin-Token': saToken
    });
    const foundU = (searchU.data?.users || []).some(u => u.username === tu.username);
    console.log(`Search by Username '${tu.username}': found = ${foundU}`);
    if (!foundU) throw new Error(`Search by username failed for ${tu.username}`);

    // Search by user ID
    const searchId = await httpRequest(`${BASE_URL}/api/admin/users?search=${encodeURIComponent(tu.dbUserId)}`, 'GET', null, {
      'Authorization': 'Bearer ' + saToken,
      'X-Admin-Token': saToken
    });
    const foundId = (searchId.data?.users || []).some(u => u.id === tu.dbUserId);
    console.log(`Search by User ID '${tu.dbUserId}': found = ${foundId}`);
    if (!foundId) throw new Error(`Search by User ID failed for ${tu.dbUserId}`);
  }

  // =========================================================================
  // STEP 5: PLAYWRIGHT E2E BROWSER VERIFICATION (UI VISIBILITY, SEARCH, REFRESH)
  // =========================================================================
  console.log('\n--- STEP 5: PLAYWRIGHT E2E BROWSER VERIFICATION ---');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  console.log('Navigating to live production login page...');
  await page.goto(`${BASE_URL}/login`);
  await page.waitForLoadState('networkidle');

  // A. Log in as Company Account
  console.log('Logging in as Company Account (superadmin_1)...');
  await page.fill('#loginUsername', 'superadmin_1');
  await page.fill('#loginPassword', 'SuperAdmin@123');
  await page.click('#btnLoginSubmit');
  await page.waitForURL('**/admin**', { timeout: 15000 });
  await page.waitForLoadState('networkidle');

  // Navigate to Users
  console.log('Navigating to Users section...');
  await page.click('#topNavUsers, #sideNavUsers');
  await page.waitForTimeout(2000);

  // Check UI visibility for each user
  for (const tu of results) {
    const userRow = page.locator(`tr[data-username="${tu.username}"]`);
    const isVisible = await userRow.isVisible();
    console.log(`Company Account UI: Row for ${tu.username} visible? ${isVisible}`);
    if (!isVisible) throw new Error(`User ${tu.username} not visible in Company Account UI!`);

    const rowIdAttr = await userRow.getAttribute('id');
    const uiUserId = rowIdAttr ? rowIdAttr.replace('row-', '') : null;
    tu.companyUiUserId = uiUserId;
    console.log(`Company Account UI User ID: ${uiUserId}`);
    if (uiUserId !== tu.dbUserId) {
      throw new Error(`UI User ID mismatch: ${uiUserId} !== ${tu.dbUserId}`);
    }
  }

  // Test Search in UI
  const targetUser = results[0];
  console.log(`Testing UI search input for ${targetUser.username}...`);
  await page.fill('#usersListSearchInput', targetUser.username);
  await page.waitForTimeout(1000);
  const targetRowVisible = await page.locator(`tr[data-username="${targetUser.username}"]`).isVisible();
  console.log(`Filtered row visible for ${targetUser.username}? ${targetRowVisible}`);
  if (!targetRowVisible) throw new Error(`Filtered search failed for ${targetUser.username}`);

  // Clear search
  await page.fill('#usersListSearchInput', '');
  await page.waitForTimeout(1000);

  // Take screenshot of Company Account Users view
  await page.screenshot({ path: 'live_prod_company_users_sync.png' });

  // Test Refresh Persistence in Company Account
  console.log('Testing page reload persistence in Company Account...');
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.click('#topNavUsers, #sideNavUsers');
  await page.waitForTimeout(2000);

  for (const tu of results) {
    const isVisibleAfterReload = await page.locator(`tr[data-username="${tu.username}"]`).isVisible();
    console.log(`After reload: ${tu.username} still visible? ${isVisibleAfterReload}`);
    if (!isVisibleAfterReload) throw new Error(`User ${tu.username} disappeared after reload!`);
  }

  // B. Close Company context and open fresh context for Admin (supermaster_1)
  console.log('\nLogging in as Admin Account (supermaster_1) in fresh context...');
  await context.close();
  const adminContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const adminPage = await adminContext.newPage();

  await adminPage.goto(`${BASE_URL}/login`);
  await adminPage.waitForLoadState('networkidle');
  await adminPage.fill('#loginUsername', 'supermaster_1');
  await adminPage.fill('#loginPassword', 'SuperMaster@123');
  await adminPage.click('#btnLoginSubmit');
  await adminPage.waitForURL('**/admin**', { timeout: 15000 });
  await adminPage.waitForLoadState('networkidle');

  // Navigate to Users in Admin
  console.log('Navigating to Users section in Admin Account...');
  await adminPage.click('#topNavUsers, #sideNavUsers');
  await adminPage.waitForTimeout(2000);

  for (const tu of results) {
    const userRow = adminPage.locator(`tr[data-username="${tu.username}"]`);
    const isVisible = await userRow.isVisible();
    console.log(`Admin Account UI: Row for ${tu.username} visible? ${isVisible}`);
    if (!isVisible) throw new Error(`User ${tu.username} not visible in Admin Account UI!`);

    const rowIdAttr = await userRow.getAttribute('id');
    const uiUserId = rowIdAttr ? rowIdAttr.replace('row-', '') : null;
    tu.adminUiUserId = uiUserId;
    console.log(`Admin Account UI User ID: ${uiUserId}`);
    if (uiUserId !== tu.dbUserId) {
      throw new Error(`Admin UI User ID mismatch: ${uiUserId} !== ${tu.dbUserId}`);
    }
  }

  await adminPage.screenshot({ path: 'live_prod_admin_users_sync.png' });

  await browser.close();

  console.log('\n=====================================================================');
  console.log('ALL TESTS PASSED WITH 100% SUCCESS!');
  console.log('=====================================================================');
  console.log(JSON.stringify(results, null, 2));
}

run().catch(err => {
  console.error('\nTEST FAILED WITH ERROR:', err);
  process.exit(1);
});
