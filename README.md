# TrackWise — Job Application Organizer (frontend only)

A Next.js + React frontend for the hackathon brief. No backend or database —
all data lives in the browser's `localStorage`, seeded with demo data on first
load, so the app is fully usable out of the box.

## Pages

- `/` — Today: stats, follow-ups due, pipeline-at-a-glance, recent activity
- `/pipeline` — drag-and-drop kanban board across Applied → Screening →
  Interview → Offer → Closed
- `/applications` — searchable/filterable table; click a row to open the
  detail panel (stage control, next action, timeline, communications log)
- `/resumes` — one master resume plus tailored copies per application, with a
  simple keyword checker against a pasted job description, and a PDF export
  (via the browser's print dialog)

## Tech

- Next.js 14 (App Router), React 18
- Tailwind CSS for styling
- lucide-react for icons
- No database, no API routes — see `lib/store.js` for the data layer

See setup steps in the chat message this was shared alongside.
