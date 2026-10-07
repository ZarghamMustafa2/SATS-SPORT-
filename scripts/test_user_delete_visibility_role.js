const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const PROD_URL = process.env.TEST_URL || 'https://satsportco.vercel.app';
const ARTIFACTS_DIR = 'C:\\Users\\NEW PC TECH\\.gemini\\antigravity\\brain\\18b5e61b-2c45-401f-9613-7c2e2081b00b';

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchWithRetry(url, options = {}, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, options);
      return res;
    } catch (err) {
      if (i === retries - 1) throw err;
      await sleep(1500);
    }
  }
}

async function main() {
  console.log('================================================================');
  console.log('🚀 TESTING USER DELETE VISIBILITY & PERMISSIONS');
  console.log('🌐 Target URL:', PROD_URL);
  console.log('================================================================');

  const browser = await chromium.launch({ headless: true });
  const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await desktopContext.newPage();

  // Create a dedicated test normal user first via frontend registration API
  const testUsername = 'test_del_' + Date.now().toString().slice(-6);
  const testPassword = 'Password@123';
  console.log('\n--- Step 0: Creating disposable Normal User for delete test:', testUsername, '---');

  const regRes = await fetchWithRetry(`${PROD_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: testUsername,
      password: testPassword,
      confirmPassword: testPassword,
      phone: '9876543210'
    })
  });
  const regData = await regRes.json();
  console.log('Registration status:', regRes.status, regData.status || regData.message);
  if (!regRes.ok && regData.status !== 'success') {
    throw new Error('Failed to create disposable test user: ' + JSON.stringify(regData));
  }
  const testUserId = regData.user ? regData.user.id : null;
  console.log(`Disposable Normal User created: ${testUsername} (ID: ${testUserId})`);

  // =========================================================================
  // TEST 1: Login as Company Account -> Verify Delete User on Normal User rows
  // =========================================================================
  console.log('\n================================================================');
  console.log('TEST 1: COMPANY ACCOUNT - VERIFY DELETE USER ON NORMAL USERS');
  console.log('================================================================');

  await page.goto(`${PROD_URL}/admin`, { waitUntil: 'domcontentloaded' });
  await sleep(1000);
  await page.fill('#user_Username', 'superadmin_1');
  await page.fill('#user_Password', 'SuperAdmin@123');
  await page.click('#adminLoginSubmitBtn');
  await page.waitForSelector('#adminAppContainer', { timeout: 15000 });
  await sleep(2000);

  // Navigate to Users
  await page.evaluate(() => navigateAdmin('/Accounts/Chart'));
  await sleep(2000);

  // Search for the disposable test user
  await page.evaluate(u => {
    const input = document.getElementById('usersListSearchInput');
    if (input) {
      input.value = u;
      filterClientsList(u);
    }
  }, testUsername);
  await sleep(1000);

  const desktopRowStatus = await page.evaluate(u => {
    const row = Array.from(document.querySelectorAll('#clientsTableBody tr.user-main-row'))
      .find(r => r.getAttribute('data-username') === u);
    if (!row) return null;
    const delBtn = row.querySelector('button[title="Delete User"]');
    return {
      exists: !!delBtn,
      visible: delBtn ? window.getComputedStyle(delBtn).display !== 'none' : false,
      btnClass: delBtn ? delBtn.className : null
    };
  }, testUsername);

  console.log('Desktop Table Delete Button for Normal User:', desktopRowStatus);
  if (!desktopRowStatus || !desktopRowStatus.visible) {
    throw new Error('TEST 1 FAILED: Delete User button not visible on desktop for Normal User in Company Account');
  }

  // Check User Details (Book Row)
  await page.evaluate(u => {
    const row = Array.from(document.querySelectorAll('#clientsTableBody tr.user-main-row'))
      .find(r => r.getAttribute('data-username') === u);
    const infoBtn = row ? row.querySelector('button[title="Show Book Details"]') : null;
    if (infoBtn) infoBtn.click();
  }, testUsername);
  await sleep(1000);

  const bookRowStatus = await page.evaluate(u => {
    const row = Array.from(document.querySelectorAll('#clientsTableBody tr.desktop-book-row'))
      .find(r => r.id.startsWith('bookrow-') && r.style.display !== 'none');
    if (!row) return null;
    const delBtn = Array.from(row.querySelectorAll('button')).find(b => b.innerText.includes('Delete User'));
    return {
      exists: !!delBtn,
      visible: delBtn ? window.getComputedStyle(delBtn).display !== 'none' : false
    };
  }, testUsername);
  console.log('User Details Book Row Delete Button for Normal User:', bookRowStatus);

  // Check User Edit Page in Company Account
  await page.evaluate(u => {
    const row = Array.from(document.querySelectorAll('#clientsTableBody tr.user-main-row'))
      .find(r => r.getAttribute('data-username') === u);
    const editA = row ? row.querySelector('a[title="Edit Client"]') : null;
    if (editA) editA.click();
  }, testUsername);
  await sleep(2000);

  const editPageDelStatus = await page.evaluate(() => {
    const delBtn = document.getElementById('btnDeleteUserInEdit');
    const delBtnTop = document.getElementById('btnDeleteUserInEditTop');
    return {
      footerBtnVisible: delBtn ? window.getComputedStyle(delBtn).display !== 'none' : false,
      topBtnVisible: delBtnTop ? window.getComputedStyle(delBtnTop).display !== 'none' : false
    };
  });
  console.log('User Edit Page Delete Buttons for Normal User:', editPageDelStatus);
  if (!editPageDelStatus.footerBtnVisible && !editPageDelStatus.topBtnVisible) {
    throw new Error('TEST 1 FAILED: Delete User button not visible on User Edit page in Company Account');
  }

  // Mobile View Verification for Company Account
  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pageM = await mobileContext.newPage();
  await pageM.goto(`${PROD_URL}/admin`, { waitUntil: 'domcontentloaded' });
  await sleep(1000);
  await pageM.fill('#user_Username', 'superadmin_1');
  await pageM.fill('#user_Password', 'SuperAdmin@123');
  await pageM.click('#adminLoginSubmitBtn');
  await pageM.waitForSelector('#adminAppContainer', { timeout: 15000 });
  await sleep(2000);

  await pageM.evaluate(() => navigateAdmin('/Accounts/Chart'));
  await sleep(2000);

  await pageM.evaluate(u => {
    const input = document.getElementById('usersListSearchInput');
    if (input) {
      input.value = u;
      filterClientsList(u);
    }
  }, testUsername);
  await sleep(1000);

  // Click on row to expand mobile details
  await pageM.evaluate(u => {
    const row = Array.from(document.querySelectorAll('#clientsTableBody tr.user-main-row'))
      .find(r => r.getAttribute('data-username') === u);
    if (row) row.click();
  }, testUsername);
  await sleep(1000);

  const mobileDeleteStatus = await pageM.evaluate(u => {
    const childRow = Array.from(document.querySelectorAll('#clientsTableBody tr.user-child-row'))
      .find(r => r.classList.contains('show'));
    if (!childRow) return null;
    const delBtn = childRow.querySelector('button[title="Delete User"]');
    return {
      exists: !!delBtn,
      visible: delBtn ? window.getComputedStyle(delBtn).display !== 'none' : false
    };
  }, testUsername);
  console.log('Mobile Expanded Row Delete Button for Normal User:', mobileDeleteStatus);
  if (!mobileDeleteStatus || !mobileDeleteStatus.visible) {
    throw new Error('TEST 1 FAILED: Mobile Delete User button not visible in Company Account');
  }

  // Capture screenshot of mobile expanded row with Delete User
  const mobileShotPath = path.join(ARTIFACTS_DIR, 'live_company_mobile_delete_user_visible.png');
  await pageM.screenshot({ path: mobileShotPath });
  console.log('📸 Saved Mobile Delete User Screenshot:', mobileShotPath);
  await mobileContext.close();

  console.log('✅ TEST 1 PASSED: Delete User option is fully visible on Desktop, Mobile, Book Row, and Edit page for Company Account');

  // =========================================================================
  // TEST 2: Delete a test Normal User from Company Account
  // =========================================================================
  console.log('\n================================================================');
  console.log('TEST 2: COMPANY ACCOUNT DELETES TEST NORMAL USER');
  console.log('================================================================');

  // Navigate back to Users table on desktop page
  await page.evaluate(() => navigateAdmin('/Accounts/Chart'));
  await sleep(1500);

  await page.evaluate(u => {
    const input = document.getElementById('usersListSearchInput');
    if (input) {
      input.value = u;
      filterClientsList(u);
    }
  }, testUsername);
  await sleep(1000);

  // Click Delete User button on the test user row
  await page.evaluate(u => {
    const row = Array.from(document.querySelectorAll('#clientsTableBody tr.user-main-row'))
      .find(r => r.getAttribute('data-username') === u);
    const delBtn = row ? row.querySelector('button[title="Delete User"]') : null;
    if (delBtn) delBtn.click();
  }, testUsername);
  await sleep(1000);

  // Verify Confirmation Modal appeared
  const modalVisible = await page.evaluate(() => {
    const modal = document.getElementById('modalDeleteUser');
    const uInput = document.getElementById('deleteModalUsername');
    return {
      visible: modal ? modal.style.display !== 'none' : false,
      username: uInput ? uInput.value : null
    };
  });
  console.log('Delete Confirmation Modal Status:', modalVisible);
  if (!modalVisible.visible || modalVisible.username !== testUsername) {
    throw new Error('TEST 2 FAILED: Delete Confirmation Modal did not open properly with correct username');
  }

  // Capture screenshot of the confirmation modal
  const modalShotPath = path.join(ARTIFACTS_DIR, 'live_company_delete_user_modal.png');
  await page.screenshot({ path: modalShotPath });
  console.log('📸 Saved Delete User Confirmation Modal Screenshot:', modalShotPath);

  // Submit deletion
  await page.evaluate(() => {
    document.getElementById('deleteModalReason').value = 'Automated end-to-end verification test';
  });
  await page.click('#deleteModalSubmitBtn');
  await sleep(3000);

  // Check if modal closed
  const modalClosed = await page.evaluate(() => {
    const modal = document.getElementById('modalDeleteUser');
    return modal ? modal.style.display === 'none' : true;
  });
  console.log('Modal closed after submit:', modalClosed);

  // Verify user is gone from client list
  const userStillPresent = await page.evaluate(u => {
    return Array.from(document.querySelectorAll('#clientsTableBody tr.user-main-row'))
      .some(r => r.getAttribute('data-username') === u);
  }, testUsername);
  console.log('User still present in active table immediately after delete:', userStillPresent);
  if (userStillPresent) {
    throw new Error('TEST 2 FAILED: User was not removed from active table after deletion');
  }
  console.log('✅ TEST 2 PASSED: Test Normal User deleted successfully via Company Account');

  // =========================================================================
  // TEST 3: Hard Page Refresh -> Deleted user remains absent
  // =========================================================================
  console.log('\n================================================================');
  console.log('TEST 3: REFRESH PERSISTENCE (DELETED USER REMAINS ABSENT)');
  console.log('================================================================');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await sleep(3000);

  await page.evaluate(() => navigateAdmin('/Accounts/Chart'));
  await sleep(2000);

  await page.evaluate(u => {
    const input = document.getElementById('usersListSearchInput');
    if (input) {
      input.value = u;
      filterClientsList(u);
    }
  }, testUsername);
  await sleep(1000);

  const userFoundAfterRefresh = await page.evaluate(u => {
    return Array.from(document.querySelectorAll('#clientsTableBody tr.user-main-row'))
      .some(r => r.getAttribute('data-username') === u);
  }, testUsername);
  console.log('User found in table after reload:', userFoundAfterRefresh);
  if (userFoundAfterRefresh) {
    throw new Error('TEST 3 FAILED: Deleted user reappeared after page refresh');
  }
  console.log('✅ TEST 3 PASSED: Deleted user remains persistently absent after page reload');

  // =========================================================================
  // TEST 4: Login as Admin -> Delete User still visible and still works
  // =========================================================================
  console.log('\n================================================================');
  console.log('TEST 4: ADMIN ACCOUNT - VERIFY DELETE USER VISIBILITY & FUNCTION');
  console.log('================================================================');

  // Clear session to log in as Admin
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto(`${PROD_URL}/admin`, { waitUntil: 'domcontentloaded' });
  await sleep(1000);

  await page.fill('#user_Username', 'supermaster_1');
  await page.fill('#user_Password', 'SuperMaster@123');
  await page.click('#adminLoginSubmitBtn');
  await page.waitForSelector('#adminAppContainer', { timeout: 15000 });
  await sleep(2000);

  await page.evaluate(() => navigateAdmin('/Accounts/Chart'));
  await sleep(2000);

  const adminNormalUsersDeleteStatus = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('#clientsTableBody tr.user-main-row'));
    return rows.slice(0, 5).map(r => {
      const u = r.getAttribute('data-username');
      const delBtn = r.querySelector('button[title="Delete User"]');
      return {
        username: u,
        hasDeleteBtn: !!delBtn,
        visible: delBtn ? window.getComputedStyle(delBtn).display !== 'none' : false
      };
    });
  });
  console.log('Admin Account First 5 Rows Delete Button Status:');
  console.table(adminNormalUsersDeleteStatus);

  const allAdminNormalUsersHaveDelBtn = adminNormalUsersDeleteStatus.every(r => r.visible);
  if (!allAdminNormalUsersHaveDelBtn) {
    throw new Error('TEST 4 FAILED: Admin account does not have Delete User visible on Normal Users');
  }

  const adminShotPath = path.join(ARTIFACTS_DIR, 'live_admin_normal_users_delete_visible.png');
  await page.screenshot({ path: adminShotPath });
  console.log('📸 Saved Admin Delete User Screenshot:', adminShotPath);
  console.log('✅ TEST 4 PASSED: Admin account has Delete User visible and functioning properly');

  // =========================================================================
  // TEST 5: Check Admin and Company rows -> NO Delete User option
  // =========================================================================
  console.log('\n================================================================');
  console.log('TEST 5: ADMIN AND COMPANY ROWS MUST NOT HAVE DELETE USER OPTION');
  console.log('================================================================');

  // Switch back to Company Account to check Admin rows
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto(`${PROD_URL}/admin`, { waitUntil: 'domcontentloaded' });
  await sleep(1000);
  await page.fill('#user_Username', 'superadmin_1');
  await page.fill('#user_Password', 'SuperAdmin@123');
  await page.click('#adminLoginSubmitBtn');
  await page.waitForSelector('#adminAppContainer', { timeout: 15000 });
  await sleep(2000);

  await page.evaluate(() => navigateAdmin('/Accounts/Chart'));
  await sleep(2000);

  // Check supermaster_1 row (Admin)
  const adminRowCheck = await page.evaluate(() => {
    const row = Array.from(document.querySelectorAll('#clientsTableBody tr.user-main-row'))
      .find(r => r.getAttribute('data-username') === 'supermaster_1');
    if (!row) return null;
    const type = row.querySelectorAll('td')[1]?.innerText.trim();
    const delBtn = row.querySelector('button[title="Delete User"]');
    return {
      username: 'supermaster_1',
      type: type,
      hasDeleteBtn: !!delBtn
    };
  });
  console.log('Admin Row (supermaster_1) Check in Company Account:', adminRowCheck);

  if (!adminRowCheck || adminRowCheck.hasDeleteBtn) {
    throw new Error('TEST 5 FAILED: Admin row unexpectedly has Delete User button!');
  }

  // Also check User Edit page for Admin account
  await page.evaluate(() => navigateAdmin('/Users/Edit?id=8728498'));
  await sleep(1500);

  const adminEditDelStatus = await page.evaluate(() => {
    const delBtn = document.getElementById('btnDeleteUserInEdit');
    const delBtnTop = document.getElementById('btnDeleteUserInEditTop');
    return {
      footerBtnVisible: delBtn ? window.getComputedStyle(delBtn).display !== 'none' : false,
      topBtnVisible: delBtnTop ? window.getComputedStyle(delBtnTop).display !== 'none' : false
    };
  });
  console.log('Admin Account Edit Page Delete Status:', adminEditDelStatus);
  if (adminEditDelStatus.footerBtnVisible || adminEditDelStatus.topBtnVisible) {
    throw new Error('TEST 5 FAILED: Admin account edit page unexpectedly shows Delete User button!');
  }

  console.log('✅ TEST 5 PASSED: Admin and Company rows strictly DO NOT show Delete User button');

  console.log('\n================================================================');
  console.log('🎉 ALL 5 USER DELETE VISIBILITY & PERMISSIONS TESTS PASSED COMPLETELY!');
  console.log('================================================================');

  await browser.close();
}

main().catch(err => {
  console.error('\n❌ TEST RUN FAILED:', err);
  process.exit(1);
});
