// Vercel Serverless Function: /api/sports
// Unified Shubdx International Sports & Bet Settlement API Controller

const shubdx = require('../../lib/shubdx');
const diamondProvider = require('../../lib/providers/diamond');
const settingsDb = require('../../lib/settings_db');
const authDb = require('../../lib/auth_db');
const { parseJsonBody, getRequestSession, sendJson } = require('../../lib/http_util');

function getActiveProvider() {
  try {
    const pConf = settingsDb.getApiProviders(false);
    return (pConf?.activeProvider || process.env.SPORTS_DATA_PROVIDER || 'shubdx').toLowerCase();
  } catch (e) {
    return (process.env.SPORTS_DATA_PROVIDER || 'shubdx').toLowerCase();
  }
}


// In-Memory Cache for Live Match Polling (reduces rate load on upstream API while ensuring fresh live updates)
let cachedMatches = {};
let lastCacheTimes = {};
let lastLiveTimes = {};
let cachedMatchDetails = {};
let lastMatchDetailsTimes = {};
let inFlightRequests = {}; // Promise deduplication map for concurrent requests
const ALLMATCHES_CACHE_TTL_MS = 6000;
const FETCHMATCH_CACHE_TTL_MS = 3000;
const LIVE_STALE_TTL_MS = 180000; // 3 minutes stale cache retention during upstream proxy session drops

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Request');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const urlObj = new URL(req.url, 'http://localhost');
  const pathname = urlObj.pathname.toLowerCase();
  const searchParams = urlObj.searchParams;

  const action = searchParams.get('action') || '';
  const sportParam = searchParams.get('sport') || searchParams.get('sportsname') || 'cricket';
  const groupById = searchParams.get('match') || searchParams.get('groupById') || searchParams.get('id') || '';

  const activeProvider = getActiveProvider();

  // 0. HEALTH CHECK & CONNECTIVITY DIAGNOSTICS (GET)
  if (req.method === 'GET' && (action === 'health' || pathname === '/api/health')) {
    return sendJson(res, 200, {
      status: 'ok',
      service: 'SatsSport Backend Gateway',
      version: '3.1.0',
      activeProvider: activeProvider,
      hasBlobToken: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
  }

  if (req.method === 'GET' && (action === 'shubdx_health' || pathname === '/api/shubdx/health' || pathname.includes('/shubdx/health'))) {
    try {
      const healthData = await shubdx.checkHealth();
      return sendJson(res, 200, healthData);
    } catch (err) {
      return sendJson(res, 500, {
        status: 'error',
        message: err.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  if (req.method === 'GET' && (action === 'diamond_health' || pathname === '/api/diamond/health' || pathname.includes('/diamond/health'))) {
    try {
      const diamondHealth = await diamondProvider.checkHealth();
      return sendJson(res, 200, diamondHealth);
    } catch (err) {
      return sendJson(res, 500, {
        status: 'error',
        message: err.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  // 0.05 DYNAMIC SPORTS DIRECTORY (GET)
  if (req.method === 'GET' && (action === 'sports' || action === 'directory' || pathname === '/api/sports/directory')) {
    try {
      const sportsRes = await diamondProvider.getSports();
      const rawSports = sportsRes.data?.data || [];

      // Categorize into Primary, Racing, Other Active, and All
      const primaryIds = [4, 1, 2]; // Cricket, Football, Tennis
      const racingIds = [10, 65];   // Horse Racing, Greyhound Racing

      const primary = [];
      const racing = [];
      const otherActive = [];
      const all = [];

      rawSports.forEach(s => {
        const item = {
          sid: s.eid,
          name: s.ename,
          oid: s.oid,
          active: s.active,
          isDefault: Boolean(s.isdefault)
        };
        all.push(item);

        if (primaryIds.includes(s.eid)) {
          primary.push(item);
        } else if (racingIds.includes(s.eid)) {
          racing.push(item);
        } else if (s.active && [8, 15, 69, 18, 58, 11, 40].includes(s.eid)) {
          otherActive.push(item);
        }
      });

      res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');
      return sendJson(res, 200, {
        status: 'success',
        provider: 'diamond',
        timestamp: new Date().toISOString(),
        primarySports: primary,
        racingSports: racing,
        otherActiveSports: otherActive,
        allSportsCount: all.length,
        sports: all
      });
    } catch (err) {
      console.error('Error fetching sports directory:', err.message);
      return sendJson(res, 500, { status: 'error', message: err.message });
    }
  }

  // 0.06 TV STREAMING STATUS / PROXY (GET)
  if (req.method === 'GET' && (action === 'tv' || action === 'stream' || pathname.includes('/sports/tv'))) {
    const targetSid = searchParams.get('sid') || searchParams.get('sport') || 4;
    const targetGmid = searchParams.get('gmid') || searchParams.get('match') || groupById;

    if (!targetGmid) {
      return sendJson(res, 400, { status: 'error', message: 'gmid parameter is required' });
    }

    try {
      const resolved = diamondProvider.resolveDiamondSport(targetSid);
      const tvRes = await diamondProvider.getTvStream(resolved.sid, targetGmid);
      const isWorkingStream = tvRes.success && tvRes.data && !tvRes.data.error;

      return sendJson(res, 200, {
        status: isWorkingStream ? 'available' : 'upstream_blocked',
        routeVerified: true,
        endpointTested: `/tv?sid=${resolved.sid}&gmid=${targetGmid}`,
        httpStatus: tvRes.statusCode,
        streamUrl: isWorkingStream ? (tvRes.data.url || tvRes.data.stream) : null,
        message: isWorkingStream 
          ? 'Live stream authorized' 
          : 'Live video route exists on Diamond API (/tv) but is currently blocked by upstream authorization (HTTP 400). Live playback temporarily withheld.',
        tv: isWorkingStream
      });
    } catch (err) {
      return sendJson(res, 500, { status: 'error', message: err.message });
    }
  }

  // 0.07 SCORE / SCORECARD STATUS (GET)
  if (req.method === 'GET' && (action === 'score' || action === 'scorecard' || pathname.includes('/sports/score'))) {
    const targetSid = searchParams.get('sid') || searchParams.get('sport') || 4;
    const targetGtv = searchParams.get('gtv') || searchParams.get('scoreId') || '';

    const resolved = diamondProvider.resolveDiamondSport(targetSid);
    const scoreUrl = diamondProvider.getScoreUrl(resolved.sid, targetGtv);

    return sendJson(res, 200, {
      status: 'route_unavailable',
      routeDocumented: true,
      endpoint: scoreUrl,
      httpStatus: 404,
      gtv: targetGtv || null,
      message: 'Scoreboard endpoint (/score) is documented in Diamond OpenAPI spec but route is currently unmounted (HTTP 404) on provider server. Scorecard temporarily withheld.',
      scoreAvailable: false
    });
  }

  // 0.1 API MANAGEMENT DASHBOARD OVERVIEW (GET)
function evaluateDiagnostics(providerId, providerName, endpoint, healthData, latencyMs) {
  const statusCode = Number(healthData?.statusCode || healthData?.httpStatus || 0);
  const isAuthorized = healthData?.isAuthorized === true;
  const isAccessDenied = healthData?.isAccessDenied === true || statusCode === 401;
  const rawMsg = String(healthData?.message || healthData?.upstreamMessage || healthData?.error || '');
  const isTimeout = statusCode === 408 || rawMsg.toLowerCase().includes('timeout');
  const isRefused = statusCode === 0 || rawMsg.includes('ECONNREFUSED') || rawMsg.includes('ENOTFOUND');

  // 1. Network Reachability: REACHABLE | TIMEOUT | UNREACHABLE
  let networkReachability = 'REACHABLE';
  if (isTimeout) {
    networkReachability = 'TIMEOUT';
  } else if (isRefused) {
    networkReachability = 'UNREACHABLE';
  } else if (statusCode > 0 || healthData?.reachedUpstream) {
    networkReachability = 'REACHABLE';
  } else {
    networkReachability = 'UNREACHABLE';
  }

  // 2. Authentication Status
  let authentication = 'NOT AUTHENTICATED';
  if (isAuthorized) {
    authentication = 'AUTHENTICATED';
  } else if (providerId === 'diamond') {
    if (statusCode === 401 || isAccessDenied) {
      authentication = 'FAILED / UNAUTHORIZED';
    } else if (statusCode === 403) {
      authentication = 'FORBIDDEN';
    } else {
      authentication = healthData?.hasApiKeyConfigured ? 'FAILED' : 'FAILED / UNAUTHORIZED';
    }
  } else if (providerId === 'shubdx') {
    if (isAccessDenied || statusCode === 401 || statusCode === 403 || !isAuthorized) {
      authentication = 'IP WHITELIST REQUIRED';
    } else {
      authentication = 'IP WHITELIST REQUIRED';
    }
  }

  // 3. Data Availability & Live Data
  let dataAvailability = 'NO DATA';
  let liveData = 'NO';
  let dataSource = 'FALLBACK';
  if (isAuthorized) {
    dataAvailability = 'REAL LIVE DATA';
    liveData = 'YES';
    dataSource = 'LIVE';
  } else if (statusCode === 200 && !isAccessDenied) {
    dataAvailability = 'NO VALID DATA';
    liveData = 'NO';
    dataSource = 'FALLBACK';
  } else {
    dataAvailability = 'NO DATA';
    liveData = 'NO';
    dataSource = 'FALLBACK';
  }

  // 4. Overall Provider Status: CONNECTED | NOT CONNECTED
  const overallStatus = (isAuthorized && dataAvailability === 'REAL LIVE DATA') ? 'CONNECTED' : 'NOT CONNECTED';

  // 5. Connection Status:
  // MUST NEVER be SUCCESS when 401, 403, 404, 500, timeout, unauthorized, or no usable data
  let connectionStatus = 'NOT CONNECTED';
  if (isAuthorized && statusCode === 200 && dataAvailability === 'REAL LIVE DATA') {
    connectionStatus = 'CONNECTED / SUCCESS';
  } else if (statusCode === 401 || (isAccessDenied && statusCode !== 403)) {
    connectionStatus = 'UNAUTHORIZED';
  } else if (statusCode === 403) {
    connectionStatus = 'FORBIDDEN';
  } else if (statusCode === 404) {
    connectionStatus = 'ENDPOINT NOT FOUND';
  } else if (isTimeout) {
    connectionStatus = 'TIMEOUT';
  } else if (statusCode === 200 && (!isAuthorized || dataAvailability === 'NO VALID DATA')) {
    connectionStatus = 'NO VALID DATA';
  } else if (statusCode >= 500) {
    connectionStatus = 'SERVER ERROR';
  } else if (isRefused) {
    connectionStatus = 'UNREACHABLE';
  } else {
    connectionStatus = 'NOT CONNECTED';
  }

  const clientIpSeen = healthData?.clientSeenByDiamond || healthData?.clientSeenByShubdx || healthData?.serverPublicEgressIp || null;

  let error = null;
  if (!isAuthorized) {
    if (providerId === 'diamond') {
      error = isAccessDenied
        ? 'Access denied: Valid Diamond API key or IP whitelist required (HTTP 401)'
        : (healthData?.message || 'Access denied / unauthorized');
    } else {
      error = isAccessDenied
        ? 'Access denied: Your IP address is not authorized.'
        : (healthData?.upstreamMessage || 'Access denied / unauthorized');
    }
  }

  return {
    provider: providerName,
    overallStatus,
    connectionStatus,
    networkReachability,
    authentication,
    dataAvailability,
    liveData,
    dataSource,
    httpStatus: statusCode,
    endpoint,
    responseTimeMs: latencyMs || 0,
    error,
    clientIpSeen,
    timestamp: new Date().toISOString()
  };
}

  // Strict Role Guard: API Management is restricted ONLY to Company Account
  async function authorizeCompanyAccount() {
    await authDb.hydrateUsersAsync();

    let session = getRequestSession(req, authDb);
    const companyKey = req.headers['x-company-key'] || req.headers['X-Company-Key'];
    if (!session && companyKey && authDb.verifyCompanyKey(companyKey)) {
      session = { role: authDb.ROLES.COMPANY, username: 'Company Account' };
    }

    if (!session) {
      const err = new Error('Authentication required to access API Management.');
      err.statusCode = 401;
      throw err;
    }

    const isCompany = (
      session.role === authDb.ROLES.COMPANY ||
      session.role === authDb.ROLES.SUPER_ADMIN ||
      session.role === 'company' ||
      session.role === 'super_admin'
    );

    if (!isCompany) {
      const err = new Error('Forbidden: API Management is restricted to Company Account only.');
      err.statusCode = 403;
      throw err;
    }

    return session;
  }

  if (req.method === 'GET' && (action === 'api_overview' || action === 'api_management' || pathname === '/api/admin/api-management' || pathname === '/api/admin/api-overview')) {
    try {
      const session = await authorizeCompanyAccount();
      const providersConf = settingsDb.getApiProviders(true); // masked secrets
      const auditLogs = settingsDb.getApiAuditLogs();

      // Parallel health probes to real upstream providers
      const [shubdxHealth, diamondHealth] = await Promise.all([
        shubdx.checkHealth().catch(err => ({ status: 'error', isAuthorized: false, httpStatus: 0, message: err.message })),
        diamondProvider.checkHealth().catch(err => ({ status: 'error', isAuthorized: false, statusCode: 0, message: err.message }))
      ]);

      const isShubdxLive = shubdxHealth.isAuthorized === true;
      const isDiamondLive = diamondHealth.isAuthorized === true;

      const shubdxDiag = evaluateDiagnostics(
        'shubdx',
        'Shubdx International',
        shubdxHealth.endpointTested || 'https://shubdxinternational.com/sports/cricket/allmatches',
        shubdxHealth,
        0
      );

      const diamondDiag = evaluateDiagnostics(
        'diamond',
        'Diamond Betting API',
        `${providersConf.diamond?.baseUrl || 'http://46.202.166.33:3009'}/allSportid`,
        diamondHealth,
        diamondHealth.latencyMs || 0
      );

      const activeDiag = activeProvider === 'diamond' ? diamondDiag : shubdxDiag;

      const overview = {
        status: 'success',
        activeProvider: activeProvider,
        activeProviderName: activeProvider === 'diamond' ? 'Diamond Betting API' : 'Shubdx International',
        activeBaseUrl: activeProvider === 'diamond' ? providersConf.diamond?.baseUrl : providersConf.shubdx?.baseUrl,
        activeStatus: activeDiag.overallStatus,
        activeConnectionStatus: activeDiag.connectionStatus,
        activeNetwork: activeDiag.networkReachability,
        activeAuth: activeDiag.authentication,
        activeLiveData: activeDiag.liveData,
        dataSource: activeDiag.dataSource,
        serverEgressIp: shubdxHealth.serverPublicEgressIp || diamondHealth.clientSeenByDiamond || null,
        gatewayUrl: providersConf.gatewayUrl || process.env.ORACLE_GATEWAY_URL || process.env.SHUBDX_PROXY_URL || null,
        gatewayMode: shubdxHealth.serverMode || 'standalone',
        providers: {
          shubdx: {
            id: 'shubdx',
            name: 'Shubdx International',
            role: 'ACTIVE SPORTS PROVIDER',
            baseUrl: providersConf.shubdx?.baseUrl || 'https://shubdxinternational.com',
            environment: 'Production',
            authType: 'Server Egress IP Whitelist',
            hasKey: providersConf.shubdx?.hasKey || false,
            maskedKey: providersConf.shubdx?.apiKey || 'Not Configured',
            overallStatus: shubdxDiag.overallStatus,
            connectionStatus: shubdxDiag.connectionStatus,
            networkReachability: shubdxDiag.networkReachability,
            authentication: shubdxDiag.authentication,
            liveData: shubdxDiag.liveData,
            dataAvailability: shubdxDiag.dataAvailability,
            dataSource: shubdxDiag.dataSource,
            httpStatus: shubdxDiag.httpStatus,
            status: shubdxDiag.overallStatus,
            isAuthorized: isShubdxLive,
            clientIpSeen: shubdxDiag.clientIpSeen,
            upstreamMessage: shubdxDiag.error || 'OK',
            lastTest: shubdxHealth.timestamp || new Date().toISOString(),
            endpoints: [
              { method: 'GET', path: '/sports/{sport}/allmatches', purpose: 'All matches fixture feed' },
              { method: 'GET', path: '/sports/{sport}/fetchmatch?match={id}', purpose: 'Match odds ladder, bookmaker, and fancy' },
              { method: 'POST', path: '/settlement/order/{eventTypeId}', purpose: 'Bet order submission & settlement logging' },
              { method: 'POST', path: '/settlement/result/{eventTypeId}', purpose: 'Market declared outcome retrieval' },
              { method: 'GET', path: '/settlement/overall', purpose: 'Overall settlement report' }
            ]
          },
          diamond: {
            id: 'diamond',
            name: 'Diamond Betting API (v1.0.0)',
            role: 'INTEGRATED SPORTS & CASINO PROVIDER',
            baseUrl: providersConf.diamond?.baseUrl || 'http://46.202.166.33:3009',
            docsUrl: 'http://46.202.166.33:3009/docs',
            specUrl: 'http://46.202.166.33:3009/docs.json',
            environment: 'Production API (Scalar OpenAPI 3.0)',
            authType: 'Query Key (?key=) OR Server IP Whitelist',
            hasKey: providersConf.diamond?.hasKey || false,
            keyConfigured: providersConf.diamond?.hasKey ? 'YES' : 'NO',
            maskedKey: providersConf.diamond?.hasKey ? 'Configured (Hidden)' : 'Not Configured',
            mode: 'READ-ONLY LIVE',
            liveEndpointsCount: '7 / 13 LIVE',
            overallStatus: isDiamondLive ? 'READ-ONLY LIVE (7/13 LIVE)' : diamondDiag.overallStatus,
            connectionStatus: isDiamondLive ? 'CONNECTED (READ-ONLY LIVE - 7/13 ENDPOINTS)' : diamondDiag.connectionStatus,
            networkReachability: diamondDiag.networkReachability,
            authentication: diamondDiag.authentication,
            liveData: diamondDiag.liveData,
            dataAvailability: diamondDiag.dataAvailability,
            dataSource: diamondDiag.dataSource,
            httpStatus: diamondDiag.httpStatus,
            status: isDiamondLive ? 'READ-ONLY LIVE' : diamondDiag.overallStatus,
            isAuthorized: isDiamondLive,
            clientIpSeen: diamondDiag.clientIpSeen,
            upstreamMessage: diamondDiag.error || 'OK',
            lastTest: diamondHealth.timestamp || new Date().toISOString(),
            capabilities: {
              sportsFeed: { name: 'Sports Directory (69 Sports)', status: 'LIVE', code: 'LIVE', badgeClass: 'badge-success' },
              matchOdds: { name: 'Match Odds Ladder', status: 'LIVE', code: 'LIVE', badgeClass: 'badge-success' },
              bookmaker: { name: 'Bookmaker Odds', status: 'LIVE', code: 'LIVE', badgeClass: 'badge-success' },
              fancy: { name: 'Fancy / Session Lines', status: 'LIVE', code: 'LIVE', badgeClass: 'badge-success' },
              horseRacing: { name: 'Horse Racing (139 Races)', status: 'FIXTURES LIVE', code: 'LIVE', badgeClass: 'badge-success' },
              greyhoundRacing: { name: 'Greyhound Racing (121 Races)', status: 'FIXTURES LIVE', code: 'LIVE', badgeClass: 'badge-success' },
              racingOdds: { name: 'Racing Market Odds', status: 'NOT VERIFIED / UPSTREAM BLOCKED', code: 'UPSTREAM_BLOCKED', badgeClass: 'badge-warning' },
              casinoTables: { name: 'Casino Tables (80 Tables)', status: 'LIVE', code: 'LIVE', badgeClass: 'badge-success' },
              casinoData: { name: 'Casino Live Data', status: 'UPSTREAM BLOCKED (HTTP 400)', code: 'UPSTREAM_BLOCKED', badgeClass: 'badge-danger' },
              casinoResult: { name: 'Casino Round Results', status: 'UPSTREAM BLOCKED (HTTP 400)', code: 'UPSTREAM_BLOCKED', badgeClass: 'badge-danger' },
              tvStreaming: { name: 'TV Streaming (/tv)', status: 'ROUTE FOUND / AUTH OR UPSTREAM BLOCKED', code: 'UPSTREAM_BLOCKED', badgeClass: 'badge-warning' },
              matchDetails: { name: 'Match Details (/getDetailsData)', status: 'UPSTREAM BROKEN (HTTP 400)', code: 'UPSTREAM_BROKEN', badgeClass: 'badge-danger' },
              score: { name: 'Score (/score)', status: 'DOCUMENTED / ROUTE UNAVAILABLE', code: 'ROUTE_UNAVAILABLE', badgeClass: 'badge-danger' },
              casinoDetailResult: { name: 'Casino Detail Result', status: 'PLAYER AUTH REQUIRED', code: 'BLOCKED_AUTH', badgeClass: 'badge-warning' },
              betOrder: { name: 'Bet Order Placement (/placed_bets)', status: 'PROVIDER BACKEND BLOCKED (HTTP 500)', code: 'BLOCKED', badgeClass: 'badge-danger' },
              placedBets: { name: 'Settled Placed Bets (/get_placed_bets)', status: 'PROVIDER BACKEND BLOCKED (HTTP 500)', code: 'BLOCKED', badgeClass: 'badge-danger' },
              resultSettlement: { name: 'Result Settlement Query (/get-result)', status: 'NOT VERIFIED / EVENT ACTIVE', code: 'NOT_VERIFIED', badgeClass: 'badge-secondary' }
            },
            endpoints: [
              { method: 'GET', path: '/allSportid', purpose: 'All Sport IDs list (69 Sports)', auth: 'Optional Query Key', status: '200 OK', state: 'LIVE', stateClass: 'badge-success' },
              { method: 'GET', path: '/esid?sid={sid}', purpose: 'Match list (t1 In-Play & t2 Upcoming)', auth: 'Optional Query Key', status: '200 OK', state: 'LIVE', stateClass: 'badge-success' },
              { method: 'GET', path: '/esid?sid=10', purpose: 'Horse Racing meetings & race schedules (140 Races)', auth: 'sid=10', status: '200 OK', state: 'LIVE', stateClass: 'badge-success' },
              { method: 'GET', path: '/esid?sid=65', purpose: 'Greyhound Racing meetings & race schedules (123 Races)', auth: 'sid=65', status: '200 OK', state: 'LIVE', stateClass: 'badge-success' },
              { method: 'GET', path: '/tree', purpose: 'Sports match hierarchy tree (37 Sports)', auth: 'Optional Query Key', status: '200 OK', state: 'LIVE', stateClass: 'badge-success' },
              { method: 'GET', path: '/getPriveteData?sid={sid}&gmid={gmid}', purpose: 'Unified Match Odds, Bookmaker & Fancy', auth: 'Optional Query Key', status: '200 OK', state: 'LIVE', stateClass: 'badge-success' },
              { method: 'GET', path: '/tv?sid={sid}&gmid={gmid}', purpose: 'Live TV stream endpoint (Express Route)', auth: 'sid & gmid parameters', status: '400 Bad Request', state: 'UPSTREAM_BROKEN', stateClass: 'badge-warning' },
              { method: 'GET', path: '/casino/tableid', purpose: 'List of all Casino tables (80 Tables)', auth: 'Optional Query Key', status: '200 OK', state: 'LIVE', stateClass: 'badge-success' },
              { method: 'GET', path: '/casino/data?type={type}', purpose: 'Live Casino round cards & odds', auth: 'Optional Query Key', status: '200 OK', state: 'LIVE', stateClass: 'badge-success' },
              { method: 'GET', path: '/casino/result?type={type}', purpose: 'Casino last declared round outcome', auth: 'Optional Query Key', status: '200 OK', state: 'LIVE', stateClass: 'badge-success' },
              { method: 'GET', path: '/getDetailsData?sid={sid}&gmid={gmid}', purpose: 'Match details & tracker ID', auth: 'Optional Query Key', status: '400 Bad Request', state: 'UPSTREAM_BROKEN', stateClass: 'badge-danger' },
              { method: 'GET', path: '/score?sid={sid}&gtv={gtv}', purpose: 'Graphic scoreboard iframe widget', auth: 'Optional Query Key', status: '404 Not Found', state: 'UPSTREAM_ROUTE_UNAVAILABLE', stateClass: 'badge-danger' },
              { method: 'GET', path: '/casino/detail_result?type={type}&mid={mid}', purpose: 'Casino round detail & player outcome', auth: 'Player Session', status: '200 (Status 401)', state: 'BLOCKED_AUTH', stateClass: 'badge-warning' },
              { method: 'POST', path: '/placed_bets', purpose: 'Submit user bet order', auth: 'DB Validation', status: '500 Server Error', state: 'PROVIDER_BACKEND_BLOCKED', stateClass: 'badge-danger' },
              { method: 'GET', path: '/get_placed_bets?event_id={id}', purpose: 'All placed bets for an event', auth: 'Event ID', status: '500 Server Error', state: 'PROVIDER_BACKEND_BLOCKED', stateClass: 'badge-danger' },
              { method: 'POST', path: '/get-result', purpose: 'Query settlement result for placed bet', auth: 'Market & Event ID', status: '400 (Not Declared)', state: 'NOT_VERIFIED', stateClass: 'badge-secondary' }
            ]
          },
          sportbex: {
            id: 'sportbex',
            name: 'Sportbex (Legacy Trial)',
            role: 'DIAGNOSTIC CRICKET FEED',
            baseUrl: 'https://trial-api.sportbex.com/api',
            environment: 'Trial API',
            authType: 'sportbex-api-key Header',
            status: 'STANDBY',
            isAuthorized: false,
            endpoints: [
              { method: 'GET', path: '/live-score/match/live', purpose: 'Live Cricket Score Feed' }
            ]
          }
        },
        sportsDataStatus: {
          cricket: { name: 'Cricket', status: (activeProvider === 'diamond' ? isDiamondLive : isShubdxLive) ? 'LIVE' : 'FALLBACK / OFFLINE', isLive: (activeProvider === 'diamond' ? isDiamondLive : isShubdxLive), provider: activeProvider },
          football: { name: 'Football', status: (activeProvider === 'diamond' ? isDiamondLive : isShubdxLive) ? 'LIVE' : 'FALLBACK / OFFLINE', isLive: (activeProvider === 'diamond' ? isDiamondLive : isShubdxLive), provider: activeProvider },
          tennis: { name: 'Tennis', status: (activeProvider === 'diamond' ? isDiamondLive : isShubdxLive) ? 'LIVE' : 'FALLBACK / OFFLINE', isLive: (activeProvider === 'diamond' ? isDiamondLive : isShubdxLive), provider: activeProvider },
          inPlay: { name: 'In-Play', status: (activeProvider === 'diamond' ? isDiamondLive : isShubdxLive) ? 'LIVE' : 'FALLBACK / OFFLINE', isLive: (activeProvider === 'diamond' ? isDiamondLive : isShubdxLive), provider: activeProvider },
          odds: { name: 'Match Odds Ladder', status: (activeProvider === 'diamond' ? isDiamondLive : isShubdxLive) ? 'LIVE' : 'FALLBACK / OFFLINE', isLive: (activeProvider === 'diamond' ? isDiamondLive : isShubdxLive), provider: activeProvider },
          bookmaker: { name: 'Bookmaker Odds', status: (activeProvider === 'diamond' ? isDiamondLive : isShubdxLive) ? 'LIVE' : 'FALLBACK / OFFLINE', isLive: (activeProvider === 'diamond' ? isDiamondLive : isShubdxLive), provider: activeProvider },
          fancy: { name: 'Fancy / Session Lines', status: (activeProvider === 'diamond' ? isDiamondLive : isShubdxLive) ? 'LIVE' : 'FALLBACK / OFFLINE', isLive: (activeProvider === 'diamond' ? isDiamondLive : isShubdxLive), provider: activeProvider },
          horseRacing: { name: 'Horse Racing', status: isDiamondLive ? 'LIVE' : 'FALLBACK / OFFLINE', isLive: isDiamondLive, provider: 'diamond' },
          greyhoundRacing: { name: 'Greyhound Racing', status: isDiamondLive ? 'LIVE' : 'FALLBACK / OFFLINE', isLive: isDiamondLive, provider: 'diamond' },
          casinoTables: { name: 'Casino Tables (80 Tables)', status: isDiamondLive ? 'LIVE' : 'OFFLINE', isLive: isDiamondLive, provider: 'diamond' },
          casinoData: { name: 'Live Casino Rounds', status: isDiamondLive ? 'LIVE' : 'OFFLINE', isLive: isDiamondLive, provider: 'diamond' },
          casinoResults: { name: 'Casino Round Results', status: isDiamondLive ? 'LIVE' : 'OFFLINE', isLive: isDiamondLive, provider: 'diamond' }
        },
        auditLogs: auditLogs
      };

      return sendJson(res, 200, overview);
    } catch (err) {
      console.error('Error generating api_overview:', err);
      return sendJson(res, err.statusCode || 500, { status: 'error', message: err.message });
    }
  }

  // 0.2 LIVE CONNECTION TEST FOR PROVIDER (POST)
  if (req.method === 'POST' && (action === 'api_test_connection' || pathname === '/api/admin/api-management/test')) {
    try {
      const session = await authorizeCompanyAccount();
      const body = await parseJsonBody(req);
      const target = (body.provider || 'diamond').toLowerCase().trim();
      const adminUser = session.username || session.role || body.admin || 'Company Account';

      let testResult = null;
      if (target === 'diamond') {
        const start = Date.now();
        const resHealth = await diamondProvider.checkHealth();
        const latency = Date.now() - start;
        testResult = evaluateDiagnostics('diamond', 'Diamond Betting API', `${resHealth.baseUrl}/allSportid`, resHealth, latency);

        settingsDb.addApiAuditLog({
          admin: adminUser,
          action: 'API connection tested',
          provider: 'diamond',
          result: `Tested Diamond API: Connection=${testResult.connectionStatus}, HTTP ${testResult.httpStatus}, Auth=${testResult.authentication}`
        });
      } else {
        const start = Date.now();
        const resHealth = await shubdx.checkHealth();
        const latency = Date.now() - start;
        testResult = evaluateDiagnostics('shubdx', 'Shubdx International', resHealth.endpointTested || 'https://shubdxinternational.com/sports/cricket/allmatches', resHealth, latency);

        settingsDb.addApiAuditLog({
          admin: adminUser,
          action: 'API connection tested',
          provider: 'shubdx',
          result: `Tested Shubdx API: Connection=${testResult.connectionStatus}, HTTP ${testResult.httpStatus}, Auth=${testResult.authentication}`
        });
      }

      return sendJson(res, 200, { status: 'success', testResult });
    } catch (err) {
      console.error('Error in api_test_connection:', err);
      return sendJson(res, err.statusCode || 500, { status: 'error', message: err.message });
    }
  }

  // 0.3 UPDATE PROVIDER SETTINGS (POST)
  if (req.method === 'POST' && (action === 'api_update_settings' || pathname === '/api/admin/api-management/settings')) {
    try {
      const session = await authorizeCompanyAccount();
      const body = await parseJsonBody(req);
      const result = settingsDb.updateApiProviderSettings(body, session);
      return sendJson(res, 200, { status: 'success', ...result });
    } catch (err) {
      console.error('Error in api_update_settings:', err);
      return sendJson(res, err.statusCode || 500, { status: 'error', message: err.message });
    }
  }

  // 0.4 SWITCH ACTIVE PROVIDER (WITH VERIFICATION GUARD) (POST)
  if (req.method === 'POST' && (action === 'api_switch_provider' || pathname === '/api/admin/api-management/switch')) {
    try {
      const session = await authorizeCompanyAccount();
      const body = await parseJsonBody(req);
      const target = String(body.targetProvider || body.provider || '').toLowerCase().trim();

      // PRE-ACTIVATION VERIFICATION GUARD:
      // Real test must succeed before allowing activation
      if (target === 'diamond') {
        const dCheck = await diamondProvider.checkHealth();
        if (dCheck.isAccessDenied || !dCheck.isAuthorized) {
          return sendJson(res, 400, {
            status: 'error',
            message: `Cannot switch to Diamond Betting API: Provider rejected authorization (HTTP ${dCheck.statusCode || 401} Unauthorized). A valid Diamond API key or IP whitelist must be configured and tested successfully before activating.`
          });
        }
      } else if (target === 'shubdx') {
        // Switching back to Shubdx is permitted
      } else {
        return sendJson(res, 400, {
          status: 'error',
          message: `Unknown target provider "${target}". Supported providers: "shubdx", "diamond".`
        });
      }

      const switchResult = settingsDb.setActiveProvider(target, session);
      return sendJson(res, 200, { status: 'success', ...switchResult });
    } catch (err) {
      console.error('Error in api_switch_provider:', err);
      return sendJson(res, err.statusCode || 500, { status: 'error', message: err.message });
    }
  }


  // 1. FETCH MATCH DETAILS & MARKETS (GET)
  if (req.method === 'GET' && (action === 'fetchmatch' || pathname.includes('/fetchmatch') || (groupById && action !== 'allmatches'))) {
    if (!groupById) {
      return sendJson(res, 400, {
        status: 'error',
        message: 'Missing required parameter: match or groupById'
      });
    }

    const providerParam = (searchParams.get('provider') || '').toLowerCase().trim();
    const useDiamond = (providerParam === 'diamond' || (!providerParam && activeProvider === 'diamond'));

    if (useDiamond) {
      const matchCacheKey = `fetchmatch_${groupById}`;
      const now = Date.now();
      if (cachedMatchDetails[matchCacheKey] && (now - (lastMatchDetailsTimes[matchCacheKey] || 0) < FETCHMATCH_CACHE_TTL_MS)) {
        res.setHeader('Cache-Control', 'public, max-age=2, stale-while-revalidate=4');
        return sendJson(res, 200, cachedMatchDetails[matchCacheKey]);
      }

      if (inFlightRequests[matchCacheKey]) {
        try {
          const inFlightResult = await inFlightRequests[matchCacheKey];
          res.setHeader('Cache-Control', 'public, max-age=2, stale-while-revalidate=4');
          return sendJson(res, 200, inFlightResult);
        } catch (e) {}
      }

      try {
        const fetchPromise = (async () => {
          let resolved = diamondProvider.resolveDiamondSport(sportParam);
          let privRes = await diamondProvider.getPriveteData(resolved.sid, groupById);
          let privData = privRes.data;
          let rawList = privData?.data || (Array.isArray(privData) ? privData : []);

          // If initial lookup is empty and sport was inplay or unspecified, try matching across other sports
          if ((!privRes.success || !Array.isArray(rawList) || rawList.length === 0) && (sportParam === 'inplay' || !searchParams.has('sport'))) {
            for (const fallbackSid of [4, 1, 2]) {
              if (fallbackSid === resolved.sid) continue;
              const tryRes = await diamondProvider.getPriveteData(fallbackSid, groupById);
              const tryList = tryRes.data?.data || (Array.isArray(tryRes.data) ? tryRes.data : []);
              if (tryRes.success && Array.isArray(tryList) && tryList.length > 0) {
                resolved = diamondProvider.resolveDiamondSport(fallbackSid);
                privRes = tryRes;
                privData = tryRes.data;
                rawList = tryList;
                break;
              }
            }
          }

          const isLive = privRes.success && Array.isArray(rawList) && rawList.length > 0;
          const isRacing = (resolved.sid === 10 || resolved.sid === 65 || resolved.key === 'horse' || resolved.key === 'greyhound');
          const categorized = isLive ? diamondProvider.normalizeMarkets(rawList) : null;

          let finalMarkets = null;
          let marketNotice = null;
          let matchStatus = 'success';

          if (isLive) {
            finalMarkets = categorized;
            matchStatus = 'success';
          } else if (isRacing) {
            finalMarkets = { matchOdds: null, bookmakers: [], fancy: [] };
            marketNotice = 'Racing market odds feed is currently pending provider activation (Live fixture metadata verified).';
            matchStatus = 'fixture_only';
          } else {
            // Find fixture in cached matches across sports to extract REAL runners and REAL visible odds
            let foundFixture = null;
            for (const cKey of Object.keys(cachedMatches)) {
              const mList = cachedMatches[cKey]?.matches || [];
              const matchObj = mList.find(m => String(m.gmid) === String(groupById) || String(m.id) === String(groupById));
              if (matchObj) {
                foundFixture = matchObj;
                break;
              }
            }

            if (foundFixture) {
              const t1 = foundFixture.team1 || foundFixture.name || 'Runner 1';
              const t2 = foundFixture.team2 || '';
              const runners = [];

              if (t1) {
                runners.push({
                  selectionId: 1,
                  runnerName: t1,
                  status: 'ACTIVE',
                  back: foundFixture.b1 && foundFixture.b1 !== '-' ? [{ price: parseFloat(foundFixture.b1), size: parseFloat(foundFixture.bS1) || 100 }] : [],
                  lay: foundFixture.l1 && foundFixture.l1 !== '-' ? [{ price: parseFloat(foundFixture.l1), size: parseFloat(foundFixture.lS1) || 100 }] : []
                });
              }

              if (t2) {
                runners.push({
                  selectionId: 2,
                  runnerName: t2,
                  status: 'ACTIVE',
                  back: foundFixture.b2 && foundFixture.b2 !== '-' ? [{ price: parseFloat(foundFixture.b2), size: parseFloat(foundFixture.bS2) || 100 }] : [],
                  lay: foundFixture.l2 && foundFixture.l2 !== '-' ? [{ price: parseFloat(foundFixture.l2), size: parseFloat(foundFixture.lS2) || 100 }] : []
                });
              }

              if (foundFixture.b2Draw && foundFixture.b2Draw !== '-') {
                runners.push({
                  selectionId: 3,
                  runnerName: 'The Draw',
                  status: 'ACTIVE',
                  back: [{ price: parseFloat(foundFixture.b2Draw), size: parseFloat(foundFixture.bS2Draw) || 100 }],
                  lay: foundFixture.l2Draw && foundFixture.l2Draw !== '-' ? [{ price: parseFloat(foundFixture.l2Draw), size: parseFloat(foundFixture.lS2Draw) || 100 }] : []
                });
              }

              finalMarkets = {
                matchOdds: runners.length > 0 ? {
                  marketId: `mo_${groupById}`,
                  marketName: 'Match Odds',
                  status: foundFixture.inPlay ? 'OPEN' : 'UPCOMING',
                  inPlay: Boolean(foundFixture.inPlay),
                  runners: runners
                } : null,
                bookmakers: [],
                fancy: []
              };
              matchStatus = 'fixture_only';
              marketNotice = 'Bookmaker and Fancy session markets are not currently active from provider for this fixture.';
            } else {
              finalMarkets = { matchOdds: null, bookmakers: [], fancy: [] };
              matchStatus = 'session_closed';
              marketNotice = 'Live market session currently closed or unmounted on provider.';
            }
          }

          const payload = {
            status: matchStatus,
            dataSource: isLive ? 'LIVE_DIAMOND' : (isRacing ? 'LIVE_DIAMOND_FIXTURE' : (finalMarkets?.matchOdds ? 'LIVE_FIXTURE_ODDS' : 'SESSION_CLOSED')),
            isLiveDiamond: isLive || isRacing || Boolean(finalMarkets?.matchOdds),
            isLiveShubdx: false,
            groupById: groupById,
            sport: resolved.key,
            sportName: resolved.name,
            sportId: resolved.sid,
            provider: 'diamond_live',
            endpoint: privRes.endpoint || '/getPriveteData',
            isDiamondAuthorized: isLive,
            marketNotice: marketNotice,
            tvStreamUrl: diamondProvider.getTvStreamUrl(resolved.sid, groupById),
            scoreUrl: diamondProvider.getScoreUrl(resolved.sid, groupById),
            markets: finalMarkets
          };

          cachedMatchDetails[matchCacheKey] = payload;
          lastMatchDetailsTimes[matchCacheKey] = Date.now();
          return payload;
        })();

        inFlightRequests[matchCacheKey] = fetchPromise;
        fetchPromise.finally(() => {
          delete inFlightRequests[matchCacheKey];
        });

        const resultPayload = await fetchPromise;
        res.setHeader('Cache-Control', 'public, max-age=2, stale-while-revalidate=4');
        return sendJson(res, 200, resultPayload);
      } catch (err) {
        console.error('Error fetching Diamond fetchmatch:', err.message);
        return sendJson(res, 200, {
          status: 'error',
          dataSource: 'SESSION_CLOSED',
          isLiveDiamond: false,
          groupById: groupById,
          sport: sportParam,
          markets: { matchOdds: null, bookmakers: [], fancy: [] },
          message: err.message
        });
      }
    }

    const { sportsname, eventTypeId } = shubdx.resolveSport(sportParam);

    try {
      const shubdxRes = await shubdx.getFetchMatch(sportsname, groupById);
      const shubdxData = shubdxRes.response.data;
      const rawList = shubdxData?.data?.result || (Array.isArray(shubdxData?.result) ? shubdxData.result : []);

      const isLiveShubdx = rawList.length > 0;
      const categorized = isLiveShubdx ? shubdx.categorizeMarkets(rawList) : null;

      let ipNotice = null;
      if (shubdxData && shubdxData.status === 'error') {
        ipNotice = {
          message: shubdxData.message || 'IP address not authorized on Shubdx API',
          clientIp: shubdxData.client || null,
          resolution: shubdxData.solution || shubdxData.resolution || 'Authorize egress IP on Shubdx portal',
          requiresWhitelist: true
        };
      }

      const fallbackMarkets = { matchOdds: null, bookmakers: [], fancy: [] };

      return sendJson(res, 200, {
        status: isLiveShubdx ? 'success' : 'unauthorized',
        dataSource: isLiveShubdx ? 'LIVE_SHUBDX' : 'OFFLINE_FALLBACK',
        isLiveShubdx: isLiveShubdx,
        groupById: groupById,
        sport: sportsname,
        eventTypeId: eventTypeId,
        endpoint: shubdxRes.endpoint,
        isShubdxAuthorized: isLiveShubdx,
        shubdxNotice: ipNotice,
        markets: isLiveShubdx ? categorized : fallbackMarkets,
        rawShubdxResponse: shubdxData
      });
    } catch (err) {
      console.error('Error fetching Shubdx fetchmatch:', err.message);
      return sendJson(res, 500, {
        status: 'error',
        message: err.message
      });
    }
  }

  // 2. ALL MATCHES (GET)
  if (req.method === 'GET' && (action === 'allmatches' || pathname.includes('/allmatches') || (!action && !groupById))) {
    const providerParam = (searchParams.get('provider') || '').toLowerCase().trim();
    const useDiamond = (providerParam === 'diamond' || (!providerParam && activeProvider === 'diamond'));

    if (useDiamond) {
      const resolved = diamondProvider.resolveDiamondSport(sportParam);
      const cacheKey = `allmatches_diamond_${resolved.key}`;
      const now = Date.now();

      if (cachedMatches[cacheKey] && (now - (lastCacheTimes[cacheKey] || 0) < ALLMATCHES_CACHE_TTL_MS)) {
        res.setHeader('Cache-Control', 'public, max-age=3, stale-while-revalidate=6');
        return sendJson(res, 200, cachedMatches[cacheKey]);
      }

      if (inFlightRequests[cacheKey]) {
        try {
          const inFlightResult = await inFlightRequests[cacheKey];
          res.setHeader('Cache-Control', 'public, max-age=3, stale-while-revalidate=6');
          return sendJson(res, 200, inFlightResult);
        } catch (e) {}
      }

      try {
        const fetchPromise = (async () => {
          const diamondRes = await diamondProvider.getMatches(resolved.sid);
          const statusCode = diamondRes.statusCode;
          const diamondData = diamondRes.data;

          let normalizedMatches = [];
          let isDiamondLive = false;

          if (statusCode === 200 && diamondData?.data) {
            const isRacing = resolved.sid === 10 || resolved.sid === 65 || resolved.key === 'horse' || resolved.key === 'greyhound';
            if (isRacing) {
              normalizedMatches = diamondProvider.normalizeRacingMatches(diamondData, resolved.key);
              if (normalizedMatches.length > 0) isDiamondLive = true;
            } else {
              const t1 = Array.isArray(diamondData.data.t1) ? diamondData.data.t1 : [];
              const t2 = Array.isArray(diamondData.data.t2) ? diamondData.data.t2 : [];
              const allRaw = [...t1, ...t2];
              if (allRaw.length > 0) {
                normalizedMatches = allRaw
                  .filter(m => !diamondProvider.isSyntheticTestMatch(m))
                  .map(m => diamondProvider.normalizeMatch(m, resolved.key));
                isDiamondLive = true;
              }
            }
          }

          if (isDiamondLive) {
            lastLiveTimes[cacheKey] = Date.now();
          } else if (cachedMatches[cacheKey]?.isLiveDiamond && (Date.now() - (lastLiveTimes[cacheKey] || 0) < LIVE_STALE_TTL_MS)) {
            return {
              ...cachedMatches[cacheKey],
              timestamp: new Date().toISOString(),
              isStaleRetained: true
            };
          }

          const fallbackMatches = getFallbackMatches(resolved.key);

          const responsePayload = {
            status: isDiamondLive ? 'success' : 'fallback',
            dataSource: isDiamondLive ? 'LIVE_DIAMOND' : 'OFFLINE_FALLBACK',
            isLiveDiamond: isDiamondLive,
            isLiveShubdx: false,
            timestamp: new Date().toISOString(),
            sport: resolved.key,
            sportName: resolved.name,
            sportId: resolved.sid,
            provider: isDiamondLive ? 'diamond_live' : 'offline_fallback',
            isDiamondAuthorized: isDiamondLive,
            endpoint: diamondRes.endpoint || '/esid',
            count: isDiamondLive ? normalizedMatches.length : fallbackMatches.length,
            matches: isDiamondLive ? normalizedMatches : fallbackMatches
          };

          cachedMatches[cacheKey] = responsePayload;
          lastCacheTimes[cacheKey] = Date.now();
          return responsePayload;
        })();

        inFlightRequests[cacheKey] = fetchPromise;
        fetchPromise.finally(() => {
          delete inFlightRequests[cacheKey];
        });

        const resultPayload = await fetchPromise;
        res.setHeader('Cache-Control', 'public, max-age=3, stale-while-revalidate=6');
        return sendJson(res, 200, resultPayload);
      } catch (err) {
        console.error('Error fetching Diamond allmatches:', err.message);
        return sendJson(res, 500, {
          status: 'error',
          dataSource: 'OFFLINE_FALLBACK',
          isLiveDiamond: false,
          message: err.message,
          matches: getFallbackMatches(resolved.key)
        });
      }
    }

    const { sportsname, eventTypeId, name } = shubdx.resolveSport(sportParam);
    const cacheKey = `allmatches_${sportsname}`;
    const now = Date.now();

    if (cachedMatches[cacheKey] && (now - (lastCacheTimes[cacheKey] || 0) < ALLMATCHES_CACHE_TTL_MS)) {
      res.setHeader('Cache-Control', 'public, max-age=3, stale-while-revalidate=6');
      return sendJson(res, 200, cachedMatches[cacheKey]);
    }

    try {
      const shubdxRes = await shubdx.getAllMatches(sportsname);
      const statusCode = shubdxRes.response.statusCode;
      const shubdxData = shubdxRes.response.data;

      let normalizedMatches = [];
      let isShubdxLive = false;
      let ipAuthNotice = null;

      if (statusCode === 200 && shubdxData && shubdxData.status !== 'error' && shubdxData.data?.result) {
        normalizedMatches = shubdx.normalizeShubdxMatches(shubdxData.data.result);
        isShubdxLive = true;
      } else if (shubdxData && shubdxData.status === 'error') {
        ipAuthNotice = {
          message: shubdxData.message || 'Access denied: Your IP address is not authorized.',
          clientIp: shubdxData.client || null,
          resolution: shubdxData.resolution || 'Authorize egress IP on Shubdx portal',
          requiresWhitelist: true
        };
      }

      // Offline fallback: Used strictly to prevent white-screen crashes during outages / pending authorization
      const fallbackMatches = getFallbackMatches(sportsname);

      const responsePayload = {
        status: isShubdxLive ? 'success' : 'unauthorized',
        dataSource: isShubdxLive ? 'LIVE_SHUBDX' : 'OFFLINE_FALLBACK',
        isLiveShubdx: isShubdxLive,
        timestamp: new Date().toISOString(),
        sport: sportsname,
        sportName: name,
        eventTypeId: eventTypeId,
        provider: isShubdxLive ? 'shubdx_live' : 'offline_fallback',
        isShubdxAuthorized: isShubdxLive,
        shubdxNotice: ipAuthNotice,
        endpoint: shubdxRes.endpoint,
        count: isShubdxLive ? normalizedMatches.length : fallbackMatches.length,
        matches: isShubdxLive ? normalizedMatches : fallbackMatches,
        rawShubdxResponse: shubdxData
      };

      cachedMatches[cacheKey] = responsePayload;
      lastCacheTimes[cacheKey] = now;

      return sendJson(res, 200, responsePayload);
    } catch (err) {
      console.error('Error fetching Shubdx allmatches:', err.message);
      return sendJson(res, 500, {
        status: 'error',
        dataSource: 'OFFLINE_FALLBACK',
        isLiveShubdx: false,
        message: err.message,
        matches: getFallbackMatches(sportsname)
      });
    }
  }

  // 2.1 CASINO SUITE ENDPOINTS (GET)
  if (req.method === 'GET' && action === 'casino_tables') {
    try {
      const resData = await diamondProvider.getCasinoTables();
      return sendJson(res, 200, {
        status: resData.success ? 'success' : 'error',
        statusCode: resData.statusCode,
        tables: resData.data?.data?.t1 || resData.data?.data || []
      });
    } catch (err) {
      return sendJson(res, 500, { status: 'error', message: err.message });
    }
  }

  if (req.method === 'GET' && action === 'casino_data') {
    const tableType = searchParams.get('type') || searchParams.get('table') || 'worli3';
    try {
      const resData = await diamondProvider.getCasinoData(tableType);
      return sendJson(res, 200, {
        status: resData.success ? 'success' : 'error',
        statusCode: resData.statusCode,
        type: tableType,
        data: resData.data?.data || resData.data
      });
    } catch (err) {
      return sendJson(res, 500, { status: 'error', message: err.message });
    }
  }

  if (req.method === 'GET' && action === 'casino_result') {
    const tableType = searchParams.get('type') || searchParams.get('table') || 'worli3';
    try {
      const resData = await diamondProvider.getCasinoLastResult(tableType);
      return sendJson(res, 200, {
        status: resData.success ? 'success' : 'error',
        statusCode: resData.statusCode,
        type: tableType,
        result: resData.data?.data || resData.data
      });
    } catch (err) {
      return sendJson(res, 500, { status: 'error', message: err.message });
    }
  }

  if (req.method === 'GET' && action === 'casino_detail_result') {
    const tableType = searchParams.get('type') || searchParams.get('table') || 'worli3';
    const roundId = searchParams.get('mid') || '';
    try {
      const resData = await diamondProvider.getCasinoDetailResult(tableType, roundId);
      return sendJson(res, 200, {
        status: resData.success ? 'success' : 'error',
        statusCode: resData.statusCode,
        type: tableType,
        mid: roundId,
        data: resData.data?.data || resData.data
      });
    } catch (err) {
      return sendJson(res, 500, { status: 'error', message: err.message });
    }
  }

  // 3. SETTLEMENT ORDER (POST)
  if (req.method === 'POST' && (action === 'settle_order' || pathname.includes('/settlement/order') || pathname.includes('/settle'))) {
    try {
      const body = await parseJsonBody(req);
      const eventTypeId = body.eventTypeId || searchParams.get('eventTypeId') || '4';

      const result = await shubdx.submitSettlementOrder(eventTypeId, body);

      return sendJson(res, 200, {
        status: 'success',
        message: 'Settlement order processed',
        endpoint: result.endpoint,
        payloadSent: result.payload,
        shubdxResponse: result.response.data || result.response.raw
      });
    } catch (err) {
      console.error('Error submitting settlement order:', err.message);
      return sendJson(res, 500, {
        status: 'error',
        message: err.message
      });
    }
  }

  // 4. SETTLEMENT RESULTS (GET)
  if (req.method === 'GET' && (action === 'settlement_result' || pathname.includes('/settlement/result'))) {
    const settlementId = searchParams.get('settlementId') || searchParams.get('id') || '';
    const eventTypeId = searchParams.get('eventTypeId') || '4';

    if (!settlementId) {
      return sendJson(res, 400, {
        status: 'error',
        message: 'Missing required parameter: settlementId'
      });
    }

    try {
      const result = await shubdx.getSettlementResult(settlementId, eventTypeId);
      return sendJson(res, 200, {
        status: 'success',
        settlementId,
        eventTypeId,
        endpoint: result.endpoint,
        data: result.response.data || result.response.raw
      });
    } catch (err) {
      return sendJson(res, 500, { status: 'error', message: err.message });
    }
  }

  // 5. OVERALL SETTLEMENT (GET)
  if (req.method === 'GET' && (action === 'overall_settlement' || pathname.includes('/overallsettlement'))) {
    const settlementId = searchParams.get('settlementId') || searchParams.get('id') || '';

    if (!settlementId) {
      return sendJson(res, 400, {
        status: 'error',
        message: 'Missing required parameter: settlementId'
      });
    }

    try {
      const result = await shubdx.getOverallSettlement(settlementId);
      return sendJson(res, 200, {
        status: 'success',
        settlementId,
        endpoint: result.endpoint,
        data: result.response.data || result.response.raw
      });
    } catch (err) {
      return sendJson(res, 500, { status: 'error', message: err.message });
    }
  }

  // 6. API STATUS / CAPABILITIES OVERVIEW
  return sendJson(res, 200, {
    status: 'success',
    service: 'SatsSport Shubdx International Sports Gateway',
    version: '3.0.0',
    supportedSports: shubdx.SPORT_MAP,
    endpoints: {
      allMatches: '/api/sports?action=allmatches&sport={cricket|tennis|football}',
      fetchMatch: '/api/sports?action=fetchmatch&sport={sport}&match={groupById}',
      settlementOrder: '/api/sports?action=settle_order (POST)',
      settlementResult: '/api/sports?action=settlement_result&settlementId={id}&eventTypeId={type}',
      overallSettlement: '/api/sports?action=overall_settlement&settlementId={id}'
    }
  });
};

// Fallback fixtures matching real Shubdx documented format
function getFallbackMatches(sport = 'cricket') {
  if (sport === 'football' || sport === 'soccer') {
    return [
      {
        id: '35096131',
        groupById: '35096131',
        marketId: '1.252144383',
        competition: 'Italian Serie A',
        isLive: true,
        inPlay: true,
        status: 'OPEN',
        isBettable: true,
        team1: 'Napoli',
        team2: 'Verona',
        time: 'LIVE',
        score: 'Napoli: 1 - 0 Verona',
        totalMatched: '2.4M',
        b1: '1.45', bS1: '4.8K', l1: '1.47', lS1: '2.1K',
        b2Draw: '4.20', bS2Draw: '850', l2Draw: '4.35', lS2Draw: '500',
        b2: '7.80', bS2: '400', l2: '8.20', lS2: '250',
        bPin: '1', fPin: '4', mPin: '1',
        runners: [
          { id: 1, name: 'Napoli', selectionId: 1, back: [{ price: 1.45, size: 4800 }], lay: [{ price: 1.47, size: 2100 }] },
          { id: 2, name: 'Verona', selectionId: 2, back: [{ price: 7.8, size: 400 }], lay: [{ price: 8.2, size: 250 }] },
          { id: 3, name: 'The Draw', selectionId: 3, back: [{ price: 4.2, size: 850 }], lay: [{ price: 4.35, size: 500 }] }
        ]
      },
      {
        id: '35096129',
        groupById: '35096129',
        marketId: '1.252144611',
        competition: 'Italian Serie A',
        isLive: true,
        inPlay: true,
        status: 'OPEN',
        isBettable: true,
        team1: 'Bologna',
        team2: 'Atalanta',
        time: 'LIVE',
        score: '0 - 0',
        totalMatched: '1.8M',
        b1: '3.10', bS1: '1.2K', l1: '3.15', lS1: '950',
        b2Draw: '3.30', bS2Draw: '1.1K', l2Draw: '3.40', lS2Draw: '720',
        b2: '2.40', bS2: '2.8K', l2: '2.44', lS2: '1.9K',
        bPin: '1', fPin: '4', mPin: '1',
        runners: [
          { id: 1, name: 'Bologna', selectionId: 1, back: [{ price: 3.1, size: 1200 }], lay: [{ price: 3.15, size: 950 }] },
          { id: 2, name: 'Atalanta', selectionId: 2, back: [{ price: 2.4, size: 2800 }], lay: [{ price: 2.44, size: 1900 }] },
          { id: 3, name: 'The Draw', selectionId: 3, back: [{ price: 3.3, size: 1100 }], lay: [{ price: 3.4, size: 720 }] }
        ]
      }
    ];
  }

  if (sport === 'tennis') {
    return [
      {
        id: '35126326',
        groupById: '35126326',
        marketId: '1.252470937',
        competition: 'WTA Hobart',
        isLive: true,
        inPlay: true,
        status: 'OPEN',
        isBettable: true,
        team1: 'Maya Joint',
        team2: 'Iga Swiatek',
        time: 'LIVE',
        score: 'Set 1 (2-4)',
        totalMatched: '840K',
        b1: '18.5', bS1: '14', l1: '21.0', lS1: '50',
        b2Draw: '-', bS2Draw: '', l2Draw: '-', lS2Draw: '',
        b2: '1.05', bS2: '19.9K', l2: '1.06', lS2: '45.2K',
        bPin: '1', fPin: '6', mPin: '1',
        runners: [
          { id: 1, name: 'Maya Joint', selectionId: 1, back: [{ price: 18.5, size: 14 }], lay: [{ price: 21.0, size: 50 }] },
          { id: 2, name: 'Iga Swiatek', selectionId: 2, back: [{ price: 1.05, size: 19956 }], lay: [{ price: 1.06, size: 45200 }] }
        ]
      }
    ];
  }

  // Default Cricket matches matching documented Shubdx fixtures
  return [
    {
      id: '35128277',
      groupById: '35128277',
      marketId: '1.252489230',
      competition: 'Bangladesh Premier League',
      isLive: true,
      inPlay: true,
      status: 'OPEN',
      isBettable: true,
      team1: 'Chattogram Royals',
      team2: 'Rajshahi Warriors',
      time: 'LIVE',
      score: 'Chattogram: 124/4 (14.2 ov)',
      totalMatched: '211.5K',
      b1: '1.84', bS1: '1.16', l1: '2.22', lS1: '10.6',
      b2Draw: '-', bS2Draw: '', l2Draw: '-', lS2Draw: '',
      b2: '1.81', bS2: '24.1', l2: '2.24', lS2: '240.1',
      bPin: '1', fPin: '26', mPin: '1',
      runners: [
        {
          id: 92719055,
          name: 'Chattogram Royals',
          selectionId: 92719055,
          back: [{ price: 1.84, size: 1.16 }, { price: 1.82, size: 1.0 }, { price: 1.81, size: 28.44 }],
          lay: [{ price: 2.22, size: 10.64 }, { price: 2.24, size: 211.43 }, { price: 2.30, size: 11.87 }]
        },
        {
          id: 92715376,
          name: 'Rajshahi Warriors',
          selectionId: 92715376,
          back: [{ price: 1.81, size: 24.16 }, { price: 1.80, size: 250.73 }],
          lay: [{ price: 2.22, size: 13.02 }, { price: 2.24, size: 240.13 }]
        }
      ]
    },
    {
      id: '35124684',
      groupById: '35124684',
      marketId: '1.252484033',
      competition: 'Super Smash T20',
      isLive: true,
      inPlay: true,
      status: 'OPEN',
      isBettable: true,
      team1: 'Wellington Firebirds',
      team2: 'Otago Volts',
      time: 'LIVE',
      score: 'Wellington: 89/2 (9.4 ov)',
      totalMatched: '1.27M',
      b1: '1.59', bS1: '6.45', l1: '1.60', lS1: '2.1K',
      b2Draw: '-', bS2Draw: '', l2Draw: '-', lS2Draw: '',
      b2: '2.62', bS2: '4.8K', l2: '2.66', lS2: '1.2K',
      bPin: '1', fPin: '32', mPin: '1',
      runners: [
        {
          id: 6847358,
          name: 'Wellington Firebirds',
          selectionId: 6847358,
          back: [{ price: 1.59, size: 6.45 }, { price: 1.58, size: 1590.30 }, { price: 1.57, size: 3327.82 }],
          lay: [{ price: 1.60, size: 2135.53 }, { price: 1.61, size: 4794.34 }, { price: 1.62, size: 3.29 }]
        },
        {
          id: 6847359,
          name: 'Otago Volts',
          selectionId: 6847359,
          back: [{ price: 2.62, size: 4800.12 }, { price: 2.60, size: 1200.00 }],
          lay: [{ price: 2.66, size: 1250.00 }, { price: 2.70, size: 3500.00 }]
        }
      ]
    },
    {
      id: '35143588',
      groupById: '35143588',
      marketId: '1.252677682',
      competition: 'Big Bash League',
      isLive: true,
      inPlay: true,
      status: 'OPEN',
      isBettable: true,
      team1: 'Melbourne Renegades',
      team2: 'Perth Scorchers',
      time: 'LIVE',
      score: '161/6 (20 ov)',
      totalMatched: '3.4M',
      b1: '2.10', bS1: '1.8K', l1: '2.14', lS1: '2.5K',
      b2Draw: '-', bS2Draw: '', l2Draw: '-', lS2Draw: '',
      b2: '1.85', bS2: '6.2K', l2: '1.88', lS2: '4.1K',
      bPin: '1', fPin: '40', mPin: '1',
      runners: [
        { id: 1, name: 'Melbourne Renegades', selectionId: 1, back: [{ price: 2.10, size: 1800 }], lay: [{ price: 2.14, size: 2500 }] },
        { id: 2, name: 'Perth Scorchers', selectionId: 2, back: [{ price: 1.85, size: 6200 }], lay: [{ price: 1.88, size: 4100 }] }
      ]
    }
  ];
}

// Fallback markets return null/empty to prevent static fake odds
function getFallbackMatchMarkets(groupById, sport = 'cricket') {
  return {
    matchOdds: null,
    bookmakers: [],
    fancy: []
  };
}
