/**
 * Shubdx International Sports API Client & Market Normalizer
 * Official Documentation Reference:
 * 1. All Matches: https://shubdxinternational.com/sports/documentation/allmatches
 * 2. Fetch Match: https://shubdxinternational.com/sports/documentation/fetchmatch
 * 3. Settlement: https://shubdxinternational.com/documentation/settlement
 */

const https = require('https');

const SHUBDX_BASE_URL = process.env.SHUBDX_BASE_URL || 'https://shubdxinternational.com';
const SHUBDX_SETTLEMENT_URL = process.env.SHUBDX_SETTLEMENT_URL || 'https://shubdxinternational.com/settlement';
const SHUBDX_ALT_SETTLEMENT_URL = 'https://settlement.shubdxinternational.com';

// Documented Sports Configuration & EventTypeIDs
const SPORT_MAP = {
  cricket: { eventTypeId: '4', name: 'Cricket', aliases: ['cricket', '4'] },
  tennis: { eventTypeId: '2', name: 'Tennis', aliases: ['tennis', '2'] },
  football: { eventTypeId: '1', name: 'Football', aliases: ['football', 'soccer', '1'] },
  basketball: { eventTypeId: '3', name: 'Basketball', aliases: ['basketball', '3'] },
  volleyball: { eventTypeId: '5', name: 'Volleyball', aliases: ['volleyball', '5'] },
  handball: { eventTypeId: '6', name: 'Handball', aliases: ['handball', '6'] },
  icehockey: { eventTypeId: '8', name: 'Ice Hockey', aliases: ['icehockey', '8'] },
  tabletennis: { eventTypeId: '9', name: 'Table Tennis', aliases: ['tabletennis', '9'] }
};

function resolveSport(sportInput) {
  if (!sportInput) return { sportsname: 'cricket', eventTypeId: '4', name: 'Cricket' };
  const lower = String(sportInput).toLowerCase().trim();
  for (const [key, conf] of Object.entries(SPORT_MAP)) {
    if (key === lower || conf.aliases.includes(lower)) {
      return { sportsname: key, eventTypeId: conf.eventTypeId, name: conf.name };
    }
  }
  return { sportsname: lower, eventTypeId: '4', name: 'Cricket' };
}

function formatVolume(val) {
  const n = parseFloat(val);
  if (isNaN(n) || n === 0) return '';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toFixed(0);
}

// Low-level HTTP Helper
function httpRequest(options, postData = null) {
  return new Promise((resolve) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (e) {
          // not json
        }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: json,
          raw: data
        });
      });
    });

    req.on('error', (err) => {
      resolve({
        statusCode: 0,
        headers: {},
        data: null,
        raw: '',
        error: err.message
      });
    });

    req.setTimeout(8000, () => {
      req.destroy();
      resolve({
        statusCode: 408,
        headers: {},
        data: null,
        raw: '',
        error: 'Request timeout (8000ms)'
      });
    });

    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

// 1. ALL MATCHES
async function getAllMatches(sportParam = 'cricket') {
  const { sportsname, eventTypeId } = resolveSport(sportParam);
  const targetUrl = new URL(`/sports/${sportsname}/allmatches`, SHUBDX_BASE_URL);

  const res = await httpRequest({
    hostname: targetUrl.hostname,
    port: targetUrl.port || 443,
    path: targetUrl.pathname + targetUrl.search,
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) SatsSport/2.0',
      'Accept': 'application/json'
    }
  });

  return {
    sportsname,
    eventTypeId,
    endpoint: targetUrl.href,
    response: res
  };
}

// 2. FETCH MATCH
async function getFetchMatch(sportParam = 'cricket', groupById = '') {
  const { sportsname, eventTypeId } = resolveSport(sportParam);
  const targetUrl = new URL(`/sports/${sportsname}/fetchmatch?match=${encodeURIComponent(groupById)}`, SHUBDX_BASE_URL);

  const res = await httpRequest({
    hostname: targetUrl.hostname,
    port: targetUrl.port || 443,
    path: targetUrl.pathname + targetUrl.search,
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) SatsSport/2.0',
      'Accept': 'application/json'
    }
  });

  return {
    sportsname,
    eventTypeId,
    groupById,
    endpoint: targetUrl.href,
    response: res
  };
}

// 3. SETTLEMENT ORDER (POST)
async function submitSettlementOrder(eventTypeId = '4', orderData = {}) {
  const path = `/settlement/order/${eventTypeId}`;
  const targetUrl = new URL(path, SHUBDX_BASE_URL);

  // Payload parameter serialization
  const params = new URLSearchParams();
  params.append('match_name', orderData.match_name || 'Match');
  params.append('market_id', orderData.market_id || '1.000000000');
  params.append('bet_id', String(orderData.bet_id || Math.floor(100000000 + Math.random() * 900000000)).substring(0, 9));
  params.append('selection_name', orderData.selection_name || 'Match Odds');
  params.append('side', orderData.side || 'back');
  params.append('rate', String(orderData.rate || 100));
  params.append('price', String(orderData.price || 1.95));
  params.append('fancy_rate', String(orderData.fancy_rate || 0));
  params.append('fancy_price', String(orderData.fancy_price || 0));
  params.append('stake', String(orderData.stake || 500));
  params.append('website', orderData.website || 'https://sats-sport.vercel.app');
  params.append('event_id', String(orderData.event_id || '0'));
  params.append('section_team', orderData.section_team || 'Team');

  const postBody = params.toString();

  const res = await httpRequest({
    hostname: targetUrl.hostname,
    port: targetUrl.port || 443,
    path: targetUrl.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(postBody),
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) SatsSport/2.0'
    }
  }, postBody);

  return {
    endpoint: targetUrl.href,
    eventTypeId,
    payload: Object.fromEntries(params.entries()),
    response: res
  };
}

// 4. SETTLEMENT RESULTS
async function getSettlementResult(settlementId, eventTypeId = '4') {
  const path = `/settlement/result/${settlementId}/${eventTypeId}`;
  const targetUrl = new URL(path, SHUBDX_BASE_URL);

  const res = await httpRequest({
    hostname: targetUrl.hostname,
    port: targetUrl.port || 443,
    path: targetUrl.pathname,
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) SatsSport/2.0',
      'Accept': 'application/json'
    }
  });

  return {
    endpoint: targetUrl.href,
    settlementId,
    eventTypeId,
    response: res
  };
}

// 5. OVERALL SETTLEMENT SUMMARY
async function getOverallSettlement(settlementId) {
  const path = `/results/${settlementId}/overallsettlement`;
  const targetUrl = new URL(path, SHUBDX_BASE_URL);

  const res = await httpRequest({
    hostname: targetUrl.hostname,
    port: targetUrl.port || 443,
    path: targetUrl.pathname,
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) SatsSport/2.0',
      'Accept': 'application/json'
    }
  });

  return {
    endpoint: targetUrl.href,
    settlementId,
    response: res
  };
}

// 6. MARKET CATEGORIZER
function categorizeMarkets(rawMarketList = []) {
  if (!Array.isArray(rawMarketList)) return { matchOdds: null, bookmakers: [], fancy: {}, premium: [], other: [] };

  let matchOdds = null;
  const bookmakers = [];
  const fancy = {
    'Fancy': [],
    'Run Bhav': [],
    'Odd Even': [],
    'Over by Over Session Market': [],
    'Other': []
  };
  const premium = [];
  const other = [];

  rawMarketList.forEach(m => {
    // 1. Betfair Exchange Match Odds
    if ((m.op === 'Betfair' || m.providerId === 1) && (m.mtype === 'MATCH_ODDS' || m.name === 'Match Odds')) {
      if (!matchOdds) matchOdds = m;
      return;
    }

    // 2. Bookmaker Markets
    if (m.isBookmaker || m.op === 'BB_BM' || (m.name && m.name.toUpperCase().includes('BOOKMAKER'))) {
      bookmakers.push(m);
      return;
    }

    // 3. Fancy Markets
    if (m.isFancy || m.op === 'BB_FANCY' || m.btype === 'LINE' || m.oddsType === 'HAAR_JEET') {
      const groupName = m.dTtabGroupName || m.tabGroupName || 'Fancy';
      if (!fancy[groupName]) fancy[groupName] = [];
      fancy[groupName].push(m);
      return;
    }

    // 4. Premium Exchange Markets
    if (m.isBetRadar || (m.id && String(m.id).endsWith('_BR')) || (m.tabGroupName && m.tabGroupName.includes('Premium'))) {
      premium.push(m);
      return;
    }

    other.push(m);
  });

  return {
    matchOdds,
    bookmakers,
    fancy,
    premium,
    other
  };
}

// 7. NORMALIZER FOR MATCH LIST (SATS SPORT UI FORMAT)
function normalizeShubdxMatches(rawResult = []) {
  if (!Array.isArray(rawResult)) return [];

  // Group markets by groupById to avoid duplicate fixtures
  const eventsMap = new Map();

  rawResult.forEach(m => {
    const groupKey = m.groupById || (m.event ? m.event.id : m.id);
    if (!groupKey) return;

    if (!eventsMap.has(groupKey)) {
      eventsMap.set(groupKey, {
        groupById: groupKey,
        mainMarket: m,
        allMarkets: [m]
      });
    } else {
      const entry = eventsMap.get(groupKey);
      entry.allMarkets.push(m);
      // Prefer Match Odds as main market for prices
      if (m.mtype === 'MATCH_ODDS' || m.op === 'Betfair') {
        entry.mainMarket = m;
      }
    }
  });

  const formattedMatches = [];

  for (const [groupKey, entry] of eventsMap.entries()) {
    const m = entry.mainMarket;
    const ev = m.event || {};
    const comp = m.competition || {};
    const runners = m.runners || [];

    // Parse team names from event.name or runners
    let team1 = 'Team 1';
    let team2 = 'Team 2';

    if (ev.name) {
      const parts = ev.name.split(/\s+v\s+|\s+vs\s+/i);
      if (parts.length >= 2) {
        team1 = parts[0].trim();
        team2 = parts[1].trim();
      } else {
        team1 = ev.name.trim();
        team2 = '';
      }
    } else if (runners.length >= 2) {
      team1 = runners[0].name || 'Team 1';
      team2 = runners[1].name || 'Team 2';
    }

    const r1 = runners[0] || {};
    const r2 = runners[1] || {};
    const r3 = runners[2] || null;

    // Prices and sizes
    const b1 = r1.back?.[0]?.price ? String(r1.back[0].price) : '-';
    const bS1 = r1.back?.[0]?.size ? formatVolume(r1.back[0].size) : '';
    const l1 = r1.lay?.[0]?.price ? String(r1.lay[0].price) : '-';
    const lS1 = r1.lay?.[0]?.size ? formatVolume(r1.lay[0].size) : '';

    const b2 = r2.back?.[0]?.price ? String(r2.back[0].price) : '-';
    const bS2 = r2.back?.[0]?.size ? formatVolume(r2.back[0].size) : '';
    const l2 = r2.lay?.[0]?.price ? String(r2.lay[0].price) : '-';
    const lS2 = r2.lay?.[0]?.size ? formatVolume(r2.lay[0].size) : '';

    let b2Draw = '-', bS2Draw = '', l2Draw = '-', lS2Draw = '';
    if (r3) {
      b2Draw = r3.back?.[0]?.price ? String(r3.back[0].price) : '-';
      bS2Draw = r3.back?.[0]?.size ? formatVolume(r3.back[0].size) : '';
      l2Draw = r3.lay?.[0]?.price ? String(r3.lay[0].price) : '-';
      lS2Draw = r3.lay?.[0]?.size ? formatVolume(r3.lay[0].size) : '';
    }

    const isLive = Boolean(m.inPlay);
    const timeStr = isLive ? 'LIVE' : (ev.openDate ? new Date(ev.openDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'In-Play');

    formattedMatches.push({
      id: groupKey,
      groupById: groupKey,
      marketId: m.id,
      competition: comp.name || 'Sports Match',
      isLive: isLive,
      inPlay: isLive,
      status: m.status || 'OPEN',
      isBettable: m.isBettable !== false,
      team1: team1,
      team2: team2,
      time: timeStr,
      score: '',
      totalMatched: m.matched ? formatVolume(m.matched) : '',
      b1, bS1, l1, lS1,
      b2Draw, bS2Draw, l2Draw, lS2Draw,
      b2, bS2, l2, lS2,
      bPin: '1',
      fPin: String(entry.allMarkets.length),
      mPin: '1',
      runners: runners.map((rn, idx) => ({
        id: rn.id,
        name: rn.name || (idx === 0 ? team1 : (idx === 1 ? team2 : 'The Draw')),
        selectionId: rn.id,
        back: rn.back || [],
        lay: rn.lay || [],
        status: rn.status || 'ACTIVE'
      })),
      allMarketsCount: entry.allMarkets.length
    });
  }

  return formattedMatches;
}

module.exports = {
  SPORT_MAP,
  resolveSport,
  formatVolume,
  httpRequest,
  getAllMatches,
  getFetchMatch,
  submitSettlementOrder,
  getSettlementResult,
  getOverallSettlement,
  categorizeMarkets,
  normalizeShubdxMatches
};
