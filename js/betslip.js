/**
 * SATSport Bet Slip Logic
 * Handles interactive bet placement, odds editing, stake chips, and profit/liability calculation
 */

let currentBet = {
  runner: 'Rotterdam Dockers',
  event: 'European T20 Premier League',
  type: 'Back',
  odds: 3.5,
  stake: 1000
};

function openBetslip(runner, event, type, odds) {
  currentBet.runner = runner || 'Selected Runner';
  currentBet.event = event || 'Sports Match';
  currentBet.type = type || 'Back';
  currentBet.odds = parseFloat(odds) || 2.0;

  const drawer = document.getElementById('betslipDrawer');
  const typeBadge = document.getElementById('bsBetType');
  const runnerEl = document.getElementById('bsRunnerName');
  const eventEl = document.getElementById('bsEventName');
  const oddsInput = document.getElementById('bsOddsInput');
  const stakeInput = document.getElementById('bsStakeInput');

  if (runnerEl) runnerEl.textContent = currentBet.runner;
  if (eventEl) eventEl.textContent = currentBet.event;
  if (typeBadge) {
    typeBadge.textContent = currentBet.type;
    typeBadge.className = 'betslip-selection-type ' + currentBet.type.toLowerCase();
  }
  if (oddsInput) oddsInput.value = currentBet.odds;
  if (stakeInput) currentBet.stake = parseFloat(stakeInput.value) || 1000;

  updateCalculation();

  if (drawer) {
    drawer.classList.add('open');
  }
}

function closeBetslip() {
  const drawer = document.getElementById('betslipDrawer');
  if (drawer) {
    drawer.classList.remove('open');
  }
}

function addStake(amount) {
  const stakeInput = document.getElementById('bsStakeInput');
  if (!stakeInput) return;
  let val = parseFloat(stakeInput.value) || 0;
  val += amount;
  stakeInput.value = val;
  currentBet.stake = val;
  updateCalculation();
}

function updateCalculation() {
  const oddsInput = document.getElementById('bsOddsInput');
  const stakeInput = document.getElementById('bsStakeInput');
  const label = document.getElementById('bsReturnLabel');
  const valEl = document.getElementById('bsReturnValue');

  const odds = parseFloat(oddsInput ? oddsInput.value : currentBet.odds) || 1.0;
  const stake = parseFloat(stakeInput ? stakeInput.value : currentBet.stake) || 0;

  if (currentBet.type.toLowerCase() === 'back') {
    if (label) label.textContent = 'Profit:';
    const profit = stake * (odds - 1);
    if (valEl) valEl.textContent = '₹' + profit.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } else {
    if (label) label.textContent = 'Liability:';
    const liability = stake * (odds - 1);
    if (valEl) valEl.textContent = '₹' + liability.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
}

async function placeBet() {
  const token = localStorage.getItem('auth_token');
  if (!token) {
    alert('Please login to place bets.');
    if (typeof proceedToLoginModal === 'function') proceedToLoginModal();
    return;
  }

  const stakeInput = document.getElementById('bsStakeInput');
  const oddsInput = document.getElementById('bsOddsInput');
  const stake = parseFloat(stakeInput ? stakeInput.value : currentBet.stake) || 0;
  const odds = parseFloat(oddsInput ? oddsInput.value : currentBet.odds) || 1.0;

  if (stake <= 0) {
    alert('Please enter a valid stake amount.');
    return;
  }

  const btn = document.querySelector('.btn-place-bet') || document.getElementById('bsPlaceBetBtn');
  const originalText = btn ? btn.innerText : '';
  if (btn) btn.innerText = 'Placing...';

  try {
    const url = (typeof getApiUrl === 'function') ? getApiUrl('/api/bets/place') : '/api/bets/place';
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({
        runner: currentBet.runner,
        event: currentBet.event,
        type: currentBet.type,
        odds: odds,
        stake: stake
      })
    });

    const data = await res.json();
    if (res.ok && data.status === 'success') {
      alert(`Bet Placed Successfully!\n${currentBet.type}: ${currentBet.runner}\nOdds: ${odds} | Stake: ₹${stake}`);
      closeBetslip();
      if (data.user && typeof updateUserLoggedInState === 'function') {
        updateUserLoggedInState(data.user);
        localStorage.setItem('current_user', JSON.stringify(data.user));
      }
      if (typeof showToast === 'function') {
        showToast('Bet placed and balance updated!');
      }
    } else {
      alert('Bet Placement Failed: ' + (data.message || 'Error occurred'));
    }
  } catch (err) {
    alert('Network error placing bet: ' + err.message);
  } finally {
    if (btn) btn.innerText = originalText;
  }
}

document.addEventListener('DOMContentLoaded', function() {
  const oddsInput = document.getElementById('bsOddsInput');
  const stakeInput = document.getElementById('bsStakeInput');

  if (oddsInput) oddsInput.addEventListener('input', updateCalculation);
  if (stakeInput) stakeInput.addEventListener('input', updateCalculation);
});
