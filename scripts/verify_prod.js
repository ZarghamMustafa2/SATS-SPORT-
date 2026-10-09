const https = require('https');

function get(url) {
  return new Promise((resolve) => {
    https.get(url, { timeout: 15000 }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        let j = null;
        try { j = JSON.parse(d); } catch (e) {}
        resolve({ status: res.statusCode, data: j, rawPreview: d.slice(0, 300) });
      });
    }).on('error', e => resolve({ status: 0, error: e.message }));
  });
}

async function verifyProd() {
  console.log('Testing production site https://satsportco.vercel.app ...');
  
  // Wait a few seconds for Vercel deployment
  for (let i = 1; i <= 6; i++) {
    console.log(`Poll attempt ${i}/6...`);
    const res = await get('https://satsportco.vercel.app/api/sports?action=allmatches&sport=cricket');
    console.log('Status:', res.status, 'Data source:', res.data?.dataSource, 'Count:', res.data?.count);
    if (res.data?.dataSource === 'LIVE_DIAMOND') {
      console.log('Production verified! Live Diamond feed active on Vercel.');
      break;
    }
    await new Promise(r => setTimeout(r, 8000));
  }

  // Also test casino tables
  const cRes = await get('https://satsportco.vercel.app/api/sports?action=casino_tables');
  console.log('Production casino tables status:', cRes.status, 'Tables count:', cRes.data?.tables?.length);
}

verifyProd().catch(console.error);
