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
  const isAdminRequest = (
    req.headers['x-admin-request'] === 'true' ||
    req.headers['X-Admin-Request'] === 'true' ||
    Boolean(req.headers['x-admin-token'] || req.headers['X-Admin-Token']) ||
    (req.url && (req.url.startsWith('/api/admin/') || req.url.startsWith('/api/admin') || req.url.includes('/api/admin')))
  );

  let token = null;

  // 1. If explicit admin token header is sent, prioritize it for admin endpoints
  const explicitAdminToken = req.headers['x-admin-token'] || req.headers['X-Admin-Token'];
  if (explicitAdminToken) {
    token = explicitAdminToken.trim();
  }

  // 2. Authorization header
  if (!token) {
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    }
  }

  // 3. Cookie extraction: prioritize admin cookie for admin endpoints
  if (!token) {
    if (isAdminRequest) {
      token = getCookie(req, 'admin_auth_token');
    } else {
      token = getCookie(req, 'auth_token');
    }
  }

  // If token is bypass admin token
  if (token === 'bypass_admin_token' && authDb && authDb.BYPASS_ADMIN_AUTH) {
    return authDb.getBypassAdminSession ? authDb.getBypassAdminSession() : null;
  }

  if (token) {
    const session = authDb.getSession(token);
    if (session) {
      // If this is an admin request and the session is an admin role, return it immediately
      if (!isAdminRequest || session.role !== authDb.ROLES.USER) {
        return session;
      }

      // If this is an admin request but session is a NORMAL USER:
      // Check if an explicit admin token or admin cookie is ALSO present in the request
      const adminCookie = getCookie(req, 'admin_auth_token');
      if (adminCookie && adminCookie !== token) {
        if (adminCookie === 'bypass_admin_token' && authDb && authDb.BYPASS_ADMIN_AUTH) {
          return authDb.getBypassAdminSession();
        }
        const adminSession = authDb.getSession(adminCookie);
        if (adminSession && adminSession.role !== authDb.ROLES.USER) {
          return adminSession;
        }
      }

      // Otherwise, return the normal user session (which will be rejected with 403 Forbidden by the admin endpoint!)
      return session;
    }
  }

  // TEMPORARY ADMIN ACCESS: Provide super admin bypass session for explicit admin operations
  if (authDb && authDb.BYPASS_ADMIN_AUTH && token === 'bypass_admin_token') {
    return authDb.getBypassAdminSession();
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
