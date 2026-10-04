const authDb = require('../../lib/auth_db');
const { parseJsonBody, sendJson } = require('../../lib/http_util');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    return sendJson(res, 405, { status: 'error', message: 'Method not allowed' });
  }

  try {
    await authDb.hydrateUsersAsync();
    const body = await parseJsonBody(req);
    const { username, password } = body;

    const result = authDb.authenticate(username, password);
    if (!result.success) {
      const status = (result.reason === 'account_inactive' || result.reason === 'unsupported_auth_method') ? 403 : 401;
      return sendJson(res, status, { status: 'error', message: result.message, reason: result.reason }, {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
      });
    }

    await authDb.saveUsersToDiskAsync();
    const session = authDb.createSession(result.user);
    const redirectTo = authDb.getRedirectForRole(result.user.role);

    // Set secure HTTP-only cookie
    const cookieVal = `auth_token=${session.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`;

    return sendJson(res, 200, {
      status: 'success',
      token: session.token,
      user: authDb.sanitizeUser(result.user),
      redirectTo
    }, {
      'Set-Cookie': cookieVal,
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
    });
  } catch (err) {
    console.error('Login error:', err);
    return sendJson(res, 500, { status: 'error', message: 'Internal server error' });
  }
};
