// ==UserScript==
// @name         Vantage - Water Spider Calculator
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Shows recommended water spider count based on active stowers on the Vantage station map
// @updateURL    https://raw.githubusercontent.com/nloprete/amazon-ops-tools/main/vantage-water-spiders.user.js
// @downloadURL  https://raw.githubusercontent.com/nloprete/amazon-ops-tools/main/vantage-water-spiders.user.js
// @match        https://vantage.amazon.com/app/fulfillment-dashboards/station-map*
// @match        https://fclm-portal.amazon.com/reports/processPathRollup*
// @connect      fclm-portal.amazon.com
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function () {
  'use strict';

  const WS_RATIO = 7; // 1 water spider per 7 stowers

  // --- STYLES ---
  GM_addStyle(`
    .ws-panel {
      position: fixed;
      top: 70px;
      right: 16px;
      z-index: 99999;
      background: #232f3e;
      color: #fff;
      border-radius: 6px;
      padding: 8px 12px;
      font-family: "Amazon Ember", Arial, sans-serif;
      box-shadow: 0 4px 16px rgba(0,0,0,0.3);
      min-width: 180px;
      border: 2px solid #ff9900;
      cursor: default;
    }
    .ws-panel-title {
      color: #ff9900;
      font-weight: 700;
      font-size: 12px;
      margin-bottom: 5px;
      display: flex;
      align-items: center;
      gap: 4px;
      cursor: grab;
      user-select: none;
    }
    .ws-panel-title:active {
      cursor: grabbing;
    }
    .ws-panel-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 2px 0;
      font-size: 11px;
      border-bottom: 1px solid #3a4553;
    }
    .ws-panel-row:last-child {
      border-bottom: none;
    }
    .ws-panel-label {
      color: #aab7c4;
    }
    .ws-panel-value {
      font-weight: 700;
      font-size: 12px;
    }
    .ws-panel-value.stowers { color: #4fc3f7; }
    .ws-panel-value.ws-needed { color: #ff9900; font-size: 15px; }
    .ws-panel-value.tph { color: #81c784; }
    .ws-panel-value.uph { color: #4fc3f7; }
    .ws-panel-value.tph-per-ws { color: #ffab40; }
    .ws-panel-value.drag { color: #ff5252; }
    .ws-panel-value.tph-clean { color: #69f0ae; }

    .ws-tph-input {
      background: #3a4553;
      border: 1px solid #ff9900;
      color: #fff;
      border-radius: 4px;
      padding: 1px 4px;
      width: 55px;
      font-size: 11px;
      font-weight: 700;
      text-align: right;
      font-family: "Amazon Ember", Arial, sans-serif;
    }
    .ws-tph-input:focus {
      outline: none;
      border-color: #ffb74d;
      background: #455a64;
    }
    .ws-tph-input::placeholder {
      color: #78909c;
    }

    .ws-refresh-btn {
      background: #ff9900;
      color: #232f3e;
      border: none;
      border-radius: 4px;
      padding: 3px 8px;
      font-size: 10px;
      font-weight: 700;
      cursor: pointer;
      margin-top: 5px;
      width: 100%;
      font-family: "Amazon Ember", Arial, sans-serif;
    }
    .ws-refresh-btn:hover {
      background: #ffb74d;
    }

    .ws-panel-divider {
      border-top: 1px solid #ff9900;
      margin: 4px 0;
    }

    .ws-minimize-btn {
      background: none;
      border: none;
      color: #aab7c4;
      cursor: pointer;
      font-size: 11px;
      padding: 0 3px;
      margin-left: auto;
    }
    .ws-minimize-btn:hover { color: #fff; }

    .ws-panel.minimized .ws-panel-body {
      display: none;
    }

    .ws-timestamp {
      font-size: 9px;
      color: #78909c;
      text-align: center;
      margin-top: 4px;
    }
  `);

  function getWarehouseFromURL() {
    const params = new URLSearchParams(window.location.search);
    return params.get('warehouse') || '?';
  }

  function getZonesFromURL() {
    const params = new URLSearchParams(window.location.search);
    const z = params.get('zones');
    return z ? z.split(',') : [];
  }

  function countStowers() {
    const warehouse = getWarehouseFromURL();
    const zones = getZonesFromURL();

    if (!zones.length) {
      return Promise.resolve({ stowers: 0, total: 0, stowUPH: 0 });
    }

    return new Promise((resolve) => {
      let stowerCount = 0;
      let totalCount = 0;
      let completed = 0;
      let stowUPH = 0;
      let stowMetricsDone = false;
      const now = new Date();
      const start = new Date(now.getTime() - 12 * 60 * 60 * 1000);
      const startISO = start.toISOString().replace(/\.\d+Z$/, '.000Z');
      const endISO = now.toISOString().replace(/\.\d+Z$/, '.000Z');

      const checkDone = () => {
        if (completed === zones.length && stowMetricsDone) {
          resolve({ stowers: stowerCount, total: totalCount, stowUPH });
        }
      };

      // Fetch associate data per zone
      zones.forEach((zone) => {
        const url = `/api/us-east-1/fulfillment`
          + `?dataset=station_map%2Fstations_with_associate_metrics`
          + `&startDateTime=${encodeURIComponent(startISO)}`
          + `&warehouse=${warehouse}`
          + `&zone=${zone}`;

        fetch(url, { credentials: 'include' })
          .then((r) => r.json())
          .then((data) => {
            if (Array.isArray(data)) {
              data.forEach((entry) => {
                if (entry.user_id) {
                  totalCount++;
                  if (entry.stow_work_minutes && entry.stow_work_minutes > 0) {
                    stowerCount++;
                  }
                }
              });
            }
          })
          .catch(() => {})
          .finally(() => { completed++; checkDone(); });
      });

      // Fetch stow UPH (use first zone — it's floor-level)
      const stowUrl = `/api/us-east-1/fulfillment`
        + `?dataset=stow_metrics%2Fstow_performance_metrics`
        + `&warehouse=${warehouse}`
        + `&zone=${zones[0]}`
        + `&startDateTime=${encodeURIComponent(startISO)}`
        + `&endDateTime=${encodeURIComponent(endISO)}`;

      fetch(stowUrl, { credentials: 'include' })
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data) && data.length > 0 && data[0].stow_rate) {
            stowUPH = data[0].stow_rate;
          }
        })
        .catch(() => {})
        .finally(() => { stowMetricsDone = true; checkDone(); });
    });
  }

  // --- FCLM ---
  function getShiftTimes() {
    const now = new Date();
    const hour = now.getHours();
    const fmt = (d) => d.getFullYear() + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + String(d.getDate()).padStart(2, '0');

    if (hour >= 6 && hour < 18) {
      const dateStr = fmt(now);
      return { date: dateStr, endDate: dateStr, startH: 6, startM: 0, endH: 18, endM: 0, shift: 'Day' };
    } else {
      const startDate = hour < 6 ? new Date(now.getTime() - 24 * 60 * 60 * 1000) : now;
      const endDate = hour >= 18 ? new Date(now.getTime() + 24 * 60 * 60 * 1000) : now;
      return { date: fmt(startDate), endDate: fmt(endDate), startH: 18, startM: 0, endH: 6, endM: 0, shift: 'Night' };
    }
  }

  function fetchFCLMData(warehouse) {
    // Read FCLM data saved by the scraper (when FCLM page is open)
    return new Promise((resolve) => {
      const saved = GM_getValue('ws_fclm_data', null);
      const s = getShiftTimes();
      console.log('[WS] FCLM cache read:', saved);
      if (saved) {
        try {
          const data = JSON.parse(saved);
          // Only use if less than 10 minutes old
          const age = Date.now() - (data.timestamp || 0);
          if (age < 10 * 60 * 1000) {
            console.log('[WS] Using cached FCLM data, age:', Math.round(age / 1000) + 's');
            resolve({ ...data, shift: s.shift });
            return;
          }
        } catch (e) {}
      }
      console.log('[WS] No fresh FCLM data — open FCLM in another tab');
      resolve({ stowRate: null, totalVolume: null, totalHours: null, shift: s.shift });
    });
  }

  // --- FCLM PAGE SCRAPER ---
  // When running on the FCLM page, scrape data and save it
  function runFCLMScraper() {
    function scrape() {
      const text = document.body.innerText || '';
      let stowRate = null;
      let totalVolume = null;
      let totalHours = null;
      let tisVolume = null;
      let tisHours = null;
      let tisRate = null;
      let ibLpRate = null;
      let tisLpRate = null;

      // Find the IB Total row in the table
      const rows = document.querySelectorAll('tr');
      rows.forEach((r) => {
        const rowText = r.innerText;
        if (rowText.length > 500) return;
        const cells = [...r.querySelectorAll('td')];
        const values = cells.map(c => c.innerText.trim());
        const nums = values.filter(v => /^[\d,.]+$/.test(v)).map(v => parseFloat(v.replace(/,/g, '')));

        if (/IB.{0,5}Total/i.test(rowText) && nums.length >= 3) {
          totalVolume = nums[0];
          totalHours = nums[1];
          stowRate = nums[2];
          // LP Rate is in cell 25
          const lpVal = cells[25]?.innerText.trim().replace(/,/g, '');
          if (lpVal && /^[\d.]+$/.test(lpVal)) ibLpRate = parseFloat(lpVal);
        }
        if (/Transfer\s*In\s*Support/i.test(rowText) && nums.length >= 3) {
          tisVolume = nums[0];
          tisHours = nums[1];
          tisRate = nums[2];
          // LP Rate is in cell 20 for support rows
          const lpVal = cells[20]?.innerText.trim().replace(/,/g, '');
          if (lpVal && /^[\d.]+$/.test(lpVal)) tisLpRate = parseFloat(lpVal);
        }
      });

      if (stowRate !== null) {
        const data = {
          stowRate: stowRate,
          totalVolume: totalVolume,
          totalHours: totalHours,
          tisVolume: tisVolume,
          tisHours: tisHours,
          tisRate: tisRate,
          ibLpRate: ibLpRate,
          tisLpRate: tisLpRate,
          timestamp: Date.now(),
        };
        GM_setValue('ws_fclm_data', JSON.stringify(data));
        console.log('[WS] FCLM data saved:', data);
        updateFCLMBadge(true, data);
      } else {
        updateFCLMBadge(false);
      }
    }

    function updateFCLMBadge(ok, data) {
      let badge = document.getElementById('ws-fclm-badge');
      if (!badge) {
        badge = document.createElement('div');
        badge.id = 'ws-fclm-badge';
        badge.style.cssText = 'position:fixed;top:8px;right:8px;z-index:99999;background:#232f3e;color:#fff;padding:6px 12px;border-radius:6px;font-family:"Amazon Ember",Arial,sans-serif;font-size:12px;border:2px solid #ff9900;box-shadow:0 2px 8px rgba(0,0,0,0.3);';
        document.body.appendChild(badge);
      }
      if (ok && data) {
        badge.innerHTML = '🕷️ <span style="color:#ff9900;font-weight:700">WS Sync</span> ✓ Rate: <span style="color:#81c784;font-weight:700">' + (data.stowRate || '—') + '</span> Vol: <span style="color:#4fc3f7;font-weight:700">' + (data.totalVolume?.toLocaleString() || '—') + '</span>';
      } else {
        badge.innerHTML = '🕷️ <span style="color:#ff9900">WS Sync</span> — waiting for data...';
      }
    }

    // Wait for FCLM page to render, then scrape
    let attempts = 0;
    const poller = setInterval(() => {
      attempts++;
      scrape();
      if (attempts >= 30) clearInterval(poller); // stop after 60s
    }, 2000);

    // Also re-scrape every 5 minutes
    setInterval(scrape, 5 * 60 * 1000);
  }

  function buildPanel() {
    if (document.querySelector('.ws-panel')) return;

    const savedTPH = GM_getValue('ws_tph_goal', '');
    const minimized = GM_getValue('ws_minimized', false);
    const savedLeft = GM_getValue('ws_pos_left', '');
    const savedTop = GM_getValue('ws_pos_top', '');

    const panel = document.createElement('div');
    panel.className = `ws-panel${minimized ? ' minimized' : ''}`;
    if (savedLeft && savedTop) {
      panel.style.left = savedLeft;
      panel.style.top = savedTop;
      panel.style.right = 'auto';
    }
    panel.innerHTML = `
      <div class="ws-panel-title">
        🕷️ Water Spiders
        <button class="ws-minimize-btn" title="Toggle">${minimized ? '▼' : '▲'}</button>
      </div>
      <div class="ws-panel-body">
        <div class="ws-panel-row">
          <span class="ws-panel-label">Active Stowers</span>
          <span class="ws-panel-value stowers" id="ws-stower-count">...</span>
        </div>
        <div class="ws-panel-row">
          <span class="ws-panel-label">WS Needed</span>
          <span class="ws-panel-value ws-needed" id="ws-needed-count">...</span>
        </div>
        <div class="ws-panel-row">
          <span class="ws-panel-label">Actual WS</span>
          <input type="number" class="ws-tph-input" id="ws-actual-count"
            placeholder="#" value="${GM_getValue('ws_actual_count', '')}">
        </div>
        <div class="ws-panel-row">
          <span class="ws-panel-label">TPH per WS</span>
          <span class="ws-panel-value tph-per-ws" id="ws-tph-per-ws" style="color:#ffab40">...</span>
        </div>
        <div class="ws-panel-row">
          <span class="ws-panel-label">WS Hours</span>
          <span class="ws-panel-value" id="ws-ws-hours" style="color:#78909c">...</span>
        </div>
        <div class="ws-panel-row">
          <span class="ws-panel-label">TPH w/o WS</span>
          <span class="ws-panel-value tph-clean" id="ws-tph-clean">...</span>
        </div>
        <div class="ws-panel-row">
          <span class="ws-panel-label">WS TPH Drag</span>
          <span class="ws-panel-value drag" id="ws-tph-drag">...</span>
        </div>
        <div class="ws-panel-divider"></div>
        <div class="ws-panel-row">
          <span class="ws-panel-label">Stow UPH</span>
          <span class="ws-panel-value uph" id="ws-uph">...</span>
        </div>
        <div class="ws-panel-divider"></div>
        <div class="ws-panel-row">
          <span class="ws-panel-label">FCLM Live TPH</span>
          <span class="ws-panel-value tph" id="ws-fclm-rate">...</span>
        </div>
        <div class="ws-panel-row">
          <span class="ws-panel-label">Shift Volume</span>
          <span class="ws-panel-value" id="ws-fclm-vol" style="color:#aab7c4">...</span>
        </div>
        <div class="ws-panel-row">
          <span class="ws-panel-label">Shift Hours</span>
          <span class="ws-panel-value" id="ws-fclm-hrs" style="color:#aab7c4">...</span>
        </div>
        <div class="ws-panel-row">
          <span class="ws-panel-label">Shift</span>
          <span class="ws-panel-value" id="ws-shift" style="color:#78909c;font-size:12px">...</span>
        </div>
        <div class="ws-panel-divider"></div>
        <div class="ws-panel-row">
          <span class="ws-panel-label" style="color:#ff9900;font-weight:600">TI Support</span>
          <span class="ws-panel-value" style="color:#78909c;font-size:10px">Hrs / Rate</span>
        </div>
        <div class="ws-panel-row">
          <span class="ws-panel-label">TIS Hours</span>
          <span class="ws-panel-value" id="ws-tis-hrs" style="color:#aab7c4">...</span>
        </div>
        <div class="ws-panel-row">
          <span class="ws-panel-label">TIS Rate</span>
          <span class="ws-panel-value" id="ws-tis-rate" style="color:#aab7c4">...</span>
        </div>
        <div class="ws-panel-row">
          <span class="ws-panel-label">TIS % of IB Hrs</span>
          <span class="ws-panel-value" id="ws-tis-pct" style="color:#ffab40">...</span>
        </div>
        <div class="ws-panel-divider"></div>
        <div class="ws-panel-row">
          <span class="ws-panel-label">TPH Goal</span>
          <input type="number" class="ws-tph-input" id="ws-tph-input"
            placeholder="Enter" value="${savedTPH}">
        </div>
        <div class="ws-panel-row">
          <span class="ws-panel-label">Ratio</span>
          <span class="ws-panel-value" style="color:#78909c;font-size:11px">1 WS : ${WS_RATIO} stowers</span>
        </div>
        <button class="ws-refresh-btn" id="ws-refresh">↻ Refresh</button>
        <div class="ws-timestamp" id="ws-timestamp"></div>
      </div>
    `;

    document.body.appendChild(panel);

    // Minimize toggle
    panel.querySelector('.ws-minimize-btn').addEventListener('click', () => {
      panel.classList.toggle('minimized');
      const isMin = panel.classList.contains('minimized');
      panel.querySelector('.ws-minimize-btn').textContent = isMin ? '▼' : '▲';
      GM_setValue('ws_minimized', isMin);
    });

    // Drag to move
    const titleBar = panel.querySelector('.ws-panel-title');
    let isDragging = false, offsetX = 0, offsetY = 0;

    titleBar.addEventListener('mousedown', (e) => {
      if (e.target.classList.contains('ws-minimize-btn')) return;
      isDragging = true;
      offsetX = e.clientX - panel.getBoundingClientRect().left;
      offsetY = e.clientY - panel.getBoundingClientRect().top;
      panel.style.right = 'auto';
      e.preventDefault();
      e.stopPropagation();
    }, true);

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      e.preventDefault();
      e.stopPropagation();
      panel.style.left = Math.max(0, e.clientX - offsetX) + 'px';
      panel.style.top = Math.max(0, e.clientY - offsetY) + 'px';
    }, true);

    window.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        GM_setValue('ws_pos_left', panel.style.left);
        GM_setValue('ws_pos_top', panel.style.top);
      }
    }, true);

    // TPH save on change
    document.getElementById('ws-tph-input').addEventListener('change', (e) => {
      GM_setValue('ws_tph_goal', e.target.value);
    });

    // Actual WS count save + recalc
    document.getElementById('ws-actual-count').addEventListener('change', (e) => {
      GM_setValue('ws_actual_count', e.target.value);
      updateTPHPerWS();
    });

    // Refresh button
    document.getElementById('ws-refresh').addEventListener('click', refreshData);

    // Initial load
    refreshData();
  }

  function getHoursIntoShift() {
    const now = new Date();
    const hour = now.getHours();
    const mins = now.getMinutes();
    const currentMins = hour * 60 + mins;

    if (hour >= 6 && hour < 18) {
      // Day shift started at 06:00
      return (currentMins - 360) / 60;
    } else {
      // Night shift started at 18:00
      if (hour >= 18) {
        return (currentMins - 1080) / 60;
      } else {
        // After midnight, shift started at 18:00 yesterday
        return (currentMins + 360) / 60;
      }
    }
  }

  function updateTPHPerWS() {
    const tphWsEl = document.getElementById('ws-tph-per-ws');
    const wsHoursEl = document.getElementById('ws-ws-hours');
    const tphCleanEl = document.getElementById('ws-tph-clean');
    const tphDragEl = document.getElementById('ws-tph-drag');

    const actualWS = parseInt(document.getElementById('ws-actual-count')?.value, 10);
    const fclmRateText = document.getElementById('ws-fclm-rate')?.textContent;
    const fclmVolText = document.getElementById('ws-fclm-vol')?.textContent;
    const fclmHrsText = document.getElementById('ws-fclm-hrs')?.textContent;

    const liveTPH = parseFloat(fclmRateText);
    const volume = parseFloat((fclmVolText || '').replace(/,/g, ''));
    const totalHours = parseFloat(fclmHrsText);

    // TPH per WS
    if (actualWS > 0 && liveTPH > 0) {
      tphWsEl.textContent = (liveTPH / actualWS).toFixed(1);
    } else {
      tphWsEl.textContent = '—';
    }

    // WS TPH Drag calculation
    if (actualWS > 0 && volume > 0 && totalHours > 0) {
      const hoursIntoShift = getHoursIntoShift();
      const wsHours = actualWS * hoursIntoShift;
      const cleanHours = totalHours - wsHours;

      wsHoursEl.textContent = wsHours.toFixed(1);

      if (cleanHours > 0) {
        const tphWithoutWS = volume / cleanHours;
        const drag = liveTPH - tphWithoutWS;

        tphCleanEl.textContent = tphWithoutWS.toFixed(1);
        tphDragEl.textContent = drag.toFixed(1);
      } else {
        tphCleanEl.textContent = '—';
        tphDragEl.textContent = '—';
      }
    } else {
      wsHoursEl.textContent = '—';
      tphCleanEl.textContent = '—';
      tphDragEl.textContent = '—';
    }
  }

  async function refreshData() {
    const stowerEl = document.getElementById('ws-stower-count');
    const neededEl = document.getElementById('ws-needed-count');
    const uphEl = document.getElementById('ws-uph');
    const fclmRateEl = document.getElementById('ws-fclm-rate');
    const fclmVolEl = document.getElementById('ws-fclm-vol');
    const fclmHrsEl = document.getElementById('ws-fclm-hrs');
    const shiftEl = document.getElementById('ws-shift');
    const tsEl = document.getElementById('ws-timestamp');

    stowerEl.textContent = '...';
    neededEl.textContent = '...';
    uphEl.textContent = '...';
    fclmRateEl.textContent = '...';
    fclmVolEl.textContent = '...';
    fclmHrsEl.textContent = '...';

    const warehouse = getWarehouseFromURL();

    const [vantageResult, fclmResult] = await Promise.allSettled([
      countStowers(),
      fetchFCLMData(warehouse),
    ]);

    // Vantage data
    const { stowers, stowUPH } = vantageResult.status === 'fulfilled'
      ? vantageResult.value : { stowers: 0, stowUPH: 0 };
    const wsNeeded = Math.ceil(stowers / WS_RATIO);

    stowerEl.textContent = stowers;
    neededEl.textContent = wsNeeded;
    uphEl.textContent = stowUPH ? stowUPH.toFixed(1) : '—';

    // FCLM data
    const fclm = fclmResult.status === 'fulfilled' ? fclmResult.value : {};

    fclmRateEl.textContent = fclm.stowRate ? fclm.stowRate.toFixed(1) : '—';
    if (fclm.stowRate && fclm.ibLpRate) {
      fclmRateEl.style.color = fclm.stowRate < fclm.ibLpRate ? '#ff5252' : '#81c784';
      fclmRateEl.title = 'LP Rate: ' + fclm.ibLpRate.toFixed(1);
    }
    fclmVolEl.textContent = fclm.totalVolume ? fclm.totalVolume.toLocaleString() : '—';
    fclmHrsEl.textContent = fclm.totalHours ? fclm.totalHours.toFixed(1) : '—';
    shiftEl.textContent = fclm.shift || '—';

    // Transfer In Support
    const tisHrsEl = document.getElementById('ws-tis-hrs');
    const tisRateEl = document.getElementById('ws-tis-rate');
    const tisPctEl = document.getElementById('ws-tis-pct');

    tisHrsEl.textContent = fclm.tisHours ? fclm.tisHours.toFixed(1) : '—';
    tisRateEl.textContent = fclm.tisRate ? fclm.tisRate.toFixed(1) : '—';
    if (fclm.tisRate && fclm.tisLpRate) {
      tisRateEl.style.color = fclm.tisRate < fclm.tisLpRate ? '#ff5252' : '#81c784';
      tisRateEl.title = 'LP Rate: ' + fclm.tisLpRate.toFixed(1);
    }

    if (fclm.tisHours && fclm.totalHours && fclm.totalHours > 0) {
      const pct = (fclm.tisHours / fclm.totalHours * 100);
      tisPctEl.textContent = pct.toFixed(1) + '%';
      tisPctEl.style.color = pct > 10 ? '#ff5252' : pct > 7 ? '#ffab40' : '#69f0ae';
    } else {
      tisPctEl.textContent = '—';
    }

    updateTPHPerWS();
    tsEl.textContent = `Updated ${new Date().toLocaleTimeString()}`;
  }

  // Wait for page to load, then inject
  function init() {
    let polls = 0;
    const poller = setInterval(() => {
      polls++;
      if (document.querySelector('#vantage-app') || polls >= 10) {
        clearInterval(poller);
        buildPanel();

        // Auto-refresh every 5 minutes
        setInterval(refreshData, 5 * 60 * 1000);
      }
    }, 2000);
  }

  // --- INIT ---
  // Detect which page we're on
  if (window.location.hostname === 'fclm-portal.amazon.com') {
    // Running on FCLM — scrape and save data
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', runFCLMScraper);
    } else {
      runFCLMScraper();
    }
  } else {
    // Running on Vantage — show the panel
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }
})();
