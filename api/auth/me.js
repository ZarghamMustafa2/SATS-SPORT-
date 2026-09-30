const authDb = require('../../lib/auth_db');
const { getRequestSession, sendJson } = require('../../lib/http_util');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'GET') {
    return sendJson(res, 405, { status: 'error', message: 'Method not allowed' });
  }

  const session = getRequestSession(req, authDb);
  if (!session) {
    return sendJson(res, 401, { status: 'unauthenticated', message: 'Not authenticated' });
  }

  const user = authDb.getUserById(session.userId);
  if (!user || user.status !== 'active') {
    return sendJson(res, 401, { status: 'unauthenticated', message: 'Session expired or user inactive' });
  }

  return sendJson(res, 200, {
    status: 'success',
    user: authDb.sanitizeUser(user),
    redirectTo: authDb.getRedirectForRole(user.role)
  });
};
