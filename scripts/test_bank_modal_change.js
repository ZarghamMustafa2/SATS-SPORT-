const { chromium } = require('playwright');

async function testBankModal(baseUrl) {
  console.log(`\n======================================================`);
  console.log(`TESTING BANK MODAL ON: ${baseUrl}`);
  console.log(`======================================================\n`);

  const browser = await chromium.launch({ headless: true });
  const adminContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const adminPage = await adminContext.newPage();

  // 1. Log in as Admin (supermaster_1)
  console.log('Logging in as Admin (supermaster_1)...');
  await adminPage.goto(`${baseUrl}/login`);
  await adminPage.waitForLoadState('networkidle');
  await adminPage.fill('#loginUsername', 'supermaster_1');
  await adminPage.fill('#loginPassword', 'SuperMaster@123');
  await adminPage.click('#btnLoginSubmit');
  await adminPage.waitForURL('**/admin**', { timeout: 15000 });
  await adminPage.waitForLoadState('networkidle');

  // 2. Navigate to Bank Settings
  console.log('Navigating to Bank Settings...');
  const bankNav = adminPage.locator('#sideNavBankSettings, a:has-text("Bank Settings")');
  await bankNav.first().click();
  await adminPage.waitForTimeout(1500);

  // 3. Open Add Receiving Bank Account Modal
  console.log('Opening Add Receiving Bank Account modal...');
  const addBtn = adminPage.locator('button:has-text("Add Bank Account"), button:has-text("Add Receiving Bank")');
  await addBtn.first().click();
  await adminPage.waitForTimeout(1000);

  // 4. Verify fields inside #modalAdminBankEdit
  console.log('Verifying modal fields...');
  const modal = adminPage.locator('#modalAdminBankEdit');
  const isModalVisible = await modal.isVisible();
  console.log('Modal visible:', isModalVisible);
  if (!isModalVisible) throw new Error('Add Receiving Bank Account modal is not visible!');

  const hasBankName = await adminPage.locator('#bankEditName').isVisible();
  const hasAccountTitle = await adminPage.locator('#bankEditTitle').isVisible();
  const hasAccountNumber = await adminPage.locator('#bankEditNumber').isVisible();

  const ibanElementCount = await adminPage.locator('#bankEditIban').count();
  const detailsElementCount = await adminPage.locator('#bankEditDetails').count();
  const statusElementCount = await adminPage.locator('#bankEditStatus').count();

  console.log(`- Bank Name visible: ${hasBankName}`);
  console.log(`- Account Title visible: ${hasAccountTitle}`);
  console.log(`- Account Number visible: ${hasAccountNumber}`);
  console.log(`- IBAN field count in DOM: ${ibanElementCount} (Expected: 0)`);
  console.log(`- Details field count in DOM: ${detailsElementCount} (Expected: 0)`);
  console.log(`- Status field count in DOM: ${statusElementCount} (Expected: 0)`);

  if (!hasBankName || !hasAccountTitle || !hasAccountNumber) {
    throw new Error('Required fields (Bank Name, Account Title, Account Number) missing!');
  }
  if (ibanElementCount !== 0) throw new Error('IBAN field still exists in modal!');
  if (detailsElementCount !== 0) throw new Error('Branch/Details field still exists in modal!');
  if (statusElementCount !== 0) throw new Error('Status field still exists in modal!');

  // Take screenshot of the updated modal
  await adminPage.screenshot({ path: 'updated_bank_modal.png' });
  console.log('Screenshot of updated modal saved to updated_bank_modal.png');

  // 5. Fill only Bank Name, Account Title, Account Number
  const testBankName = `Standard Chartered_${Date.now() % 10000}`;
  const testAccountTitle = 'Satsport Treasury Ops';
  const testAccountNumber = '09876543211234';

  console.log(`Filling form with: ${testBankName}, ${testAccountTitle}, ${testAccountNumber}`);
  await adminPage.fill('#bankEditName', testBankName);
  await adminPage.fill('#bankEditTitle', testAccountTitle);
  await adminPage.fill('#bankEditNumber', testAccountNumber);

  // 6. Click Save Bank Account
  console.log('Clicking Save Bank Account...');
  await adminPage.click('#btnSaveBank');
  await adminPage.waitForTimeout(2000);

  // Verify modal is closed and row is in table
  const isModalClosed = !(await modal.isVisible());
  console.log('Modal closed after save:', isModalClosed);
  if (!isModalClosed) throw new Error('Modal did not close after saving!');

  const tableText = await adminPage.locator('#adminBankAccountsTbody').innerText();
  const savedInTable = tableText.includes(testBankName);
  console.log(`New bank appeared in admin table: ${savedInTable}`);
  if (!savedInTable) throw new Error('New bank not found in admin table!');

  // Take screenshot of Admin bank accounts table
  await adminPage.screenshot({ path: 'admin_bank_accounts_list.png' });

  // 7. Verify on User Deposit Page
  console.log('\nVerifying User Deposit page...');
  const userContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const userPage = await userContext.newPage();

  // Register test user via API
  const uniqueUser = `bank_test_${Date.now() % 100000}`;
  const regRes = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: uniqueUser,
      password: 'Password@123',
      name: 'Bank Test User'
    })
  });
  const regData = await regRes.json();
  const userToken = regData.token;
  console.log(`Registered user ${uniqueUser}, token received: ${Boolean(userToken)}`);

  await userPage.goto(`${baseUrl}/`);
  await userPage.evaluate((token) => {
    localStorage.setItem('auth_token', token);
  }, userToken);
  await userPage.reload();
  await userPage.waitForLoadState('networkidle');

  // Open Deposit modal
  console.log('Opening deposit modal...');
  await userPage.evaluate(() => {
    if (typeof openDepositModal === 'function') openDepositModal('deposit');
  });
  await userPage.waitForTimeout(2500);

  // Verify bank card in #dwBankAccountsList
  const bankCard = userPage.locator('.dw-bank-card', { hasText: testBankName });
  const isCardVisible = await bankCard.isVisible();
  console.log(`New bank visible in User Deposit modal: ${isCardVisible}`);
  if (!isCardVisible) throw new Error('New bank not visible on user deposit page!');

  const cardHtml = await bankCard.innerHTML();
  const hasIbanText = cardHtml.includes('IBAN:');
  console.log(`User card contains empty IBAN label: ${hasIbanText} (Expected: false)`);
  if (hasIbanText) throw new Error('User card shows IBAN when none was provided!');

  // Take screenshot of User Deposit page
  await userPage.screenshot({ path: 'user_deposit_banks_view.png' });
  console.log('Screenshot of User deposit view saved to user_deposit_banks_view.png');

  await browser.close();
  console.log('\nALL CHECKS PASSED SUCCESSFULLY!\n');
}

const targetUrl = process.argv[2] || 'http://localhost:4000';
testBankModal(targetUrl).catch(err => {
  console.error('\nTEST FAILED:', err);
  process.exit(1);
});
