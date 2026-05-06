// ==UserScript==
// @name         FCLM - Manager Hours by Bucket
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Select managers and buckets on Function Rollup to sum their coded hours
// @updateURL    https://raw.githubusercontent.com/nloprete/amazon-ops-tools/main/fclm-manager-hours.user.js
// @downloadURL  https://raw.githubusercontent.com/nloprete/amazon-ops-tools/main/fclm-manager-hours.user.js
// @match        https://fclm-portal.amazon.com/reports/functionRollup*
// @match        https://fclm-portal.amazon.com/reports/*
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

(function () {
  'use strict';

  GM_addStyle(`
    .mh-panel {
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
      width: 340px;
      max-height: 85vh;
      border: 2px solid #ff9900;
      display: flex;
      flex-direction: column;
      cursor: default;
      resize: both;
      overflow: hidden;
      min-width: 260px;
      min-height: 150px;
    }
    .mh-title {
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
    .mh-title:active { cursor: grabbing; }
    .mh-min-btn {
      background: none; border: none; color: #aab7c4;
      cursor: pointer; font-size: 11px; padding: 0 3px; margin-left: auto;
    }
    .mh-min-btn:hover { color: #fff; }
    .mh-panel.minimized .mh-body { display: none; }

    .mh-body {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }
    .mh-section-label {
      color: #ff9900;
      font-size: 10px;
      font-weight: 700;
      margin: 6px 0 3px 0;
      text-transform: uppercase;
    }
    .mh-process-select {
      background: #3a4553;
      border: 1px solid #ff9900;
      color: #fff;
      border-radius: 4px;
      padding: 3px 6px;
      width: 100%;
      font-size: 11px;
      font-family: "Amazon Ember", Arial, sans-serif;
      box-sizing: border-box;
      cursor: pointer;
    }
    .mh-process-select:focus { outline: none; border-color: #ffb74d; }
    .mh-process-select option { background: #232f3e; color: #fff; }
    .mh-check-list {
      max-height: 120px;
      overflow-y: auto;
      background: #3a4553;
      border-radius: 4px;
      padding: 4px 6px;
      font-size: 11px;
    }
    .mh-check-list label {
      display: block;
      padding: 1px 0;
      cursor: pointer;
      color: #ddd;
    }
    .mh-check-list label:hover { color: #ff9900; }
    .mh-check-list input { margin-right: 5px; accent-color: #ff9900; }

    .mh-select-btns {
      display: flex;
      gap: 4px;
      margin-top: 3px;
    }
    .mh-select-btns button {
      background: #3a4553;
      border: 1px solid #556;
      color: #aab7c4;
      border-radius: 3px;
      padding: 1px 6px;
      font-size: 9px;
      cursor: pointer;
      font-family: "Amazon Ember", Arial, sans-serif;
    }
    .mh-select-btns button:hover { color: #ff9900; border-color: #ff9900; }

    .mh-calc-btn {
      background: #ff9900;
      color: #232f3e;
      border: none;
      border-radius: 4px;
      padding: 5px 8px;
      font-size: 11px;
      font-weight: 700;
      cursor: pointer;
      margin-top: 8px;
      width: 100%;
      font-family: "Amazon Ember", Arial, sans-serif;
    }
    .mh-calc-btn:hover { background: #ffb74d; }

    .mh-results {
      margin-top: 6px;
      overflow-y: auto;
      flex: 1;
      min-height: 0;
      font-size: 11px;
    }
    .mh-results table {
      width: 100%;
      border-collapse: collapse;
    }
    .mh-results th {
      background: #3a4553;
      color: #ff9900;
      padding: 3px 5px;
      text-align: left;
      font-size: 10px;
      position: sticky;
      top: 0;
    }
    .mh-results td {
      padding: 2px 5px;
      border-bottom: 1px solid #3a4553;
    }
    .mh-results tr:hover td { background: #3a4553; }
    .mh-results .mh-total-row td {
      border-top: 2px solid #ff9900;
      font-weight: 700;
      color: #ff9900;
    }
    .mh-hrs { color: #4fc3f7; font-weight: 700; }
    .mh-bucket { color: #aab7c4; }
    .mh-mgr { color: #69f0ae; }

    .mh-timestamp {
      font-size: 9px;
      color: #78909c;
      text-align: center;
      margin-top: 4px;
    }
  `);

  function scanPage() {
    const managers = new Set();
    const buckets = [];
    const functions = new Set();
    const tableData = [];

    const tables = [...document.querySelectorAll('table')];

    // First pass: extract function names from the tile elements
    const allEls = document.querySelectorAll('td, div, span, a');
    allEls.forEach(el => {
      const text = el.textContent.trim();
      if (/Hours:\s*[\d.]+/.test(text) && text.length < 100) {
        const name = text.split('\n')[0].trim().split('Hours:')[0].trim().split('Rate:')[0].trim().split('Volume:')[0].trim();
        if (name.length > 2 && name.length < 50) functions.add(name);
      }
    });

    // Second pass: extract data from detail tables
    // Get tables from the main panel as siblings
    const mainPanel = document.querySelector('.main-panel, div.main-panel');
    const siblingTables = mainPanel ? [...mainPanel.querySelectorAll(':scope > table')] : tables;

    siblingTables.forEach((table, ti) => {
      const rows = [...table.querySelectorAll('tr')];
      if (rows.length < 4) return;

      const headerCells = [...rows[0].querySelectorAll('td, th')].map(c => c.textContent.trim());
      const hasManager = headerCells.some(h => /manager/i.test(h));
      const hasPaidHours = headerCells.some(h => /paid\s*hours/i.test(h));
      if (!hasManager || !hasPaidHours) return;

      // Bucket name: walk backwards through siblings to find the header table
      let bucketName = 'Unknown';
      let prev = table.previousElementSibling;
      while (prev) {
        if (prev.tagName === 'TABLE') {
          const firstText = prev.querySelector('td, th')?.textContent.trim() || '';
          const match = firstText.match(/^(.+?)\s*\[/);
          if (match) {
            bucketName = match[1].trim();
            break;
          }
        }
        prev = prev.previousElementSibling;
      }

      if (bucketName && bucketName !== 'Unknown') buckets.push(bucketName);

      // Parse data rows
      rows.slice(3).forEach((row) => {
        const cells = [...row.querySelectorAll('td')];
        if (cells.length < 10) return;

        const manager = cells[3]?.textContent.trim();
        const name = cells[2]?.textContent.trim();
        const login = cells[8]?.textContent.trim();

        let totalHours = 0;
        for (let ci = cells.length - 2; ci >= 10; ci--) {
          const val = parseFloat(cells[ci]?.textContent.trim().replace(/,/g, ''));
          if (!isNaN(val) && val > 0) {
            totalHours = val;
            break;
          }
        }

        if (manager && manager.length > 2 && !/^(Manager|Type|-)$/.test(manager)) {
          managers.add(manager);
          tableData.push({ bucket: bucketName, manager, name, login, hours: totalHours });
        }
      });
    });

    return {
      managers: [...managers].sort(),
      buckets: [...new Set(buckets)].sort(),
      functions: [...functions].sort(),
      data: tableData,
    };
  }

  function buildPanel() {
    if (document.querySelector('.mh-panel')) return;

    const minimized = GM_getValue('mh_minimized', false);
    const savedLeft = GM_getValue('mh_pos_left', '');
    const savedTop = GM_getValue('mh_pos_top', '');

    const panel = document.createElement('div');
    panel.className = `mh-panel${minimized ? ' minimized' : ''}`;
    if (savedLeft && savedTop) {
      panel.style.left = savedLeft;
      panel.style.top = savedTop;
      panel.style.right = 'auto';
    }
    panel.innerHTML = `
      <div class="mh-title">
        📊 Manager Hours
        <button class="mh-min-btn">${minimized ? '▼' : '▲'}</button>
      </div>
      <div class="mh-body">
        <div class="mh-section-label">Process</div>
        <select class="mh-process-select" id="mh-process">
          <option value="">Loading processes...</option>
        </select>

        <div class="mh-section-label">Subcategory</div>
        <select class="mh-process-select" id="mh-subcat">
          <option value="__ALL__">All Subcategories</option>
        </select>

        <div class="mh-section-label">Managers</div>
        <div class="mh-check-list" id="mh-mgr-list">Loading...</div>
        <div class="mh-select-btns">
          <button id="mh-mgr-all">All</button>
          <button id="mh-mgr-none">None</button>
        </div>

        <button class="mh-calc-btn" id="mh-calc">📊 Calculate Hours</button>
        <div class="mh-results" id="mh-results"></div>
        <div class="mh-timestamp" id="mh-timestamp"></div>
      </div>
    `;

    document.body.appendChild(panel);

    // Minimize
    panel.querySelector('.mh-min-btn').addEventListener('click', () => {
      panel.classList.toggle('minimized');
      const isMin = panel.classList.contains('minimized');
      panel.querySelector('.mh-min-btn').textContent = isMin ? '▼' : '▲';
      GM_setValue('mh_minimized', isMin);
    });

    // Drag
    const titleBar = panel.querySelector('.mh-title');
    let isDragging = false, offsetX = 0, offsetY = 0;
    titleBar.addEventListener('mousedown', (e) => {
      if (e.target.classList.contains('mh-min-btn')) return;
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
        GM_setValue('mh_pos_left', panel.style.left);
        GM_setValue('mh_pos_top', panel.style.top);
      }
    }, true);

    // Select all/none buttons
    document.getElementById('mh-mgr-all').addEventListener('click', () => toggleAll('mh-mgr-list', true));
    document.getElementById('mh-mgr-none').addEventListener('click', () => toggleAll('mh-mgr-list', false));

    // Calculate
    document.getElementById('mh-calc').addEventListener('click', calculate);

    // Populate process dropdown from FCLM page
    const fclmProcessSelect = document.querySelector('select[name="processId"]');
    const panelProcessSelect = document.getElementById('mh-process');
    if (fclmProcessSelect) {
      const currentVal = fclmProcessSelect.value;
      panelProcessSelect.innerHTML = [...fclmProcessSelect.options].map(o => {
        const name = o.textContent.trim().split('[')[0].trim();
        const val = o.value;
        const selected = val === currentVal ? ' selected' : '';
        return `<option value="${val}"${selected}>${name}</option>`;
      }).join('');
    }

    // Process change — update FCLM dropdown and submit the form
    panelProcessSelect.addEventListener('change', () => {
      const newVal = panelProcessSelect.value;
      if (fclmProcessSelect) {
        fclmProcessSelect.value = newVal;
        fclmProcessSelect.dispatchEvent(new Event('change', { bubbles: true }));
        // Find and click the submit/HTML button
        const submitBtn = [...document.querySelectorAll('input[type="submit"], button')].find(
          b => /html/i.test(b.value || b.textContent)
        );
        if (submitBtn) {
          submitBtn.click();
        } else {
          // Fallback: submit the form
          const form = fclmProcessSelect.closest('form');
          if (form) form.submit();
        }
      }
    });

    // Populate after a delay (let page finish rendering)
    setTimeout(populate, 2000);
  }

  function toggleAll(listId, checked) {
    document.querySelectorAll(`#${listId} input`).forEach(cb => { cb.checked = checked; });
  }

  function populate() {
    const { managers, buckets } = scanPage();

    const mgrList = document.getElementById('mh-mgr-list');

    const savedMgrs = GM_getValue('mh_selected_mgrs', '[]');
    const prevMgrs = JSON.parse(savedMgrs);

    mgrList.innerHTML = managers.map(m =>
      `<label><input type="checkbox" value="${m}" ${prevMgrs.includes(m) ? 'checked' : ''}> ${m}</label>`
    ).join('');

    if (managers.length === 0) mgrList.innerHTML = '<div style="color:#78909c">No managers found — load a report first</div>';

    // Populate subcategory dropdown from tile names on the page
    const subcatSelect = document.getElementById('mh-subcat');
    const tileNames = [];
    document.querySelectorAll('td, div, span, a').forEach(el => {
      const text = el.textContent.trim();
      if (/Hours:\s*[\d.]+/.test(text) && text.length < 100) {
        const name = text.split('\n')[0].trim().split('Hours:')[0].trim().split('Rate:')[0].trim().split('Volume:')[0].trim();
        if (name.length > 2 && name.length < 50 && !tileNames.includes(name)) tileNames.push(name);
      }
    });
    tileNames.sort();
    subcatSelect.innerHTML = '<option value="__ALL__">All Subcategories</option>' +
      tileNames.map(b => `<option value="${b}">${b}</option>`).join('');
  }

  function calculate() {
    const selectedMgrs = new Set();
    document.querySelectorAll('#mh-mgr-list input:checked').forEach(cb => selectedMgrs.add(cb.value));

    // Save manager selection
    GM_setValue('mh_selected_mgrs', JSON.stringify([...selectedMgrs]));

    const subcatVal = document.getElementById('mh-subcat').value;
    const filterBySubcat = subcatVal && subcatVal !== '__ALL__';

    // Scan all tables on the page in DOM order
    const filtered = [];
    const allTables = [...document.querySelectorAll('table')];

    let currentBucket = 'Unknown';
    allTables.forEach((table) => {
      const rows = [...table.querySelectorAll('tr')];
      if (rows.length === 0) return;

      const firstText = table.querySelector('td, th')?.textContent.trim() || '';

      // Check if this is a bucket header table (has [id] pattern)
      const bucketMatch = firstText.match(/^(.+?)\s*\[\d/);
      if (bucketMatch && rows.length < 4) {
        currentBucket = bucketMatch[1].trim();
        return;
      }

      // Also check if the first cell of a small table has a bucket name with bracket
      if (rows.length <= 3) {
        rows.forEach(r => {
          const cells = [...r.querySelectorAll('td, th')];
          cells.forEach(c => {
            const t = c.textContent.trim();
            const m = t.match(/^(.+?)\s*\[\d/);
            if (m && m[1].trim().length > 2) currentBucket = m[1].trim();
          });
        });
        return;
      }

      // Check if this is a data table with Manager column
      if (rows.length < 4) return;
      const headerCells = [...rows[0].querySelectorAll('td, th')].map(c => c.textContent.trim());
      if (!headerCells.some(h => /manager/i.test(h))) return;

      // Skip if subcategory filter doesn't match
      if (filterBySubcat && currentBucket !== subcatVal) return;

      rows.slice(3).forEach((row) => {
        const cells = [...row.querySelectorAll('td')];
        if (cells.length < 10) return;

        const manager = cells[3]?.textContent.trim();
        if (!manager || !selectedMgrs.has(manager)) return;

        let totalHours = 0;
        for (let ci = cells.length - 2; ci >= 10; ci--) {
          const val = parseFloat(cells[ci]?.textContent.trim().replace(/,/g, ''));
          if (!isNaN(val) && val > 0) { totalHours = val; break; }
        }

        if (totalHours > 0) {
          filtered.push({ bucket: currentBucket, manager, hours: totalHours });
        }
      });
    });

    // Group by bucket
    const byBucket = {};
    let grandTotal = 0;
    filtered.forEach(d => {
      if (!byBucket[d.bucket]) byBucket[d.bucket] = { hours: 0, people: 0 };
      byBucket[d.bucket].hours += d.hours;
      byBucket[d.bucket].people++;
      grandTotal += d.hours;
    });

    // Group by manager
    const byManager = {};
    filtered.forEach(d => {
      if (!byManager[d.manager]) byManager[d.manager] = 0;
      byManager[d.manager] += d.hours;
    });

    let rows = '';
    Object.keys(byBucket).sort().forEach(bucket => {
      const b = byBucket[bucket];
      rows += `<tr>
        <td class="mh-bucket">${bucket}</td>
        <td class="mh-hrs">${b.hours.toFixed(2)}</td>
        <td>${b.people}</td>
      </tr>`;
    });

    rows += `<tr class="mh-total-row">
      <td>TOTAL</td>
      <td>${grandTotal.toFixed(2)}</td>
      <td>${filtered.length}</td>
    </tr>`;

    let mgrRows = '';
    Object.keys(byManager).sort().forEach(mgr => {
      mgrRows += `<tr>
        <td class="mh-mgr">${mgr}</td>
        <td class="mh-hrs">${byManager[mgr].toFixed(2)}</td>
      </tr>`;
    });

    const resultsEl = document.getElementById('mh-results');
    resultsEl.innerHTML = `
      <table>
        <thead><tr><th>Function</th><th>Hours</th><th>People</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="mh-section-label" style="margin-top:8px">By Manager</div>
      <table>
        <thead><tr><th>Manager</th><th>Hours</th></tr></thead>
        <tbody>${mgrRows}</tbody>
      </table>
    `;

    document.getElementById('mh-timestamp').textContent = `${selectedMgrs.size} mgrs × ${Object.keys(byBucket).length} buckets | ${new Date().toLocaleTimeString()}`;
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
