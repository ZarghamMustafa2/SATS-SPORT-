const fs = require('fs');
const diamond = require('../lib/providers/diamond');

async function auditAll69Sports() {
  console.log('Fetching /allSportid ...');
  const sportsRes = await diamond.getSports();
  const allSports = sportsRes.data?.data || [];
  console.log(`Auditing ${allSports.length} sports from Diamond provider...`);

  const results = [];

  for (let i = 0; i < allSports.length; i++) {
    const s = allSports[i];
    const sid = s.eid;
    const name = s.ename;
    const oid = s.oid;
    const isActive = s.active;

    let inPlay = 0;
    let upcoming = 0;
    let totalFixtures = 0;
    let tvFlagPresent = false;
    let gtvPresent = false;
    let sampleGmid = null;
    let sampleMatch = null;
    let marketEndpointWorking = false;
    let rawMatches = null;

    try {
      const matchRes = await diamond.getMatches(sid);
      if (matchRes.success && matchRes.data?.data) {
        const d = matchRes.data.data;
        // Check for racing hierarchy (sid=10 or sid=65 or any having children)
        if (sid === 10 || sid === 65 || (d.t1 && d.t1[0]?.children)) {
          const normalizedRacing = diamond.normalizeRacingMatches(d, sid === 10 ? 'horse' : 'greyhound');
          totalFixtures = normalizedRacing.length;
          inPlay = normalizedRacing.filter(r => r.inPlay).length;
          upcoming = totalFixtures - inPlay;
          if (normalizedRacing.length > 0) {
            sampleGmid = normalizedRacing[0].gmid;
            sampleMatch = normalizedRacing[0];
          }
        } else {
          const t1 = Array.isArray(d.t1) ? d.t1 : [];
          const t2 = Array.isArray(d.t2) ? d.t2 : [];
          inPlay = t1.length;
          upcoming = t2.length;
          totalFixtures = inPlay + upcoming;

          // Check TV flag and GTV
          const allRaw = [...t1, ...t2];
          for (const m of allRaw) {
            if (m.tv === true || m.tv === 1 || m.tv === 'true') tvFlagPresent = true;
            if (m.gtv !== undefined && m.gtv !== null && m.gtv !== '') gtvPresent = true;
            if (!sampleGmid && m.gmid) {
              sampleGmid = m.gmid;
              sampleMatch = m;
            }
          }
        }
      }
    } catch (e) {
      console.error(`Error querying sid=${sid} (${name}):`, e.message);
    }

    // Check market endpoint if sampleGmid exists
    if (sampleGmid) {
      try {
        const privRes = await diamond.getPriveteData(sid, sampleGmid);
        if (privRes.success && privRes.statusCode === 200 && privRes.data) {
          const rawArr = Array.isArray(privRes.data) ? privRes.data : (privRes.data.data || []);
          if (rawArr.length > 0) {
            marketEndpointWorking = true;
          }
        }
      } catch (e) {}
    }

    const isUsable = totalFixtures > 0;

    results.push({
      sid,
      name,
      oid,
      activeOnProvider: isActive,
      totalFixtures,
      inPlay,
      upcoming,
      isUsable,
      marketEndpointWorking,
      tvFlagPresent,
      gtvPresent,
      sampleGmid
    });

    if (totalFixtures > 0) {
      console.log(`[sid=${String(sid).padStart(2)}] ${name.padEnd(20)} | InPlay: ${String(inPlay).padStart(3)} | Upcoming: ${String(upcoming).padStart(3)} | Markets: ${marketEndpointWorking ? 'YES' : 'NO '} | TV: ${tvFlagPresent ? 'YES' : 'NO '} | gtv: ${gtvPresent ? 'YES' : 'NO '}`);
    }
  }

  fs.writeFileSync('scripts/complete_69_sports_audit.json', JSON.stringify(results, null, 2));
  console.log('\nAudit complete! Saved to scripts/complete_69_sports_audit.json');
}

auditAll69Sports().catch(console.error);
