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

      const url = `https://fclm-portal.amazon.com/reports/functionRollup?reportFormat=HTML&warehouseId=${warehouseId}&processId=1003020&spanType=${spanType}&startDateWeek=${encodeURIComponent(startDate)}&maxIntradayDays=1&startHourIntraday=0&startMinuteIntraday=0&endHourIntraday=0&endMinuteIntraday=0`;

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
              if (t.querySelectorAll('tr').length > tables.length) table = t;
              if (!table || t.querySelectorAll('tr').length > table.querySelectorAll('tr').length) table = t;
            }
            if (table) {
              table.querySelectorAll('tr').forEach(row => {
                const cells = row.querySelectorAll('td');
                if (cells.length < 14) return;
                const login = cells[6]?.textContent.trim();
                const hours = parseFloat(cells[11]?.textContent.trim()) || 0;
                if (login && login.length >= 4 && !/\s/.test(login) && hours > 0) {
                  tisMap.set(login.toLowerCase(), hours);
                }
              });
            }
          } catch (e) {
            console.warn('[BP] TIS parse error:', e);
          }
          console.log('[BP] TIS data loaded:', tisMap.size, 'associates');
          resolve(tisMap);
        },
        onerror: () => resolve(new Map()),
      });
    });
  }

  function buildPanel(associates, tisMap) {
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
      const tisHours = tisMap.get(a.login.toLowerCase());
      const tisHtml = tisHours
        ? `<span style="background:#ff9800;color:#000;padding:1px 5px;border-radius:4px;font-size:9px;font-weight:700;">${tisHours.toFixed(1)}h</span>`
        : '<span style="color:#78909c;font-size:9px;">—</span>';
      rows += `<tr>
        <td class="bp-login">${a.login}</td>
        <td class="bp-name">${a.name}</td>
        <td class="bp-name">${a.manager}</td>
        <td class="bp-hours">${a.paidHoursTotal.toFixed(1)}</td>
        <td class="bp-uph">${a.uph.toFixed(1)}</td>
        <td>${tisHtml}</td>
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
          <div style="margin-bottom:6px;"><label style="color:#aab7c4;font-size:10px;">Sort by: </label><select id="bp-sort" style="background:#3a4553;color:#fff;border:1px solid #556;border-radius:3px;padding:2px 6px;font-size:10px;font-family:'Amazon Ember',Arial,sans-serif;"><option value="uph">UPH (lowest first)</option><option value="manager">Manager (A→Z)</option><option value="name">Name (A→Z)</option><option value="hours">Hours (highest first)</option></select></div>
          <table>
            <thead><tr><th id="bp-th-login" style="cursor:pointer;">Login ↕</th><th id="bp-th-name" style="cursor:pointer;">Name ↕</th><th id="bp-th-mgr" style="cursor:pointer;">Manager ↕</th><th id="bp-th-hours" style="cursor:pointer;">Hours ↕</th><th id="bp-th-uph" style="cursor:pointer;">UPH ↕</th><th>TIS Hrs</th></tr></thead>
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

    function resortTable(sortBy) {
      let sorted = [...bottom15];
      if (sortBy === 'manager') sorted.sort((a, b) => a.manager.localeCompare(b.manager));
      else if (sortBy === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name));
      else if (sortBy === 'login') sorted.sort((a, b) => a.login.localeCompare(b.login));
      else if (sortBy === 'hours') sorted.sort((a, b) => b.paidHoursTotal - a.paidHoursTotal);
      else sorted.sort((a, b) => a.uph - b.uph);

      let newRows = '';
      sorted.forEach(a => {
        const tisHours = tisMap.get(a.login.toLowerCase());
        const tisHtml = tisHours
          ? `<span style="background:#ff9800;color:#000;padding:1px 5px;border-radius:4px;font-size:9px;font-weight:700;">${tisHours.toFixed(1)}h</span>`
          : '<span style="color:#78909c;font-size:9px;">—</span>';
        newRows += `<tr>
          <td class="bp-login">${a.login}</td>
          <td class="bp-name">${a.name}</td>
          <td class="bp-name">${a.manager}</td>
          <td class="bp-hours">${a.paidHoursTotal.toFixed(1)}</td>
          <td class="bp-uph">${a.uph.toFixed(1)}</td>
          <td>${tisHtml}</td>
        </tr>`;
      });
      document.getElementById('bp-tbody').innerHTML = newRows;
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
    console.log('[BP] Script loaded, watching for data table...');
    // Watch continuously for the data table to appear (it loads after user clicks HTML)
    const observer = new MutationObserver(async () => {
      if (document.querySelector('.bp-panel')) return; // already built
      const tables = document.querySelectorAll('table');
      for (const t of tables) {
        const rows = t.querySelectorAll('tr');
        if (rows.length > 10) {
          // Check if this table has login-like data
          const cells = rows[3]?.querySelectorAll('td');
          if (cells && cells.length > 13) {
            const login = cells[6]?.textContent.trim();
            if (login && /^[a-z][a-z0-9]{3,11}$/.test(login)) {
              console.log('[BP] Found data table, parsing all tabs...');
              const associates = await parseAllTabs();
              console.log('[BP] Parsed associates:', associates.length);
              if (associates.length > 0) {
                buildPanel(associates);
                observer.disconnect();
              }
              return;
            }
          }
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Also try immediately in case data is already loaded
    setTimeout(async () => {
      if (document.querySelector('.bp-panel')) return;
      const associates = await parseAllTabs();
      console.log('[BP] Total associates from all tabs:', associates.length);
      if (associates.length > 0) buildPanel(associates);
    }, 3000);
  }

  // --- ROUTER ---
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
