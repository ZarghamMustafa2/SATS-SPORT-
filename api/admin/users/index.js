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

  const urlObj = new URL(req.url, 'http://localhost');
  const searchParams = urlObj.searchParams;

  // GET: Fetch downline users or specific user details with search support
  if (req.method === 'GET') {
    try {
      await authDb.hydrateUsersAsync();

      const singleId = searchParams.get('id') || searchParams.get('userId');
      if (singleId) {
        const user = authDb.getUserById(singleId);
        if (!user) {
          return sendJson(res, 404, { status: 'error', message: 'User not found' });
        }
        return sendJson(res, 200, {
          status: 'success',
          user: authDb.sanitizeUser(user),
          bets: authDb.getUserBets(singleId)
        });
      }

      let downline = authDb.getDownlineUsers(session);

      // Backend Database Search by Username or User ID
      const query = (searchParams.get('search') || searchParams.get('q') || '').trim().toLowerCase();
      if (query) {
        downline = downline.filter(u => {
          const matchU = u.username && u.username.toLowerCase().includes(query);
          const matchId = u.id && String(u.id).toLowerCase().includes(query);
          return matchU || matchId;
        });
      }

      return sendJson(res, 200, {
        status: 'success',
        currentUser: authDb.sanitizeUser(authDb.getUserById(session.userId)),
        totalUsers: downline.length,
        users: downline
      });
    } catch (err) {
      console.error('List users error:', err);
      return sendJson(res, 500, { status: 'error', message: 'Internal server error' });
    }
  }

  // POST: Dispatch between Password Reset, User Edit, Status Toggle, and Finance
  if (req.method === 'POST') {
    try {
      await authDb.hydrateUsersAsync();
      const body = await parseJsonBody(req);
      const { action, userId, targetUserId, newPassword, password, amount, description } = body;
      const targetId = userId || targetUserId;

      if (!targetId) {
        return sendJson(res, 400, { status: 'error', message: 'targetUserId is required' });
      }

      // 1. Admin Reset Password
      if (action === 'reset_password' || action === 'change_password') {
        const passToSet = newPassword || password;
        if (!passToSet || passToSet.length < 6) {
          return sendJson(res, 400, { status: 'error', message: 'New password must be at least 6 characters' });
        }

        const updatedUser = authDb.resetUserPassword({
          requesterUser: session,
          targetUserId: targetId,
          newPassword: passToSet
        });
        await authDb.saveUsersToDiskAsync();

        return sendJson(res, 200, {
          status: 'success',
          message: `Password for ${updatedUser.username} has been reset successfully.`,
          user: updatedUser
        });
      }

      // 2. Admin Edit User Details
      if (action === 'edit_user' || action === 'update_user') {
        const updatedUser = authDb.updateUserDetails({
          requesterUser: session,
          targetUserId: targetId,
          updates: body.updates || body
        });
        await authDb.saveUsersToDiskAsync();

        return sendJson(res, 200, {
          status: 'success',
          message: `User ${updatedUser.username} updated successfully.`,
          user: updatedUser
        });
      }

      // 3. Status Toggle (Active / Inactive)
      if (action === 'status' || (!action && targetId && !amount)) {
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

      // 4. Finance Operations (Deposit, Withdraw, Credit Limit)
      if (action === 'deposit' || action === 'withdraw' || action === 'credit') {
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
