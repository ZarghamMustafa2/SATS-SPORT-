const authDb = require('../../../auth_db');
const { parseJsonBody, getRequestSession, sendJson } = require('../../../http_util');

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

  try {
    const body = await parseJsonBody(req);
    const { username, password, role, ...extra } = body;

    const newAdmin = authDb.createAdminUser({
      requesterUser: session,
      username,
      password,
      role,
      extra
    });

    return sendJson(res, 201, {
      status: 'success',
      message: `${authDb.ROLE_LABELS[role] || role} created successfully`,
      user: newAdmin
    });
  } catch (err) {
    const statusCode = err.statusCode || 400;
    return sendJson(res, statusCode, { status: 'error', message: err.message });
  }
};
