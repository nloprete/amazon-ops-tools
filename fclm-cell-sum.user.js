// ==UserScript==
// @name         FCLM - Drag to Sum
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Drag over cells in FCLM tables to sum up hours, volume, or any numbers
// @updateURL    https://raw.githubusercontent.com/nloprete/amazon-ops-tools/main/fclm-cell-sum.user.js
// @downloadURL  https://raw.githubusercontent.com/nloprete/amazon-ops-tools/main/fclm-cell-sum.user.js
// @match        https://fclm-portal.amazon.com/reports/functionRollup*
// @match        https://fclm-portal.amazon.com/reports/*
// @grant        GM_addStyle
// ==/UserScript==

(function () {
  'use strict';

  GM_addStyle(`
    .ds-popup {
      position: fixed;
      z-index: 999999;
      background: #232f3e;
      color: #fff;
      font-family: "Amazon Ember", Arial, sans-serif;
      padding: 12px 18px;
      border-radius: 8px;
      border: 2px solid #ff9900;
      box-shadow: 0 6px 20px rgba(0,0,0,0.5);
      display: none;
      text-align: center;
      min-width: 140px;
    }
    .ds-popup .ds-sum {
      font-size: 24px;
      font-weight: 700;
      color: #ff9900;
    }
    .ds-popup .ds-label {
      font-size: 11px;
      color: #aab7c4;
      margin-top: 2px;
    }
    .ds-popup .ds-close {
      position: absolute;
      top: 4px;
      right: 8px;
      background: none;
      border: none;
      color: #78909c;
      font-size: 14px;
      cursor: pointer;
    }
    .ds-popup .ds-close:hover { color: #fff; }
    td.ds-selected {
      background: rgba(255, 153, 0, 0.25) !important;
      outline: 1px solid #ff9900;
    }
  `);

  // Create popup
  const popup = document.createElement('div');
  popup.className = 'ds-popup';
  popup.innerHTML = '<button class="ds-close">✕</button><div class="ds-sum">0</div><div class="ds-label">0 cells selected</div>';
  document.body.appendChild(popup);

  popup.querySelector('.ds-close').addEventListener('click', () => {
    popup.style.display = 'none';
    clearSelection();
  });

  let isDragging = false;
  let selectedCells = new Set();
  let startCell = null;

  function getCellValue(cell) {
    const text = cell.textContent.trim().replace(/,/g, '').replace(/[()]/g, '');
    const num = parseFloat(text);
    return isNaN(num) ? null : num;
  }

  function getAllTableCells() {
    return [...document.querySelectorAll('td')];
  }

  function getCellCoords(cell) {
    const row = cell.parentElement;
    const table = row.closest('table');
    if (!table) return null;
    const rows = [...table.querySelectorAll('tr')];
    const rowIdx = rows.indexOf(row);
    const cells = [...row.querySelectorAll('td, th')];
    const colIdx = cells.indexOf(cell);
    return { table, rowIdx, colIdx };
  }

  function getCellsInRange(startCoords, endCoords) {
    if (startCoords.table !== endCoords.table) return [endCoords];
    const minRow = Math.min(startCoords.rowIdx, endCoords.rowIdx);
    const maxRow = Math.max(startCoords.rowIdx, endCoords.rowIdx);
    const minCol = Math.min(startCoords.colIdx, endCoords.colIdx);
    const maxCol = Math.max(startCoords.colIdx, endCoords.colIdx);

    const cells = [];
    const rows = [...startCoords.table.querySelectorAll('tr')];
    for (let r = minRow; r <= maxRow; r++) {
      const rowCells = [...rows[r].querySelectorAll('td, th')];
      for (let c = minCol; c <= maxCol; c++) {
        if (rowCells[c] && rowCells[c].tagName === 'TD') {
          cells.push(rowCells[c]);
        }
      }
    }
    return cells;
  }

  function clearSelection() {
    selectedCells.forEach(c => c.classList.remove('ds-selected'));
    selectedCells.clear();
  }

  function showPopup(e) {
    let sum = 0;
    let count = 0;
    selectedCells.forEach(cell => {
      const val = getCellValue(cell);
      if (val !== null) {
        sum += val;
        count++;
      }
    });

    if (count > 0) {
      const display = sum % 1 === 0 ? sum.toLocaleString() : sum.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 });
      popup.querySelector('.ds-sum').textContent = display;
      popup.querySelector('.ds-label').textContent = count + ' cells selected';
      popup.style.display = 'block';
      popup.style.left = Math.min(e.clientX + 15, window.innerWidth - 200) + 'px';
      popup.style.top = Math.min(e.clientY - 30, window.innerHeight - 100) + 'px';
    }
  }

  // Mouse events on table cells
  document.addEventListener('mousedown', (e) => {
    const cell = e.target.closest('td');
    if (!cell) return;
    if (getCellValue(cell) === null) return;

    isDragging = true;
    startCell = getCellCoords(cell);
    clearSelection();
    popup.style.display = 'none';
    selectedCells.add(cell);
    cell.classList.add('ds-selected');
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging || !startCell) return;

    const cell = e.target.closest('td');
    if (!cell) return;

    const endCoords = getCellCoords(cell);
    if (!endCoords) return;

    clearSelection();
    const range = getCellsInRange(startCell, endCoords);
    range.forEach(c => {
      selectedCells.add(c);
      c.classList.add('ds-selected');
    });
  });

  document.addEventListener('mouseup', (e) => {
    if (isDragging && selectedCells.size > 0) {
      isDragging = false;
      showPopup(e);
    }
  });

  // Clear on click outside tables
  document.addEventListener('click', (e) => {
    if (!e.target.closest('td') && !e.target.closest('.ds-popup') && !isDragging) {
      clearSelection();
      popup.style.display = 'none';
    }
  });

  // Copy sum with Ctrl+C when cells are selected
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'c' && selectedCells.size > 0) {
      let sum = 0;
      selectedCells.forEach(cell => {
        const val = getCellValue(cell);
        if (val !== null) sum += val;
      });
      const display = sum % 1 === 0 ? sum.toString() : sum.toFixed(2);
      navigator.clipboard.writeText(display);
      popup.querySelector('.ds-sum').textContent = 'Copied ✓';
      setTimeout(() => { popup.style.display = 'none'; clearSelection(); }, 1500);
    }
  });
})();
