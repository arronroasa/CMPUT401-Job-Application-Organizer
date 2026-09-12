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
- `/resumes` — one master resume plus tailored copies per application. Paste a
  job description to get AI-suggested edits per section (accept or dismiss each
  one), check which of your skills the posting mentions, link a copy to an
  application, and export to PDF via the browser's print dialog

## AI tailoring (Gemini)

On `/resumes`, "Suggest tailored edits" sends the current resume and the pasted
job description to Google's Gemini and returns per-section suggestions plus
skills to add. It works with no key too: without one it returns canned,
job-description-aware suggestions so the feature always demos.

To enable live results:

1. Get a free key at https://aistudio.google.com/apikey
2. `cp .env.example .env.local` and paste the key into `NEXT_PUBLIC_GEMINI_API_KEY`
3. Restart `npm run dev`

The key is a `NEXT_PUBLIC_` var, so it ships in the browser bundle. That is fine
for a local demo; do not push a real key to a public deployment.

## Tech

- Next.js 14 (App Router), React 18
- Tailwind CSS for styling
- lucide-react for icons
- No database, no API routes — see `lib/store.js` for the data layer

See setup steps in the chat message this was shared alongside.
