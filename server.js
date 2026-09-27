const http = require('http');
const fs = require('fs');
const path = require('path');

// Configuration (read from sportbex_config.json if present)
let config = {
  apiKey: '',
  baseUrl: 'https://trial-api.sportbex.com/api',
  cacheTtlMs: 15000,
  port: 8085
};

try {
  const cfgPath = path.join(__dirname, 'sportbex_config.json');
  if (fs.existsSync(cfgPath)) {
    const loaded = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    config = { ...config, ...loaded };
  }
} catch (e) {
  // Graceful fallback to env vars or defaults
}

// Environment variables take top precedence
if (process.env.SPORTBEX_API_KEY) config.apiKey = process.env.SPORTBEX_API_KEY;
if (process.env.SPORTBEX_BASE_URL) config.baseUrl = process.env.SPORTBEX_BASE_URL;
if (process.env.PORT) config.port = parseInt(process.env.PORT, 10);

let cachedLiveData = null;
let lastCacheTime = 0;

function formatVolume(val) {
  const n = parseFloat(val);
  if (isNaN(n) || n === 0) return '';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toFixed(0);
}

async function fetchSportbexLiveCricket() {
  const now = Date.now();
  if (cachedLiveData && (now - lastCacheTime < config.cacheTtlMs)) {
    return cachedLiveData;
  }

  if (!config.apiKey) {
    if (cachedLiveData) return cachedLiveData;
    return { status: 'error', message: 'No API key configured', matches: [] };
  }

  const headers = {
    'sportbex-api-key': config.apiKey,
    'Content-Type': 'application/json'
  };

  try {
    // 1. Fetch live matches
    let liveMatches = [];
    try {
      const liveScoreRes = await fetch(`${config.baseUrl}/live-score/match/live`, { headers, signal: AbortSignal.timeout(6000) });
      const liveScoreJson = await liveScoreRes.json();
      liveMatches = liveScoreJson.data || [];
    } catch (e) {
      console.error('Live score error:', e.message);
    }

    // 2. Fetch cricket competitions
    let competitions = [];
    try {
      const compRes = await fetch(`${config.baseUrl}/betfair/competition-list/4`, { headers, signal: AbortSignal.timeout(6000) });
      competitions = await compRes.json();
      if (!Array.isArray(competitions)) competitions = [];
    } catch (e) {
      console.error('Competitions error:', e.message);
    }

    // Find competitions with events
    const topComps = competitions.slice(0, 8);
    const eventPromises = topComps.map(async c => {
      try {
        const evRes = await fetch(`${config.baseUrl}/betfair/event-list/4/${c.competition.id}`, { headers, signal: AbortSignal.timeout(6000) });
        const evJson = await evRes.json();
        return Array.isArray(evJson) ? evJson.map(e => ({ ...e, competitionName: c.competition.name })) : [];
      } catch {
        return [];
      }
    });

    const eventsNested = await Promise.all(eventPromises);
    const allEvents = eventsNested.flat();

    // 3. For top events, fetch markets
    const targetEvents = allEvents.slice(0, 8);
    const marketPromises = targetEvents.map(async ev => {
      try {
        const mRes = await fetch(`${config.baseUrl}/betfair/market-all-list/${ev.event.id}`, { headers, signal: AbortSignal.timeout(6000) });
        const mJson = await mRes.json();
        const matchOdds = Array.isArray(mJson) ? (mJson.find(m => m.marketName === 'Match Odds') || mJson[0]) : null;
        return { event: ev, market: matchOdds };
      } catch {
        return { event: ev, market: null };
      }
    });

    const eventMarkets = await Promise.all(marketPromises);
    const validMarkets = eventMarkets.filter(em => em.market && em.market.marketId);

    // 4. Batch fetch odds for these markets
    let oddsMap = {};
    if (validMarkets.length > 0) {
      const marketIds = validMarkets.map(vm => vm.market.marketId);
      try {
        const oddsRes = await fetch(`${config.baseUrl}/betfair/listMarketBook`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ marketIds }),
          signal: AbortSignal.timeout(6000)
        });
        const oddsJson = await oddsRes.json();
        const oddsList = oddsJson.data || (Array.isArray(oddsJson) ? oddsJson : []);
        oddsList.forEach(o => {
          oddsMap[o.marketId] = o;
        });
      } catch (e) {
        console.error('Odds fetch error:', e.message);
      }
    }

    // 5. Construct formatted matches
    const formattedMatches = validMarkets.map(vm => {
      const ev = vm.event.event;
      const mkt = vm.market;
      const odds = oddsMap[mkt.marketId];
      
      const runnersMeta = mkt.runners || [];
      const runnerOdds = odds?.runners || [];

      // Split event name e.g. "India v West Indies"
      const nameParts = ev.name.split(/\s+v\s+|\s+vs\s+/i);
      const team1 = nameParts[0] ? nameParts[0].trim() : (runnersMeta[0]?.runnerName || 'Team 1');
      const team2 = nameParts[1] ? nameParts[1].trim() : (runnersMeta[1]?.runnerName || 'Team 2');

      // Match live score if available
      const liveScoreMatch = liveMatches.find(lm => {
        const t1 = (lm.teams?.t1?.name || '').toLowerCase();
        const t2 = (lm.teams?.t2?.name || '').toLowerCase();
        return (t1.includes(team1.toLowerCase()) || team1.toLowerCase().includes(t1)) &&
               (t2.includes(team2.toLowerCase()) || team2.toLowerCase().includes(t2));
      });

      const scoreText = liveScoreMatch ? (liveScoreMatch.teams?.t1?.score ? `${team1}: ${liveScoreMatch.teams.t1.score}` : `${team2}: ${liveScoreMatch.teams?.t2?.score}`) : '';

      // Runner 1 odds
      const r1 = runnerOdds[0] || {};
      const b1 = r1.ex?.availableToBack?.[0]?.price ? String(r1.ex.availableToBack[0].price) : '-';
      const bS1 = r1.ex?.availableToBack?.[0]?.size ? formatVolume(r1.ex.availableToBack[0].size) : '';
      const l1 = r1.ex?.availableToLay?.[0]?.price ? String(r1.ex.availableToLay[0].price) : '-';
      const lS1 = r1.ex?.availableToLay?.[0]?.size ? formatVolume(r1.ex.availableToLay[0].size) : '';

      // Runner 2 odds
      const r2 = runnerOdds[1] || {};
      const b2 = r2.ex?.availableToBack?.[0]?.price ? String(r2.ex.availableToBack[0].price) : '-';
      const bS2 = r2.ex?.availableToBack?.[0]?.size ? formatVolume(r2.ex.availableToBack[0].size) : '';
      const l2 = r2.ex?.availableToLay?.[0]?.price ? String(r2.ex.availableToLay[0].price) : '-';
      const lS2 = r2.ex?.availableToLay?.[0]?.size ? formatVolume(r2.ex.availableToLay[0].size) : '';

      // Runner 3 (Draw) if 3 runners
      let b2Draw = '-', bS2Draw = '', l2Draw = '-', lS2Draw = '';
      if (runnerOdds.length > 2) {
        const r3 = runnerOdds[2];
        b2Draw = r3.ex?.availableToBack?.[0]?.price ? String(r3.ex.availableToBack[0].price) : '-';
        bS2Draw = r3.ex?.availableToBack?.[0]?.size ? formatVolume(r3.ex.availableToBack[0].size) : '';
        l2Draw = r3.ex?.availableToLay?.[0]?.price ? String(r3.ex.availableToLay[0].price) : '-';
        lS2Draw = r3.ex?.availableToLay?.[0]?.size ? formatVolume(r3.ex.availableToLay[0].size) : '';
      }

      return {
        id: ev.id,
        marketId: mkt.marketId,
        competition: vm.event.competitionName || 'Cricket Match',
        isLive: odds?.inplay ?? true,
        team1,
        team2,
        time: scoreText || (odds?.inplay ? 'LIVE' : 'In-Play'),
        score: scoreText,
        totalMatched: odds?.totalMatched ? formatVolume(odds.totalMatched) : '',
        b1, bS1, l1, lS1,
        b2Draw, bS2Draw, l2Draw, lS2Draw,
        b2, bS2, l2, lS2,
        bPin: '1', fPin: String(vm.event.marketCount || '22'), mPin: '1',
        runners: runnerOdds.map((ro, idx) => ({
          name: runnersMeta[idx]?.runnerName || (idx === 0 ? team1 : (idx === 1 ? team2 : 'The Draw')),
          selectionId: ro.selectionId,
          back: ro.ex?.availableToBack || [],
          lay: ro.ex?.availableToLay || []
        }))
      };
    });

    cachedLiveData = {
      status: 'success',
      timestamp: new Date().toISOString(),
      source: 'Sportbex Live API',
      matches: formattedMatches
    };
    lastCacheTime = now;
    return cachedLiveData;
  } catch (err) {
    console.error('Error in Sportbex live cricket fetch:', err.message);
    if (cachedLiveData) return cachedLiveData;
    return { status: 'error', message: err.message, matches: [] };
  }
}

// MIME types
const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml'
};

const server = http.createServer(async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, sportbex-api-key');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // API endpoint for Sportbex Live Cricket
  if (pathname === '/api/sportbex/cricket/live') {
    try {
      const data = await fetchSportbexLiveCricket();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'error', message: e.message }));
    }
    return;
  }

  // Static file serving
  let filePath = pathname === '/' ? '/index.html' : pathname;
  filePath = path.join(__dirname, filePath);

  try {
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath);
      const mime = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': mime });
      fs.createReadStream(filePath).pipe(res);
    } else {
      res.statusCode = 404;
      res.end('Not Found');
    }
  } catch (err) {
    res.statusCode = 500;
    res.end('Server Error: ' + err.message);
  }
});

server.listen(config.port, () => {
  console.log(`Satsport Server running at http://localhost:${config.port}/ with Sportbex Live API Proxy enabled`);
});
