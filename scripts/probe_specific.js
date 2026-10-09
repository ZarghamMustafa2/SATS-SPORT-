const http = require('http');

const BASE = 'http://46.202.166.33:3009';

function get(path) {
  return new Promise((resolve) => {
    http.get(BASE + path, { timeout: 10000 }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(d); } catch (e) {}
        resolve({ path, status: res.statusCode, isJson: !!json, data: json, raw: d });
      });
    }).on('error', e => resolve({ path, error: e.message, status: 0 }));
  });
}

async function probe() {
  console.log('--- Probing /getPriveteData structure ---');
  const priv = await get('/getPriveteData?gmid=640154297&sid=4');
  console.log('Status:', priv.status);
  if (priv.data) {
    console.log('Type of data:', typeof priv.data.data, Array.isArray(priv.data.data) ? 'Array' : 'Object');
    if (typeof priv.data.data === 'object' && priv.data.data !== null) {
      const entries = Object.entries(priv.data.data);
      console.log('Entries count:', entries.length);
      for (const [k, v] of entries.slice(0, 3)) {
        console.log(`Key [${k}]:`, JSON.stringify(v).slice(0, 300));
      }
    }
  }

  console.log('\n--- Probing /esid matches and trying /getDetailsData for each ---');
  const esid = await get('/esid?sid=4');
  const allMatches = [...(esid.data?.data?.t1 || []), ...(esid.data?.data?.t2 || [])];
  console.log(`Total cricket matches: ${allMatches.length}`);
  
  for (const m of allMatches.slice(0, 5)) {
    console.log(`Match: ${m.ename || m.name} (gmid: ${m.gmid}, etid: ${m.etid})`);
    const det = await get(`/getDetailsData?gmid=${m.gmid}&sid=${m.etid || 4}`);
    console.log(`  -> /getDetailsData status: ${det.status}, raw: ${det.raw.slice(0, 100)}`);
  }

  // Also try /getDetailsData with string gmid, or sid in different orders
  const testM = allMatches[0];
  if (testM) {
    const d1 = await get(`/getDetailsData?sid=4&gmid=${testM.gmid}`);
    console.log(`  -> sid first status: ${d1.status}, raw: ${d1.raw.slice(0, 100)}`);
  }

  console.log('\n--- Probing /casino/detail_result ---');
  // From /casino/result?type=worli3, let's see what was returned
  const cRes = await get('/casino/result?type=worli3');
  console.log('Casino result:', JSON.stringify(cRes.data).slice(0, 300));

  // Also check teen62
  const cDataTeen = await get('/casino/data?type=teen62');
  console.log('teen62 mid:', cDataTeen.data?.data?.mid);
  if (cDataTeen.data?.data?.mid) {
    const tMid = cDataTeen.data.data.mid;
    const detTeen = await get(`/casino/detail_result?type=teen62&mid=${tMid}`);
    console.log(`teen62 detail_result status: ${detTeen.status}, raw: ${detTeen.raw.slice(0, 300)}`);
  }

  const detWorli = await get(`/casino/detail_result?type=worli3&mid=194261008170332`);
  console.log(`worli3 detail_result status: ${detWorli.status}, raw: ${detWorli.raw.slice(0, 300)}`);
}

probe().catch(console.error);
