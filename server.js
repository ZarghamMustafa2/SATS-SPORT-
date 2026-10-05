/**
 * SatsSport Standalone Backend & Shubdx Egress Proxy Server
 * Deployable on any Linux VPS, Docker container, or Cloud VM with a Fixed Public IP.
 * Zero external dependencies - uses Node.js standard runtime.
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

// Environment Configuration
const PORT = parseInt(process.env.PORT || '4000', 10);
const HOST = process.env.HOST || '0.0.0.0';
const SHUBDX_BASE_URL = process.env.SHUBDX_API_BASE_URL || process.env.SHUBDX_BASE_URL || 'https://shubdxinternational.com';
const SHUBDX_API_KEY = process.env.SHUBDX_API_KEY || '';
const SHUBDX_SERVER_MODE = process.env.SHUBDX_SERVER_MODE || 'standalone';

// Import Shared Library Handlers
const shubdx = require('./lib/shubdx');
const authDb = require('./lib/auth_db');
const { sendJson, parseJsonBody, getRequestSession } = require('./lib/http_util');

// Route Handlers from /api
const sportsHandler = require('./api/sports/index');
const betsHandler = require('./api/bets/index');
const authLoginHandler = require('./api/auth/login');
const authLogoutHandler = require('./api/auth/logout');
const authMeHandler = require('./api/auth/me');
const authRegisterHandler = require('./api/auth/register');
const adminUsersHandler = require('./api/admin/users/index');
const adminUsersCreateHandler = require('./api/admin/users/create');
const adminCompanyHandler = require('./api/admin/company/create-super-admin');
const settingsWhatsappHandler = require('./api/settings/whatsapp');
const sportbexLiveHandler = require('./api/sportbex/cricket/live');
const paymentsHandler = require('./api/payments/index');

// MIME types dictionary for static file serving
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.webp': 'image/webp'
};

const server = http.createServer(async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Request, X-Requested-With');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // Log incoming API requests
  if (pathname.startsWith('/api/')) {
    console.log(`[${new Date().toISOString()}] ${req.method} ${pathname}${parsedUrl.search}`);
  }

  // 1. HEALTH CHECKS
  if (pathname === '/api/health') {
    return sendJson(res, 200, {
      status: 'ok',
      service: 'SatsSport Fixed-IP Egress Gateway',
      version: '3.1.0',
      uptime: process.uptime(),
      serverMode: SHUBDX_SERVER_MODE,
      hasApiKeyConfigured: Boolean(SHUBDX_API_KEY),
      timestamp: new Date().toISOString()
    });
  }

  if (pathname === '/api/shubdx/health') {
    try {
      const healthData = await shubdx.checkHealth();
      return sendJson(res, 200, healthData);
    } catch (err) {
      return sendJson(res, 500, {
        status: 'error',
        message: err.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  // 2. SPORTS & SHUBDX GATEWAY
  if (pathname.startsWith('/api/sports')) {
    return sportsHandler(req, res);
  }

  // 3. BETTING & SETTLEMENTS
  if (pathname.startsWith('/api/bets')) {
    return betsHandler(req, res);
  }

  // 4. AUTHENTICATION
  if (pathname === '/api/auth/login') return authLoginHandler(req, res);
  if (pathname === '/api/auth/logout') return authLogoutHandler(req, res);
  if (pathname === '/api/auth/me') return authMeHandler(req, res);
  if (pathname === '/api/auth/register') return authRegisterHandler(req, res);

  // 5. ADMIN & MANAGEMENT
  if (pathname === '/api/admin/users/create') return adminUsersCreateHandler(req, res);
  if (pathname.startsWith('/api/admin/users')) return adminUsersHandler(req, res);
  if (pathname === '/api/admin/company/create-super-admin') return adminCompanyHandler(req, res);
  if (pathname.startsWith('/api/settings/whatsapp') || pathname.startsWith('/api/admin/settings/whatsapp')) {
    return settingsWhatsappHandler(req, res);
  }

  // 6. PAYMENTS (MANUAL DEPOSIT & WITHDRAWAL)
  if (pathname.startsWith('/api/payments')) {
    return paymentsHandler(req, res);
  }

  // 6. LEGACY FEED
  if (pathname.startsWith('/api/sportbex/cricket/live')) {
    return sportbexLiveHandler(req, res);
  }

  // 7. ADMIN PANEL ROUTE
  const lowerPath = pathname.toLowerCase();
  if (lowerPath === '/admin' || lowerPath.startsWith('/admin/')) {
    const adminPath = path.join(__dirname, 'admin.html');
    if (fs.existsSync(adminPath)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return fs.createReadStream(adminPath).pipe(res);
    }
  }

  // 8. STATIC FILES & USER WEBSITE
  let filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);
  
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    return fs.createReadStream(filePath).pipe(res);
  }

  // Fallback to index.html for SPA routes
  const indexPath = path.join(__dirname, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return fs.createReadStream(indexPath).pipe(res);
  }

  res.statusCode = 404;
  res.end('Not Found');
});

server.listen(PORT, HOST, async () => {
  console.log(`=======================================================`);
  console.log(`🚀 SatsSport Fixed-IP Egress Server running!`);
  console.log(`📍 Listening on: http://${HOST}:${PORT}`);
  console.log(`⚙️  Server Mode: ${SHUBDX_SERVER_MODE}`);
  console.log(`🔗 Upstream Shubdx URL: ${SHUBDX_BASE_URL}`);
  console.log(`🔑 Shubdx API Key Configured: ${Boolean(SHUBDX_API_KEY) ? 'YES' : 'NO'}`);
  console.log(`🩺 Health check: http://${HOST}:${PORT}/api/health`);
  console.log(`📡 Shubdx probe: http://${HOST}:${PORT}/api/shubdx/health`);

  // Detect and log public egress IP on startup
  try {
    const ip = await shubdx.detectPublicEgressIp();
    console.log(`🌐 Public Egress IP detected: ${ip || 'Unknown'}`);
    console.log(`👉 Whitelist this IP in Shubdx Portal: ${ip || 'Server IP'}`);
  } catch (e) {
    console.warn(`Could not auto-detect public egress IP on start:`, e.message);
  }
  console.log(`=======================================================`);
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  server.close(() => process.exit(0));
});
process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down gracefully...');
  server.close(() => process.exit(0));
});
