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
        try { parsed = JSON.parse(data); } catch (e) { parsed = data; }
        resolve({ statusCode: res.statusCode, headers: res.headers, body: parsed });
      });
    });

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function runSecurityAudit() {
  console.log('================================================================');
  console.log('ROLE & PERMISSION HIERARCHY SECURITY AUDIT');
  console.log(`Target: ${BASE_URL}`);
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function report(num, name, ok, details = '') {
    if (ok) {
      console.log(`✅ [SECURITY TEST ${num} PASS] ${name}`);
      if (details) console.log(`   ${details}`);
      passed++;
    } else {
      console.log(`❌ [SECURITY TEST ${num} FAIL] ${name}`);
      if (details) console.log(`   ${details}`);
      failed++;
    }
  }

  // 1. First, authenticate as Normal User (user_1)
  let normalUserToken = null;
  try {
    const loginRes = await request('/api/auth/login', {
      method: 'POST',
      body: { username: 'user_1', password: 'User@123' }
    });
    normalUserToken = loginRes.body?.token;
  } catch (e) {}

  // TEST 1: Unauthenticated request to GET /api/admin/users
  try {
    const res = await request('/api/admin/users');
    report(1, 'Direct Unauthenticated Access to GET /api/admin/users',
      res.statusCode === 403 || res.statusCode === 401,
      `HTTP ${res.statusCode} | Access Denied: YES`
    );
  } catch (e) {
    report(1, 'Direct Unauthenticated Access', false, e.message);
  }

  // TEST 2: Normal User attempting to access Admin Users API (GET /api/admin/users)
  try {
    const res = await request('/api/admin/users', {
      headers: normalUserToken ? { 'authorization': `Bearer ${normalUserToken}` } : {}
    });
    report(2, 'Normal User Access to GET /api/admin/users',
      res.statusCode === 403,
      `HTTP ${res.statusCode} | Error Message: "${res.body?.message}"`
    );
  } catch (e) {
    report(2, 'Normal User Access to Admin API', false, e.message);
  }

  // TEST 3: Normal User attempting to create Admin Users (POST /api/admin/users/create)
  try {
    const res = await request('/api/admin/users/create', {
      method: 'POST',
      headers: normalUserToken ? { 'authorization': `Bearer ${normalUserToken}` } : {},
      body: { username: 'hacker_sa', password: 'HackerPass@123', role: 'super_admin' }
    });
    report(3, 'Normal User Access to POST /api/admin/users/create',
      res.statusCode === 403,
      `HTTP ${res.statusCode} | Error Message: "${res.body?.message}"`
    );
  } catch (e) {
    report(3, 'Normal User Access to User Creation', false, e.message);
  }

  // TEST 4: Normal User attempting to reset someone else's password via POST /api/admin/users
  try {
    const res = await request('/api/admin/users', {
      method: 'POST',
      headers: normalUserToken ? { 'authorization': `Bearer ${normalUserToken}` } : {},
      body: { action: 'reset_password', userId: '8764246', newPassword: 'HackedPassword@123' }
    });
    report(4, 'Normal User Privilege Escalation Attempt (Reset Admin Password)',
      res.statusCode === 403 || res.statusCode === 401,
      `HTTP ${res.statusCode} | Rejection Message: "${res.body?.message}"`
    );
  } catch (e) {
    report(4, 'Normal User Privilege Escalation Attempt', false, e.message);
  }

  // TEST 5: Company Account credential login rejection (Root Company Account has strictly NO password)
  try {
    const res = await request('/api/auth/login', {
      method: 'POST',
      body: { username: 'Company', password: 'AnyPassword@123' }
    });
    report(5, 'Company Account Credential Login Rejection (Strict Root Protection)',
      res.statusCode === 403 || res.statusCode === 401,
      `HTTP ${res.statusCode} | Rejection Message: "${res.body?.message}"`
    );
  } catch (e) {
    report(5, 'Company Account Login Rejection', false, e.message);
  }

  console.log('\n================================================================');
  console.log(`SECURITY SUMMARY: ${passed} PASSED, ${failed} FAILED (TOTAL ${passed + failed})`);
  console.log('================================================================\n');

  if (failed > 0) process.exit(1);
}

runSecurityAudit().catch(err => {
  console.error(err);
  process.exit(1);
});
