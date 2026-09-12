# Agent Brief: Raghav

## Role
Design System Owner + Profile Feature. You define the visual language of the entire app. Your `packages/ui` work is a shared dependency — other teammates rely on your exports being stable.

## Assigned Packages
- `packages/ui` — shared components, design tokens
- `packages/feature-profile` — Profile page

## Prerequisite
Wait for Sashreek's `feat(core)` PR to merge before starting. Your packages import from `@onfile/core`.

---

## Task 1: Extend packages/ui shared components

The following components are already scaffolded. Your job is to **review, improve, and add missing ones**.

Read all files in `packages/ui/src/components/`.

**Improve existing components:**
- `Sidebar.tsx`: verify `NavLink` active state works correctly with React Router v6. The `isActive` prop on NavLink's className function should apply `bg-zinc-800 text-zinc-100`. Test by checking that clicking each nav item highlights it.
- `MatchBadge.tsx`: verify green/amber/gray tiers render correctly.
- `StatusPill.tsx`: verify all 7 status variants render (drafted, approved, submitted, interview, offer, rejected, archived).
- `SplitPane.tsx`: verify left panel does not overflow vertically.

**Add a new component: `EmptyState.tsx`**
Create `packages/ui/src/components/EmptyState.tsx`:
```tsx
// Props: icon (ReactNode), title (string), description (string), action? (ReactNode)
// Renders a centered empty state with an icon, title, description, and optional action button
// Use zinc-800 background, subtle border, centered layout
```

Export it from `packages/ui/src/index.ts`.

**Definition of done:** All ui components compile. `@onfile/ui` exports resolve correctly in all feature packages.

---

## Task 2: Improve packages/feature-profile

Read all files in `packages/feature-profile/src/`.

The profile page is read-only (display only). Your tasks:

1. **Improve SkillsSection**: Add a confidence score bar under each skill chip. The bar should be a thin horizontal bar (h-0.5) filling to `confidenceScore`% width. Color: green if ≥75, amber if ≥50, gray otherwise.

2. **Improve ProfilePage header**: Add a subtle `last updated` timestamp below the email/location line. Format: `Last updated: Feb 20, 2026`.

3. **Add loading skeleton**: When `isLoading` is true, show 3 placeholder skeleton cards (use `animate-pulse bg-zinc-800 rounded-lg h-24 w-full`) instead of the loading text.

4. **RoleInterestsSection**: Ensure location badges render as a comma-separated list inside the card.

**Definition of done:** Profile page renders without errors. All sections display mock data correctly. No TypeScript errors.

---

## Git Workflow

```bash
# Before starting:
git fetch origin
git checkout main
git pull origin main

# Task 1:
git checkout -b feature/raghav/ui-components
# ... make changes to packages/ui/ only ...
git add packages/ui/
git commit -m "feat(ui): extend shared components, add EmptyState"
git push origin feature/raghav/ui-components
gh pr create --title "feat(ui): extend shared design system components" --base main

# Wait for PR to merge, then:
git checkout main && git pull origin main
git checkout -b feature/raghav/profile-page
git add packages/feature-profile/
git commit -m "feat(feature-profile): improve skills, loading state, header"
git push origin feature/raghav/profile-page
gh pr create --title "feat(feature-profile): profile page improvements" --base main
```

## Rules
- ONLY stage files inside `packages/ui/` and `packages/feature-profile/`
- Never use `git add .` or `git add -A`
- Never modify `packages/app/`, `packages/core/`, `packages/api/`
- If you need a new shared type, ask Sashreek to add it to `packages/core` — do not modify core yourself
- Never commit to main directly

---

# Backend Assignment: Feedback Learning Loop + Insights Analytics Engine

## Role
You own the intelligence layer that closes the loop. After applications are submitted and outcomes are tracked, your engine analyzes patterns — which resume versions perform best, which skill gaps recur in rejections, which company types respond — and produces the metrics that the Insights page displays. You also own the feedback API that lets the frontend stay in sync with real backend data.

## Assigned Backend Path
`backend/app/engines/feedback/`

## Prerequisite
Wait for Sashreek's `feat(backend/db-schema)` PR to merge. You read from `application_drafts`, `resume_versions`, and `jobs` tables.

## Task 3: Build the Feedback Learning + Insights Engine

### Step 1: Metrics Aggregator

Create `backend/app/engines/feedback/aggregator.py`:

```python
# compute_metrics(db_conn) → InsightsMetrics dict
#
# Query application_drafts to compute:
#   total_applications = COUNT(*) WHERE status != 'drafted'
#   responses = COUNT(*) WHERE status IN ('interview','offer','rejected') AND response_time_days IS NOT NULL
#   interviews = COUNT(*) WHERE status IN ('interview','offer')
#   offers = COUNT(*) WHERE status = 'offer'
#   response_rate = responses / total_applications if total_applications > 0 else 0
#   interview_rate = interviews / total_applications if total_applications > 0 else 0
#
# applications_over_time: GROUP BY date(submitted_at), COUNT(*) for last 30 days
# match_distribution: GROUP BY match_tier, COUNT(*) joined with jobs table
#
# best_resume_version:
#   For each resume_version_id, compute interview_rate of applications using it
#   Return the resume version label with highest interview rate (min 3 applications)
#
# top_missing_skill:
#   For rejected/no-response applications:
#     Load job.skills_required_json for each
#     Load user profile skills
#     Find most frequently missing skill across all those jobs
#
# Return dict matching InsightsMetrics type from packages/core
```

### Step 2: Pattern Detector

Create `backend/app/engines/feedback/pattern_detector.py`:

```python
# detect_patterns(db_conn) → list of insight strings
#
# Run only if total submitted applications >= 10 (cold start guard)
#
# Pattern 1: Skill gap frequency
#   If any skill appears missing in > 40% of rejected jobs → generate insight:
#   "You're missing {skill} in {pct}% of roles you apply to — consider building this skill"
#
# Pattern 2: Match score vs interview rate
#   Compare interview_rate for high-tier jobs vs medium-tier jobs
#   If high-tier rate > medium-tier rate by > 15% → insight:
#   "Your interview rate is higher for roles with >70% match — focus on high-match jobs"
#
# Pattern 3: Company type affinity
#   Group applications by job domain (from jobs table)
#   If one domain has > 2x interview rate of others → insight:
#   "You're getting more traction in {domain} — consider targeting more {domain} roles"
#
# Return list of insight strings (max 5)
# Return empty list if < 10 applications (never surface unreliable patterns)
```

### Step 3: Ranking Weight Adapter

Create `backend/app/engines/feedback/weight_adapter.py`:

```python
# adapt_weights(db_conn) → dict of scoring weights
#
# Default weights: { skill_match: 0.6, experience_match: 0.2, domain_match: 0.2 }
#
# Adaptation rules (only applies if >= 20 submitted applications):
#   If high_match_interview_rate > mid_match_interview_rate:
#     Increase skill_match weight by 0.05 (max 0.75)
#   Else:
#     Decrease skill_match weight by 0.05 (min 0.45)
#   Normalize weights to sum to 1.0
#
# Store adapted weights in insights_cache table (weights_json field — add this column if missing)
# Haq's discovery ranker should read these weights instead of hardcoded defaults
# Maximum adjustment per cycle: 0.05 — never allow extreme shifts
```

### Step 4: Insights Cache Refresh

Create `backend/app/engines/feedback/cache_refresher.py`:

```python
# refresh_insights_cache(db_conn) async function:
# 1. Call compute_metrics()
# 2. Call detect_patterns()
# 3. Call adapt_weights()
# 4. UPSERT into insights_cache table (single row, id=1)
# 5. Log completion
#
# Called:
# - On app startup (if cache is > 1 hour old)
# - After any application status change (via background task)
# - On demand via API endpoint
```

### Step 5: Insights API Router

Create `backend/app/routers/insights.py`:

- `GET /insights` — returns cached metrics from `insights_cache` table. If cache is empty or > 1 hour old, recompute first.
- `POST /insights/refresh` — force recompute and return fresh metrics
- `GET /insights/patterns` — returns list of detected insight strings

Wire `PATCH /applications/{draft_id}/status` (Sashreek's router) to call `refresh_insights_cache()` as a background task on every status change.

### Step 6: Application Status Update Endpoint

Create `backend/app/routers/outcomes.py`:

- `PATCH /applications/{draft_id}/outcome` — body: `{ status, response_time_days?, rejection_type?, notes? }`:
  - Validates status is one of: `submitted`, `viewed`, `interview`, `offer`, `rejected`
  - Updates application_drafts row
  - Triggers `refresh_insights_cache()` as background task
  - Triggers `generate_interview_kit()` (Divya's engine) as background task if new status is `'interview'`

**Definition of done:**
- `GET /insights` returns real metrics computed from DB data
- `detect_patterns()` returns empty list when < 10 applications (cold start guard works)
- Weight adaptation stays within ±0.05 per cycle and always sums to 1.0
- `PATCH /applications/{id}/outcome` triggers cache refresh in background
- Interview kit generation triggers automatically on status → 'interview'

## Git Workflow (backend)

```bash
git checkout main && git pull origin main
git checkout -b feature/raghav/feedback-engine
git add backend/app/engines/feedback/ backend/app/routers/insights.py backend/app/routers/outcomes.py
git commit -m "feat(backend): feedback learning engine, insights aggregator, pattern detector, weight adapter"
git push origin feature/raghav/feedback-engine
gh pr create --title "feat(backend): feedback learning loop + insights analytics engine" --base main
```

- ONLY stage files inside `backend/`
- Do not modify `backend/app/db/` — that is Sashreek's domain
- Do not modify other engineers' routers except to add background task calls (coordinate with Sashreek)
- Never let weight adaptation shift more than 0.05 per cycle
- Always implement cold start guard — minimum 10 applications before any pattern detection
