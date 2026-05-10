// ==UserScript==
// @name         FCLM - PS Rate Tracker
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Extracts Problem Solve rates from Function Rollup and displays a copyable rate tracker
// @updateURL    https://raw.githubusercontent.com/nloprete/amazon-ops-tools/main/fclm-ps-rate-tracker.user.js
// @downloadURL  https://raw.githubusercontent.com/nloprete/amazon-ops-tools/main/fclm-ps-rate-tracker.user.js
// @match        https://fclm-portal.amazon.com/reports/functionRollup*
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

(function () {
  'use strict';

  const EXPECTED_UPH = 115;

  GM_addStyle(`
    .ps-panel {
      position: fixed;
      top: 60px;
      right: 12px;
      z-index: 99999;
      background: #232f3e;
      color: #fff;
      border-radius: 6px;
      padding: 8px 12px;
      font-family: "Amazon Ember", Arial, sans-serif;
      box-shadow: 0 4px 16px rgba(0,0,0,0.3);
      width: 380px;
      max-height: 85vh;
      border: 2px solid #ff9900;
      display: flex;
      flex-direction: column;
      cursor: default;
      resize: both;
      overflow: hidden;
      min-width: 300px;
      min-height: 150px;
    }
    .ps-title {
      color: #ff9900;
      font-weight: 700;
      font-size: 12px;
      margin-bottom: 6px;
      display: flex;
      align-items: center;
      gap: 4px;
      cursor: grab;
      user-select: none;
    }
    .ps-title:active { cursor: grabbing; }
    .ps-min-btn {
      background: none; border: none; color: #aab7c4;
      cursor: pointer; font-size: 11px; padding: 0 3px; margin-left: auto;
    }
    .ps-min-btn:hover { color: #fff; }
    .ps-panel.minimized .ps-body { display: none; }

    .ps-body {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }
    .ps-btn {
      background: #ff9900;
      color: #232f3e;
      border: none;
      border-radius: 4px;
      padding: 4px 8px;
      font-size: 11px;
      font-weight: 700;
      cursor: pointer;
      width: 100%;
      font-family: "Amazon Ember", Arial, sans-serif;
      margin-bottom: 6px;
    }
    .ps-btn:hover { background: #ffb74d; }

    .ps-results {
      overflow-y: auto;
      flex: 1;
      min-height: 0;
      font-size: 11px;
    }
    .ps-results table {
      width: 100%;
      border-collapse: collapse;
    }
    .ps-results th {
      background: #3a4553;
      color: #ff9900;
      padding: 3px 5px;
      text-align: left;
      font-size: 10px;
      position: sticky;
      top: 0;
    }
    .ps-results td {
      padding: 2px 5px;
      border-bottom: 1px solid #3a4553;
    }
    .ps-results tr:hover td { background: #3a4553; }

    .ps-rate-good { color: #69f0ae; font-weight: 700; }
    .ps-rate-warn { color: #ffd740; font-weight: 700; }
    .ps-rate-bad { color: #ff5252; font-weight: 700; }
    .ps-login { color: #4fc3f7; }
    .ps-station { color: #aab7c4; font-size: 10px; }
    .ps-copy-cell {
      cursor: pointer;
      padding: 1px 4px;
      border-radius: 3px;
    }
    .ps-copy-cell:hover { background: #455a64; }
    .ps-copy-cell.copied { background: #2e7d32; }

    .ps-summary {
      font-size: 10px;
      color: #aab7c4;
      margin-top: 4px;
      padding-top: 4px;
      border-top: 1px solid #3a4553;
    }
    .ps-timestamp {
      font-size: 9px;
      color: #78909c;
      text-align: center;
      margin-top: 4px;
    }
  `);

  function parseData() {
    const associates = [];
    const tables = [...document.querySelectorAll('table')];

    for (const table of tables) {
      const rows = [...table.querySelectorAll('tr')];
      if (rows.length < 4) continue;
      const headerCells = [...rows[0].querySelectorAll('td, th')].map(c => c.textContent.trim());
      // Detect data tables: first data row starts with AMZN/TEMP
      const firstDataRow = rows[3]?.querySelectorAll('td');
      if (!firstDataRow || firstDataRow.length < 10) continue;
      const firstCell = firstDataRow[0]?.textContent.trim();
      if (!/^(AMZN|TEMP|AMZL)/i.test(firstCell)) continue;

      rows.slice(3).forEach(row => {
        const cells = [...row.querySelectorAll('td')];
        if (cells.length < 15) return;

        // Find login dynamically (4-10 lowercase letters)
        let login = '';
        let loginIdx = -1;
        for (let ci = 5; ci < 12; ci++) {
          const val = (cells[ci]?.textContent || '').trim();
          if (/^[a-z]{4,10}$/.test(val)) {
            login = val;
            loginIdx = ci;
            break;
          }
        }
        if (!login) return;

        const name = cells[2]?.textContent.trim();
        const manager = cells[3]?.textContent.trim();

        // Station: check cell 11 or 12 for station pattern
        let station = '';
        for (let ci = 10; ci < 14; ci++) {
          const val = (cells[ci]?.textContent || '').trim();
          if (val && val !== '-' && /[A-Z0-9]/.test(val) && val.length > 3) {
            station = val;
            break;
          }
        }

        // Total hours: find cell 16 (or nearby) with a decimal hours value
        let totalHours = 0;
        for (let ci = 14; ci < 18; ci++) {
          const val = parseFloat(cells[ci]?.textContent.trim());
          if (!isNaN(val) && val > 0 && val < 24) {
            totalHours = val;
            break;
          }
        }

        // Jobs and JPH: first pair after hours
        let jobs = 0, jph = 0;
        for (let ci = 16; ci < 20; ci++) {
          const v1 = parseInt(cells[ci]?.textContent.trim());
          const v2 = parseFloat(cells[ci + 1]?.textContent.trim());
          if (!isNaN(v1) && v1 > 0 && !isNaN(v2) && v2 > 0) {
            jobs = v1;
            jph = v2;
            break;
          }
        }

        // UPH: scan from end backwards for a rate value
        let uph = 0;
        for (let ci = cells.length - 2; ci >= 25; ci--) {
          const val = parseFloat(cells[ci]?.textContent.trim());
          if (!isNaN(val) && val > 0 && val < 500) {
            uph = val;
            break;
          }
        }

        if (totalHours < 0.01) return;

        associates.push({ name, manager, login, station, totalHours, jobs, jph, uph });
      });
    }

    return associates;
  }

  function getRateClass(uph) {
    if (uph >= EXPECTED_UPH) return 'ps-rate-good';
    if (uph >= EXPECTED_UPH * 0.8) return 'ps-rate-warn';
    return 'ps-rate-bad';
  }

  function formatRate(uph, jph) {
    const u = Math.round(uph);
    const j = Math.round(jph);
    return `${u}uph/${j}jph`;
  }

  function buildPanel() {
    if (document.querySelector('.ps-panel')) return;

    const minimized = GM_getValue('ps_minimized', false);
    const savedLeft = GM_getValue('ps_pos_left', '');
    const savedTop = GM_getValue('ps_pos_top', '');

    const panel = document.createElement('div');
    panel.className = `ps-panel${minimized ? ' minimized' : ''}`;
    if (savedLeft && savedTop) {
      panel.style.left = savedLeft;
      panel.style.top = savedTop;
      panel.style.right = 'auto';
    }
    panel.innerHTML = `
      <div class="ps-title">
        📊 PS Rate Tracker
        <button class="ps-min-btn">${minimized ? '▼' : '▲'}</button>
      </div>
      <div class="ps-body">
        <button class="ps-btn" id="ps-refresh">🔄 Pull Rates</button>
        <div class="ps-results" id="ps-results"></div>
        <div class="ps-timestamp" id="ps-timestamp"></div>
      </div>
    `;

    document.body.appendChild(panel);

    // Minimize
    panel.querySelector('.ps-min-btn').addEventListener('click', () => {
      panel.classList.toggle('minimized');
      const isMin = panel.classList.contains('minimized');
      panel.querySelector('.ps-min-btn').textContent = isMin ? '▼' : '▲';
      GM_setValue('ps_minimized', isMin);
    });

    // Drag
    const titleBar = panel.querySelector('.ps-title');
    let isDragging = false, offsetX = 0, offsetY = 0;
    titleBar.addEventListener('mousedown', (e) => {
      if (e.target.classList.contains('ps-min-btn')) return;
      isDragging = true;
      offsetX = e.clientX - panel.getBoundingClientRect().left;
      offsetY = e.clientY - panel.getBoundingClientRect().top;
      panel.style.right = 'auto';
      e.preventDefault(); e.stopPropagation();
    }, true);
    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      e.preventDefault(); e.stopPropagation();
      panel.style.left = Math.max(0, e.clientX - offsetX) + 'px';
      panel.style.top = Math.max(0, e.clientY - offsetY) + 'px';
    }, true);
    window.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        GM_setValue('ps_pos_left', panel.style.left);
        GM_setValue('ps_pos_top', panel.style.top);
      }
    }, true);

    // Refresh
    document.getElementById('ps-refresh').addEventListener('click', refreshData);

    // Auto-pull on load
    setTimeout(refreshData, 2000);
  }

  function refreshData() {
    const data = parseData();
    const resultsEl = document.getElementById('ps-results');

    if (data.length === 0) {
      resultsEl.innerHTML = '<div style="color:#78909c;padding:8px">No PS data found. Make sure IB Problem Solve process is loaded.</div>';
      return;
    }

    // Sort by UPH ascending (worst first)
    data.sort((a, b) => a.uph - b.uph);

    const aboveCount = data.filter(d => d.uph >= EXPECTED_UPH).length;
    const belowCount = data.filter(d => d.uph < EXPECTED_UPH && d.uph > 0).length;

    let rows = '';
    data.forEach(aa => {
      const rateStr = formatRate(aa.uph, aa.jph);
      const rateClass = getRateClass(aa.uph);
      const stationDisplay = aa.station && aa.station !== '-' ? aa.station : '—';

      rows += `<tr>
        <td class="ps-login">${aa.login}</td>
        <td class="ps-station">${stationDisplay}</td>
        <td>${aa.totalHours.toFixed(2)}</td>
        <td class="${rateClass} ps-copy-cell" data-copy="${rateStr}" title="Click to copy">${rateStr}</td>
      </tr>`;
    });

    resultsEl.innerHTML = `
      <div class="ps-summary">
        <span style="color:#69f0ae">${aboveCount}</span> above ${EXPECTED_UPH} |
        <span style="color:#ff5252">${belowCount}</span> below ${EXPECTED_UPH} |
        ${data.length} total
      </div>
      <table>
        <thead><tr><th>Login</th><th>Station</th><th>Hours</th><th>Rate (click to copy)</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;

    // Click to copy rate
    resultsEl.querySelectorAll('.ps-copy-cell').forEach(cell => {
      cell.addEventListener('click', () => {
        navigator.clipboard.writeText(cell.dataset.copy);
        cell.classList.add('copied');
        setTimeout(() => cell.classList.remove('copied'), 1000);
      });
    });

    document.getElementById('ps-timestamp').textContent = `Updated ${new Date().toLocaleTimeString()}`;
  }

  // Init
  function init() {
    let polls = 0;
    const poller = setInterval(() => {
      polls++;
      if (document.querySelectorAll('table').length > 3 || polls >= 15) {
        clearInterval(poller);
        buildPanel();
      }
    }, 2000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
