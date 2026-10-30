# Geofenced Attendance App: Market Research and Product Strategy

Prepared 2026-10-29. Pricing was checked through web search on 2026-10-29. Most sources are vendor or competitor blogs and they conflict with each other, so **treat every price as indicative and confirm on the vendor's own pricing page before showing the client.**

---

## 1. Executive summary

- Most "geofence attendance" products are time clocks with a GPS check added. They answer "was the worker inside the circle when they tapped?" That is the weakest version of the feature.
- Real gaps in the market: spoof resistance, offline punching, battery use, worker privacy, a clean dispute/correction workflow, local-market fit, and per-user pricing that hurts firms with many low-margin workers.
- Recommended position: **"Fraud-resistant attendance that respects workers' privacy, works offline, and is priced per site or flat tier."**
- Recommended build: React Native app (Worker + Admin by role), React admin web dashboard, Node.js API, PostgreSQL + PostGIS. All geofence decisions are made on the server.

## 2. Market map

| Segment | Examples | Strength | Weakness |
|---|---|---|---|
| Time-tracking | Clockify, Jibble, Hubstaff, TMetric | Cheap or free, fast setup | Shallow HR depth, little shift logic |
| Scheduling-first | Deputy, When I Work, Homebase | Rosters, swaps, labour cost | Attendance secondary, per-user cost climbs |
| All-in-one frontline | Connecteam | Attendance + chat + tasks + training | Broad, geofence is one feature among many |
| Field-crew | OnTheClock, Buddy Punch, Jolt | Job-site punching, multi-method checks | Dated UX, limited analytics |

## 3. Competitor breakdown (pricing as of Oct 2026, indicative)

| Product | Reported price | Geofencing / verification notes | Target |
|---|---|---|---|
| **Jibble** | Free tier (unlimited users, about 2 geofences). Paid Premium about $3 to $6 per user/month, Ultimate about $6 to $11 (sources disagree; one says Premium rose to $4.49 in Mar 2026) | GPS stamps, selfie/face recognition, geofence restrictions, kiosk; unlimited geofences are paid | SMBs, cost-sensitive. Closest feature competitor |
| **Deputy** | Lite $5, Core $6.50, Pro $9 per user/month annual; $30 monthly minimum (changed 1 Oct 2025) | Scheduling-first, kiosk, geofence and biometrics | Restaurants, retail, Western markets |
| **When I Work** | About $2.50 to $5 per user/month | Rotating shifts, praised geofence accuracy | Shift teams |
| **Connecteam** | Free up to 10 users, then about $29/month for first 30 users, about $1 per extra user (per hub) | GPS + geofence inside a wider frontline suite | Deskless teams |
| **Buddy Punch** | About $4.99 to $5.99 per user + $19/month base; real-time GPS about +$2 per user | Multi-method punch (face, GPS, QR) | Small field crews |
| **OnTheClock** | About $3.50 to $4.49 per user/month; payroll add-on and setup fee extra | GPS, IP, Wi-Fi, device restrictions (layered) | Small crews |
| **Clockify** | Free capped at 5 users since Apr 2026; GPS needs paid plan | Records GPS but weak enforcement of fences | Freelancers, small teams |
| **Hubstaff** | About $5 to $10 per seat/month, no free plan | GPS, job-site, budget alerts | Remote and field teams |
| **Homebase** | Free up to 10 employees at one location; paid up to about $100 per location/month | Geofence time clock + scheduling | Small single-site shops |
| **Jolt, Calamari, uAttend** | Not verified | Tablet face kiosk (Jolt); Slack/Teams clock-in (Calamari) | Niche |

Read-across: price per user sits at roughly $3 to $10 per month. A 100-worker firm pays about $300 to $1,000 per month. A per-site or flat model is a real differentiator.

## 4. Gaps nobody fills well (our opportunity)

| Gap | Why it matters | Our answer |
|---|---|---|
| Spoof resistance | Fake-GPS and rooted phones are the biggest hole; many vendors only claim to handle it | Server-side validation, mock-location flag, Play Integrity / App Attest, device binding, risk score |
| Poor connectivity | Basements, remote sites, construction zones | Offline punches stored with device-signed timestamp, validated on sync, flagged if clock drift |
| Battery drain | Continuous GPS makes workers uninstall | Use OS geofencing (Android Geofencing Client, iOS region monitoring); read precise GPS only at punch and fence events |
| Privacy and trust | Workers resent tracking | Privacy screen showing exactly when location is read; no tracking outside shifts, enforced in code |
| Disputes | "I was there but it didn't register" is the top complaint | Correction request with reason + evidence, supervisor approval, audit trail |
| Local fit | Local languages, low-end Android, daily-wage workers | Android-first, multilingual/RTL, WhatsApp/SMS notices, light app |
| Pricing | Per-user hurts low-margin firms | Per-site or flat tiers |

## 5. Feature set

### Worker app
- Login (phone/OTP or email), device registered on first login
- Today's shift, site, supervisor
- Check in / check out (button enabled only inside the fence; server decides)
- Break and overtime handling
- Attendance history, live hours total
- Leave and correction requests with reason
- Notifications: shift reminder, "you are at the site, check in?"
- Language switch (RTL ready)
- Privacy screen: when location is and is not read
- Offline queue

### Admin (mobile + web)
- Add/import workers, assign to sites and shifts
- Draw geofence (circle or polygon) on map; radius; active hours; per-person exceptions
- Multiple sites and temporary field sites
- Live board: in, late, absent, on break
- Approvals: leave, corrections, overtime, high-risk punches
- Shift and roster builder
- Reports with CSV export (daily, monthly, by site, by person)
- Roles: owner, HR/admin, site supervisor, read-only auditor
- Audit log of every change

### Geofence rules
- Must be inside to check in; optional "clock out only inside" or auto clock-out on exit
- Grace period and minimum dwell time (a drive-by does not count)
- Time windows (fence only valid during the shift)
- Per-site and per-person exceptions
- Minimum fence radius (about 50 m) and accuracy threshold (reject if GPS accuracy is worse than about 50 m, or require supervisor review)

## 6. Making it intelligent

### A. Anti-fraud (risk score per punch: low / medium / high)
| Signal | Method | Phase |
|---|---|---|
| Location inside fence | PostGIS `ST_DWithin` / `ST_Contains` on server | MVP |
| Server clock | Never trust phone time | MVP |
| Accuracy radius | Reject or flag poor accuracy | MVP |
| Mock location flag | Android `isMock` / mock provider detection | V1 |
| Root/jailbreak, tamper | Play Integrity (Android), App Attest (iOS) | V1 |
| Device binding | One worker, one device, admin-approved change | MVP |
| Impossible travel | Speed between consecutive punches | V1 |
| Signal fusion | Wi-Fi BSSID, cell, Bluetooth beacon at site | V2 |
| Face liveness | Always or only on high risk | V2 |
Low-risk punches auto-approve; only high-risk ones reach a human.

### B. Smart automation
- Entry prompt: "You are at the site, check in?" (auto check-in as an admin option later)
- Forgotten check-out detection: worker left the zone, so propose a correction rather than a corrupted record
- Commute learning: "likely 15 min late" alerts before shift start
- Offline-first with server validation on sync

### C. Analytics and AI insights
- Lateness and absence patterns by team, weekday, site
- Overtime/burnout risk alerts
- Anomaly detection (identical arrival minute every day, odd clustering at a site)
- Natural-language admin queries ("who was late more than 3 times this month at Site B?")
- Staffing and labour-cost forecasting; auto monthly manager summaries

### D. Battery and privacy intelligence
- OS-native geofence events, not continuous polling
- Precise location only at check-in, check-out, and transitions
- No tracking outside work hours, shown in UI and enforced in code

### E. Integrations
Payroll exports then direct sync, accounting, QR/biometric kiosk fallback, WhatsApp/SMS, webhooks/API.

## 7. Architecture

| Layer | Choice (agreed) |
|---|---|
| Mobile | React Native (Expo with dev build; native modules for geofencing/mock detection) |
| Admin web | React + Vite |
| Backend | Node.js (Fastify or NestJS), REST + WebSocket for live board |
| Database | PostgreSQL + PostGIS |
| Auth | JWT, role-based access, OTP later |
| Maps | MapLibre/Leaflet with a tile provider (see below) |
| Notifications | FCM/APNs, SMS/WhatsApp later |
| Storage | Encrypted object storage for evidence, face templates later |
| Tenancy | Multi-tenant (org_id on every row) from day one |

Critical rules:
1. Validate on the server only; the phone's "I am inside" is a hint.
2. Store raw evidence per punch: coordinates, accuracy, device ID, mock flag, server time, risk score.
3. Make audit records tamper-evident (append-only, hash chain later).
4. Budget real time for iOS/Android background-location rules and store review.

### Map options (geofence maths needs no map; maps only draw fences and preview punches)
| Option | Cost | Note |
|---|---|---|
| OSM public tiles + Leaflet/MapLibre | Free | Prototype only; policy forbids heavy production use |
| Mapbox | Free tier around 50k loads/month | Best look; usage pricing after |
| MapTiler / Stadia | About $20 to $30/month paid | Free plans are non-commercial |
| Self-hosted OSM tiles | About $20 to $50/month server | Truly free licence, you maintain it |
| Google Maps | Free monthly credit then usage | Costs rise at scale |
Check the client's region on each provider's demo map before choosing.

## 8. Cost notes
- Fixed: Apple Developer about $99/year, Google Play about $25 one-time.
- Hosting: a small VPS or managed Postgres, about $20 to $60/month at pilot scale.
- Maps: $0 prototype, about $0 to $30/month pilot.
- SMS/WhatsApp: per message.
- Largest cost is development time. Free tiers are fine for a prototype, not for a paying client's production.

## 9. Risks and compliance
- Location and face data are sensitive: explicit consent, retention periods, worker access to own data; check local law and GDPR-style principles.
- Store face templates, not photos, encrypted.
- Records may be used in labour disputes: keep them tamper-evident.
- App-store background-location use must be justified or the app is rejected.
- Worker adoption is a product problem: visible privacy design, fair correction flow.

## 10. Roadmap
| Phase | Scope |
|---|---|
| MVP (about 3 months) | Worker check-in/out, admin fence drawing, live dashboard, basic reports, server validation, offline punches |
| V1 | Leave and corrections, shifts/rosters, mock-location detection, multi-site, exports |
| V2 | Face verification, signal fusion, risk scoring, payroll integration |
| V3 | Predictive insights, natural-language reporting, wage/compliance modules |

## 11. Questions for the client
1. How many workers and sites; fixed or changing sites?
2. Industry (construction, retail, security, factory, field sales)?
3. How serious is fraud today (buddy punching, fake GPS)?
4. Payroll integration or reports only?
5. Regions and languages?
6. Budget and timeline?
7. Android only or iOS too? Worker phone quality?

## Sources (search results, 2026-10-29)
- Jibble: [actitime](https://www.actitime.com/software-collections/jibble-pricing), [Connecteam review](https://connecteam.com/reviews/jibble/), [HiveDesk](https://www.hivedesk.com/jibble-review), [Dupple](https://dupple.com/reviews/jibble)
- Deputy/When I Work/Connecteam/Buddy Punch: [Rework](https://resources.rework.com/tools/workforce-management/best-connecteam-alternatives), [Costbench](https://www.costbench.com/compare/connecteam-vs-buddy-punch/), [Noon](https://www.noon.ai/blog/articles/438-deputy-pricing-2026)
- Hubstaff/Homebase/OnTheClock/Clockify: [Homebase blog](https://joinhomebase.com/blog/best-geofencing-time-clock/), [FitSmallBusiness](https://fitsmallbusiness.com/human-resources/best-gps-geofencing-time-clock-apps/), [NextBillion](https://nextbillion.ai/feeds/blog/time-clock-software-gps-geofencing-2025)
