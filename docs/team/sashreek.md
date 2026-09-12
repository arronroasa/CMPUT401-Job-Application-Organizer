# Agent Brief: Sashreek

## Role
Integration Owner — you own the type contracts, mock data, app wiring, and routing. Nothing ships without your types being stable first. You are the first person whose work must land on main before anyone else can proceed.

## Assigned Packages
- `packages/core` — all TypeScript domain interfaces
- `packages/api` — mock functions + data
- `packages/app` — Vite entry, FeatureRegistry, router, AppShell wiring

## Current State
All three packages are scaffolded with full source code. Your job in this phase is to **review, validate, and improve** them — not rewrite from scratch.

---

## Task 1: Validate and stabilise packages/core types

Read every file in `packages/core/src/types/`. Ensure:
- All types are exported from `packages/core/src/index.ts`
- `FeatureModule` and `NavItem` are exported from `packages/core/src/registry.ts` AND re-exported from `packages/core/src/index.ts`
- No circular references exist between type files
- All optional fields are marked with `?`

**Definition of done:** Running `cd packages/core && npx tsc --noEmit` produces zero errors.

---

## Task 2: Validate and extend packages/api mock data

Read all files in `packages/api/src/mock-data/`. Verify:
- Job IDs used in `applications.ts` (`job-001`, `job-002`, etc.) match IDs defined in `jobs.ts`
- Resume version IDs used in `applications.ts` (`rv-001`, `rv-002`, etc.) match IDs in `resume-versions.ts`
- `interview-kits.ts` has `applicationId: 'app-001'` which matches `applications.ts` `app-001`
- All mock data is typed correctly against `@onfile/core` types

Fix any ID mismatches you find.

**Definition of done:** All mock data files compile without TypeScript errors.

---

## Task 3: Wire packages/app and verify dev server starts

1. Read `packages/app/src/router.tsx` — ensure all 7 feature imports resolve
2. Read `packages/app/vite.config.ts` — ensure all alias paths are correct
3. Read `packages/app/tailwind.config.js` — ensure all feature package paths are in the `content` array
4. Run `pnpm install` from the repo root
5. Run `pnpm dev` and verify Vite starts at `http://localhost:5173`
6. Navigate to each route: `/jobs`, `/applications`, `/resume-studio`, `/interviews`, `/insights`, `/profile`, `/settings`
7. Fix any import errors or missing exports that prevent the dev server from starting

**Definition of done:** `pnpm dev` starts without errors and all 7 routes render without crashing.

---

## Git Workflow

```bash
# Before starting any task:
git fetch origin
git checkout main
git pull origin main

# Create a branch per task (not per file):
git checkout -b feature/sashreek/core-types
# ... make changes ...
git add packages/core/
git commit -m "feat(core): stabilise domain types and registry exports"
git push origin feature/sashreek/core-types
gh pr create --title "feat(core): stabilise domain types" --base main

# New branch for next task:
git checkout main && git pull origin main
git checkout -b feature/sashreek/api-mock-data
git add packages/api/
git commit -m "feat(api): fix mock data ID consistency"
git push origin feature/sashreek/api-mock-data
gh pr create --title "feat(api): fix mock data ID consistency" --base main

git checkout main && git pull origin main
git checkout -b feature/sashreek/app-wiring
git add packages/app/
git commit -m "feat(app): wire all features and verify dev server"
git push origin feature/sashreek/app-wiring
gh pr create --title "feat(app): feature registry wiring and dev verification" --base main
```

## Rules
- ONLY add/stage files inside `packages/core/`, `packages/api/`, `packages/app/`
- Never use `git add .` or `git add -A`
- Never commit to main directly
- Never modify files in other feature packages
- If a type change is needed in `packages/core`, make it yourself — you own it
- Merge your PRs before other team members start, so their imports resolve

---

# Backend Assignment: SQLite Schema + Data Layer

## Role
You own the entire persistence layer. Every other backend engine (job discovery, resume generation, submission) writes to and reads from the database you design. Your schema must be stable before anyone else's backend work can proceed.

## Assigned Backend Path
`backend/app/db/`

## Task 4: Design and implement the SQLite schema

Create the following files:

**`backend/app/db/__init__.py`** — empty

**`backend/app/db/database.py`** — SQLite connection using Python's built-in `sqlite3`. Create a `get_db()` function that returns a connection with `row_factory = sqlite3.Row`. Database file path: `./data/career_copilot.db`. Auto-create the `data/` directory if it doesn't exist.

**`backend/app/db/schema.py`** — `init_db()` function that runs `CREATE TABLE IF NOT EXISTS` for all tables below. Call this from `backend/app/main.py` on startup.

**Tables to create:**

```sql
-- User profile (single row, local app)
CREATE TABLE IF NOT EXISTS user_profile (
    id TEXT PRIMARY KEY DEFAULT 'local',
    name TEXT,
    email TEXT,
    phone TEXT,
    location TEXT,
    linkedin_url TEXT,
    github_url TEXT,
    summary TEXT,
    skills_json TEXT,         -- JSON array of skill objects
    experience_json TEXT,     -- JSON array of experience objects
    projects_json TEXT,       -- JSON array of project objects
    certifications_json TEXT, -- JSON array of certification objects
    role_interests_json TEXT, -- JSON array of role interest objects
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Jobs discovered by the job discovery engine
CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    company TEXT NOT NULL,
    location TEXT,
    remote INTEGER DEFAULT 0,  -- 0/1 boolean
    description TEXT,
    skills_required_json TEXT, -- JSON array of skill strings
    source TEXT,               -- 'linkedin', 'greenhouse', 'rss', etc.
    source_url TEXT,
    match_score REAL DEFAULT 0.0,
    match_tier TEXT DEFAULT 'low',  -- 'high', 'medium', 'low'
    posted_date TEXT,
    discovered_at TEXT DEFAULT (datetime('now')),
    is_archived INTEGER DEFAULT 0
);

-- Resume versions (base + job-tailored)
CREATE TABLE IF NOT EXISTS resume_versions (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    type TEXT NOT NULL,        -- 'base' or 'tailored'
    job_id TEXT REFERENCES jobs(id),
    content_json TEXT,         -- structured resume fragments as JSON
    strength_score REAL DEFAULT 0.0,
    keyword_coverage REAL DEFAULT 0.0,
    skill_alignment REAL DEFAULT 0.0,
    created_at TEXT DEFAULT (datetime('now'))
);

-- Application drafts
CREATE TABLE IF NOT EXISTS application_drafts (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL REFERENCES jobs(id),
    resume_version_id TEXT REFERENCES resume_versions(id),
    status TEXT DEFAULT 'drafted',  -- 'drafted','approved','submitted','interview','offer','rejected'
    form_structure_json TEXT,       -- detected form fields
    filled_answers_json TEXT,       -- generated field values
    cover_letter TEXT,
    screening_answers_json TEXT,
    response_time_days INTEGER,
    rejection_type TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    approved_at TEXT,
    submitted_at TEXT
);

-- Interview kits (auto-generated when status → interview)
CREATE TABLE IF NOT EXISTS interview_kits (
    id TEXT PRIMARY KEY,
    application_id TEXT NOT NULL REFERENCES application_drafts(id),
    interview_type TEXT,            -- 'technical_coding','system_design','behavioral','mixed'
    company_profile_json TEXT,
    question_bank_json TEXT,
    answer_drafts_json TEXT,
    mock_scores_json TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

-- Insights cache (rolling metrics, recomputed periodically)
CREATE TABLE IF NOT EXISTS insights_cache (
    id INTEGER PRIMARY KEY DEFAULT 1,
    rolling_metrics_json TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Job discovery run log
CREATE TABLE IF NOT EXISTS discovery_runs (
    id TEXT PRIMARY KEY,
    started_at TEXT,
    completed_at TEXT,
    jobs_found INTEGER DEFAULT 0,
    jobs_new INTEGER DEFAULT 0,
    source TEXT,
    status TEXT  -- 'running','completed','failed'
);
```

**`backend/app/routers/profile.py`** — REST endpoints:
- `GET /profile` → returns the single user profile row (or 404 if not set up yet)
- `PUT /profile` → upserts the profile row

**`backend/app/routers/jobs.py`** — REST endpoints:
- `GET /jobs` → returns all non-archived jobs, sorted by `match_score DESC`
- `GET /jobs/{job_id}` → single job or 404
- `DELETE /jobs/{job_id}` → sets `is_archived = 1` (soft delete)

**`backend/app/routers/applications.py`** — REST endpoints:
- `GET /applications` → all drafts with joined job title/company
- `GET /applications/{draft_id}` → single draft or 404
- `POST /applications` → create new draft (body: `job_id`, `resume_version_id`)
- `PATCH /applications/{draft_id}/status` → update status field only

Register all new routers in `backend/app/main.py`.

**Definition of done:**
- `python -m pytest backend/tests/test_schema.py` passes (write this test file — it should call `init_db()` on a temp DB and assert all tables exist)
- All 4 routers respond without 500 errors (test via `http://localhost:8000/docs`)
- Schema migrations are idempotent (running `init_db()` twice does not error)

## Git Workflow (backend)

```bash
git checkout main && git pull origin main
git checkout -b feature/sashreek/db-schema
git add backend/app/db/ backend/app/routers/ backend/app/main.py
git commit -m "feat(backend): SQLite schema, data layer, profile/jobs/applications routers"
git push origin feature/sashreek/db-schema
gh pr create --title "feat(backend): SQLite schema and core REST endpoints" --base main
```

- ONLY stage files inside `backend/`
- Other backend engineers (Haq, Ajax, Divya, Raghav) depend on your schema — merge this before they start their backend tasks
