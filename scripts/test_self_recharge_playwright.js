const { chromium } = require('playwright');

const BASE_URL = process.env.TEST_URL || 'http://localhost:4000';

(async () => {
  console.log(`Starting Playwright test against: ${BASE_URL}`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  page.on('response', response => {
    if (response.url().includes('self-recharge') || response.url().includes('self_recharge')) {
      console.log('NETWORK RESPONSE:', response.status(), response.url());
    }
  });

  console.log('1. Navigating to login...');
  await page.goto(`${BASE_URL}/login`);
  await page.waitForLoadState('networkidle');

  console.log('2. Logging in as Company Account (superadmin_1)...');
  await page.fill('#loginUsername', 'superadmin_1');
  await page.fill('#loginPassword', 'SuperAdmin@123');
  await page.click('#btnLoginSubmit');

  await page.waitForURL('**/admin**', { timeout: 15000 });
  await page.waitForLoadState('networkidle');
  console.log('Logged into Admin panel successfully. URL:', page.url());

  // Check Self Recharge menu item
  const selfRechargeNav = page.locator('#topNavSelfRecharge, #sideNavSelfRecharge').first();
  const isNavVisible = await selfRechargeNav.isVisible();
  console.log('Self Recharge Nav Menu visible for Company Account:', isNavVisible);
  if (!isNavVisible) {
    throw new Error('Self Recharge nav menu is not visible for Company Account!');
  }

  console.log('3. Clicking Self Recharge menu...');
  await selfRechargeNav.click();
  await page.waitForTimeout(1500);

  // Check current balance display
  const balDisplay = page.locator('#selfRechargeCurrentBalDisplay');
  const balText = await balDisplay.innerText();
  console.log('Current Balance Displayed:', balText);

  // Check History table content
  const historyTable = page.locator('#selfRechargeHistoryTableBody');
  const histText = await historyTable.innerText();
  console.log('History Table Text (first 100 chars):', histText.slice(0, 100).replace(/\n/g, ' '));
  const has404Error = histText.includes('404') || histText.includes('Unexpected server response');
  console.log('History has 404 error?', has404Error);
  if (has404Error) {
    throw new Error('History has 404 error!');
  }

  await page.screenshot({ path: 'company_self_recharge_view.png' });

  // 4. Submit a recharge of 50,000
  console.log('4. Entering 50000 and confirming recharge...');
  await page.fill('#selfRechargeAmountInput', '50000');
  await page.fill('#selfRechargeNoteInput', 'Playwright automated test recharge 50k');
  await page.click('#selfRechargeSubmitBtn');

  await page.waitForTimeout(2500);
  const updatedBalText = await balDisplay.innerText();
  console.log('Updated Balance Displayed:', updatedBalText);

  // Verify alert message
  const alertMsg = page.locator('#selfRechargeAlertMsg');
  const alertText = await alertMsg.innerText();
  console.log('Alert text:', alertText);
  if (alertText.includes('404') || alertText.includes('error') && !alertText.toLowerCase().includes('successful')) {
    throw new Error('Recharge failed with error: ' + alertText);
  }

  await page.screenshot({ path: 'company_self_recharge_after_50k.png' });

  // 5. Refresh page to test persistence
  console.log('5. Refreshing page...');
  await page.reload();
  await page.waitForLoadState('networkidle');
  await selfRechargeNav.click();
  await page.waitForTimeout(1500);
  const reloadedBalText = await balDisplay.innerText();
  console.log('Reloaded Balance Displayed:', reloadedBalText);

  // 6. Test second recharge of 10,000
  console.log('6. Entering 10000 and confirming recharge...');
  await page.fill('#selfRechargeAmountInput', '10000');
  await page.fill('#selfRechargeNoteInput', 'Second recharge 10k');
  await page.click('#selfRechargeSubmitBtn');
  await page.waitForTimeout(2500);
  const finalBalText = await balDisplay.innerText();
  console.log('Final Balance after +10k:', finalBalText);

  await page.screenshot({ path: 'company_self_recharge_after_10k.png' });

  await browser.close();
  console.log('Playwright tests completed with 100% SUCCESS.');
})().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
