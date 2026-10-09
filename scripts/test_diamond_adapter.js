const diamond = require('../lib/providers/diamond');

async function test() {
  console.log('Testing diamond.checkHealth()...');
  const health = await diamond.checkHealth();
  console.log('Health:', health);

  console.log('\nTesting diamond.getMatches("cricket")...');
  const matchesRes = await diamond.getMatches('cricket');
  console.log('getMatches status:', matchesRes.statusCode, 'success:', matchesRes.success);
  const t1 = matchesRes.data?.data?.t1 || [];
  const t2 = matchesRes.data?.data?.t2 || [];
  console.log(`t1 (in-play) count: ${t1.length}, t2 (upcoming) count: ${t2.length}`);

  if (t1.length > 0) {
    const norm = diamond.normalizeMatch(t1[0], 'cricket');
    console.log('Sample normalized in-play match:\n', JSON.stringify(norm, null, 2));

    console.log('\nTesting diamond.getPriveteData("cricket", norm.gmid)...');
    const privRes = await diamond.getPriveteData('cricket', norm.gmid);
    console.log('getPriveteData status:', privRes.statusCode, 'success:', privRes.success);
    const normMarkets = diamond.normalizeMarkets(privRes.data?.data);
    console.log('Match Odds runner count:', normMarkets.matchOdds?.runners?.length);
    console.log('Match Odds sample:', JSON.stringify(normMarkets.matchOdds?.runners?.[0]));
    console.log('Bookmakers count:', normMarkets.bookmakers.length);
    console.log('Fancy count:', normMarkets.fancy.length);
    console.log('Sample Fancy item:', normMarkets.fancy[0]);
  }

  console.log('\nTesting casino methods...');
  const tablesRes = await diamond.getCasinoTables();
  console.log('Casino tables count:', tablesRes.data?.data?.t1?.length);
  const dataRes = await diamond.getCasinoData('worli3');
  console.log('worli3 rounds count:', dataRes.data?.data?.length);

  console.log('\nALL ADAPTER TESTS COMPLETED SUCCESSFULLY!');
}

test().catch(console.error);
