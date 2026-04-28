// ==UserScript==
// @name         IRDR STU - Station Numbers + Engage Status
// @namespace    http://tampermonkey.net/
// @version      5.1
// @description  Shows AA station numbers (Vantage) and pending engagements (AtoZ Engage) on IRDR STU
// @updateURL    https://raw.githubusercontent.com/nloprete/amazon-ops-tools/main/irdr-station-numbers.user.js
// @downloadURL  https://raw.githubusercontent.com/nloprete/amazon-ops-tools/main/irdr-station-numbers.user.js
// @match        https://ont-base.corp.amazon.com/*/icqa/irdr/stu*
// @connect      vantage.amazon.com
// @connect      atoz.amazon.work
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

    /* --- Table tweaks --- */
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

        const th2 = document.createElement('th');
        th2.className = 'irdr-engage-header';
        th2.textContent = 'Engage';
        thead.appendChild(th2);
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

        if (!row.querySelector('.irdr-engage-cell')) {
          const td = document.createElement('td');
          td.className = 'irdr-engage-cell';
          td.innerHTML = engageHtml(e?.topics || [], e?.hasPending, e?.dueSoon);
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
        rows += `<tr>
          ${i === 0 ? `<td rowspan="${byMgr[mgr].length}" style="vertical-align:middle;font-weight:700">${mgr} (${byMgr[mgr].length})</td>` : ''}
          <td>${aa.login}</td><td>${st}</td><td>${aa.zone || '—'}</td>
          <td>${engageHtml(aa.topics, aa.hasPending, aa.dueSoon)}</td><td>${link}</td></tr>`;
      });
    });

    const el = document.createElement('div');
    el.className = 'irdr-pending-summary';
    el.innerHTML = `
      <h4>⚠️ Pending STUs — ${station || ''}</h4>
      <table>
        <thead><tr><th>Manager</th><th>Login</th><th>Station</th><th>Zone</th><th>Engage</th><th>Status</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;

    const target = document.querySelector('.col-sm-10') || document.querySelector('.container-fluid');
    if (target) target.insertBefore(el, target.firstChild);
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

        new MutationObserver(() => {
          if (!document.querySelector('.irdr-station-banner')) {
            const d = parseStuTables(vMap, eMap);
            buildBanner(station, d, vOk, eOk);
            buildPendingSummary(station, d);
          }
        }).observe(document.body, { childList: true, subtree: true });
      }
    }, 2000);
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init)
    : init();
})();
