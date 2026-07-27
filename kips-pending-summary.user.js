// ==UserScript==
// @name         KIPS - Pending Units Summary
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Shows a summary popup with Source FC, Trailer ID, Received time, and Total Pending Items for all open trailers on KIPS Thermometer
// @updateURL    https://raw.githubusercontent.com/nloprete/amazon-ops-tools/main/kips-pending-summary.user.js
// @downloadURL  https://raw.githubusercontent.com/nloprete/amazon-ops-tools/main/kips-pending-summary.user.js
// @match        https://maple-syrup.corp.amazon.com/*/kips/thermometer*
// @connect      afttransshipmenthub-na.aka.amazon.com
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function () {
  'use strict';

  GM_addStyle(`
    .kips-summary-btn {
      position: fixed;
      top: 8px;
      right: 12px;
      z-index: 99999;
      background: #232f3e;
      color: #ff9900;
      border: 2px solid #ff9900;
      border-radius: 6px;
      padding: 6px 14px;
      font-family: "Amazon Ember", Arial, sans-serif;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    }
    .kips-summary-btn:hover { background: #3a4553; }
    .kips-summary-btn.loading { color: #78909c; border-color: #78909c; cursor: wait; }

    .kips-panel {
      position: fixed;
      top: 50px;
      right: 12px;
      z-index: 99998;
      background: #232f3e;
      color: #fff;
      border-radius: 8px;
      padding: 12px 16px;
      font-family: "Amazon Ember", Arial, sans-serif;
      font-size: 11px;
      border: 2px solid #ff9900;
      box-shadow: 0 4px 16px rgba(0,0,0,0.4);
      max-height: 80vh;
      overflow-y: auto;
      min-width: 500px;
      display: none;
    }
    .kips-panel .kp-title {
      color: #ff9900;
      font-weight: 700;
      font-size: 14px;
      margin-bottom: 8px;
      padding-bottom: 6px;
      border-bottom: 2px solid #3a4553;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .kips-panel .kp-close {
      background: none;
      border: none;
      color: #aab7c4;
      font-size: 16px;
      cursor: pointer;
    }
    .kips-panel .kp-close:hover { color: #fff; }
    .kips-panel table {
      width: 100%;
      border-collapse: collapse;
    }
    .kips-panel th {
      background: #3a4553;
      color: #ff9900;
      padding: 4px 8px;
      text-align: left;
      font-size: 10px;
      position: sticky;
      top: 0;
    }
    .kips-panel td {
      padding: 4px 8px;
      border-bottom: 1px solid #3a4553;
      font-size: 11px;
    }
    .kips-panel tr:hover td { background: #3a4553; }
    .kips-panel .pending-high { color: #ff5252; font-weight: 700; }
    .kips-panel .pending-med { color: #ff9800; font-weight: 700; }
    .kips-panel .pending-low { color: #69f0ae; font-weight: 700; }
    .kips-panel .kp-total {
      color: #ff9900;
      font-weight: 700;
      font-size: 13px;
      margin-top: 8px;
      padding-top: 6px;
      border-top: 2px solid #3a4553;
    }
    .kips-panel .kp-progress {
      font-size: 10px;
      color: #78909c;
      margin-top: 4px;
    }
  `);

  // --- Parse trailer rows from the KIPS table ---
  function parseTrailerRows() {
    const trailers = [];
    const rows = document.querySelectorAll('tr');

    rows.forEach(row => {
      const cells = row.querySelectorAll('td');
      if (cells.length < 4) return;

      const sourceFC = cells[0]?.textContent.trim();
      const trailerCell = cells[1];
      const trailerLink = trailerCell?.querySelector('a');
      const trailerId = trailerCell?.textContent.trim().replace(/[^\w]/g, '');
      const href = trailerLink?.getAttribute('href') || '';
      const received = cells[3]?.textContent.trim();

      // Only include rows that look like trailer data
      if (sourceFC && /^[A-Z]{2,4}\d{0,2}$/.test(sourceFC) && trailerId) {
        trailers.push({ sourceFC, trailerId, received, href });
      }
    });

    return trailers;
  }

  // --- Fetch pending items from AFT detail page ---
  function fetchPendingItems(href) {
    return new Promise((resolve) => {
      if (!href) { resolve(null); return; }

      const url = href.startsWith('http') ? href : 'https://afttransshipmenthub-na.aka.amazon.com' + href;

      GM_xmlhttpRequest({
        method: 'GET',
        url: url,
        withCredentials: true,
        onload: (resp) => {
          try {
            const html = resp.responseText || '';
            // Look for "Total Pending:" row with Items column
            // Pattern: Total Pending: ... numbers ... last number is Items
            const match = html.match(/Total Pending:[\s\S]*?(\d[\d,]*)\s*<\/td>\s*<\/tr>/i);
            if (match) {
              resolve(parseInt(match[1].replace(/,/g, ''), 10));
              return;
            }
            // Fallback: look for items number near "Total Pending"
            const match2 = html.match(/Total Pending[\s\S]*?Items[\s\S]*?(\d[\d,]+)/i);
            if (match2) {
              resolve(parseInt(match2[1].replace(/,/g, ''), 10));
              return;
            }
            // Try to find the last number in the Total Pending row
            const match3 = html.match(/Total Pending:<\/td>([\s\S]*?)<\/tr>/i);
            if (match3) {
              const nums = match3[1].match(/\d[\d,]+/g);
              if (nums && nums.length > 0) {
                resolve(parseInt(nums[nums.length - 1].replace(/,/g, ''), 10));
                return;
              }
            }
            resolve(null);
          } catch (e) {
            resolve(null);
          }
        },
        onerror: () => resolve(null),
      });
    });
  }

  // --- Build UI ---
  function buildButton() {
    const btn = document.createElement('button');
    btn.className = 'kips-summary-btn';
    btn.textContent = '📦 Show Pending Summary';
    btn.addEventListener('click', loadSummary);
    document.body.appendChild(btn);
  }

  let panel = null;

  function showPanel(trailers) {
    if (panel) panel.remove();

    panel = document.createElement('div');
    panel.className = 'kips-panel';

    let totalPending = 0;
    let rows = '';
    trailers.forEach(t => {
      if (t.pending !== null) totalPending += t.pending;
      const cls = t.pending === null ? '' : t.pending > 5000 ? 'pending-high' : t.pending > 2000 ? 'pending-med' : 'pending-low';
      rows += `<tr>
        <td>${t.sourceFC}</td>
        <td>${t.trailerId}</td>
        <td>${t.received}</td>
        <td class="${cls}">${t.pending !== null ? t.pending.toLocaleString() : '—'}</td>
      </tr>`;
    });

    panel.innerHTML = `
      <div class="kp-title">
        <span>📦 Pending Units Summary (${trailers.length} trailers)</span>
        <button class="kp-close" id="kp-close">✕</button>
      </div>
      <table>
        <thead><tr><th>Source FC</th><th>Trailer ID</th><th>Received</th><th>Pending Items</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="kp-total">Total Pending Items: ${totalPending.toLocaleString()}</div>
    `;

    document.body.appendChild(panel);
    panel.style.display = 'block';
    document.getElementById('kp-close').addEventListener('click', () => { panel.style.display = 'none'; });
  }

  async function loadSummary() {
    const btn = document.querySelector('.kips-summary-btn');
    btn.textContent = '⏳ Loading...';
    btn.classList.add('loading');

    const trailers = parseTrailerRows();

    // Fetch pending items for each trailer (staggered)
    let completed = 0;
    for (let i = 0; i < trailers.length; i++) {
      const pending = await fetchPendingItems(trailers[i].href);
      trailers[i].pending = pending;
      completed++;

      // Update button with progress
      btn.textContent = `⏳ ${completed}/${trailers.length}`;

      // Show partial results every 5 fetches
      if (completed % 5 === 0 || completed === trailers.length) {
        showPanel(trailers);
      }

      // Small delay between requests
      if (i < trailers.length - 1) {
        await new Promise(r => setTimeout(r, 300));
      }
    }

    btn.textContent = '📦 Show Pending Summary';
    btn.classList.remove('loading');
  }

  // --- Init ---
  function init() {
    let polls = 0;
    const poller = setInterval(() => {
      polls++;
      if (document.querySelectorAll('tr').length > 5 || polls >= 15) {
        clearInterval(poller);
        buildButton();
      }
    }, 2000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
