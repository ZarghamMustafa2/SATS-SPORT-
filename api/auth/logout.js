const authDb = require('../../lib/auth_db');
const { getCookie, sendJson } = require('../../lib/http_util');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const isAdminLogout = (
    req.headers['x-admin-request'] === 'true' ||
    Boolean(req.headers['x-admin-token']) ||
    (req.url && (req.url.includes('admin') || req.url.includes('scope=admin')))
  );

  let token = null;
  const explicitAdmin = req.headers['x-admin-token'] || req.headers['X-Admin-Token'];
  if (explicitAdmin) {
    token = explicitAdmin.trim();
  }

  if (!token) {
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    }
  }

  if (!token) {
    token = isAdminLogout ? (getCookie(req, 'admin_auth_token') || getCookie(req, 'auth_token')) : getCookie(req, 'auth_token');
  }

  if (token && token !== 'bypass_admin_token') {
    if (authDb.destroySessionAsync) {
      await authDb.destroySessionAsync(token);
    } else {
      authDb.destroySession(token);
    }
  }

  const cookieName = isAdminLogout ? 'admin_auth_token' : 'auth_token';
  const clearCookie = `${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  return sendJson(res, 200, {
    status: 'success',
    message: 'Logged out successfully'
  }, {
    'Set-Cookie': clearCookie,
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
  });
};
