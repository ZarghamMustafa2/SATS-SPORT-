const authDb = require('../../../lib/auth_db');
const { parseJsonBody, getRequestSession, sendJson } = require('../../../lib/http_util');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'POST') {
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
    const body = await parseJsonBody(req);
    const { targetUserId } = body;

    const updatedUser = authDb.toggleUserStatus({
      requesterUser: session,
      targetUserId
    });

    return sendJson(res, 200, {
      status: 'success',
      message: `User ${updatedUser.username} is now ${updatedUser.status}`,
      user: updatedUser
    });
  } catch (err) {
    const statusCode = err.statusCode || 400;
    return sendJson(res, statusCode, { status: 'error', message: err.message });
  }
};
