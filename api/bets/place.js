const authDb = require('../../lib/auth_db');
const { parseJsonBody, getRequestSession, sendJson } = require('../../lib/http_util');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    return sendJson(res, 405, { status: 'error', message: 'Method not allowed' });
  }

  const session = getRequestSession(req, authDb);
  if (!session) {
    return sendJson(res, 401, { status: 'error', message: 'Authentication required to place bets.' });
  }

  try {
    const body = await parseJsonBody(req);
    const { runner, event, type, odds, stake } = body;

    const result = authDb.placeUserBet({
      userId: session.userId,
      runner,
      event,
      type,
      odds,
      stake
    });

    return sendJson(res, 200, {
      status: 'success',
      message: 'Bet placed successfully!',
      bet: result.bet,
      user: result.user
    });
  } catch (err) {
    const code = err.statusCode || 400;
    return sendJson(res, code, {
      status: 'error',
      message: err.message
    });
  }
};
