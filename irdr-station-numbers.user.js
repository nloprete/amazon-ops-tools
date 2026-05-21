// ==UserScript==
// @name         IRDR STU - Station Numbers + Engage Status
// @namespace    http://tampermonkey.net/
// @version      5.2
// @description  Shows AA station numbers (Vantage), STU completion leaderboard, and overdue week tracking on IRDR STU
// @updateURL    https://raw.githubusercontent.com/nloprete/amazon-ops-tools/main/irdr-station-numbers.user.js
// @downloadURL  https://raw.githubusercontent.com/nloprete/amazon-ops-tools/main/irdr-station-numbers.user.js
// @match        https://ont-base.corp.amazon.com/*/icqa/irdr/stu*
// @connect      vantage.amazon.com
// @connect      atoz.amazon.work
// @connect      ont-base.corp.amazon.com
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function () {
  'use strict';

  // --- CONFIG ---
  const VANTAGE_REGION = 'us-east-1';
  const ZONES = ['paKivaA02', 'paKivaA03', 'paKivaA04', 'paKivaA05'];

  // Manager employee IDs for the Engage GraphQL query.
  // Update this list if your manager team changes.
  const MANAGER_EMPLOYEE_IDS = [
    '204259411', '203081425', '206631289', '107686093',
    '206627281', '101754505', '202870053', '204565061',
    '817616', '202458492', '105264173'
  ];

  const ENGAGE_GRAPHQL_URL = 'https://atoz.amazon.work/apis/AtoZEngageNA/graphql/access';

  // --- STYLES ---
  GM_addStyle(`
    /* --- Banner --- */
    .irdr-station-banner {
      background: #232f3e;
      color: #fff;
      padding: 8px 16px;
      font-size: 14px;
      font-family: "Amazon Ember", Arial, sans-serif;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 8px;
      border-bottom: 3px solid #ff9900;
      position: sticky;
      top: 0;
      z-index: 9999;
    }
    .irdr-station-banner .station-code {
      color: #ff9900;
      font-weight: 700;
      font-size: 20px;
      letter-spacing: 1px;
    }
    .irdr-station-banner .stats {
      display: flex;
      gap: 14px;
      font-size: 13px;
      flex-wrap: wrap;
      align-items: center;
    }
    .irdr-station-banner .stat-item {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .irdr-station-banner .stat-count {
      font-weight: 700;
      font-size: 16px;
    }
    .irdr-station-banner .stat-count.pending { color: #ff4d4d; }
    .irdr-station-banner .stat-count.complete { color: #4caf50; }
    .irdr-station-banner .stat-count.total { color: #ff9900; }
    .irdr-station-banner .service-status {
      font-size: 11px;
      color: #aaa;
    }
    .irdr-station-banner .service-status.loaded { color: #4caf50; }
    .irdr-station-banner .service-status.error { color: #ff4d4d; }

    /* --- Pending Summary Panel --- */
    .irdr-pending-summary {
      background: #fff3e0;
      border: 2px solid #ff9900;
      border-radius: 6px;
      padding: 10px 14px;
      margin: 10px 15px;
      font-family: "Amazon Ember", Arial, sans-serif;
    }
    .irdr-pending-summary h4 {
      margin: 0 0 8px 0;
      color: #232f3e;
      font-size: 14px;
    }
    .irdr-pending-summary table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    .irdr-pending-summary th {
      background: #232f3e;
      color: #ff9900;
      padding: 4px 8px;
      text-align: left;
      font-size: 12px;
    }
    .irdr-pending-summary td {
      padding: 4px 8px;
      border-bottom: 1px solid #ddd;
    }
    .irdr-pending-summary tr:hover td {
      background: #fff8e1;
    }

    /* --- Badges & Tags --- */
    .irdr-pending-badge {
      background: #ff4d4d;
      color: #fff;
      font-weight: 700;
      padding: 1px 6px;
      border-radius: 8px;
      font-size: 11px;
      text-decoration: none;
    }
    .irdr-vantage-station {
      display: inline-block;
      background: #232f3e;
      color: #ff9900;
      font-weight: 700;
      padding: 1px 5px;
      border-radius: 3px;
      font-size: 10px;
      letter-spacing: 0.3px;
    }
    .irdr-vantage-station.no-station {
      background: none;
      color: #ccc;
      font-weight: 400;
      font-size: 9px;
    }
    .irdr-engage-tags {
      display: inline-flex;
      flex-wrap: wrap;
      gap: 2px;
    }
    .irdr-engage-tag {
      display: inline-block;
      padding: 0px 5px;
      border-radius: 3px;
      font-size: 10px;
      font-weight: 600;
      line-height: 16px;
    }
    .irdr-engage-tag.adapt-productivity { background: #e3f2fd; color: #1565c0; }
    .irdr-engage-tag.adapt-quality { background: #e8f5e9; color: #2e7d32; }
    .irdr-engage-tag.adapt-attendance { background: #fff3e0; color: #e65100; }
    .irdr-engage-tag.adapt-behavioral { background: #fce4ec; color: #c62828; }
    .irdr-engage-tag.adapt { background: #e3f2fd; color: #1565c0; }
    .irdr-engage-tag.working-well { background: #f1f8e9; color: #558b2f; }
    .irdr-engage-tag.icare { background: #fff8e1; color: #f57f17; }
    .irdr-engage-tag.engage { background: #e0f2f1; color: #00695c; }
    .irdr-engage-tag.pending { background: #ff4d4d; color: #fff; }
    .irdr-engage-tag.none { background: none; color: #ccc; font-size: 9px; }

    /* --- Completion Leaderboard --- */
    .irdr-completion-board {
      background: #e8f5e9;
      border: 2px solid #4caf50;
      border-radius: 6px;
      padding: 10px 14px;
      margin: 10px 15px;
      font-family: "Amazon Ember", Arial, sans-serif;
    }
    .irdr-completion-board h4 {
      margin: 0 0 8px 0;
      color: #2e7d32;
      font-size: 14px;
    }
    .irdr-completion-board .week-range {
      font-size: 11px;
      color: #555;
      font-weight: 400;
    }
    .irdr-completion-board table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    .irdr-completion-board th {
      background: #2e7d32;
      color: #fff;
      padding: 4px 8px;
      text-align: left;
      font-size: 12px;
    }
    .irdr-completion-board td {
      padding: 4px 8px;
      border-bottom: 1px solid #c8e6c9;
    }
    .irdr-completion-board tr:hover td {
      background: #c8e6c9;
    }
    .irdr-completion-board .mgr-name {
      font-weight: 700;
      color: #1b5e20;
    }
    .irdr-completion-board .count {
      font-weight: 700;
      font-size: 14px;
      color: #2e7d32;
    }
    .irdr-completion-board .bar {
      background: #a5d6a7;
      height: 16px;
      border-radius: 3px;
      min-width: 4px;
    }
    .irdr-completion-board .date-controls {
      display: flex;
      gap: 8px;
      align-items: center;
      margin-bottom: 8px;
      font-size: 11px;
    }
    .irdr-completion-board .date-controls label {
      color: #555;
    }
    .irdr-completion-board .date-controls input {
      border: 1px solid #4caf50;
      border-radius: 4px;
      padding: 2px 6px;
      font-size: 11px;
      font-family: "Amazon Ember", Arial, sans-serif;
    }
    .irdr-row-incomplete {
      background: #fff0f0 !important;
    }
    .irdr-row-incomplete:hover {
      background: #ffe0e0 !important;
    }

    /* Make injected columns compact */
    .irdr-station-header, .irdr-engage-header {
      font-size: 10px !important;
      padding: 2px 3px !important;
      white-space: nowrap;
      text-align: center;
      width: 1%;
    }
    .irdr-station-cell, .irdr-engage-cell {
      padding: 2px 3px !important;
      white-space: nowrap;
      text-align: center;
      width: 1%;
    }

    /* Ensure STU tables stay tight */
    table.table.table-bordered {
      table-layout: auto;
      width: auto;
      max-width: 100%;
    }
    table.table.table-bordered td,
    table.table.table-bordered th {
      padding: 2px 4px;
      font-size: 11px;
      vertical-align: middle;
    }

    /* Prevent page overflow — allow horizontal scroll on content area */
    .col-sm-10 {
      overflow-x: auto;
    }
  `);

  function getStationFromURL() {
    const match = window.location.pathname.match(/\/en\/([A-Z0-9]+)\/icqa/i);
    return match ? match[1].toUpperCase() : null;
  }

  // --- VANTAGE ---
  function fetchVantageData(warehouse) {
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
                      managerId: entry.manager_id,
                      zone: zone,
                    });
                  }
                });
              }
            } catch (e) {
              console.warn(`[IRDR] Vantage error (${zone}):`, e);
            }
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

  // --- ENGAGE (GraphQL) ---
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
        qualifiedSubTopic
        dueBefore
        data
        __typename
      }
      __typename
    }
    __typename
  }
}`;

      GM_xmlhttpRequest({
        method: 'POST',
        url: ENGAGE_GRAPHQL_URL,
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
              let dueSoon = false;

              (emp.recommendations || []).forEach((rec) => {
                const source = rec.sourceName || '';
                const sub = rec.subTopic || '';
                topics.push(sub ? `${source}: ${sub}` : source);

                const adaptProps = rec.data?.externalRecommendationAdditionalProperties?.adaptProperties;
                if (adaptProps?.status === 'PENDING_MEETING_DELIVERY') hasPending = true;

                if (rec.dueBefore) {
                  const diff = (new Date(rec.dueBefore) - new Date()) / 36e5;
                  if (diff < 24 && diff > -24) dueSoon = true;
                }
              });

              engageMap.set(login, {
                name: emp.fullName,
                managerLogin: emp.managerLogin,
                topics: [...new Set(topics)],
                hasPending,
                dueSoon,
              });
            });
          } catch (e) {
            console.warn('[IRDR] Engage parse error:', e);
          }
          resolve(engageMap);
        },
        onerror: () => resolve(new Map()),
      });
    });
  }

  // --- HELPERS ---
  function tagClass(topic) {
    const t = topic.toUpperCase();
    if (t.includes('PRODUCTIVITY')) return 'adapt-productivity';
    if (t.includes('QUALITY')) return 'adapt-quality';
    if (t.includes('ATTENDANCE')) return 'adapt-attendance';
    if (t.includes('BEHAVIORAL')) return 'adapt-behavioral';
    if (t.includes('ADAPT')) return 'adapt';
    if (t.includes('WORKING_WELL')) return 'working-well';
    if (t.includes('ICARE')) return 'icare';
    if (t.includes('ENGAGE')) return 'engage';
    return 'adapt';
  }

  function engageHtml(topics, hasPending, dueSoon) {
    if (!topics.length) return '<span class="irdr-engage-tag none">—</span>';
    let h = '';
    if (hasPending) h += '<span class="irdr-engage-tag pending">PENDING</span>';
    if (dueSoon) h += '<span class="irdr-engage-tag pending">DUE</span>';
    topics.forEach((t) => { h += `<span class="irdr-engage-tag ${tagClass(t)}">${t}</span>`; });
    return `<div class="irdr-engage-tags">${h}</div>`;
  }

  // --- BUILD UI ---
  function parseStuTables(vantageMap, engageMap) {
    const tables = document.querySelectorAll('table.table');
    const associates = [];

    tables.forEach((table) => {
      const headers = [...table.querySelectorAll('th')].map((h) => h.textContent.trim().toLowerCase());
      if (!headers.some((h) => h.includes('login')) || !headers.some((h) => h.includes('stu'))) return;

      const thead = table.querySelector('thead tr');
      if (thead && !thead.querySelector('.irdr-station-header')) {
        const th1 = document.createElement('th');
        th1.className = 'irdr-station-header';
        th1.textContent = 'Station';
        thead.appendChild(th1);
      }

      table.querySelectorAll('tbody tr').forEach((row) => {
        const cells = row.querySelectorAll('td');
        if (cells.length < 3) return;

        const login = cells[0].textContent.trim().toLowerCase();
        const manager = cells[1].textContent.trim();
        const statusEl = cells[2].querySelector('.badge');
        const status = statusEl ? statusEl.textContent.trim() : cells[2].textContent.trim();
        const href = cells[2].querySelector('a')?.getAttribute('href') || '';

        const v = vantageMap.get(login);
        const e = engageMap.get(login);

        if (!row.querySelector('.irdr-station-cell')) {
          const td = document.createElement('td');
          td.className = 'irdr-station-cell';
          td.innerHTML = v
            ? `<span class="irdr-vantage-station">${v.stationId}</span>`
            : `<span class="irdr-vantage-station no-station">—</span>`;
          row.appendChild(td);
        }

        if (/incomplete/i.test(status)) row.classList.add('irdr-row-incomplete');

        associates.push({
          login, manager, status, href,
          stationId: v?.stationId || null,
          zone: v?.zone || null,
          topics: e?.topics || [],
          hasPending: e?.hasPending || false,
          dueSoon: e?.dueSoon || false,
        });
      });
    });

    return associates;
  }

  function buildBanner(station, assoc, vOk, eOk) {
    if (document.querySelector('.irdr-station-banner')) return;

    const pend = assoc.filter((a) => /incomplete/i.test(a.status));
    const comp = assoc.filter((a) => /^complete$/i.test(a.status));
    const wEng = assoc.filter((a) => a.topics.length > 0);
    const wPend = assoc.filter((a) => a.hasPending);

    const el = document.createElement('div');
    el.className = 'irdr-station-banner';
    el.innerHTML = `
      <div>📍 <span class="station-code">${station || '?'}</span> IRDR STU</div>
      <div class="stats">
        <div class="stat-item">Pending: <span class="stat-count pending">${pend.length}</span></div>
        <div class="stat-item">Done: <span class="stat-count complete">${comp.length}</span></div>
        <div class="stat-item">AAs: <span class="stat-count total">${assoc.length}</span></div>
        <div class="stat-item">Engage: <span class="stat-count" style="color:#1565c0">${wEng.length}</span>
          ${wPend.length ? `(<span style="color:#ff4d4d">${wPend.length}⚠</span>)` : ''}</div>
        <div class="stat-item">
          <span class="service-status ${vOk ? 'loaded' : 'error'}">V${vOk ? '✓' : '✗'}</span>
          <span class="service-status ${eOk ? 'loaded' : 'error'}">E${eOk ? '✓' : '✗'}</span>
        </div>
      </div>`;
    document.body.insertBefore(el, document.body.firstChild);
  }

  function buildPendingSummary(station, assoc) {
    if (document.querySelector('.irdr-pending-summary')) return;
    const pending = assoc.filter((a) => /incomplete/i.test(a.status));
    if (!pending.length) return;

    const byMgr = {};
    pending.forEach((a) => { (byMgr[a.manager] ??= []).push(a); });

    let rows = '';
    Object.keys(byMgr).sort((a, b) => byMgr[b].length - byMgr[a].length).forEach((mgr) => {
      byMgr[mgr].forEach((aa, i) => {
        const link = aa.href
          ? `<a href="${aa.href}" class="irdr-pending-badge">Incomplete</a>`
          : `<span class="irdr-pending-badge">Incomplete</span>`;
        const st = aa.stationId
          ? `<span class="irdr-vantage-station">${aa.stationId}</span>`
          : `<span class="irdr-vantage-station no-station">—</span>`;
        rows += `<tr data-href="${aa.href || ''}">
          ${i === 0 ? `<td rowspan="${byMgr[mgr].length}" style="vertical-align:middle;font-weight:700">${mgr} (${byMgr[mgr].length})</td>` : ''}
          <td>${aa.login}</td><td>${st}</td><td>${aa.zone || '—'}</td><td class="irdr-week-cell">...</td><td>${link}</td></tr>`;
      });
    });

    const el = document.createElement('div');
    el.className = 'irdr-pending-summary';
    el.innerHTML = `
      <h4>⚠️ Pending STUs — ${station || ''}</h4>
      <table>
        <thead><tr><th>Manager</th><th>Login</th><th>Station</th><th>Zone</th><th>Week</th><th>Status</th></tr></thead>
        <tbody id="irdr-pending-tbody">${rows}</tbody>
      </table>`;

    const target = document.querySelector('.col-sm-10') || document.querySelector('.container-fluid');
    if (target) target.insertBefore(el, target.firstChild);

    // Check overdue STUs in background — bold rows older than 1 week, fill in week number
    async function checkOverdue() {
      const tbody = document.getElementById('irdr-pending-tbody');
      if (!tbody) return;

      // Get current week number
      const now = new Date();
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      const currentWeek = Math.ceil(((now - startOfYear) / 86400000 + startOfYear.getDay() + 1) / 7);

      const rowsWithHref = tbody.querySelectorAll('tr[data-href]');
      for (const row of rowsWithHref) {
        const href = row.dataset.href;
        if (!href) continue;
        const url = href.startsWith('http') ? href : window.location.origin + href;
        const weekCell = row.querySelector('.irdr-week-cell');
        try {
          await new Promise((resolve) => {
            GM_xmlhttpRequest({
              method: 'GET',
              url: url,
              onload: (resp) => {
                const html = resp.responseText || '';
                // Look for IRDR Count Date (format: 2026-04-27)
                const dateMatch = html.match(/IRDR Count Date[\s\S]*?(\d{4}-\d{2}-\d{2})/i) ||
                                  html.match(/(\d{4}-\d{2}-\d{2})\s+\d{2}:\d{2}:\d{2}/);
                if (dateMatch) {
                  const stuDate = new Date(dateMatch[1]);
                  const stuStartOfYear = new Date(stuDate.getFullYear(), 0, 1);
                  const stuWeek = Math.ceil(((stuDate - stuStartOfYear) / 86400000 + stuStartOfYear.getDay() + 1) / 7);

                  // Fill in week number
                  if (weekCell) weekCell.textContent = 'Wk ' + stuWeek;

                  // If STU week is less than current week, it's overdue — bold red
                  if (stuWeek < currentWeek) {
                    row.style.fontWeight = '900';
                    row.style.background = '#ffebee';
                    row.querySelectorAll('td').forEach(td => {
                      td.style.fontWeight = '900';
                      td.style.color = '#c62828';
                    });
                  }
                } else {
                  if (weekCell) weekCell.textContent = '—';
                }
                resolve();
              },
              onerror: () => {
                if (weekCell) weekCell.textContent = '—';
                resolve();
              },
            });
          });
          await new Promise(r => setTimeout(r, 200));
        } catch (e) {}
      }
    }

    checkOverdue();
  }

  // --- Completion Leaderboard ---
  function getSundayRange() {
    const now = new Date();
    const day = now.getDay(); // 0=Sun
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - day);
    startOfWeek.setHours(0, 0, 0, 0);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);
    return { start: startOfWeek, end: endOfWeek };
  }

  function formatDateInput(d) {
    return d.toISOString().split('T')[0];
  }

  // Fetch individual STU detail page to get "Submitted By" login
  function fetchStuSubmitter(href) {
    return new Promise((resolve) => {
      const url = href.startsWith('http') ? href : window.location.origin + href;
      GM_xmlhttpRequest({
        method: 'GET',
        url: url,
        onload: (resp) => {
          try {
            const html = resp.responseText || '';
            // HTML structure: <strong>Submitted By</strong><br>loginhere</p>
            const match = html.match(/Submitted By<\/strong><br\s*\/?>([^<]+)/i);
            if (match) {
              resolve(match[1].trim().toLowerCase());
              return;
            }
            // Fallback: Updated By
            const match2 = html.match(/Updated By<\/strong><br\s*\/?>([^<]+)/i);
            if (match2) {
              resolve(match2[1].trim().toLowerCase());
              return;
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

  function buildCompletionLeaderboard(station, assoc) {
    if (document.querySelector('.irdr-completion-board')) return;

    const completed = assoc.filter((a) => /^complete$/i.test(a.status));
    if (!completed.length) return;

    const { start, end } = getSundayRange();

    const el = document.createElement('div');
    el.className = 'irdr-completion-board';
    el.innerHTML = `
      <h4>✅ STU Completions <span class="week-range" id="irdr-week-label">(${start.toLocaleDateString()} – ${end.toLocaleDateString()})</span></h4>
      <div class="date-controls">
        <label>From:</label>
        <input type="date" id="irdr-lb-start" value="${formatDateInput(start)}">
        <label>To:</label>
        <input type="date" id="irdr-lb-end" value="${formatDateInput(end)}">
        <button id="irdr-lb-refresh" style="background:#4caf50;color:#fff;border:none;border-radius:4px;padding:3px 10px;font-size:11px;font-weight:700;cursor:pointer;font-family:'Amazon Ember',Arial,sans-serif;">↻ Refresh</button>
      </div>
      <table>
        <thead><tr><th>Completed By</th><th>Count</th><th></th></tr></thead>
        <tbody id="irdr-lb-body"><tr><td colspan="3" style="color:#78909c;text-align:center">⏳ Loading submitter data...</td></tr></tbody>
      </table>
      <div style="font-size:10px;color:#78909c;margin-top:6px" id="irdr-lb-footer">Fetching ${completed.length} STU details...</div>
    `;

    const target = document.querySelector('.col-sm-10') || document.querySelector('.container-fluid');
    if (target) target.insertBefore(el, target.firstChild);

    // Fetch submitters in background (staggered to avoid hammering server)
    const submitters = []; // [{login, submitter, href}, ...]
    let fetched = 0;

    function renderTable() {
      const bySubmitter = {};
      submitters.forEach((s) => {
        if (s && s.submitter) {
          if (!bySubmitter[s.submitter]) bySubmitter[s.submitter] = [];
          bySubmitter[s.submitter].push(s);
        }
      });

      const sorted = Object.entries(bySubmitter).sort((a, b) => b[1].length - a[1].length);
      const max = sorted.length > 0 ? sorted[0][1].length : 1;

      let rows = '';
      sorted.forEach(([login, entries], idx) => {
        const count = entries.length;
        const pct = Math.round((count / max) * 100);
        const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '';
        rows += `<tr>
          <td class="mgr-name">${medal} ${login}</td>
          <td class="count"><a href="#" class="irdr-lb-detail" data-submitter="${login}" style="color:#2e7d32;text-decoration:underline;cursor:pointer;">${count}</a></td>
          <td><div class="bar" style="width:${pct}%"></div></td>
        </tr>`;
      });

      if (!rows) rows = '<tr><td colspan="3" style="color:#78909c;text-align:center">No data yet</td></tr>';

      const tbody = document.getElementById('irdr-lb-body');
      if (tbody) {
        tbody.innerHTML = rows;
        // Attach click handlers for detail links
        tbody.querySelectorAll('.irdr-lb-detail').forEach(link => {
          link.addEventListener('click', (e) => {
            e.preventDefault();
            const sub = link.dataset.submitter;
            const entries = bySubmitter[sub] || [];
            showSubmitterDetail(sub, entries);
          });
        });
      }

      const footer = document.getElementById('irdr-lb-footer');
      if (footer) footer.textContent = `Total: ${submitters.filter(s => s && s.submitter).length} completed — ${station || ''} (${fetched}/${completed.length} fetched)`;
    }

    function showSubmitterDetail(submitter, entries) {
      // Remove existing overlay if any
      const existing = document.querySelector('.irdr-lb-overlay');
      if (existing) existing.remove();

      let rows = '';
      entries.forEach(e => {
        rows += `<tr>
          <td>${e.login}</td>
          <td>${e.manager || '—'}</td>
          <td><a href="${e.href}" target="_blank" style="color:#2e7d32;">View STU</a></td>
        </tr>`;
      });

      const ov = document.createElement('div');
      ov.className = 'irdr-lb-overlay';
      ov.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:999999;display:flex;align-items:center;justify-content:center;';
      ov.innerHTML = `
        <div style="background:#fff;border:3px solid #4caf50;border-radius:12px;padding:20px 28px;min-width:350px;max-width:500px;max-height:70vh;overflow-y:auto;font-family:'Amazon Ember',Arial,sans-serif;">
          <h4 style="color:#2e7d32;margin:0 0 12px;">✅ STUs Completed by ${submitter} (${entries.length})</h4>
          <table style="width:100%;border-collapse:collapse;font-size:12px;">
            <thead><tr><th style="background:#2e7d32;color:#fff;padding:4px 8px;text-align:left;">AA Login</th><th style="background:#2e7d32;color:#fff;padding:4px 8px;text-align:left;">Manager</th><th style="background:#2e7d32;color:#fff;padding:4px 8px;text-align:left;"></th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
          <button id="irdr-lb-close" style="background:#4caf50;color:#fff;border:none;border-radius:6px;padding:8px 20px;font-size:13px;font-weight:700;cursor:pointer;margin-top:12px;display:block;width:100%;">CLOSE</button>
        </div>
      `;
      document.body.appendChild(ov);
      document.getElementById('irdr-lb-close').addEventListener('click', () => ov.remove());
      ov.addEventListener('click', (e) => { if (e.target === ov) ov.remove(); });
    }

    async function fetchAll() {
      for (let i = 0; i < completed.length; i++) {
        const href = completed[i].href;
        if (!href) {
          submitters.push(null);
          fetched++;
          continue;
        }
        const submitter = await fetchStuSubmitter(href);
        submitters.push({ login: completed[i].login, manager: completed[i].manager, href, submitter });
        fetched++;
        // Update table every 5 fetches or at the end
        if (fetched % 5 === 0 || fetched === completed.length) {
          renderTable();
        }
        // Small delay to avoid hammering the server
        if (i < completed.length - 1) {
          await new Promise(r => setTimeout(r, 300));
        }
      }
    }

    fetchAll();

    // Date change handlers
    const startInput = document.getElementById('irdr-lb-start');
    const endInput = document.getElementById('irdr-lb-end');
    const label = document.getElementById('irdr-week-label');

    function onDateChange() {
      const s = new Date(startInput.value + 'T00:00:00');
      const e = new Date(endInput.value + 'T23:59:59');
      label.textContent = `(${s.toLocaleDateString()} – ${e.toLocaleDateString()})`;
      // Note: date filtering would require the STU detail pages to have dates
      // For now the leaderboard shows all completed STUs visible on the current page
    }

    startInput.addEventListener('change', onDateChange);
    endInput.addEventListener('change', onDateChange);

    // Refresh button — re-fetches all STU detail pages
    document.getElementById('irdr-lb-refresh').addEventListener('click', () => {
      const tbody = document.getElementById('irdr-lb-body');
      const footer = document.getElementById('irdr-lb-footer');
      if (tbody) tbody.innerHTML = '<tr><td colspan="3" style="color:#78909c;text-align:center">⏳ Refreshing...</td></tr>';
      if (footer) footer.textContent = 'Fetching...';
      submitters.length = 0;
      fetched = 0;
      fetchAll();
    });
  }

  // --- INIT ---
  async function init() {
    const station = getStationFromURL();
    let vMap = new Map(), eMap = new Map(), vOk = false, eOk = false;

    const [vR, eR] = await Promise.allSettled([
      station ? fetchVantageData(station) : Promise.resolve(new Map()),
      fetchEngageData(),
    ]);

    if (vR.status === 'fulfilled') { vMap = vR.value; vOk = vMap.size > 0; }
    if (eR.status === 'fulfilled') { eMap = eR.value; eOk = eMap.size > 0; }

    let polls = 0;
    const poller = setInterval(() => {
      polls++;
      if (document.querySelectorAll('table.table').length > 2 || polls >= 15) {
        clearInterval(poller);
        const data = parseStuTables(vMap, eMap);
        buildBanner(station, data, vOk, eOk);
        buildPendingSummary(station, data);
        buildCompletionLeaderboard(station, data);

        new MutationObserver(() => {
          if (!document.querySelector('.irdr-station-banner')) {
            const d = parseStuTables(vMap, eMap);
            buildBanner(station, d, vOk, eOk);
            buildPendingSummary(station, d);
            buildCompletionLeaderboard(station, d);
          }
        }).observe(document.body, { childList: true, subtree: true });
      }
    }, 2000);
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init)
    : init();
})();
