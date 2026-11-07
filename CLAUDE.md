# Riyal Ledger: notes for Claude

Aaron's personal savings tracker and forecast. Savings-first since v3: he logs what he actually puts into (or takes out of) savings, and the forecast projects from those real amounts. Spending tools (budgets, bills, expenses) still exist but are hidden unless Settings > More > "Show spending tools" is on. Base currency QAR. Hosted on GitHub Pages from `main` (repo root).

## Rules
- **Data never leaves the device.** No backend, analytics, external APIs or CDN requests at runtime. Fonts are self-hosted in `fonts/`.
- **No build step.** Plain ES modules that GitHub Pages can serve as they are.
- **Logic goes in `js/calc.js`** as pure functions with tests in `tests/calc.test.js`. Run `npm test` before every commit; all tests must pass.
- **Bump `APP_VERSION` and `APP_DATE` in `js/app.js`** on every release; they show in the app footer and Settings > Data so Aaron can tell which version a device runs.
- **Bump `VERSION` in `sw.js`** whenever any shipped file changes, and add new files to its `SHELL` list, or installed phones keep the old build.
- **Never rewrite history:** each entry stores `qar` at the rate on the day it was logged. Changing rates in settings must not recalculate old entries.
- **Deletes are tombstones** (`{id, deleted: true, updated}`) so a backup merge carries them to other devices. Always set `updated` when writing an entry.
- **Storage changes need a migration.** Keep `normalise()` in `app.js` filling defaults for fields added later, so older data keeps working.
- UI copy: plain, short, user's side of the screen. No em dashes in UI text.
- Check phone width (390px) and dark mode for any UI change.

## Data shapes
- Settings (`kv` store, key `settings`): `cycleStart`, `savingsTarget`, `fx`, `accounts`, `categories[{id,name,kind:"expense"|"income",budget}]`, `goals[{id,name,target,start,monthly,growth,deadline}]`, `recurring[{id,name,kind,cat,amount,cur,every,start,end}]`, `scenarios[{id,name,items[{id,type:"monthly"|"oneoff",label,amount,start,end}]}]`, `showSpending` (false by default), `theme`, `updated`.
- Entry (`tx` store): `{id,date,kind:"expense"|"income"|"saving"|"withdrawal",cat,amount,cur,qar,account,note,rec?,created,updated,deleted?}`. `rec` links an entry to the recurring plan item it was logged from.

## Phone build
The phone runs this web app inside the Riyal Ledger Android app, built in the `aaronlancemanalo-art/holdfast` repo (`ledger/` module). After pushing here, run that repo's Build APK workflow (or push to it) so the phone app gets the change; the app then offers the update itself.

## Ideas not built yet
- Sync between phone and laptop (would need a backend; keep it optional and encrypted).
- Bank statement CSV import.
- Live exchange rates.
