// ==UserScript==
// @name         IB Flow - Volume Projector
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Calculates expected volume potential for the remainder of the shift using Hours Left × Headcount × ETI Rate
// @updateURL    https://raw.githubusercontent.com/nloprete/amazon-ops-tools/main/ib-volume-projector.user.js
// @downloadURL  https://raw.githubusercontent.com/nloprete/amazon-ops-tools/main/ib-volume-projector.user.js
// @match        https://vantage.amazon.com/app/home/404*
// @match        https://vantage.amazon.com/app/inbound-dashboard*
// @match        https://vantage.amazon.com/app/home*inbound*
// @grant        GM_addStyle
// ==/UserScript==

(function () {
  'use strict';

  GM_addStyle(`
    .vol-proj-panel {
      position: fixed;
      bottom: 12px;
      right: 12px;
      z-index: 99999;
      background: #1a1a2e;
      color: #fff;
      border-radius: 10px;
      padding: 16px 20px;
      font-family: "Amazon Ember", Arial, sans-serif;
      border: 2px solid #4fc3f7;
      box-shadow: 0 4px 20px rgba(0,0,0,0.4);
      min-width: 280px;
      resize: both;
      overflow: auto;
    }
    .vol-proj-panel .vp-title {
      color: #4fc3f7;
      font-weight: 700;
      font-size: 14px;
      margin-bottom: 10px;
      padding-bottom: 6px;
      border-bottom: 1px solid #3a4553;
      cursor: grab;
      user-select: none;
    }
    .vol-proj-panel .vp-title:active {
      cursor: grabbing;
    }
    .vol-proj-panel .vp-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 4px 0;
      font-size: 12px;
    }
    .vol-proj-panel .vp-label {
      color: #aab7c4;
    }
    .vol-proj-panel .vp-value {
      font-weight: 700;
      font-size: 13px;
      color: #fff;
    }
    .vol-proj-panel .vp-divider {
      border-top: 1px solid #3a4553;
      margin: 8px 0;
    }
    .vol-proj-panel .vp-result {
      font-size: 22px;
      font-weight: 900;
      color: #4fc3f7;
      text-align: center;
      margin: 8px 0 4px;
    }
    .vol-proj-panel .vp-result-label {
      font-size: 11px;
      color: #78909c;
      text-align: center;
    }
    .vol-proj-panel .vp-total-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 4px 0;
      font-size: 13px;
    }
    .vol-proj-panel .vp-total-value {
      font-weight: 900;
      font-size: 18px;
      color: #69f0ae;
    }
    .vol-proj-panel .vp-timestamp {
      font-size: 9px;
      color: #78909c;
      text-align: center;
      margin-top: 6px;
    }
  `);

  // --- Helpers ---
  function getShiftInfo() {
    const now = new Date();
    const hour = now.getHours();
    const mins = now.getMinutes();
    const currentTime = hour + mins / 60;

    let shiftStart, shiftEnd, shiftName;

    if (currentTime >= 7 && currentTime < 17.5) {
      // Day shift 07:00 - 17:30
      shiftStart = new Date(now); shiftStart.setHours(7, 0, 0, 0);
      shiftEnd = new Date(now); shiftEnd.setHours(17, 30, 0, 0);
      shiftName = 'Day';
    } else {
      // Night shift 18:00 - 04:30
      if (currentTime >= 18) {
        shiftStart = new Date(now); shiftStart.setHours(18, 0, 0, 0);
        shiftEnd = new Date(now); shiftEnd.setDate(now.getDate() + 1); shiftEnd.setHours(4, 30, 0, 0);
      } else {
        shiftStart = new Date(now); shiftStart.setDate(now.getDate() - 1); shiftStart.setHours(18, 0, 0, 0);
        shiftEnd = new Date(now); shiftEnd.setHours(4, 30, 0, 0);
      }
      shiftName = 'Night';
    }

    const elapsed = (now - shiftStart) / (1000 * 60 * 60);
    const remaining = Math.max(0, (shiftEnd - now) / (1000 * 60 * 60));
    const shiftHours = (shiftEnd - shiftStart) / (1000 * 60 * 60);

    return { elapsed, remaining, shiftName, shiftHours };
  }

  function scrapePageData() {
    const text = document.body.innerText || '';

    // Scrape stations count (the big blue number under "Stations")
    let stations = null;
    const stationsEl = document.querySelectorAll('*');
    for (const el of stationsEl) {
      if (el.textContent.trim() === 'Stations') {
        // The number is typically in a sibling or nearby element
        const parent = el.parentElement;
        if (parent) {
          const nums = parent.textContent.match(/(\d{2,4})/);
          if (nums) stations = parseInt(nums[1], 10);
        }
        break;
      }
    }

    // Scrape ETI rate - "Each Transfer In - Total" row, last number (Rate column)
    let etiRate = null;
    const rows = document.querySelectorAll('tr, [role="row"]');
    for (const row of rows) {
      const rowText = row.textContent || '';
      if (/each\s*transfer\s*in\s*-?\s*total/i.test(rowText)) {
        const cells = row.querySelectorAll('td, [role="cell"], span, div');
        const numbers = [];
        for (const cell of cells) {
          const cellText = cell.textContent.trim();
          if (/^[\d,]+\.?\d*$/.test(cellText) && cellText.length <= 10) {
            numbers.push(parseFloat(cellText.replace(/,/g, '')));
          }
        }
        // Rate is the last number in the row
        if (numbers.length >= 3) {
          etiRate = numbers[numbers.length - 1];
        }
        break;
      }
    }

    // Scrape hours elapsed from page (shown as "Hours Elapsed: X.X")
    let hoursElapsed = null;
    const elapsedMatch = text.match(/hours?\s*elapsed:?\s*([\d.]+)/i);
    if (elapsedMatch) hoursElapsed = parseFloat(elapsedMatch[1]);

    // Scrape current volume (Each Transfer In - Total, first number in row)
    let currentVolume = null;
    for (const row of rows) {
      const rowText = row.textContent || '';
      if (/each\s*transfer\s*in\s*-?\s*total/i.test(rowText)) {
        // Get cells/columns from the row
        const cells = row.querySelectorAll('td, [role="cell"], span, div');
        for (const cell of cells) {
          const cellText = cell.textContent.trim();
          // Match a number like "172,217" or "109,557" (volume is typically the first large number)
          if (/^[\d,]+$/.test(cellText) && cellText.replace(/,/g, '').length >= 4) {
            currentVolume = parseFloat(cellText.replace(/,/g, ''));
            break;
          }
        }
        break;
      }
    }

    return { stations, etiRate, hoursElapsed, currentVolume };
  }

  // --- Build Panel ---
  let lastStationsCount = null;

  function buildPanel() {
    if (document.querySelector('.vol-proj-panel')) return;

    const panel = document.createElement('div');
    panel.className = 'vol-proj-panel';
    panel.innerHTML = `
      <div class="vp-title">📊 Volume Projector</div>
      <div style="display:flex;gap:16px;">
        <div style="flex:1;">
          <div style="color:#69f0ae;font-weight:700;font-size:11px;text-align:center;margin-bottom:6px;">BEST CASE (+5%)</div>
          <div class="vp-row"><span class="vp-label">Stations (HC)</span><span class="vp-value" id="vp-stations-bc">...</span></div>
          <div class="vp-row"><span class="vp-label">ETI Rate</span><span class="vp-value" id="vp-eti-bc">...</span></div>
          <div class="vp-row"><span class="vp-label">Hrs Elapsed</span><span class="vp-value" id="vp-elapsed-bc">...</span></div>
          <div class="vp-row"><span class="vp-label">Hrs Remaining</span><span class="vp-value" id="vp-remaining-bc">...</span></div>
          <div class="vp-row"><span class="vp-label">Shift</span><span class="vp-value" id="vp-shift-bc">...</span></div>
          <div class="vp-divider"></div>
          <div class="vp-row"><span class="vp-label">Current Vol</span><span class="vp-value" id="vp-current-vol-bc">...</span></div>
          <div class="vp-divider"></div>
          <div class="vp-result-label" style="color:#69f0ae;">Remaining Potential</div>
          <div class="vp-result" style="color:#69f0ae;" id="vp-projection-bc">...</div>
          <div class="vp-divider"></div>
          <div class="vp-total-row"><span class="vp-label">EOS Total</span><span class="vp-total-value" style="color:#69f0ae;" id="vp-total-bc">...</span></div>
        </div>
        <div style="flex:1;border-left:1px solid #3a4553;padding-left:16px;">
          <div style="color:#4fc3f7;font-weight:700;font-size:11px;text-align:center;margin-bottom:6px;">CURRENT CONDITIONS</div>
          <div class="vp-row"><span class="vp-label">Stations (HC)</span><span class="vp-value" id="vp-stations">...</span></div>
          <div class="vp-row"><span class="vp-label">ETI Rate</span><span class="vp-value" id="vp-eti">...</span></div>
          <div class="vp-row"><span class="vp-label">Hrs Elapsed</span><span class="vp-value" id="vp-elapsed">...</span></div>
          <div class="vp-row"><span class="vp-label">Hrs Remaining</span><span class="vp-value" id="vp-remaining">...</span></div>
          <div class="vp-row"><span class="vp-label">Shift</span><span class="vp-value" id="vp-shift">...</span></div>
          <div class="vp-divider"></div>
          <div class="vp-row"><span class="vp-label">Current Vol</span><span class="vp-value" id="vp-current-vol">...</span></div>
          <div class="vp-divider"></div>
          <div class="vp-result-label">Remaining Potential</div>
          <div class="vp-result" id="vp-projection">...</div>
          <div class="vp-divider"></div>
          <div class="vp-total-row"><span class="vp-label">EOS Total</span><span class="vp-total-value" id="vp-total">...</span></div>
        </div>
        <div style="flex:1;border-left:1px solid #3a4553;padding-left:16px;">
          <div style="color:#ff5252;font-weight:700;font-size:11px;text-align:center;margin-bottom:6px;">WORST CASE (-15%)</div>
          <div class="vp-row"><span class="vp-label">Stations (HC)</span><span class="vp-value" id="vp-stations-wc">...</span></div>
          <div class="vp-row"><span class="vp-label">ETI Rate</span><span class="vp-value" id="vp-eti-wc">...</span></div>
          <div class="vp-row"><span class="vp-label">Hrs Elapsed</span><span class="vp-value" id="vp-elapsed-wc">...</span></div>
          <div class="vp-row"><span class="vp-label">Hrs Remaining</span><span class="vp-value" id="vp-remaining-wc">...</span></div>
          <div class="vp-row"><span class="vp-label">Shift</span><span class="vp-value" id="vp-shift-wc">...</span></div>
          <div class="vp-divider"></div>
          <div class="vp-row"><span class="vp-label">Current Vol</span><span class="vp-value" id="vp-current-vol-wc">...</span></div>
          <div class="vp-divider"></div>
          <div class="vp-result-label" style="color:#ff5252;">Remaining Potential</div>
          <div class="vp-result" style="color:#ff5252;" id="vp-projection-wc">...</div>
          <div class="vp-divider"></div>
          <div class="vp-total-row"><span class="vp-label">EOS Total</span><span class="vp-total-value" style="color:#ff5252;" id="vp-total-wc">...</span></div>
        </div>
      </div>
      <div class="vp-divider"></div>
      <div class="vp-row">
        <span class="vp-label">Volume Goal</span>
        <input type="number" id="vp-goal-input" placeholder="Enter goal" style="background:#2a2a4e;border:1px solid #4fc3f7;color:#fff;border-radius:4px;padding:2px 6px;width:90px;font-size:12px;font-weight:700;text-align:right;font-family:'Amazon Ember',Arial,sans-serif;">
      </div>
      <div class="vp-row">
        <span class="vp-label">Pace vs Goal</span>
        <span class="vp-value" id="vp-pace">...</span>
      </div>
      <div id="vp-pace-bar" style="height:6px;border-radius:3px;background:#3a4553;margin-top:4px;overflow:hidden;">
        <div id="vp-pace-fill" style="height:100%;border-radius:3px;width:0%;transition:width 0.5s;"></div>
      </div>
      <div class="vp-divider"></div>
      <div style="font-size:11px;color:#78909c;margin-bottom:4px;">📅 Historical</div>
      <div class="vp-row"><span class="vp-label">Yesterday at this point</span><span class="vp-value" id="vp-hist-yesterday">—</span></div>
      <div class="vp-row"><span class="vp-label">Last week avg at this point</span><span class="vp-value" id="vp-hist-week">—</span></div>
      <div class="vp-timestamp" id="vp-timestamp"></div>
    `;
    document.body.appendChild(panel);

    // Make panel draggable by title bar
    const titleBar = panel.querySelector('.vp-title');
    let isDragging = false, offsetX = 0, offsetY = 0;

    titleBar.addEventListener('mousedown', (e) => {
      isDragging = true;
      offsetX = e.clientX - panel.getBoundingClientRect().left;
      offsetY = e.clientY - panel.getBoundingClientRect().top;
      panel.style.bottom = 'auto';
      panel.style.right = 'auto';
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      panel.style.left = Math.max(0, e.clientX - offsetX) + 'px';
      panel.style.top = Math.max(0, e.clientY - offsetY) + 'px';
      e.preventDefault();
    });

    window.addEventListener('mouseup', () => {
      isDragging = false;
    });

    // Goal input — save and recalculate on change
    const goalInput = panel.querySelector('#vp-goal-input');
    const savedGoal = localStorage.getItem('vp_volume_goal') || '';
    if (savedGoal) goalInput.value = savedGoal;
    goalInput.addEventListener('input', () => {
      localStorage.setItem('vp_volume_goal', goalInput.value);
      updatePanel();
    });
  }

  function updatePanel() {
    const { stations, etiRate, hoursElapsed, currentVolume } = scrapePageData();
    const { remaining, shiftName, elapsed, shiftHours } = getShiftInfo();

    const stationsEl = document.getElementById('vp-stations');
    const etiEl = document.getElementById('vp-eti');
    const elapsedEl = document.getElementById('vp-elapsed');
    const remainingEl = document.getElementById('vp-remaining');
    const shiftEl = document.getElementById('vp-shift');
    const currentVolEl = document.getElementById('vp-current-vol');
    const projectionEl = document.getElementById('vp-projection');
    const totalEl = document.getElementById('vp-total');
    const tsEl = document.getElementById('vp-timestamp');

    if (!stationsEl) return;

    const hrs = hoursElapsed || elapsed;
    const hrsLeft = hoursElapsed ? (shiftHours - hoursElapsed) : remaining;

    stationsEl.textContent = stations ? stations.toLocaleString() : '—';

    // HC drop alert
    if (stations && lastStationsCount !== null) {
      const drop = lastStationsCount - stations;
      if (drop >= 10) {
        let alert = document.getElementById('vp-hc-alert');
        if (!alert) {
          alert = document.createElement('div');
          alert.id = 'vp-hc-alert';
          alert.style.cssText = 'background:#ff5252;color:#fff;font-weight:700;font-size:12px;padding:6px 10px;border-radius:4px;margin-bottom:8px;text-align:center;animation:andon-flash 1s infinite;';
          const panel = document.querySelector('.vol-proj-panel');
          const title = panel.querySelector('.vp-title');
          title.after(alert);
        }
        alert.textContent = `⚠️ HC DROP: -${drop} stations (${lastStationsCount} → ${stations})`;
      } else {
        const existing = document.getElementById('vp-hc-alert');
        if (existing) existing.remove();
      }
    }
    if (stations) lastStationsCount = stations;
    etiEl.textContent = etiRate ? etiRate.toFixed(1) : '—';
    elapsedEl.textContent = hrs ? hrs.toFixed(1) + 'h' : '—';
    remainingEl.textContent = hrsLeft ? hrsLeft.toFixed(1) + 'h' : '—';
    shiftEl.textContent = shiftName;
    currentVolEl.textContent = currentVolume ? currentVolume.toLocaleString() : '—';

    if (stations && etiRate && hrsLeft > 0) {
      const projection = Math.round(hrsLeft * stations * etiRate);
      projectionEl.textContent = projection.toLocaleString();

      // Best case: 5% more
      const bcProjection = Math.round(projection * 1.05);
      document.getElementById('vp-projection-bc').textContent = bcProjection.toLocaleString();

      // Worst case: 15% less
      const wcProjection = Math.round(projection * 0.85);
      document.getElementById('vp-projection-wc').textContent = wcProjection.toLocaleString();

      if (currentVolume) {
        const total = currentVolume + projection;
        totalEl.textContent = total.toLocaleString();
        document.getElementById('vp-total-bc').textContent = (currentVolume + bcProjection).toLocaleString();
        document.getElementById('vp-total-wc').textContent = (currentVolume + wcProjection).toLocaleString();
      } else {
        totalEl.textContent = '—';
        document.getElementById('vp-total-bc').textContent = '—';
        document.getElementById('vp-total-wc').textContent = '—';
      }
    } else {
      projectionEl.textContent = '—';
      totalEl.textContent = '—';
      document.getElementById('vp-projection-bc').textContent = '—';
      document.getElementById('vp-total-bc').textContent = '—';
      document.getElementById('vp-projection-wc').textContent = '—';
      document.getElementById('vp-total-wc').textContent = '—';
    }

    // Fill worst case static values
    document.getElementById('vp-stations-wc').textContent = stations ? Math.round(stations * 0.85).toLocaleString() : '—';
    document.getElementById('vp-eti-wc').textContent = etiRate ? (etiRate * 0.85).toFixed(1) : '—';
    document.getElementById('vp-elapsed-wc').textContent = hrs ? hrs.toFixed(1) + 'h' : '—';
    document.getElementById('vp-remaining-wc').textContent = hrsLeft ? hrsLeft.toFixed(1) + 'h' : '—';
    document.getElementById('vp-shift-wc').textContent = shiftName;
    document.getElementById('vp-current-vol-wc').textContent = currentVolume ? currentVolume.toLocaleString() : '—';

    // Fill best case static values
    document.getElementById('vp-stations-bc').textContent = stations ? Math.round(stations * 1.05).toLocaleString() : '—';
    document.getElementById('vp-eti-bc').textContent = etiRate ? (etiRate * 1.05).toFixed(1) : '—';
    document.getElementById('vp-elapsed-bc').textContent = hrs ? hrs.toFixed(1) + 'h' : '—';
    document.getElementById('vp-remaining-bc').textContent = hrsLeft ? hrsLeft.toFixed(1) + 'h' : '—';
    document.getElementById('vp-shift-bc').textContent = shiftName;
    document.getElementById('vp-current-vol-bc').textContent = currentVolume ? currentVolume.toLocaleString() : '—';

    // Goal comparison
    const goalInput = document.getElementById('vp-goal-input');
    const paceEl = document.getElementById('vp-pace');
    const paceFill = document.getElementById('vp-pace-fill');
    const goal = parseFloat(goalInput.value) || 0;

    if (goal > 0 && currentVolume && stations && etiRate && hrsLeft > 0) {
      const projectedTotal = currentVolume + Math.round(hrsLeft * stations * etiRate);
      const pct = Math.round((projectedTotal / goal) * 100);
      const diff = projectedTotal - goal;

      if (diff >= 0) {
        paceEl.textContent = `ON PACE +${diff.toLocaleString()} (${pct}%)`;
        paceEl.style.color = '#69f0ae';
        paceFill.style.width = Math.min(pct, 100) + '%';
        paceFill.style.background = '#69f0ae';
      } else {
        paceEl.textContent = `BEHIND ${diff.toLocaleString()} (${pct}%)`;
        paceEl.style.color = pct >= 90 ? '#ff9800' : '#ff5252';
        paceFill.style.width = Math.min(pct, 100) + '%';
        paceFill.style.background = pct >= 90 ? '#ff9800' : '#ff5252';
      }
    } else if (goal > 0 && currentVolume) {
      const pct = Math.round((currentVolume / goal) * 100);
      paceEl.textContent = `${pct}% complete`;
      paceEl.style.color = '#aab7c4';
      paceFill.style.width = Math.min(pct, 100) + '%';
      paceFill.style.background = '#4fc3f7';
    } else {
      paceEl.textContent = goal > 0 ? 'Waiting for data...' : 'Enter goal above';
      paceEl.style.color = '#78909c';
      paceFill.style.width = '0%';
    }

    tsEl.textContent = 'Updated ' + new Date().toLocaleTimeString();

    // --- Historical data recording & comparison ---
    if (currentVolume && hrs) {
      // Record current snapshot
      const today = new Date().toISOString().split('T')[0];
      const shiftKey = shiftName.toLowerCase();
      const histKey = 'vp_history';
      let history = {};
      try { history = JSON.parse(localStorage.getItem(histKey) || '{}'); } catch (e) {}

      // Store snapshots keyed by date+shift, each is array of {elapsed, volume}
      const dayKey = `${today}_${shiftKey}`;
      if (!history[dayKey]) history[dayKey] = [];

      // Only record every ~0.5h to avoid bloat (check if we already have a close entry)
      const lastEntry = history[dayKey][history[dayKey].length - 1];
      if (!lastEntry || Math.abs(lastEntry.elapsed - hrs) >= 0.4) {
        history[dayKey].push({ elapsed: Math.round(hrs * 10) / 10, volume: currentVolume });
      }

      // Keep only last 14 days of data
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 14);
      const cutoffStr = cutoff.toISOString().split('T')[0];
      Object.keys(history).forEach(k => {
        if (k < cutoffStr) delete history[k];
      });

      localStorage.setItem(histKey, JSON.stringify(history));

      // Lookup yesterday
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayKey = `${yesterday.toISOString().split('T')[0]}_${shiftKey}`;
      const yesterdayData = history[yesterdayKey] || [];
      const yesterdayMatch = yesterdayData.reduce((best, entry) => {
        if (!best || Math.abs(entry.elapsed - hrs) < Math.abs(best.elapsed - hrs)) return entry;
        return best;
      }, null);

      const histYesterday = document.getElementById('vp-hist-yesterday');
      if (yesterdayMatch && Math.abs(yesterdayMatch.elapsed - hrs) < 1) {
        const diff = currentVolume - yesterdayMatch.volume;
        const diffStr = diff >= 0 ? `+${diff.toLocaleString()}` : diff.toLocaleString();
        histYesterday.textContent = `${yesterdayMatch.volume.toLocaleString()} (${diffStr})`;
        histYesterday.style.color = diff >= 0 ? '#69f0ae' : '#ff5252';
      } else {
        histYesterday.textContent = '—';
        histYesterday.style.color = '#78909c';
      }

      // Lookup last 7 days average at this point
      const weekVolumes = [];
      for (let d = 1; d <= 7; d++) {
        const pastDate = new Date();
        pastDate.setDate(pastDate.getDate() - d);
        const pastKey = `${pastDate.toISOString().split('T')[0]}_${shiftKey}`;
        const pastData = history[pastKey] || [];
        const match = pastData.reduce((best, entry) => {
          if (!best || Math.abs(entry.elapsed - hrs) < Math.abs(best.elapsed - hrs)) return entry;
          return best;
        }, null);
        if (match && Math.abs(match.elapsed - hrs) < 1) {
          weekVolumes.push(match.volume);
        }
      }

      const histWeek = document.getElementById('vp-hist-week');
      if (weekVolumes.length >= 2) {
        const avg = Math.round(weekVolumes.reduce((a, b) => a + b, 0) / weekVolumes.length);
        const diff = currentVolume - avg;
        const diffStr = diff >= 0 ? `+${diff.toLocaleString()}` : diff.toLocaleString();
        histWeek.textContent = `${avg.toLocaleString()} (${diffStr})`;
        histWeek.style.color = diff >= 0 ? '#69f0ae' : '#ff5252';
      } else {
        histWeek.textContent = weekVolumes.length === 0 ? 'Recording...' : '—';
        histWeek.style.color = '#78909c';
      }
    }
  }

  // --- Init ---
  function init() {
    let polls = 0;
    const poller = setInterval(() => {
      polls++;
      const hasData = document.body.innerText.includes('Stations') ||
                      document.body.innerText.includes('Transfer In');
      if (hasData || polls >= 20) {
        clearInterval(poller);
        buildPanel();
        updatePanel();
        // Refresh every 60 seconds
        setInterval(updatePanel, 60000);

        // Also update on DOM changes
        const observer = new MutationObserver(() => {
          clearTimeout(observer._debounce);
          observer._debounce = setTimeout(updatePanel, 2000);
        });
        observer.observe(document.body, { childList: true, subtree: true });
      }
    }, 3000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
