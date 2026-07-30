// ==UserScript==
// @name         FCLM - Bottom 15% Rate Dashboard
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Highlights and shows a dashboard of the bottom 15% performers by UPH on FCLM Function Rollup
// @updateURL    https://raw.githubusercontent.com/nloprete/amazon-ops-tools/main/fclm-bottom-performers.user.js
// @downloadURL  https://raw.githubusercontent.com/nloprete/amazon-ops-tools/main/fclm-bottom-performers.user.js
// @match        https://fclm-portal.amazon.com/reports/functionRollup*
// @grant        GM_addStyle
// ==/UserScript==

(function () {
  'use strict';

  GM_addStyle(`
    .bp-panel {
      position: fixed;
      top: 60px;
      right: 12px;
      z-index: 99999;
      background: #232f3e;
      color: #fff;
      border-radius: 8px;
      padding: 12px 16px;
      font-family: "Amazon Ember", Arial, sans-serif;
      box-shadow: 0 4px 16px rgba(0,0,0,0.3);
      width: 420px;
      max-height: 80vh;
      border: 2px solid #ff5252;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .bp-title {
      color: #ff5252;
      font-weight: 700;
      font-size: 14px;
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .bp-min-btn {
      background: none; border: none; color: #aab7c4;
      cursor: pointer; font-size: 14px; padding: 0 5px; margin-left: auto;
    }
    .bp-min-btn:hover { color: #fff; }
    .bp-panel.minimized .bp-body { display: none; }
    .bp-body {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }
    .bp-summary {
      display: flex;
      justify-content: space-between;
      padding: 6px 0;
      border-bottom: 1px solid #ff5252;
      margin-bottom: 6px;
    }
    .bp-stat { text-align: center; }
    .bp-stat .val { font-size: 18px; font-weight: 700; color: #ff5252; }
    .bp-stat .lbl { font-size: 9px; color: #aab7c4; }
    .bp-results {
      overflow-y: auto;
      flex: 1;
      min-height: 0;
      font-size: 11px;
    }
    .bp-results table { width: 100%; border-collapse: collapse; }
    .bp-results th {
      background: #3a4553;
      color: #ff5252;
      padding: 3px 6px;
      text-align: left;
      font-size: 10px;
      position: sticky;
      top: 0;
    }
    .bp-results td { padding: 3px 6px; border-bottom: 1px solid #3a4553; }
    .bp-results tr:hover td { background: #3a4553; }
    .bp-login { color: #4fc3f7; font-weight: 600; }
    .bp-name { color: #aab7c4; }
    .bp-hours { color: #ff9900; font-weight: 700; }
    .bp-uph { color: #ff5252; font-weight: 700; }
    .bp-row-highlight { background: #ffebee !important; }
  `);

  function parseTable() {
    // Find the largest table on the page
    const tables = document.querySelectorAll('table');
    let table = null;
    for (const t of tables) {
      if (!table || t.querySelectorAll('tr').length > table.querySelectorAll('tr').length) table = t;
    }
    if (!table) return [];

    const associates = [];
    const rows = table.querySelectorAll('tr');

    rows.forEach(row => {
      const cells = row.querySelectorAll('td');
      if (cells.length < 14) return;

      // Col 6 = Login, Col 2 = Name, Col 3 = Manager, Col 11 = Hours Total, Col 13 = UPH
      const login = cells[6]?.textContent.trim();
      const name = cells[2]?.textContent.trim();
      const manager = cells[3]?.textContent.trim();
      const paidHoursTotal = parseFloat(cells[11]?.textContent.trim()) || 0;
      const uph = parseFloat(cells[13]?.textContent.trim()) || 0;

      // Only include rows with a valid login (lowercase, 4-12 chars)
      if (login && /^[a-z][a-z0-9]{3,11}$/.test(login) && paidHoursTotal > 0) {
        associates.push({ login, name, manager, paidHoursTotal, uph });
      }
    });

    return associates;
  }

  function buildPanel(associates) {
    if (document.querySelector('.bp-panel')) document.querySelector('.bp-panel').remove();

    // Sort by UPH and get bottom 15%
    const sorted = [...associates].filter(a => a.uph > 0).sort((a, b) => a.uph - b.uph);
    const cutoff = Math.ceil(sorted.length * 0.15);
    const bottom15 = sorted.slice(0, cutoff);

    if (!bottom15.length) return;

    const avgUPH = Math.round(bottom15.reduce((s, a) => s + a.uph, 0) / bottom15.length);
    const totalHours = bottom15.reduce((s, a) => s + a.paidHoursTotal, 0).toFixed(1);

    const panel = document.createElement('div');
    panel.className = 'bp-panel';
    let rows = '';
    bottom15.forEach(a => {
      rows += `<tr>
        <td class="bp-login">${a.login}</td>
        <td class="bp-name">${a.name}</td>
        <td class="bp-hours">${a.paidHoursTotal.toFixed(1)}</td>
        <td class="bp-uph">${a.uph.toFixed(1)}</td>
      </tr>`;
    });

    panel.innerHTML = `
      <div class="bp-title">📉 Bottom 15% Performers <button class="bp-min-btn">—</button></div>
      <div class="bp-body">
        <div class="bp-summary">
          <div class="bp-stat"><div class="val">${bottom15.length}</div><div class="lbl">ASSOCIATES</div></div>
          <div class="bp-stat"><div class="val">${totalHours}</div><div class="lbl">TOTAL HOURS</div></div>
          <div class="bp-stat"><div class="val">${avgUPH}</div><div class="lbl">AVG UPH</div></div>
        </div>
        <div class="bp-results">
          <table>
            <thead><tr><th>Login</th><th>Name</th><th>Hours</th><th>UPH</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `;
    document.body.appendChild(panel);

    panel.querySelector('.bp-min-btn').addEventListener('click', () => {
      panel.classList.toggle('minimized');
      panel.querySelector('.bp-min-btn').textContent = panel.classList.contains('minimized') ? '□' : '—';
    });

    // Highlight rows in the original table
    const table = document.querySelector('table');
    if (table) {
      const dataRows = [...table.querySelectorAll('tr')].filter(r => r.querySelectorAll('td').length > 5);
      const bottomLogins = new Set(bottom15.map(a => a.login.toLowerCase()));
      dataRows.forEach(row => {
        const cells = row.querySelectorAll('td');
        const login = cells[6]?.textContent.trim().toLowerCase();
        if (login && bottomLogins.has(login)) {
          row.classList.add('bp-row-highlight');
        }
      });
    }
  }

  function init() {
    let polls = 0;
    const poller = setInterval(() => {
      polls++;
      const rows = document.querySelectorAll('table tr td');
      if (rows.length > 10 || polls >= 20) {
        clearInterval(poller);
        const associates = parseTable();
        console.log('[BP] Parsed associates:', associates.length);
        if (associates.length > 0) {
          buildPanel(associates);
        }
      }
    }, 2000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
