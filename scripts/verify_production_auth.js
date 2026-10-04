const https = require('https');

const BASE_URL = process.env.VERCEL_URL || 'https://sats-sport.vercel.app';

function request(urlPath, options = {}) {
  return new Promise((resolve, reject) => {
    const fullUrl = new URL(urlPath, BASE_URL);
    const method = options.method || 'GET';
    const headers = options.headers || {};
    const body = options.body ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)) : null;

    if (body && !headers['content-type']) {
      headers['content-type'] = 'application/json';
    }
    if (body) {
      headers['content-length'] = Buffer.byteLength(body);
    }

    const req = https.request(fullUrl, { method, headers }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let parsed = null;
        try {
          parsed = JSON.parse(data);
        } catch (e) {
          parsed = data;
        }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: parsed
        });
      });
    });

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function runProductionTests() {
  console.log(`================================================================`);
  console.log(`RUNNING 10 LIVE PRODUCTION AUTHENTICATION & ADMIN INTEGRATION TESTS`);
  console.log(`Target: ${BASE_URL}`);
  console.log(`================================================================\n`);

  const timestamp = Date.now();
  const testUsername = `user_${timestamp}`;
  const testPassword = `SecurePass#${timestamp}`;

  let passed = 0;
  let failed = 0;
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function report(num, name, ok, details = '') {
    if (ok) {
      console.log(`✅ [PROD TEST ${num} PASS] ${name}`);
      if (details) console.log(`   ${details}`);
      passed++;
    } else {
      console.error(`❌ [PROD TEST ${num} FAIL] ${name}`);
      if (details) console.error(`   ${details}`);
      failed++;
    }
  }

  // TEST 1: Register brand new normal user
  let registeredUser = null;
  try {
    const res = await request('/api/auth/register', {
      method: 'POST',
      body: {
        username: testUsername,
        password: testPassword,
        confirmPassword: testPassword
      }
    });
    registeredUser = res.body?.user;
    report(1, 'POST /api/auth/register (New User Registration)',
      (res.statusCode === 200 || res.statusCode === 201) && res.body?.status === 'success' && registeredUser?.username?.toLowerCase() === testUsername.toLowerCase() && registeredUser?.role === 'user',
      `HTTP ${res.statusCode} | Username: ${registeredUser?.username} | Role: ${registeredUser?.role}`
    );
  } catch (err) {
    report(1, 'POST /api/auth/register', false, err.message);
  }

  // TEST 2: Verify user exists in Admin Downline API
  try {
    await sleep(350);
    const res = await request(`/api/admin/users?search=${encodeURIComponent(testUsername)}`, {
      headers: { 'x-admin-request': 'true' }
    });
    const foundUser = res.body?.users?.find(u => u.username?.toLowerCase() === testUsername.toLowerCase());
    report(2, 'GET /api/admin/users (Admin Downline Record Verification)',
      res.statusCode === 200 && foundUser && foundUser.role === 'user' && foundUser.status === 'active',
      `HTTP ${res.statusCode} | Found in DB: ${foundUser?.username} | Role: ${foundUser?.role} | Status: ${foundUser?.status} | Balance: ${foundUser?.balance}`
    );
  } catch (err) {
    report(2, 'GET /api/admin/users', false, err.message);
  }

  // TEST 3: Login with correct credentials
  let sessionToken = null;
  let setCookieHeader = null;
  try {
    await sleep(350);
    const res = await request('/api/auth/login', {
      method: 'POST',
      body: {
        username: testUsername,
        password: testPassword
      }
    });
    sessionToken = res.body?.token;
    const cookies = res.headers['set-cookie'] || [];
    setCookieHeader = Array.isArray(cookies) ? cookies.join('; ') : String(cookies);
    report(3, 'POST /api/auth/login (Correct Credentials Login)',
      res.statusCode === 200 && res.body?.status === 'success' && sessionToken && setCookieHeader.includes('HttpOnly'),
      `HTTP ${res.statusCode} | Token: ${sessionToken?.substring(0, 20)}... | HttpOnly Cookie: YES`
    );
  } catch (err) {
    report(3, 'POST /api/auth/login', false, err.message);
  }

  // TEST 4: Login with incorrect password
  try {
    await sleep(350);
    const res = await request('/api/auth/login', {
      method: 'POST',
      body: {
        username: testUsername,
        password: 'WrongPassword999!'
      }
    });
    report(4, 'POST /api/auth/login (Incorrect Password Rejection)',
      res.statusCode === 401 && res.body?.message === 'Invalid username or password.',
      `HTTP ${res.statusCode} | Error Message: "${res.body?.message}" (No username enumeration)`
    );
  } catch (err) {
    report(4, 'POST /api/auth/login (Incorrect Password)', false, err.message);
  }

  // TEST 5: Verify session persistence / identity on GET /api/auth/me
  try {
    await sleep(350);
    const res = await request('/api/auth/me', {
      headers: { 'authorization': `Bearer ${sessionToken}` }
    });
    const b = res.body;
    const noSecrets = !b?.passwordHash && !b?.passwordSalt && !b?.user?.passwordHash;
    report(5, 'GET /api/auth/me (Session Verification & Safe Profile Details)',
      res.statusCode === 200 && b?.status === 'success' && b?.username?.toLowerCase() === testUsername.toLowerCase() && noSecrets,
      `HTTP ${res.statusCode} | Username: ${b?.username} | UserId: ${b?.userId} | Role: ${b?.role} | Balance: ${b?.balance} | Exposure: ${b?.exposure} | Available: ${b?.availableBalance} | Secrets Exposed: NO`
    );
  } catch (err) {
    report(5, 'GET /api/auth/me', false, err.message);
  }

  // TEST 6: Unauthenticated request rejection
  try {
    await sleep(350);
    const res = await request('/api/auth/me');
    report(6, 'GET /api/auth/me without session (Unauthenticated Request Check)',
      res.statusCode === 401,
      `HTTP ${res.statusCode} | Rejected as unauthenticated: YES`
    );
  } catch (err) {
    report(6, 'Unauthenticated check', false, err.message);
  }

  // TEST 7: Logout authenticated user
  try {
    await sleep(350);
    const res = await request('/api/auth/logout', {
      method: 'POST',
      headers: { 'authorization': `Bearer ${sessionToken}` }
    });
    const cookies = res.headers['set-cookie'] || [];
    const cookieStr = Array.isArray(cookies) ? cookies.join('; ') : String(cookies);
    report(7, 'POST /api/auth/logout (Logout Session & Clear Cookie)',
      res.statusCode === 200 && res.body?.status === 'success' && (cookieStr.includes('Max-Age=0') || cookieStr.includes('auth_token=;')),
      `HTTP ${res.statusCode} | Status: ${res.body?.status} | Set-Cookie Cleared: YES`
    );
  } catch (err) {
    report(7, 'POST /api/auth/logout', false, err.message);
  }

  // TEST 8: Verify old session is invalidated after logout
  try {
    await sleep(350);
    const res = await request('/api/auth/me', {
      headers: { 'authorization': `Bearer ${sessionToken}` }
    });
    report(8, 'GET /api/auth/me with Revoked Token (Session Invalidation Verification)',
      res.statusCode === 401,
      `HTTP ${res.statusCode} | Old session rejected: YES`
    );
  } catch (err) {
    report(8, 'Session invalidation check', false, err.message);
  }

  // TEST 9: Duplicate username registration (case-insensitive test)
  try {
    await sleep(350);
    const uppercaseUsername = testUsername.toUpperCase();
    const res = await request('/api/auth/register', {
      method: 'POST',
      body: {
        username: uppercaseUsername,
        password: testPassword,
        confirmPassword: testPassword
      }
    });
    report(9, 'POST /api/auth/register (Case-Insensitive Duplicate Username Rejection)',
      res.statusCode === 409 && res.body?.message === 'This username is already registered. Please choose another username.',
      `HTTP ${res.statusCode} | Error Message: "${res.body?.message}"`
    );
  } catch (err) {
    report(9, 'Duplicate username check', false, err.message);
  }

  // TEST 10: Verify lastLogin timestamp in Admin Panel
  try {
    await sleep(350);
    const res = await request(`/api/admin/users?search=${encodeURIComponent(testUsername)}`, {
      headers: { 'x-admin-request': 'true' }
    });
    const foundUser = res.body?.users?.find(u => u.username?.toLowerCase() === testUsername.toLowerCase());
    const hasLastLogin = Boolean(foundUser && foundUser.lastLogin);
    report(10, 'GET /api/admin/users (Verify lastLogin Timestamp in Database Record)',
      res.statusCode === 200 && hasLastLogin,
      `HTTP ${res.statusCode} | User: ${foundUser?.username} | lastLogin: ${foundUser?.lastLogin}`
    );
  } catch (err) {
    report(10, 'lastLogin timestamp check', false, err.message);
  }

  console.log(`\n================================================================`);
  console.log(`FINAL PRODUCTION SUMMARY: ${passed} PASSED, ${failed} FAILED (TOTAL 10)`);
  console.log(`================================================================\n`);

  if (failed > 0) process.exit(1);
}

runProductionTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
