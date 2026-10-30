# Geofenced Attendance System (prototype)

- `docs/research.md`: market research, competitors, feature and intelligence strategy, roadmap
- `apps/api`: Node.js + Fastify API (geofence, risk score, status logic). Data is stored in MongoDB (Atlas)
- `apps/web`: React + Leaflet admin dashboard (Plus Jakarta Sans, light/dark). Dashboard (overview donut, department table, 30-day trend, alerts, live feed), Attendance (live map with avatar pins, employee log, duty roster), Employees, Approvals, Timesheets, Reports, Locations (+ kiosks), Staff & roles, Audit log
- `apps/mobile`: React Native (Expo). Worker: today's status ring with live hours, break tracking, floating Punch button, week and month overview, history timeline, timesheet, leave/correction requests, profile and privacy. Staff roles: dashboard, team, approvals

## Run
```
cd apps/api    && npm install && npm run dev      # http://localhost:3100 (needs apps/api/.env, see below)
cd apps/web    && npm install && npm run dev      # http://localhost:5173
cd apps/mobile && npm install && npx expo start   # Android emulator uses 10.0.2.2; for a real phone set EXPO_PUBLIC_API_URL=http://<PC-LAN-IP>:3000
```
Tests: `cd apps/api && npm test` (41 tests).

Flow: create an organisation in the web dashboard, draw a site, add a worker with that site, then sign in as the worker in the mobile app. In an emulator, set the mock GPS location inside the site circle.

## Known limits of this prototype
- Server-side checks: fence, accuracy, server clock, device binding, mock flag, impossible travel. Root detection, Play Integrity / App Attest, face check, signal fusion are not built (see research roadmap).
- Mock-location detection relies on the Android `mocked` flag, which a determined user can bypass.
- OSM public tiles are for testing only. Pick a production tile provider.
- Offline punches use the device clock (capped to 48h and flagged as unverified).
- Mobile app was bundled successfully but not run on a device/emulator here.

## Roles
| Role | Can do |
|---|---|
| Owner | Everything, including creating/disabling staff accounts (created when an organisation is registered) |
| HR | Sites, workers, approvals, reports, audit log. No staff management |
| Site supervisor | Only workers at their own site: live board, approvals, reports. Cannot edit sites or workers |
| Auditor | Read-only view of board, approvals, reports and audit log |
| Worker | Mobile app only: check in/out, history, leave and correction requests |

Roles are defined in `apps/api/src/roles.js`. The API reads the role from the database on every request, so disabling an account or changing its role applies immediately.

## Clockify-style features (on top of geofence enforcement)
- **Who is where (Map tab):** pins from each worker's last punch, per-day route of punches, supervisor scope respected. Location exists only at punch time.
- **Weekly timesheets:** worker reviews hours per day in the app and submits the week; HR/supervisor approves or rejects with a note; rejected weeks can be resubmitted.
- **Kiosk mode:** create a kiosk for a site (Sites tab), open its link on a shared tablet, workers punch with worker code + PIN. Punches use the site position and are marked "kiosk". 5 wrong PINs lock that worker at that kiosk for 5 minutes. PINs are shown once and stored hashed.
- Already present: one-tap clock-in, offline queue that syncs later, leave and correction approvals, CSV export.

## Demo accounts (local database)
| Who | Login |
|---|---|
| Owner (web + mobile staff view) | admin@demo.com / admin123 |
| HR | hr@demo.com / hr123 |
| Auditor (read-only) | auditor@demo.com / aud123 |
| Employees (mobile) | sara@demo.com, ahmed@demo.com, bilal@demo.com, hina@demo.com, omar@demo.com, zainab@demo.com, usman@demo.com, ayesha@demo.com, all with password pw123 |

The API runs on port 3100. The web app reads it from `apps/web/.env`; the mobile app finds it automatically (or set `EXPO_PUBLIC_API_URL`).

## Database (MongoDB Atlas)
1. In Atlas: create a free cluster, add a database user, and under Network Access allow your IP.
2. Copy `apps/api/.env.example` to `apps/api/.env` and paste the connection string into `MONGODB_URI`.
3. Start the API: `cd apps/api && npm run dev`. Collections and indexes are created on first start.
4. To bring over the old demo data from the SQLite file (`attendance.db`), run once against an empty database: `npm run migrate:sqlite`.

Tests (`npm test`) run against a temporary local MongoDB that is downloaded on first use (about 800 MB).
# Attendance-Management-System
