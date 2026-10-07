const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE_URL = process.env.BASE_URL || 'https://satsportco.vercel.app';
const ARTIFACTS_DIR = 'C:\\Users\\NEW PC TECH\\.gemini\\antigravity\\brain\\18b5e61b-2c45-401f-9613-7c2e2081b00b';

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function run() {
    console.log('================================================================');
    console.log('Starting Production Verification for Role-Scoped Users List...');
    console.log('Target URL:', BASE_URL);
    console.log('================================================================');

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();

    try {
        // =====================================================================
        // TEST 1: Login as Company Account.
        // Expected: Only Admin accounts visible. Normal Users = ZERO visible.
        // =====================================================================
        console.log('\n--- TEST 1: Company Account Users View ---');
        await page.goto(`${BASE_URL}/admin`, { waitUntil: 'domcontentloaded' });
        await sleep(1000);
        
        // Login as Company Account
        await page.fill('#user_Username', 'superadmin_1');
        await page.fill('#user_Password', 'SuperAdmin@123');
        await page.click('#adminLoginSubmitBtn');
        await page.waitForSelector('#adminAppContainer', { timeout: 15000 });
        await sleep(2000);

        // Navigate to Users
        await page.evaluate(() => navigateAdmin('/Accounts/Chart'));
        await sleep(2000);

        // Take screenshot of Company Account Users list
        const shot1Path = path.join(ARTIFACTS_DIR, 'live_company_admin_accounts_only.png');
        await page.screenshot({ path: shot1Path, fullPage: false });
        console.log('Saved screenshot:', shot1Path);

        // Verify rows in Company Account table
        const companyRows = await page.$$eval('#clientsTableBody tr.user-main-row', rows => 
            rows.map(r => ({
                id: r.id.replace('row-', ''),
                username: r.getAttribute('data-username'),
                type: r.querySelector('td:nth-child(2)') ? r.querySelector('td:nth-child(2)').innerText.trim() : ''
            }))
        );
        console.log(`Company Account sees ${companyRows.length} accounts. Sample:`, companyRows.slice(0, 5));
        
        const hasNormalUserInCompany = companyRows.some(r => r.type.toLowerCase().includes('normal') || r.type.toLowerCase() === 'user');
        console.log('Has Normal User in Company Account view (must be false):', hasNormalUserInCompany);
        if (hasNormalUserInCompany) throw new Error('FAIL: Company Account sees Normal Users!');
        console.log('TEST 1 PASSED: Only Admin accounts visible in Company Account. Normal Users = 0.');

        // Verify Delete button is NOT present on Admin accounts in Company Account view
        const hasDeleteInCompany = await page.$eval('#clientsTableBody', tbody => tbody.innerHTML.includes('fa-trash-alt'));
        console.log('Has Delete User button in Company Account table (must be false):', hasDeleteInCompany);
        if (hasDeleteInCompany) throw new Error('FAIL: Delete User button visible in Company Account view!');

        // Verify Create Admin button IS visible
        const isCreateAdminVisible = await page.$eval('#btnCreateAdmin', el => window.getComputedStyle(el).display !== 'none');
        console.log('Create Admin button visible for Company Account (must be true):', isCreateAdminVisible);
        if (!isCreateAdminVisible) throw new Error('FAIL: Create Admin button is hidden for Company Account!');

        // =====================================================================
        // TEST 2: Create a new Admin.
        // Expected: New Admin appears in Company Account list.
        // =====================================================================
        console.log('\n--- TEST 2: Create New Admin under Company Account ---');
        const randNum = Math.floor(1000 + Math.random() * 9000);
        const testAdminUsername = `adm_test_${randNum}`;
        const testAdminPassword = 'AdminPass@123';

        await page.evaluate(() => navigateAdmin('/Users/Create'));
        await sleep(1500);

        await page.fill('#newUserName', testAdminUsername);
        await page.fill('#newUserPass', testAdminPassword);
        if (await page.$('#newUserConfirmPass')) {
            await page.fill('#newUserConfirmPass', testAdminPassword);
        }
        await page.click('#createUserSubmitBtn');
        await sleep(3000);

        // Verify newly created Admin is now in Company Account list
        await page.evaluate(() => navigateAdmin('/Accounts/Chart'));
        await sleep(2000);
        const afterCreateRows = await page.$$eval('#clientsTableBody tr.user-main-row', rows => 
            rows.map(r => r.getAttribute('data-username'))
        );
        console.log(`Checking if ${testAdminUsername} is in Company list:`, afterCreateRows.includes(testAdminUsername));
        if (!afterCreateRows.includes(testAdminUsername)) {
            throw new Error(`FAIL: Newly created admin ${testAdminUsername} not found in Company Account list!`);
        }
        console.log('TEST 2 PASSED: New Admin appears in Company Account list.');

        // =====================================================================
        // TEST 3: Login as that Admin. Open Users.
        // Expected: Normal Users appear (after Load Balance).
        // =====================================================================
        console.log(`\n--- TEST 3: Login as Admin (${testAdminUsername}) ---`);
        // Logout Company Account
        await page.evaluate(() => {
            if (typeof executeAdminLogout === 'function') executeAdminLogout(new Event('click'));
            else {
                localStorage.removeItem('admin_auth_token');
                localStorage.removeItem('admin_current_user');
                showLoginScreen();
            }
        });
        await sleep(2000);

        // Login as newly created Admin
        await page.fill('#user_Username', testAdminUsername);
        await page.fill('#user_Password', testAdminPassword);
        await page.click('#adminLoginSubmitBtn');
        await page.waitForSelector('#adminAppContainer', { timeout: 15000 });
        await sleep(2000);

        // Navigate to Users
        await page.evaluate(() => navigateAdmin('/Accounts/Chart'));
        await sleep(1000);

        // Initial state: details hidden until Load Balance
        const isHiddenInitially = await page.$eval('#tableLedger', t => t.classList.contains('balances-hidden'));
        console.log('Admin Users table initially hidden behind Load Balance:', isHiddenInitially);
        if (!isHiddenInitially) throw new Error('FAIL: Admin users table not hidden initially!');

        // Click Load Balance
        await page.click('#btnLoadBalance');
        await sleep(3000);

        // Take screenshot of Admin view
        const shot3Path = path.join(ARTIFACTS_DIR, 'live_admin_normal_users_only.png');
        await page.screenshot({ path: shot3Path, fullPage: false });
        console.log('Saved screenshot:', shot3Path);

        const adminRows = await page.$$eval('#clientsTableBody tr.user-main-row', rows => 
            rows.map(r => ({
                username: r.getAttribute('data-username'),
                type: r.querySelector('td:nth-child(2)') ? r.querySelector('td:nth-child(2)').innerText.trim() : ''
            }))
        );
        console.log(`Admin sees ${adminRows.length} Normal Users. Sample:`, adminRows.slice(0, 3));
        
        // Ensure Admin sees Normal Users and NO Admin / Company accounts
        const hasAdminInAdminView = adminRows.some(r => r.username === testAdminUsername || r.username === 'superadmin_1' || r.username === 'supermaster_1');
        console.log('Has Admin or Company account in Admin view (must be false):', hasAdminInAdminView);
        if (hasAdminInAdminView) throw new Error('FAIL: Admin view contains Admin or Company accounts!');

        // Ensure Delete User button IS present for Normal Users in Admin view
        const hasDeleteInAdmin = await page.$eval('#clientsTableBody', tbody => tbody.innerHTML.includes('fa-trash-alt'));
        console.log('Has Delete User button in Admin view (must be true):', hasDeleteInAdmin);
        if (!hasDeleteInAdmin) throw new Error('FAIL: Delete User button missing in Admin view!');
        console.log('TEST 3 PASSED: Admin sees Normal Users only with Delete option.');

        // =====================================================================
        // TEST 4: Register a new Normal User from User Website.
        // Expected: Appears in Admin -> Users; does NOT appear in Company Account.
        // =====================================================================
        console.log('\n--- TEST 4: Register New Normal User from User Website ---');
        const testUserNum = Math.floor(1000 + Math.random() * 9000);
        const testNormalUser = `test_norm_${testUserNum}`;

        const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: testNormalUser,
                password: 'UserPass@123',
                confirmPassword: 'UserPass@123',
                phone: '9876543210'
            })
        });
        const regData = await regRes.json();
        console.log('Registration status:', regRes.status, regData.status || regData.message);
        if (!regRes.ok && regData.status !== 'success') {
            throw new Error('Registration failed: ' + JSON.stringify(regData));
        }
        console.log(`Registered Normal User: ${testNormalUser}`);

        // Check in Admin page: reload balances
        await page.click('#btnLoadBalance');
        await sleep(3000);
        const adminUsersAfter = await page.$$eval('#clientsTableBody tr.user-main-row', rows => 
            rows.map(r => r.getAttribute('data-username'))
        );
        console.log(`Normal User ${testNormalUser} appears in Admin Users (must be true)?`, adminUsersAfter.includes(testNormalUser));
        if (!adminUsersAfter.includes(testNormalUser)) {
            throw new Error(`FAIL: Normal User ${testNormalUser} did not appear in Admin view!`);
        }

        // =====================================================================
        // TEST 5 & TEST 6: Search Scoping.
        // =====================================================================
        console.log('\n--- TEST 6: Admin Searches Normal User & Admin User ---');
        // Admin searches Normal User
        await page.evaluate(u => {
            const input = document.getElementById('usersListSearchInput');
            if (input) {
                input.value = u;
                filterClientsList(u);
            }
        }, testNormalUser);
        await sleep(1500);
        let visibleRows = await page.$$eval('#clientsTableBody tr.user-main-row:not([style*="display: none"])', rows => 
            rows.map(r => r.getAttribute('data-username'))
        );
        console.log(`Admin search for ${testNormalUser}:`, visibleRows);
        if (!visibleRows.includes(testNormalUser)) throw new Error('FAIL: Admin search could not find Normal User!');

        // Admin searches Admin user
        await page.evaluate(u => {
            const input = document.getElementById('usersListSearchInput');
            if (input) {
                input.value = u;
                filterClientsList(u);
            }
        }, testAdminUsername);
        await sleep(1500);
        visibleRows = await page.$$eval('#clientsTableBody tr.user-main-row:not([style*="display: none"])', rows => 
            rows.map(r => r.getAttribute('data-username'))
        );
        console.log(`Admin search for Admin ${testAdminUsername} (must be 0):`, visibleRows.length);
        if (visibleRows.length !== 0) throw new Error('FAIL: Admin search found Admin user!');
        console.log('TEST 6 PASSED: Admin search correctly finds Normal User and returns 0 for Admin.');

        // Now logout Admin and switch to Company Account to check TEST 4b & TEST 5
        console.log('\n--- TEST 5: Company Account Search & Normal User Absence ---');
        await page.evaluate(() => {
            if (typeof executeAdminLogout === 'function') executeAdminLogout(new Event('click'));
            else {
                localStorage.removeItem('admin_auth_token');
                localStorage.removeItem('admin_current_user');
                showLoginScreen();
            }
        });
        await sleep(2000);

        await page.fill('#user_Username', 'superadmin_1');
        await page.fill('#user_Password', 'SuperAdmin@123');
        await page.click('#adminLoginSubmitBtn');
        await page.waitForSelector('#adminAppContainer', { timeout: 15000 });
        await sleep(2000);

        await page.evaluate(() => navigateAdmin('/Accounts/Chart'));
        await sleep(2000);

        // TEST 4b: Ensure newly registered Normal User does NOT appear in Company Account
        const companyUsersAfter = await page.$$eval('#clientsTableBody tr.user-main-row', rows => 
            rows.map(r => r.getAttribute('data-username'))
        );
        console.log(`Normal User ${testNormalUser} in Company Account list (must be false)?`, companyUsersAfter.includes(testNormalUser));
        if (companyUsersAfter.includes(testNormalUser)) {
            throw new Error(`FAIL: Normal User ${testNormalUser} appeared in Company Account list!`);
        }
        console.log('TEST 4 PASSED: Normal user appears in Admin view, NOT in Company Account view.');

        // TEST 5: Company searches Normal User
        await page.evaluate(u => {
            const input = document.getElementById('usersListSearchInput');
            if (input) {
                input.value = u;
                filterClientsList(u);
            }
        }, testNormalUser);
        await sleep(1500);
        const compVisibleRows = await page.$$eval('#clientsTableBody tr.user-main-row:not([style*="display: none"])', rows => 
            rows.map(r => r.getAttribute('data-username'))
        );
        console.log(`Company search for Normal User ${testNormalUser} (must be 0):`, compVisibleRows.length);
        if (compVisibleRows.length !== 0) throw new Error('FAIL: Company search returned Normal User!');
        console.log('TEST 5 PASSED: Company Account search returns 0 results for Normal User.');

        // =====================================================================
        // TEST 7: Refresh & Role-based separation persistence.
        // =====================================================================
        console.log('\n--- TEST 7: Page Refresh & Persistence ---');
        await page.reload({ waitUntil: 'domcontentloaded' });
        await sleep(3000);

        // Company Account still sees Admin accounts directly
        const compAfterReload = await page.$$eval('#clientsTableBody tr.user-main-row', rows => 
            rows.map(r => r.getAttribute('data-username'))
        );
        console.log(`Company Account after reload sees ${compAfterReload.length} accounts:`, compAfterReload.includes(testAdminUsername));
        if (!compAfterReload.includes(testAdminUsername)) throw new Error('FAIL: Company Account lost Admins after reload!');
        console.log('TEST 7 PASSED: Role-based separation persists seamlessly across page reload.');

        console.log('\n=========================================');
        console.log('ALL 7 PRODUCTION TESTS PASSED SUCCESSFULLY!');
        console.log('=========================================\n');

    } finally {
        await browser.close();
    }
}

run().catch(err => {
    console.error('Test execution failed:', err);
    process.exit(1);
});
