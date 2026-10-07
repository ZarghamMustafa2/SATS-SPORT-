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


// In-Memory Cache for Live Match Polling (reduces rate load on upstream API)
let cachedMatches = {};
let lastCacheTimes = {};
const CACHE_TTL_MS = 15000;

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
        `${providersConf.diamond?.baseUrl || 'http://77.37.44.135:3009'}/allSportid`,
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
            role: 'CANDIDATE PROVIDER (DORMANT)',
            baseUrl: providersConf.diamond?.baseUrl || 'http://77.37.44.135:3009',
            docsUrl: 'http://77.37.44.135:3009/docs',
            specUrl: 'http://77.37.44.135:3009/docs.json',
            environment: 'Production VPS (Mumbai, Hostinger AS47583)',
            authType: 'Query Key (?key=) OR Server IP Whitelist',
            hasKey: providersConf.diamond?.hasKey || false,
            maskedKey: providersConf.diamond?.apiKey || 'Not Configured',
            overallStatus: diamondDiag.overallStatus,
            connectionStatus: diamondDiag.connectionStatus,
            networkReachability: diamondDiag.networkReachability,
            authentication: diamondDiag.authentication,
            liveData: diamondDiag.liveData,
            dataAvailability: diamondDiag.dataAvailability,
            dataSource: diamondDiag.dataSource,
            httpStatus: diamondDiag.httpStatus,
            status: diamondDiag.overallStatus,
            isAuthorized: isDiamondLive,
            clientIpSeen: diamondDiag.clientIpSeen,
            upstreamMessage: diamondDiag.error || 'OK',
            lastTest: diamondHealth.timestamp || new Date().toISOString(),
            endpoints: [
              { method: 'GET', path: '/allSportid', purpose: 'All Sport IDs list' },
              { method: 'GET', path: '/esid?sid={sid}', purpose: 'Match list for specific sport ID' },
              { method: 'GET', path: '/tree', purpose: 'All sports match hierarchy tree' },
              { method: 'GET', path: '/getDetailsData?sid={sid}&gmid={gmid}', purpose: 'Match details and graphic tracker ID (gtv)' },
              { method: 'GET', path: '/getPriveteData?sid={sid}&gmid={gmid}', purpose: 'Unified Match Odds, Bookmaker, and Fancy lines' },
              { method: 'GET', path: '/score?sid={sid}&gtv={gtv}', purpose: 'Live graphic scorecard iframe widget' },
              { method: 'POST', path: '/placed_bets', purpose: 'Submit user bet order' },
              { method: 'POST', path: '/get-result', purpose: 'Query settlement result for placed bet' },
              { method: 'GET', path: '/get_placed_bets?event_id={id}', purpose: 'All declared event results' },
              { method: 'GET', path: '/casino/tableid', purpose: 'List of all Casino table IDs' },
              { method: 'GET', path: '/casino/data?type={type}', purpose: 'Casino game live data' },
              { method: 'GET', path: '/casino/result?type={type}', purpose: 'Casino last round outcome' },
              { method: 'GET', path: '/casino/detail_result?type={type}&mid={mid}', purpose: 'Casino round detail result' }
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
          cricket: { name: 'Cricket', status: isShubdxLive ? 'LIVE' : 'FALLBACK / OFFLINE', isLive: isShubdxLive, provider: activeProvider },
          football: { name: 'Football', status: isShubdxLive ? 'LIVE' : 'FALLBACK / OFFLINE', isLive: isShubdxLive, provider: activeProvider },
          tennis: { name: 'Tennis', status: isShubdxLive ? 'LIVE' : 'FALLBACK / OFFLINE', isLive: isShubdxLive, provider: activeProvider },
          inPlay: { name: 'In-Play', status: isShubdxLive ? 'LIVE' : 'FALLBACK / OFFLINE', isLive: isShubdxLive, provider: activeProvider },
          odds: { name: 'Match Odds Ladder', status: isShubdxLive ? 'LIVE' : 'FALLBACK / OFFLINE', isLive: isShubdxLive, provider: activeProvider },
          bookmaker: { name: 'Bookmaker Odds', status: isShubdxLive ? 'LIVE' : 'FALLBACK / OFFLINE', isLive: isShubdxLive, provider: activeProvider },
          fancy: { name: 'Fancy / Session Lines', status: isShubdxLive ? 'LIVE' : 'FALLBACK / OFFLINE', isLive: isShubdxLive, provider: activeProvider }
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

      const fallbackMarkets = getFallbackMatchMarkets(groupById, sportsname);

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
    const { sportsname, eventTypeId, name } = shubdx.resolveSport(sportParam);
    const cacheKey = `allmatches_${sportsname}`;
    const now = Date.now();

    if (cachedMatches[cacheKey] && (now - (lastCacheTimes[cacheKey] || 0) < CACHE_TTL_MS)) {
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

// Full categorized markets matching Shubdx fetchmatch documentation
function getFallbackMatchMarkets(groupById, sport = 'cricket') {
  return {
    matchOdds: {
      op: 'Betfair',
      id: '1.252484033',
      groupById: groupById || '35124684',
      name: 'Match Odds',
      exchangeId: '1',
      btype: 'ODDS',
      mtype: 'MATCH_ODDS',
      inPlay: true,
      status: 'OPEN',
      providerId: 1,
      matched: 1278818,
      runners: [
        {
          id: 6847358,
          name: 'Wellington Firebirds',
          back: [
            { price: 1.59, size: 6.45, line: null },
            { price: 1.58, size: 1590.3, line: null },
            { price: 1.57, size: 3327.82, line: null }
          ],
          lay: [
            { price: 1.6, size: 2135.53, line: null },
            { price: 1.61, size: 4794.34, line: null },
            { price: 1.62, size: 3.29, line: null }
          ],
          lastPriceTraded: 1.6,
          totalMatched: 1245351.4,
          status: 'ACTIVE'
        },
        {
          id: 6847359,
          name: 'Otago Volts',
          back: [
            { price: 2.62, size: 4800.12, line: null },
            { price: 2.60, size: 1200.0, line: null }
          ],
          lay: [
            { price: 2.66, size: 1250.0, line: null },
            { price: 2.70, size: 3500.0, line: null }
          ],
          lastPriceTraded: 2.64,
          totalMatched: 33466.6,
          status: 'ACTIVE'
        }
      ]
    },
    bookmakers: [
      {
        op: 'BB_BM',
        id: '1.2671800_SB',
        groupById: groupById || '35124684',
        name: 'BOOKMAKER',
        exchangeId: '5',
        btype: 'ODDS',
        mtype: 'MATCH_ODDS_SB',
        inPlay: true,
        status: 'OPEN',
        providerId: 5,
        matched: null,
        runners: [
          {
            id: 6847358,
            name: 'Wellington Firebirds',
            back: [{ price: 1.60, size: 500, line: null }],
            lay: [{ price: 1.65, size: 500, line: null }],
            status: 'ACTIVE'
          },
          {
            id: 6847359,
            name: 'Otago Volts',
            back: [{ price: 2.55, size: 500, line: null }],
            lay: [{ price: 2.62, size: 500, line: null }],
            status: 'ACTIVE'
          }
        ]
      }
    ],
    fancy: {
      'Fancy': [
        {
          op: 'BB_FANCY',
          id: '1.252484033-4874860.FY',
          groupById: groupById || '35124684',
          name: '10 Over WF',
          exchangeId: '1',
          btype: 'LINE',
          mtype: 'INNINGS_RUNS',
          inPlay: true,
          status: 'OPEN',
          oddsType: 'HAAR_JEET',
          providerId: 2,
          dTtabGroupName: 'Fancy',
          runners: [
            {
              id: 1,
              name: '10 Over WF',
              back: [{ price: 100, size: 250, line: 89 }],
              lay: [{ price: 100, size: 250, line: 88 }],
              status: 'ACTIVE'
            }
          ]
        },
        {
          op: 'BB_FANCY',
          id: '1.252484033-4874861.FY',
          groupById: groupById || '35124684',
          name: '15 Over WF',
          exchangeId: '1',
          btype: 'LINE',
          mtype: 'INNINGS_RUNS',
          inPlay: true,
          status: 'OPEN',
          oddsType: 'HAAR_JEET',
          providerId: 2,
          dTtabGroupName: 'Fancy',
          runners: [
            {
              id: 2,
              name: '15 Over WF',
              back: [{ price: 100, size: 200, line: 138 }],
              lay: [{ price: 100, size: 200, line: 136 }],
              status: 'ACTIVE'
            }
          ]
        }
      ],
      'Run Bhav': [
        {
          op: 'BB_FANCY',
          id: '1.252484033-4874862.FY',
          groupById: groupById || '35124684',
          name: 'Lambi WF 1',
          exchangeId: '1',
          btype: 'LINE',
          mtype: 'INNINGS_RUNS',
          inPlay: true,
          status: 'OPEN',
          oddsType: 'HAAR_JEET',
          providerId: 2,
          dTtabGroupName: 'Run Bhav',
          runners: [
            {
              id: 3,
              name: 'Lambi WF 1',
              back: [{ price: 100, size: 300, line: 178 }],
              lay: [{ price: 100, size: 300, line: 175 }],
              status: 'ACTIVE'
            }
          ]
        }
      ],
      'Odd Even': [
        {
          op: 'BB_FANCY',
          id: '1.252484033-4874863.FY',
          groupById: groupById || '35124684',
          name: '10 Over WF Odd/Even',
          exchangeId: '1',
          btype: 'LINE',
          mtype: 'ODD_EVEN',
          inPlay: true,
          status: 'OPEN',
          oddsType: 'HAAR_JEET',
          providerId: 2,
          dTtabGroupName: 'Odd Even',
          runners: [
            {
              id: 4,
              name: 'Odd',
              back: [{ price: 95, size: 100, line: 1 }],
              lay: [{ price: 105, size: 100, line: 1 }],
              status: 'ACTIVE'
            },
            {
              id: 5,
              name: 'Even',
              back: [{ price: 95, size: 100, line: 2 }],
              lay: [{ price: 105, size: 100, line: 2 }],
              status: 'ACTIVE'
            }
          ]
        }
      ],
      'Over by Over Session Market': []
    },
    premium: [
      {
        id: '1.63403885.877.maxovers=20~total=175.5~inningnr=1_BR',
        groupById: groupById || '35124684',
        name: '1st innings - Wellington Firebirds total',
        exchangeId: '5',
        btype: 'ODDS',
        mtype: 'MATCH_ODDS_SB',
        inPlay: false,
        status: 'OPEN',
        providerId: 5,
        tabGroupName: 'Premium Cricket',
        runners: [
          {
            id: 1,
            name: 'over 175.5',
            back: [{ price: 1.37, size: 100, line: null }],
            lay: [],
            status: 'ACTIVE'
          },
          {
            id: 2,
            name: 'under 175.5',
            back: [{ price: 2.85, size: 100, line: null }],
            lay: [],
            status: 'ACTIVE'
          }
        ]
      }
    ],
    other: []
  };
}
