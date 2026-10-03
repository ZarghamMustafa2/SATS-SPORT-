/**
 * Diamond Betting API Provider Adapter
 * Upstream Documentation Reference:
 * Scalar Documentation: http://77.37.44.135:3009/docs
 * OpenAPI Specification: http://77.37.44.135:3009/docs.json
 *
 * NOTE: This adapter is prepared as a modular provider for SATS SPORT.
 * It is NOT enabled in production by default.
 * Production routing remains on Shubdx (SPORTS_DATA_PROVIDER=shubdx) until
 * Diamond API authentication (API key or IP whitelist) is explicitly verified.
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

// Dynamic Configuration (reads from settings_db with process.env fallback)
function getDiamondBaseUrl() {
  try {
    const settingsDb = require('../settings_db');
    const conf = settingsDb.getApiProviders(false);
    return conf?.diamond?.baseUrl || process.env.DIAMOND_API_BASE_URL || 'http://77.37.44.135:3009';
  } catch (e) {
    return process.env.DIAMOND_API_BASE_URL || 'http://77.37.44.135:3009';
  }
}

function getDiamondApiKey() {
  try {
    const settingsDb = require('../settings_db');
    const conf = settingsDb.getApiProviders(false);
    return conf?.diamond?.apiKey || process.env.DIAMOND_API_KEY || '';
  } catch (e) {
    return process.env.DIAMOND_API_KEY || '';
  }
}


// Known Sport ID Mapping for Diamond API
const DIAMOND_SPORT_MAP = {
  cricket: { sid: 4, name: 'Cricket' },
  football: { sid: 1, name: 'Football' },
  soccer: { sid: 1, name: 'Soccer' },
  tennis: { sid: 2, name: 'Tennis' },
  basketball: { sid: 3, name: 'Basketball' }
};

/**
 * Resolve sport name to Diamond Sport ID (sid)
 */
function resolveDiamondSport(sportInput) {
  if (!sportInput) return { sid: 4, name: 'Cricket', key: 'cricket' };
  const lower = String(sportInput).toLowerCase().trim();
  if (DIAMOND_SPORT_MAP[lower]) {
    return { sid: DIAMOND_SPORT_MAP[lower].sid, name: DIAMOND_SPORT_MAP[lower].name, key: lower };
  }
  const numericId = parseInt(sportInput, 10);
  if (!isNaN(numericId)) {
    for (const [k, v] of Object.entries(DIAMOND_SPORT_MAP)) {
      if (v.sid === numericId) return { sid: v.sid, name: v.name, key: k };
    }
    return { sid: numericId, name: `Sport ${numericId}`, key: `sport_${numericId}` };
  }
  return { sid: 4, name: 'Cricket', key: 'cricket' };
}

/**
 * Low-level HTTP Client for Diamond Betting API
 */
function requestDiamond(path, method = 'GET', postBody = null, timeoutMs = 8000) {
  return new Promise((resolve) => {
    try {
      const baseUrl = getDiamondBaseUrl();
      const apiKey = getDiamondApiKey();
      const fullUrl = new URL(path, baseUrl);

      // Attach API key query parameter if configured
      if (apiKey && !fullUrl.searchParams.has('key')) {
        fullUrl.searchParams.set('key', apiKey);
      }

      const isHttps = fullUrl.protocol === 'https:';
      const client = isHttps ? https : http;

      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*'
      };

      let bodyData = null;
      if (postBody && (method === 'POST' || method === 'PUT')) {
        bodyData = typeof postBody === 'string' ? postBody : JSON.stringify(postBody);
        headers['Content-Type'] = 'application/json';
        headers['Content-Length'] = Buffer.byteLength(bodyData);
      }

      const reqOptions = {
        hostname: fullUrl.hostname,
        port: fullUrl.port || (isHttps ? 443 : 80),
        path: fullUrl.pathname + fullUrl.search,
        method: method,
        headers: headers,
        timeout: timeoutMs
      };

      const startTime = Date.now();
      const req = client.request(reqOptions, (res) => {
        let rawBody = '';
        res.on('data', (chunk) => {
          rawBody += chunk;
        });

        res.on('end', () => {
          const latencyMs = Date.now() - startTime;
          let parsed = null;
          let isJson = false;

          try {
            parsed = JSON.parse(rawBody);
            isJson = true;
          } catch (e) {
            parsed = null;
          }

          const is401 = res.statusCode === 401;
          const isAccessDenied = is401 || (parsed && parsed.status === false && parsed.message === 'unauthorized');
          const clientIpSeen = parsed && parsed['ip/key'] ? parsed['ip/key'] : null;

          resolve({
            success: res.statusCode >= 200 && res.statusCode < 300,
            statusCode: res.statusCode,
            latencyMs,
            isJson,
            data: parsed !== null ? parsed : rawBody,
            isAccessDenied,
            clientIpSeen,
            endpoint: fullUrl.pathname
          });
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({
          success: false,
          statusCode: 408,
          latencyMs: timeoutMs,
          error: 'REQUEST_TIMEOUT',
          message: `Request to Diamond API timed out after ${timeoutMs}ms`,
          endpoint: fullUrl.pathname
        });
      });

      req.on('error', (err) => {
        resolve({
          success: false,
          statusCode: 500,
          error: err.code || 'NETWORK_ERROR',
          message: err.message,
          endpoint: fullUrl.pathname
        });
      });

      if (bodyData) {
        req.write(bodyData);
      }
      req.end();
    } catch (err) {
      resolve({
        success: false,
        statusCode: 500,
        error: 'CLIENT_EXCEPTION',
        message: err.message
      });
    }
  });
}

// ==========================================
// DIAMOND PROVIDER API METHODS
// ==========================================

/**
 * Health check & Connectivity Diagnostics
 */
async function checkHealth() {
  const baseUrl = getDiamondBaseUrl();
  const apiKey = getDiamondApiKey();
  const result = await requestDiamond('/allSportid', 'GET', null, 5000);
  return {
    provider: 'diamond',
    baseUrl: baseUrl,
    hasApiKeyConfigured: Boolean(apiKey),
    isAuthorized: result.success && !result.isAccessDenied,
    statusCode: result.statusCode,
    latencyMs: result.latencyMs,
    clientSeenByDiamond: result.clientIpSeen || null,
    isAccessDenied: result.isAccessDenied || result.statusCode === 401,
    message: result.isAccessDenied
      ? 'Access denied: Valid Diamond API key or IP whitelist required'
      : (result.success ? 'Diamond API reachable and authorized' : result.message),
    timestamp: new Date().toISOString()
  };
}

/**
 * Get all available sport IDs
 * GET /allSportid
 */
async function getSports() {
  return await requestDiamond('/allSportid', 'GET');
}

/**
 * Get match list for a specific sport
 * GET /esid?sid={sportId}
 */
async function getMatches(sportId = 4) {
  const sid = typeof sportId === 'object' ? (sportId.sid || 4) : sportId;
  return await requestDiamond(`/esid?sid=${encodeURIComponent(sid)}`, 'GET');
}

/**
 * Get all matches across all sports (Hierarchical tree)
 * GET /tree
 */
async function getAllMatchesTree() {
  return await requestDiamond('/tree', 'GET');
}

/**
 * Get match details
 * GET /getDetailsData?sid={sid}&gmid={gmid}
 */
async function getMatchDetails(sportId, gmid) {
  const sid = typeof sportId === 'object' ? (sportId.sid || 4) : sportId;
  return await requestDiamond(`/getDetailsData?sid=${encodeURIComponent(sid)}&gmid=${encodeURIComponent(gmid)}`, 'GET');
}

/**
 * Get Match Odds, Bookmaker and Fancy
 * GET /getPriveteData?sid={sid}&gmid={gmid}
 */
async function getPriveteData(sportId, gmid) {
  const sid = typeof sportId === 'object' ? (sportId.sid || 4) : sportId;
  return await requestDiamond(`/getPriveteData?sid=${encodeURIComponent(sid)}&gmid=${encodeURIComponent(gmid)}`, 'GET');
}

/**
 * Get Scoreboard Iframe URL
 * GET /score?sid={sid}&gtv={gtv}
 */
function getScoreUrl(sportId, gtv) {
  const sid = typeof sportId === 'object' ? (sportId.sid || 4) : sportId;
  const baseUrl = getDiamondBaseUrl();
  const apiKey = getDiamondApiKey();
  let url = `${baseUrl}/score?sid=${encodeURIComponent(sid)}&gtv=${encodeURIComponent(gtv)}`;
  if (apiKey) {
    url += `&key=${encodeURIComponent(apiKey)}`;
  }
  return url;
}

/**
 * Submit placed bet order
 * POST /placed_bets
 * Body: { event_id, event_name, market_id, market_name, market_type }
 */
async function placeBet(betData) {
  return await requestDiamond('/placed_bets', 'POST', betData);
}

/**
 * Get result of a placed bet
 * POST /get-result
 * Body: { event_id, market_id, event_name, market_name }
 */
async function getBetResult(queryData) {
  return await requestDiamond('/get-result', 'POST', queryData);
}

/**
 * Get all settled results for an event
 * GET /get_placed_bets?event_id={eventId}
 */
async function getEventResults(eventId) {
  return await requestDiamond(`/get_placed_bets?event_id=${encodeURIComponent(eventId)}`, 'GET');
}

// ==========================================
// CASINO SUITE METHODS
// ==========================================

async function getCasinoTables() {
  return await requestDiamond('/casino/tableid', 'GET');
}

async function getCasinoData(tableType) {
  return await requestDiamond(`/casino/data?type=${encodeURIComponent(tableType)}`, 'GET');
}

async function getCasinoLastResult(tableType) {
  return await requestDiamond(`/casino/result?type=${encodeURIComponent(tableType)}`, 'GET');
}

async function getCasinoDetailResult(tableType, roundId) {
  return await requestDiamond(`/casino/detail_result?type=${encodeURIComponent(tableType)}&mid=${encodeURIComponent(roundId)}`, 'GET');
}

// ==========================================
// DATA NORMALIZATION (DIAMOND -> SATS SPORT)
// ==========================================

/**
 * Normalizes a raw Diamond match object into the SATS SPORT standard fixture format
 */
function normalizeMatch(raw, sportName = 'cricket') {
  if (!raw) return null;

  const id = String(raw.gmid || raw.id || raw.event_id || '');
  const name = raw.eventName || raw.event_name || raw.name || '';
  let team1 = raw.team1 || '';
  let team2 = raw.team2 || '';

  if ((!team1 || !team2) && name.includes(' v ')) {
    const parts = name.split(' v ');
    team1 = parts[0].trim();
    team2 = parts[1].trim();
  } else if ((!team1 || !team2) && name.includes(' vs ')) {
    const parts = name.split(' vs ');
    team1 = parts[0].trim();
    team2 = parts[1].trim();
  }

  return {
    id: id,
    groupById: id,
    gmid: raw.gmid || null,
    sid: raw.sid || null,
    gtv: raw.gtv || null,
    name: name || `${team1} vs ${team2}`,
    team1: team1 || 'Team 1',
    team2: team2 || 'Team 2',
    date: raw.openDate || raw.date || raw.time || 'LIVE',
    time: raw.openDate || raw.time || 'LIVE',
    inPlay: Boolean(raw.inPlay || raw.inplay || raw.is_live),
    hasFancy: Boolean(raw.hasFancy || raw.fancy),
    hasBM: Boolean(raw.hasBM || raw.bookmaker),
    sport: sportName,
    provider: 'diamond',
    b1: raw.b1 || raw.back1 || null,
    l1: raw.l1 || raw.lay1 || null,
    b2: raw.b2 || raw.back2 || null,
    l2: raw.l2 || raw.lay2 || null
  };
}

/**
 * Normalizes Diamond /getPriveteData response into SATS SPORT market categories:
 * - matchOdds (Betfair Exchange format)
 * - bookmakers
 * - fancy
 */
function normalizeMarkets(rawPriveteData) {
  if (!rawPriveteData) {
    return { matchOdds: null, bookmakers: [], fancy: [] };
  }

  const result = {
    matchOdds: null,
    bookmakers: [],
    fancy: []
  };

  // If Diamond returns matchOdds property
  if (rawPriveteData.matchOdds || rawPriveteData.match_odds) {
    const mo = rawPriveteData.matchOdds || rawPriveteData.match_odds;
    result.matchOdds = {
      marketId: String(mo.marketId || mo.market_id || 'mo_1'),
      marketName: mo.marketName || 'Match Odds',
      status: mo.status || 'OPEN',
      runners: Array.isArray(mo.runners) ? mo.runners.map((r, idx) => ({
        selectionId: r.selectionId || r.selection_id || idx + 1,
        runnerName: r.runnerName || r.name || `Runner ${idx + 1}`,
        status: r.status || 'ACTIVE',
        back: Array.isArray(r.back) ? r.back : [{ price: r.backPrice || r.b1 || 0, size: r.backSize || 0 }],
        lay: Array.isArray(r.lay) ? r.lay : [{ price: r.layPrice || r.l1 || 0, size: r.laySize || 0 }]
      })) : []
    };
  }

  // Bookmakers
  if (Array.isArray(rawPriveteData.bookmaker || rawPriveteData.bookmakers)) {
    const bmList = rawPriveteData.bookmaker || rawPriveteData.bookmakers;
    result.bookmakers = bmList.map((bm, idx) => ({
      marketId: String(bm.marketId || bm.market_id || `bm_${idx + 1}`),
      marketName: bm.marketName || 'Bookmaker',
      status: bm.status || 'OPEN',
      runners: Array.isArray(bm.runners) ? bm.runners : []
    }));
  }

  // Fancy / Session
  if (Array.isArray(rawPriveteData.fancy || rawPriveteData.session)) {
    const fancyList = rawPriveteData.fancy || rawPriveteData.session;
    result.fancy = fancyList.map((f, idx) => ({
      marketId: String(f.marketId || f.market_id || `fancy_${idx + 1}`),
      marketName: f.marketName || f.session_name || `Fancy ${idx + 1}`,
      status: f.status || 'ACTIVE',
      yesPrice: f.yesPrice || f.yes || null,
      noPrice: f.noPrice || f.no || null,
      yesRate: f.yesRate || null,
      noRate: f.noRate || null
    }));
  }

  return result;
}

module.exports = {
  getDiamondBaseUrl,
  getDiamondApiKey,
  resolveDiamondSport,
  checkHealth,
  healthCheck: checkHealth,
  getSports,
  getMatches,
  getAllMatchesTree,
  getMatchDetails,
  getPriveteData,
  getScoreUrl,
  placeBet,
  getBetResult,
  getEventResults,
  getCasinoTables,
  getCasinoData,
  getCasinoLastResult,
  getCasinoDetailResult,
  normalizeMatch,
  normalizeMarkets
};
