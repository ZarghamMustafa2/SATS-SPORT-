const sportsHandler = require('../api/sports/index');
const settingsDb = require('../lib/settings_db');

function mockRequest(method, url, body = null, headers = {}) {
  const req = new (require('stream').Readable)();
  req.method = method;
  req.url = url;
  req.headers = { host: 'localhost:4000', ...headers };
  if (body) {
    req.push(JSON.stringify(body));
  }
  req.push(null);

  const res = {
    statusCode: 200,
    headers: {},
    body: '',
    setHeader(k, v) { this.headers[k] = v; },
    end(data) {
      if (data) this.body += data;
    }
  };

  return new Promise((resolve) => {
    res.end = function(data) {
      if (data) this.body += data;
      let json = null;
      try { json = JSON.parse(this.body); } catch(e) {}
      resolve({ statusCode: this.statusCode, headers: this.headers, json, raw: this.body });
    };
    sportsHandler(req, res).catch(err => {
      resolve({ statusCode: 500, error: err.message });
    });
  });
}

async function testSwitch() {
  console.log('Testing api_switch_provider to diamond...');
  const resSwitch = await mockRequest('POST', '/api/sports?action=api_switch_provider', { targetProvider: 'diamond' }, { 'x-company-key': 'satsport_root_company_key_2026' });
  console.log('Switch status:', resSwitch.statusCode, resSwitch.json);

  // Now query allmatches without provider param (should use diamond as active provider)
  console.log('\nQuerying /api/sports?action=allmatches&sport=cricket (default active provider)...');
  const resMatches = await mockRequest('GET', '/api/sports?action=allmatches&sport=cricket');
  console.log('Matches status:', resMatches.statusCode, {
    dataSource: resMatches.json?.dataSource,
    isLiveDiamond: resMatches.json?.isLiveDiamond,
    provider: resMatches.json?.provider,
    count: resMatches.json?.count
  });

  // Also query football
  console.log('\nQuerying /api/sports?action=allmatches&sport=football...');
  const resFoot = await mockRequest('GET', '/api/sports?action=allmatches&sport=football');
  console.log('Football matches status:', resFoot.statusCode, {
    dataSource: resFoot.json?.dataSource,
    isLiveDiamond: resFoot.json?.isLiveDiamond,
    provider: resFoot.json?.provider,
    count: resFoot.json?.count
  });

  // Also query tennis
  console.log('\nQuerying /api/sports?action=allmatches&sport=tennis...');
  const resTennis = await mockRequest('GET', '/api/sports?action=allmatches&sport=tennis');
  console.log('Tennis matches status:', resTennis.statusCode, {
    dataSource: resTennis.json?.dataSource,
    isLiveDiamond: resTennis.json?.isLiveDiamond,
    provider: resTennis.json?.provider,
    count: resTennis.json?.count
  });
}

testSwitch().catch(console.error);
