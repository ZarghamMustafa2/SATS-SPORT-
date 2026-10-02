const authDb = require('../../../lib/auth_db');
const { parseJsonBody, getRequestSession, sendJson } = require('../../../lib/http_util');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Request, X-Company-Key');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    return sendJson(res, 405, { status: 'error', message: 'Method not allowed' });
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

  if (!session || (session.role !== authDb.ROLES.COMPANY && session.role !== authDb.ROLES.SUPER_ADMIN && session.role !== authDb.ROLES.SUPER_MASTER)) {
    return sendJson(res, 403, {
      status: 'error',
      message: 'Forbidden: Only authorized Admin or Company Account users can manage user finances.'
    });
  }

  try {
    const body = await parseJsonBody(req);
    const { userId, action, amount, description } = body;

    if (!userId) {
      return sendJson(res, 400, { status: 'error', message: 'Target userId is required.' });
    }
    if (!action || !['deposit', 'withdraw', 'credit'].includes(action)) {
      return sendJson(res, 400, { status: 'error', message: 'Valid action (deposit, withdraw, or credit) is required.' });
    }
    if (amount === undefined || amount === null || amount === '') {
      return sendJson(res, 400, { status: 'error', message: 'Amount is required.' });
    }

    const updatedUser = authDb.updateUserFinance({
      requesterUser: session,
      targetUserId: userId,
      action,
      amount,
      description
    });

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
  } catch (err) {
    const code = err.statusCode || 400;
    return sendJson(res, code, {
      status: 'error',
      message: err.message
    });
  }
};
