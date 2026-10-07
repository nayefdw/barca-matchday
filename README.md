# Cartel · Barça fixtures

A lightweight mobile-first PWA: a stadium match card, searchable fixtures and results, a monthly calendar, News / Squad / Stats sections, and an iPhone calendar subscription. Plain HTML, CSS and JavaScript; Cloudflare Worker + KV backend.

## Design and features · version 2.5.4

- A blended translucent header with an original blue/red monogram, Barça / Matchday branding, and no Cartel word in the banner. Floating glass cards, soft blue/garnet lighting, blue/red active-tab accents and a floating bottom navigation bar.
- Home: next match with full club names and real crests, prominent kickoff, glass days/hours/minutes/seconds countdown, LIVE/half-time status and the latest delayed score, Previous / Then / After fixture strip, recent form and match sharing. Sharing uses the device share sheet or copy fallback; a public real-data deployment includes a match link.
- Fixtures: Upcoming / Results, competition filters and accent-insensitive opponent search, including club abbreviations.
- Calendar: month navigation, Today, opponent crests replacing the main date number on match days, blue home / red away dots and a selected-day agenda. A small corner number preserves date context. Published dates with pending kickoff times appear in the grid without shifting days between timezones; postponed fixtures stay outside it. Published dates can still change. Competition chips still filter La Liga / Champions League.
- News: links to the official first-team news, club news and results pages. Headlines are read on the club website; there is no scraped or cached in-app news feed.
- Squad: position filters, player photos, coach and centred player detail sheets. The backend requests the provider's season roster daily and looks up freely licensed Wikipedia/Wikimedia photos through exact football biographies and Wikidata image references. Disambiguation pages are rejected. Photographer, licence and original-file links appear in profiles. Version 2.3.1 verified credited photos for 24 of the 28 saved roster players; four youth players without a verified suitable photo retain the shirt illustration. Failed images also use that fallback. Names, positions, nationality and shirt numbers display when supplied; missing fields stay unknown. These rosters can include players who appeared earlier in the season, and do not establish availability or injuries. The local preview uses eight clearly labelled sample players with actual Wikimedia photos.
- Stats: La Liga and Champions League competition tables, with Barça highlighted in blue/red. Tables show position, club, played, goal difference and points; tapping a club opens wins/draws/losses and goal totals. Official positions and points are retained, including deductions. The preview uses illustrative eight-team tables, not current standings. Cup competitions require knockout brackets and are not covered by this free source.
- Below the tables: loaded-result counts, win rate, form, goals scored/conceded, goal balance and recent results. These summaries apply to the saved fixture window, not the full season.
- Posters: cinematic dusk stadium with gradient scrims, softly blurred flag corners, glass actions and blue/garnet accents. Home matches use nine supplied Camp Nou photographs with gentle 30-second crossfades; away matches use the home club’s stadium photograph with a cooler overlay, the opponent on the left and Barça on the right. The old poster heading is removed and a smaller competition logo/name sits in the upper-left corner. Countdown and action panels use light, translucent glass. Team crests have no added rings or circles. View either poster from Match details. The compact Previous / Then / After strip centres larger crests, scores and text in three balanced columns down to 320px, with separate score rows, consistent name space and Home/Away pills; unavailable columns are omitted. Display motion is a single first-render fade, disabled by reduced-motion preferences. Dialog titles, team crests and key information are centred. Match-detail club names occupy adjacent columns around a small “vs”, with long names wrapping within their own column. Pointer interaction leaves no blue focus outlines; keyboard controls retain a visible focus indicator.
- Match details: Recent meetings shows up to five completed encounters before the selected match, newest first, with both teams, dates, competitions, home-first scores and Barça W/D/L badges and summary. Shootouts display their penalty scores separately. Verified UEFA and FC Barcelona records supplement the free provider’s limited history for mapped opponents, with archive links and explicit competition labels, including older European competitions and relevant friendlies. Provider results take precedence when the same match is present in both sources. Unknown opponents are not assigned invented results; sample history is explicitly illustrative.
- Settings: add a home poster picture, include/exclude supplied photos, delete added photos, choose a favourite, limit the number shown, enable/disable automatic rotation and restore the supplied collection. Added images are resized to at most 1200px and saved in IndexedDB on this device, with no upload to the server. JPEG, PNG and WebP are supported; HEIC depends on browser decoding. Up to 16 added photos, 20 MB maximum input each. Storage errors are reported; an empty selection uses the stadium illustration. Clearing site data removes added images and preferences.
- Calendar summary: the selected month’s published tracked match count and home/away totals; tap it to show the full monthly agenda. It respects the competition filter and includes date-only fixtures with pending kickoff times but excludes postponed/cancelled fixtures.
- Settings: opt-in match reminders at 15/30 minutes, 1/2 hours or 1 day before confirmed kickoff. Preference changes save on the device; enabling delivery requires the public deployment and push keys. The preview does not request notification permission or send sample reminders.
- Settings: Refresh saved fixtures shows progress, a completion time on success and a clear message when the server cannot be reached. It reloads the latest saved server snapshot; provider polling stays on the scheduled cadence.
- Settings: Bottom bar has an optional Liquid Glass switch and separate 0–100% transparency and clarity sliders in 5% steps. Transparency controls the light surface tint; clarity reduces backdrop blur from 20px to 0px. Changes preview immediately, with icons and labels kept opaque. Preferences are saved on the device; the classic bar remains the default.
- Page content gradually blurs and fades beneath the bottom navigation. Four masked blur layers increase toward the bottom edge, while the menu remains sharp and clickable. The fixed fade follows the app width and iPhone safe area; its decorative layers do not intercept taps or scrolling. Reduced-transparency preferences disable the blur, and the gradient remains available as a fallback.

Home artwork uses the nine photographs supplied by the user, compressed to WebP (about 1.3 MB total); the original wording/watermark in the sunset photo is retained. Away artwork is sourced with photographer, licence and file links from Wikimedia Commons. Unknown grounds use the SVG stadium illustration. Photographs are historical and do not establish the current match venue. Explicit fixture venue text takes priority; when it is omitted, the separately fetched club ground is shown without an added suffix, with a note in match details that a venue change remains possible. The official schedule supplies guarded venue corrections for the checked October/November 2026 fixtures, including RAMS Park and La Cartuja; they require an exact fixture ID, date and teams and never override an explicit provider venue. Stadium photos are not treated as venue confirmation. The prior generated background is retained as an unused design archive; see [the asset prompt](ASSET-PROMPT.md). The News card retains its credited historical photo.

## Preview now

Requires Node.js 22 or newer. No packages are needed for the preview or tests.

```sh
npm start
# Open http://127.0.0.1:4187
npm test
```

The preview uses clearly labelled **illustrative fixtures**, anchored to the day it starts. It is not the real Barcelona schedule. Calendar subscriptions and single-event exports are disabled for sample data. `node dev/server.js --empty` previews the initial state with no data connected. `node dev/server.js --live-preview` displays an explicitly illustrative 2–1 live poster; this never touches production data.

## Release 2.5.4

Added a progressive blur and background fade beneath the floating bottom menu. This page-content effect is separate from the bar's existing glass transparency and clarity controls. It uses small fixed CSS layers without a scroll listener or animation, and leaves dialog content above the effect. The shell cache is updated for installed apps; fixture data and backend behavior are unchanged.

Published-browser checks confirmed the fixed fade during scrolling, increasing masked blur, all four menu hit targets and no horizontal overflow at 390px and 320px. Match details remain clear and fit the narrow viewport. The JavaScript syntax check and Cloudflare deployment succeeded. Actual iPhone/Safari rendering remains a device check.

## Release 2.5.3

The Liquid Glass bar now uses the countdown's light blue/white surface, subtle border and small shadow without the dark navy fill. Defaults are 95% transparency and 75% clarity (5px blur). Increasing clarity to 100% removes blur; both controls at 100% leave only the glass edge and readable navigation. The active tab no longer adds a separate filled tile. Existing custom transparency values are retained; the former 65% default is upgraded to 95%. The appearance switch and both values survive reload, and the updated shell cache delivers the controls to installed apps.

All 72 existing checks pass. Published-browser checks confirm both slider endpoints, persistence, matching countdown tint, readable labels and no horizontal overflow at 390px and 320px. Actual Safari/iPhone rendering remains a device check.

## Release 2.5.2

Added Settings → Bottom bar → Liquid Glass, with a live transparency preview. A lightweight CSS blur, glossy edges and blue/garnet surface highlights provide the glass appearance. Transparency controls the surface colour rather than fading navigation labels. Switching off restores the classic appearance and retains the chosen percentage for later. Device-storage errors leave the appearance applied for the current visit with a clear message. The service-worker shell cache is updated so installed apps receive the new settings.

All 72 existing checks pass. Browser verification covers both slider limits, persistent preferences after reload, classic-mode restoration and 390px/320px layouts without horizontal overflow.

## Release 2.5.1

Automatic is the default timezone option and uses the phone/browser system timezone. It rechecks on app resume and every minute, so displayed times follow device timezone changes. Manual choices include Barcelona, Palestine (Gaza and West Bank separately), Chicago, London, Paris, New York, Los Angeles, Riyadh, Dubai, Tokyo and UTC. Named IANA zones use the device’s timezone database for daylight saving; there are no fixed-offset calculations. Preferences remain local, invalid saved settings fall back to Automatic, and the older Barcelona preference migrates. The current 12/24-hour setting applies in every selected zone. Confirmed kickoff instants and local calendar days convert together; date-only fixtures retain their published day. Apple Calendar follows its own device settings.

72 automated checks pass, including actual runtime timezone detection, alias compatibility, Chicago/Palestine seasonal offsets, the Chicago spring transition and cross-midnight fixture dates.

## Release 2.5.0

- Added the four-unit countdown, provider-confirmed LIVE/half-time score presentation and five-minute match polling.
- Added Settings → Time display → 12-hour AM/PM or 24-hour, stored on the device and applied across the app.
- Shortened exported calendar notes and supplied known venues; published date-only entries upgrade to timed entries using the same UID.
- Included published pending-time dates in fixtures and the monthly calendar. Copa del Rey remains outside the current free provider; Settings links to the official club calendar covering cup fixtures.
- Verified 68 automated checks, including calendar reschedules/cancellations, timezone boundaries, countdown seconds, live states and refresh cadence.

## iPhone Calendar

The calendar button on the match card, Subscribe on the monthly calendar, calendar banners and Settings open the subscription sheet. Choose all tracked fixtures, La Liga, or Champions League.

- **Subscribe in Apple Calendar** opens a `webcal://` link. If iOS Home Screen mode does not open Calendar, use Safari or the **Copy calendar link** fallback.
- In iPhone Calendar, choose Calendars → Add Calendar → Add Subscription Calendar, paste the HTTPS link and follow the prompts. [Apple instructions](https://support.apple.com/en-gb/guide/iphone/iph3d1110d4/ios).
- **Add this match** in Match details downloads a single `.ics` event. An imported event does not track later changes; use a subscription for updates.
- Subscriptions are read-only and do not read personal calendar data. Apple decides when to refresh them; updates are not immediate. Alerts can be set in Calendar. This feed does not create default alerts.
- Subscribe to one scope to avoid duplicate events. To change scopes, remove the previous subscription before adding the new one.
- Published dates with pending kickoff times export as tentative all-day events. The same UID changes to a timed event when kickoff is announced. Date-only changes increment the sequence, and cancellations retract the old all-day event. Only confirmed kickoffs appear as timed events. A previously published match that is postponed, cancelled or loses time confirmation sends a cancelled event at the old time. Reconfirmation reuses the UID with a higher sequence. End times are estimated two-hour placeholders.
- Calendar times use UTC, so iOS displays them in the device's timezone. The app separately offers local or Barcelona display time and a saved 12-hour AM/PM or 24-hour setting. Apple Calendar controls its own display format. Calendar event notes contain only competition, round and any pending/cancelled status. Locations use the explicit match venue or known club ground; unknown locations are omitted rather than exporting TBC. Export metadata was revised so existing subscriptions receive these changes on their next Apple refresh.

Endpoints after deployment:

```text
/calendar/barca.ics                     All tracked fixtures
/calendar/barca.ics?competition=PD      La Liga
/calendar/barca.ics?competition=CL      Champions League
/calendar/match/fd-<provider-id>.ics     One match
```

Subscription URLs must be public HTTPS, accessible without cookies or a login, so Apple can refresh them. They contain public fixture data only. API credentials remain in Worker secrets.

## Connect real fixtures and deploy on Cloudflare

Published on 7 October 2026 at **https://barca-matchday.nayefdw.workers.dev**. Source: **https://github.com/nayefdw/barca-matchday** (private). The configured free football-data.org account successfully returned 42 fixtures, a 28-player season roster, both standings tables and recent head-to-head results. The live app uses real saved provider responses; the local preview remains illustrative. A fresh deployment starts with HTTP 503 until data is successfully fetched.

1. Create a free token at [football-data.org](https://www.football-data.org/client/register). This first version tracks **La Liga and Champions League only**; free scores can be delayed. Historical depth/head-to-head and roster entitlement must be checked against the actual token; the pricing page does not promise deep history on the free plan. Copa del Rey, Supercopa and friendlies are not included. Verify current access on your plan before publishing.
2. In this folder, authenticate Cloudflare and create KV:

   ```sh
   npx wrangler login
   npx wrangler kv namespace create FIXTURES
   ```

3. For a new account, replace `account_id`, the KV namespace ID and `SITE_ORIGIN` in `wrangler.jsonc` with your own values. The checked-in configuration already points to the owner’s published Worker and KV namespace. Team ID is Barcelona `81`.
4. Store the token locally through the secure prompt, then deploy:

   ```sh
   npx wrangler secret put FOOTBALL_DATA_TOKEN
   npx wrangler deploy
   ```

5. The cron runs every five minutes to check reminder delivery. Fixture fetches use six-hour/hourly limits, increasing to five-minute updates during active matches or for up to three hours after a confirmed kickoff; the visible app reads the shared cache every minute during that window. Elapsed kickoff alone never invents LIVE status or a score; standings fetches run at most every six hours and the roster daily. Head-to-head history and stadium metadata are each warmed for at most two clubs per trigger, then cached for a day. The next cron trigger is the initial data load; allow time for Cloudflare to apply the cron configuration. Check `/api/fixtures`, `/api/team` and `/api/standings?competition=PD` (or `CL`) after it runs. These data sources update independently. If using a custom domain, set `SITE_ORIGIN` to its HTTPS origin and redeploy. Otherwise the request origin supplies the calendar URL. Push reminders always require an explicit public HTTPS `SITE_ORIGIN`.
6. Open the public HTTPS address in Safari, use Share → Add to Home Screen, then test Calendar subscription on an iPhone. Real Apple Calendar imports and refresh behavior have not been device-tested here.

For local tests of the real provider, copy `.dev.vars.example` to `.dev.vars`, enter the token locally, and use `npx wrangler dev --test-scheduled`. Visit its displayed localhost address, then `/__scheduled` to simulate the cron. This initializes **local** KV; it does not initialize production. Do not commit `.dev.vars`.

Deployment uses Wrangler from Cloudflare's official npm package. Its authentication and initial installation may need to be completed on your machine. [Configuration docs](https://developers.cloudflare.com/workers/wrangler/configuration/).

## Structure and data flow

```text
public/
  index.html              App shell, accessible native dialog
  styles.css              Floating cards, tabs, roster, stats and calendar
  app.js                  Views, controls, saved data, sharing and calendar links
  state.js                Fixture sorting, countdown and honest state labels
  insights.js             Calendar grid, search, result form and tracked totals
  teams.js                Full club names and validated crest URLs
  photos.js               Explicit player article aliases and safe photo URLs
  notifications.js        Tap-preserving subscription setup and bounded waits
  history.js              Pair filtering and Barça head-to-head outcomes
  poster.js               Pure poster state and nearby-fixture derivation
  stadiums.js             Validated stadium photo metadata and aliases
  home-photos.js          Nine supplied home background assets
  photo-library.js        Local image import, IndexedDB and rotation preferences
  competitions.js         Competition badges and source credits
  assets/                 Supplied home WebP collection and SVG fallback
  sw.js                   Offline shell, saved fixtures/team and loaded images
  manifest.webmanifest    Home Screen setup
  icons/                  SVG, 192/512 PNG and Apple touch icon
worker/
  index.js                Static assets, read-only API and calendar routes
  refresh.js              Scheduled provider fetch, retry spacing, backups
  history.js              Cached head-to-head normalization, cron and API
  history-archive.js      Verified official score facts for mapped opponents
  team.js                 Daily season-roster fetch and validation
  photos.js               Biography/Wikidata portraits and Wikimedia credits
  stadiums.js             Daily home-stadium lookup, bounded warming and API
  standings.js            Competition-table validation and six-hour refresh
  push.js                 Opt-in subscriptions, encrypted delivery and timing
  normalize.js            Provider validation and stable event revisions
  calendar.js             RFC 5545 events, UTC, escaping, folding and ETags
dev/                      Dependency-free sample preview
test/                     Calendar, backend, club, roster and insight checks
wrangler.jsonc            Assets + KV + five-minute reminder cron
```

Scheduled trigger → football-data.org team matches → validate and normalize → KV `snapshot` → `/api/fixtures` → poster/list. The same snapshot → `.ics` feed → Apple Calendar. Opening or refreshing the PWA only reads KV; it does not call the sports provider.

The trigger also fetches `/v4/teams/81` when the saved roster is at least 24 hours old → validate → KV `team_snapshot` → `/api/team` → Squad. `team_meta` records attempts and failures; retries are spaced by at least one hour and failures preserve the saved roster. Data more than 48 hours old is marked stale. Roster access was verified with the configured free token at publication. [Team resource](https://docs.football-data.org/general/v4/team.html), [roster policy](https://docs.football-data.org/general/v4/policies.html).

Standings: `/v4/competitions/PD/standings` and `CL/standings` → validate TOTAL tables containing Barcelona → separate KV `standings_PD` / `standings_CL` snapshots → read-only `/api/standings?competition=PD|CL`. Each refresh is independent; failures preserve the previous table. Staleness is marked after 12 hours. [Competition standings documentation](https://docs.football-data.org/general/v4/competition.html).

Fetches run approximately every six hours, or hourly within 24 hours of a confirmed match, with at most one attempt per hour. Failed or incomplete responses preserve the last good snapshot. `snapshot_prev` retains the previous successful snapshot. `meta` records the last attempt/success and failures. Recently published cancellation events stay available until 30 days after their kickoff. Unexpected missing known fixtures fail validation rather than silently invent cancellations.

`GET /api/head-to-head?match=fd-<id>` reads shared KV and the bundled verified archive without calling the provider. The cron uses the documented [match head2head resource](https://docs.football-data.org/general/v4/match.html), prioritizing opponents in the saved schedule and reserving a slot for a Champions League rival, with a maximum of two calls per trigger. Valid results are cached per opponent for 24 hours. Failed requests preserve history; 403/404 responses wait a day before retrying, other failures at least an hour. Results merge with newer saved fixtures and verified UEFA/official club archive facts, exclude the selected game and later/future games, remove duplicates, and return up to five. Date-only archive records display their known calendar date without inventing a kickoff time; provider records win duplicate conflicts. Archive links and a source label appear when used. Archive coverage is limited to mapped opponents and is not a complete historical database. Without provider or archive history, the UI labels the saved tracked results as limited. The [free plan](https://www.football-data.org/pricing) lists delayed scores and tables, but does not explicitly guarantee deep historical access; do not treat the five preview examples as guaranteed live coverage. The offline cache also retains previously opened head-to-head responses.

`GET /api/stadiums` reads saved KV stadium metadata plus curated Camp Nou / Parc des Princes artwork. The cron checks provider home-club venue fields and saves the club ground independently of photo availability, then requests a freely licensed Wikimedia photograph using explicit venue aliases; generic Wikipedia article lookups must describe a stadium/ground. At most two provider team requests run per trigger. Successful metadata is cached for a day, failures preserve saved images and retry at least hourly (403/404 daily). Club-ground metadata can provide a clearly labelled venue fallback; curated historical artwork alone cannot. Unsupported stadiums use the illustration; away posters never borrow Barça’s home collection. Stadium responses and loaded Wikimedia images are cached for offline use. The full supplied home collection is bundled with the offline shell.

The app labels stale data, saved offline data, delayed live states, and unconfirmed dates. Passing kickoff alone never creates a live score or a result. There are no user accounts or private-calendar access. Opting into reminders stores that device's push endpoint, encryption keys, preferred lead time, hashed device authorization and recent send markers privately in KV. There is no public subscription-list endpoint. Disabling reminders removes the server subscription and unsubscribes the browser; dead endpoints are removed after 404/410 responses.

## Push reminders

The published Worker has push keys and secrets configured, and `/api/push/config` reports `ready: true`. Real delivery has not been tested on an iPhone. The following steps are for configuring a separate deployment; keep the existing keys for the published app so existing device subscriptions continue working. [WebKit's iPhone requirements](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/): iOS 16.4 or later, a Home Screen app and permission requested from a user tap. Permission is requested only by **Enable match reminders**, never automatically.

Notification setup is prepared before enabling. The Enable tap invokes push subscription before any awaited work, preserving the browser’s permission gesture. Setup, subscription and save waits are bounded, with visible retry, blocked-permission and unsupported-browser guidance. Reminder freshness uses the same hourly/six-hour cadence as fixture refresh, so a valid six-hour snapshot is not rejected as if it were hourly. These fixes do not establish successful real iPhone delivery; a device test is still required.

1. Run `npm run push:keys` locally. This creates `.vapid.json` without printing private key material and refuses to overwrite an existing file. The file is excluded from Git; never upload it or paste it into chat.
2. Set `VAPID_PUBLIC_KEY` in Worker configuration to `publicKey` from that file. Store the JSON value of `privateKey` securely as the Worker secret **VAPID_PRIVATE_JWK**. Set `SITE_ORIGIN` to the final public HTTPS app origin. Optionally set `VAPID_SUBJECT` to an owner-controlled HTTPS contact URL or `mailto:` address; otherwise the app origin is used.
3. Redeploy, confirm `/api/push/config` reports `ready: true` once real fixture data exists, then install the app on iPhone. Enable reminders in Settings, choose a lead time and verify a real notification on the device before treating delivery as production-ready.

The five-minute trigger checks reminders against the latest saved schedule. It skips demo data, unconfirmed/postponed matches and schedules beyond twice their current hourly/six-hour checking interval. Send markers distinguish match, kickoff revision and lead time. A reminder is retried only within a ten-minute due window; cancelled/rescheduled matches use the currently saved schedule. Delivery may be delayed or missed because of cron, provider, push-service, connection or device settings. No exact-minute delivery guarantee is made. Tapping a notification opens that match's details. The personal version supports up to 20 device subscriptions; broader public use needs a delivery queue and additional abuse controls.

The backend uses Web Crypto for [RFC 8291 encryption](https://www.rfc-editor.org/info/rfc8291/) and [RFC 8292 VAPID](https://www.rfc-editor.org/info/rfc8292/). Subscription updates/removal require the original device token, matching request origin and HTTPS. Push endpoints are restricted to known Apple, Google and Mozilla services. Private push and fixture credentials are deployed as Worker secrets and excluded from Git.

## Verification and limits

Run `npm test`. Version 2.3.1 has **56 passing automated checks**, covering rescheduling/cancellation UIDs and sequences, TBC omission, UTC timestamps, competition filters, UTF-8 folding, text injection, conditional requests, failed refresh preservation and state transitions. Added checks cover player biography/image fallbacks, verified historical results, club-ground venue fallback, notification gesture timing, bounded setup and reminder freshness. Browser checks exercise the mobile poster, filters, details, settings and subscription sheet. Live provider authorization and Cloudflare deployment were verified at publication; actual iPhone subscription acceptance and push delivery remain device checks.

Additional checks cover the local-day calendar across timezone boundaries and DST, leap years, month navigation, accent-insensitive search, Barcelona's home/away result perspective, tracked totals and roster validation/retry behavior. See `VERIFICATION.md` for the checks actually completed.

Independent fan companion. **Football data provided by the Football-Data.org API.** Full provider club names are retained in the UI and calendar. Crests use the HTTPS image URLs included with each provider team; images load as external `<img>` resources and previously loaded crests are cached for offline use, with a monogram fallback. Club crests remain the respective owners’ marks. No external font dependencies.

Wikipedia/Wikimedia is a possible later crest fallback; a Wikipedia article thumbnail is not guaranteed to be a club crest. Club crests accept validated Wikimedia upload URLs but do not require Wikipedia lookups because the fixture API already supplies them. Player photos do use the Wikipedia API. [Provider team fields](https://docs.football-data.org/general/v4/match.html), [MediaWiki PageImages](https://www.mediawiki.org/wiki/API:Pageimages).

News atmosphere photo: [Campnoupano2011.jpg](https://commons.wikimedia.org/wiki/File:Campnoupano2011.jpg), Jackpollock, public domain. Player thumbnails use the [PageImages API](https://www.mediawiki.org/wiki/API:Pageimages) with `pilicense=free`; artist/required attribution and licence are read from Wikimedia file metadata. `dev/photo-sample.json` stores preview metadata and source links, without downloading the images. Thumbnail hosts include `thumb.wikimedia.org` and `upload.wikimedia.org`. Photos are displayed cropped to fit; individual credits appear in player profiles. Player shirt fallback illustrations are original SVG artwork. News links: [first-team news](https://www.fcbarcelona.com/en/football/first-team/news), [club news](https://www.fcbarcelona.com/en/club/news), [results](https://www.fcbarcelona.com/en/football/first-team/results).

The owner approved publication. The private GitHub repository contains the source, and the public Cloudflare Worker serves the app, calendar feed and read-only football data APIs. Device testing of native sharing, Apple Calendar refresh and actual iPhone push delivery remains outstanding.

## Version 2.4.0

Match detail crests and names share the same equal-width grid columns, including narrow phones. The nearby cards place the opponent name below its crest and the score below the name; upcoming cards use the same space for kickoff time. The venue label displays the name alone, with any provider-coverage caveat in the details. Fresh loads and installed-app resumes open Home; shared match query links still open their details. The header is fixed below the iPhone safe area. Its refresh icon is replaced by a resisted pull-to-refresh indicator; a deliberate downward pull at the top refreshes on release, while sideways gestures, modal pulls and duplicate requests are ignored. The Settings refresh remains available.

Player profiles show Wikipedia biography facts (birth date, birthplace, height, position) and source links. The 7 October refresh resolved 27 biographies and 26 Barcelona shirt numbers; Jesse Bisiwu's Barcelona B number is labelled with that club, and Iker Rodríguez's unavailable number remains unknown. Numbers from another club never become Barcelona first-team numbers. Saved profiles survive source failures and refresh alongside the daily roster.

Home Screen icons now use the Barcelona crest from football-data.org on a blue/red background. Versioned PNG/SVG paths avoid old asset caches, the manifest is named Barça Matchday and starts at /#match. Existing iOS Home Screen icons can remain cached until added again from Safari. This remains an independent fan companion; the crest is a club trademark.
