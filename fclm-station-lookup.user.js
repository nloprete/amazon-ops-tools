// ==UserScript==
// @name         FCLM - Bulk Station Lookup
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Paste a list of logins to see who is on site and their Vantage station number
// @updateURL    https://raw.githubusercontent.com/nloprete/amazon-ops-tools/main/fclm-station-lookup.user.js
// @downloadURL  https://raw.githubusercontent.com/nloprete/amazon-ops-tools/main/fclm-station-lookup.user.js
// @match        https://fclm-portal.amazon.com/*
// @connect      vantage.amazon.com
// @connect      atoz.amazon.work
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

(function () {
  'use strict';

  const VANTAGE_REGION = 'us-east-1';
  const ZONES = ['paKivaA02', 'paKivaA03', 'paKivaA04', 'paKivaA05'];

  GM_addStyle(`
    .sl-panel {
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
      width: 320px;
      max-height: 80vh;
      border: 2px solid #ff9900;
      display: flex;
      flex-direction: column;
      cursor: default;
      resize: both;
      overflow: hidden;
      min-width: 200px;
      min-height: 120px;
    }
    .sl-title {
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
    .sl-title:active { cursor: grabbing; }
    .sl-minimize-btn {
      background: none;
      border: none;
      color: #aab7c4;
      cursor: pointer;
      font-size: 11px;
      padding: 0 3px;
      margin-left: auto;
    }
    .sl-minimize-btn:hover { color: #fff; }
    .sl-panel.minimized .sl-body { display: none; }

    .sl-body {
      display: flex;
      flex-direction: column;
      overflow: hidden;
      flex: 1;
      min-height: 0;
    }

    .sl-input {
      background: #3a4553;
      border: 1px solid #ff9900;
      color: #fff;
      border-radius: 4px;
      padding: 4px 6px;
      width: 100%;
      font-size: 11px;
      font-family: "Amazon Ember", Arial, sans-serif;
      resize: vertical;
      min-height: 80px;
      box-sizing: border-box;
    }
    .sl-input::placeholder { color: #78909c; }
    .sl-input:focus { outline: none; border-color: #ffb74d; background: #455a64; }

    .sl-btn {
      background: #ff9900;
      color: #232f3e;
      border: none;
      border-radius: 4px;
      padding: 4px 8px;
      font-size: 10px;
      font-weight: 700;
      cursor: pointer;
      margin-top: 5px;
      width: 100%;
      font-family: "Amazon Ember", Arial, sans-serif;
    }
    .sl-btn:hover { background: #ffb74d; }
    .sl-btn:disabled { background: #666; cursor: wait; }

    .sl-results {
      margin-top: 6px;
      overflow-y: auto;
      flex: 1;
      font-size: 11px;
      min-height: 0;
    }
    .sl-results table {
      width: 100%;
      border-collapse: collapse;
    }
    .sl-results th {
      background: #3a4553;
      color: #ff9900;
      padding: 3px 5px;
      text-align: left;
      font-size: 10px;
      position: sticky;
      top: 0;
    }
    .sl-filter-row th {
      position: sticky;
      top: 20px;
      background: #3a4553;
      padding: 2px 3px;
    }
    .sl-sort-btn {
      background: none;
      border: 1px solid #556;
      color: #aab7c4;
      border-radius: 3px;
      padding: 1px 4px;
      font-size: 9px;
      width: 100%;
      cursor: pointer;
      font-family: "Amazon Ember", Arial, sans-serif;
    }
    .sl-sort-btn:hover { color: #ff9900; border-color: #ff9900; }
    .sl-sort-btn.active { color: #ff9900; border-color: #ff9900; font-weight: 700; }
    .sl-results td {
      padding: 2px 5px;
      border-bottom: 1px solid #3a4553;
    }
    .sl-results tr:hover td { background: #3a4553; }

    .sl-on-site { color: #69f0ae; font-weight: 700; }
    .sl-off-site { color: #78909c; }
    .sl-station { color: #ff9900; font-weight: 700; }
    .sl-zone { color: #78909c; font-size: 9px; }

    .sl-engage-tags { display: inline-flex; flex-wrap: wrap; gap: 1px; }
    .sl-engage-tag {
      display: inline-block;
      padding: 0 4px;
      border-radius: 2px;
      font-size: 9px;
      font-weight: 600;
      line-height: 14px;
    }
    .sl-engage-tag.adapt { background: #e3f2fd; color: #1565c0; }
    .sl-engage-tag.icare { background: #fff8e1; color: #f57f17; }
    .sl-engage-tag.engage { background: #e0f2f1; color: #00695c; }
    .sl-engage-tag.ww { background: #f1f8e9; color: #558b2f; }
    .sl-engage-tag.pending { background: #ff4d4d; color: #fff; }
    .sl-engage-tag.none { color: #555; }

    .sl-summary {
      font-size: 10px;
      color: #aab7c4;
      margin-top: 4px;
      padding-top: 4px;
      border-top: 1px solid #3a4553;
    }
    .sl-summary span { font-weight: 700; }
    .sl-summary .on { color: #69f0ae; }
    .sl-summary .off { color: #ff5252; }

    .sl-timestamp {
      font-size: 9px;
      color: #78909c;
      text-align: center;
      margin-top: 4px;
    }
  `);

  function getWarehouse() {
    const params = new URLSearchParams(window.location.search);
    let wh = params.get('warehouseId') || params.get('warehouse') || '';
    if (!wh) {
      // Try to find it in the URL path
      const pathMatch = window.location.pathname.match(/\/([A-Z]{3}\d{1,2})\//i);
      if (pathMatch) wh = pathMatch[1].toUpperCase();
    }
    if (!wh) {
      wh = GM_getValue('sl_warehouse', '');
      if (!wh) {
        wh = prompt('Enter your warehouse code (e.g., RIC4, DFW7):') || '';
        if (wh) GM_setValue('sl_warehouse', wh.toUpperCase());
      }
    }
    return wh.toUpperCase();
  }

  function fetchVantageStations(warehouse) {
    return new Promise((resolve) => {
      const loginMap = new Map();
      let completed = 0;
      const now = new Date();
      const start = new Date(now.getTime() - 12 * 60 * 60 * 1000);
      const startISO = start.toISOString().replace(/\.\d+Z$/, '.000Z');

      ZONES.forEach((zone) => {
        const url = `https://vantage.amazon.com/api/${VANTAGE_REGION}/fulfillment`
          + `?dataset=station_map%2Fstations_with_associate_metrics`
          + `&startDateTime=${encodeURIComponent(startISO)}`
          + `&warehouse=${warehouse}`
          + `&zone=${zone}`;

        GM_xmlhttpRequest({
          method: 'GET',
          url: url,
          responseType: 'json',
          withCredentials: true,
          onload: (resp) => {
            try {
              const data = typeof resp.response === 'string'
                ? JSON.parse(resp.response) : resp.response;
              if (Array.isArray(data)) {
                data.forEach((entry) => {
                  if (entry.user_id) {
                    loginMap.set(entry.user_id.toLowerCase(), {
                      stationId: entry.station_id,
                      stationMode: entry.station_mode,
                      userName: entry.user_name,
                      zone: zone,
                    });
                  }
                });
              }
            } catch (e) {}
            completed++;
            if (completed === ZONES.length) resolve(loginMap);
          },
          onerror: () => {
            completed++;
            if (completed === ZONES.length) resolve(loginMap);
          },
        });
      });
    });
  }

  // --- ENGAGE ---
  const MANAGER_EMPLOYEE_IDS = [
    '204259411', '203081425', '206631289', '107686093',
    '206627281', '101754505', '202870053', '204565061',
    '817616', '202458492', '105264173'
  ];

  function fetchEngageData() {
    return new Promise((resolve) => {
      const query = `query fetchOpenConversationsData($withBehindTheSmile: Boolean) {
  filteredRecommendations: employeesWithRecommendationsByOwner(
    input: {
      withBehindTheSmile: $withBehindTheSmile,
      take: 100, skip: 0,
      filters: [
        {type: RECOMMENDATION, operator: NON_NULLISH},
        {type: METRIC, key: "onPremise", operator: NON_NULLISH},
        {type: RECOMMENDATION, dataKey: "sourceName", operator: IN, value: "[\\"ENGAGE\\",\\"ICARE\\",\\"ADAPT\\"]"}
      ],
      ownerEmployeeIds: ${JSON.stringify(MANAGER_EMPLOYEE_IDS)},
      aggregates: [{type: RECOMMENDATION, dataKey: "sourceName", distinct: true}]
    }
  ) {
    total
    hits {
      employeeId
      login
      fullName
      managerLogin
      recommendations {
        sourceName
        subTopic
        data
        dueBefore
        __typename
      }
      __typename
    }
    __typename
  }
}`;

      GM_xmlhttpRequest({
        method: 'POST',
        url: 'https://atoz.amazon.work/apis/AtoZEngageNA/graphql/access',
        headers: { 'Content-Type': 'application/json' },
        data: JSON.stringify({
          operationName: 'fetchOpenConversationsData',
          query: query,
          variables: { withBehindTheSmile: false },
        }),
        withCredentials: true,
        responseType: 'json',
        onload: (resp) => {
          const engageMap = new Map();
          try {
            const json = typeof resp.response === 'string'
              ? JSON.parse(resp.response) : resp.response;
            const hits = json?.data?.filteredRecommendations?.hits || [];
            hits.forEach((emp) => {
              const login = (emp.login || '').toLowerCase();
              if (!login) return;
              const topics = [];
              let hasPending = false;
              (emp.recommendations || []).forEach((rec) => {
                const src = rec.sourceName || '';
                const sub = rec.subTopic || '';
                topics.push(sub ? `${src}:${sub}` : src);
                const ap = rec.data?.externalRecommendationAdditionalProperties?.adaptProperties;
                if (ap?.status === 'PENDING_MEETING_DELIVERY') hasPending = true;
              });
              engageMap.set(login, { topics: [...new Set(topics)], hasPending });
            });
          } catch (e) {
            console.warn('[SL] Engage parse error:', e);
          }
          resolve(engageMap);
        },
        onerror: () => resolve(new Map()),
      });
    });
  }

  function engageTagClass(t) {
    const u = t.toUpperCase();
    if (u.includes('ADAPT')) return 'adapt';
    if (u.includes('ICARE')) return 'icare';
    if (u.includes('ENGAGE')) return 'engage';
    if (u.includes('WORKING_WELL')) return 'ww';
    return 'adapt';
  }

  function buildPanel() {
    if (document.querySelector('.sl-panel')) return;

    const savedLogins = GM_getValue('sl_logins', '');
    const minimized = GM_getValue('sl_minimized', false);
    const savedLeft = GM_getValue('sl_pos_left', '');
    const savedTop = GM_getValue('sl_pos_top', '');

    const panel = document.createElement('div');
    panel.className = `sl-panel${minimized ? ' minimized' : ''}`;
    if (savedLeft && savedTop) {
      panel.style.left = savedLeft;
      panel.style.top = savedTop;
      panel.style.right = 'auto';
    }
    panel.innerHTML = `
      <div class="sl-title">
        📍 Station Lookup
        <button class="sl-minimize-btn">${minimized ? '▼' : '▲'}</button>
      </div>
      <div class="sl-body">
        <textarea class="sl-input" id="sl-logins" placeholder="Paste logins (one per line, comma, or space separated)">${savedLogins}</textarea>
        <button class="sl-btn" id="sl-search">🔍 Look Up Stations</button>
        <div class="sl-results" id="sl-results"></div>
        <div class="sl-timestamp" id="sl-timestamp"></div>
      </div>
    `;

    document.body.appendChild(panel);

    // Minimize
    panel.querySelector('.sl-minimize-btn').addEventListener('click', () => {
      panel.classList.toggle('minimized');
      const isMin = panel.classList.contains('minimized');
      panel.querySelector('.sl-minimize-btn').textContent = isMin ? '▼' : '▲';
      GM_setValue('sl_minimized', isMin);
    });

    // Drag
    const titleBar = panel.querySelector('.sl-title');
    let isDragging = false, offsetX = 0, offsetY = 0;

    titleBar.addEventListener('mousedown', (e) => {
      if (e.target.classList.contains('sl-minimize-btn')) return;
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
        GM_setValue('sl_pos_left', panel.style.left);
        GM_setValue('sl_pos_top', panel.style.top);
      }
    }, true);

    // Search
    document.getElementById('sl-search').addEventListener('click', doSearch);
  }

  async function doSearch() {
    const btn = document.getElementById('sl-search');
    const input = document.getElementById('sl-logins');
    const resultsEl = document.getElementById('sl-results');
    const tsEl = document.getElementById('sl-timestamp');

    const raw = input.value.trim();
    GM_setValue('sl_logins', raw);

    if (!raw) {
      resultsEl.innerHTML = '<div style="color:#78909c;padding:4px">Enter logins above</div>';
      return;
    }

    // Parse logins — support newline, comma, space, tab
    const logins = raw.split(/[\n,\s\t]+/).map(l => l.trim().toLowerCase()).filter(l => l.length >= 3);

    btn.disabled = true;
    btn.textContent = '⏳ Loading...';
    resultsEl.innerHTML = '';

    const warehouse = getWarehouse();
    const [vantageMap, engageMap] = await Promise.all([
      fetchVantageStations(warehouse),
      fetchEngageData(),
    ]);

    let onSite = 0;
    let offSite = 0;

    let rows = '';
    logins.forEach((login) => {
      const info = vantageMap.get(login);
      const eng = engageMap.get(login);

      let engHtml = '<span class="sl-engage-tag none">—</span>';
      if (eng && eng.topics.length > 0) {
        engHtml = '<div class="sl-engage-tags">';
        if (eng.hasPending) engHtml += '<span class="sl-engage-tag pending">!</span>';
        eng.topics.forEach(t => { engHtml += `<span class="sl-engage-tag ${engageTagClass(t)}">${t}</span>`; });
        engHtml += '</div>';
      }

      if (info) {
        onSite++;
        rows += `<tr>
          <td class="sl-on-site">${login}</td>
          <td><span class="sl-station">${info.stationId}</span></td>
          <td><span class="sl-zone">${info.zone}</span></td>
          <td>${engHtml}</td>
        </tr>`;
      } else {
        offSite++;
        rows += `<tr>
          <td class="sl-off-site">${login}</td>
          <td class="sl-off-site">—</td>
          <td class="sl-off-site">—</td>
          <td>${engHtml}</td>
        </tr>`;
      }
    });

    resultsEl.innerHTML = `
      <div class="sl-summary">
        <span class="on">${onSite}</span> on site &nbsp;|&nbsp; <span class="off">${offSite}</span> not found &nbsp;|&nbsp; ${logins.length} total
      </div>
      <table>
        <thead>
          <tr><th>Login</th><th>Station</th><th>Zone</th><th>Engage</th></tr>
          <tr class="sl-filter-row">
            <th><button class="sl-sort-btn" id="sl-sort-login">A → Z</button></th>
            <th><button class="sl-sort-btn" id="sl-sort-station">0 → 9</button></th>
            <th></th>
            <th></th>
          </tr>
        </thead>
        <tbody id="sl-tbody">${rows}</tbody>
      </table>
    `;

    // Sort logic
    function sortTable(colIdx, type) {
      const tbody = document.getElementById('sl-tbody');
      if (!tbody) return;
      const rowsArr = [...tbody.querySelectorAll('tr')];
      const btn = colIdx === 0 ? document.getElementById('sl-sort-login') : document.getElementById('sl-sort-station');
      const asc = !btn.classList.contains('active') || btn.dataset.dir === 'desc';
      btn.dataset.dir = asc ? 'asc' : 'desc';

      // Reset other button
      resultsEl.querySelectorAll('.sl-sort-btn').forEach(b => { if (b !== btn) { b.classList.remove('active'); b.dataset.dir = ''; }});
      btn.classList.add('active');

      if (colIdx === 0) btn.textContent = asc ? 'A → Z' : 'Z → A';
      else btn.textContent = asc ? '0 → 9' : '9 → 0';

      rowsArr.sort((a, b) => {
        const aText = (a.querySelectorAll('td')[colIdx]?.textContent || '').trim();
        const bText = (b.querySelectorAll('td')[colIdx]?.textContent || '').trim();
        if (type === 'alpha') {
          return asc ? aText.localeCompare(bText) : bText.localeCompare(aText);
        } else {
          const aNum = parseInt(aText, 10) || 99999;
          const bNum = parseInt(bText, 10) || 99999;
          return asc ? aNum - bNum : bNum - aNum;
        }
      });
      rowsArr.forEach(r => tbody.appendChild(r));
    }

    document.getElementById('sl-sort-login').addEventListener('click', () => sortTable(0, 'alpha'));
    document.getElementById('sl-sort-station').addEventListener('click', () => sortTable(1, 'num'));

    tsEl.textContent = `Updated ${new Date().toLocaleTimeString()}`;
    btn.disabled = false;
    btn.textContent = '🔍 Look Up Stations';
  }

  // Init
  function init() {
    let polls = 0;
    const poller = setInterval(() => {
      polls++;
      if (document.body || polls >= 10) {
        clearInterval(poller);
        buildPanel();
      }
    }, 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
