// ==UserScript==
// @name         Vantage - Low Rate Alert
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Flashes stations orange when a stower's rate drops below 120 UPH
// @updateURL    https://raw.githubusercontent.com/nloprete/amazon-ops-tools/main/vantage-low-rate-alert.user.js
// @downloadURL  https://raw.githubusercontent.com/nloprete/amazon-ops-tools/main/vantage-low-rate-alert.user.js
// @match        https://vantage.amazon.com/app/fulfillment-dashboards/station-map*
// @grant        GM_addStyle
// ==/UserScript==

(function () {
  'use strict';

  const RATE_THRESHOLD = 120;
  const CHECK_INTERVAL_MS = 60000; // Check every 60 seconds

  GM_addStyle(`
    @keyframes low-rate-flash {
      0%, 100% { box-shadow: 0 0 6px 3px rgba(255, 152, 0, 0.7); background-color: rgba(255, 152, 0, 0.2) !important; }
      50% { box-shadow: 0 0 14px 6px rgba(255, 152, 0, 1); background-color: rgba(255, 152, 0, 0.5) !important; }
    }
    .low-rate-flash {
      animation: low-rate-flash 1.5s ease-in-out infinite !important;
      border: 2px solid #ff9800 !important;
      z-index: 9998 !important;
      position: relative;
    }
    .low-rate-badge {
      position: absolute;
      bottom: -6px;
      right: -6px;
      background: #ff9800;
      color: #000;
      font-size: 8px;
      font-weight: 700;
      padding: 1px 3px;
      border-radius: 6px;
      font-family: "Amazon Ember", Arial, sans-serif;
      z-index: 10000;
      white-space: nowrap;
    }
    .low-rate-counter {
      position: fixed;
      bottom: 12px;
      right: 12px;
      z-index: 99999;
      background: #232f3e;
      color: #fff;
      border-radius: 6px;
      padding: 6px 12px;
      font-family: "Amazon Ember", Arial, sans-serif;
      font-size: 12px;
      border: 2px solid #ff9800;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      display: none;
    }
    .low-rate-counter .count { color: #ff9800; font-weight: 700; font-size: 16px; }
    .low-rate-counter .label { color: #aab7c4; }
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

  function fetchAssociateData() {
    const warehouse = getWarehouse();
    const zones = getZones();
    if (!warehouse || !zones.length) return Promise.resolve([]);

    const now = new Date();
    const start = new Date(now.getTime() - 12 * 60 * 60 * 1000);
    const startISO = start.toISOString().replace(/\.\d+Z$/, '.000Z');

    return Promise.all(zones.map(zone => {
      const url = `/api/us-east-1/fulfillment?dataset=station_map%2Fstations_with_associate_metrics&startDateTime=${encodeURIComponent(startISO)}&warehouse=${warehouse}&zone=${zone}`;
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

  // Counter
  const counter = document.createElement('div');
  counter.className = 'low-rate-counter';
  counter.innerHTML = '<span class="count" id="lr-count">0</span> <span class="label">below ' + RATE_THRESHOLD + ' UPH</span>';
  document.body.appendChild(counter);

  async function checkRates() {
    const associates = await fetchAssociateData();

    // Clear previous
    document.querySelectorAll('.low-rate-flash').forEach(el => el.classList.remove('low-rate-flash'));
    document.querySelectorAll('.low-rate-badge').forEach(el => el.remove());

    let alertCount = 0;

    associates.forEach(aa => {
      // Only check stowers with meaningful work time
      if (!aa.stow_rate || !aa.stow_work_minutes || aa.stow_work_minutes < 30) return;

      if (aa.stow_rate < RATE_THRESHOLD) {
        const el = findStationElement(aa.station_id);
        if (el && !el.classList.contains('andon-alert-flash') && !el.classList.contains('andon-alert-critical')) {
          el.classList.add('low-rate-flash');
          alertCount++;

          const badge = document.createElement('div');
          badge.className = 'low-rate-badge';
          badge.textContent = Math.round(aa.stow_rate) + ' UPH';
          el.style.position = 'relative';
          el.appendChild(badge);
        }
      }
    });

    const countEl = document.getElementById('lr-count');
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
        checkRates();
        setInterval(checkRates, CHECK_INTERVAL_MS);

        // Watch for floor changes
        const observer = new MutationObserver(() => {
          const stations = document.querySelectorAll('.station-map-item');
          const flashing = document.querySelectorAll('.low-rate-flash');
          if (stations.length > 0 && flashing.length === 0) {
            checkRates();
          }
        });
        const mapContainer = document.querySelector('.station-map-container, .station-map-body, .station-map');
        if (mapContainer) {
          observer.observe(mapContainer, { childList: true, subtree: true });
        }

        let lastZones = getZones().join(',');
        setInterval(() => {
          const currentZones = getZones().join(',');
          if (currentZones !== lastZones) {
            lastZones = currentZones;
            setTimeout(checkRates, 3000);
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
