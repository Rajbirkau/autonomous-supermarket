# Autonomous Supermarket

A full-stack simulation of a small unattended supermarket near Swanston Street and Melbourne Town Hall, operated for 60 simulated days by a rule-based Store Brain, with a 60-Day Commercial Report, Daily Reports and a Commercial Assurance view. Originally built as a university coursework project. This is a fictional educational scenario and is not affiliated with IGA.

## Technology

- Frontend: React 19.3 with Vite 8.3 (`@vitejs/plugin-react` 6.1). No router; one `App.jsx` owns the state.
- Backend: Node.js with Express 5 (ES modules), one `index.js` for all routes.
- Storage: SQLite through Node's built-in `node:sqlite` (`DatabaseSync`). No third-party database driver.
- Dev tool: `concurrently`, so one command starts both servers.

## Requirements

- Node.js `^22.13.0 || >=23.4.0`. These are the versions where `node:sqlite` works without an experimental flag. Developed and tested on Node v24.19.0.
- Ports 3001 (API) and 5173 (website) must be free.
- Optional environment variables: `PORT` (API port, default 3001) and `SUPERMARKET_DB` (path to a different SQLite file, default `backend/supermarket.db`).

## Install and run

From the project root:

Then open http://localhost:5173. The website opens on the Submitted Run. Vite proxies `/api` to the backend, so the browser only talks to one address. `npm run dev` runs both servers in one terminal, with `[api]` and `[web]` log prefixes.

## The Submitted Run

- Database file: `backend/supermarket.db`, included in the ZIP.
- It contains one completed 60-day run, **Run ID 1**, label "Submitted Run (seed 42)". The table `app_settings` records `submitted_run_id = 1`, and the website loads that run at start-up.
- Opening position: 59 products (22 perishable), opening inventory cost A$36,850.25 against the A$40,000 cap, and A$15,000 operating cash.
- Result: 27,318 customers, 27,298 transactions, 112,175 units, revenue A$494,896.70, cost of goods sold A$270,779.80, gross profit A$224,116.90, write-off A$5,181.60, closing cash A$256,810.05, closing inventory A$13,975.50. All 16 Commercial Assurance checks pass.
- Gross profit and closing cash are before rent, wages, utilities and other overheads, which are outside the model boundary. They are not net profit.

## Creating a new run

- In the website, open the **Runs** tab, enter a label and a seed (a whole number), and press **Start run**. The 60 days are simulated in about 3 to 6 seconds on the development VM, then the new run opens. The header shows an amber "not the Submitted Run" badge, with a link back.
- Through the API: `POST /api/runs` with `{"label": "my run", "seed": 7}`.
- A different seed gives different customers and weather, so results will differ from the Submitted Run. The same seed and the same code reproduce a run exactly.
- Runs can never be edited or deleted, and each adds about 11 MB to the database file. To test without touching the Submitted Run, point the app at a copy: `cp backend/supermarket.db /tmp/copy.db` then `SUPERMARKET_DB=/tmp/copy.db npm run dev`.

## Architecture and data flow

- `backend/db.js` creates 13 tables. Money is stored as integer cents. History tables (customers, transactions, inventory movements, lots, orders, cash ledger, Store Brain events, daily rows) are append-only: database triggers reject updates and deletes, reject writes to a run that is not RUNNING, and freeze a run's configuration from the moment it is created.
- A run is created by `createRun` (validates the catalogue in code, then writes the run, its product copy, opening stock lots and the opening cash entry in one transaction). Its full configuration, including the customer model, the Store Brain rules and the declared assumptions, is stored as JSON in `runs.config_json`.
- `engine.js` runs each day in the order the brief requires: receive yesterday's orders, remove expired stock, customers shop, book the day's sales to cash, Store Brain review, place orders (none after Day 60). Stock is never an editable number. It is derived from a ledger of opening, receipt, sale and expiry movements against stock lots, so a perishable lot keeps its own expiry day.
- `report.js`, `operations.js`, `assurance.js`, `daily.js` and `findings.js` compute every reported figure from the stored history. Nothing is stored twice as a report.
- `assurance.js` recomputes the inventory, revenue and cash equations from the raw ledger tables, not from the daily summary rows, so an error in the engine cannot hide from it.
- Traceability: 60-Day Report chart bars and Store Brain alerts link to the Daily Report for that day. A Daily Report lists its transactions. A transaction opens its lines and the exact stock lots each sale drew from. Any product ID opens its day-by-day stock history and every Store Brain event for it.

## Customer and demand model

- Expected customers per day = 500 x weekday factor (Sunday 0.65, Saturday 0.85, Monday to Friday 1.0) x weather factor (rain 0.85) x a random daily shock of about 10 percent. Day 1 is a Monday. The expectation is split into office, resident and visitor customers (the split differs on weekdays and weekends), and each count is drawn from a Poisson distribution.
- Each customer gets an arrival hour (6:00 to 21:59) from a type-specific profile and a shopping mission (quick meal, drink and snack, top-up, main shop) from a type-specific mix. The mission sets the number of product lines, units per line and category weights. Products within a category are picked by hand-assigned popularity scores from 1 to 10.
- Weather: hot days raise drink weights, cold days lower them, and rain raises the umbrella weight eight-fold. One declared anomaly: a Town Hall street event on Day 20 multiplies visitor arrivals by 1.6.
- Randomness comes from one seeded generator per run, and the seed is stored with the run.

## Store Brain

Rule-based. At the close of each day it estimates demand for each product as the average of the last 7 days of units sold plus units customers wanted but could not buy.

- Low stock: usable stock (units still sellable tomorrow morning) below 2 days of demand, or below 1 day for products with a 1-day shelf life.
- Sold out: no units on hand at close.
- Expiry: a lot that will be removed when the next day opens triggers a warning the night before and is excluded from usable stock. Removed stock is written off at cost.
- Slow mover: from Day 7, usable stock above 14 days of demand. A flagged product is not reordered while it stays slow, and its next reorder is trimmed to 4 days of cover.
- Replenishment: only low or sold-out products are ordered, up to 7 days of demand (the smaller of 3 days and the shelf life for perishables). Orders arrive before opening the next day. Cost is deducted when the order is placed.
- Cash constraint: orders are filled lowest cover first, each limited to the cash remaining, and any shortfall is logged as a cash-constrained event. The check is made in application code, and the database repeats it as a second layer.
- Low-stock, sold-out and slow-mover events are logged when a product enters that state, so one sold-out event is one stockout episode, which can last several days.

## Where to find things in the website

- Submitted Run: the badge in the header, and the **Runs** tab (the Submitted Run is flagged).
- Model Declaration and setup (budget, cash, product sample, assumptions): **Model Declaration** tab.
- 60-Day Commercial Report, Parts 1 and 2: **60-Day Report** tab.
- Three findings and recommendations, Part 3: **Findings** tab.
- Daily Reports for Days 1 to 60: **Daily Reports** tab, with a day selector.
- Commercial Assurance, Part 4: **Commercial Assurance** tab.

## Known limitations

- Margins are an assumption. The catalogue applies a small-format convenience premium, giving a blended gross margin of about 45 percent, against roughly 28 percent reported for the large Australian supermarket chains. No small-format benchmark was used, so the margin is uncalibrated.
- Popularity scores, weekday factors and category weights are hand-assigned modelling judgements. Weather is drawn independently each day, so there are no multi-day spells.
- Customers who find an item sold out leave without substituting or returning. Suppliers are assumed to have unlimited stock, no minimum order quantities and no failures, with a fixed one-day lead time and one delivery per day.
- The Store Brain uses a flat 7-day average, so it ignores the weekday pattern. The Submitted Run shows the cost: the sushi box (1-day shelf life) had lost sales on 29 days and expired stock on 29 days.
- Cash never limited replenishment in any run, so the cash-constraint rule was tested in isolation but never exercised by recorded history.
- The Findings text is written for the Submitted Run. Its figures are recomputed for any other run, but the interpretation may not hold, and the website says so.
- Seed 42 for the Submitted Run was the seed used throughout development testing. It was kept after seeing that the Day 20 event is clearly visible in it.
- The simulation runs synchronously inside the API request, so the server is busy for a few seconds while a run is created. There is no authentication, because the app is designed for localhost.
- `node:sqlite` is a release candidate in current Node versions.

## AI collaboration

**Tool.** Claude (Anthropic), used through the chat interface for the whole project.

**What it helped with.**
- Drafting the 59-product catalogue and the customer and demand model.
- Drafting some parts of the backend
- drafting the three written findings.

## Public demo (read-only)

A hosted copy runs with `READ_ONLY=1`. It shows the Submitted Run and every screen, but `POST /api/runs` and `PUT /api/submitted` return 403, so visitors cannot start runs or change which run is featured. In that mode the backend also serves the built website, so one service runs on one port: build with `npm run render-build`, then start with `npm start`. The database is committed with the code and never written to, so a host with an ephemeral disk restarts from the same file. On free hosting the service sleeps when idle, so the first visit can take about a minute.
