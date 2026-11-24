# Live screen layout audit

How to make each stamp cost the mapper as little attention as possible. Written 2026-11-23
against the live screen in commit `3036c93`.

**Status:** steps 1–7 of the build order below are built (Mapper Log 1.2.0). Not yet done: a
dry-run with mappers, a real foot pedal on a real iPad, and checking the anatomical map layout
against the views mappers use.

## The situation

The mapper's primary task is the mapping monitor, with a keyboard and mouse. The iPad sits to
one side. Every stamp is a small interruption:

1. eyes (and often head) leave the monitor
2. find the right tile
3. move a hand to it and tap
4. check it worked
5. look back and pick up the mapping where it was left

Steps 2 and 4 are where screen design matters most, and step 5 is where interruptions do their
damage. In the memory-for-goals research, short interruptions (about 4.4 s on average) roughly
tripled sequence errors after resuming the main task [1]. So the goal isn't only "big buttons".
It's a stamp that is one short glance, needs no searching and no second look to confirm.

For a sense of scale: NHTSA's (voluntary) in-car guideline is a single glance of 2 s or less and
12 s total per task [2]. A routine stamp should sit well under that: one glance, about a second.

## What the research says

| # | Finding | Design rule |
|---|---|---|
| R1 | In glance-and-tap studies, the **number of buttons** increased eyes-off-road time and long glances, while button size above an adequate minimum made little difference [3]. Reporting on a 2025 UW/Toyota study says the bottleneck was visual search, not finger precision [3]. | Reduce what the eye must search through for the frequent actions. |
| R2 | Size helps up to a point: one in-vehicle study found no further gain above about **17.5 mm** keys; older guidelines cite 19–22 mm [3]. | Keep frequent targets ≥ 20 mm; spend extra space on the most frequent target, not on everything. |
| R3 | **Spatial memory**: people learn where things are and go there without searching, but only if items never move. Stable layouts beat reflowing ones on revisits [4]. | Never move a tile. No reflow between left/right cases, no tiles appearing or disappearing. |
| R4 | **Pop-out**: a target that differs from its neighbours by one feature (e.g. a unique colour) is found in parallel, almost regardless of how many items there are [5]. | One distinct colour per category, used nowhere else. Don't rely on colour alone. |
| R5 | **Motion onset captures attention** involuntarily [6]. | Nothing should move or change on the iPad unless the mapper caused it, because it pulls the eye off the mapping monitor. |
| R6 | **Stimulus–response compatibility**: responses are faster and more accurate when the layout matches the mental model of the thing it controls [7]. | Lay out chambers the way the heart is pictured. Put the hot zone on the side the hand comes from. |
| R7 | The **bezel** is a physical landmark: bezel menus were usable with little visual attention [8], and tactile landmarks improved eyes-free tapping [8]. | Put the most frequent target against the edge nearest the mapper, full height, so the finger can find it partly by feel. |
| R8 | **Non-visual confirmation** helps status confirmation (but not finding a target) [9], and non-visual feedback cut glances in simulator studies [9]. | Confirm a stamp with sound and a large peripheral cue, so no second look is needed. |
| R9 | Switching the eyes between surfaces of very **different brightness** causes transient adaptation loss and strain [10]. | Dark UI and iPad brightness matched to the mapping monitor; avoid large bright fills. |
| R10 | **Physical controls beat touchscreens** for glance time and task time in cars [11]. | Offer a zero-glance option: a Bluetooth foot pedal or keypad for Ablation and Next milestone. |

## Audit of the current live screen

Measured in the browser at 1366×1024 (12.9″ iPad) and 1180×820 (11″ / 10th gen), at 264 ppi.

| Element | 12.9″ | 11″ |
|---|---|---|
| Milestone tile | 43 × 25 mm | 36 × 20 mm |
| Ablation tile | 117 × 28 mm | 100 × 23 mm |
| Map chamber tile | 34 × 25 mm | 29 × 20 mm |
| Undo / End case | 38 × 14 / 26 × 14 mm | same |
| Unused height below the tiles | ~40 mm | ~22 mm |

Target sizes are already above the ~17.5–20 mm level where size stops paying off (R2). The
gains left are in search, stability, placement and feedback.

| # | Severity | Finding | Rule |
|---|---|---|---|
| 1 | High | **The milestone grid reflows** on a right-sided case: 4 columns become 5, so the last three milestones (Close, Equip Out, Off Table, as they were then) move to new positions. Spatial memory built on left-sided cases fails on right-sided ones. | R3 |
| 2 | High | **The layout ignores which side the iPad is on.** The most frequent action, Ablation, sits left-centre. With the iPad on the mapper's left, the near edge is the timeline, Undo and End case. The hand must cross other targets to reach Ablation. | R6, R7 |
| 3 | High | **Every milestone is a choice among 7 tiles.** They happen in a known order, but the only cue is a thin blue outline on the next one. | R1, R4 |
| 4 | Medium | **A large clock ticks every second** (seconds and elapsed time) at top centre. That's constant change in the corner of the eye while mapping. | R5 |
| 5 | Medium | **Feedback is only visual and only on the tile** (0.5 s flash, the count changes). Confirming means looking again, especially when ablations come in quick runs. | R8 |
| 6 | Medium | **Completed milestones are the brightest things on screen** (teal fill), while the next one only has an outline. The salience is backwards. | R4 |
| 7 | Medium | **The navigation bar stays visible during a live case.** That's four extra targets, and tapping one leaves the live screen. | R1 |
| 8 | Medium | **Map chambers sit in one row of five identical purple tiles** in text order (LA RA LV RV CS). Telling them apart means reading two-letter labels. | R6 |
| 9 | Low | **Note** (rare) takes prime space next to Ablation (frequent), at the same height. | R1 |
| 10 | Low | **The cycle-length keypad** opens in the timeline column, away from the map tiles, with 12 mm keys. Typing a number is a look-and-type task by nature. | R1 |
| 11 | Low | **Undo and End case are adjacent**, both at the top right. End case has a confirm, so it's a nuisance rather than a risk. | — |
| 12 | Low | **Space is unused** below the tiles that the frequent targets could use. | R2 |

Already right: dark theme (R9), category colours (R4), large targets (R2), the double-tap guard,
an Undo that names what it removes, and every option on screen.

## Proposed layout

Landscape, mirrored by a one-time setting, **"iPad is on my left / right"**, so the hot zone is
always on the edge nearest the mapping monitor and the free hand.

**Near edge: Ablation** (about a third of the width, full height). It's amber, shows a big count
and the last time, and sits against the bezel so the finger finds it by feel. It is the
most frequent action, so it gets the biggest and closest target (Fitts's law).

**Middle**
- **Next milestone**: one large teal button that always stamps the next milestone in order
  ("Next: Transseptal"). Routine milestones become a single learned spot with no searching.
- Under it, **all 7 milestones in fixed slots**, smaller, for anything out of order or to
  correct a time. Done ones are dimmed with a tick. On a right-sided case, Transseptal and LA Out
  stay in place but are disabled and blank, so nothing moves.
- **Map** as an anatomical cluster: RA / LA on top, RV / LV below, CS across the bottom. This
  follows the radiological view (patient's right on screen left), which may need checking
  against the views mappers actually use.

**Far edge: the rare and the risky**
- Undo, large, naming the last tap.
- The last 3–4 taps, instead of a full timeline.
- Note.
- End case in the far corner.
- A small static clock: hours and minutes only, low contrast, no seconds.

**Calm while live**
- No navigation bar during a case. Leaving is through End case or a small menu in the far corner.
- Nothing animates unless the mapper tapped it.

**Confirmation without a second look**
- One short brightness pulse across the tapped zone, big enough to catch in peripheral vision.
- An optional short, low "tick" through Web Audio. It's generated on the device, so nothing
  touches the network. Off by default, and it must not sound like any equipment alarm in the lab.
- The last tap shown in a fixed spot, for checking at leisure.

**Cycle length**: either keep the keypad but put it right next to the map cluster with larger
keys, or move cycle length to the post-case screen. That's a choice for mappers.

## Beyond the screen

- **Which side**: on the side of the free (non-mouse) hand, usually the left for right-handed
  mouse users. Then a stamp never means letting go of the mouse.
- **Position**: as close to the mapping monitor as the desk allows, with the top edge about level
  with the monitor's bottom edge. The smaller the turn, the more of it the eyes can do without the
  head.
- **Stand**: angle the iPad towards the mapper (a stand, not flat on the desk) so the tiles aren't
  foreshortened and glare is reduced.
- **Brightness**: turn the iPad down to roughly match the mapping monitor in the dimmed room (R9).
  Use landscape. Turn off auto-lock as a fallback where Safari's screen wake lock isn't supported.
- **Zero-glance option**: a Bluetooth foot pedal or small keypad that pairs as a keyboard (AirTurn
  pedals do, sending arrow or page keys by default [12]). The app would listen for those keys:
  one pedal for Ablation, one for Next milestone. Nothing leaves the iPad.
  - Caveats: a WebKit bug report says Safari on iPadOS 18.5+ can drop key events from "dual-mode"
    devices, but not from keyboard-only ones like AirTurn [12].
  - Check hospital policy on Bluetooth devices and on footswitches in the lab.
  - A pedal must never be confusable with a fluoroscopy pedal, so it's best kept to the control room.

## Suggested build order

| Step | Change | Effort |
|---|---|---|
| 1 | Stable milestone slots (no reflow on right-sided cases) | Small |
| 2 | Calm the live screen: no seconds, small static clock, hide the nav bar, dim done milestones | Small |
| 3 | "iPad is on my left / right" setting, with a mirrored layout and full-height Ablation on the near edge | Medium |
| 4 | Next-milestone button | Medium |
| 5 | Confirmation: single pulse, optional tick, fixed last-tap readout | Small |
| 6 | Anatomical map cluster | Small |
| 7 | Keyboard / pedal shortcuts | Small code, needs a hardware trial |

## How to check it works

Dry-run with two or three mappers replaying a recorded case, comparing the current and new
layouts. Film the mapper from the side with a phone and count, per stamp:

- time with eyes off the monitor
- glances per stamp (a second look means the confirmation failed)
- wrong or missed taps
- Undo uses

Ask afterwards which layout they'd want in a real case.

## Sources

1. Altmann & Trafton, memory-for-goals and interruption costs:
   [Altmann & Trafton 2002](https://www.interruptions.net/literature/Altmann-CogSci02.pdf),
   [Trafton et al. (via scite)](https://scite.ai/authors/j-gregory-trafton-9OX0pG),
   [Monk, Trafton & Boehm-Davis 2008](https://www.ovid.com/journals/jepap/pdf/10.1037/a0014402~the-effect-of-interruption-duration-and-demand-on-resuming)
2. [NHTSA Visual-Manual Driver Distraction Guidelines (2013)](https://www.govinfo.gov/link/fr/78/24861),
   [US DOT release](https://www.transportation.gov/briefing-room/us-dot-releases-guidelines-minimize-vehicle-distractions)
3. [Feng et al. 2018, IJHCI](https://public.websites.umich.edu/~fredfeng/files/IJHCI_Feng2018_AcceptedManuscript.pdf);
   [touch-key size study (17.5 mm)](https://koreascience.kr/article/JAKO201116450096279.pdf);
   [report on the 2025 UW/TRI study](https://news.dealershipguy.com/p/in-car-touchscreens-still-massively-distracting-to-drivers-new-report-shows-2025-12-19);
   [Eren et al., peripheral vision](https://nottingham-repository.worktribe.com/file/920162/1/Eren-Peripheral%20vision-IET-ITS.pdf)
4. [Scarr, Cockburn & Gutwin, Supporting and Exploiting Spatial Memory in User Interfaces](https://nowpublishers.com/article/DownloadSummary/HCI-046);
   [spatially consistent interfaces](https://prism.ucalgary.ca/items/002efab2-3e14-4ee7-b7e3-6a3f79fae67f/full);
   [GI 2020](https://graphicsinterface.org/wp-content/uploads/gi2020-22.pdf)
5. Pop-out and feature integration:
   [Santhi & Reeves review](https://web.northeastern.edu/areeves/WEBSITE/SanthiReevesVRrev4.pdf),
   [PMC6513732](https://pmc.ncbi.nlm.nih.gov/articles/PMC6513732)
6. [Abrams & Christ 2003, Motion onset captures attention](https://pubmed.ncbi.nlm.nih.gov/12930472/)
7. Spatial S-R compatibility:
   [Proctor et al. 2013](https://www.cmu.edu/dietrich/sds/ddmlab/papers/Proctoretal2013.pdf),
   [overview](https://openaccess.cms-conferences.org/publications/book/978-1-958651-28-5/article/978-1-958651-28-5_53),
   [Hick–Hyman and compatibility](https://link.springer.com/article/10.3758/s13414-010-0062-x)
8. [Jain & Balakrishnan, bezel menus (CHI 2012)](https://www.dgp.toronto.edu/~mjain/CHI-2012.pdf);
   [Corsten et al., HaptiCase (CHI 2015)](https://hci.rwth-aachen.de/publications/corsten2015a.pdf)
9. [Rümelin et al., AutoUI 2013](https://www.medien.informatik.uni-muenchen.de/pubdb/publications/pub/ruemelin2013autoui2/ruemelin2013autoui2.pdf);
   [nonvisual feedback for touchscreen keys (US DOT)](https://rosap.ntl.bts.gov/view/dot/62506/dot_62506_DS1.pdf);
   [spearcons study](https://informahealthcare.com/doi/full/10.1080/15389588.2015.1020111)
10. [Transient adaptation and surround luminance (Ergonomics 2005)](https://informahealthcare.com/doi/abs/10.1080/00140130500208414);
    [ambient illumination in reading rooms](https://pubmed.ncbi.nlm.nih.gov/17278493/)
11. [Vi Bilägare touchscreen vs buttons test (2022)](https://www.vibilagare.se/nyheter/physical-buttons-outperform-touchscreens-new-cars-test-finds);
    [simulator safety comparison (TRB)](https://trid.trb.org/View/2773099)
12. [AirTurn PEDpro manual](https://cdn.shopify.com/s/files/1/1109/4160/files/apps_Pedpro-Manual-V2.pdf);
    [WebKit bug 301563](https://bugs.webkit.org/show_bug.cgi?id=301563)

Many of these sources are driving and lab studies, not cath labs. They point the direction;
the dry-run above is what settles it for mappers.
