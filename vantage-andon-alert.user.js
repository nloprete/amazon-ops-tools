// ==UserScript==
// @name         Vantage - Andon Flash Alert (5min+)
// @namespace    http://tampermonkey.net/
// @version      2.9
// @description  Flashes stations red when Out of Work andons exceed 5 minutes. Department-specific.
// @updateURL    https://raw.githubusercontent.com/nloprete/amazon-ops-tools/main/vantage-andon-alert.user.js
// @downloadURL  https://raw.githubusercontent.com/nloprete/amazon-ops-tools/main/vantage-andon-alert.user.js
// @match        https://vantage.amazon.com/app/fulfillment-dashboards/station-map*
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

(function () {
  'use strict';

  const ALERT_THRESHOLD = 5;
  const CRITICAL_THRESHOLD = 10;
  const CHECK_INTERVAL = 30000;
  let selectedDept = GM_getValue('andon_dept', '');
  const alertedStations = new Set();

  GM_addStyle(`
    @keyframes andon-flash {
      0%, 100% { box-shadow: 0 0 8px 4px rgba(255,0,0,0.8); background-color: rgba(255,0,0,0.3) !important; }
      50% { box-shadow: 0 0 20px 8px rgba(255,0,0,1); background-color: rgba(255,0,0,0.6) !important; }
    }
    @keyframes andon-critical {
      0%, 100% { box-shadow: 0 0 15px 8px rgba(255,0,0,1); background-color: rgba(255,0,0,0.5) !important; transform: scale(1.05); }
      50% { box-shadow: 0 0 30px 15px rgba(255,0,0,1); background-color: rgba(255,0,0,0.8) !important; transform: scale(1.15); }
    }
    .andon-flash { animation: andon-flash 1s infinite !important; border: 2px solid red !important; z-index: 9999 !important; position: relative; }
    .andon-critical { animation: andon-critical 0.5s infinite !important; border: 3px solid red !important; z-index: 9999 !important; position: relative; }
    .andon-badge { position: absolute; top: -6px; right: -6px; background: red; color: #fff; font-size: 9px; font-weight: 700; padding: 1px 4px; border-radius: 8px; z-index: 10000; white-space: nowrap; font-family: "Amazon Ember", Arial, sans-serif; }
    .andon-counter { position: fixed; bottom: 12px; left: 12px; z-index: 99999; background: #232f3e; color: #fff; border-radius: 6px; padding: 6px 12px; font-family: "Amazon Ember", Arial, sans-serif; font-size: 12px; border: 2px solid red; box-shadow: 0 2px 8px rgba(0,0,0,0.3); display: none; }
    .andon-counter .ct { color: red; font-weight: 700; font-size: 16px; }

    .andon-list-panel {
      background: #fff;
      border-radius: 8px;
      padding: 12px 16px;
      font-family: "Amazon Ember", Arial, sans-serif;
      font-size: 12px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
      border: 1px solid #e0e0e0;
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 99998;
      min-width: 250px;
      max-height: 300px;
      overflow-y: auto;
      display: none;
    }
    .andon-list-panel .alp-title {
      color: #c62828;
      font-weight: 700;
      font-size: 14px;
      margin-bottom: 8px;
      padding-bottom: 6px;
      border-bottom: 2px solid #ffcdd2;
    }
    .andon-list-panel .alp-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 4px 0;
      border-bottom: 1px solid #f5f5f5;
    }
    .andon-list-panel .alp-row:last-child { border-bottom: none; }
    .andon-list-panel .alp-station {
      color: #232f3e;
      font-weight: 700;
      font-size: 13px;
    }
    .andon-list-panel .alp-time {
      font-weight: 700;
      font-size: 13px;
      color: #333;
    }
    .andon-list-panel .alp-time.warn { color: #ff9800; }
    .andon-list-panel .alp-time.crit { color: #c62828; }

    .dept-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); z-index: 9999999; display: flex; align-items: center; justify-content: center; }
    .dept-box { background: #232f3e; border: 2px solid #ff9900; border-radius: 12px; padding: 24px 32px; text-align: center; font-family: "Amazon Ember", Arial, sans-serif; color: #fff; }
    .dept-box h3 { color: #ff9900; margin: 0 0 16px; font-size: 18px; }
    .dept-btns { display: flex; gap: 12px; justify-content: center; }
    .dept-btn { background: #3a4553; border: 2px solid #556; color: #fff; border-radius: 8px; padding: 14px 22px; font-size: 15px; font-weight: 700; cursor: pointer; font-family: "Amazon Ember", Arial, sans-serif; }
    .dept-btn:hover { border-color: #ff9900; color: #ff9900; }

    .dept-badge { position: fixed; top: 8px; left: 8px; z-index: 99999; background: #232f3e; color: #ff9900; border: 2px solid #ff9900; border-radius: 6px; padding: 4px 10px; font-family: "Amazon Ember", Arial, sans-serif; font-size: 11px; font-weight: 700; cursor: pointer; }
    .dept-badge:hover { background: #3a4553; }

    .andon-modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); z-index: 999999; display: flex; align-items: center; justify-content: center; }
    .andon-modal { background: #1a1a2e; border: 3px solid red; border-radius: 12px; padding: 24px 32px; color: #fff; font-family: "Amazon Ember", Arial, sans-serif; text-align: center; min-width: 300px; box-shadow: 0 0 40px rgba(255,0,0,0.5); animation: andon-critical 1s infinite; }
    .andon-modal h2 { color: red; margin: 0 0 8px; font-size: 20px; }
    .andon-modal .sid { font-size: 36px; font-weight: 700; color: #ff9900; margin: 8px 0; }
    .andon-modal .topen { font-size: 18px; color: #ff4d4d; margin: 8px 0; }
    .andon-modal .zinfo { font-size: 13px; color: #aab7c4; margin: 4px 0 16px; }
    .andon-modal button { background: red; color: #fff; border: none; border-radius: 6px; padding: 10px 24px; font-size: 14px; font-weight: 700; cursor: pointer; }
  `);

  // --- Department chooser ---
  function showDeptChooser() {
    return new Promise(resolve => {
      const ov = document.createElement('div');
      ov.className = 'dept-overlay';
      ov.innerHTML = `<div class="dept-box"><h3>⚠️ Andon Alert — Select Department</h3><div class="dept-btns">
        <button class="dept-btn" data-d="S">🟣 Stow</button>
        <button class="dept-btn" data-d="P">🔵 Pick</button>
        <button class="dept-btn" data-d="I">🟢 ICQA</button>
        <button class="dept-btn" data-d="ALL">⚡ All</button>
      </div></div>`;
      document.body.appendChild(ov);
      ov.querySelectorAll('.dept-btn').forEach(b => b.addEventListener('click', () => {
        selectedDept = b.dataset.d;
        GM_setValue('andon_dept', selectedDept);
        ov.remove();
        updateBadge();
        resolve();
      }));
    });
  }

  function updateBadge() {
    let b = document.querySelector('.dept-badge');
    if (!b) {
      b = document.createElement('div');
      b.className = 'dept-badge';
      b.addEventListener('click', async () => { await showDeptChooser(); checkAndons(); });
      document.body.appendChild(b);
    }
    const labels = { S: '🟣 Stow', P: '🔵 Pick', I: '🟢 ICQA', ALL: '⚡ All' };
    b.textContent = 'Andon: ' + (labels[selectedDept] || 'All');
  }

  // --- Helpers ---
  function getWarehouse() { return new URLSearchParams(window.location.search).get('warehouse') || ''; }
  function getZones() { const z = new URLSearchParams(window.location.search).get('zones'); return z ? z.split(',') : []; }

  function findStation(id) {
    for (const span of document.querySelectorAll('span.station-id-text')) {
      if (span.textContent.trim() === String(id)) return span.closest('.station-map-item');
    }
    return null;
  }

  function getStationMode(stationEl) {
    if (!stationEl) return '';
    const typeText = stationEl.querySelector('.station-type-text')?.textContent.trim() || '';
    if (/^NS|^S/i.test(typeText)) return 'S';
    if (/^P|^PTR/i.test(typeText)) return 'P';
    if (/^I|^NU/i.test(typeText) && /I/.test(typeText)) return 'I';
    return '';
  }

  function matchesDept(station) {
    if (!selectedDept || selectedDept === 'ALL') return true;
    // Use station_mode from API if available
    if (station.station_mode) return station.station_mode === selectedDept;
    // Fallback: check DOM
    const el = findStation(station.id);
    return getStationMode(el) === selectedDept;
  }

  // --- Sound ---
  function ping() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = 880; g.gain.value = 0.5; o.start();
      g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      o.stop(ctx.currentTime + 0.5);
      setTimeout(() => {
        const o2 = ctx.createOscillator(); const g2 = ctx.createGain();
        o2.connect(g2); g2.connect(ctx.destination);
        o2.frequency.value = 1100; g2.gain.value = 0.5; o2.start();
        g2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
        o2.stop(ctx.currentTime + 0.5);
      }, 300);
    } catch(e) {}
  }

  // --- Tab flash ---
  let tabFlash = null;
  const origTitle = document.title;
  function startTabFlash(id) {
    if (tabFlash) return;
    let t = false;
    tabFlash = setInterval(() => { t = !t; document.title = t ? `🚨 ANDON ${id} - 10min+` : origTitle; }, 800);
  }
  function stopTabFlash() { if (tabFlash) { clearInterval(tabFlash); tabFlash = null; document.title = origTitle; } }

  // --- Modal ---
  function showModal(id, mins, zone) {
    if (document.querySelector('.andon-modal-overlay')) return;
    ping();
    startTabFlash(id);
    const ov = document.createElement('div');
    ov.className = 'andon-modal-overlay';
    ov.innerHTML = `<div class="andon-modal"><h2>⚠️ CRITICAL ANDON</h2><div class="sid">Station ${id}</div><div class="topen">Out of Work: ${Math.floor(mins)} minutes</div><div class="zinfo">Zone: ${zone}</div><button id="andon-ack">ACKNOWLEDGE</button></div>`;
    document.body.appendChild(ov);
    document.getElementById('andon-ack').addEventListener('click', () => { ov.remove(); stopTabFlash(); });
    const si = setInterval(() => { if (!document.querySelector('.andon-modal-overlay')) { clearInterval(si); return; } ping(); }, 5000);
  }

  // --- Counter ---
  const counter = document.createElement('div');
  counter.className = 'andon-counter';
  counter.innerHTML = '<span class="ct" id="ac">0</span> stations 5min+ andon';
  document.body.appendChild(counter);

  // --- Active Andon List Panel ---
  console.log('[Andon] Creating panel...');
  const andonListPanel = document.createElement('div');
  andonListPanel.className = 'andon-list-panel';
  andonListPanel.innerHTML = '<div class="alp-title">⚠️ Out of Work Andons</div><div id="alp-body"></div>';
  document.body.appendChild(andonListPanel);

  // --- Fetch & Check ---
  function fetchAndons() {
    const wh = getWarehouse(); const zones = getZones();
    if (!wh || !zones.length) return Promise.resolve([]);
    return Promise.all(zones.map(z =>
      fetch(`/api/us-east-1/fulfillment?dataset=station_map%2Fstations_with_station_metrics&podGapLookBackInMinutes=15&warehouse=${wh}&zone=${z}`, { credentials: 'include' })
        .then(r => r.json()).then(d => Array.isArray(d) ? d : []).catch(() => [])
    )).then(r => r.flat());
  }

  async function checkAndons() {
    const stations = await fetchAndons();
    const now = Date.now() / 1000;

    document.querySelectorAll('.andon-flash, .andon-critical').forEach(el => { el.classList.remove('andon-flash', 'andon-critical'); });
    document.querySelectorAll('.andon-badge').forEach(el => el.remove());

    let count = 0;
    const activeAndons = [];

    stations.forEach(s => {
      if (!s.blocking_andons || !s.earliest_andon_time_opened) { alertedStations.delete(s.id); return; }
      const mins = (now - s.earliest_andon_time_opened) / 60;

      // Track ALL active out-of-work andons for the list panel (before dept filter)
      if (mins >= 0) {
        activeAndons.push({ id: s.id, mins });
      }

      if (!matchesDept(s)) return;

      if (mins < ALERT_THRESHOLD) { alertedStations.delete(s.id); return; }

      const el = findStation(s.id);
      if (!el) return;

      el.classList.add(mins >= CRITICAL_THRESHOLD ? 'andon-critical' : 'andon-flash');
      el.style.position = 'relative';
      const badge = document.createElement('div');
      badge.className = 'andon-badge';
      badge.textContent = Math.floor(mins) + 'min';
      el.appendChild(badge);
      count++;

      if (mins >= CRITICAL_THRESHOLD && !alertedStations.has(s.id)) {
        alertedStations.add(s.id);
        showModal(s.id, mins, getZones()[0] || '?');
      }
    });

    document.getElementById('ac').textContent = count;
    counter.style.display = count > 0 ? 'block' : 'none';

    // Update the active andon list panel
    activeAndons.sort((a, b) => b.mins - a.mins);
    const alpBody = document.getElementById('alp-body');
    if (alpBody) {
      if (activeAndons.length === 0) {
        alpBody.innerHTML = '<div style="color:#78909c;padding:4px 0;">No active andons</div>';
      } else {
        alpBody.innerHTML = activeAndons.map(a => {
          const m = Math.floor(a.mins);
          const s = Math.floor((a.mins - m) * 60);
          const timeStr = m + 'm ' + String(s).padStart(2, '0') + 's';
          const cls = a.mins >= CRITICAL_THRESHOLD ? 'crit' : a.mins >= ALERT_THRESHOLD ? 'warn' : '';
          return `<div class="alp-row"><span class="alp-station">${a.id}</span><span class="alp-time ${cls}">${timeStr}</span></div>`;
        }).join('');
      }
    }
    andonListPanel.style.display = activeAndons.length > 0 ? 'block' : 'none';
    const titleEl = andonListPanel.querySelector('.alp-title');
    if (titleEl) titleEl.textContent = `⚠️ Out of Work Andons (${activeAndons.length})`;
  }

  // --- Init ---
  async function init() {
    let polls = 0;
    const poller = setInterval(async () => {
      polls++;
      if (document.querySelector('.station-map-item') || polls >= 15) {
        clearInterval(poller);
        if (!selectedDept) await showDeptChooser();
        updateBadge();
        checkAndons();
        setInterval(checkAndons, CHECK_INTERVAL);

        // Watch for floor changes
        const mc = document.querySelector('.station-map-container, .station-map-body, .station-map');
        if (mc) new MutationObserver(() => {
          if (document.querySelectorAll('.station-map-item').length > 0 && !document.querySelector('.andon-flash, .andon-critical')) checkAndons();
        }).observe(mc, { childList: true, subtree: true });

        let lastZ = getZones().join(',');
        setInterval(() => { const z = getZones().join(','); if (z !== lastZ) { lastZ = z; setTimeout(checkAndons, 3000); } }, 1000);
      }
    }, 2000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
