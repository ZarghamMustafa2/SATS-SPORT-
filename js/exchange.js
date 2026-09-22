/**
 * SATSPORT Exchange Controller
 * Renders match odds tables, handles sport filtering, and drives live odds fluctuation
 */
(function() {
  window.Exchange = {
    currentFilter: 'inplay', // 'inplay', 'cricket', 'soccer', 'tennis', 'all'

    setFilter: function(filter) {
      this.currentFilter = filter;
      // Update UI tabs
      document.querySelectorAll('.sports-tab').forEach(tab => {
        if (tab.getAttribute('data-filter') === filter) {
          tab.classList.add('active');
        } else {
          tab.classList.remove('active');
        }
      });
      this.render();
    },

    getFilteredData: function() {
      const data = window.SATSPORT_DATA || [];
      if (this.currentFilter === 'inplay') {
        return data.filter(item => item.inplay);
      } else if (this.currentFilter === 'all') {
        return data;
      } else {
        return data.filter(item => item.sport === this.currentFilter);
      }
    },

    render: function() {
      const container = document.getElementById('matchesListContainer');
      if (!container) return;

      const items = this.getFilteredData();
      if (items.length === 0) {
        container.innerHTML = `
          <div style="background:#fff; padding:30px; text-align:center; border-radius:4px; color:#718096; border:1px solid #e2e8f0;">
            No live events found for this category.
          </div>
        `;
        return;
      }

      // Group by sport
      const grouped = {};
      items.forEach(item => {
        if (!grouped[item.sportName]) grouped[item.sportName] = [];
        grouped[item.sportName].push(item);
      });

      let html = '';
      for (const [sportName, matches] of Object.entries(grouped)) {
        const first = matches[0];
        html += `
          <div class="sport-group-card">
            <div class="sport-group-header">
              <div class="group-title">
                <img src="${first.icon}" alt="${sportName}" style="width:18px; height:18px; object-fit:contain;">
                <span>${sportName}</span>
              </div>
              <div class="group-odds-headers">
                <div class="header-outcome-col">
                  <div class="outcome-title">1</div>
                  <div class="back-lay-subhead">
                    <span class="sub-back">Back</span>
                    <span class="sub-lay">Lay</span>
                  </div>
                </div>
                <div class="header-outcome-col">
                  <div class="outcome-title">X</div>
                  <div class="back-lay-subhead">
                    <span class="sub-back">Back</span>
                    <span class="sub-lay">Lay</span>
                  </div>
                </div>
                <div class="header-outcome-col">
                  <div class="outcome-title">2</div>
                  <div class="back-lay-subhead">
                    <span class="sub-back">Back</span>
                    <span class="sub-lay">Lay</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="sport-matches-body">
              ${matches.map(m => this.renderMatchRow(m)).join('')}
            </div>
          </div>
        `;
      }

      container.innerHTML = html;
    },

    renderMatchRow: function(m) {
      const runners = m.runners;
      const r1 = runners[0];
      const r2 = runners.length === 3 ? runners[1] : null; // Draw
      const r3 = runners.length === 3 ? runners[2] : runners[1]; // Away / Runner 2

      return `
        <div class="match-event-row" data-marketid="${m.marketId}">
          <div class="match-info-left">
            <div class="match-teams-title" onclick="Exchange.showEventDetails('${m.marketId}')">
              ${m.marketName}
            </div>
            <div class="match-meta-info">
              ${m.inplay ? '<span class="badge-live-tag">LIVE</span>' : ''}
              <span>${m.startTime}</span>
              <span>•</span>
              <span style="color:#4a5568; font-weight:600;">${m.tournament}</span>
              ${m.hasStream ? '<span class="badge-stream-icon">📺 TV</span>' : ''}
              ${m.hasFancy ? '<span class="badge-fancy-icon">⚡ Fancy</span>' : ''}
              ${m.hasBM ? '<span class="badge-fancy-icon">BM</span>' : ''}
            </div>
          </div>

          <div class="match-odds-grid">
            <!-- 1 (Home) -->
            <div class="outcome-cell-pair">
              ${r1 && r1.back ? `
                <button class="odd-btn back" onclick="Betslip.selectOdd('${m.marketId}', '${r1.runnerName}', '${m.marketName}', 'BACK', '${r1.back.price}', this)">
                  <span class="odd-price">${r1.back.price.toFixed(2)}</span>
                  <span class="odd-size">${r1.back.size}</span>
                </button>
              ` : '<div class="odd-btn empty"><span class="odd-price">-</span></div>'}
              ${r1 && r1.lay ? `
                <button class="odd-btn lay" onclick="Betslip.selectOdd('${m.marketId}', '${r1.runnerName}', '${m.marketName}', 'LAY', '${r1.lay.price}', this)">
                  <span class="odd-price">${r1.lay.price.toFixed(2)}</span>
                  <span class="odd-size">${r1.lay.size}</span>
                </button>
              ` : '<div class="odd-btn empty"><span class="odd-price">-</span></div>'}
            </div>

            <!-- X (Draw) -->
            <div class="outcome-cell-pair">
              ${r2 && r2.back ? `
                <button class="odd-btn back" onclick="Betslip.selectOdd('${m.marketId}', '${r2.runnerName}', '${m.marketName}', 'BACK', '${r2.back.price}', this)">
                  <span class="odd-price">${r2.back.price.toFixed(2)}</span>
                  <span class="odd-size">${r2.back.size}</span>
                </button>
              ` : '<div class="odd-btn empty"><span class="odd-price">-</span></div>'}
              ${r2 && r2.lay ? `
                <button class="odd-btn lay" onclick="Betslip.selectOdd('${m.marketId}', '${r2.runnerName}', '${m.marketName}', 'LAY', '${r2.lay.price}', this)">
                  <span class="odd-price">${r2.lay.price.toFixed(2)}</span>
                  <span class="odd-size">${r2.lay.size}</span>
                </button>
              ` : '<div class="odd-btn empty"><span class="odd-price">-</span></div>'}
            </div>

            <!-- 2 (Away) -->
            <div class="outcome-cell-pair">
              ${r3 && r3.back ? `
                <button class="odd-btn back" onclick="Betslip.selectOdd('${m.marketId}', '${r3.runnerName}', '${m.marketName}', 'BACK', '${r3.back.price}', this)">
                  <span class="odd-price">${r3.back.price.toFixed(2)}</span>
                  <span class="odd-size">${r3.back.size}</span>
                </button>
              ` : '<div class="odd-btn empty"><span class="odd-price">-</span></div>'}
              ${r3 && r3.lay ? `
                <button class="odd-btn lay" onclick="Betslip.selectOdd('${m.marketId}', '${r3.runnerName}', '${m.marketName}', 'LAY', '${r3.lay.price}', this)">
                  <span class="odd-price">${r3.lay.price.toFixed(2)}</span>
                  <span class="odd-size">${r3.lay.size}</span>
                </button>
              ` : '<div class="odd-btn empty"><span class="odd-price">-</span></div>'}
            </div>
          </div>
        </div>
      `;
    },

    showEventDetails: function(marketId) {
      console.log('Navigate to market event:', marketId);
    },

    // Simulate live ticking odds fluctuating every few seconds
    startOddsTick: function() {
      setInterval(() => {
        if (!window.SATSPORT_DATA) return;
        const data = window.SATSPORT_DATA.filter(m => m.inplay);
        if (data.length === 0) return;

        // Pick 1 random match to tick
        const match = data[Math.floor(Math.random() * data.length)];
        if (!match.runners || match.runners.length === 0) return;
        const runner = match.runners[Math.floor(Math.random() * match.runners.length)];
        if (!runner.back || !runner.lay) return;

        const delta = (Math.random() > 0.5 ? 0.01 : -0.01);
        const newBack = Math.max(1.02, parseFloat((runner.back.price + delta).toFixed(2)));
        const newLay = parseFloat((newBack + 0.02).toFixed(2));

        runner.back.price = newBack;
        runner.lay.price = newLay;

        // Update DOM element directly if visible
        const row = document.querySelector(`.match-event-row[data-marketid="${match.marketId}"]`);
        if (row) {
          const prices = row.querySelectorAll('.odd-price');
          // re-render row gently
          const temp = document.createElement('div');
          temp.innerHTML = this.renderMatchRow(match);
          const newRow = temp.firstElementChild;
          row.replaceWith(newRow);
        }
      }, 4000);
    }
  };

  document.addEventListener('DOMContentLoaded', function() {
    Exchange.render();
    Exchange.startOddsTick();
  });
})();
