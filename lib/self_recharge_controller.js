/**
 * Self Recharge Controller — Company Account Only
 * 
 * Provides secure backend balance management and audit trail for Company Account.
 * Strictly forbidden for Admin (HTTP 403).
 */

const authDb = require('./auth_db');
const { getRequestSession, sendJson, parseJsonBody } = require('./http_util');

// Memory deduplication cache for double-submission protection
const processedRequestIds = new Map();
const recentUserSubmissions = new Map();

// Housekeeping for in-memory deduplication caches every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, item] of processedRequestIds.entries()) {
    if (now - item.timestamp > 5 * 60 * 1000) processedRequestIds.delete(id);
  }
  for (const [key, ts] of recentUserSubmissions.entries()) {
    if (now - ts > 60 * 1000) recentUserSubmissions.delete(key);
  }
}, 10 * 60 * 1000).unref();

async function handleSelfRecharge(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Request, X-Admin-Token, X-Company-Key');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  // Hydrate users database from storage
  await authDb.hydrateUsersAsync();

  // 1. Resolve session
  let session = getRequestSession(req, authDb);
  const companyKey = req.headers['x-company-key'];
  if (!session && companyKey && authDb.verifyCompanyKey(companyKey)) {
    session = {
      role: authDb.ROLES.COMPANY,
      username: 'Company Account'
    };
  }

  if (!session) {
    return sendJson(res, 401, {
      status: 'unauthenticated',
      message: 'Authentication required. Please log in as Company Account.'
    });
  }

  // Normalize session user identity
  if (session && !session.id && session.userId) session.id = session.userId;
  if (session && !session.userId && session.id) session.userId = session.id;

  // 2. Strict Role Security: Company Account ONLY
  const isCompany = Boolean(
    session.role === authDb.ROLES.COMPANY ||
    session.role === authDb.ROLES.SUPER_ADMIN ||
    session.role === 'company' ||
    session.role === 'super_admin'
  );

  if (!isCompany) {
    return sendJson(res, 403, {
      status: 'error',
      message: 'Forbidden: Self Recharge is reserved exclusively for Company Account.'
    });
  }

  // Resolve target Company user record
  let targetUser = null;
  if (session.userId || session.id) {
    targetUser = authDb.getUserById(session.userId || session.id);
  }
  if (!targetUser) {
    targetUser = authDb.getUserByUsername(session.username);
  }
  if (!targetUser && (session.role === authDb.ROLES.COMPANY || session.role === 'company')) {
    targetUser = authDb.users.find(u => u.role === authDb.ROLES.COMPANY || u.role === 'company');
  }

  if (!targetUser) {
    return sendJson(res, 404, {
      status: 'error',
      message: 'Company Account record not found in system database.'
    });
  }

  // ----------------------------------------------------
  // GET: Fetch current balance & recharge history
  // ----------------------------------------------------
  if (req.method === 'GET') {
    const curBal = parseFloat(String(targetUser.balance || '0').replace(/[^0-9.-]/g, '')) || 0;
    const curAvail = parseFloat(String(targetUser.avail || targetUser.balance || '0').replace(/[^0-9.-]/g, '')) || 0;

    return sendJson(res, 200, {
      status: 'success',
      companyAccountId: targetUser.id,
      username: targetUser.username || targetUser.name || 'Company Account',
      balance: targetUser.balance || '0 Rs.',
      avail: targetUser.avail || targetUser.balance || '0 Rs.',
      numericBalance: curBal,
      numericAvail: curAvail,
      history: Array.isArray(targetUser.selfRechargeHistory) ? targetUser.selfRechargeHistory : []
    }, {
      'Cache-Control': 'no-store, no-cache, must-revalidate'
    });
  }

  // ----------------------------------------------------
  // POST: Execute Self Recharge
  // ----------------------------------------------------
  if (req.method === 'POST') {
    let body = {};
    try {
      body = await parseJsonBody(req);
    } catch (e) {
      return sendJson(res, 400, { status: 'error', message: 'Invalid JSON request payload' });
    }

    const { amount, note, requestId, idempotencyKey } = body;

    // Double-Submission Protection (by Client Request ID)
    const clientReqKey = requestId || idempotencyKey;
    if (clientReqKey && processedRequestIds.has(clientReqKey)) {
      const cached = processedRequestIds.get(clientReqKey);
      return sendJson(res, 200, cached.response);
    }

    // Validation: Empty / Zero / Negative / Non-numeric
    if (amount === undefined || amount === null || String(amount).trim() === '') {
      return sendJson(res, 400, { status: 'error', message: 'Recharge amount is required' });
    }

    const rawStr = String(amount).trim();
    if (!/^[0-9]+(\.[0-9]+)?$/.test(rawStr)) {
      return sendJson(res, 400, { status: 'error', message: 'Recharge amount must be a valid positive number' });
    }

    const cleanNum = parseFloat(rawStr);
    if (isNaN(cleanNum) || cleanNum <= 0) {
      return sendJson(res, 400, { status: 'error', message: 'Recharge amount must be greater than zero' });
    }

    // Double-Submission Protection (Rapid-click rate limit per user)
    const userRapidKey = `${targetUser.id}_${cleanNum}_${(note || '').trim()}`;
    const now = Date.now();
    if (recentUserSubmissions.has(userRapidKey)) {
      const lastTs = recentUserSubmissions.get(userRapidKey);
      if (now - lastTs < 2000) {
        return sendJson(res, 429, {
          status: 'error',
          message: 'Duplicate submission detected. Please wait a moment before trying again.'
        });
      }
    }
    recentUserSubmissions.set(userRapidKey, now);

    // Calculate updated authoritative balance
    const prevBal = parseFloat(String(targetUser.balance || '0').replace(/[^0-9.-]/g, '')) || 0;
    const prevAvail = parseFloat(String(targetUser.avail || targetUser.balance || '0').replace(/[^0-9.-]/g, '')) || 0;
    const newBal = prevBal + cleanNum;
    const newAvail = prevAvail + cleanNum;

    // Apply formatted balance
    targetUser.balance = `${newBal.toLocaleString('en-IN')} Rs.`;
    targetUser.avail = `${newAvail.toLocaleString('en-IN')} Rs.`;

    // Audit Transaction Record
    const tx = {
      id: 'tx_sr_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      transactionId: 'TXSR' + Date.now(),
      companyAccountId: targetUser.id,
      username: targetUser.username || targetUser.name || 'Company Account',
      type: 'SELF_RECHARGE',
      amount: cleanNum,
      previousBalance: prevBal,
      newBalance: newBal,
      note: (note || '').trim() || 'Company Account self recharge',
      timestamp: new Date().toISOString()
    };

    if (!Array.isArray(targetUser.transactions)) targetUser.transactions = [];
    targetUser.transactions.unshift(tx);

    if (!Array.isArray(targetUser.selfRechargeHistory)) targetUser.selfRechargeHistory = [];
    targetUser.selfRechargeHistory.unshift(tx);

    // Save persistently to multi-tier disk and cloud
    await authDb.saveUsersToDiskAsync();

    const responseData = {
      status: 'success',
      message: `Recharged successfully with Rs. ${cleanNum.toLocaleString('en-IN')}`,
      balance: targetUser.balance,
      avail: targetUser.avail,
      numericBalance: newBal,
      numericAvail: newAvail,
      previousBalance: prevBal,
      newBalance: newBal,
      transaction: tx,
      history: targetUser.selfRechargeHistory
    };

    if (clientReqKey) {
      processedRequestIds.set(clientReqKey, {
        timestamp: Date.now(),
        response: responseData
      });
    }

    return sendJson(res, 200, responseData);
  }

  return sendJson(res, 405, { status: 'error', message: 'Method not allowed' });
}

module.exports = handleSelfRecharge;
