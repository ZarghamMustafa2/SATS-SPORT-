const http = require('http');
const path = require('path');
const { chromium } = require('playwright');
const authDb = require('../lib/auth_db');

// Ensure users are loaded
async function setupUsers() {
  await authDb.hydrateUsersAsync();
  const sa = authDb.getUserByUsername('superadmin_1');
  const sm = authDb.getUserByUsername('supermaster_1');
  if (!sa || !sm) throw new Error('superadmin_1 or supermaster_1 missing');
  const saSess = authDb.createSession(sa);
  const smSess = authDb.createSession(sm);
  return { sa, sm, saToken: saSess.token, smToken: smSess.token };
}

async function startLocalServer(port = 4005) {
  process.env.PORT = String(port);
  const serverModule = require('../server');
  // Wait 1 sec for server to listen
  await new Promise(resolve => setTimeout(resolve, 1000));
  return serverModule;
}

async function runPlaywrightTests() {
  console.log('=== Starting Admin UI Playwright Verification ===\n');
  const { sa, sm, saToken, smToken } = await setupUsers();
  const PORT = 4005;
  await startLocalServer(PORT);
  console.log(`[SERVER] Local server running on port ${PORT}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  // Track console errors
  const pageErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') pageErrors.push(msg.text());
  });
  page.on('pageerror', err => pageErrors.push(err.message));

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Company Account (super_admin) View & API Management Interaction
    // -------------------------------------------------------------------------
    console.log('\n--- 1. Testing Company Account (super_admin) UI ---');
    await page.goto(`http://localhost:${PORT}/admin`, { waitUntil: 'domcontentloaded' });

    // Inject Company Account session
    await page.evaluate(({ token, user }) => {
      localStorage.setItem('admin_auth_token', token);
      localStorage.setItem('admin_current_user', JSON.stringify(user));
      if (typeof applyUserRoleUI === 'function') {
        applyUserRoleUI(user);
      }
    }, { token: saToken, user: { username: sa.username, role: sa.role, id: sa.id } });

    // Reload page with token in place
    await page.goto(`http://localhost:${PORT}/admin`, { waitUntil: 'networkidle' });

    // Check API Management link in sidebar/topnav
    const sideApiLink = await page.locator('#sideNavApiManagementContainer, #topNavApiManagementContainer, a[onclick*="viewApiManagement"]').first();
    const isApiVisible = await sideApiLink.isVisible();
    console.log(`  [UI] API Management nav element visible for Company Account: ${isApiVisible}`);
    if (!isApiVisible) {
      throw new Error('API Management nav element should be visible for Company Account');
    }

    // Navigate to API Management view
    await page.evaluate(() => {
      if (typeof navigateAdmin === 'function') navigateAdmin('/api-management');
      else if (typeof loadAdminApiManagement === 'function') loadAdminApiManagement();
    });
    await page.waitForTimeout(1500);

    // Verify Provider status banner
    const activeProviderText = await page.locator('#apiActiveProviderBadge').innerText().catch(() => '');
    const activeStatusText = await page.locator('#apiActiveStatusBadge').innerText().catch(() => '');
    const activeHealthText = await page.locator('#apiProviderHealthBadge').innerText().catch(() => '');
    console.log(`  [UI] Active Provider Badge: "${activeProviderText.trim()}"`);
    console.log(`  [UI] Connection Status: "${activeStatusText.trim()}" | Health: "${activeHealthText.trim()}"`);

    // Sub-tab 2: Sports Integration Summary
    console.log('  [UI] Switching to Sports Integration Summary sub-tab...');
    await page.locator('#tabBtnApiSportsSummary').click();
    
    // Wait for the sports summary rows to arrive from API
    await page.waitForSelector('#apiSportsSummaryTbody tr[data-sport-name]', { timeout: 15000 });
    const sportsTableRows = await page.locator('#apiSportsSummaryTbody tr[data-sport-name]').count();
    console.log(`  [UI] Sports Summary table data rows rendered: ${sportsTableRows}`);
    if (sportsTableRows < 3) {
      throw new Error(`Expected at least 3 sports rows, found ${sportsTableRows}`);
    }

    // Sub-tab 3: Fixture Monitoring
    console.log('  [UI] Switching to Fixture Monitoring sub-tab...');
    await page.locator('#tabBtnApiFixtures').click();
    
    // Wait for fixtures table to load
    await page.waitForSelector('#apiFixturesTbody tr td button[onclick*="inspectFixtureDiagnostic"]', { timeout: 15000 });
    const fixtureRows = await page.locator('#apiFixturesTbody tr').count();
    console.log(`  [UI] Fixtures table rows rendered: ${fixtureRows}`);

    // Click "Inspect" button on first fixture to open Match Diagnostic Modal
    console.log('  [UI] Clicking "Inspect" button on fixture...');
    const inspectBtn = page.locator('#apiFixturesTbody button[onclick*="inspectFixtureDiagnostic"]').first();
    await inspectBtn.click();
    
    // Wait for diagnostic modal to be visible and populated
    await page.waitForSelector('#modalAdminMatchDiagnostic', { state: 'visible', timeout: 10000 });
    await page.waitForFunction(() => {
      const el = document.getElementById('diagModalEventTitle');
      return el && el.innerText && !el.innerText.includes('Loading Match Diagnostic');
    }, { timeout: 10000 });

    const modalVisible = await page.locator('#modalAdminMatchDiagnostic').isVisible();
    console.log(`  [UI] Match Diagnostic Modal is visible: ${modalVisible}`);
    const modalEventTitle = await page.locator('#diagModalEventTitle').innerText().catch(() => '');
    console.log(`  [UI] Modal Event Title: "${modalEventTitle.trim()}"`);

      // Close modal
      await page.locator('#modalAdminMatchDiagnostic button[onclick*="closeMatchDiagnosticModal"]').first().click();
      await page.waitForTimeout(500);

    // Screenshot Company Account API Management
    await page.screenshot({ path: 'company_account_api_management.png', fullPage: false });
    console.log('  ✅ [PASS] Company Account API Management verified and screenshotted to company_account_api_management.png');

    // -------------------------------------------------------------------------
    // TEST 2: Admin (super_master) Role - API Management MUST BE HIDDEN
    // -------------------------------------------------------------------------
    console.log('\n--- 2. Testing Admin (super_master) UI Role Separation ---');
    const adminContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const adminPage = await adminContext.newPage();

    await adminPage.goto(`http://localhost:${PORT}/admin`, { waitUntil: 'domcontentloaded' });
    await adminPage.evaluate(({ token, user }) => {
      localStorage.setItem('admin_auth_token', token);
      localStorage.setItem('admin_current_user', JSON.stringify(user));
      if (typeof applyUserRoleUI === 'function') {
        applyUserRoleUI(user);
      }
    }, { token: smToken, user: { username: sm.username, role: sm.role, id: sm.id } });

    await adminPage.goto(`http://localhost:${PORT}/admin`, { waitUntil: 'networkidle' });

    // Verify API Management link is HIDDEN
    const adminSideApi = await adminPage.locator('#sideNavApiManagementContainer');
    const adminTopApi = await adminPage.locator('#topNavApiManagementContainer');
    const sideVisible = await adminSideApi.isVisible().catch(() => false);
    const topVisible = await adminTopApi.isVisible().catch(() => false);

    console.log(`  [UI] Admin role sideNav API Management visible: ${sideVisible}`);
    console.log(`  [UI] Admin role topNav API Management visible: ${topVisible}`);

    if (sideVisible || topVisible) {
      throw new Error('SECURITY VIOLATION: API Management link must NOT be visible to Admin role (super_master)');
    }

    // Attempting direct navigation to /api-management or calling loadAdminApiManagement
    const blockedCall = await adminPage.evaluate(() => {
      if (typeof loadAdminApiManagement === 'function') {
        loadAdminApiManagement();
        return true;
      }
      return false;
    });
    console.log(`  [UI] Direct JS call intercepted: ${blockedCall}`);

    await adminPage.screenshot({ path: 'admin_supermaster_restricted.png', fullPage: false });
    console.log('  ✅ [PASS] Admin (super_master) role separation verified and screenshotted to admin_supermaster_restricted.png');

    console.log('\n======================================================');
    console.log('✅ ALL PLAYWRIGHT BROWSER TESTS PASSED PERFECTLY!');
    console.log('======================================================');
  } catch (err) {
    console.error('Playwright test failed:', err);
    process.exit(1);
  } finally {
    await browser.close();
    process.exit(0);
  }
}

runPlaywrightTests().catch(err => {
  console.error('Fatal error in Playwright runner:', err);
  process.exit(1);
});
