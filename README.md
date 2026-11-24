# Mapper Log

A tap-to-timestamp case log for cardiac mapping, built for an iPad in the lab. Pick the procedure
type, then tap one large tile whenever something happens; the app records the wall-clock time.
It installs from Safari to the Home Screen, runs offline, and keeps everything on the iPad.

Plain HTML, CSS and JavaScript (ES modules). No build step, no dependencies.

## Run it

```bash
python3 -m http.server 8765
```

Then open <http://localhost:8765>.

**Testing on an iPad before it's hosted.** Use the no-cache server, so Safari never mixes old
and new files after an edit:

```bash
python3 tools/dev-server.py 8771 --lan
```

Then open `http://<this Mac's Wi-Fi address>:8771` in Safari on the iPad. Over plain http there
is no offline cache. Opening `index.html?nosw` on this Mac skips the service worker so edits show
on reload.

## Install on an iPad

The app has to be served over HTTPS (for example GitHub Pages; not set up yet).

1. Open the app's URL in Safari on the iPad.
2. Share button → **Add to Home Screen** → Add.
3. Open it once from the Home Screen while online. Every file is cached on that first launch;
   after that it works in airplane mode.
4. On the **Data** tab, tap **Ask to keep data** so Safari does not clear storage when the iPad
   runs low on space. (Safari normally grants this to Home Screen apps.)

**Updates.** Change `VERSION` in `sw.js` when you deploy. Installed copies notice on their next
online launch, cache the new files, delete the old ones and show "A new version is ready". Case
data is in IndexedDB, which updates never touch.

## Using it

- **New case**: step 1, the case side (Left-sided is preselected); step 2, tap Affera, PFA, Cryo
  or Focal Cryo, which starts the case. Each procedure card shows its colour and this month's
  count. Below: **This iPad is on my Left / Right** (set once), the last case, and this iPad's
  code.
- **Live screen**: three zones, mirrored by where the iPad sits so the busiest target is
  nearest you. The reasoning is in [docs/live-layout-audit.md](docs/live-layout-audit.md).
  - **Near edge: Ablation**, a full-height strip. On PFA, Cryo and Focal Cryo cases each tap
    is a new entry; first and last ablation are the earliest and latest.
    - **Affera** cases have hundreds of lesions, so the strip becomes **First lesion** (top, set
      once; tap again to correct it) and **Last lesion** (bottom). Every tap of Last lesion
      moves it to now, so tap it after what looks like the last lesion and again after any
      touch-up. Undo brings back the previous Last lesion. The total lesion count and ablation
      time are typed in after the case, from the Affera summary.
  - **Middle**:
    - **Next milestone**: one big button that stamps the next milestone in order. After a tap it
      shows "✓ Cut" for 2 seconds and ignores further taps, so a double tap can't stamp two
      milestones.
    - Milestones run in case order: On Table, Cut, Transseptal, LA Out, Sheath Out, Close,
      Off Table. ("Sheath out" was called "Equipment out" in the companion app.)
    - **All milestones** in fixed slots, for anything out of order or to correct a time. Done
      ones are dimmed. On a right-sided case, Transseptal and LA Out stay in place as "n/a".
    - **Basic / Advanced** (toggle in the far zone, remembered for the next case). Advanced adds
      **lesion sets**: Left WACA, Right WACA, Roof line, Floor line, Mitral line and CTI line.
      Each is one button that reads "Start Floor line", then "End Floor line", then shows the
      duration. Starting a line automatically ends whichever line is still running, at the
      same moment (nothing else ends a line; its own End button still works). Undo of that Start
      removes the automatic End too, so the earlier line carries on. Left-atrial sets are greyed
      out on a right-sided case.
    - **Map**, laid out like the heart (RA LA / RV LV, then CS). Each chamber has its own colour,
      used everywhere it appears: right heart blue, left heart red, atria light, ventricles
      deep, CS violet. Tapping a chamber starts a map, and its tile fills with its colour. The
      next press of anything else (another chamber, Ablation, a milestone, End case, a key or
      pedal) records **Map end** at that moment. Tapping the same chamber again just ends it.
      **Note** doesn't end a running map, and **Undo** removes the map instead of ending it.
  - **Far edge**:
    - case details and a quiet clock (hours and minutes only)
    - **Undo last tap**, which names what it will remove
    - the last 4 taps (tap one to correct it), and **All taps**
    - **Note**
    - **End case**
    - **Menu**: the navigation bar is hidden during a case.
- **Confirmation**: the tapped zone pulses once. With **Confirmation sound** on (Data tab), each
  kind of stamp has its own short sound, generated on the iPad.
- **Keyboard, keypad or foot pedal**: a Bluetooth device that pairs as a keyboard can stamp
  without looking.
  - Ablation: Down arrow, Page Down, Space or A (on an Affera case: First lesion until it's
    stamped, then Last lesion)
  - Next milestone: Up arrow, Page Up or N
  - Undo: ⌘Z

  AirTurn-style pedals send Up and Down by default.
- **End case** leads to a short post-case screen:
  - on an Affera case, the **total lesions** and **total ablation time** (m:ss) from the Affera summary
  - **fluoroscopy time** (m:ss), **disease treated** (PAF / PersAF / Other), **sedation**
    (GA / Sedation), **registry data submitted** (Yes / No)
  - site and operator, outcome and notes
  - any milestone you missed
- **Sites and operators** (Data tab). Cases record a site and an operator as short codes (S1,
  OP3), picked from a fixed list on the New case screen and remembered for the next case. The
  real hospital and physician names are in a list encrypted with a password (PBKDF2 + AES-GCM,
  on the device). Anyone with the password can unlock the list on their iPad and see names
  beside the codes until it's locked or the app closes. Exports and backups carry only codes and
  the encrypted list. Set the list up once and share it to every iPad (**Share the list…** /
  **Import a list…**), so a code means the same site or person everywhere. A lost password can't
  be recovered. Encryption needs the https (hosted) address; it's unavailable over plain http.
- **Cases** lists past cases newest first, grouped by month with each month's median room time.
  Each row shows the procedure colour, a thin bar of the case's phases (scaled so rows compare),
  room time, and anything missing ("Close not stamped", "Affera totals not entered"). Filter by
  procedure type or **Needs attention**. Open a case to edit it, reopen it, or delete it (with a
  confirm).
- **Dashboard** (between cases, never during one). Filters at the top (3 / 6 / 12 months or all
  time, and procedure type) scope everything:
  - a second filter row for disease, sedation, site and operator (like the data-feedback
    workbook's slicers)
  - case count with the procedure mix, and median room time, procedure time, LA dwell,
    first → last ablation and fluoroscopy time, each with mean ± SD, a monthly trend line, and
    the change against the previous period
  - case mix: counts by site, operator, iPad, disease and sedation
  - cases per month, stacked by procedure
  - each case as a dot along room time (or procedure time, LA dwell, ablation), with the median;
    tap a dot for details and **Open case**
  - where the time goes: median minutes in five phases (prep, to ablation, ablation, closing,
    exit) per procedure, with ablation picked out in amber
  - cases by weekday with each day's median room time
  - cases that need attention, recent cases, and a table of statistics (median, mean ± SD,
    fastest, longest)
  Charts are drawn on the iPad as SVG (no chart library, nothing fetched). Procedure colours were
  checked for colour-blind separation, and every colour sits next to a text label.
- After 7 days a case shows "Tue, Nov 2026" and times like `T+18:30` (minutes after Patient on
  table); corrections are then made in minutes.

## Privacy

- The app holds no patient data and asks for none. Notes say "No patient identifiers or dates".
- **Anonymised by design.** A date plus clock times could point to a patient for someone with
  the lab schedule, so:
  - Excel exports and backups never contain a date or a clock time. A case carries only its
    **weekday and month** (e.g. "Tue, Nov 2026"), and every time is **minutes after Patient on
    table** (or after the first event if On Table was not stamped).
  - On the iPad, clock times are kept for **7 days** after a case so they can be corrected
    against the lab clock. After that the case is converted in place: times become offsets,
    the date becomes weekday + month, and the real start time is deleted. This runs at launch,
    hourly, and whenever the app comes to the front. A case left live for 7 days is ended and
    converted too.
  - Rows in exports and backups are ordered by month, weekday and random case id, never by
    time, so their order does not give away the day.
  - Edits are tracked with a revision counter, not an edit time.
  - Each iPad has a **code** (Data tab), chosen by its mapper and meaningless to anyone else,
    stamped on new cases as "Source". It should not be a name or initials.
  - Whether weekday + month is coarse enough for low-volume procedures is a call for your
    privacy / IG contact.
- Nothing leaves the iPad. There is no server, no analytics, and no third-party code, fonts or
  CDNs; every file is in this folder.
- `index.html` sets a Content-Security-Policy with `connect-src 'none'`: the page cannot use
  `fetch`, XHR, WebSocket, EventSource or `sendBeacon`, even to its own origin. Images, fonts,
  frames, media and form posts to other origins are blocked too.
- The service worker only re-reads this app's own files to cache them.
- Data leaves only when you export, back up or share a file yourself, through the iOS share
  sheet or a download.

The policy cannot stop the page from navigating itself to another site, but nothing in the code
does that.

## Data and backups

Cases and events live in IndexedDB (`mapper-log`) on that iPad, in that browser profile.

- **Backup**: a JSON file of every case and event, anonymised like the Excel export. Save it to
  Files or AirDrop it.
- **Restore**: replaces everything on this iPad with a backup (asks first). Because backups hold
  no clock times, recent cases come back with relative times only.
- **Merge**: adds another iPad's backup to this one. Cases are matched by id; when a case is on
  both, the copy with more edits (higher revision) wins, along with all its events. On a tie
  this iPad's copy is kept, so a recent case here keeps its clock times.
- Imported cases are never live: their clock times are gone.
- The app shows "Last exported N days ago" and marks the Data tab after 7 days.

## Excel export

**Data → Share Excel file** (or Download) writes `mapper-log-YYYY-MM-DD.xlsx` in the browser: a
small zip writer (stored entries) plus SpreadsheetML, with no library.

Sheet **Cases**, one row per case:

| Column | Type |
|---|---|
| Case ID | text (random id, not patient-related) |
| Source | text (the iPad's code) |
| Weekday, Weekday no. (Mon=1), Month (`2026-11`) | text / number / text |
| Procedure type, Side | text |
| Times in minutes after | "Patient on table" or "First event" |
| 7 milestones, in case order: Patient on table, Cut, Transseptal puncture, LA withdrawal, Sheath out, Close, Patient off table | minutes after reference |
| First ablation, Last ablation | minutes after reference (Affera: First lesion, Last lesion) |
| Room time (on → off table) | minutes |
| Procedure time (cut → close) | minutes |
| Cut → transseptal | minutes |
| LA dwell (transseptal → LA withdrawal) | minutes |
| First → last ablation | minutes (Affera: First lesion to Last lesion) |
| Ablations (tapped) | count (PFA, Cryo, Focal Cryo) |
| Lesions (Affera), Ablation time, Affera (min) | typed in after an Affera case |
| Maps, Mapping time (min) | count, and total time from each map to its map end |
| Each lesion set: start, end, duration | minutes (Advanced mode) |
| Mode | basic / advanced |
| Site, Operator | codes (S1, OP3); names stay in the encrypted list |
| Disease treated, Sedation | text |
| Fluoroscopy time (min) | minutes |
| Outcome, Registry submitted, Status, Notes | text |

Sheet **Summary**: for each procedure type and all together, each measure over ended cases:
cases, median, mean, SD, fastest / lowest and longest / highest.

Sheet **Events**, one row per tap: Case ID, Source, Weekday, Month, Procedure type, Seq,
Minutes after reference, Type, Event, Chamber, Map duration (min), Note. First lesion, Last
lesion, each lesion set's Start / End and each Map end appear here as events.

All times and durations are numbers of minutes (shown to one decimal place), so formulas and
pivots work on them. A duration whose times are out of order comes out negative; the case
screen flags it with "check times".

The column mapping is in one file, `js/export-map.js`. That is the file to change when the
dashboard workbook arrives. `js/xlsx.js` only knows about typed columns.

To check an export on a Mac: `python3 tools/check-xlsx.py file.xlsx` (zip and XML checks, plus
an `openpyxl` read if it is installed). `node tools/check-export.mjs out.xlsx` builds a sample
file from the app's own export code.

## Files

```
index.html             shell, CSP, iOS meta tags
manifest.webmanifest   install metadata
sw.js                  offline cache (bump VERSION to deploy)
css/app.css            all styles
js/app.js              routing, nav, service-worker registration
js/model.js            names (procedures, milestones, chambers), derived times, formatting
js/store.js            IndexedDB, merge, restore
js/edit-event.js       correct / add / delete an event
js/export-map.js       Excel column mapping
js/xlsx.js             zip + SpreadsheetML writer
js/backup.js           backup format and validation
js/share.js            share sheet or download
js/sound.js            optional confirmation sounds (Web Audio)
js/charts.js           SVG charts for the dashboard and case list
js/icons.js            small line icons (always beside a text label)
js/directory.js        site / operator codes and the password-encrypted name list
js/screens/*.js        New case, Live case, Case review, Cases, Dashboard, Data
icons/                 app icons (tools/make-icons.py redraws them)
tools/                 dev server, export checks, icon generator
```

Needs iPadOS 15.4 or later. Keeping the screen awake during a case uses the Screen Wake Lock API
where Safari supports it.
