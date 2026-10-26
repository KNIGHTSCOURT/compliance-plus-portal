# Compliance Plus Portal

Inspection portal for Compliance Plus: fire door inspections, fire risk
assessments, health & safety risk assessments and PAT testing, with 2D/3D
building plans and a QR label on every item.

## What it does

- **Clients → Sites → Floors → Rooms → Items.** Each item (fire door, PAT
  appliance, extinguisher, emergency light, alarm device, sign, H&S hazard
  point, other) gets a reference like `CP-00001` and a QR code.
- **Plans.** Upload the client's floor plan image, set the scale by tapping two
  points of a known distance, draw rooms over it, and tap to place items.
  The **3D view** stacks the floors and shows every item as a pin coloured by
  its last result.
- **Inspections.** Checklists for each item type with Pass / Fail / N/A,
  readings with automatic limit checks (fire door gaps, PAT earth continuity,
  insulation resistance, leakage), photos, recommended action and next due date.
  "Save & Next Item" walks through a site quickly.
- **Risk assessments.** Fire risk assessment in PAS 79-1 layout with the risk
  matrix and action plan; H&S risk assessment using the HSE five steps with a
  5×5 risk score and common hazard presets.
- **Reports.** One click builds a client report: cover, summary, 3D overview,
  floor plans with numbered pins, fire door schedule, PAT register, other
  equipment, defects with photos, risk assessments and sign-off. Print → Save As
  PDF.
- **QR labels.** Printed on standard Avery A4 sheets (L7160, L7163, L7651), with
  a start position for part-used sheets. Scanning a label opens that item.

## Where the data is kept

- **Live site:** https://knightscourt.github.io/compliance-plus-portal/ (GitHub Pages, `main` branch).
- **Database:** Supabase project *Compliance Plus* (`kfkuadgggflaqhntmarw`, London).
  `supabase/schema.sql` is the database setup; `supabase/functions/invite-user`
  creates login links.
- Each device keeps a full copy (IndexedDB) so inspections work with no signal;
  changes queue up and sync when back online (`js/cloud.js`).
- **Staff** (emails in the `staff_emails` table) see and edit everything.
  **Client logins** are created from the client's page (*Invite Login*) and can
  only view that client's sites, plans, results and reports — enforced by the
  database's row level security, not just the screens.
- `tests/sync-test.html` checks the sync logic against an in-memory stand-in for
  Supabase (open it on the local preview server).

## Running it locally

From the `GitHub Projects` folder the preview server is set up in
`.claude/launch.json` as `compliance-plus` (http://localhost:8130).
Any static web server works, e.g.

    python -m http.server 8130 --directory compliance-plus-portal

## Editing

- Checklists, item types and risk assessment questions: `js/checklists.js`
- Report layout: `js/report.js`
- Business defaults: `config.js` (Settings in the portal override these)
- When releasing changes, bump the `?v=` numbers in `index.html` and the
  version in `config.js` so browsers load the new files.
