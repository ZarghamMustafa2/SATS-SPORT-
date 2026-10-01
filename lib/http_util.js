// HTTP Utilities for API endpoints

async function parseJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return new Promise((resolve) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function getCookie(req, name) {
  const cookieHeader = req.headers.cookie || '';
  const match = cookieHeader.match(new RegExp('(^|;\\s*)' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[2]) : null;
}

function getRequestSession(req, authDb) {
  let token = null;
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  }
  if (!token) {
    token = getCookie(req, 'auth_token');
  }
  if (token && token !== 'bypass_admin_token' && token !== 'bypass_company_token') {
    const session = authDb.getSession(token);
    if (session) return session;
  }
  // TEMPORARY ADMIN ACCESS: Provide admin bypass session for admin operations
  if (authDb && authDb.BYPASS_ADMIN_AUTH) {
    const isCompanyRole = (token === 'bypass_company_token') || (req.headers['x-admin-role'] === 'company');
    const isExplicitBypassToken = (token === 'bypass_admin_token') || isCompanyRole;
    const isAdminEndpoint = req.url && req.url.toLowerCase().includes('/api/admin');
    const isExplicitAdminHeader = req.headers['x-admin-request'] === 'true';
    if (isExplicitBypassToken || isAdminEndpoint || isExplicitAdminHeader) {
      return authDb.getBypassAdminSession(isCompanyRole ? authDb.ROLES.COMPANY : null);
    }
  }
  return null;
}

function sendJson(res, statusCode, data, headers = {}) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  for (const [k, v] of Object.entries(headers)) {
    res.setHeader(k, v);
  }
  res.end(JSON.stringify(data));
}

module.exports = {
  parseJsonBody,
  getCookie,
  getRequestSession,
  sendJson
};
