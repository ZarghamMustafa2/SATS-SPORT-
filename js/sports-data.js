/**
 * SATSPORT Sports Data Store
 * Matches Betfair-style exchange market data structures
 */
window.SATSPORT_DATA = [
  // CRICKET
  {
    sport: 'cricket',
    sportName: 'Cricket',
    icon: 'assets/icons/cricket.svg',
    tournament: 'European T10 Cricket League',
    marketId: '1.262472033',
    marketName: 'Rotterdam Dockers v Dublin Guardians',
    inplay: true,
    startTime: 'In-Play',
    hasStream: true,
    hasFancy: true,
    hasBM: true,
    runners: [
      {
        runnerName: 'Rotterdam Dockers',
        back: { price: 2.68, size: '42.5k' },
        lay: { price: 2.70, size: '18.2k' }
      },
      {
        runnerName: 'Dublin Guardians',
        back: { price: 1.58, size: '89.1k' },
        lay: { price: 1.60, size: '45.0k' }
      }
    ]
  },
  {
    sport: 'cricket',
    sportName: 'Cricket',
    icon: 'assets/icons/cricket.svg',
    tournament: 'Indian Premier League (IPL)',
    marketId: '1.262472099',
    marketName: 'Chennai Super Kings v Mumbai Indians',
    inplay: true,
    startTime: 'In-Play',
    hasStream: true,
    hasFancy: true,
    hasBM: true,
    runners: [
      {
        runnerName: 'Chennai Super Kings',
        back: { price: 1.91, size: '185.4k' },
        lay: { price: 1.93, size: '92.6k' }
      },
      {
        runnerName: 'Mumbai Indians',
        back: { price: 2.08, size: '142.8k' },
        lay: { price: 2.10, size: '78.3k' }
      }
    ]
  },
  {
    sport: 'cricket',
    sportName: 'Cricket',
    icon: 'assets/icons/cricket.svg',
    tournament: 'ICC Champions Trophy',
    marketId: '1.262472145',
    marketName: 'India v Australia',
    inplay: false,
    startTime: 'Today 19:30',
    hasStream: true,
    hasFancy: true,
    hasBM: true,
    runners: [
      {
        runnerName: 'India',
        back: { price: 1.74, size: '320.0k' },
        lay: { price: 1.76, size: '154.2k' }
      },
      {
        runnerName: 'Australia',
        back: { price: 2.32, size: '210.5k' },
        lay: { price: 2.36, size: '98.7k' }
      }
    ]
  },

  // SOCCER
  {
    sport: 'soccer',
    sportName: 'Soccer',
    icon: 'assets/icons/soccer.svg',
    tournament: 'Israel Leumit League',
    marketId: '1.262561001',
    marketName: 'Hapoel Afula v Hapoel Kfar Shelem',
    inplay: true,
    startTime: 'In-Play (64\')',
    hasStream: true,
    hasFancy: false,
    hasBM: false,
    runners: [
      {
        runnerName: 'Hapoel Afula',
        back: { price: 3.25, size: '14.2k' },
        lay: { price: 3.35, size: '8.4k' }
      },
      {
        runnerName: 'The Draw',
        back: { price: 2.80, size: '22.1k' },
        lay: { price: 2.88, size: '11.0k' }
      },
      {
        runnerName: 'Hapoel Kfar Shelem',
        back: { price: 2.45, size: '31.8k' },
        lay: { price: 2.50, size: '16.5k' }
      }
    ]
  },
  {
    sport: 'soccer',
    sportName: 'Soccer',
    icon: 'assets/icons/soccer.svg',
    tournament: 'UEFA Champions League',
    marketId: '1.262561088',
    marketName: 'Real Madrid v Manchester City',
    inplay: false,
    startTime: 'Today 21:00',
    hasStream: true,
    hasFancy: true,
    hasBM: true,
    runners: [
      {
        runnerName: 'Real Madrid',
        back: { price: 2.62, size: '240.5k' },
        lay: { price: 2.66, size: '115.0k' }
      },
      {
        runnerName: 'The Draw',
        back: { price: 3.45, size: '88.2k' },
        lay: { price: 3.55, size: '42.6k' }
      },
      {
        runnerName: 'Manchester City',
        back: { price: 2.74, size: '198.3k' },
        lay: { price: 2.78, size: '94.1k' }
      }
    ]
  },
  {
    sport: 'soccer',
    sportName: 'Soccer',
    icon: 'assets/icons/soccer.svg',
    tournament: 'English Premier League',
    marketId: '1.262561099',
    marketName: 'Arsenal v Chelsea',
    inplay: false,
    startTime: 'Tomorrow 17:30',
    hasStream: true,
    hasFancy: true,
    hasBM: true,
    runners: [
      {
        runnerName: 'Arsenal',
        back: { price: 1.85, size: '165.0k' },
        lay: { price: 1.87, size: '78.4k' }
      },
      {
        runnerName: 'The Draw',
        back: { price: 3.80, size: '54.2k' },
        lay: { price: 3.90, size: '26.0k' }
      },
      {
        runnerName: 'Chelsea',
        back: { price: 4.40, size: '68.9k' },
        lay: { price: 4.60, size: '31.5k' }
      }
    ]
  },

  // TENNIS
  {
    sport: 'tennis',
    sportName: 'Tennis',
    icon: 'assets/icons/tennis.svg',
    tournament: 'ITF Women Calvi Doubles',
    marketId: '1.262570012',
    marketName: 'Collins/Voloshchuk v Bhosale/Micic',
    inplay: true,
    startTime: 'In-Play (Set 2)',
    hasStream: true,
    hasFancy: false,
    hasBM: false,
    runners: [
      {
        runnerName: 'Collins/Voloshchuk',
        back: { price: 1.42, size: '28.4k' },
        lay: { price: 1.45, size: '14.1k' }
      },
      {
        runnerName: 'Bhosale/Micic',
        back: { price: 3.10, size: '18.7k' },
        lay: { price: 3.25, size: '9.2k' }
      }
    ]
  },
  {
    sport: 'tennis',
    sportName: 'Tennis',
    icon: 'assets/icons/tennis.svg',
    tournament: 'ATP Masters Indian Wells',
    marketId: '1.262570088',
    marketName: 'Carlos Alcaraz v Jannik Sinner',
    inplay: false,
    startTime: 'Today 22:30',
    hasStream: true,
    hasFancy: true,
    hasBM: true,
    runners: [
      {
        runnerName: 'Carlos Alcaraz',
        back: { price: 1.82, size: '145.0k' },
        lay: { price: 1.85, size: '68.0k' }
      },
      {
        runnerName: 'Jannik Sinner',
        back: { price: 2.12, size: '112.5k' },
        lay: { price: 2.16, size: '54.0k' }
      }
    ]
  },

  // HORSE RACING
  {
    sport: 'horse',
    sportName: 'Horse Racing',
    icon: 'assets/icons/horse.svg',
    tournament: 'Doncaster 14:30',
    marketId: '1.262580001',
    marketName: '14:30 Doncaster - 7f Handicap',
    inplay: true,
    startTime: 'In-Play',
    hasStream: true,
    hasFancy: false,
    hasBM: false,
    runners: [
      {
        runnerName: '1. Golden Falcon',
        back: { price: 3.40, size: '12.0k' },
        lay: { price: 3.55, size: '6.2k' }
      },
      {
        runnerName: '2. Royal Whisper',
        back: { price: 4.80, size: '8.5k' },
        lay: { price: 5.10, size: '4.1k' }
      },
      {
        runnerName: '3. Desert Storm',
        back: { price: 6.20, size: '5.4k' },
        lay: { price: 6.60, size: '2.8k' }
      }
    ]
  }
];
