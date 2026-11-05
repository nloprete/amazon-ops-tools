// ==UserScript==
// @name         AFT - Daily Receive Counter (3AM to 3AM)
// @namespace    http://tampermonkey.net/
// @version      1.0.7
// @description  Shows VRIDs, dates, and quantities received for the current day (3AM to 3AM). Hides closed trailers.
// @updateURL    https://raw.githubusercontent.com/nloprete/amazon-ops-tools/main/aft-receive-counter.user.js
// @downloadURL  https://raw.githubusercontent.com/nloprete/amazon-ops-tools/main/aft-receive-counter.user.js
// @match        https://afttransshipmenthub-na.aka.amazon.com/*/view-transfers/inbound*
// @match        https://oculus.qubit.amazon.dev/transship/*
// @match        https://prod-na.us-east-1.idx-website.aft.amazon.dev/*
// @connect      maple-syrup.corp.amazon.com
// @connect      fclm-portal.amazon.com
// @connect      oculus.qubit.amazon.dev
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addValueChangeListener
// @grant        GM_openInTab
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
      width: calc(100vw - 24px);
      height: calc(100vh - 72px);
      max-height: calc(100vh - 72px);
      box-sizing: border-box;
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
    .aft-panel.minimized { height: auto; min-height: 0; width: 320px; min-width: 0; resize: none; }
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
    .aft-goal-group { display: flex; align-items: flex-start; gap: 16px; }
    .aft-stat .val { font-size: 18px; font-weight: 700; color: #ff9900; }
    .aft-stat .lbl { font-size: 9px; color: #aab7c4; }
    .aft-goal-input {
      background: #3a4553;
      border: 1px solid #556;
      color: #ff9900;
      border-radius: 3px;
      padding: 0 4px;
      font-size: 18px;
      font-weight: 700;
      font-family: "Amazon Ember", Arial, sans-serif;
      width: 110px;
      text-align: center;
    }
    .aft-goal-input:focus { outline: none; border-color: #ff9900; }
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
    .aft-results td { padding: 6px 10px; border-bottom: 1px solid #3a4553; font-size: 12px; white-space: nowrap; }
    .aft-results tbody tr:nth-child(even) td { background: #26333f; }
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
    .aft-results th { white-space: nowrap; }
    .aft-results th { padding: 6px 10px; font-size: 11px; }
    .aft-results td.aft-yms { font-size: 12px; white-space: nowrap; color: #e0e0e0; text-align: center; }
    .aft-date { font-size: 11px !important; }
    .aft-yms-status { font-size: 10px; color: #78909c; padding: 2px 0 4px; white-space: nowrap; }
    .aft-yms-status a { color: #4fc3f7; }
  `);

  // --- YMS data sharing (oculus.qubit.amazon.dev <-> AFT) ---
  const YMS_KEY = 'ymsData';
  const YMS_TS_KEY = 'ymsUpdatedAt';
  const YMS_URL = 'https://oculus.qubit.amazon.dev/transship/RIC4';
  const YMS_HOST = 'oculus.qubit.amazon.dev';
  const YMS_MAX_AGE_MS = 48 * 60 * 60 * 1000;

  // --- Dock Master (IDX) VRID -> Appointment Id bridge ---
  // Oculus keys rows by Dock Master appointment id, AFT by VRID; IDX maps one to the other.
  const DM_HOST = 'prod-na.us-east-1.idx-website.aft.amazon.dev';
  const DM_KEY = 'vridToAppt';
  const DM_SEARCH_URL = 'https://' + DM_HOST + '/en_US/RIC4/search?tab=appointments&ac=VRID&av=';
  const DM_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
  const DM_NULL_RETRY_MS = 2 * 60 * 60 * 1000;
  const DM_LOOKUP_TIMEOUT_MS = 25000;
  const DM_SCRAPE_TIMEOUT_MS = 20000;
  const DM_NO_RESULTS_MIN_MS = 4000;
  const DM_CONCURRENCY = 2;

  function normVrid(s) {
    return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

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

  // First <table> on the page that is NOT part of our own panel.
  function getPageTable() {
    return [...document.querySelectorAll('table')].find(t => !t.closest('.aft-panel')) || null;
  }

  // Cheap fingerprint of the page table's rows, used to detect real data changes.
  function getTableSignature() {
    const table = getPageTable();
    if (!table) return '';
    const body = table.tBodies[0] || table;
    return body.rows.length + '|' + body.textContent;
  }

  function scanTable() {
    const { start, end } = getShiftWindow();
    const table = getPageTable();
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
    panel.innerHTML = '<div class="aft-title">📦 Daily Receive<button class="aft-min-btn">▲</button></div><div class="aft-body"><div class="aft-inputs"><label>From:</label><input type="datetime-local" class="aft-input" id="aft-start" value="' + defaults.startStr + '"><label>To:</label><input type="datetime-local" class="aft-input" id="aft-end" value="' + defaults.endStr + '"></div><div class="aft-summary"><div class="aft-goal-group"><div class="aft-stat"><div class="val" id="aft-total">...</div><div class="lbl">TOTAL QTY</div></div><div class="aft-stat"><input type="text" inputmode="numeric" class="aft-goal-input" id="aft-goal" placeholder="—" aria-label="S1 Goal"><div class="lbl">S1 GOAL</div></div><div class="aft-stat"><div class="val" id="aft-gap" style="color:#78909c">—</div><div class="lbl">GAP</div></div></div><div class="aft-stat"><div class="val" id="aft-loads" style="color:#4fc3f7">...</div><div class="lbl">LOADS</div></div><div class="aft-stat"><div class="val" id="aft-missing-count" style="color:#ff5252">...</div><div class="lbl">MISSING</div></div><div class="aft-stat"><div class="val" id="aft-stow-total" style="color:#b388ff">...</div><div class="lbl">STOW VOL</div></div></div><div style="display:flex;gap:24px;flex:1;min-height:0;overflow:hidden;"><div id="aft-hourly-section" style="flex:1;overflow-y:auto;min-width:0;"></div><div id="aft-stow-section" style="flex:1;overflow-y:auto;min-width:0;"></div><div id="aft-period-section" style="flex:0.7;overflow-y:auto;min-width:0;"></div><div id="aft-results" style="flex:2.2;overflow-y:auto;min-width:0;"></div><div id="aft-missing-section" style="flex:1;overflow-y:auto;min-width:0;"></div></div><button class="aft-refresh" id="aft-refresh">↻ Refresh</button><div class="aft-time-range" id="aft-range"></div></div>';
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

    document.getElementById('aft-refresh').addEventListener('click', manualRefresh);
    document.getElementById('aft-start').addEventListener('change', refresh);
    document.getElementById('aft-end').addEventListener('change', refresh);

    // S1 Goal: restore saved value, persist + recompute gap on input
    const goalInput = document.getElementById('aft-goal');
    const savedGoal = localStorage.getItem(GOAL_KEY);
    if (savedGoal) goalInput.value = Number(savedGoal).toLocaleString();
    goalInput.addEventListener('input', () => {
      const goal = parseGoal(goalInput.value);
      if (goal > 0) localStorage.setItem(GOAL_KEY, String(goal));
      else localStorage.removeItem(GOAL_KEY);
      updateGap();
    });
    goalInput.addEventListener('blur', () => {
      const goal = parseGoal(goalInput.value);
      if (goal > 0) goalInput.value = goal.toLocaleString();
    });

    refresh();
    startTableObserver();

    // Re-render just the VRID table when the YMS tab pushes new data (no KIPS/FCLM calls).
    GM_addValueChangeListener(YMS_KEY, () => renderResults(lastLoads));

    // Dock Master frames/tabs write VRID -> appointment results here; wake their waiters and re-render.
    GM_addValueChangeListener(DM_KEY, (name, oldVal, newVal) => {
      const map = newVal || {};
      Object.keys(dmWaiters).forEach(v => {
        if (map[v] && (map[v].seenAt || 0) >= dmWaiters[v].since) {
          dmSession[v] = map[v];
          dmWaiters[v](true);
        }
      });
      renderResults(lastLoads);
    });
  }

  // --- Live updates ---
  const NETWORK_THROTTLE_MS = 60000;
  const OBSERVER_DEBOUNCE_MS = 1500;
  const NATIVE_WAIT_MS = 8000;
  let lastNetworkAt = 0;
  let lastTableSig = '';
  let manualInProgress = false;
  let observerTimer = null;

  // Find the AFT page's own reload control (outside our panel), preferring "refresh".
  function findNativeReloadControl() {
    const candidates = [...document.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"], a')]
      .filter(el => !el.closest('.aft-panel'))
      // Skip real navigation links so we never leave the page.
      .filter(el => !(el.tagName === 'A' && !el.getAttribute('role') && /^(https?:|\/)/i.test(el.getAttribute('href') || '')))
      .filter(el => !el.disabled && el.getClientRects().length > 0);
    const labelOf = el => [el.textContent, el.value, el.getAttribute('aria-label'), el.getAttribute('title')]
      .filter(Boolean).join(' ').trim();
    for (const re of [/refresh/i, /reload/i, /search/i, /apply/i]) {
      const match = candidates.find(el => re.test(labelOf(el)));
      if (match) return { el: match, label: labelOf(match) };
    }
    return null;
  }

  function waitForTableChange(prevSig, timeoutMs) {
    return new Promise(resolve => {
      const startedAt = Date.now();
      const iv = setInterval(() => {
        if (getTableSignature() !== prevSig) {
          clearInterval(iv);
          // Give the page a moment to finish rendering rows.
          setTimeout(() => resolve(true), 300);
        } else if (Date.now() - startedAt >= timeoutMs) {
          clearInterval(iv);
          resolve(false);
        }
      }, 250);
    });
  }

  async function manualRefresh() {
    if (manualInProgress) return;
    const btn = document.getElementById('aft-refresh');
    const originalText = btn ? btn.textContent : '';
    manualInProgress = true;
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Refreshing...'; }
    try {
      const native = findNativeReloadControl();
      if (native) {
        console.log('[AFT Receive Counter] Clicking native reload control:', native.label, native.el);
        const prevSig = getTableSignature();
        native.el.click();
        const changed = await waitForTableChange(prevSig, NATIVE_WAIT_MS);
        if (!changed) console.log('[AFT Receive Counter] Page table did not change within ' + NATIVE_WAIT_MS + 'ms; using current table.');
      } else {
        console.log('[AFT Receive Counter] No native reload control found; re-scanning current table.');
      }
    } catch (e) {
      console.warn('[AFT Receive Counter] Native reload failed:', e);
    } finally {
      clearTimeout(observerTimer);
      refresh();
      manualInProgress = false;
      if (btn) { btn.disabled = false; btn.textContent = originalText; }
    }
  }

  // Watch the page (excluding our panel and Dock Master frames) and re-scan when the data table changes.
  function startTableObserver() {
    const isOutsidePanel = node => {
      const el = node && (node.nodeType === 1 ? node : node.parentElement);
      return !!el && !el.closest('.aft-panel, .aft-dm-frame');
    };
    const isOwnNode = n => n.nodeType === 1 && (n.classList.contains('aft-panel') || n.classList.contains('aft-dm-frame'));
    const observer = new MutationObserver(mutations => {
      if (manualInProgress) return;
      const relevant = mutations.some(m => {
        if (!isOutsidePanel(m.target)) return false;
        if (m.type !== 'childList') return true;
        // Ignore our own panel / hidden Dock Master iframes being added/removed from <body>.
        const nodes = [...m.addedNodes, ...m.removedNodes];
        return nodes.length === 0 || nodes.some(n => !isOwnNode(n));
      });
      if (!relevant) return;
      clearTimeout(observerTimer);
      observerTimer = setTimeout(() => {
        // Only re-render when the page table's rows actually changed.
        if (manualInProgress || getTableSignature() === lastTableSig) return;
        refresh({ fromObserver: true });
      }, OBSERVER_DEBOUNCE_MS);
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  // --- S1 Goal / Gap ---
  const GOAL_KEY = 'aftReceiveCounter.s1Goal';
  let lastTotalQty = 0;

  function parseGoal(str) {
    return parseInt(String(str || '').replace(/\D/g, ''), 10) || 0;
  }

  function updateGap() {
    const gapEl = document.getElementById('aft-gap');
    const goalInput = document.getElementById('aft-goal');
    if (!gapEl || !goalInput) return;
    const goal = parseGoal(goalInput.value);
    if (goal <= 0) {
      gapEl.textContent = '—';
      gapEl.style.color = '#78909c';
      return;
    }
    const gap = goal - lastTotalQty;
    if (gap > 0) {
      gapEl.textContent = gap.toLocaleString() + ' to go';
      gapEl.style.color = '#ff5252';
    } else {
      gapEl.textContent = '+' + Math.abs(gap).toLocaleString();
      gapEl.style.color = '#69f0ae';
    }
  }

  // --- VRID results table (with YMS columns) ---
  let lastLoads = [];

  function formatAgo(ts) {
    if (!ts) return 'unknown';
    const mins = Math.max(0, Math.floor((Date.now() - ts) / 60000));
    if (mins < 60) return mins + 'm ago';
    return Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm ago';
  }

  // Re-renders only #aft-results; safe to call on YMS data changes (no network calls).
  function renderResults(loads) {
    const resultsEl = document.getElementById('aft-results');
    if (!resultsEl) return;
    const yms = GM_getValue(YMS_KEY, {}) || {};
    const ymsCount = Object.keys(yms).length;
    const apptMap = dmGetMap();
    const ymsCell = v => '<td class="aft-yms">' + (v ? escapeHtml(v) : '—') + '</td>';

    // Exact key match first; fall back to containment (Oculus/AFT cells may carry extra text).
    const ymsKeys = Object.keys(yms);
    const lookupYms = id => {
      if (!id) return null;
      if (yms[id]) return yms[id];
      const k = ymsKeys.find(key => key.includes(id) || (key.length >= 8 && id.includes(key)));
      return k ? yms[k] : null;
    };
    let matched = 0;
    let apptMapped = 0;
    const unmatched = [];

    let rows = '';
    loads.forEach(l => {
      const timeStr = l.arrivalTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const dateStr = l.arrivalTime.toLocaleDateString([], { month: 'short', day: 'numeric' });
      const vrid = normVrid(l.loadId);
      // Oculus "VRID" column holds Dock Master appointment ids; try the mapped appt first.
      const appt = apptMap[vrid] ? apptMap[vrid].appt : null;
      if (appt) apptMapped++;
      const hit = (appt && yms[appt]) || lookupYms(vrid);
      if (hit) matched++; else unmatched.push(vrid);
      const y = hit || {};
      rows += '<tr><td class="aft-vrid">' + escapeHtml(l.loadId) + '</td><td class="aft-date">' + dateStr + ' ' + timeStr + '</td><td class="aft-qty">' + l.qty.toLocaleString() + '</td>' +
        ymsCell(y.loadConfig) + ymsCell(y.flType) + ymsCell(y.pprSmall) + ymsCell(y.pprMedium) + '</tr>';
    });

    const dmStatus = ' · Dock Master: ' + (dmQueueRunning ? 'looking up ' + dmInFlight.size + '… · ' : '') +
      'matched ' + apptMapped + '/' + loads.length;
    const statusHtml = ymsCount > 0
      ? '<div class="aft-yms-status">Oculus synced ' + formatAgo(GM_getValue(YMS_TS_KEY, 0)) + ' (' + ymsCount + ')' + escapeHtml(dmStatus) + '</div>'
      : '<div class="aft-yms-status"><a href="' + YMS_URL + '" target="_blank" rel="noopener noreferrer">Oculus: no data — open Oculus tab</a>' + escapeHtml(dmStatus) + '</div>';

    console.log('[AFT/Oculus] matched ' + matched + '/' + loads.length + ' AFT VRIDs against ' + ymsKeys.length + ' Oculus VRIDs (appointment-mapped ' + apptMapped + '/' + loads.length + '). Sample AFT unmatched: ' + unmatched.slice(0, 5).join(', ') + ' | sample Oculus keys: ' + ymsKeys.slice(0, 5).join(', '));

    resultsEl.innerHTML = statusHtml + (loads.length > 0
      ? '<table><thead><tr><th>VRID</th><th>Received</th><th>Qty</th><th>Load Config</th><th>FL Type</th><th>PPR Small</th><th>PPR Medium</th></tr></thead><tbody>' + rows + '</tbody></table>'
      : '<div style="color:#78909c;padding:8px;text-align:center">No loads found in window</div>');
  }

  // --- Dock Master lookups (AFT side) ---
  let dmMode = 'iframe';           // switches to 'tab' for the session if iframes are blocked
  let dmQueueRunning = false;
  const dmQueue = [];
  const dmInFlight = new Set();    // VRIDs queued or being looked up
  const dmSession = {};            // results seen this session (guards against cross-frame write races)
  const dmFailedAt = {};           // VRID -> time of last timed-out lookup this session
  const dmWaiters = {};            // VRID -> resolver, woken by the vridToAppt listener
  const dmProbe = { done: 0, failed: [] };

  function dmPrune(map, now) {
    Object.keys(map).forEach(k => {
      if (!map[k] || !map[k].seenAt || now - map[k].seenAt > DM_MAX_AGE_MS) delete map[k];
    });
    return map;
  }

  // Stored map merged with this session's results (newest wins), minus entries older than 7 days.
  function dmGetMap() {
    const map = Object.assign({}, GM_getValue(DM_KEY, {}) || {});
    Object.keys(dmSession).forEach(k => {
      const s = dmSession[k];
      if (!map[k] || (map[k].seenAt || 0) < s.seenAt) map[k] = s;
    });
    return dmPrune(map, Date.now());
  }

  function dmSearchUrl(vrid) {
    return DM_SEARCH_URL + encodeURIComponent(vrid);
  }

  function dmNeedsLookup(vrid, map, now) {
    if (dmInFlight.has(vrid)) return false;
    const e = map[vrid];
    if (e && e.appt) return false;
    if (e && now - e.seenAt < DM_NULL_RETRY_MS) return false;
    if (dmFailedAt[vrid] && now - dmFailedAt[vrid] < DM_NULL_RETRY_MS) return false;
    return true;
  }

  // Resolves true when the listener sees this VRID in vridToAppt, false on timeout.
  function dmWait(vrid, ms) {
    return new Promise(resolve => {
      const timer = setTimeout(() => {
        delete dmWaiters[vrid];
        resolve(false);
      }, ms);
      const waiter = ok => {
        clearTimeout(timer);
        delete dmWaiters[vrid];
        resolve(ok);
      };
      waiter.since = Date.now();   // only results written after this count
      dmWaiters[vrid] = waiter;
    });
  }

  async function dmLookupIframe(vrid) {
    const wait = dmWait(vrid, DM_LOOKUP_TIMEOUT_MS);
    const frame = document.createElement('iframe');
    frame.className = 'aft-dm-frame';
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    frame.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;border:0;';
    frame.src = dmSearchUrl(vrid);
    document.body.appendChild(frame);
    const ok = await wait;
    frame.remove();
    return ok;
  }

  async function dmLookupTab(vrid) {
    const wait = dmWait(vrid, DM_LOOKUP_TIMEOUT_MS);
    let tab = null;
    try {
      tab = GM_openInTab(dmSearchUrl(vrid), { active: false, insert: true, setParent: true });
    } catch (e) {
      console.warn('[AFT/DockMaster] GM_openInTab failed:', e);
    }
    const ok = await wait;
    try { if (tab && typeof tab.close === 'function') tab.close(); } catch (e) { /* tab already gone */ }
    return ok;
  }

  // Runs one lookup; returns true if the VRID was put back on the queue (iframe -> tab fallback).
  async function dmLookup(vrid) {
    const mode = dmMode;
    const ok = await (mode === 'tab' ? dmLookupTab(vrid) : dmLookupIframe(vrid));
    if (mode === 'iframe' && dmProbe.done < 2) {
      dmProbe.done++;
      if (!ok) dmProbe.failed.push(vrid);
      if (dmProbe.done === 2 && dmProbe.failed.length === 2 && dmMode === 'iframe') {
        dmMode = 'tab';
        console.log('[AFT/DockMaster] first 2 iframe lookups timed out (likely X-Frame-Options/CSP); switching to background tabs for this session.');
        dmProbe.failed.forEach(f => {
          if (f === vrid) return;
          delete dmFailedAt[f];
          dmInFlight.add(f);
          dmQueue.push(f);
        });
        dmQueue.push(vrid);
        return true;
      }
    }
    if (!ok) {
      // Started as an iframe but the session has since switched to tabs: retry as a tab.
      if (mode === 'iframe' && dmMode === 'tab') {
        dmQueue.push(vrid);
        return true;
      }
      dmFailedAt[vrid] = Date.now();
      console.log('[AFT/DockMaster] ' + vrid + ' -> timed out (' + mode + ')');
    }
    return false;
  }

  async function dmRunQueue() {
    if (dmQueueRunning) return;
    dmQueueRunning = true;
    renderResults(lastLoads);
    const worker = async () => {
      while (dmQueue.length) {
        const vrid = dmQueue.shift();
        let requeued = false;
        try {
          requeued = await dmLookup(vrid);
        } catch (e) {
          console.warn('[AFT/DockMaster] lookup failed for ' + vrid + ':', e);
        }
        if (!requeued) dmInFlight.delete(vrid);
        renderResults(lastLoads);
      }
    };
    try {
      while (dmQueue.length) {
        const workers = [];
        for (let i = 0; i < DM_CONCURRENCY; i++) workers.push(worker());
        await Promise.all(workers);
      }
    } finally {
      dmQueueRunning = false;
      // Persist merged + pruned map (also recovers entries lost to concurrent frame writes).
      GM_setValue(DM_KEY, dmGetMap());
      renderResults(lastLoads);
    }
  }

  // Queue Dock Master lookups for loads with no cached appointment id.
  function dmQueueLookups(loads) {
    const map = dmGetMap();
    const now = Date.now();
    loads.forEach(l => {
      const vrid = normVrid(l.loadId);
      if (!vrid || !dmNeedsLookup(vrid, map, now)) return;
      dmInFlight.add(vrid);
      dmQueue.push(vrid);
    });
    if (dmQueue.length) dmRunQueue();
  }

  function refresh(opts) {
    // Event objects / interval calls count as forced; only the observer passes fromObserver.
    const fromObserver = !!(opts && opts.fromObserver === true);
    lastTableSig = getTableSignature();
    const { loads, totalQty, totalLoads } = scanTable();
    const { start, end } = getShiftWindow();

    document.getElementById('aft-total').textContent = totalQty.toLocaleString();
    lastTotalQty = totalQty;
    updateGap();
    document.getElementById('aft-loads').textContent = totalLoads;

    lastLoads = loads;
    renderResults(loads);
    dmQueueLookups(loads);

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
        { label: 'P3', start: 26, end: 27 },
        { label: 'P3 NEXT DAY', start: 27, end: 28.5 }
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
      let nextDayTotal = 0;
      nightData.forEach((p, idx) => {
        if (p.label === 'P3 NEXT DAY') {
          nextDayTotal += p.qty;
        } else {
          nightTotal += p.qty;
        }
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

      // Combined total (excludes P3 NEXT DAY)
      const grandTotal = dayTotal + nightTotal;
      periodHtml += `<div style="display:flex;justify-content:space-between;padding:6px 0;margin-top:6px;border-top:2px solid #69f0ae;"><span style="color:#69f0ae;font-weight:900;font-size:12px;">Combined Total</span><span style="color:#69f0ae;font-weight:900;font-size:14px;">${grandTotal.toLocaleString()}</span></div>`;

      // Next Day total
      if (nextDayTotal > 0) {
        periodHtml += `<div style="display:flex;justify-content:space-between;padding:4px 0;margin-top:4px;border-top:1px solid #ff9800;"><span style="color:#ff9800;font-weight:700;font-size:11px;">Next Day</span><span style="color:#ff9800;font-weight:700;font-size:12px;">${nextDayTotal.toLocaleString()}</span></div>`;
      }

      periodHtml += `<div style="font-size:9px;color:#78909c;margin-top:4px;font-style:italic;">*Total does not include trailers missing on AFT</div>`;

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

    // Network calls are throttled for observer-triggered refreshes only.
    if (fromObserver && Date.now() - lastNetworkAt < NETWORK_THROTTLE_MS) return;
    lastNetworkAt = Date.now();

    // Fetch KIPS to find missing trailers
    checkMissingTrailers(loads);

    // Fetch FCLM stow volume (Each Transfer In - Total), hourly across the window
    loadStowVolume();
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
            const trailerId = cells[1]?.textContent.trim().replace(/[^\w]/g, '').replace(/AFT$/i, '');
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

  // --- FCLM Stow Volume (Each Transfer In - Total) ---
  function pad2(n) { return String(n).padStart(2, '0'); }

  // Build the FCLM processPathRollup URL for a single 1-hour span.
  function buildFclmUrl(spanStart, spanEnd) {
    const dateStr = d => d.getFullYear() + '%2F' + pad2(d.getMonth() + 1) + '%2F' + pad2(d.getDate());
    const params =
      'reportFormat=HTML' +
      '&warehouseId=RIC4' +
      '&maxIntradayDays=1' +
      '&spanType=Intraday' +
      '&startDateIntraday=' + dateStr(spanStart) +
      '&startHourIntraday=' + spanStart.getHours() +
      '&startMinuteIntraday=0' +
      '&endDateIntraday=' + dateStr(spanEnd) +
      '&endHourIntraday=' + spanEnd.getHours() +
      '&endMinuteIntraday=0' +
      '&_adjustPlanHours=on' +
      '&_hideEmptyLineItems=on' +
      '&_rememberViewForWarehouse=on' +
      '&employmentType=AllEmployees';
    return 'https://fclm-portal.amazon.com/reports/processPathRollup?' + params;
  }

  // Fetch one hour's rollup and return the "Each Transfer In - Total" units value.
  function fetchStowHour(spanStart, spanEnd) {
    return new Promise((resolve) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: buildFclmUrl(spanStart, spanEnd),
        withCredentials: true,
        onload: (resp) => {
          try {
            const html = resp.responseText || '';
            // If we got bounced to Midway auth, there's no report table.
            if (/midway-auth\.amazon\.com|SSO\/redirect/i.test(html) && !/Each Transfer In/i.test(html)) {
              resolve({ qty: 0, authError: true });
              return;
            }
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const rows = [...doc.querySelectorAll('tr')];
            let qty = 0;
            let found = false;
            for (const row of rows) {
              const cells = [...row.querySelectorAll('td, th')];
              if (!cells.length) continue;
              const label = (cells[0].textContent || '').trim();
              if (/each\s*transfer\s*in\s*-\s*total/i.test(label)) {
                // Find the first numeric cell after the label = Volume/Units.
                for (let i = 1; i < cells.length; i++) {
                  const raw = (cells[i].textContent || '').trim().replace(/,/g, '');
                  if (/^\d+(\.\d+)?$/.test(raw)) {
                    qty = Math.round(parseFloat(raw));
                    found = true;
                    break;
                  }
                }
                if (found) break;
              }
            }
            resolve({ qty, authError: false });
          } catch (e) {
            resolve({ qty: 0, authError: false });
          }
        },
        onerror: () => resolve({ qty: 0, authError: false }),
        ontimeout: () => resolve({ qty: 0, authError: false }),
      });
    });
  }

  let stowFetchToken = 0;
  async function loadStowVolume() {
    const section = document.getElementById('aft-stow-section');
    const totalEl = document.getElementById('aft-stow-total');
    if (!section) return;

    const myToken = ++stowFetchToken;

    const { start } = getShiftWindow();
    // Always report a full 24-hour grid from the shift start (03:00 -> 03:00 next day).
    const hours = [];
    for (let i = 0; i < 24; i++) {
      const hStart = new Date(start);
      hStart.setHours(start.getHours() + i, 0, 0, 0);
      const hEnd = new Date(hStart);
      hEnd.setHours(hStart.getHours() + 1, 0, 0, 0);
      hours.push({ hStart, hEnd });
    }

    section.innerHTML = '<div style="color:#78909c;padding:8px;text-align:center;">⏳ Loading stow volume…</div>';

    const results = [];
    let authError = false;
    // Fetch sequentially to be gentle on FCLM and keep auth stable.
    for (const h of hours) {
      const r = await fetchStowHour(h.hStart, h.hEnd);
      if (myToken !== stowFetchToken) return; // a newer refresh superseded this run
      if (r.authError) authError = true;
      results.push({ ...h, qty: r.qty });
    }
    if (myToken !== stowFetchToken) return;

    if (authError && results.every(r => r.qty === 0)) {
      section.innerHTML = '<div style="margin-top:8px;padding-top:8px;border-top:2px solid #b388ff;"><div style="color:#b388ff;font-weight:700;font-size:13px;margin-bottom:8px;">📥 Stow Volume</div><div style="color:#ff5252;padding:8px;font-size:11px;">Not signed in to FCLM (Midway). Open fclm-portal.amazon.com in a tab, sign in, then Refresh.</div></div>';
      if (totalEl) totalEl.textContent = '—';
      return;
    }

    const stowTotal = results.reduce((s, r) => s + r.qty, 0);
    const maxQty = Math.max(...results.map(r => r.qty), 1);
    if (totalEl) totalEl.textContent = stowTotal.toLocaleString();

    let html = '<div style="margin-top:8px;padding-top:8px;border-top:2px solid #b388ff;">';
    html += '<div style="color:#b388ff;font-weight:700;font-size:13px;margin-bottom:8px;">📥 Stow Volume (hourly)</div>';
    results.forEach(r => {
      const label = pad2(r.hStart.getHours()) + ':00';
      const pct = Math.round((r.qty / maxQty) * 100);
      html += `<div style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:12px;">
        <span style="width:45px;color:#aab7c4;font-weight:600;">${label}</span>
        <div style="flex:1;background:#3a4553;border-radius:4px;height:18px;overflow:hidden;">
          <div style="width:${pct}%;height:100%;background:#b388ff;border-radius:4px;transition:width 0.3s;"></div>
        </div>
        <span style="width:65px;text-align:right;color:#69f0ae;font-weight:700;font-size:13px;">${r.qty.toLocaleString()}</span>
      </div>`;
    });
    html += `<div style="display:flex;justify-content:space-between;padding:6px 0;margin-top:6px;border-top:2px solid #b388ff;"><span style="color:#b388ff;font-weight:900;font-size:12px;">Stow Total</span><span style="color:#69f0ae;font-weight:900;font-size:14px;">${stowTotal.toLocaleString()}</span></div>`;
    html += '</div>';
    section.innerHTML = html;
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

  // --- YMS scraper (runs only on oculus.qubit.amazon.dev) ---
  const YMS_VRID_RE = /^1[0-9A-Z]{8}$/;

  // Strip sort arrows / non-letters, collapse whitespace, lowercase.
  function normHeader(s) {
    return String(s || '').replace(/[^A-Za-z]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function cellText(el) {
    return String((el && el.textContent) || '').replace(/\s+/g, ' ').trim();
  }

  // Place cells by aria-colindex when every cell has one (virtualized grids), else by position.
  function orderCells(cells) {
    if (cells.length && cells.every(c => c.hasAttribute('aria-colindex'))) {
      const out = [];
      cells.forEach(c => {
        const idx = parseInt(c.getAttribute('aria-colindex'), 10) - 1;
        if (idx >= 0) out[idx] = cellText(c);
      });
      return out;
    }
    return cells.map(cellText);
  }

  // Collect candidate grids: real <table>s and ARIA/div grids.
  function ymsReadGrids() {
    const grids = [];

    document.querySelectorAll('table').forEach(t => {
      if (t.closest('.aft-yms-badge')) return;
      let headerCells = [];
      if (t.tHead && t.tHead.rows.length) {
        headerCells = [...t.tHead.rows[t.tHead.rows.length - 1].cells];
      } else {
        const firstRow = t.querySelector('tr');
        if (firstRow) headerCells = [...firstRow.querySelectorAll('th')];
      }
      const bodyRows = [...t.querySelectorAll('tbody tr')].filter(r => r.querySelector('td'));
      if (!headerCells.length || !bodyRows.length) return;
      grids.push({
        type: 'table',
        headers: headerCells.map(cellText),
        rows: bodyRows.map(r => [...r.querySelectorAll('td')].map(cellText)),
      });
    });

    let containers = [...document.querySelectorAll('[role="grid"], [role="treegrid"], [role="table"]')]
      .filter(c => c.tagName !== 'TABLE');
    if (!containers.length && document.querySelector('[role="columnheader"]')) containers = [document.body];
    containers.forEach(c => {
      const headerCells = [...c.querySelectorAll('[role="columnheader"]')];
      const rowEls = [...c.querySelectorAll('[role="row"]')]
        .filter(r => r.querySelector('[role="gridcell"], [role="cell"]'));
      if (!headerCells.length || !rowEls.length) return;
      grids.push({
        type: 'aria',
        headers: orderCells(headerCells),
        rows: rowEls.map(r => orderCells([...r.querySelectorAll('[role="gridcell"], [role="cell"], [role="rowheader"]')])),
      });
    });

    return grids;
  }

  // Map header text to column indexes; returns null if this grid isn't the YMS data grid.
  function ymsMapColumns(headers, rows) {
    const norm = headers.map(normHeader);
    const find = re => norm.findIndex(h => re.test(h || ''));
    const cols = {
      vrid: -1,
      loadConfig: find(/load config/),
      flType: find(/fl type/),
      pprSmall: find(/ppr small/),
      pprMedium: find(/ppr med/),
    };
    for (const re of [/vrid/, /load id/, /trailer/]) {
      cols.vrid = find(re);
      if (cols.vrid >= 0) break;
    }
    // Fallback: the column whose cells most often look like VRIDs.
    if (cols.vrid < 0) {
      const width = Math.max(headers.length, ...rows.map(r => r.length), 0);
      let best = 0;
      for (let i = 0; i < width; i++) {
        const hits = rows.filter(r => YMS_VRID_RE.test(normVrid(r[i]))).length;
        if (hits > best) { best = hits; cols.vrid = i; }
      }
    }
    const hasData = cols.loadConfig >= 0 || cols.flType >= 0 || cols.pprSmall >= 0 || cols.pprMedium >= 0;
    if (cols.vrid < 0 || !hasData) return null;
    return cols;
  }

  function ymsUpdateBadge(count) {
    let badge = document.querySelector('.aft-yms-badge');
    if (!badge) {
      badge = document.createElement('div');
      badge.className = 'aft-yms-badge';
      badge.style.cssText = 'position:fixed;bottom:4px;left:4px;z-index:99999;background:#232f3e;color:#ff9900;border:1px solid #ff9900;border-radius:3px;padding:1px 5px;font:10px Arial,sans-serif;opacity:0.8;pointer-events:none;';
      document.body.appendChild(badge);
    }
    const text = 'AFT sync: ' + count + ' VRIDs';
    if (badge.textContent !== text) badge.textContent = text;
  }

  function ymsScrape() {
    const now = Date.now();
    const map = GM_getValue(YMS_KEY, {}) || {};
    const val = (r, i) => (i >= 0 ? String(r[i] || '').trim() : '');
    let scraped = 0;
    const headerLogs = [];

    ymsReadGrids().forEach(g => {
      const cols = ymsMapColumns(g.headers, g.rows);
      if (!cols) return;
      headerLogs.push(g.type + ' {' + Object.keys(cols).map(k =>
        k + '=' + (cols[k] >= 0 ? '"' + (g.headers[cols[k]] || '(by cell pattern)') + '"#' + cols[k] : 'none')).join(', ') + '}');
      g.rows.forEach(r => {
        const id = normVrid(r[cols.vrid]);
        if (!id) return;
        map[id] = {
          loadConfig: val(r, cols.loadConfig),
          flType: val(r, cols.flType),
          pprSmall: val(r, cols.pprSmall),
          pprMedium: val(r, cols.pprMedium),
          seenAt: now,
        };
        scraped++;
      });
    });

    // Prune entries older than 48h.
    Object.keys(map).forEach(k => {
      if (!map[k] || !map[k].seenAt || now - map[k].seenAt > YMS_MAX_AGE_MS) delete map[k];
    });

    console.log('[AFT/Oculus] scraped ' + scraped + ' rows, headers: ' + (headerLogs.join(' | ') || 'no matching grid found'));
    if (scraped > 0) {
      GM_setValue(YMS_KEY, map);
      GM_setValue(YMS_TS_KEY, now);
    }
    ymsUpdateBadge(Object.keys(map).length);
  }

  function initYms() {
    const run = () => {
      try { ymsScrape(); } catch (e) { console.warn('[AFT/Oculus] scrape failed:', e); }
    };
    setTimeout(run, 3000);

    let ymsTimer = null;
    const isBadge = n => n && n.nodeType === 1 && n.classList.contains('aft-yms-badge');
    const observer = new MutationObserver(mutations => {
      const relevant = mutations.some(m => {
        const el = m.target && (m.target.nodeType === 1 ? m.target : m.target.parentElement);
        if (el && el.closest('.aft-yms-badge')) return false;
        if (m.type !== 'childList') return true;
        const nodes = [...m.addedNodes, ...m.removedNodes];
        return nodes.length === 0 || nodes.some(n => !isBadge(n));
      });
      if (!relevant) return;
      clearTimeout(ymsTimer);
      ymsTimer = setTimeout(run, 1500);
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    setInterval(run, 60000);
  }

  // --- Dock Master scraper (runs only on the IDX host, usually inside a hidden AFT iframe) ---
  function dmVridFromUrl() {
    const p = new URLSearchParams(location.search);
    if (String(p.get('ac') || '').toUpperCase() !== 'VRID') return '';
    return normVrid(p.get('av'));
  }

  // First digits-only value under an "Appointment Id" header in any table/ARIA grid.
  function dmFindAppt() {
    for (const g of ymsReadGrids()) {
      const col = g.headers.findIndex(h => normHeader(h).replace(/ /g, '').includes('appointmentid'));
      if (col < 0) continue;
      for (const r of g.rows) {
        const digits = String(r[col] || '').replace(/\D/g, '');
        if (digits) return digits;
      }
    }
    return null;
  }

  function dmNoResults() {
    return /\b0\s+appointments?\s+found\b|\bno\s+appointments?\s+found\b/i.test(cellText(document.body));
  }

  function dmStore(vrid, appt) {
    const now = Date.now();
    const map = GM_getValue(DM_KEY, {}) || {};
    map[vrid] = { appt: appt || null, seenAt: now };
    GM_setValue(DM_KEY, dmPrune(map, now));
    console.log('[AFT/DockMaster] ' + vrid + ' -> ' + (appt || 'none'));
  }

  function initDockMaster() {
    const vrid = dmVridFromUrl();
    if (!vrid) return;
    const startedAt = Date.now();
    let done = false;
    let pending = false;
    let poller = null;
    let observer = null;

    const finish = appt => {
      if (done) return;
      done = true;
      if (observer) observer.disconnect();
      clearInterval(poller);
      dmStore(vrid, appt);
    };
    const check = () => {
      if (done) return;
      const elapsed = Date.now() - startedAt;
      try {
        const appt = dmFindAppt();
        if (appt) { finish(appt); return; }
        // Wait a few seconds before trusting "0 found" in case it's a pre-load placeholder.
        if (elapsed >= DM_NO_RESULTS_MIN_MS && dmNoResults()) { finish(null); return; }
      } catch (e) {
        console.warn('[AFT/DockMaster] scrape failed:', e);
      }
      if (elapsed >= DM_SCRAPE_TIMEOUT_MS) finish(null);
    };

    observer = new MutationObserver(() => {
      if (pending || done) return;
      pending = true;
      setTimeout(() => { pending = false; check(); }, 250);
    });
    observer.observe(document.body || document.documentElement, { childList: true, subtree: true, characterData: true });
    poller = setInterval(check, 1000);
    check();
  }

  // Three hosts: Dock Master (IDX) scraper, Oculus scraper, or the AFT panel (top window only).
  let startup = null;
  if (location.hostname === DM_HOST) startup = initDockMaster;
  else if (location.hostname === YMS_HOST) startup = initYms;
  else if (window.top === window.self) startup = init;
  if (startup) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startup);
    else startup();
  }
})();



