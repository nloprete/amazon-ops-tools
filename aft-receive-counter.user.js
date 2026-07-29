// ==UserScript==
// @name         AFT - Daily Receive Counter (3AM to 3AM)
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Shows VRIDs, dates, and quantities received for the current day (3AM to 3AM). Hides closed trailers.
// @updateURL    https://raw.githubusercontent.com/nloprete/amazon-ops-tools/main/aft-receive-counter.user.js
// @downloadURL  https://raw.githubusercontent.com/nloprete/amazon-ops-tools/main/aft-receive-counter.user.js
// @match        https://afttransshipmenthub-na.aka.amazon.com/*/view-transfers/inbound*
// @connect      maple-syrup.corp.amazon.com
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function () {
  'use strict';

  GM_addStyle(`
    .aft-panel {
      position: fixed;
      top: 60px;
      right: 12px;
      z-index: 99999;
      background: #232f3e;
      color: #fff;
      border-radius: 8px;
      padding: 10px 14px;
      font-family: "Amazon Ember", Arial, sans-serif;
      box-shadow: 0 4px 16px rgba(0,0,0,0.3);
      width: 820px;
      max-height: 80vh;
      border: 2px solid #ff9900;
      display: flex;
      flex-direction: column;
      resize: both;
      overflow: hidden;
      min-width: 700px;
      min-height: 150px;
    }
    .aft-title {
      color: #ff9900;
      font-weight: 700;
      font-size: 13px;
      margin-bottom: 6px;
      display: flex;
      align-items: center;
      gap: 6px;
      cursor: grab;
      user-select: none;
    }
    .aft-title:active { cursor: grabbing; }
    .aft-min-btn {
      background: none; border: none; color: #aab7c4;
      cursor: pointer; font-size: 11px; padding: 0 3px; margin-left: auto;
    }
    .aft-min-btn:hover { color: #fff; }
    .aft-panel.minimized .aft-body { display: none; }
    .aft-body {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }
    .aft-summary {
      display: flex;
      justify-content: space-between;
      padding: 6px 0;
      border-bottom: 1px solid #ff9900;
      margin-bottom: 6px;
    }
    .aft-stat { text-align: center; }
    .aft-stat .val { font-size: 18px; font-weight: 700; color: #ff9900; }
    .aft-stat .lbl { font-size: 9px; color: #aab7c4; }
    .aft-results {
      overflow-y: auto;
      flex: 1;
      min-height: 0;
      font-size: 11px;
    }
    .aft-results table { width: 100%; border-collapse: collapse; }
    .aft-results th {
      background: #3a4553;
      color: #ff9900;
      padding: 3px 5px;
      text-align: left;
      font-size: 10px;
      position: sticky;
      top: 0;
    }
    .aft-results td { padding: 2px 5px; border-bottom: 1px solid #3a4553; }
    .aft-results tr:hover td { background: #3a4553; }
    .aft-vrid { color: #4fc3f7; font-weight: 600; }
    .aft-qty { color: #69f0ae; font-weight: 700; }
    .aft-date { color: #aab7c4; font-size: 10px; }
    .aft-status-received { color: #69f0ae; }
    .aft-status-inbound { color: #ffd740; }
    .aft-refresh {
      background: #ff9900;
      color: #232f3e;
      border: none;
      border-radius: 4px;
      padding: 4px 8px;
      font-size: 10px;
      font-weight: 700;
      cursor: pointer;
      margin-top: 6px;
      width: 100%;
    }
    .aft-refresh:hover { background: #ffb74d; }
    .aft-time-range { font-size: 9px; color: #78909c; text-align: center; margin-top: 4px; }
    .aft-inputs {
      display: flex;
      gap: 4px;
      align-items: center;
      margin-bottom: 6px;
      flex-direction: column;
    }
    .aft-inputs label { font-size: 9px; color: #aab7c4; align-self: flex-start; }
    .aft-input {
      background: #3a4553;
      border: 1px solid #556;
      color: #fff;
      border-radius: 3px;
      padding: 3px 6px;
      font-size: 11px;
      font-family: "Amazon Ember", Arial, sans-serif;
      width: 100%;
    }
    .aft-input:focus { outline: none; border-color: #ff9900; }
  `);

  function getShiftWindow() {
    const startInput = document.getElementById('aft-start');
    const endInput = document.getElementById('aft-end');
    if (startInput && endInput && startInput.value && endInput.value) {
      return { start: new Date(startInput.value), end: new Date(endInput.value) };
    }
    // Default: 3AM to 3AM
    const now = new Date();
    const hour = now.getHours();
    let start;
    if (hour >= 3) {
      start = new Date(now);
      start.setHours(3, 0, 0, 0);
    } else {
      start = new Date(now);
      start.setDate(start.getDate() - 1);
      start.setHours(3, 0, 0, 0);
    }
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end };
  }

  function getDefaultTimes() {
    const now = new Date();
    const hour = now.getHours();
    let start;
    if (hour >= 3) {
      start = new Date(now);
      start.setHours(3, 0, 0, 0);
    } else {
      start = new Date(now);
      start.setDate(start.getDate() - 1);
      start.setHours(3, 0, 0, 0);
    }
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    // Format for datetime-local input
    const fmt = d => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0') + 'T' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
    return { startStr: fmt(start), endStr: fmt(end) };
  }

  function parseDateTime(str) {
    if (!str || str.trim() === '') return null;
    const cleaned = str.trim().replace(/\s+(EDT|EST|CDT|CST|PDT|PST|ET|CT|PT)$/i, '');
    const d = new Date(cleaned);
    return isNaN(d.getTime()) ? null : d;
  }

  function scanTable() {
    const { start, end } = getShiftWindow();
    const table = document.querySelector('table');
    if (!table) return { loads: [], totalQty: 0, totalLoads: 0 };

    // Find columns by header name
    const headers = [...table.querySelectorAll('thead th, thead td')];
    let receivedCol = -1;
    let loadIdCol = -1;
    let qtyCol = -1;
    let statusCol = -1;
    headers.forEach((h, i) => {
      const text = h.textContent.trim().toLowerCase();
      if (text.includes('received time')) receivedCol = i;
      if (text.includes('load id')) loadIdCol = i;
      if (text.includes('total quantity')) qtyCol = i;
      if (text === 'status') statusCol = i;
    });

    // If received time not found in headers, use last column
    if (receivedCol === -1) {
      const firstRow = table.querySelector('tbody tr');
      if (firstRow) {
        const cells = firstRow.querySelectorAll('td');
        receivedCol = cells.length - 1;
      }
    }

    // Fallbacks if not found
    if (loadIdCol === -1) loadIdCol = 3;
    if (qtyCol === -1) qtyCol = 9;
    if (statusCol === -1) statusCol = 11;

    const rows = table.querySelectorAll('tbody tr');
    const loads = [];
    let totalQty = 0;

    rows.forEach(row => {
      const cells = [...row.querySelectorAll('td')];
      if (cells.length < 10) return;

      // Get status (no longer filtering out CLOSED)
      const status = (cells[statusCol]?.textContent || '').trim().toUpperCase();

      // Use Received Time column, fall back to YMS/Dock
      let timeForFilter = null;
      if (receivedCol >= 0) {
        timeForFilter = parseDateTime(cells[receivedCol]?.textContent);
      }
      if (!timeForFilter) {
        timeForFilter = parseDateTime(cells[2]?.textContent) || parseDateTime(cells[1]?.textContent);
      }

      if (!timeForFilter) return;
      if (timeForFilter < start || timeForFilter >= end) return;

      const loadId = cells[loadIdCol]?.textContent.trim();
      const qty = parseInt((cells[qtyCol]?.textContent || '').trim().replace(/,/g, ''), 10) || 0;

      totalQty += qty;
      loads.push({ loadId, arrivalTime: timeForFilter, qty, status });
    });

    loads.sort((a, b) => b.arrivalTime - a.arrivalTime);
    return { loads, totalQty, totalLoads: loads.length };
  }

  function getStatusClass(status) {
    const s = (status || '').toUpperCase();
    if (s.includes('RECEIVED')) return 'aft-status-received';
    return 'aft-status-inbound';
  }

  function buildPanel() {
    if (document.querySelector('.aft-panel')) return;
    const defaults = getDefaultTimes();
    const panel = document.createElement('div');
    panel.className = 'aft-panel';
    panel.innerHTML = '<div class="aft-title">📦 Daily Receive<button class="aft-min-btn">▲</button></div><div class="aft-body"><div class="aft-inputs"><label>From:</label><input type="datetime-local" class="aft-input" id="aft-start" value="' + defaults.startStr + '"><label>To:</label><input type="datetime-local" class="aft-input" id="aft-end" value="' + defaults.endStr + '"></div><div class="aft-summary"><div class="aft-stat"><div class="val" id="aft-total">...</div><div class="lbl">TOTAL QTY</div></div><div class="aft-stat"><div class="val" id="aft-loads" style="color:#4fc3f7">...</div><div class="lbl">LOADS</div></div><div class="aft-stat"><div class="val" id="aft-missing-count" style="color:#ff5252">...</div><div class="lbl">MISSING</div></div></div><div style="display:flex;gap:24px;flex:1;min-height:0;overflow:hidden;"><div id="aft-hourly-section" style="flex:1;overflow-y:auto;min-width:0;"></div><div id="aft-period-section" style="flex:0.7;overflow-y:auto;min-width:0;"></div><div id="aft-results" style="flex:1;overflow-y:auto;min-width:0;"></div><div id="aft-missing-section" style="flex:1;overflow-y:auto;min-width:0;"></div></div><button class="aft-refresh" id="aft-refresh">↻ Refresh</button><div class="aft-time-range" id="aft-range"></div></div>';
    document.body.appendChild(panel);

    panel.querySelector('.aft-min-btn').addEventListener('click', () => {
      panel.classList.toggle('minimized');
      panel.querySelector('.aft-min-btn').textContent = panel.classList.contains('minimized') ? '▼' : '▲';
    });

    const titleBar = panel.querySelector('.aft-title');
    let isDragging = false, offsetX = 0, offsetY = 0;
    titleBar.addEventListener('mousedown', (e) => {
      if (e.target.classList.contains('aft-min-btn')) return;
      isDragging = true;
      offsetX = e.clientX - panel.getBoundingClientRect().left;
      offsetY = e.clientY - panel.getBoundingClientRect().top;
      e.preventDefault(); e.stopPropagation();
    }, true);
    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      e.preventDefault(); e.stopPropagation();
      panel.style.left = Math.max(0, e.clientX - offsetX) + 'px';
      panel.style.top = Math.max(0, e.clientY - offsetY) + 'px';
      panel.style.right = 'auto';
    }, true);
    window.addEventListener('mouseup', () => { isDragging = false; }, true);

    document.getElementById('aft-refresh').addEventListener('click', refresh);
    document.getElementById('aft-start').addEventListener('change', refresh);
    document.getElementById('aft-end').addEventListener('change', refresh);
    refresh();
  }

  function refresh() {
    const { loads, totalQty, totalLoads } = scanTable();
    const { start, end } = getShiftWindow();

    document.getElementById('aft-total').textContent = totalQty.toLocaleString();
    document.getElementById('aft-loads').textContent = totalLoads;

    let rows = '';
    loads.forEach(l => {
      const timeStr = l.arrivalTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const dateStr = l.arrivalTime.toLocaleDateString([], { month: 'short', day: 'numeric' });
      rows += '<tr><td class="aft-vrid">' + l.loadId + '</td><td class="aft-date">' + dateStr + ' ' + timeStr + '</td><td class="aft-qty">' + l.qty.toLocaleString() + '</td></tr>';
    });

    document.getElementById('aft-results').innerHTML = loads.length > 0
      ? '<table><thead><tr><th>VRID</th><th>Received</th><th>Qty</th></tr></thead><tbody>' + rows + '</tbody></table>'
      : '<div style="color:#78909c;padding:8px;text-align:center">No loads found in window</div>';

    // Hourly breakdown — left column
    const hourlySection = document.getElementById('aft-hourly-section');

    const hourlyMap = {};
    loads.forEach(l => {
      const hr = l.arrivalTime.getHours();
      const label = String(hr).padStart(2, '0') + ':00';
      if (!hourlyMap[label]) hourlyMap[label] = { qty: 0, count: 0 };
      hourlyMap[label].qty += l.qty;
      hourlyMap[label].count++;
    });

    const hourlyKeys = Object.keys(hourlyMap).sort();
    const maxHourQty = Math.max(...hourlyKeys.map(k => hourlyMap[k].qty), 1);

    // Also track which loads are in each hour for click-to-expand
    const hourlyLoads = {};
    loads.forEach(l => {
      const hr = l.arrivalTime.getHours();
      const label = String(hr).padStart(2, '0') + ':00';
      if (!hourlyLoads[label]) hourlyLoads[label] = [];
      hourlyLoads[label].push(l);
    });

    if (hourlyKeys.length > 0) {
      let hourlyHtml = '<div style="margin-top:8px;padding-top:8px;border-top:2px solid #ff9900;">';
      hourlyHtml += '<div style="color:#ff9900;font-weight:700;font-size:13px;margin-bottom:8px;">📊 Hourly Breakdown</div>';
      hourlyKeys.forEach(k => {
        const h = hourlyMap[k];
        const pct = Math.round((h.qty / maxHourQty) * 100);
        hourlyHtml += `<div style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:12px;">
          <span style="width:45px;color:#aab7c4;font-weight:600;">${k}</span>
          <div style="flex:1;background:#3a4553;border-radius:4px;height:18px;overflow:hidden;">
            <div style="width:${pct}%;height:100%;background:#ff9900;border-radius:4px;transition:width 0.3s;"></div>
          </div>
          <span class="aft-hourly-qty" data-hour="${k}" style="width:65px;text-align:right;color:#69f0ae;font-weight:700;font-size:13px;cursor:pointer;text-decoration:underline;">${h.qty.toLocaleString()}</span>
          <span style="width:30px;text-align:right;color:#78909c;font-size:10px;">(${h.count})</span>
        </div>
        <div class="aft-hourly-detail" data-hour="${k}" style="display:none;margin-left:53px;margin-bottom:4px;padding:4px 8px;background:#2a3544;border-radius:4px;font-size:10px;"></div>`;
      });
      hourlyHtml += '</div>';
      hourlySection.innerHTML = hourlyHtml;

      // Attach click handlers to qty elements
      hourlySection.querySelectorAll('.aft-hourly-qty').forEach(el => {
        el.addEventListener('click', () => {
          const hour = el.dataset.hour;
          const detailEl = hourlySection.querySelector(`.aft-hourly-detail[data-hour="${hour}"]`);
          if (!detailEl) return;
          if (detailEl.style.display === 'none') {
            const hLoads = hourlyLoads[hour] || [];
            detailEl.innerHTML = hLoads.map(l => {
              const time = l.arrivalTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              return `<div style="display:flex;justify-content:space-between;padding:1px 0;"><span style="color:#4fc3f7;">${l.loadId}</span><span style="color:#aab7c4;">${time}</span><span style="color:#69f0ae;">${l.qty.toLocaleString()}</span></div>`;
            }).join('');
            detailEl.style.display = 'block';
          } else {
            detailEl.style.display = 'none';
          }
        });
      });
    } else {
      hourlySection.innerHTML = '';
    }

    // Period breakdown — show BOTH day and night shifts
    const periodSection = document.getElementById('aft-period-section');
    if (periodSection) {
      const dayPeriods = [
        { label: 'P1', start: 7, end: 11 },
        { label: 'P2', start: 11, end: 14 },
        { label: 'P3', start: 14, end: 17.5 }
      ];
      const nightPeriods = [
        { label: 'P1', start: 18, end: 22 },
        { label: 'P2', start: 22, end: 26 },
        { label: 'P3', start: 26, end: 28.5 }
      ];

      function calcPeriodData(periods, isNight) {
        return periods.map(p => {
          let qty = 0;
          let count = 0;
          const periodLoads = [];
          loads.forEach(l => {
            let hr = l.arrivalTime.getHours() + l.arrivalTime.getMinutes() / 60;
            if (isNight && hr < 12) hr += 24;
            if (hr >= p.start && hr < p.end) {
              qty += l.qty;
              count++;
              periodLoads.push(l);
            }
          });
          return { ...p, qty, count, loads: periodLoads };
        });
      }

      const dayData = calcPeriodData(dayPeriods, false);
      const nightData = calcPeriodData(nightPeriods, true);
      const allData = [...dayData, ...nightData];
      const maxPeriodQty = Math.max(...allData.map(p => p.qty), 1);

      const timeLabel = (h) => {
        const actual = h >= 24 ? h - 24 : h;
        const hr = Math.floor(actual);
        const min = Math.round((actual - hr) * 60);
        return String(hr).padStart(2, '0') + ':' + String(min).padStart(2, '0');
      };

      let periodHtml = '<div style="margin-top:8px;padding-top:8px;border-top:2px solid #4fc3f7;">';

      // Day shift
      periodHtml += '<div style="color:#ff9900;font-weight:700;font-size:11px;margin-bottom:4px;">☀️ Day (07:00–17:30)</div>';
      let dayTotal = 0;
      dayData.forEach((p, idx) => {
        dayTotal += p.qty;
        const pct = Math.round((p.qty / maxPeriodQty) * 100);
        periodHtml += `<div style="display:flex;align-items:center;gap:6px;padding:3px 0;font-size:12px;">
          <span style="width:25px;color:#ff9900;font-weight:700;">${p.label}</span>
          <div style="flex:1;background:#3a4553;border-radius:4px;height:14px;overflow:hidden;">
            <div style="width:${pct}%;height:100%;background:#ff9900;border-radius:4px;"></div>
          </div>
          <span class="aft-period-qty" data-period="day-${idx}" style="width:60px;text-align:right;color:#69f0ae;font-weight:700;font-size:12px;cursor:pointer;text-decoration:underline;">${p.qty.toLocaleString()}</span>
          <span style="width:22px;text-align:right;color:#78909c;font-size:9px;">(${p.count})</span>
        </div>
        <div class="aft-period-detail" data-period="day-${idx}" style="display:none;margin-left:31px;margin-bottom:4px;padding:4px 8px;background:#2a3544;border-radius:4px;font-size:10px;max-height:100px;overflow-y:auto;"></div>`;
      });
      periodHtml += `<div style="display:flex;justify-content:space-between;padding:4px 0;margin-top:2px;border-top:1px solid #3a4553;"><span style="color:#ff9900;font-weight:700;font-size:11px;">Day Total</span><span style="color:#69f0ae;font-weight:700;font-size:12px;">${dayTotal.toLocaleString()}</span></div>`;

      // Night shift
      periodHtml += '<div style="color:#4fc3f7;font-weight:700;font-size:11px;margin-top:8px;margin-bottom:4px;">🌙 Night (18:00–04:30)</div>';
      let nightTotal = 0;
      nightData.forEach((p, idx) => {
        nightTotal += p.qty;
        const pct = Math.round((p.qty / maxPeriodQty) * 100);
        periodHtml += `<div style="display:flex;align-items:center;gap:6px;padding:3px 0;font-size:12px;">
          <span style="width:25px;color:#4fc3f7;font-weight:700;">${p.label}</span>
          <div style="flex:1;background:#3a4553;border-radius:4px;height:14px;overflow:hidden;">
            <div style="width:${pct}%;height:100%;background:#4fc3f7;border-radius:4px;"></div>
          </div>
          <span class="aft-period-qty" data-period="night-${idx}" style="width:60px;text-align:right;color:#69f0ae;font-weight:700;font-size:12px;cursor:pointer;text-decoration:underline;">${p.qty.toLocaleString()}</span>
          <span style="width:22px;text-align:right;color:#78909c;font-size:9px;">(${p.count})</span>
        </div>
        <div class="aft-period-detail" data-period="night-${idx}" style="display:none;margin-left:31px;margin-bottom:4px;padding:4px 8px;background:#2a3544;border-radius:4px;font-size:10px;max-height:100px;overflow-y:auto;"></div>`;
      });
      periodHtml += `<div style="display:flex;justify-content:space-between;padding:4px 0;margin-top:2px;border-top:1px solid #3a4553;"><span style="color:#4fc3f7;font-weight:700;font-size:11px;">Night Total</span><span style="color:#69f0ae;font-weight:700;font-size:12px;">${nightTotal.toLocaleString()}</span></div>`;

      // Combined total
      const grandTotal = dayTotal + nightTotal;
      periodHtml += `<div style="display:flex;justify-content:space-between;padding:6px 0;margin-top:6px;border-top:2px solid #69f0ae;"><span style="color:#69f0ae;font-weight:900;font-size:12px;">Combined Total</span><span style="color:#69f0ae;font-weight:900;font-size:14px;">${grandTotal.toLocaleString()}</span></div>`;

      periodHtml += '</div>';
      periodSection.innerHTML = periodHtml;

      // Attach click handlers for period qty
      const allPeriodData = { ...Object.fromEntries(dayData.map((p, i) => [`day-${i}`, p])), ...Object.fromEntries(nightData.map((p, i) => [`night-${i}`, p])) };
      periodSection.querySelectorAll('.aft-period-qty').forEach(el => {
        el.addEventListener('click', () => {
          const key = el.dataset.period;
          const detailEl = periodSection.querySelector(`.aft-period-detail[data-period="${key}"]`);
          if (!detailEl) return;
          if (detailEl.style.display === 'none') {
            const pLoads = allPeriodData[key]?.loads || [];
            detailEl.innerHTML = pLoads.map(l => {
              const time = l.arrivalTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              return `<div style="display:flex;justify-content:space-between;padding:1px 0;"><span style="color:#4fc3f7;">${l.loadId}</span><span style="color:#aab7c4;">${time}</span><span style="color:#69f0ae;">${l.qty.toLocaleString()}</span></div>`;
            }).join('') || '<div style="color:#78909c;">No loads</div>';
            detailEl.style.display = 'block';
          } else {
            detailEl.style.display = 'none';
          }
        });
      });
    }

    const fmt = d => d.toLocaleDateString() + ' 3:00 AM';
    document.getElementById('aft-range').textContent = fmt(start) + ' → ' + fmt(end);

    // Fetch KIPS to find missing trailers
    checkMissingTrailers(loads);
  }

  // --- KIPS cross-reference ---
  function fetchKIPS() {
    return new Promise((resolve) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: 'https://maple-syrup.corp.amazon.com/RIC4/kips/thermometer',
        withCredentials: true,
        onload: (resp) => {
          const html = resp.responseText || '';
          const trailers = [];
          const parser = new DOMParser();
          const doc = parser.parseFromString(html, 'text/html');
          const rows = doc.querySelectorAll('tr');
          rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length < 4) return;
            const sourceFC = cells[0]?.textContent.trim();
            const trailerId = cells[1]?.textContent.trim().replace(/[^\w]/g, '');
            // Received time is typically column 3 (index 3)
            let receivedTime = null;
            const timeText = cells[3]?.textContent.trim();
            if (timeText) {
              const d = new Date(timeText);
              if (!isNaN(d.getTime())) receivedTime = d;
            }
            if (sourceFC && /^[A-Z]{2,4}\d{0,2}$/.test(sourceFC) && trailerId) {
              trailers.push({ trailerId, sourceFC, source: 'KIPS', receivedTime });
            }
          });
          resolve(trailers);
        },
        onerror: () => resolve([]),
      });
    });
  }

  async function checkMissingTrailers(aftLoads) {
    const missingSection = document.getElementById('aft-missing-section');
    const missingCountEl = document.getElementById('aft-missing-count');
    if (!missingSection) return;

    missingSection.innerHTML = '<div style="color:#78909c;padding:8px;text-align:center;">⏳ Checking KIPS...</div>';

    // Get AFT load IDs from the current table
    const aftIds = new Set(aftLoads.map(l => l.loadId.toUpperCase().replace(/[^A-Z0-9]/g, '')));

    // Fetch KIPS and filter by the current date/time range
    const { start, end } = getShiftWindow();
    const kipsTrailers = await fetchKIPS();
    const kipsInRange = kipsTrailers.filter(t => {
      if (!t.receivedTime) return false;
      return t.receivedTime >= start && t.receivedTime < end;
    });

    // Find trailers on KIPS (in range) but NOT in AFT
    // KIPS may append source FC or "AFT" to the ID, so we try multiple match strategies
    const missing = kipsInRange.filter(t => {
      const kipsId = t.trailerId.toUpperCase().replace(/[^A-Z0-9]/g, '');
      // Direct match
      if (aftIds.has(kipsId)) return false;
      // Try stripping common suffixes (AFT, source FC codes)
      const stripped = kipsId.replace(/(AFT|RIC4|RIC7|XJF1|XMD3|AVP0|AVP1|HGR5|MQJ1|ORF2|ORF7|MDT4|ABE8)$/i, '');
      if (aftIds.has(stripped)) return false;
      // Try matching if AFT ID is contained within KIPS ID
      for (const aftId of aftIds) {
        if (kipsId.includes(aftId) || aftId.includes(kipsId)) return false;
      }
      return true;
    });

    // Sort by received time (most recent first)
    missing.sort((a, b) => {
      if (!a.receivedTime && !b.receivedTime) return 0;
      if (!a.receivedTime) return 1;
      if (!b.receivedTime) return -1;
      return b.receivedTime - a.receivedTime;
    });

    // Update the missing count
    if (missingCountEl) missingCountEl.textContent = missing.length;

    // Render missing trailers
    if (missing.length > 0) {
      let html = '<div style="color:#ff5252;font-weight:700;font-size:13px;margin-bottom:8px;border-bottom:2px solid #ff5252;padding-bottom:6px;">⚠️ On KIPS, not in AFT (' + missing.length + ')</div>';
      html += '<table style="width:100%;border-collapse:collapse;"><thead><tr><th style="background:#3a4553;color:#ff5252;padding:3px 5px;text-align:left;font-size:10px;">VRID</th><th style="background:#3a4553;color:#ff5252;padding:3px 5px;text-align:left;font-size:10px;">Source</th><th style="background:#3a4553;color:#ff5252;padding:3px 5px;text-align:left;font-size:10px;">Received</th></tr></thead><tbody>';
      missing.forEach(t => {
        const timeStr = t.receivedTime ? t.receivedTime.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
        html += `<tr><td style="padding:2px 5px;border-bottom:1px solid #3a4553;color:#ff9900;font-weight:600;">${t.trailerId}</td><td style="padding:2px 5px;border-bottom:1px solid #3a4553;color:#aab7c4;">${t.sourceFC || '—'}</td><td style="padding:2px 5px;border-bottom:1px solid #3a4553;color:#aab7c4;font-size:10px;">${timeStr}</td></tr>`;
      });
      html += '</tbody></table>';
      missingSection.innerHTML = html;
    } else {
      missingSection.innerHTML = '<div style="color:#69f0ae;padding:8px;text-align:center;font-weight:700;">✓ All KIPS trailers accounted for</div>';
    }
  }

  function init() {
    let polls = 0;
    const poller = setInterval(() => {
      polls++;
      const rows = document.querySelectorAll('table tbody tr');
      if ((rows && rows.length > 0) || polls >= 20) {
        clearInterval(poller);

        // Try to show all entries by changing the page size dropdown
        const showEntries = document.querySelector('select[name*="length"], .dataTables_length select');
        if (showEntries) {
          // Look for an "All" option or set to max
          const allOption = [...showEntries.options].find(o => o.value === '-1' || o.textContent.trim().toLowerCase() === 'all');
          if (allOption) {
            showEntries.value = allOption.value;
          } else {
            // Set to highest available
            const maxOpt = [...showEntries.options].reduce((max, o) => parseInt(o.value) > parseInt(max.value) ? o : max);
            showEntries.value = maxOpt.value;
          }
          showEntries.dispatchEvent(new Event('change', { bubbles: true }));

          // Also click "Received Time" header to sort by it
          setTimeout(() => {
            const headers = document.querySelectorAll('table thead th');
            headers.forEach(h => {
              if (h.textContent.trim().toLowerCase().includes('received time')) {
                h.click(); // Sort ascending
                setTimeout(() => { h.click(); }, 500); // Sort descending (newest first)
              }
            });
          }, 1000);

          // Wait for table to re-render then build panel
          setTimeout(buildPanel, 3000);
        } else {
          buildPanel();
        }

        setInterval(refresh, 120000);
      }
    }, 2000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();



