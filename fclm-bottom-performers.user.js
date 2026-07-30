// ==UserScript==
// @name         FCLM - Bottom 15% Rate Dashboard
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Highlights and shows a dashboard of the bottom 15% performers by UPH on FCLM Function Rollup
// @updateURL    https://raw.githubusercontent.com/nloprete/amazon-ops-tools/main/fclm-bottom-performers.user.js
// @downloadURL  https://raw.githubusercontent.com/nloprete/amazon-ops-tools/main/fclm-bottom-performers.user.js
// @match        https://fclm-portal.amazon.com/reports/functionRollup*
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function () {
  'use strict';

  GM_addStyle(`
    .bp-panel {
      position: fixed;
      top: 60px;
      left: 12px;
      z-index: 99999;
      background: #232f3e;
      color: #fff;
      border-radius: 8px;
      padding: 12px 16px;
      font-family: "Amazon Ember", Arial, sans-serif;
      box-shadow: 0 4px 16px rgba(0,0,0,0.3);
      width: 500px;
      max-height: 80vh;
      border: 2px solid #ff5252;
      display: flex;
      flex-direction: column;
      overflow: auto;
      resize: both;
      min-width: 300px;
      min-height: 200px;
    }
    .bp-title {
      color: #ff5252;
      font-weight: 700;
      font-size: 14px;
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 6px;
      cursor: grab;
      user-select: none;
    }
    .bp-title:active { cursor: grabbing; }
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

      const login = cells[6]?.textContent.trim();
      const name = cells[2]?.textContent.trim();
      const manager = cells[3]?.textContent.trim();
      const paidHoursTotal = parseFloat(cells[11]?.textContent.trim()) || 0;
      const uph = parseFloat(cells[13]?.textContent.trim()) || 0;

      if (login && login.length >= 4 && !/\s/.test(login) && !/Total|EACH|Small|Medium|Large/i.test(login) && paidHoursTotal >= 7) {
        associates.push({ login, name, manager, paidHoursTotal, uph });
      }
    });

    return associates;
  }

  // Click a process path tab and wait for table to reload
  function clickTab(tabText) {
    return new Promise((resolve) => {
      const allEls = document.querySelectorAll('a, button, div, span, td, input');
      for (const el of allEls) {
        const t = el.textContent.trim();
        if (t.includes(tabText) && t.length < 100) {
          el.click();
          setTimeout(resolve, 3000);
          return;
        }
      }
      resolve();
    });
  }

  async function parseAllTabs() {
    const allAssociates = new Map();

    // Click "Stow Each Nike" tab
    await clickTab('Stow Each Nike');
    const stowEach = parseTable();
    stowEach.forEach(a => allAssociates.set(a.login, a));
    console.log('[BP] Stow Each Nike:', stowEach.length);

    // Click "Stow Quantity Nike" tab
    await clickTab('Stow Quantity Nike');
    const stowQty = parseTable();
    stowQty.forEach(a => {
      if (!allAssociates.has(a.login)) {
        allAssociates.set(a.login, a);
      }
    });
    console.log('[BP] Stow Quantity Nike:', stowQty.length);

    return [...allAssociates.values()];
  }

  // Fetch Transfer In Support (processId 1003020) to check if bottom performers are coded there
  function fetchTISData() {
    return new Promise((resolve) => {
      // Build URL using same date range from current page URL
      const params = new URLSearchParams(window.location.search);
      const spanType = params.get('spanType') || 'Week';
      const startDate = params.get('startDateWeek') || params.get('startDate') || '';
      const warehouseId = params.get('warehouseId') || 'RIC4';

      // Build the TIS URL using whichever date param is available
      const dateParam = spanType === 'Week'
        ? `startDateWeek=${encodeURIComponent(startDate)}`
        : `startDate=${encodeURIComponent(startDate)}`;

      const url = `https://fclm-portal.amazon.com/reports/functionRollup?reportFormat=HTML&warehouseId=${warehouseId}&processId=1003020&spanType=${spanType}&${dateParam}&maxIntradayDays=1&startHourIntraday=0&startMinuteIntraday=0&endHourIntraday=0&endMinuteIntraday=0`;

      console.log('[BP] Fetching TIS URL:', url);

      GM_xmlhttpRequest({
        method: 'GET',
        url: url,
        withCredentials: true,
        onload: (resp) => {
          const tisMap = new Map();
          try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(resp.responseText, 'text/html');
            const tables = doc.querySelectorAll('table');
            let table = null;
            for (const t of tables) {
              if (!table || t.querySelectorAll('tr').length > table.querySelectorAll('tr').length) table = t;
            }
            if (table) {
              const rows = table.querySelectorAll('tr');
              console.log('[BP] TIS table found with', rows.length, 'rows');
              rows.forEach(row => {
                const cells = row.querySelectorAll('td');
                if (cells.length < 12) return;
                const login = cells[6]?.textContent.trim();
                const hours = parseFloat(cells[11]?.textContent.trim()) || 0;
                if (login && login.length >= 4 && !/\s/.test(login) && hours > 0) {
                  tisMap.set(login.toLowerCase(), hours);
                }
              });
            } else {
              console.warn('[BP] No table found in TIS response');
            }
          } catch (e) {
            console.warn('[BP] TIS parse error:', e);
          }
          console.log('[BP] TIS data loaded:', tisMap.size, 'associates');
          resolve(tisMap);
        },
        onerror: (err) => {
          console.warn('[BP] TIS fetch failed:', err);
          resolve(new Map());
        },
      });
    });
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
        <td class="bp-name">${a.manager}</td>
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
          <div style="margin-bottom:6px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            <label style="color:#aab7c4;font-size:10px;">Sort by: </label><select id="bp-sort" style="background:#3a4553;color:#fff;border:1px solid #556;border-radius:3px;padding:2px 6px;font-size:10px;font-family:'Amazon Ember',Arial,sans-serif;"><option value="uph">UPH (lowest first)</option><option value="manager">Manager (A→Z)</option><option value="name">Name (A→Z)</option><option value="hours">Hours (highest first)</option></select>
            <button id="bp-mgr-filter-btn" style="background:#3a4553;color:#ff9900;border:1px solid #ff9900;border-radius:3px;padding:2px 8px;font-size:10px;cursor:pointer;font-family:'Amazon Ember',Arial,sans-serif;">Filter Managers ▼</button>
          </div>
          <div id="bp-mgr-filter" style="display:none;margin-bottom:8px;padding:6px;background:#2a3544;border-radius:4px;max-height:120px;overflow-y:auto;"></div>
          <table>
            <thead><tr><th id="bp-th-login" style="cursor:pointer;">Login ↕</th><th id="bp-th-name" style="cursor:pointer;">Name ↕</th><th id="bp-th-mgr" style="cursor:pointer;">Manager ↕</th><th id="bp-th-hours" style="cursor:pointer;">Hours ↕</th><th id="bp-th-uph" style="cursor:pointer;">UPH ↕</th></tr></thead>
            <tbody id="bp-tbody">${rows}</tbody>
          </table>
        </div>
      </div>
    `;
    document.body.appendChild(panel);

    // Minimize
    panel.querySelector('.bp-min-btn').addEventListener('click', () => {
      panel.classList.toggle('minimized');
      panel.querySelector('.bp-min-btn').textContent = panel.classList.contains('minimized') ? '□' : '—';
    });

    // Drag
    const titleBar = panel.querySelector('.bp-title');
    let isDragging = false, offsetX = 0, offsetY = 0;
    titleBar.addEventListener('mousedown', (e) => {
      if (e.target.classList.contains('bp-min-btn')) return;
      isDragging = true;
      offsetX = e.clientX - panel.getBoundingClientRect().left;
      offsetY = e.clientY - panel.getBoundingClientRect().top;
      e.preventDefault();
    });
    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      panel.style.left = Math.max(0, e.clientX - offsetX) + 'px';
      panel.style.top = Math.max(0, e.clientY - offsetY) + 'px';
      panel.style.right = 'auto';
      e.preventDefault();
    });
    window.addEventListener('mouseup', () => { isDragging = false; });

    // Sort dropdown
    document.getElementById('bp-sort').addEventListener('change', (e) => {
      const sortBy = e.target.value;
      resortTable(sortBy);
    });

    // Click Manager header to sort
    document.getElementById('bp-th-mgr').addEventListener('click', () => {
      document.getElementById('bp-sort').value = 'manager';
      resortTable('manager');
    });
    document.getElementById('bp-th-login').addEventListener('click', () => {
      document.getElementById('bp-sort').value = 'name';
      resortTable('login');
    });
    document.getElementById('bp-th-name').addEventListener('click', () => {
      document.getElementById('bp-sort').value = 'name';
      resortTable('name');
    });
    document.getElementById('bp-th-hours').addEventListener('click', () => {
      document.getElementById('bp-sort').value = 'hours';
      resortTable('hours');
    });
    document.getElementById('bp-th-uph').addEventListener('click', () => {
      document.getElementById('bp-sort').value = 'uph';
      resortTable('uph');
    });

    // Manager filter
    const managers = [...new Set(bottom15.map(a => a.manager))].sort();
    const selectedManagers = new Set(managers);
    const filterDiv = document.getElementById('bp-mgr-filter');
    const filterBtn = document.getElementById('bp-mgr-filter-btn');

    filterDiv.innerHTML = managers.map(m =>
      `<label style="display:block;color:#fff;font-size:10px;padding:1px 0;cursor:pointer;"><input type="checkbox" class="bp-mgr-cb" data-mgr="${m}" checked style="margin-right:4px;">${m}</label>`
    ).join('');

    filterBtn.addEventListener('click', () => {
      filterDiv.style.display = filterDiv.style.display === 'none' ? 'block' : 'none';
    });

    filterDiv.querySelectorAll('.bp-mgr-cb').forEach(cb => {
      cb.addEventListener('change', () => {
        if (cb.checked) selectedManagers.add(cb.dataset.mgr);
        else selectedManagers.delete(cb.dataset.mgr);
        filterAndSort();
      });
    });

    function filterAndSort() {
      const filtered = bottom15.filter(a => selectedManagers.has(a.manager));
      const sortBy = document.getElementById('bp-sort').value;
      if (sortBy === 'manager') filtered.sort((a, b) => a.manager.localeCompare(b.manager));
      else if (sortBy === 'name') filtered.sort((a, b) => a.name.localeCompare(b.name));
      else if (sortBy === 'login') filtered.sort((a, b) => a.login.localeCompare(b.login));
      else if (sortBy === 'hours') filtered.sort((a, b) => b.paidHoursTotal - a.paidHoursTotal);
      else filtered.sort((a, b) => a.uph - b.uph);

      let newRows = '';
      filtered.forEach(a => {
        newRows += `<tr>
          <td class="bp-login">${a.login}</td>
          <td class="bp-name">${a.name}</td>
          <td class="bp-name">${a.manager}</td>
          <td class="bp-hours">${a.paidHoursTotal.toFixed(1)}</td>
          <td class="bp-uph">${a.uph.toFixed(1)}</td>
        </tr>`;
      });
      document.getElementById('bp-tbody').innerHTML = newRows;
    }

    function resortTable(sortBy) {
      filterAndSort();
    }

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
    console.log('[BP] Script loaded — adding button');
    
    // Add a "Show Bottom 15%" button to the page
    const btn = document.createElement('button');
    btn.textContent = '📉 Show Bottom 15%';
    btn.style.cssText = 'position:fixed;bottom:12px;left:12px;z-index:99999;background:#ff5252;color:#fff;border:none;border-radius:6px;padding:8px 16px;font-size:13px;font-weight:700;cursor:pointer;font-family:"Amazon Ember",Arial,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,0.3);';
    btn.addEventListener('click', async () => {
      btn.textContent = '⏳ Loading...';
      btn.disabled = true;
      const associates = parseTable();
      console.log('[BP] Parsed:', associates.length, 'associates');
      if (associates.length > 0) {
        buildPanel(associates);
      } else {
        alert('No associate data found. Make sure you\'ve loaded the HTML report first.');
      }
      btn.textContent = '📉 Show Bottom 15%';
      btn.disabled = false;
    });
    document.body.appendChild(btn);
  }

  // --- ROUTER ---
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
