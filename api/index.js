const url = require('url');

const loginHandler = require('./auth/login');
const registerHandler = require('./auth/register');
const meHandler = require('./auth/me');
const logoutHandler = require('./auth/logout');
const createUserHandler = require('./admin/users/create');
const companyCreateSuperAdminHandler = require('./admin/company/create-super-admin');
const statusUserHandler = require('./admin/users/status');
const listUsersHandler = require('./admin/users/index');
const sportbexHandler = require('./sportbex/cricket/live');
const whatsappSettingsHandler = require('./settings/whatsapp');

module.exports = async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Company-Key, X-Admin-Request, sportbex-api-key');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const parsed = url.parse(req.url, true);
  const pathname = (parsed.pathname || '').toLowerCase().replace(/\/+$/, '');

  if (pathname === '/api/auth/login') return loginHandler(req, res);
  if (pathname === '/api/auth/register') return registerHandler(req, res);
  if (pathname === '/api/auth/me') return meHandler(req, res);
  if (pathname === '/api/auth/logout') return logoutHandler(req, res);
  if (pathname === '/api/admin/company/create-super-admin') return companyCreateSuperAdminHandler(req, res);
  if (pathname === '/api/admin/users/create') return createUserHandler(req, res);
  if (pathname === '/api/admin/users/status') return statusUserHandler(req, res);
  if (pathname === '/api/admin/users') return listUsersHandler(req, res);
  if (pathname === '/api/settings/whatsapp' || pathname === '/api/admin/settings/whatsapp') return whatsappSettingsHandler(req, res);
  if (pathname === '/api/sportbex/cricket/live') return sportbexHandler(req, res);

  res.statusCode = 404;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ status: 'error', message: 'API route not found' }));
};
