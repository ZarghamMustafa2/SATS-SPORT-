const http = require('http');
const BASE = 'http://46.202.166.33:3009';

http.get(BASE + '/esid?sid=4', (res) => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    const json = JSON.parse(d);
    const m = (json.data?.t1 || [])[0];
    console.log('SAMPLE ESID MATCH:\n', JSON.stringify(m, null, 2));

    http.get(`${BASE}/getPriveteData?gmid=${m.gmid}&sid=4`, (res2) => {
      let d2 = '';
      res2.on('data', c2 => d2 += c2);
      res2.on('end', () => {
        const json2 = JSON.parse(d2);
        console.log('\nSAMPLE GETPRIVETEDATA (keys):', Object.keys(json2.data || {}));
        const items = json2.data || [];
        console.log('\nSAMPLE MARKET 0:\n', JSON.stringify(items[0], null, 2));
        if (items.length > 1) {
          console.log('\nSAMPLE MARKET 1:\n', JSON.stringify(items[1], null, 2));
        }
      });
    });
  });
});
