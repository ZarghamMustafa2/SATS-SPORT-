const authDb = require('../../lib/auth_db');
const { getCookie, sendJson } = require('../../lib/http_util');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  let token = null;
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  }
  if (!token) {
    token = getCookie(req, 'auth_token');
  }

  if (token) {
    authDb.destroySession(token);
  }

  const clearCookie = 'auth_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0';
  return sendJson(res, 200, {
    status: 'success',
    message: 'Logged out successfully'
  }, { 'Set-Cookie': clearCookie });
};
