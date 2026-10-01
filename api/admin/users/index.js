const authDb = require('../../../lib/auth_db');
const { getRequestSession, sendJson } = require('../../../lib/http_util');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Request, X-Admin-Role, X-Company-Key');

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
    return sendJson(res, 401, { status: 'error', message: 'Authentication required' });
  }

  if (session.role === authDb.ROLES.USER) {
    return sendJson(res, 403, { status: 'error', message: 'Access denied: Administrator privileges required' });
  }

  try {
    const downline = authDb.getDownlineUsers(session);
    return sendJson(res, 200, {
      status: 'success',
      currentUser: authDb.sanitizeUser(authDb.getUserById(session.userId)),
      users: downline
    });
  } catch (err) {
    console.error('List users error:', err);
    return sendJson(res, 500, { status: 'error', message: 'Internal server error' });
  }
};
