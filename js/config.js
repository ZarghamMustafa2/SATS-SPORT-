/**
 * SATSPORT Configuration File
 * Mirrors globalconfig.js settings from satsport.co.in
 */
window.SATSPORT_CONFIG = {
  appName: 'satsport.co.in',
  siteTitle: "satsport: India's Best Reliable Sports Betting Exchange Site 2026",
  siteLogo: 'assets/images/logo.png',
  footerLogo: 'assets/images/logo.png',
  currency: '₹',
  defaultTheme: 'light-theme',
  quickStakes: [100, 500, 1000, 5000, 10000, 25000],
  defaultStake: 500,
  endpoints: {
    inplay: '/exchangeapi/sports/inplayeventsnew/1?take=10',
    directMarketsBook: 'https://bp.ssfun.in/exchangeapi/sports/directmarketsbook1'
  }
};
