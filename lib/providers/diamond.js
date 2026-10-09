/**
 * Diamond Betting API Provider Adapter (v1.0.0)
 * Upstream Documentation Reference:
 * Scalar Documentation: http://46.202.166.33:3009/docs
 * OpenAPI Specification: http://46.202.166.33:3009/docs.json
 *
 * Fully integrated provider adapter for SATS SPORT.
 * Normalizes all 13 documented endpoints into SATS SPORT standard data formats.
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

// Dynamic Configuration (reads from settings_db with process.env fallback)
function getDiamondBaseUrl() {
  try {
    const settingsDb = require('../settings_db');
    const conf = settingsDb.getApiProviders(false);
    return conf?.diamond?.baseUrl || process.env.DIAMOND_API_BASE_URL || 'http://46.202.166.33:3009';
  } catch (e) {
    return process.env.DIAMOND_API_BASE_URL || 'http://46.202.166.33:3009';
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

// Complete Sport ID Mapping from Diamond API (/allSportid)
const DIAMOND_SPORT_MAP = {
  cricket: { sid: 4, name: 'Cricket' },
  football: { sid: 1, name: 'Football' },
  soccer: { sid: 1, name: 'Football' },
  tennis: { sid: 2, name: 'Tennis' },
  horse: { sid: 10, name: 'Horse Racing' },
  'horse racing': { sid: 10, name: 'Horse Racing' },
  greyhound: { sid: 65, name: 'Greyhound Racing' },
  'greyhound racing': { sid: 65, name: 'Greyhound Racing' },
  basketball: { sid: 15, name: 'Basketball' },
  'table tennis': { sid: 8, name: 'Table Tennis' },
  tabletennis: { sid: 8, name: 'Table Tennis' },
  volleyball: { sid: 18, name: 'Volleyball' },
  badminton: { sid: 22, name: 'Badminton' },
  esoccer: { sid: 68, name: 'Esoccer' },
  snooker: { sid: 59, name: 'Snooker' },
  darts: { sid: 57, name: 'Darts' },
  boxing: { sid: 6, name: 'Boxing' },
  mma: { sid: 3, name: 'Mixed Martial Arts' },
  'mixed martial arts': { sid: 3, name: 'Mixed Martial Arts' },
  'american football': { sid: 58, name: 'American Football' },
  egames: { sid: 11, name: 'E Games' },
  'e games': { sid: 11, name: 'E Games' },
  icehockey: { sid: 19, name: 'Ice Hockey' },
  'ice hockey': { sid: 19, name: 'Ice Hockey' },
  futsal: { sid: 9, name: 'Futsal' },
  politics: { sid: 40, name: 'Politics' },
  kabaddi: { sid: 66, name: 'Kabaddi' },
  golf: { sid: 5, name: 'Golf' },
  wrestling: { sid: 69, name: 'Wrestling' },
  chess: { sid: 17, name: 'Chess' }
};

/**
 * Resolve sport name or id to Diamond Sport ID (sid)
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
function requestDiamond(path, method = 'GET', postBody = null, timeoutMs = 10000) {
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
 * Tests GET /allSportid
 */
async function checkHealth() {
  const baseUrl = getDiamondBaseUrl();
  const apiKey = getDiamondApiKey();
  const result = await requestDiamond('/allSportid', 'GET', null, 7000);

  const hasData = result.success && Array.isArray(result.data?.data) && result.data.data.length > 0;
  const sportsCount = hasData ? result.data.data.length : 0;

  return {
    provider: 'diamond',
    baseUrl: baseUrl,
    hasApiKeyConfigured: Boolean(apiKey),
    isAuthorized: result.success && !result.isAccessDenied && hasData,
    statusCode: result.statusCode,
    latencyMs: result.latencyMs,
    clientSeenByDiamond: result.clientIpSeen || null,
    isAccessDenied: result.isAccessDenied || result.statusCode === 401,
    sportsAvailable: sportsCount,
    message: result.isAccessDenied
      ? 'Access denied: Valid Diamond API key or IP whitelist required'
      : (result.success ? `Diamond API reachable and authorized (${sportsCount} sports active)` : (result.message || 'Error reaching Diamond API')),
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
  const resolved = resolveDiamondSport(sportId);
  return await requestDiamond(`/esid?sid=${encodeURIComponent(resolved.sid)}`, 'GET');
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
  const resolved = resolveDiamondSport(sportId);
  return await requestDiamond(`/getDetailsData?sid=${encodeURIComponent(resolved.sid)}&gmid=${encodeURIComponent(gmid)}`, 'GET');
}

/**
 * Get Match Odds, Bookmaker and Fancy
 * GET /getPriveteData?sid={sid}&gmid={gmid}
 */
async function getPriveteData(sportId, gmid) {
  const resolved = resolveDiamondSport(sportId);
  return await requestDiamond(`/getPriveteData?sid=${encodeURIComponent(resolved.sid)}&gmid=${encodeURIComponent(gmid)}`, 'GET');
}

/**
 * Get Scoreboard Iframe URL
 * GET /score?sid={sid}&gtv={gtv}
 */
function getScoreUrl(sportId, gtv) {
  const resolved = resolveDiamondSport(sportId);
  const baseUrl = getDiamondBaseUrl();
  const apiKey = getDiamondApiKey();
  let url = `${baseUrl}/score?sid=${encodeURIComponent(resolved.sid)}&gtv=${encodeURIComponent(gtv)}`;
  if (apiKey) {
    url += `&key=${encodeURIComponent(apiKey)}`;
  }
  return url;
}

/**
 * Submit placed bet order
 * POST /placed_bets
 * Body: { event_id, event_name, market_id, market_name, market_type }
 * NOTE: Frozen from production live betting while provider DB returns HTTP 500.
 * SATS SPORT internal settlement engine maintains isolated user balances.
 */
async function placeBet(betData, bypassSafetyCheck = false) {
  if (!bypassSafetyCheck) {
    return {
      success: false,
      statusCode: 503,
      isFrozen: true,
      error: 'PROVIDER_WRITE_BLOCKED',
      message: 'Diamond write endpoint (/placed_bets) is frozen in production. User bets are processed through SATS SPORT internal settlement engine.',
      endpoint: '/placed_bets'
    };
  }
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
 * NOTE: Frozen from production while provider returns HTTP 500.
 */
async function getEventResults(eventId, bypassSafetyCheck = false) {
  if (!bypassSafetyCheck) {
    return {
      success: false,
      statusCode: 503,
      isFrozen: true,
      error: 'PROVIDER_WRITE_BLOCKED',
      message: 'Diamond placed bets query (/get_placed_bets) is frozen in production.',
      endpoint: '/get_placed_bets'
    };
  }
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
 * Identifies synthetic or test fixtures in upstream feed
 * E.g., 'Test A v Test B', 'Test 1 v Test 2', 2030 sandbox dates
 */
function isSyntheticTestMatch(m) {
  if (!m) return true;
  const name = String(m.ename || m.name || m.eventName || '').toLowerCase().trim();
  const stime = String(m.stime || m.date || '');
  if (name.includes('test a v test b') || name.includes('test 1 v test 2') || name === 'test' || name.startsWith('test match test')) {
    return true;
  }
  if (stime.includes('2030') || stime.includes('2035')) {
    return true;
  }
  return false;
}

/**
 * Normalizes a raw Diamond match object from /esid into the SATS SPORT standard fixture format
 */
function normalizeMatch(raw, sportName = 'cricket') {
  if (!raw) return null;

  const id = String(raw.gmid || raw.id || raw.event_id || '');
  const name = raw.ename || raw.eventName || raw.event_name || raw.name || '';
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
  } else if ((!team1 || !team2) && name.includes(' - ')) {
    const parts = name.split(' - ');
    team1 = parts[0].trim();
    team2 = parts[1].trim();
  } else if (!team1) {
    team1 = name;
  }

  // Extract runners and live odds from raw.section if present
  let b1 = null, l1 = null, b2 = null, l2 = null, b2Draw = null, l2Draw = null;
  let bS1 = '', lS1 = '', bS2 = '', lS2 = '', bS2Draw = '', lS2Draw = '';
  const runnersList = [];

  if (Array.isArray(raw.section) && raw.section.length > 0) {
    // If team names were not determined by name split, use section nat
    if (!team1 && raw.section[0]?.nat) {
      team1 = raw.section[0].nat;
    }
    if (!team2 && raw.section[1]?.nat && !raw.section[1].nat.toLowerCase().includes('draw')) {
      team2 = raw.section[1].nat;
    }

    raw.section.forEach((sec, idx) => {
      const runnerName = sec.nat || (idx === 0 ? team1 : (idx === 1 ? team2 : 'The Draw'));
      const odds = Array.isArray(sec.odds) ? sec.odds : [];
      
      const b1Odd = odds.find(o => o.oname === 'back1' || o.otype === 'back');
      const l1Odd = odds.find(o => o.oname === 'lay1' || o.otype === 'lay');

      const backArr = odds.filter(o => o.otype === 'back').map(o => ({ price: o.odds, size: o.size }));
      const layArr = odds.filter(o => o.otype === 'lay').map(o => ({ price: o.odds, size: o.size }));

      const runnerObj = {
        id: sec.sid || idx + 1,
        name: runnerName,
        selectionId: sec.sid || idx + 1,
        status: sec.gstatus || 'ACTIVE',
        back: backArr.length > 0 ? backArr : (b1Odd ? [{ price: b1Odd.odds, size: b1Odd.size }] : []),
        lay: layArr.length > 0 ? layArr : (l1Odd ? [{ price: l1Odd.odds, size: l1Odd.size }] : [])
      };
      runnersList.push(runnerObj);

      const priceBack = (b1Odd && b1Odd.odds && b1Odd.odds > 0) ? String(b1Odd.odds) : null;
      const priceLay = (l1Odd && l1Odd.odds && l1Odd.odds > 0) ? String(l1Odd.odds) : null;
      const sizeBack = (b1Odd && b1Odd.size && b1Odd.size > 0) ? (b1Odd.size >= 1000 ? `${(b1Odd.size/1000).toFixed(1)}k` : String(b1Odd.size)) : '';
      const sizeLay = (l1Odd && l1Odd.size && l1Odd.size > 0) ? (l1Odd.size >= 1000 ? `${(l1Odd.size/1000).toFixed(1)}k` : String(l1Odd.size)) : '';

      const isDrawRunner = runnerName.toLowerCase().includes('draw');

      if (isDrawRunner) {
        b2Draw = priceBack;
        l2Draw = priceLay;
        bS2Draw = sizeBack;
        lS2Draw = sizeLay;
      } else if (idx === 0) {
        b1 = priceBack;
        l1 = priceLay;
        bS1 = sizeBack;
        lS1 = sizeLay;
      } else {
        b2 = priceBack;
        l2 = priceLay;
        bS2 = sizeBack;
        lS2 = sizeLay;
      }
    });
  }

  const isInPlay = Boolean(raw.iplay || raw.inPlay || raw.inplay);

  return {
    id: id,
    groupById: id,
    gmid: raw.gmid || null,
    sid: raw.etid || raw.sid || null,
    gtv: raw.gtv || null,
    name: name || `${team1} vs ${team2}`,
    team1: team1 || 'Team 1',
    team2: team2 || '',
    tournament: raw.cname || 'International',
    competition: raw.cname || 'International',
    cid: raw.cid || null,
    date: raw.stime || 'LIVE',
    time: isInPlay ? 'LIVE' : (raw.stime || 'Upcoming'),
    stime: raw.stime || '',
    inPlay: isInPlay,
    isLive: isInPlay,
    status: isInPlay ? 'OPEN' : 'UPCOMING',
    isBettable: true,
    hasFancy: true,
    hasBM: true,
    hasStream: Boolean(raw.gtv),
    sport: sportName,
    sportName: sportName.charAt(0).toUpperCase() + sportName.slice(1),
    provider: 'diamond_live',
    b1: b1,
    l1: l1,
    bS1: bS1,
    lS1: lS1,
    b2: b2,
    l2: l2,
    bS2: bS2,
    lS2: lS2,
    b2Draw: b2Draw,
    l2Draw: l2Draw,
    bS2Draw: bS2Draw,
    lS2Draw: lS2Draw,
    bPin: '1',
    fPin: '10',
    mPin: '1',
    runners: runnersList
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

  // rawPriveteData is an array of market objects or has a data array
  const rawList = Array.isArray(rawPriveteData)
    ? rawPriveteData
    : (Array.isArray(rawPriveteData.data) ? rawPriveteData.data : []);

  const result = {
    matchOdds: null,
    bookmakers: [],
    fancy: []
  };

  rawList.forEach((m) => {
    const gtype = String(m.gtype || '').toLowerCase();
    const mname = String(m.mname || '').toUpperCase();

    // 1. MATCH ODDS (gtype === 'match' or mname contains MATCH_ODDS)
    if ((gtype === 'match' || mname.includes('MATCH_ODDS')) && !result.matchOdds) {
      const runners = (m.section || []).map((sec, idx) => {
        const odds = Array.isArray(sec.odds) ? sec.odds : [];
        const backOdds = odds
          .filter(o => o.otype === 'back')
          .sort((a, b) => (a.tno ?? 0) - (b.tno ?? 0))
          .map(o => ({ price: o.odds, size: o.size }));
        const layOdds = odds
          .filter(o => o.otype === 'lay')
          .sort((a, b) => (a.tno ?? 0) - (b.tno ?? 0))
          .map(o => ({ price: o.odds, size: o.size }));

        return {
          selectionId: sec.sid || idx + 1,
          runnerName: sec.nat || `Runner ${idx + 1}`,
          status: sec.gstatus || 'ACTIVE',
          back: backOdds.length > 0 ? backOdds : [{ price: 0, size: 0 }],
          lay: layOdds.length > 0 ? layOdds : [{ price: 0, size: 0 }]
        };
      });

      result.matchOdds = {
        marketId: String(m.mid || 'mo_1'),
        marketName: 'Match Odds',
        status: m.status || 'OPEN',
        inPlay: Boolean(m.iplay),
        min: m.min || 100,
        max: m.max || 500000,
        runners: runners
      };
    }
    // 2. BOOKMAKER (gtype === 'match1' or mname contains Bookmaker)
    else if (gtype === 'match1' || mname.includes('BOOKMAKER')) {
      const runners = (m.section || []).map((sec, idx) => {
        const odds = Array.isArray(sec.odds) ? sec.odds : [];
        const backOdds = odds
          .filter(o => o.otype === 'back')
          .sort((a, b) => (a.tno ?? 0) - (b.tno ?? 0))
          .map(o => ({ price: o.odds, size: o.size }));
        const layOdds = odds
          .filter(o => o.otype === 'lay')
          .sort((a, b) => (a.tno ?? 0) - (b.tno ?? 0))
          .map(o => ({ price: o.odds, size: o.size }));

        return {
          selectionId: sec.sid || idx + 1,
          runnerName: sec.nat || `Runner ${idx + 1}`,
          status: sec.gstatus || 'ACTIVE',
          back: backOdds.length > 0 ? backOdds : [{ price: 0, size: 0 }],
          lay: layOdds.length > 0 ? layOdds : [{ price: 0, size: 0 }]
        };
      });

      result.bookmakers.push({
        marketId: String(m.mid || `bm_${result.bookmakers.length + 1}`),
        marketName: m.mname || 'Bookmaker',
        status: m.status || 'OPEN',
        min: m.min || 100,
        max: m.max || 300000,
        runners: runners
      });
    }
    // 3. FANCY / SESSION MARKETS
    else {
      // Exclude cricket casino / roulette games (0-9 Number games)
      const isCasino = gtype.includes('casino') || mname.includes('CASINO') || gtype === 'cricketcasino';
      if (!isCasino) {
        // Fancy markets can have multiple section items (e.g. 55 over run BAN, etc.)
        const sections = Array.isArray(m.section) ? m.section : [];
        sections.forEach((sec, idx) => {
          // If runner is a number roulette game, skip
          if (sec.nat && /^[0-9]\s*Number/i.test(sec.nat.trim())) return;

          const odds = Array.isArray(sec.odds) ? sec.odds : [];
          const backOdd = odds.find(o => o.otype === 'back');
          const layOdd = odds.find(o => o.otype === 'lay');

          result.fancy.push({
            marketId: String(sec.sid || m.mid || `fancy_${result.fancy.length + 1}`),
            marketName: sec.nat || m.mname || `Fancy ${result.fancy.length + 1}`,
            category: m.mname || m.gtype || 'Fancy',
            status: sec.gstatus || m.status || 'ACTIVE',
            // In Indian Cricket Fancy exchanges:
            // Lay is NO (lower runs line, pink box)
            // Back is YES (higher runs line, blue box)
            runsNo: layOdd?.odds ?? null,
            rateNo: layOdd?.size ?? null,
            runsYes: backOdd?.odds ?? null,
            rateYes: backOdd?.size ?? null,
            min: sec.min || m.min || 100,
            max: sec.max || m.max || 100000
          });
        });
      }
    }
  });

  return result;
}

module.exports = {
  getDiamondBaseUrl,
  getDiamondApiKey,
  DIAMOND_SPORT_MAP,
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
  isSyntheticTestMatch,
  normalizeMatch,
  normalizeMarkets
};
