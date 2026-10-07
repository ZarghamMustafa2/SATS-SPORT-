// scripts/test_api_management_role_permissions.js
// Comprehensive Verification for API Management Role-Specific Restriction (Company Account Only)
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
  console.log('🚀 TESTING API MANAGEMENT ROLE PERMISSIONS (COMPANY ACCOUNT ONLY)');
  console.log('🌐 Target URL:', PROD_URL);
  console.log('================================================================\n');

  // First verify production health
  const healthRes = await fetchWithRetry(`${PROD_URL}/api/health`);
  const healthData = await healthRes.json();
  console.log('Production Health Check:', healthData.status, 'Version:', healthData.version, 'Timestamp:', healthData.timestamp);

  // Login Company Account via API to get token
  console.log('\n--- Step 1: Authenticating Company Account ---');
  const compLoginRes = await fetchWithRetry(`${PROD_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'superadmin_1', password: 'SuperAdmin@123' })
  });
  const compLoginData = await compLoginRes.json();
  const companyToken = compLoginData.token;
  console.log('Company Account logged in:', Boolean(companyToken), 'Role:', compLoginData.user?.role);
  if (!companyToken || (compLoginData.user?.role !== 'super_admin' && compLoginData.user?.role !== 'company')) {
    throw new Error('Failed to obtain valid Company Account session: ' + JSON.stringify(compLoginData));
  }

  // Login Admin Account via API to get token
  console.log('\n--- Step 2: Authenticating Admin Account ---');
  const adminLoginRes = await fetchWithRetry(`${PROD_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'supermaster_1', password: 'SuperMaster@123' })
  });
  const adminLoginData = await adminLoginRes.json();
  const adminToken = adminLoginData.token;
  console.log('Admin Account logged in:', Boolean(adminToken), 'Role:', adminLoginData.user?.role);
  if (!adminToken || adminLoginData.user?.role !== 'super_master') {
    throw new Error('Failed to obtain valid Admin Account session: ' + JSON.stringify(adminLoginData));
  }

  // =========================================================================
  // TEST 4 (RUN FIRST VIA API): Admin directly calls API Management backend actions
  // =========================================================================
  console.log('\n================================================================');
  console.log('TEST 4: ADMIN DIRECTLY CALLS API MANAGEMENT BACKEND ACTIONS (HTTP 403 EXPECTED)');
  console.log('================================================================');

  // 4a. Admin calls api_overview
  const adminOverviewRes = await fetchWithRetry(`${PROD_URL}/api/sports?action=api_overview`, {
    headers: {
      'Authorization': 'Bearer ' + adminToken,
      'X-Admin-Request': 'true'
    }
  });
  const adminOverviewStatus = adminOverviewRes.status;
  const adminOverviewData = await adminOverviewRes.json();
  console.log('Admin api_overview HTTP Status:', adminOverviewStatus, 'Message:', adminOverviewData.message);
  if (adminOverviewStatus !== 403) {
    throw new Error(`Expected 403 Forbidden for Admin on api_overview, got ${adminOverviewStatus}: ` + JSON.stringify(adminOverviewData));
  }
  console.log('✅ Admin blocked from api_overview with HTTP 403 Forbidden');

  // 4b. Admin calls api_test_connection
  const adminTestRes = await fetchWithRetry(`${PROD_URL}/api/sports?action=api_test_connection`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + adminToken,
      'X-Admin-Request': 'true'
    },
    body: JSON.stringify({ provider: 'shubdx' })
  });
  const adminTestStatus = adminTestRes.status;
  const adminTestData = await adminTestRes.json();
  console.log('Admin api_test_connection HTTP Status:', adminTestStatus, 'Message:', adminTestData.message);
  if (adminTestStatus !== 403) {
    throw new Error(`Expected 403 Forbidden for Admin on api_test_connection, got ${adminTestStatus}: ` + JSON.stringify(adminTestData));
  }
  console.log('✅ Admin blocked from api_test_connection with HTTP 403 Forbidden');

  // 4c. Admin calls api_update_settings
  const adminUpdateRes = await fetchWithRetry(`${PROD_URL}/api/sports?action=api_update_settings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + adminToken,
      'X-Admin-Request': 'true'
    },
    body: JSON.stringify({ provider: 'shubdx', baseUrl: 'https://shubdxinternational.com' })
  });
  const adminUpdateStatus = adminUpdateRes.status;
  const adminUpdateData = await adminUpdateRes.json();
  console.log('Admin api_update_settings HTTP Status:', adminUpdateStatus, 'Message:', adminUpdateData.message);
  if (adminUpdateStatus !== 403) {
    throw new Error(`Expected 403 Forbidden for Admin on api_update_settings, got ${adminUpdateStatus}: ` + JSON.stringify(adminUpdateData));
  }
  console.log('✅ Admin blocked from api_update_settings with HTTP 403 Forbidden');

  // 4d. Admin calls api_switch_provider
  const adminSwitchRes = await fetchWithRetry(`${PROD_URL}/api/sports?action=api_switch_provider`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + adminToken,
      'X-Admin-Request': 'true'
    },
    body: JSON.stringify({ targetProvider: 'shubdx' })
  });
  const adminSwitchStatus = adminSwitchRes.status;
  const adminSwitchData = await adminSwitchRes.json();
  console.log('Admin api_switch_provider HTTP Status:', adminSwitchStatus, 'Message:', adminSwitchData.message);
  if (adminSwitchStatus !== 403) {
    throw new Error(`Expected 403 Forbidden for Admin on api_switch_provider, got ${adminSwitchStatus}: ` + JSON.stringify(adminSwitchData));
  }
  console.log('✅ Admin blocked from api_switch_provider with HTTP 403 Forbidden');

  // 4e. Company Account calls api_overview (MUST SUCCEED 200)
  const compOverviewRes = await fetchWithRetry(`${PROD_URL}/api/sports?action=api_overview`, {
    headers: {
      'Authorization': 'Bearer ' + companyToken,
      'X-Admin-Request': 'true'
    }
  });
  const compOverviewStatus = compOverviewRes.status;
  const compOverviewData = await compOverviewRes.json();
  console.log('Company Account api_overview HTTP Status:', compOverviewStatus, 'Active Provider:', compOverviewData.activeProviderName);
  if (compOverviewStatus !== 200 || compOverviewData.status !== 'success') {
    throw new Error(`Expected 200 success for Company Account on api_overview, got ${compOverviewStatus}: ` + JSON.stringify(compOverviewData));
  }
  console.log('✅ Company Account authorized and successfully fetched api_overview (HTTP 200)');

  // =========================================================================
  // BROWSER PLAYWRIGHT TESTING
  // =========================================================================
  const browser = await chromium.launch({ headless: true });

  // -------------------------------------------------------------------------
  // TEST 1: Login as Company Account -> API Management visible and working
  // -------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log('TEST 1: COMPANY ACCOUNT UI — API MANAGEMENT VISIBLE & FUNCTIONAL');
  console.log('================================================================');
  const compContext = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const compPage = await compContext.newPage();

  await compPage.goto(`${PROD_URL}/admin`, { waitUntil: 'domcontentloaded' });
  await sleep(1000);

  // Log in as Company Account
  await compPage.fill('#user_Username', 'superadmin_1');
  await compPage.fill('#user_Password', 'SuperAdmin@123');
  await compPage.click('#adminLoginSubmitBtn');
  await compPage.waitForSelector('#adminAppContainer', { timeout: 15000 });
  await sleep(3500);

  // Check UI visibility of API Management
  const compTopNavVisible = await compPage.evaluate(() => {
    const el = document.getElementById('topNavApiManagementContainer') || document.getElementById('topNavApiManagement')?.parentElement;
    return el && window.getComputedStyle(el).display !== 'none';
  });
  const compSideNavVisible = await compPage.evaluate(() => {
    const el = document.getElementById('sideNavApiManagementContainer') || document.getElementById('sideNavApiManagement')?.parentElement;
    return el && window.getComputedStyle(el).display !== 'none';
  });

  console.log('Company Top Nav API Management Visible:', compTopNavVisible);
  console.log('Company Sidebar API Management Visible:', compSideNavVisible);

  if (!compTopNavVisible || !compSideNavVisible) {
    throw new Error(`Expected API Management visible for Company Account in top nav and sidebar!`);
  }
  console.log('✅ API Management is visible in Top Nav and Sidebar for Company Account');

  // Navigate to API Management
  await compPage.evaluate(() => navigateAdmin('/Settings/API'));
  await compPage.waitForSelector('#viewApiManagement', { timeout: 8000 });
  await sleep(1500);

  const compApiSectionVisible = await compPage.evaluate(() => {
    const el = document.getElementById('viewApiManagement');
    return el && window.getComputedStyle(el).display !== 'none';
  });
  const compActiveBadgeText = await compPage.innerText('#apiActiveProviderBadge');
  console.log('Company Account API Section Visible:', compApiSectionVisible);
  console.log('Active Provider Badge Text:', compActiveBadgeText);

  if (!compApiSectionVisible || !compActiveBadgeText.includes('Shubdx')) {
    throw new Error('API Management section failed to render for Company Account');
  }
  console.log('✅ API Management section fully functional for Company Account');

  const compScreenshotPath = path.join(ARTIFACTS_DIR, 'live_company_api_management_visible.png');
  await compPage.screenshot({ path: compScreenshotPath, fullPage: false });
  console.log('📸 Saved Company Account Screenshot:', compScreenshotPath);

  // -------------------------------------------------------------------------
  // TEST 2: Login as Admin -> API Management NOT visible anywhere
  // -------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log('TEST 2: ADMIN ACCOUNT UI — API MANAGEMENT HIDDEN EVERYWHERE');
  console.log('================================================================');
  const adminContext = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const adminPage = await adminContext.newPage();

  await adminPage.goto(`${PROD_URL}/admin`, { waitUntil: 'domcontentloaded' });
  await sleep(1000);

  // Log in as Admin
  await adminPage.fill('#user_Username', 'supermaster_1');
  await adminPage.fill('#user_Password', 'SuperMaster@123');
  await adminPage.click('#adminLoginSubmitBtn');
  await adminPage.waitForSelector('#adminAppContainer', { timeout: 15000 });
  await sleep(3500);

  const adminTopNavHidden = await adminPage.evaluate(() => {
    const el = document.getElementById('topNavApiManagementContainer') || document.getElementById('topNavApiManagement')?.parentElement;
    return !el || window.getComputedStyle(el).display === 'none';
  });
  const adminSideNavHidden = await adminPage.evaluate(() => {
    const el = document.getElementById('sideNavApiManagementContainer') || document.getElementById('sideNavApiManagement')?.parentElement;
    return !el || window.getComputedStyle(el).display === 'none';
  });

  console.log('Admin Top Nav API Management Hidden:', adminTopNavHidden);
  console.log('Admin Sidebar API Management Hidden:', adminSideNavHidden);

  if (!adminTopNavHidden || !adminSideNavHidden) {
    throw new Error('API Management is still visible to Admin account in UI!');
  }
  console.log('✅ API Management is completely hidden from Top Nav and Sidebar for Admin');

  const adminScreenshotPath = path.join(ARTIFACTS_DIR, 'live_admin_api_management_hidden.png');
  await adminPage.screenshot({ path: adminScreenshotPath, fullPage: false });
  console.log('📸 Saved Admin Account Screenshot:', adminScreenshotPath);

  // -------------------------------------------------------------------------
  // TEST 3: Admin manually opens API Management URL -> Access Denied & Redirect
  // -------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log('TEST 3: ADMIN MANUALLY ATTEMPTS TO OPEN /Settings/API ROUTE');
  console.log('================================================================');

  await adminPage.evaluate(() => {
    navigateAdmin('/Settings/API');
  });
  await sleep(1000);

  const adminApiViewHidden = await adminPage.evaluate(() => {
    const el = document.getElementById('viewApiManagement');
    return !el || window.getComputedStyle(el).display === 'none';
  });
  const adminDashboardVisible = await adminPage.evaluate(() => {
    const el = document.getElementById('viewDashboard');
    return el && window.getComputedStyle(el).display !== 'none';
  });

  console.log('Admin API Management View Still Hidden:', adminApiViewHidden);
  console.log('Admin Redirected to Dashboard:', adminDashboardVisible);

  if (!adminApiViewHidden || !adminDashboardVisible) {
    throw new Error('Admin was able to open /Settings/API or was not redirected to Dashboard!');
  }
  console.log('✅ Admin direct navigation to /Settings/API was blocked and redirected to Dashboard');

  // -------------------------------------------------------------------------
  // TEST 5: Create a new Admin -> Login with new Admin -> API Management NOT visible
  // -------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log('TEST 5: NEW ADMIN CREATED BY COMPANY ACCOUNT HAS ZERO API ACCESS');
  console.log('================================================================');

  const ts = Date.now().toString().slice(-6);
  const newAdminUser = 'newadmin_' + ts;
  const newAdminPass = 'NewAdminPass@123';

  // Create new Admin account via API using Company Account
  const createAdminRes = await fetchWithRetry(`${PROD_URL}/api/admin/users/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + companyToken,
      'X-Admin-Token': companyToken,
      'X-Admin-Request': 'true'
    },
    body: JSON.stringify({
      username: newAdminUser,
      password: newAdminPass,
      role: 'super_master',
      name: 'Test New Admin'
    })
  });
  const createAdminData = await createAdminRes.json();
  console.log('New Admin Creation Status:', createAdminRes.status, 'User:', createAdminData.user?.username, 'Role:', createAdminData.user?.role);
  if (createAdminRes.status !== 201 && createAdminRes.status !== 200) {
    throw new Error('Failed to create new Admin user: ' + JSON.stringify(createAdminData));
  }

  // Open new browser session with the newly created Admin
  const newAdminContext = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const newAdminPage = await newAdminContext.newPage();

  await newAdminPage.goto(`${PROD_URL}/admin`, { waitUntil: 'domcontentloaded' });
  await sleep(1000);

  await newAdminPage.fill('#user_Username', newAdminUser);
  await newAdminPage.fill('#user_Password', newAdminPass);
  await newAdminPage.click('#adminLoginSubmitBtn');
  await newAdminPage.waitForSelector('#adminAppContainer', { timeout: 15000 });
  await sleep(3500);

  const newAdminTopHidden = await newAdminPage.evaluate(() => {
    const el = document.getElementById('topNavApiManagementContainer') || document.getElementById('topNavApiManagement')?.parentElement;
    return !el || window.getComputedStyle(el).display === 'none';
  });
  const newAdminSideHidden = await newAdminPage.evaluate(() => {
    const el = document.getElementById('sideNavApiManagementContainer') || document.getElementById('sideNavApiManagement')?.parentElement;
    return !el || window.getComputedStyle(el).display === 'none';
  });

  console.log('New Admin Top Nav API Hidden:', newAdminTopHidden);
  console.log('New Admin Sidebar API Hidden:', newAdminSideHidden);

  if (!newAdminTopHidden || !newAdminSideHidden) {
    throw new Error('Newly created Admin account has API Management visible!');
  }

  // Verify new Admin blocked on direct URL navigation
  await newAdminPage.evaluate(() => navigateAdmin('/Settings/API'));
  await sleep(1000);
  const newAdminApiBlocked = await newAdminPage.evaluate(() => {
    const el = document.getElementById('viewApiManagement');
    return !el || window.getComputedStyle(el).display === 'none';
  });
  console.log('New Admin /Settings/API Blocked:', newAdminApiBlocked);
  if (!newAdminApiBlocked) {
    throw new Error('Newly created Admin was able to open /Settings/API!');
  }
  console.log('✅ Newly created Admin automatically inherits zero API Management access');

  // -------------------------------------------------------------------------
  // TEST 6: Refresh and Mobile View Verification
  // -------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log('TEST 6: REFRESH AND MOBILE VIEW BEHAVIOR');
  console.log('================================================================');

  // Set mobile viewport
  await newAdminPage.setViewportSize({ width: 375, height: 667 });
  await sleep(500);

  // Reload page
  console.log('Reloading Admin in mobile viewport...');
  await newAdminPage.reload({ waitUntil: 'domcontentloaded' });
  await sleep(2000);

  const mobileSideHidden = await newAdminPage.evaluate(() => {
    const el = document.getElementById('sideNavApiManagementContainer') || document.getElementById('sideNavApiManagement')?.parentElement;
    return !el || window.getComputedStyle(el).display === 'none';
  });
  console.log('Mobile View Admin Sidebar API Hidden after reload:', mobileSideHidden);
  if (!mobileSideHidden) {
    throw new Error('API Management visible in mobile view after reload!');
  }

  const mobileScreenshotPath = path.join(ARTIFACTS_DIR, 'live_admin_mobile_view_no_api_management.png');
  await newAdminPage.screenshot({ path: mobileScreenshotPath, fullPage: false });
  console.log('📸 Saved Mobile View Screenshot:', mobileScreenshotPath);

  await browser.close();

  console.log('\n================================================================');
  console.log('🎉 ALL 6 API MANAGEMENT ROLE PERMISSION TESTS PASSED COMPLETELY!');
  console.log('================================================================');
}

main().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
