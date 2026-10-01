const settingsDb = require('../../lib/settings_db');
const authDb = require('../../lib/auth_db');
const { parseJsonBody, getRequestSession, sendJson } = require('../../lib/http_util');

module.exports = async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Request, X-Company-Key');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  // 1. GET: Public retrieval of current WhatsApp number for User Deposit / Withdraw
  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    const publicSettings = settingsDb.getPublicSettings();
    return sendJson(res, 200, {
      status: 'success',
      whatsappNumber: publicSettings.depositWithdrawWhatsapp,
      depositWithdrawWhatsapp: publicSettings.depositWithdrawWhatsapp
    });
  }

  // 2. POST: Admin / Company Account modification of WhatsApp number
  if (req.method === 'POST') {
    let session = getRequestSession(req, authDb);

    // Support Master Company Key in header if provided
    const companyKey = req.headers['x-company-key'];
    if (!session && companyKey && authDb.verifyCompanyKey(companyKey)) {
      session = {
        role: authDb.ROLES.COMPANY,
        username: 'Company Account'
      };
    }

    if (!session || (session.role !== authDb.ROLES.COMPANY && session.role !== authDb.ROLES.SUPER_ADMIN)) {
      return sendJson(res, 403, {
        status: 'error',
        message: 'Forbidden: Only authorized Admin or Company Account users can update the Deposit/Withdraw WhatsApp number.'
      });
    }

    try {
      const body = await parseJsonBody(req);
      const numberToSet = body.whatsappNumber || body.number;

      if (!numberToSet) {
        return sendJson(res, 400, {
          status: 'error',
          message: 'WhatsApp number is required.'
        });
      }

      const result = settingsDb.updateDepositWithdrawWhatsapp(numberToSet, session);
      return sendJson(res, 200, {
        status: 'success',
        message: 'Deposit / Withdraw WhatsApp number updated successfully.',
        whatsappNumber: result.depositWithdrawWhatsapp,
        updatedAt: result.updatedAt
      });
    } catch (err) {
      const code = err.statusCode || 400;
      return sendJson(res, code, {
        status: 'error',
        message: err.message
      });
    }
  }

  return sendJson(res, 405, {
    status: 'error',
    message: 'Method Not Allowed'
  });
};
