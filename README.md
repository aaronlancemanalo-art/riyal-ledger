# Riyal Ledger

A personal budget and savings forecast app in Qatari riyals. It runs in the browser, installs on a phone like an app, works offline, and keeps every number on the device. Nothing is sent to a server.

**Live app:** https://aaronlancemanalo-art.github.io/riyal-ledger/

## What it does

- **Forecast to save this period.** Income minus bills minus day-to-day spending, projected to payday. Compared against a monthly savings target.
- **Savings forecast, 12 or 24 months.** Projected total savings from your plan (salary, rent, money home and other recurring items) and your typical day-to-day spending.
- **What-ifs.** Compare the plan with a scenario, such as a move abroad, a raise or a big purchase. Each scenario is a set of monthly or one-off changes.
- **Goals with dates.** Each goal has a target, a monthly contribution and an optional growth rate, and shows when it will be reached and whether that beats the deadline.
- **Budgets and pace.** Budget bars per category, a spending-pace chart and a breakdown of where the money went.
- **Light logging.** Recurring items log with one tap. Everything else goes through the + Add button, in QAR, PHP, USD, EUR or GBP. Each entry keeps the exchange rate from the day it was logged.

## Install it on your phone (Android, Chrome)

1. Open the live app link in Chrome.
2. Tap the menu (three dots) and choose **Add to Home screen** or **Install app**.
3. Open it from the home screen. It now works offline.

On an iPhone, open the link in Safari, tap Share, then **Add to Home Screen**.

## Your data

- Stored in the browser's IndexedDB on each device, separately. The phone and laptop do not sync by themselves.
- **Back up every week or two:** Settings > Data > Download backup. Clearing browser data or losing the phone deletes anything not backed up.
- **Move data between devices:** download a backup on one, then use Import backup on the other. Imports merge: new entries are added, edited entries keep the newest version and deletions carry over.
- Settings > Data > Export CSV gives a spreadsheet-friendly copy.

## How the forecast works

| Part | Source |
|---|---|
| Income and bills | Your recurring plan items (Settings > Plan) |
| Day-to-day spending | Average of up to your last 3 months of non-plan expenses. Before you have a month of history, your category budgets minus monthly bills |
| This period | Blends your current pace with that average, weighted by how far through the period you are |
| Savings | Assumes whatever isn't spent is saved |

It is a projection from your own numbers, not financial advice.

## For developers

Plain HTML, CSS and JavaScript modules. No framework and no build step.

```
index.html            app shell
css/app.css           styles and design tokens (light and dark)
js/app.js             UI and event wiring
js/calc.js            all money, date and forecast logic (pure, unit tested)
js/charts.js          hand-built SVG charts
js/store.js           IndexedDB storage
js/defaults.js        starting categories, goals and exchange rates
sw.js                 offline cache (bump VERSION on every release)
tests/calc.test.js    unit tests: npm test
reference/            the first version, kept for comparison
```

Run locally with `npm run serve` and open http://localhost:8080. Run the tests with `npm test` (Node 18 or newer).
