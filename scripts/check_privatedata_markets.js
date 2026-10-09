const http = require('http');

http.get('http://46.202.166.33:3009/getPriveteData?gmid=640154297&sid=4', (res) => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    const raw = JSON.parse(d).data || [];
    console.log(`Total markets in /getPriveteData: ${raw.length}`);
    const summary = raw.map(m => ({
      mid: m.mid,
      mname: m.mname,
      gtype: m.gtype,
      status: m.status,
      runnersCount: m.section?.length || 0,
      runnerNames: (m.section || []).map(s => s.nat)
    }));
    console.log(JSON.stringify(summary, null, 2));
  });
});
