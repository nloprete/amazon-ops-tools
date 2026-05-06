// ==UserScript==
// @name         Vantage - Andon Flash Alert (5min+)
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Flashes stations red when Out of Work andons exceed 5 minutes
// @updateURL    https://raw.githubusercontent.com/nloprete/amazon-ops-tools/main/vantage-andon-alert.user.js
// @downloadURL  https://raw.githubusercontent.com/nloprete/amazon-ops-tools/main/vantage-andon-alert.user.js
// @match        https://vantage.amazon.com/app/fulfillment-dashboards/station-map*
// @grant        GM_addStyle
// ==/UserScript==

(function () {
  'use strict';

  const ALERT_THRESHOLD_MINUTES = 5;
  const CHECK_INTERVAL_MS = 30000; // Check every 30 seconds

  GM_addStyle(`
    @keyframes andon-flash {
      0%, 100% { box-shadow: 0 0 8px 4px rgba(255, 0, 0, 0.8); background-color: rgba(255, 0, 0, 0.3) !important; }
      50% { box-shadow: 0 0 20px 8px rgba(255, 0, 0, 1); background-color: rgba(255, 0, 0, 0.6) !important; }
    }
    @keyframes andon-flash-critical {
      0%, 100% { box-shadow: 0 0 15px 8px rgba(255, 0, 0, 1); background-color: rgba(255, 0, 0, 0.5) !important; transform: scale(1.05); }
      50% { box-shadow: 0 0 30px 15px rgba(255, 0, 0, 1); background-color: rgba(255, 0, 0, 0.8) !important; transform: scale(1.15); }
    }
    .andon-alert-flash {
      animation: andon-flash 1s ease-in-out infinite !important;
      border: 2px solid #ff0000 !important;
      z-index: 9999 !important;
      position: relative;
    }
    .andon-alert-critical {
      animation: andon-flash-critical 0.5s ease-in-out infinite !important;
      border: 3px solid #ff0000 !important;
      z-index: 9999 !important;
      position: relative;
    }
    .andon-alert-badge {
      position: absolute;
      top: -6px;
      right: -6px;
      background: #ff0000;
      color: #fff;
      font-size: 9px;
      font-weight: 700;
      padding: 1px 4px;
      border-radius: 8px;
      font-family: "Amazon Ember", Arial, sans-serif;
      z-index: 10000;
      white-space: nowrap;
    }
    .andon-counter {
      position: fixed;
      bottom: 12px;
      left: 12px;
      z-index: 99999;
      background: #232f3e;
      color: #fff;
      border-radius: 6px;
      padding: 6px 12px;
      font-family: "Amazon Ember", Arial, sans-serif;
      font-size: 12px;
      border: 2px solid #ff0000;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      display: none;
    }
    .andon-counter .count { color: #ff0000; font-weight: 700; font-size: 16px; }
    .andon-counter .label { color: #aab7c4; }

    /* Critical modal */
    .andon-modal-overlay {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.7);
      z-index: 999999;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .andon-modal {
      background: #1a1a2e;
      border: 3px solid #ff0000;
      border-radius: 12px;
      padding: 24px 32px;
      color: #fff;
      font-family: "Amazon Ember", Arial, sans-serif;
      text-align: center;
      min-width: 300px;
      box-shadow: 0 0 40px rgba(255,0,0,0.5);
      animation: andon-flash-critical 1s ease-in-out infinite;
    }
    .andon-modal h2 {
      color: #ff0000;
      margin: 0 0 8px 0;
      font-size: 20px;
    }
    .andon-modal .station-id {
      font-size: 36px;
      font-weight: 700;
      color: #ff9900;
      margin: 8px 0;
    }
    .andon-modal .time-open {
      font-size: 18px;
      color: #ff4d4d;
      margin: 8px 0;
    }
    .andon-modal .zone-info {
      font-size: 13px;
      color: #aab7c4;
      margin: 4px 0 16px 0;
    }
    .andon-modal-dismiss {
      background: #ff0000;
      color: #fff;
      border: none;
      border-radius: 6px;
      padding: 10px 24px;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      font-family: "Amazon Ember", Arial, sans-serif;
    }
    .andon-modal-dismiss:hover { background: #cc0000; }
  `);

  function getWarehouse() {
    const params = new URLSearchParams(window.location.search);
    return params.get('warehouse') || '';
  }

  function getZones() {
    const params = new URLSearchParams(window.location.search);
    const z = params.get('zones');
    return z ? z.split(',') : [];
  }

  function fetchAndonData() {
    const warehouse = getWarehouse();
    const zones = getZones();
    if (!warehouse || !zones.length) return Promise.resolve([]);

    return Promise.all(zones.map(zone => {
      const url = `/api/us-east-1/fulfillment?dataset=station_map%2Fstations_with_station_metrics&podGapLookBackInMinutes=15&warehouse=${warehouse}&zone=${zone}`;
      return fetch(url, { credentials: 'include' })
        .then(r => r.json())
        .then(data => Array.isArray(data) ? data : [])
        .catch(() => []);
    })).then(results => results.flat());
  }

  function findStationElement(stationId) {
    const spans = document.querySelectorAll('span.station-id-text');
    for (const span of spans) {
      if (span.textContent.trim() === String(stationId)) {
        return span.closest('.station-map-item');
      }
    }
    return null;
  }

  function getMinutesSinceAndon(timestamp) {
    if (!timestamp) return 0;
    const now = Date.now() / 1000;
    return (now - timestamp) / 60;
  }

  // Counter badge
  const counter = document.createElement('div');
  counter.className = 'andon-counter';
  counter.innerHTML = '<span class="count" id="andon-count">0</span> <span class="label">stations 5min+ andon</span>';
  document.body.appendChild(counter);

  // Track which stations have already triggered the 10min alert (don't repeat)
  const alertedStations = new Set();

  // Ping sound using Web Audio API
  function playPingSound() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.value = 0.5;
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      osc.stop(ctx.currentTime + 0.5);
      // Second ping
      setTimeout(() => {
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.type = 'sine';
        osc2.frequency.value = 1100;
        gain2.gain.value = 0.5;
        osc2.start();
        gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
        osc2.stop(ctx.currentTime + 0.5);
      }, 300);
    } catch (e) {}
  }

  function showCriticalModal(stationId, minutes, zone) {
    // Don't show if one is already open
    if (document.querySelector('.andon-modal-overlay')) return;

    playPingSound();
    startTabFlash(stationId);

    const overlay = document.createElement('div');
    overlay.className = 'andon-modal-overlay';
    overlay.innerHTML = `
      <div class="andon-modal">
        <h2>⚠️ CRITICAL ANDON</h2>
        <div class="station-id">Station ${stationId}</div>
        <div class="time-open">Out of Work: ${Math.floor(minutes)} minutes</div>
        <div class="zone-info">Zone: ${zone}</div>
        <button class="andon-modal-dismiss" id="andon-dismiss">ACKNOWLEDGE</button>
      </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById('andon-dismiss').addEventListener('click', () => {
      overlay.remove();
      stopTabFlash();
    });

    // Also play sound every 5 seconds until dismissed
    const soundInterval = setInterval(() => {
      if (!document.querySelector('.andon-modal-overlay')) {
        clearInterval(soundInterval);
        return;
      }
      playPingSound();
    }, 5000);
  }

  // Tab title flash
  let tabFlashInterval = null;
  const originalTitle = document.title;

  function startTabFlash(stationId) {
    if (tabFlashInterval) return;
    let toggle = false;
    tabFlashInterval = setInterval(() => {
      toggle = !toggle;
      document.title = toggle ? `🚨 ANDON ${stationId} - 10min+` : originalTitle;
    }, 800);
  }

  function stopTabFlash() {
    if (tabFlashInterval) {
      clearInterval(tabFlashInterval);
      tabFlashInterval = null;
      document.title = originalTitle;
    }
  }

  async function checkAndons() {
    const stations = await fetchAndonData();
    const now = Date.now() / 1000;

    // Clear previous alerts
    document.querySelectorAll('.andon-alert-flash, .andon-alert-critical').forEach(el => {
      el.classList.remove('andon-alert-flash');
      el.classList.remove('andon-alert-critical');
    });
    document.querySelectorAll('.andon-alert-badge').forEach(el => el.remove());

    let alertCount = 0;

    stations.forEach(station => {
      if (station.blocking_andons > 0 && station.earliest_andon_time_opened) {
        const minutes = getMinutesSinceAndon(station.earliest_andon_time_opened);

        if (minutes >= ALERT_THRESHOLD_MINUTES) {
          const el = findStationElement(station.id);
          if (el) {
            // 10+ minutes = critical (bigger flash)
            if (minutes >= 10) {
              el.classList.add('andon-alert-critical');
            } else {
              el.classList.add('andon-alert-flash');
            }
            alertCount++;

            // Add time badge
            const badge = document.createElement('div');
            badge.className = 'andon-alert-badge';
            badge.textContent = Math.floor(minutes) + 'min';
            el.style.position = 'relative';
            el.appendChild(badge);

            // Trigger modal + sound at 10 minutes (once per station)
            if (minutes >= 10 && !alertedStations.has(station.id)) {
              alertedStations.add(station.id);
              const zone = getZones()[0] || 'Unknown';
              showCriticalModal(station.id, minutes, zone);
            }
          }
        } else {
          // Andon resolved or under threshold — remove from alerted set
          alertedStations.delete(station.id);
        }
      } else {
        // No andon — clear from alerted set
        alertedStations.delete(station.id);
      }
    });

    // Update counter
    const countEl = document.getElementById('andon-count');
    if (countEl) countEl.textContent = alertCount;
    counter.style.display = alertCount > 0 ? 'block' : 'none';
  }

  // Init
  function init() {
    let polls = 0;
    const poller = setInterval(() => {
      polls++;
      if (document.querySelector('.station-map-item') || polls >= 15) {
        clearInterval(poller);
        checkAndons();
        setInterval(checkAndons, CHECK_INTERVAL_MS);

        // Watch for floor/zone changes that re-render the map
        const observer = new MutationObserver(() => {
          // If stations exist but none are flashing, re-check
          const stations = document.querySelectorAll('.station-map-item');
          const flashing = document.querySelectorAll('.andon-alert-flash');
          if (stations.length > 0 && flashing.length === 0) {
            checkAndons();
          }
        });
        const mapContainer = document.querySelector('.station-map-container, .station-map-body, .station-map');
        if (mapContainer) {
          observer.observe(mapContainer, { childList: true, subtree: true });
        }

        // Also watch URL changes (SPA navigation)
        let lastZones = getZones().join(',');
        setInterval(() => {
          const currentZones = getZones().join(',');
          if (currentZones !== lastZones) {
            lastZones = currentZones;
            setTimeout(checkAndons, 3000); // Wait for new floor to render
          }
        }, 1000);
      }
    }, 2000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
