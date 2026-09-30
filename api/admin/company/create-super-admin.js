const authDb = require('../../../lib/auth_db');
const { parseJsonBody, sendJson } = require('../../../lib/http_util');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Company-Key');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    return sendJson(res, 405, { status: 'error', message: 'Method not allowed' });
  }

  // Verify Company Administrative Key
  const companyKey = req.headers['x-company-key'] || (req.headers.authorization && req.headers.authorization.startsWith('Key ') ? req.headers.authorization.slice(4).trim() : null);

  if (!companyKey || !authDb.verifyCompanyKey(companyKey)) {
    return sendJson(res, 403, { status: 'error', message: 'Access denied: Valid Company Master Key required' });
  }

  try {
    const body = await parseJsonBody(req);
    const { username, password, phone, reference, ...extra } = body;

    const newSuperAdmin = authDb.createSuperAdminByCompany({
      username,
      password,
      phone,
      reference,
      extra
    });

    return sendJson(res, 201, {
      status: 'success',
      message: 'Super Admin created successfully by Company Account',
      user: newSuperAdmin
    });
  } catch (err) {
    const statusCode = err.statusCode || 400;
    return sendJson(res, statusCode, { status: 'error', message: err.message });
  }
};
