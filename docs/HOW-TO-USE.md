# How to use GeoWork (admin panel + mobile app)

## 1. Start everything (3 terminals)

| What | Command | Opens at |
|---|---|---|
| API + database | `cd apps\api` then `npm run dev` | http://localhost:3100 |
| Admin panel | `cd apps\web` then `npm run dev` | http://localhost:5173 |
| Mobile app | `cd apps\mobile` then `npm run start:e` (Expo Go; picks the right Wi-Fi address) | scan the QR with **Expo Go**, or press `a` for an Android emulator |

The API uses the MongoDB on this PC unless `apps\api\.env` has a `MONGODB_URI` (Atlas).
A real phone must be on the same Wi-Fi as the PC. If it cannot connect, allow port 3100 in Windows Firewall.

## 2. First-time setup in the admin panel (about 5 minutes)

Sign in at http://localhost:5173 as the owner: `admin@demo.com` / `admin123`.

1. **Locations -> Add location.** Name it, search the address or click the map, pick a radius (50-300 m, minimum 50) or switch to **Polygon** and click the corners of the building or site. This is the geofence. An employee can only check in or out inside it.
2. **Employees -> Add employee.** Enter name, email, a password, department, work location, shift start and end, and grace minutes (how late is still "on time").
   The panel then shows the employee's **app login**, a **kiosk code** and a **kiosk PIN, shown once**. Write the PIN down; only a scrambled copy is stored.
3. **Staff & roles** (owner only): add HR, supervisors (limited to one site) or auditors (read-only). Each sees only what their role allows.

## 3. A normal day for an employee (mobile app)

1. Install and open the app, sign in with the email and password the admin created. The first login locks the account to that phone.
2. **Home** shows today's status, the live working-hours ring, and whether you are inside the work area (the distance is worked out on the phone only).
3. Tap the big round **Punch** button in the middle. The app reads GPS once, the server checks:
   - you are inside the geofence,
   - the GPS is accurate enough (50 m or better),
   - it is not a fake location, and it is your registered phone.
   A green sheet confirms **Checked in** (on time or late). Tap **Punch** again (it turns orange) to **Check out**.
4. **Break** tile: start and end a break. Break time is not counted as worked time.
5. **History**: pick a day in the week strip to see check-in, breaks and check-out, with the day's total.
6. **Reports**: submit the **weekly timesheet** for approval, and send **leave** or **time-correction** requests.
7. No internet? The punch is saved on the phone and sent when you are online. The server re-checks it and flags it.

Punch refused? The message tells you why: outside the work area, weak GPS, fake location, or not checked in / already checked in.

## 3b. Automatic attendance (no Punch button)

When switched on, the phone checks the employee **in** when they enter the work radius, recording the time they crossed it, and **out** when they leave. The Punch button still works as a fallback.

**Admin:** Locations -> add or edit a location -> tick **Automatic attendance** (on by default). Use a radius of 100 m or more; phones cannot detect smaller areas reliably.

**Employee:** Profile -> **Automatic attendance** switch. Choose **Allow all the time** for location when asked (Android needs this so the phone can notice arrival while the app is closed).

How it stays safe:
- The phone's own geofence wakes the app only at the boundary; no location trail is kept.
- The **server** still checks the position against the exact shape, rejects fake locations and unknown phones, and flags odd cases for approval.
- Repeated or bouncing events are ignored. Check-in uses the moment the phone crossed the edge (up to 30 minutes old).
- If the app is opened while the employee is already inside and not yet checked in, it checks them in then.

**One-time requirement:** automatic mode does not work inside Expo Go. Build the installable app once (needs a free Expo account, no Android Studio):

```
cd apps\mobile
npx eas-cli login
npx eas-cli build --platform android --profile development
```
Install the APK link from the build on the phone, then run `npm run start:e` and open the project from that installed app.

## 4. What the admin does day to day

- **Dashboard**: today's present / absent / late / on leave, department table, 30-day trend, alerts and a live feed.
- **Attendance -> Live tracking**: a map with each employee's last punch, **Employee log** and **Duty roster** (edit shifts inline).
- **Approvals**: three tabs.
  - *Leave requests*: approve or reject.
  - *Corrections*: approve or reject missed-punch fixes.
  - *High-risk punches*: punches the system flagged (new phone, weak GPS, impossible travel, offline time). Approve or reject; rejected ones do not count.
- **Timesheets**: approve or reject the weekly hours employees submit (hours already exclude breaks).
- **Reports**: attendance by date range, hours by employee, **export CSV**.
- **Audit log**: every change (who created, edited, approved) with time.
- Employee phone changed? **Employees -> reset device** (key icon area), then they sign in on the new phone.
- Employee left? Use the power icon to deactivate. History stays.

## 4b. Leaving the work area, forgotten check-outs and alerts

| Situation | What happens |
|---|---|
| Employee leaves the area (automatic attendance on) | Checked out automatically. If the shift is still running, an **on-duty alert** is raised: "Ali left Head Office at 14:10, 3 h 50 min before shift end". |
| Employee taps **Check out from outside** the area | Accepted, but sent to **Approvals -> High-risk punches** for review, and an on-duty alert is raised. |
| Away for longer than the site's limit (default 20 min) and not back | A second alert: "Ali has been away from Head Office for 25 min". The employee also gets a notification in the app (bell). Raised once per absence. |
| Employee comes back | Info alert: "Ali is back at Head Office after 42 min away". |
| Employee never checks out | After shift end plus the wait time (default 60 min) the day is **closed automatically at shift end**. Any open break is ended. You and the employee are told; if they worked later they send a time correction. |

Where to see it: the **Dashboard -> On-duty alerts** card (and the bell badge), and on the mobile staff Dashboard. Employees see their own notifications under the bell on Home. **Mark all seen** clears the badge (owner, HR and supervisors).
Change the rules per site: **Locations -> shield icon (Duty rules)** - turn auto close on/off, set the wait after shift end (0-480 min) and the away limit (5-240 min).
The check runs on the API server once a minute, so the API must be running. Alerts for supervisors cover only their own site. Manual-mode employees who never open the app cannot be tracked while away: only the automatic geofence reports leaving.

## 5. Shared kiosk (front desk tablet)

For people without a smartphone: **Locations -> Kiosks -> Create kiosk** for a site, then open the generated link on the tablet.
Employees type their **kiosk code and 4-digit PIN**. Five wrong PINs lock that employee at that kiosk for 5 minutes. Kiosk punches are marked "kiosk" in the feed.

## 6. Supervisors and other staff on mobile

Staff accounts (HR, supervisor, auditor, owner) sign in to the **same mobile app** and get a staff view: **Dashboard, Team, Approvals, Profile**.
Owner, HR and supervisors can approve there; auditors see read-only.
Drawing locations and managing employees is done in the web panel.

## 7. Demo logins

| Role | Login |
|---|---|
| Owner | admin@demo.com / admin123 |
| HR | hr@demo.com / hr123 |
| Auditor | auditor@demo.com / aud123 |
| Employee | sara@demo.com / pw123 (also ahmed, bilal, hina, omar, zainab, usman, ayesha, all pw123) |

## 8. Privacy by design

Location is read when the employee taps Punch and, only if they turn on automatic attendance, when the phone crosses the work-area boundary. There is no continuous tracking and no route is stored. Stored per punch: time, coordinates, accuracy and device.

## 9. Not built yet

Several sites per employee, time-windowed fences, push notifications, payroll export (Excel/PDF) and the AI assistant.
Also not done: testing the mobile app on a physical phone, and publishing to Google Play / the App Store.
