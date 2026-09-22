
// 0. Initial Loader (fade-out after readiness)
function initLoader() {
  const loader = document.getElementById('first-loader');
  if (!loader) return;
  setTimeout(() => {
    loader.classList.add('fade-out');
    setTimeout(() => {
      loader.style.display = 'none';
    }, 450);
  }, 600);
}

/**
 * SATSport Main Application Script
 * 1:1 Parity Controller for Navigation, Sidebar, Tabs, Races, Carousel & Bet Slip
 */

document.addEventListener('DOMContentLoaded', function() {
  initLoader();
  initSidebarToggle();
  initSidebarTabs();
  initSidebarSearch();
  initTopNavPills();
  initRacesAccordion();
  initMatchCategoryTabs();
  initBannerSlider();
  initGameProvidersDrag();
  initOddsClickHandlers();
  initMobileBottomNav();
  const path = (window.location.pathname || '').toLowerCase();
  const hash = (window.location.hash || '').toLowerCase();
  if (path.includes('casino') || hash === '#casino') {
    switchView('casino');
  } else {
    switchView('sports');
  }
});

// 1. Sidebar Toggle (Hamburger Button)
function initSidebarToggle() {
  const toggleBtn = document.getElementById('sidebarCollapse') || document.querySelector('.side-toggle');
  const sidebar = document.getElementById('sidebar');
  const content = document.getElementById('content');

  if (!toggleBtn || !sidebar) return;

  toggleBtn.addEventListener('click', function(e) {
    e.preventDefault();
    if (window.innerWidth <= 1024) {
      sidebar.classList.toggle('active');
      sidebar.classList.toggle('mobile-show');
    } else {
      sidebar.classList.toggle('collapsed');
      sidebar.classList.toggle('active');
      if (content) {
        content.classList.toggle('expanded');
      }
    }
  });

  // Close sidebar on mobile when clicking outside
  document.addEventListener('click', function(e) {
    if (window.innerWidth <= 1024 && (sidebar.classList.contains('mobile-show') || sidebar.classList.contains('active'))) {
      if (!sidebar.contains(e.target) && !toggleBtn.contains(e.target)) {
        sidebar.classList.remove('mobile-show');
        sidebar.classList.remove('active');
      }
    }
  });
}

// Global View Switcher: 'casino' vs 'sports'
function switchView(viewName) {
  const isCasino = (viewName === 'casino');
  document.body.classList.toggle('casino-mode', isCasino);

  // 1. Sidebar tabs
  const tabCasino = document.getElementById('tab-casino') || document.querySelector('#sidebar .tabs a:first-child');
  const tabSports = document.getElementById('tab-sports') || document.querySelector('#sidebar .tabs a:last-child');
  const casinoContent = document.getElementById('casino-content');
  const sportsContent = document.getElementById('sports-content');

  if (tabCasino && tabSports) {
    if (isCasino) {
      tabCasino.classList.add('active');
      tabSports.classList.remove('active');
    } else {
      tabSports.classList.add('active');
      tabCasino.classList.remove('active');
    }
  }

  // 2. Sidebar lists
  if (casinoContent && sportsContent) {
    if (isCasino) {
      casinoContent.style.display = 'block';
      sportsContent.style.display = 'none';
      casinoContent.classList.remove('hidden');
      sportsContent.classList.add('hidden');
    } else {
      sportsContent.style.display = 'block';
      casinoContent.style.display = 'none';
      sportsContent.classList.remove('hidden');
      casinoContent.classList.add('hidden');
    }
  }

  // 3. Main Views
  const viewCasino = document.getElementById('view-casino');
  const viewSports = document.getElementById('view-sports');
  const welcomeImg = document.querySelector('.welcome-image-container');

  if (viewCasino && viewSports) {
    if (isCasino) {
      viewCasino.style.display = 'block';
      viewSports.style.display = 'none';
      if (welcomeImg) welcomeImg.style.display = 'none';
    } else {
      viewSports.style.display = 'block';
      viewCasino.style.display = 'none';
      if (welcomeImg) welcomeImg.style.display = 'block';
    }
  }

  // 4. Top Menu Tabs
  const topMenuItems = document.querySelectorAll('.topmenubar li');
  topMenuItems.forEach(item => {
    const text = item.textContent.trim().toLowerCase();
    if (isCasino) {
      if (text.includes('casino')) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    } else {
      if (text.includes('exchange') && !text.includes('game')) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    }
  });

  // Scroll to top of content smoothly
  const content = document.getElementById('content');
  if (content) content.scrollTop = 0;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// 2. Sidebar & Navigation Dual Tabs (Casino vs Sports)
function initSidebarTabs() {
  const tabCasino = document.getElementById('tab-casino') || document.querySelector('#sidebar .tabs a:first-child');
  const tabSports = document.getElementById('tab-sports') || document.querySelector('#sidebar .tabs a:last-child');

  if (tabCasino) {
    tabCasino.addEventListener('click', function(e) {
      e.preventDefault();
      switchView('casino');
    });
  }

  if (tabSports) {
    tabSports.addEventListener('click', function(e) {
      e.preventDefault();
      switchView('sports');
    });
  }

  // Top Bar Menu Items
  const topMenuItems = document.querySelectorAll('.topmenubar li a');
  topMenuItems.forEach(item => {
    item.addEventListener('click', function(e) {
      e.preventDefault();
      const text = this.textContent.trim().toLowerCase();
      if (text.includes('casino')) {
        switchView('casino');
      } else if (text.includes('exchange')) {
        switchView('sports');
      }
    });
  });

  // Category Filter Pills in Casino View
  initCasinoFilterPills();
}

function initCasinoFilterPills() {
  const pills = document.querySelectorAll('.casino-pill');
  pills.forEach(pill => {
    pill.addEventListener('click', function(e) {
      e.preventDefault();
      pills.forEach(p => p.classList.remove('active'));
      this.classList.add('active');

      const categoryName = this.textContent.trim().toLowerCase();
      if (categoryName === 'casino') {
        const allSec = document.querySelectorAll('.casino-section');
        allSec.forEach(s => s.style.display = '');
        return;
      }

      // Filter or scroll to matching section
      const allSec = document.querySelectorAll('.casino-section');
      let found = false;
      allSec.forEach(s => {
        const title = (s.querySelector('.casino-section-title') || {}).textContent || '';
        if (title.toLowerCase().includes(categoryName) || categoryName.includes(title.toLowerCase())) {
          s.style.display = '';
          if (!found) {
            s.scrollIntoView({ behavior: 'smooth', block: 'start' });
            found = true;
          }
        } else {
          // Keep all visible or focus
        }
      });
    });
  });
}

// 3. Sidebar Search Filter
function initSidebarSearch() {
  const searchInput = document.querySelector('#sidebar .search-txt');
  if (!searchInput) return;

  searchInput.addEventListener('input', function(e) {
    const query = e.target.value.toLowerCase().trim();
    const items = document.querySelectorAll('#sidebar-links .market-border-lvl-one');

    items.forEach(item => {
      const text = item.textContent.toLowerCase();
      if (text.includes(query)) {
        item.style.display = '';
      } else {
        item.style.display = 'none';
      }
    });
  });
}

// 4. Sub-Navigation Pills (In Play, Cricket, Soccer, etc.)
function initTopNavPills() {
  const pills = document.querySelectorAll('app-top-nav .list-item');
  pills.forEach(pill => {
    pill.addEventListener('click', function() {
      pills.forEach(p => p.classList.remove('active'));
      this.classList.add('active');
    });
  });
}

// 5. Races Accordion & Race Tabs
function initRacesAccordion() {
  const topbar = document.querySelector('.races-topbar');
  const arrow = document.querySelector('.toggle-arrow');
  const accordionBody = document.querySelector('app-todaysraces .accordion-body');
  const raceTabs = document.querySelectorAll('app-todaysraces .race-tab');
  const regionTabs = document.querySelectorAll('app-todaysraces .race-region');

  if (topbar && accordionBody) {
    topbar.addEventListener('click', function() {
      const isHidden = accordionBody.style.display === 'none';
      accordionBody.style.display = isHidden ? '' : 'none';
      if (arrow) {
        arrow.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
      }
    });
  }

  raceTabs.forEach(tab => {
    tab.addEventListener('click', function() {
      raceTabs.forEach(t => t.classList.remove('active'));
      this.classList.add('active');
    });
  });

  regionTabs.forEach(tab => {
    tab.addEventListener('click', function(e) {
      e.preventDefault();
      regionTabs.forEach(t => t.classList.remove('active'));
      this.classList.add('active');
    });
  });
}

// 6. Matches Tabs (Inplay / Upcoming & Sports Categories)
function initMatchCategoryTabs() {
  // Inplay vs Upcoming
  const inplayUpcomingMenus = document.querySelectorAll('.upcoming-tab-items .menu');
  inplayUpcomingMenus.forEach(menu => {
    menu.addEventListener('click', function() {
      inplayUpcomingMenus.forEach(m => m.classList.remove('upcomingActiveTab'));
      this.classList.add('upcomingActiveTab');
    });
  });

  // Cricket / Soccer / Tennis category slider tabs
  const categoryItems = document.querySelectorAll('.category-scroll-slider .category-box');
  const tabs = document.querySelectorAll('.tab-container .tab-pane');

  categoryItems.forEach((box, index) => {
    box.addEventListener('click', function(e) {
      e.preventDefault();
      categoryItems.forEach(b => {
        const item = b.querySelector('.category-item');
        if (item) item.classList.remove('active');
        const activeBar = b.querySelector('.active-sport-tab-item');
        if (activeBar) activeBar.style.display = 'none';
      });

      const clickedItem = this.querySelector('.category-item');
      if (clickedItem) clickedItem.classList.add('active');
      const activeBar = this.querySelector('.active-sport-tab-item');
      if (activeBar) activeBar.style.display = 'block';

      // Switch tab pane if matching index exists
      if (tabs[index]) {
        tabs.forEach(t => t.classList.remove('active'));
        tabs[index].classList.add('active');
      }
    });
  });
}

// 7. Hero Banner Slider Carousel
function initBannerSlider() {
  const stage = document.querySelector('.owl-stage');
  const items = document.querySelectorAll('.owl-stage .owl-item');
  if (!stage || items.length === 0) return;

  let currentIndex = 0;
  const slideWidth = items[0].offsetWidth || 1124;

  setInterval(() => {
    currentIndex = (currentIndex + 1) % 2;
    stage.style.transition = 'transform 0.5s ease-in-out';
    stage.style.transform = 'translate3d(-' + (currentIndex * slideWidth) + 'px, 0px, 0px)';
  }, 4000);
}

// 8. Game Providers Drag Scroll
function initGameProvidersDrag() {
  const container = document.querySelector('.quick-links');
  if (!container) return;

  let isDown = false;
  let startX;
  let scrollLeft;

  container.addEventListener('mousedown', (e) => {
    isDown = true;
    container.style.cursor = 'grabbing';
    startX = e.pageX - container.offsetLeft;
    scrollLeft = container.scrollLeft;
  });

  container.addEventListener('mouseleave', () => {
    isDown = false;
    container.style.cursor = 'grab';
  });

  container.addEventListener('mouseup', () => {
    isDown = false;
    container.style.cursor = 'grab';
  });

  container.addEventListener('mousemove', (e) => {
    if (!isDown) return;
    e.preventDefault();
    const x = e.pageX - container.offsetLeft;
    const walk = (x - startX) * 2;
    container.scrollLeft = scrollLeft - walk;
  });
}

// 9. Odds Click Handler -> Opens Interactive Bet Slip
function initOddsClickHandlers() {
  const oddsCells = document.querySelectorAll('.sp-b .box');
  oddsCells.forEach(cell => {
    cell.style.cursor = 'pointer';
    cell.addEventListener('click', function(e) {
      e.stopPropagation();

      // Determine Back or Lay
      const isBack = this.classList.contains('special-a');
      const isLay = this.classList.contains('special-b');
      const betType = isBack ? 'Back' : (isLay ? 'Lay' : 'Back');

      // Get Price
      const priceSpan = this.querySelector('span');
      let price = priceSpan ? priceSpan.textContent.trim() : '2.00';
      if (price === '-' || !price) price = '2.00';

      // Get Runner & Event Name from card
      const card = this.closest('.default-game-box');
      let runnerName = 'Selected Runner';
      let eventName = 'Sports Match';

      if (card) {
        const runners = card.querySelectorAll('.def-runner-team');
        const comp = card.querySelector('.competition-name');
        if (comp) eventName = comp.textContent.trim();

        // Check which runner column (first, second, or draw)
        const spGroups = Array.from(card.querySelectorAll('.def-game-box-right .sp-b'));
        const parentSp = this.closest('.sp-b');
        const colIndex = spGroups.indexOf(parentSp);

        if (runners.length >= 2) {
          if (colIndex === 0) {
            runnerName = runners[0].textContent.trim();
          } else if (colIndex === 1) {
            runnerName = 'The Draw';
          } else if (colIndex === 2) {
            runnerName = runners[1].textContent.trim();
          }
        } else if (runners.length === 1) {
          runnerName = runners[0].textContent.trim();
        }
      }

      if (typeof openBetslip === 'function') {
        openBetslip(runnerName, eventName, betType, price);
      }
    });
  });
}

// 10. Mobile Bottom Navigation Controller (.site_footer)
function initMobileBottomNav() {
  const menuLi = document.querySelector('.nav-bottom-site li[style*="position: relative"]') || 
                 document.querySelector('.nav-bottom-site li:last-child');
  const mobileMenu = document.querySelector('.mobile-menu');

  if (menuLi && mobileMenu) {
    const menuTrigger = menuLi.querySelector('div') || menuLi;
    menuTrigger.addEventListener('click', function(e) {
      e.stopPropagation();
      mobileMenu.classList.toggle('open');
    });

    // Close menu when clicking outside
    document.addEventListener('click', function(e) {
      if (!mobileMenu.contains(e.target) && !menuLi.contains(e.target)) {
        mobileMenu.classList.remove('open');
      }
    });
  }

  // Betslip click in mobile popup menu
  const betslipMenuItem = document.querySelector('.mobile-menu .menu-item:nth-child(2)');
  if (betslipMenuItem) {
    betslipMenuItem.addEventListener('click', function(e) {
      e.stopPropagation();
      if (mobileMenu) mobileMenu.classList.remove('open');
      if (typeof openBetslip === 'function') {
        openBetslip('Rotterdam Dockers', 'European T20 Premier League', 'Back', '3.5');
      }
    });
  }

  // Inplay bottom button
  const inplayBtn = document.querySelector('.nav-bottom-site li:nth-child(2)');
  if (inplayBtn) {
    inplayBtn.addEventListener('click', function() {
      const inplayTab = document.querySelector('.upcoming-tab-items .menu:first-child');
      if (inplayTab) inplayTab.click();
    });
  }
}

