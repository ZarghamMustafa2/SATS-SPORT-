const authDb = require('../../../lib/auth_db');
const { parseJsonBody, getRequestSession, sendJson } = require('../../../lib/http_util');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Request, X-Company-Key');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  let session = getRequestSession(req, authDb);

  // Support Master Company Key in header if provided
  const companyKey = req.headers['x-company-key'];
  if (!session && companyKey && authDb.verifyCompanyKey(companyKey)) {
    session = {
      role: authDb.ROLES.COMPANY,
      username: 'Company Account'
    };
  }

  if (!session || session.role === authDb.ROLES.USER) {
    return sendJson(res, 403, { status: 'error', message: 'Access denied: Administrator privileges required' });
  }

  // GET: Fetch downline users
  if (req.method === 'GET') {
    try {
      await authDb.hydrateUsersAsync();
      const downline = authDb.getDownlineUsers(session);
      return sendJson(res, 200, {
        status: 'success',
        currentUser: authDb.sanitizeUser(authDb.getUserById(session.userId)),
        users: downline
      });
    } catch (err) {
      console.error('List users error:', err);
      return sendJson(res, 500, { status: 'error', message: 'Internal server error' });
    }
  }

  // POST: Dispatch between Finance (deposit, withdraw, credit) and Status (active/inactive)
  if (req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const { action, userId, targetUserId, amount, description } = body;
      const targetId = userId || targetUserId;

      // Status Toggle
      if (action === 'status' || (!action && targetUserId)) {
        if (!targetId) {
          return sendJson(res, 400, { status: 'error', message: 'targetUserId is required' });
        }
        const updatedUser = authDb.toggleUserStatus({
          requesterUser: session,
          targetUserId: targetId
        });
        await authDb.saveUsersToDiskAsync();
        return sendJson(res, 200, {
          status: 'success',
          message: `User ${updatedUser.username} is now ${updatedUser.status}`,
          user: updatedUser
        });
      }

      // Finance Operations
      if (action === 'deposit' || action === 'withdraw' || action === 'credit') {
        if (!targetId) {
          return sendJson(res, 400, { status: 'error', message: 'Target userId is required.' });
        }
        if (amount === undefined || amount === null || amount === '') {
          return sendJson(res, 400, { status: 'error', message: 'Amount is required.' });
        }

        const updatedUser = authDb.updateUserFinance({
          requesterUser: session,
          targetUserId: targetId,
          action,
          amount,
          description
        });
        await authDb.saveUsersToDiskAsync();

        const actionLabels = {
          deposit: 'Cash deposit completed successfully.',
          withdraw: 'Cash withdrawal completed successfully.',
          credit: 'Credit limit updated successfully.'
        };

        return sendJson(res, 200, {
          status: 'success',
          message: actionLabels[action] || 'Finance updated successfully.',
          user: updatedUser
        });
      }

      return sendJson(res, 400, { status: 'error', message: 'Invalid action specified.' });
    } catch (err) {
      const statusCode = err.statusCode || 400;
      return sendJson(res, statusCode, { status: 'error', message: err.message });
    }
  }

  return sendJson(res, 405, { status: 'error', message: 'Method not allowed' });
};
