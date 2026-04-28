# Amazon Ops Tampermonkey Tools

A collection of Tampermonkey userscripts that connect internal Amazon tools (Vantage, FCLM, IRDR, AtoZ Engage) to give operations managers real-time visibility across systems.

## Scripts

### 1. IRDR STU - Station Numbers + Engage Status
**File:** `irdr-station-numbers.user.js`
**Runs on:** ONT Base IRDR STU page

- Adds a station banner showing the current site and STU completion stats
- Pulls each AA's current Vantage station number and displays it in the STU table
- Queries AtoZ Engage for pending engagements (ADAPT, iCARE, ENGAGE) per AA
- Highlights incomplete STUs and shows a pending summary panel

### 2. Vantage - Water Spider Calculator
**File:** `vantage-water-spiders.user.js`
**Runs on:** Vantage Station Map + FCLM Process Path Rollup

- Counts active stowers from Vantage and calculates recommended water spider count (1 WS per 7 stowers)
- Pulls live TPH from FCLM (IB Total rate) and Transfer In Support metrics
- Calculates WS TPH drag (how much indirect WS hours dilute TPH)
- Color-codes rates red/green based on LP metric targets
- Manual inputs for TPH Goal and actual WS count on the floor
- Auto-detects day/night shift
- Draggable, minimizable, auto-refreshes every 5 minutes

### 3. FCLM - Bulk Station Lookup
**File:** `fclm-station-lookup.user.js`
**Runs on:** FCLM Portal

- Paste a list of associate logins to instantly see who is on site and their Vantage station number
- Shows active engagements from AtoZ Engage per associate
- Sortable by login (A-Z) or station number
- Resizable, draggable panel
- Auto-detects warehouse from URL

## Installation

1. Install the [Tampermonkey](https://www.tampermonkey.net/) browser extension
2. Click on a `.user.js` file in this repo
3. Click the "Raw" button
4. Tampermonkey will prompt you to install the script

## Setup

### Warehouse
Most scripts auto-detect your warehouse from the page URL. If not detected, you'll be prompted to enter it once.

### Zones
The Vantage zone list defaults to `paKivaA02` through `paKivaA05`. Update the `ZONES` array in each script if your site uses different zones.

### Manager Employee IDs (for Engage integration)
The AtoZ Engage integration requires your management team's employee IDs. Update the `MANAGER_EMPLOYEE_IDS` array in:
- `irdr-station-numbers.user.js`
- `fclm-station-lookup.user.js`

To find these IDs, open the AtoZ Engage conversation hub, open DevTools Network tab, and look for the `graphql/access` request — the `ownerEmployeeIds` in the request body are what you need.

### FCLM Sync (Water Spider Calculator)
The water spider calculator pulls live TPH from FCLM. Keep the FCLM Process Path Rollup page open in a tab — the script auto-scrapes and syncs data to the Vantage panel every 5 minutes.

## Tech Stack
- Vanilla JavaScript (Tampermonkey userscripts)
- Vantage REST API (station metrics, associate metrics)
- AtoZ Engage GraphQL API (employee recommendations)
- FCLM DOM scraping (process path rollup data)
- Cross-origin requests via `GM_xmlhttpRequest`

## Notes
- These scripts only work on the Amazon corporate network
- Requires active authentication to Vantage, AtoZ, FCLM, and ONT Base
- Data refreshes automatically but can also be manually triggered
