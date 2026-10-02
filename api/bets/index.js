const authDb = require('../../lib/auth_db');
const { parseJsonBody, getRequestSession, sendJson } = require('../../lib/http_util');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Request');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const session = getRequestSession(req, authDb);
  if (!session) {
    return sendJson(res, 401, { status: 'error', message: 'Authentication required' });
  }

  // POST: Place a Bet
  if (req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const { runner, event, type, odds, stake } = body;

      await authDb.hydrateUsersAsync();
      await authDb.hydrateBetsAsync();
      const result = authDb.placeUserBet({
        userId: session.userId,
        runner,
        event,
        type,
        odds,
        stake
      });
      await authDb.saveUsersToDiskAsync();
      await authDb.saveBetsToDiskAsync(result.bet);

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
  }

  // GET: Retrieve Bets
  if (req.method === 'GET') {
    try {
      const allBets = await authDb.hydrateBetsAsync();
      let bets = [];
      if (session.role === authDb.ROLES.COMPANY || session.role === authDb.ROLES.SUPER_ADMIN || session.role === authDb.ROLES.SUPER_MASTER) {
        bets = allBets;
      } else {
        bets = allBets.filter(b => b.userId === session.userId);
      }

      return sendJson(res, 200, {
        status: 'success',
        bets: bets
      });
    } catch (err) {
      return sendJson(res, 500, { status: 'error', message: err.message });
    }
  }

  return sendJson(res, 405, { status: 'error', message: 'Method not allowed' });
};
