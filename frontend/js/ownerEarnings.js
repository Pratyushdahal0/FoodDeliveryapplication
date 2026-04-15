const OWNER_DASH_API = "../../backend/controllers/OwnerDashboardController.php";
const ORDER_API = "../../backend/controllers/OrderController.php";
const restaurantId = 1;

function formatCurrency(amount) {
  return `$${Number(amount || 0).toFixed(2)}`;
}

async function loadOwnerEarnings() {
  if (typeof requireOwnerAuth === 'function') {
    if (!requireOwnerAuth()) return;
  }

  try {
    const res = await fetch(`${OWNER_DASH_API}?restaurant_id=${restaurantId}`);
    const data = await res.json();

    if (data.success && data.data) {
      const dashboard = data.data;
      document.querySelector('.stat-card:nth-child(1) .stat-value').textContent = formatCurrency(dashboard.weekly_earnings / 5 || 485.6);
      document.querySelector('.stat-card:nth-child(2) .stat-value').textContent = formatCurrency(dashboard.total_earnings || 3240);
      document.querySelector('.stat-card:nth-child(3) .stat-value').textContent = formatCurrency((dashboard.total_earnings || 12850) * 0.8);
      document.getElementById('earningsChart')?.dispatchEvent(new CustomEvent('ownerEarningsLoaded', { detail: dashboard }));
    }
  } catch (error) {
    console.warn('Unable to load live owner earnings data:', error);
  }
}

function renderEarningsChart() {
  const canvas = document.getElementById('earningsChart');
  if (!canvas || typeof Chart === 'undefined') return;

  const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const chartData = [1200, 1750, 1480, 2200, 2650, 3100, 2500];

  new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          data: chartData,
          borderColor: '#e8192c',
          borderWidth: 2.5,
          pointBackgroundColor: '#e8192c',
          pointRadius: 5,
          pointHoverRadius: 7,
          fill: false,
          tension: 0.45
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => ' $' + ctx.parsed.y.toLocaleString()
          },
          backgroundColor: '#fff',
          titleColor: '#333',
          bodyColor: '#e8192c',
          borderColor: '#eee',
          borderWidth: 1,
          padding: 10
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#aaa', font: { size: 13 } },
          border: { display: false }
        },
        y: {
          grid: { color: '#f0f0f0' },
          ticks: {
            color: '#aaa',
            font: { size: 12 },
            callback: (val) => '$' + val.toLocaleString()
          },
          border: { display: false }
        }
      }
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  loadOwnerEarnings();
  renderEarningsChart();
});
