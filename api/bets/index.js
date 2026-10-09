const authDb = require('../../lib/auth_db');
const shubdx = require('../../lib/shubdx');
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

  await authDb.hydrateUsersAsync();
  await authDb.hydrateBetsAsync();

  const session = getRequestSession(req, authDb);
  if (!session) {
    return sendJson(res, 401, { status: 'error', message: 'Authentication required' });
  }

  // POST: Place a Bet with Automatic Shubdx Settlement Order
  if (req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const { runner, event, type, odds, stake } = body;

      const eventTypeId = String(body.eventTypeId || body.event_type_id || '4');
      const rawBetId = String(body.bet_id || '').replace(/\D/g, '');
      const shubdxBetId = (rawBetId && rawBetId.length <= 8) ? rawBetId : String(Math.floor(10000000 + Math.random() * 90000000));
      const matchName = body.match_name || event || 'Sports Match';
      const selectionName = body.selection_name || runner || 'Selection';
      const side = (type && String(type).toLowerCase() === 'lay') ? 'lay' : 'back';
      const marketId = body.market_id || '1.000000000';
      const eventId = String(body.event_id || '0');
      const sectionTeam = body.section_team || runner || 'Team';

      // 1. Submit Settlement Order to Official Shubdx Settlement Endpoint
      // POST https://shubdxinternational.com/settlement/order/{eventTypeId}
      let settlementStatus = 'pending';
      let settlementResponse = null;
      try {
        const orderPayload = {
          match_name: matchName,
          market_id: marketId,
          bet_id: shubdxBetId,
          selection_name: selectionName,
          side: side,
          rate: String(body.rate || (body.fancy_rate ? body.rate : 100)),
          price: String(body.price || odds || 1.95),
          fancy_rate: String(body.fancy_rate || 0),
          fancy_price: String(body.fancy_price || 0),
          stake: String(stake || 500),
          website: 'https://sats-sport.vercel.app',
          event_id: eventId,
          section_team: sectionTeam
        };

        const shubdxResult = await shubdx.submitSettlementOrder(eventTypeId, orderPayload);
        settlementResponse = shubdxResult.response.data || shubdxResult.response.raw;
        if (shubdxResult.response.statusCode === 200 && settlementResponse && settlementResponse.message && settlementResponse.message.includes('successfully')) {
          settlementStatus = 'confirmed';
        } else if (settlementResponse && settlementResponse.error) {
          settlementStatus = 'rejected: ' + settlementResponse.error;
        } else {
          settlementStatus = 'submitted';
        }
      } catch (shubdxErr) {
        console.warn('Shubdx settlement submission note:', shubdxErr.message);
        settlementStatus = 'deferred';
        settlementResponse = { note: shubdxErr.message };
      }

      // 2. Commit Bet & Deduct Funds in Database
      await authDb.hydrateUsersAsync();
      await authDb.hydrateBetsAsync();
      const result = authDb.placeUserBet({
        userId: session.userId,
        runner: selectionName,
        event: matchName,
        type: side === 'lay' ? 'Lay' : 'Back',
        odds: parseFloat(odds) || 1.95,
        stake: parseFloat(stake) || 500,
        match_name: matchName,
        market_id: marketId,
        event_id: eventId,
        shubdx_bet_id: shubdxBetId,
        settlement_status: settlementStatus,
        settlement_response: settlementResponse,
        fancy_rate: body.fancy_rate || 0,
        fancy_price: body.fancy_price || 0
      });
      await authDb.saveUsersToDiskAsync();
      await authDb.saveBetsToDiskAsync(result.bet);

      return sendJson(res, 200, {
        status: 'success',
        message: 'Bet placed successfully!',
        shubdxSettlement: {
          endpoint: `https://shubdxinternational.com/settlement/order/${eventTypeId}`,
          betId: shubdxBetId,
          status: settlementStatus,
          response: settlementResponse
        },
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
