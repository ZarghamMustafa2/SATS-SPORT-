// scripts/test_backend_live.js
const http = require('http');

async function testBackend() {
  const handler = require('../api/sports/index.js');

  const testCases = [
    { url: '/api/sports?action=directory', name: 'Directory' },
    { url: '/api/sports?action=allmatches&sport=horse', name: 'Horse Racing Matches' },
    { url: '/api/sports?action=allmatches&sport=greyhound', name: 'Greyhound Racing Matches' },
    { url: '/api/sports?action=allmatches&sport=tabletennis', name: 'Table Tennis Matches' },
    { url: '/api/sports?action=allmatches&sport=basketball', name: 'Basketball Matches' },
    { url: '/api/sports?action=tv&sport=cricket&match=640154297', name: 'TV Streaming' },
    { url: '/api/sports?action=score&sport=cricket&gtv=640154297', name: 'Score Tracker' },
    { url: '/api/sports?action=fetchmatch&sport=horse&match=755971259', name: 'Horse Race Fetchmatch' }
  ];

  for (const tc of testCases) {
    await new Promise((resolve) => {
      const mockReq = {
        method: 'GET',
        url: tc.url,
        headers: { host: 'localhost:3000' }
      };

      let statusCode = 200;
      let headers = {};
      let body = '';

      const mockRes = {
        setHeader: (k, v) => { headers[k] = v; },
        writeHead: (code, hdrs) => { statusCode = code; if (hdrs) headers = hdrs; },
        status: (code) => { statusCode = code; return mockRes; },
        json: (data) => {
          body = JSON.stringify(data);
          report();
        },
        end: (data) => {
          if (data) body += data;
          report();
        }
      };

      function report() {
        try {
          const parsed = JSON.parse(body);
          console.log(`\n========================================`);
          console.log(`TEST: ${tc.name} (${tc.url})`);
          console.log(`STATUS CODE: ${statusCode}`);
          if (Array.isArray(parsed.matches)) {
            console.log(`MATCHES COUNT: ${parsed.matches.length}`);
            if (parsed.matches.length > 0) {
              console.log(`SAMPLE MATCH:`, JSON.stringify(parsed.matches[0], null, 2).slice(0, 300));
            }
          } else if (parsed.sports) {
            console.log(`TOTAL SPORTS: ${parsed.allSportsCount}`);
            console.log(`PRIMARY: ${parsed.primarySports.map(s => s.name).join(', ')}`);
            console.log(`RACING: ${parsed.racingSports.map(s => s.name).join(', ')}`);
            console.log(`OTHER ACTIVE: ${parsed.otherActiveSports.map(s => s.name).join(', ')}`);
          } else {
            console.log(`RESPONSE:`, JSON.stringify(parsed, null, 2).slice(0, 300));
          }
        } catch (e) {
          console.log(`TEST: ${tc.name} => Raw body: ${body.slice(0, 150)}`);
        }
        resolve();
      }

      handler(mockReq, mockRes).catch(err => {
        console.error(`Error in ${tc.name}:`, err.message);
        resolve();
      });
    });
  }
}

testBackend().then(() => console.log('\nAll tests finished.'));
