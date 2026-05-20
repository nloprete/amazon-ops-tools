// ==UserScript==
// @name         Vantage - GCA Pending Alert
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Flags stations yellow on Vantage for associates with pending GCAs (Guided Coaching Activities). Shows "GCA" badge linking to the coaching page.
// @updateURL    https://raw.githubusercontent.com/nloprete/amazon-ops-tools/main/vantage-gca-alert.user.js
// @downloadURL  https://raw.githubusercontent.com/nloprete/amazon-ops-tools/main/vantage-gca-alert.user.js
// @match        https://vantage.amazon.com/app/fulfillment-dashboards/station-map*
// @match        https://guided-coaching.corp.amazon.com/*
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // ============================================================
  // STORAGE ABSTRACTION — works with or without Tampermonkey
  // Uses GM_getValue/GM_setValue if available, falls back to localStorage
  // Cross-domain sync uses URL hash when GM is not available
  // ============================================================
  const hasGM = (typeof GM_getValue !== 'undefined' && typeof GM_setValue !== 'undefined');

  function storageGet(key, fallback) {
    if (hasGM) return storageGet(key, fallback);
    try {
      const val = localStorage.getItem('gca_' + key);
      return val !== null ? val : fallback;
    } catch (e) { return fallback; }
  }

  function storageSet(key, value) {
    if (hasGM) { storageSet(key, value); return; }
    try { localStorage.setItem('gca_' + key, value); } catch (e) {}
  }

  function addStyle(css) {
    if (hasGM && typeof GM_addStyle !== 'undefined') { addStyle(css); return; }
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ============================================================
  // CONFIGURATION
  // ============================================================
  const CHECK_INTERVAL = 30000;
  const GCA_BASE_URL = 'https://guided-coaching.corp.amazon.com/#/opportunities';
  const GCA_EMPLOYEE_URL = 'https://guided-coaching.corp.amazon.com/#/employee-transcript/';

  // ============================================================
  // GCA PAGE SCRAPER (runs on guided-coaching.corp.amazon.com)
  // ============================================================
  function runGCAScraper() {
    addStyle(`
      .gca-scraper-badge {
        position: fixed;
        top: 8px;
        right: 8px;
        z-index: 99999;
        background: #232f3e;
        color: #fff;
        border: 2px solid #f5a623;
        border-radius: 6px;
        padding: 8px 14px;
        font-family: "Amazon Ember", Arial, sans-serif;
        font-size: 12px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      }
      .gca-scraper-badge .title { color: #f5a623; font-weight: 700; }
      .gca-scraper-badge .count { color: #fff; font-weight: 700; font-size: 16px; }
      .gca-scraper-badge .status { color: #78909c; font-size: 10px; display: block; margin-top: 2px; }
    `);

    function scrapeGCALogins() {
      const gcaEntries = []; // Store {login, expires, process} objects

      // The GCA page shows entries like:
      //   "Donastorg,Meredith mereddon@"
      //   "Expires on Friday, May 22, 2026 at 7:53:05 AM"
      //   "Process: Inbound Problem Solve"
      // Each entry is in a card/block. We need login + expiration date + process.

      // Find all cards/blocks that contain a GCA entry
      const bodyText = document.body.innerText || '';
      const seenLogins = new Set();

      // Strategy: find all elements with "login@" text, then look nearby for expiration and process
      const allElements = document.querySelectorAll('a, span, small, div, p, td, li');
      allElements.forEach(el => {
        const text = el.textContent.trim();
        if (/^[a-z][a-z0-9]{2,15}@$/i.test(text) && !text.includes(' ')) {
          const login = text.replace(/@$/, '').toLowerCase();
          if (seenLogins.has(login)) return;

          // Find the parent card/container for this entry
          const container = el.closest('[class*="card"], [class*="panel"], [class*="item"], [class*="row"], li, tr, article') ||
                            el.parentElement?.parentElement?.parentElement;

          let expires = null;
          let process = null;

          if (container) {
            const containerText = container.textContent || '';

            // Extract expiration
            const expMatch = containerText.match(/expires\s+on\s+[\w,]+\s+([\w]+\s+\d{1,2},\s+\d{4})\s+at\s+([\d:]+\s*[AP]M)/i);
            if (expMatch) {
              try {
                expires = new Date(expMatch[1] + ' ' + expMatch[2]).toISOString();
              } catch (e) {}
            }
            if (!expires) {
              const expMatch2 = containerText.match(/expires\s+on\s+\w+,\s+([\w]+\s+\d{1,2},\s+\d{4})\s+at\s+([\d:]+\s*[AP]M)/i);
              if (expMatch2) {
                try {
                  expires = new Date(expMatch2[1] + ' ' + expMatch2[2]).toISOString();
                } catch (e) {}
              }
            }

            // Extract process
            const processMatch = containerText.match(/process:\s*([^\n\r]+)/i);
            if (processMatch) {
              process = processMatch[1].trim();
              // Clean up — remove trailing text that might be from next field
              process = process.replace(/\s*supervisor:.*$/i, '').trim();
            }

            // Check if this is a supervisor login
            const isSupervisor = /supervisor:\s*$/i.test(
              containerText.substring(0, containerText.indexOf(text))
            );
            if (isSupervisor) return;
          }

          seenLogins.add(login);
          gcaEntries.push({ login, expires, process });
        }
      });

      // Fallback: TreeWalker approach if strategy 1 found nothing
      if (gcaEntries.length === 0) {
        console.log('[GCA] Element scan found nothing, trying TreeWalker');
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          const text = walker.currentNode.textContent.trim();
          if (/^[a-z][a-z0-9]{2,15}@$/i.test(text)) {
            const login = text.replace(/@$/, '').toLowerCase();
            if (!seenLogins.has(login)) {
              seenLogins.add(login);
              gcaEntries.push({ login, expires: null, process: null });
            }
          }
        }
      }

      // Remove supervisor logins
      const supervisorLogins = new Set();
      document.querySelectorAll('*').forEach(el => {
        const text = el.textContent || '';
        if (/supervisor:/i.test(text) && text.length < 200) {
          const match = text.match(/supervisor:\s*([a-z][a-z0-9]{2,15})@/i);
          if (match) {
            supervisorLogins.add(match[1].toLowerCase());
          }
        }
      });

      const filtered = gcaEntries.filter(e => !supervisorLogins.has(e.login));
      console.log('[GCA] Supervisor logins excluded:', [...supervisorLogins]);
      console.log('[GCA] Final GCA entries:', filtered.length, filtered);
      return filtered;
    }

    function updateBadge(entries) {
      let badge = document.getElementById('gca-scraper-badge');
      if (!badge) {
        badge = document.createElement('div');
        badge.id = 'gca-scraper-badge';
        badge.className = 'gca-scraper-badge';
        document.body.appendChild(badge);
      }

      const now = new Date();
      const expiringToday = entries.filter(e => {
        if (!e.expires) return false;
        const exp = new Date(e.expires);
        return exp.toDateString() === now.toDateString();
      }).length;

      const urgencyText = expiringToday > 0
        ? `<span style="color:#ff5252;font-weight:700"> (${expiringToday} expire today!)</span>`
        : '';

      badge.innerHTML = `
        <span class="title">🟡 GCA → Vantage</span><br>
        <span class="count">${entries.length}</span> pending GCAs synced${urgencyText}
        <span class="status">Last sync: ${new Date().toLocaleTimeString()} — Open Vantage to see flagged stations</span>
      `;
    }

    function doScrape() {
      const entries = scrapeGCALogins();
      if (entries.length > 0) {
        const data = {
          entries: entries, // [{login, expires}, ...]
          logins: entries.map(e => e.login), // backward compat
          timestamp: Date.now(),
          source: window.location.href
        };
        storageSet('gca_data', JSON.stringify(data));
        console.log('[GCA] Saved', entries.length, 'entries:', entries);

        // For non-Tampermonkey browsers: provide a copy-to-clipboard button for cross-domain sync
        if (!hasGM) {
          updateCopyButton(data);
        }
      } else {
        console.log('[GCA] No entries found this pass');
      }
      updateBadge(entries);
    }

    // Copy button for non-TM browsers — lets user copy GCA data to paste on Vantage
    function updateCopyButton(data) {
      let btn = document.getElementById('gca-copy-btn');
      if (!btn) {
        btn = document.createElement('button');
        btn.id = 'gca-copy-btn';
        btn.style.cssText = 'position:fixed;top:60px;right:8px;z-index:99999;background:#f5a623;color:#000;border:none;border-radius:6px;padding:8px 14px;font-family:"Amazon Ember",Arial,sans-serif;font-size:12px;font-weight:700;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.3);';
        btn.textContent = '📋 Copy GCA Data for Vantage';
        document.body.appendChild(btn);
      }
      btn.onclick = () => {
        const encoded = btoa(JSON.stringify(data));
        navigator.clipboard.writeText(encoded).then(() => {
          btn.textContent = '✓ Copied! Paste on Vantage (right-click sync badge)';
          btn.style.background = '#4caf50';
          setTimeout(() => {
            btn.textContent = '📋 Copy GCA Data for Vantage';
            btn.style.background = '#f5a623';
          }, 3000);
        });
      };
    }

    // Wait for the coaching list to render
    let attempts = 0;
    const poller = setInterval(() => {
      attempts++;
      console.log('[GCA] Polling attempt', attempts);
      const bodyText = document.body.innerText || '';
      const hasCoaching = /coaching to deliver/i.test(bodyText);
      const hasLogins = /[a-z][a-z0-9]{2,15}@/i.test(bodyText);
      console.log('[GCA] hasCoaching:', hasCoaching, 'hasLogins:', hasLogins);
      if ((hasCoaching && hasLogins) || attempts >= 30) {
        clearInterval(poller);
        doScrape();
        // Re-scrape every 2 minutes
        setInterval(doScrape, 2 * 60 * 1000);
      }
    }, 3000);

    // Re-scrape on DOM changes (filter changes, pagination, etc.)
    const observer = new MutationObserver(() => {
      clearTimeout(observer._debounce);
      observer._debounce = setTimeout(doScrape, 3000);
    });
    setTimeout(() => {
      observer.observe(document.body, { childList: true, subtree: true });
    }, 10000);
  }

  // ============================================================
  // VANTAGE SIDE (runs on vantage.amazon.com)
  // ============================================================
  function runVantage() {
    addStyle(`
      @keyframes gca-pulse {
        0%, 100% {
          box-shadow: 0 0 12px 6px rgba(245, 166, 35, 0.9);
          background-color: rgba(245, 166, 35, 0.4) !important;
        }
        50% {
          box-shadow: 0 0 25px 12px rgba(245, 166, 35, 1);
          background-color: rgba(245, 166, 35, 0.7) !important;
        }
      }
      .gca-flag {
        animation: gca-pulse 0.8s ease-in-out infinite !important;
        border: 3px solid #f5a623 !important;
        z-index: 9998 !important;
        position: relative;
      }
      .gca-badge {
        position: absolute;
        top: -10px;
        right: -10px;
        background: #f5a623;
        color: #000;
        font-size: 11px;
        font-weight: 900;
        padding: 2px 7px;
        border-radius: 6px;
        z-index: 10000;
        white-space: nowrap;
        font-family: "Amazon Ember", Arial, sans-serif;
        cursor: pointer;
        text-decoration: none;
        display: block;
        letter-spacing: 0.5px;
        border: 2px solid #000;
        box-shadow: 0 0 8px rgba(245, 166, 35, 0.8);
      }
      .gca-badge:hover {
        background: #ffcc02;
        transform: scale(1.2);
        box-shadow: 0 0 15px rgba(255, 204, 2, 1);
      }

      .gca-counter {
        position: fixed;
        bottom: 12px;
        right: 12px;
        z-index: 99999;
        background: #232f3e;
        color: #fff;
        border-radius: 6px;
        padding: 8px 14px;
        font-family: "Amazon Ember", Arial, sans-serif;
        font-size: 12px;
        border: 2px solid #f5a623;
        box-shadow: 0 2px 12px rgba(0,0,0,0.3);
        display: none;
        cursor: pointer;
      }
      .gca-counter .ct {
        color: #f5a623;
        font-weight: 700;
        font-size: 18px;
      }
      .gca-counter .label {
        color: #aab7c4;
        margin-left: 4px;
      }
      .gca-counter .sync-status {
        font-size: 9px;
        color: #78909c;
        display: block;
        margin-top: 2px;
      }

      .gca-sync-badge {
        position: fixed;
        top: 44px;
        right: 8px;
        z-index: 99999;
        background: #232f3e;
        color: #f5a623;
        border: 2px solid #f5a623;
        border-radius: 6px;
        padding: 4px 10px;
        font-family: "Amazon Ember", Arial, sans-serif;
        font-size: 11px;
        font-weight: 700;
        cursor: pointer;
      }
      .gca-sync-badge:hover { background: #3a4553; }
      .gca-sync-badge.stale { border-color: #ff5252; color: #ff5252; }

      .gca-list-overlay {
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.85);
        z-index: 999999;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .gca-list-modal {
        background: #1a1a2e;
        border: 3px solid #f5a623;
        border-radius: 12px;
        padding: 20px 28px;
        color: #fff;
        font-family: "Amazon Ember", Arial, sans-serif;
        min-width: 350px;
        max-width: 500px;
        max-height: 70vh;
        overflow-y: auto;
      }
      .gca-list-modal h3 {
        color: #f5a623;
        margin: 0 0 12px;
        font-size: 16px;
      }
      .gca-list-modal table {
        width: 100%;
        border-collapse: collapse;
        font-size: 12px;
      }
      .gca-list-modal th {
        background: #232f3e;
        color: #f5a623;
        padding: 4px 8px;
        text-align: left;
      }
      .gca-list-modal td {
        padding: 4px 8px;
        border-bottom: 1px solid #333;
      }
      .gca-list-modal .login { color: #fff; font-weight: 600; }
      .gca-list-modal .station { color: #f5a623; font-weight: 700; }
      .gca-list-modal .close-btn {
        background: #f5a623;
        color: #232f3e;
        border: none;
        border-radius: 6px;
        padding: 8px 20px;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
        margin-top: 12px;
        display: block;
        width: 100%;
      }
    `);

    // --- Helpers ---
    function getWarehouse() {
      return new URLSearchParams(window.location.search).get('warehouse') || '';
    }

    function getZones() {
      const z = new URLSearchParams(window.location.search).get('zones');
      return z ? z.split(',') : [];
    }

    function findStation(id) {
      for (const span of document.querySelectorAll('span.station-id-text')) {
        if (span.textContent.trim() === String(id)) return span.closest('.station-map-item');
      }
      return null;
    }

    // --- Get GCA logins from GM storage ---
    function getGCAData() {
      const raw = storageGet('gca_data', null);
      if (!raw) return { entries: [], logins: [], timestamp: 0, stale: true };
      try {
        const data = JSON.parse(raw);
        const age = Date.now() - (data.timestamp || 0);
        const stale = age > 30 * 60 * 1000;
        return {
          entries: data.entries || data.logins.map(l => ({ login: l, expires: null })),
          logins: data.logins || (data.entries || []).map(e => e.login),
          timestamp: data.timestamp,
          stale
        };
      } catch (e) {
        return { entries: [], logins: [], timestamp: 0, stale: true };
      }
    }

    function getUrgency(expiresISO) {
      if (!expiresISO) return 'unknown';
      const now = new Date();
      const exp = new Date(expiresISO);
      const hoursLeft = (exp - now) / (1000 * 60 * 60);
      if (hoursLeft <= 0) return 'expired';
      if (hoursLeft <= 24) return 'today';
      if (hoursLeft <= 48) return 'tomorrow';
      return 'safe';
    }

    function getUrgencyColor(urgency) {
      switch (urgency) {
        case 'expired': return '#ff0000';
        case 'today': return '#ff3333';
        case 'tomorrow': return '#ff8c00';
        default: return '#f5a623';
      }
    }

    function getUrgencyLabel(urgency) {
      switch (urgency) {
        case 'expired': return 'EXPIRED';
        case 'today': return 'TODAY';
        case 'tomorrow': return '1 DAY';
        default: return 'GCA';
      }
    }

    // --- Fetch station data from Vantage API ---
    function fetchStationData() {
      const wh = getWarehouse();
      const zones = getZones();
      if (!wh || !zones.length) return Promise.resolve([]);

      const now = new Date();
      const start = new Date(now.getTime() - 12 * 60 * 60 * 1000);
      const startISO = start.toISOString().replace(/\.\d+Z$/, '.000Z');

      return Promise.all(zones.map(zone =>
        fetch(`/api/us-east-1/fulfillment?dataset=station_map%2Fstations_with_associate_metrics&startDateTime=${encodeURIComponent(startISO)}&warehouse=${wh}&zone=${zone}`, { credentials: 'include' })
          .then(r => r.json())
          .then(d => Array.isArray(d) ? d : [])
          .catch(() => [])
      )).then(r => r.flat());
    }

    // --- Counter widget ---
    const counter = document.createElement('div');
    counter.className = 'gca-counter';
    counter.innerHTML = '<span class="ct" id="gca-ct">0</span><span class="label">pending GCAs on floor</span><span class="sync-status" id="gca-sync"></span>';
    document.body.appendChild(counter);
    counter.addEventListener('click', showList);

    let lastMatches = [];

    function showList() {
      if (document.querySelector('.gca-list-overlay')) return;
      if (!lastMatches.length) return;

      const ov = document.createElement('div');
      ov.className = 'gca-list-overlay';

      let rows = '';
      // Sort by urgency: expired first, then today, tomorrow, safe
      const urgencyOrder = { expired: 0, today: 1, tomorrow: 2, safe: 3, unknown: 4 };
      const sorted = [...lastMatches].sort((a, b) => (urgencyOrder[a.urgency] || 4) - (urgencyOrder[b.urgency] || 4));

      sorted.forEach(m => {
        const color = getUrgencyColor(m.urgency);
        const expLabel = m.expires
          ? new Date(m.expires).toLocaleDateString()
          : '—';
        rows += `<tr>
          <td class="login">${m.login}</td>
          <td class="station">${m.stationId}</td>
          <td style="color:#aab7c4;font-size:10px">${m.process || '—'}</td>
          <td style="color:${color};font-weight:700">${getUrgencyLabel(m.urgency)}</td>
          <td style="color:#aab7c4;font-size:10px">${expLabel}</td>
          <td><a href="${GCA_EMPLOYEE_URL}${m.login.toLowerCase()}" target="_blank" style="color:#f5a623">Open</a></td>
        </tr>`;
      });

      ov.innerHTML = `
        <div class="gca-list-modal">
          <h3>🟡 Pending GCAs on Floor</h3>
          <table>
            <thead><tr><th>Login</th><th>Station</th><th>Process</th><th>Urgency</th><th>Expires</th><th></th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
          <button class="close-btn" id="gca-close">CLOSE</button>
        </div>
      `;
      document.body.appendChild(ov);
      document.getElementById('gca-close').addEventListener('click', () => ov.remove());
      ov.addEventListener('click', (e) => { if (e.target === ov) ov.remove(); });
    }

    // --- Sync badge ---
    function updateSyncBadge(stale, timestamp) {
      let badge = document.querySelector('.gca-sync-badge');
      if (!badge) {
        badge = document.createElement('div');
        badge.className = 'gca-sync-badge';
        badge.title = 'Click to open Guided Coaching in new tab';
        badge.addEventListener('click', () => {
          window.open(GCA_BASE_URL, '_blank');
        });
        document.body.appendChild(badge);
      }
      badge.classList.toggle('stale', stale);
      if (timestamp) {
        const ago = Math.round((Date.now() - timestamp) / 60000);
        badge.textContent = stale
          ? `🟡 GCA: STALE (${ago}m ago) — click to sync`
          : `🟡 GCA: synced ${ago}m ago`;
      } else {
        badge.textContent = '🟡 GCA: No data — click to sync';
      }
    }

    // --- Main check ---
    async function checkGCAs() {
      const { entries, logins, timestamp, stale } = getGCAData();
      updateSyncBadge(stale, timestamp);

      // Clear previous highlights
      document.querySelectorAll('.gca-flag').forEach(el => el.classList.remove('gca-flag'));
      document.querySelectorAll('.gca-badge').forEach(el => el.remove());

      if (!logins.length) {
        document.getElementById('gca-ct').textContent = '0';
        counter.style.display = 'none';
        lastMatches = [];
        return;
      }

      // Build a map of login -> expiration and process
      const expiresMap = new Map();
      const processMap = new Map();
      entries.forEach(e => {
        expiresMap.set(e.login.toLowerCase(), e.expires);
        processMap.set(e.login.toLowerCase(), e.process);
      });

      // Fetch current station assignments
      const stations = await fetchStationData();
      const gcaSet = new Set(logins.map(l => l.toLowerCase()));

      console.log('[GCA] Looking for these logins:', [...gcaSet]);
      console.log('[GCA] Total stations with users:', stations.filter(s => s.user_id).length);

      let count = 0;
      let expiringTodayCount = 0;
      const matches = [];

      stations.forEach(s => {
        if (!s.user_id) return;
        const login = s.user_id.toLowerCase();

        if (gcaSet.has(login)) {
          const el = findStation(s.station_id);
          if (!el) return;

          const expires = expiresMap.get(login);
          const process = processMap.get(login);
          const urgency = getUrgency(expires);
          const color = getUrgencyColor(urgency);
          const label = getUrgencyLabel(urgency);

          if (urgency === 'today' || urgency === 'expired') expiringTodayCount++;

          el.classList.add('gca-flag');
          el.style.position = 'relative';

          // Override border color based on urgency
          el.style.setProperty('border-color', color, 'important');

          // Add clickable badge with urgency-based color and process info
          const badge = document.createElement('a');
          badge.className = 'gca-badge';
          // Show process abbreviation on badge if available
          const processShort = process
            ? process.replace(/inbound problem solve/i, 'IPS')
                     .replace(/outbound problem solve/i, 'OPS')
                     .replace(/space management/i, 'SM')
                     .replace(/reverse logistics/i, 'RL')
                     .replace(/fc amnesty/i, 'AMN')
                     .replace(/stow/i, 'STW')
                     .replace(/pick/i, 'PCK')
                     .replace(/pack/i, 'PAK')
                     .replace(/ship/i, 'SHP')
                     .replace(/receive/i, 'RCV')
                     .replace(/rebin/i, 'RBN')
                     .replace(/induct/i, 'IND')
                     .replace(/icqa/i, 'ICQA')
                     .replace(/decant/i, 'DCT')
            : null;
          badge.textContent = processShort ? `${label} · ${processShort}` : label;
          badge.href = GCA_EMPLOYEE_URL + login;
          badge.target = '_blank';
          badge.title = `${s.user_id} — pending GCA\nProcess: ${process || 'Unknown'}${expires ? '\nExpires: ' + new Date(expires).toLocaleDateString() : ''}`;
          badge.style.background = color;
          badge.style.color = (urgency === 'today' || urgency === 'expired') ? '#fff' : '#000';
          el.appendChild(badge);

          count++;
          matches.push({
            login: s.user_id,
            stationId: s.station_id,
            zone: s.zone || '',
            urgency,
            expires,
            process
          });
        }
      });

      lastMatches = matches;
      document.getElementById('gca-ct').textContent = count;

      // Update counter label with expiring-today info
      const labelEl = counter.querySelector('.label');
      if (labelEl) {
        labelEl.innerHTML = expiringTodayCount > 0
          ? `pending GCAs on floor <span style="color:#ff3333;font-weight:700">(${expiringTodayCount} expire today!)</span>`
          : 'pending GCAs on floor';
      }

      counter.style.display = count > 0 ? 'block' : 'none';

      const syncEl = document.getElementById('gca-sync');
      if (syncEl) {
        syncEl.textContent = stale
          ? '⚠️ Data may be stale — open GCA page to refresh'
          : `Synced ${Math.round((Date.now() - timestamp) / 60000)}m ago`;
      }
    }

    // --- Manual entry fallback ---
    function addManualEntryOption() {
      const syncBadge = document.querySelector('.gca-sync-badge');
      if (!syncBadge) return;

      syncBadge.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const input = prompt(
          'Paste GCA data (from Copy button on GCA page) or logins (comma separated):\n\n' +
          'If using Tampermonkey, data syncs automatically between tabs.',
          (getGCAData().logins || []).join(', ')
        );
        if (input !== null) {
          // Try to decode as base64 JSON first (from copy button)
          try {
            const decoded = JSON.parse(atob(input.trim()));
            if (decoded.logins || decoded.entries) {
              decoded.timestamp = Date.now();
              storageSet('gca_data', JSON.stringify(decoded));
              checkGCAs();
              return;
            }
          } catch (e) {}

          // Fall back to comma-separated logins
          const logins = input.split(/[\s,]+/).map(l => l.trim().toLowerCase()).filter(l => l.length >= 3);
          const entries = logins.map(l => ({ login: l, expires: null, process: null }));
          const data = { entries, logins, timestamp: Date.now(), source: 'manual' };
          storageSet('gca_data', JSON.stringify(data));
          checkGCAs();
        }
      });
    }

    // --- Init ---
    function init() {
      let polls = 0;
      const poller = setInterval(() => {
        polls++;
        if (document.querySelector('.station-map-item') || polls >= 15) {
          clearInterval(poller);
          checkGCAs();
          addManualEntryOption();
          setInterval(checkGCAs, CHECK_INTERVAL);

          // Watch for floor/zone changes
          let lastZ = getZones().join(',');
          setInterval(() => {
            const z = getZones().join(',');
            if (z !== lastZ) {
              lastZ = z;
              setTimeout(checkGCAs, 3000);
            }
          }, 1000);

          // Watch for map re-renders
          const mc = document.querySelector('.station-map-container, .station-map-body, .station-map');
          if (mc) {
            new MutationObserver(() => {
              if (document.querySelectorAll('.station-map-item').length > 0 &&
                  !document.querySelector('.gca-flag')) {
                checkGCAs();
              }
            }).observe(mc, { childList: true, subtree: true });
          }
        }
      }, 2000);
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }

  // ============================================================
  // ROUTER
  // ============================================================
  if (window.location.hostname === 'guided-coaching.corp.amazon.com') {
    console.log('[GCA] Running on Guided Coaching page:', window.location.href);
    runGCAScraper();
  } else {
    console.log('[GCA] Running on Vantage page:', window.location.href);
    runVantage();
  }
})();
