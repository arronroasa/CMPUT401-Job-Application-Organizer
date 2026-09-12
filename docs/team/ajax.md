# Agent Brief: Ajax

## Role
Interaction Engineer — you own the two most interaction-heavy features: Kanban drag-and-drop (Applications) and the split-pane editor (Resume Studio). These are complex UI features requiring careful state management.

## Assigned Packages
- `packages/feature-applications` — Kanban board with drag-and-drop
- `packages/feature-resume-studio` — Resume split-pane editor

## Prerequisite
Wait for Sashreek's PRs (`feat(core)`, `feat(api)`, `feat(app)`) to merge before starting.

---

## Task 1: Improve feature-applications Kanban

Read all files in `packages/feature-applications/src/`.

**Current state:** Basic Kanban renders. Drag-and-drop moves cards between columns. Detail modal opens on click.

**Your improvements:**

1. **Fix drag-and-drop click conflict**: Currently `ApplicationCard` has both `useDraggable` listeners and an `onClick`. The click fires even after a drag. Fix this by tracking whether a drag actually occurred (use a `hasDragged` ref or check `transform` before firing onClick).

2. **Add column count animation**: When a card is dropped, the column badge count should update immediately (it already does via Zustand). Verify this works correctly end-to-end.

3. **Improve ApplicationDetailModal**:
   - Add an "Edit" button (stub — just logs to console)
   - Add a "Submit Application" button that only shows when `status === 'approved'`. On click: log `[stub] Submit application ${draft.id}` and close the modal.
   - Add a "Mark as Interview" button that appears when `status === 'submitted'`. On click: calls `moveDraft(draft.id, 'interview')` from the store and closes the modal.

4. **Add an empty state** for columns with no cards: show a faint "Drop cards here" placeholder (already scaffolded — verify it renders correctly).

**Definition of done:** Kanban renders all 5 columns. Cards drag between columns. Detail modal shows correct data. No TypeScript errors.

---

## Task 2: Improve feature-resume-studio

Read all files in `packages/feature-resume-studio/src/`.

**Your improvements:**

1. **VersionList improvements**:
   - Add a creation date below the strength score: `Created: Feb 16, 2026`
   - Add a "tailored for" badge (already showing company name — verify it's visible)
   - Sort versions: base always first, then tailored sorted by `createdAt` descending

2. **ResumePreview improvements**:
   - Add a "Resume Match" score bar at the top showing `strengthScore`% as a colour-coded progress bar (same pattern as SkillsSection in profile: green ≥80, amber ≥65, gray otherwise)
   - Add keyword coverage and skill alignment as small secondary stats below the score bar

3. **ExportButtons**:
   - When `exportPdf` is clicked, show a brief toast-like message: "PDF export requires backend connection. JSON export is available now." — implement this as a simple `alert()` stub for now.

4. **DiffView**:
   - Add a stat row at the top of each column: "X fragments, strength Y%"
   - Highlight fragments that appear in one version but not the other with a subtle left border colour (green = added, red = removed). Use fragment `id` to compare.

**Definition of done:** Resume Studio renders both base and tailored resumes. Compare mode shows DiffView. JSON export works (downloads file). No TypeScript errors.

---

## Git Workflow

```bash
# Before starting:
git fetch origin
git checkout main
git pull origin main

# Task 1:
git checkout -b feature/ajax/applications-kanban
git add packages/feature-applications/
git commit -m "feat(feature-applications): fix drag-click conflict, improve modal actions"
git push origin feature/ajax/applications-kanban
gh pr create --title "feat(feature-applications): kanban improvements and modal actions" --base main

git checkout main && git pull origin main
git checkout -b feature/ajax/resume-studio
git add packages/feature-resume-studio/
git commit -m "feat(feature-resume-studio): improve preview, diff view, version list"
git push origin feature/ajax/resume-studio
gh pr create --title "feat(feature-resume-studio): resume studio improvements" --base main
```

## Rules
- ONLY stage files inside `packages/feature-applications/` and `packages/feature-resume-studio/`
- Never use `git add .` or `git add -A`
- Never modify `packages/app/`, `packages/core/`, `packages/api/`, `packages/ui/`
- If you need a new shared component, request it from Raghav (packages/ui owner)
- If you need a new type, request it from Sashreek (packages/core owner)
- Never commit to main directly

---

# Backend Assignment: Application Draft Engine + Controlled Submission Engine

## Role
You own the two most sensitive backend engines. The draft engine prepares applications without submitting anything. The submission engine uses browser automation to fill and submit forms only after explicit user approval. Safety is the #1 constraint — nothing ever submits without `status === 'approved'`.

## Assigned Backend Path
`backend/app/engines/applications/`

## Prerequisite
Wait for Sashreek's `feat(backend/db-schema)` PR to merge. You read/write to `application_drafts` and `jobs` tables.

## Task 3: Build the Application Draft Engine

### Step 1: Form Analyzer

Create `backend/app/engines/applications/form_analyzer.py`:

```python
# Input: job URL (str)
# Output: list of FormField dicts
#
# Uses Playwright (async) to:
# 1. Open the job URL in a headless browser
# 2. Scan the DOM for: input[type=text], input[type=email], textarea, select, input[type=file]
# 3. For each field, extract: type, label (from associated <label> or placeholder), required (bool), options (for select)
# 4. Return structured list of FormField dicts
# 5. Close browser after scan
# 6. Timeout: 15 seconds max per page
# 7. On any error: return empty list + log error (never crash)
#
# This function never fills or submits anything — read-only DOM scan only
```

Add `playwright` to `backend/requirements.txt`. After install run `playwright install chromium`.

### Step 2: Draft Generator

Create `backend/app/engines/applications/draft_generator.py`:

```python
# Input: job dict (from DB), user_profile dict, form_fields list
# Output: filled_answers dict (field_label → generated_value)
#
# Simple field mapping (no LLM needed for these):
#   "Full Name" / "Name" → profile.name
#   "Email" → profile.email
#   "Phone" → profile.phone
#   "LinkedIn" → profile.linkedin_url
#   "GitHub" → profile.github_url
#   "Location" / "City" → profile.location
#
# Experience dropdown:
#   If label contains "years of experience" + skill_name:
#     Look up skill in profile.skills_json, return experience years
#
# Essay/screening questions (label contains "why", "tell us", "describe"):
#   Return a placeholder: "[REQUIRES_REVIEW: {field_label}]"
#   These must be reviewed and filled by the user before approval
#
# Resume upload fields:
#   Store field label + note "resume_upload_required: true" in answers
#
# Never generate false information. If unsure → use placeholder.
```

### Step 3: Draft API Router

Create `backend/app/routers/drafts.py`:

- `POST /drafts/prepare` — body: `{ job_id, resume_version_id }`:
  1. Load job from DB (404 if not found)
  2. Load user profile from DB
  3. Run `form_analyzer` on `job.source_url` to get form fields
  4. Run `draft_generator` to fill known fields
  5. INSERT new row into `application_drafts` with `status='drafted'`
  6. Return the created draft
- `GET /drafts/{draft_id}` — return single draft
- `PATCH /drafts/{draft_id}` — update `filled_answers_json` (user edits answers)
- `POST /drafts/{draft_id}/approve` — set `status='approved'`, set `approved_at`
- `POST /drafts/{draft_id}/reject` — set `status='rejected'`

### Step 4: Controlled Submission Engine

Create `backend/app/engines/applications/submission_engine.py`:

```python
# submit_application(draft_id, db_conn) async function
#
# SAFETY CHECKS (abort with error if any fail):
# 1. Load draft from DB — must exist
# 2. draft.status MUST be 'approved' — reject all others with ValueError
# 3. Check daily submission count from application_drafts WHERE submitted_at >= today
#    If count >= daily_cap (default 10, from settings) → abort with RateLimitError
#
# SUBMISSION FLOW (using Playwright):
# 1. Open Chromium browser (non-headless so user can see it happening)
# 2. Navigate to job.source_url
# 3. Wait for page load (networkidle)
# 4. For each field in draft.form_structure_json:
#    a. Scroll field into view
#    b. Wait random delay (300–1200ms) — asyncio.sleep(random.uniform(0.3, 1.2))
#    c. Fill field with draft.filled_answers_json[field.label]
#    d. Skip fields marked [REQUIRES_REVIEW] — these should never reach submission
# 5. Upload resume file if resume_upload_required (use resume_version PDF path)
# 6. DO NOT click submit automatically — take a screenshot, return "ready_for_final_approval"
#    The actual final submit click requires a second explicit API call (see below)
# 7. On any error: close browser, log error, return failure status — never leave browser hanging
#
# POST /drafts/{draft_id}/submit-final → ONLY this endpoint clicks the submit button
# This double-approval ensures user sees the filled form before final submission
```

Add `POST /drafts/{draft_id}/submit` to `drafts.py` router — calls `submission_engine.submit_application()`. Returns either `{ status: 'ready_for_final_approval', screenshot_path }` or error.

Add `POST /drafts/{draft_id}/confirm-submit` — the second approval that actually clicks submit. After success: set `status='submitted'`, set `submitted_at`, log to `discovery_runs`.

**Definition of done:**
- `POST /drafts/prepare` creates a draft with form fields and filled answers
- Fields with known mappings (name, email, etc.) are pre-filled
- Screening questions show `[REQUIRES_REVIEW: ...]` placeholders
- `POST /drafts/{id}/approve` only works, `reject` and submission safety checks work
- Daily cap check prevents more than 10 submissions per day
- Playwright opens a visible browser window on submit (non-headless)

## Git Workflow (backend)

```bash
git checkout main && git pull origin main
git checkout -b feature/ajax/application-engine
git add backend/app/engines/applications/ backend/app/routers/drafts.py backend/requirements.txt
git commit -m "feat(backend): application draft engine, form analyzer, controlled submission"
git push origin feature/ajax/application-engine
gh pr create --title "feat(backend): application draft + controlled submission engine" --base main
```

- ONLY stage files inside `backend/`
- Do not modify `backend/app/db/` — that is Sashreek's domain
- Never implement auto-submit without the double-approval flow
- Never run submission in headless mode — user must see the browser
