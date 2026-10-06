const authDb = require('../../../lib/auth_db');
const { parseJsonBody, getRequestSession, sendJson } = require('../../../lib/http_util');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Company-Key, X-Admin-Request, X-Admin-Token');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    return sendJson(res, 405, { status: 'error', message: 'Method not allowed' });
  }

  await authDb.hydrateUsersAsync();

  // Authorize via user session or Root Company Master Key
  let requester = getRequestSession(req, authDb);
  const companyKey = req.headers['x-company-key'] || (req.headers.authorization && req.headers.authorization.startsWith('Key ') ? req.headers.authorization.slice(4).trim() : null);

  if (!requester && companyKey) {
    if (authDb.verifyCompanyKey(companyKey)) {
      requester = {
        userId: 'usr_company_001',
        id: 'usr_company_001',
        name: 'Company Account',
        role: authDb.ROLES.COMPANY,
        status: 'active'
      };
    } else {
      return sendJson(res, 403, { status: 'error', message: 'Invalid Company Administrative Key' });
    }
  }

  if (!requester) {
    return sendJson(res, 401, { status: 'error', message: 'Authentication required' });
  }

  try {
    const body = await parseJsonBody(req);
    const { username, password, role, ...extra } = body;
    const newAdmin = authDb.createAdminUser({
      requesterUser: requester,
      username,
      password,
      role,
      extra
    });
    await authDb.saveUsersToDiskAsync();

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
