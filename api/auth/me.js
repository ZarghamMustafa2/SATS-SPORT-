const authDb = require('../../lib/auth_db');
const { getRequestSession, sendJson } = require('../../lib/http_util');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Request, X-Admin-Token');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'GET') {
    return sendJson(res, 405, { status: 'error', message: 'Method not allowed' });
  }

  await authDb.hydrateUsersAsync();

  const session = getRequestSession(req, authDb);
  if (!session) {
    return sendJson(res, 401, { status: 'unauthenticated', message: 'Not authenticated' });
  }

  const user = authDb.getUserById(session.userId);
  if (!user || user.status !== 'active') {
    return sendJson(res, 401, { status: 'unauthenticated', message: 'Session expired or user inactive' });
  }

  const sanitized = authDb.sanitizeUser(user);
  return sendJson(res, 200, {
    status: 'success',
    username: user.username,
    userId: user.id,
    role: user.role,
    roleLabel: authDb.ROLE_LABELS[user.role] || user.role,
    roleDisplay: authDb.ROLE_LABELS[user.role] || user.role,
    userStatus: user.status,
    balance: user.balance || '0 Rs.',
    dummyBalance: sanitized.dummyBalance !== undefined ? sanitized.dummyBalance : 0,
    exposure: user.exp || user.exposure || '0 Rs.',
    availableBalance: user.avail || user.availableBalance || user.balance || '0 Rs.',
    lastLogin: user.lastLogin || null,
    createdAt: user.createdAt || null,
    user: {
      ...sanitized,
      userId: user.id,
      status: user.status,
      exposure: sanitized.exp || sanitized.exposure || '0 Rs.',
      availableBalance: sanitized.avail || sanitized.availableBalance || sanitized.balance || '0 Rs.'
    },
    redirectTo: authDb.getRedirectForRole(user.role)
  }, {
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
  });
};
