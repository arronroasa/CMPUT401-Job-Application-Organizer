# Agent Brief: Divy

## Role
Data Visualization Engineer — you own the two data-display-heavy features: Interviews and Insights. Both rely heavily on Recharts and structured data rendering.

## Assigned Packages
- `packages/feature-interviews` — 4-tab interview prep interface
- `packages/feature-insights` — analytics dashboard with charts

## Prerequisite
Wait for Sashreek's PRs (`feat(core)`, `feat(api)`, `feat(app)`) to merge before starting.

---

## Task 1: Improve feature-interviews

Read all files in `packages/feature-interviews/src/`.

**Current state:** 4 tabs scaffolded. QuestionsTab shows grouped questions. AnswerDraftsTab shows STAR format. MockSimulatorTab has sequential flow. PerformanceHistoryTab has a LineChart.

**Your improvements:**

1. **QuestionsTab — add collapse/expand**:
   Each question card should be collapsible. By default, show only the question text and difficulty badge. Clicking a card expands it to show `contextNotes` and `skills` tags. Use local state (`useState<string | null>`) to track the expanded question ID.

2. **MockSimulatorTab — add progress indicator**:
   Above the question, add a progress bar showing `currentQuestionIndex / kit.questions.length`. Use a thin `h-1` bar filled with `bg-blue-500` at the correct width percentage.

3. **AnswerDraftsTab — improve readability**:
   Each STAR section (Situation, Task, Action, Result, Reflection) should render as a coloured left-border block:
   - Situation: `border-l-2 border-zinc-600`
   - Task: `border-l-2 border-blue-500/40`
   - Action: `border-l-2 border-blue-500`
   - Result: `border-l-2 border-green-500`
   - Reflection: `border-l-2 border-amber-500`

4. **PerformanceHistoryTab — add per-dimension breakdown**:
   Below the LineChart, add a bar chart showing the average of each scoring dimension (Structure, Relevance, Technical Depth, Specificity, Clarity) across all sessions. Use `recharts BarChart` with `ResponsiveContainer`. Colour: `#6366f1` (indigo).

**Definition of done:** All 4 tabs render correctly. Charts display mock data. Collapse/expand works. No TypeScript errors.

---

## Task 2: Improve feature-insights

Read all files in `packages/feature-insights/src/`.

**Current state:** 5 MetricCards and 3 Recharts charts (Bar, Line, Pie).

**Your improvements:**

1. **Add chart tooltips with better formatting**:
   - ApplicationsOverTime BarChart tooltip: format date as "Jan 22" instead of "2026-01-22". Use a custom `tickFormatter` on the XAxis.
   - InterviewRate LineChart tooltip: show value as "21%" not "21".
   - MatchDistribution PieChart: tooltip should show "12 applications (43%)" format.

2. **Add a trend indicator to MetricCards**:
   Modify `MetricCard.tsx` to accept an optional `trend?: 'up' | 'down' | 'flat'` prop. When provided, show a small arrow icon:
   - up: `↑` in green
   - down: `↓` in red
   - flat: `→` in zinc

   Add these trends to the InsightsPage MetricCards:
   - Response Rate: `trend="up"`
   - Interview Rate: `trend="up"`
   - Total Applications: `trend="flat"`

3. **Add a "No data" state**:
   If `metrics.totalApplications === 0`, show an EmptyState component (from `@onfile/ui` — Raghav adds it) with title "No data yet" and description "Start applying to jobs to see your insights.".

4. **Fix PieChart legend**:
   The current legend uses a `formatter` function. Verify the legend renders the tier names correctly with the right colours.

**Definition of done:** Insights page renders 5 cards and 3 charts. Tooltips are readable. Trend indicators show. No TypeScript errors.

---

## Git Workflow

```bash
# Before starting:
git fetch origin
git checkout main
git pull origin main

# Task 1:
git checkout -b feature/divy/interviews
git add packages/feature-interviews/
git commit -m "feat(feature-interviews): collapse/expand questions, progress bar, STAR styling"
git push origin feature/divy/interviews
gh pr create --title "feat(feature-interviews): interview prep improvements" --base main

git checkout main && git pull origin main
git checkout -b feature/divy/insights
git add packages/feature-insights/
git commit -m "feat(feature-insights): chart tooltips, trend indicators, empty state"
git push origin feature/divy/insights
gh pr create --title "feat(feature-insights): insights dashboard improvements" --base main
```

## Rules
- ONLY stage files inside `packages/feature-interviews/` and `packages/feature-insights/`
- Never use `git add .` or `git add -A`
- Never modify any other packages
- The `EmptyState` component in `packages/ui` is Raghav's responsibility — import it from `@onfile/ui` once it's available. If it's not merged yet, use a simple inline placeholder.
- Never commit to main directly

---

# Backend Assignment: Resume Generation Engine + Gemini API Integration

## Role
You own the AI layer. Given a job description and the user's profile, you produce a tailored, ATS-optimised resume using Gemini. Every generation is deterministic + explainable — no hallucinated facts, no invented metrics. You also own the interview kit generation engine which activates when an application moves to `status='interview'`.

## Assigned Backend Path
`backend/app/engines/resume/` and `backend/app/engines/interviews/`

## Prerequisite
Wait for Sashreek's `feat(backend/db-schema)` PR to merge. You read from `jobs` and `user_profile` and write to `resume_versions` and `interview_kits`.

## Task 3: Build the Resume Generation Engine

### Step 1: Job Description Analyzer

Create `backend/app/engines/resume/jd_analyzer.py`:

```python
# Input: raw job description text (str)
# Output: structured dict { required_skills, preferred_skills, experience_years, domain, keywords }
#
# Phase 1 (rule-based, no LLM):
# - Load skill_taxonomy.json (same file Haq uses)
# - Match skills against description text (case-insensitive)
# - Regex: extract "X years of experience" patterns
# - Return structured dict
#
# Phase 2 (LLM-assisted — call after rule-based):
# - Call Gemini API with prompt:
#   "Extract structured requirements from this job description as JSON with keys:
#    required_skills (list), preferred_skills (list), experience_years (int), domain (str), keywords (list).
#    Return only valid JSON. Job description: {text}"
# - Merge Gemini output with rule-based output (union of skills, max experience_years)
# - If Gemini call fails → fall back to rule-based only, log warning
```

### Step 2: Fragment Selector

Create `backend/app/engines/resume/fragment_selector.py`:

```python
# Input: jd_analysis dict, user_profile dict
# Output: selected fragments dict { experience: [...], projects: [...], skills: [...] }
#
# For each experience bullet in profile.experience_json:
#   Score = skill_overlap(bullet.skills, jd.required_skills) * 0.6
#           + impact_score(bullet) * 0.3
#           + recency_score(bullet.end_date) * 0.1
#   Select top 3-4 bullets per experience entry
#
# For each project in profile.projects_json:
#   Score = skill_overlap(project.skills, jd.required_skills)
#   Select top 2-3 projects
#
# Return selected fragments with selection_reason for each
# (selection_reason explains WHY this fragment was included — shown in UI)
```

### Step 3: Bullet Rewriter

Create `backend/app/engines/resume/bullet_rewriter.py`:

```python
# Input: original_bullet (str), jd_required_skills (list), job_domain (str)
# Output: rewritten_bullet (str)
#
# Call Gemini API with STRICT prompt:
# "Rewrite this resume bullet to emphasize {skills} for a {domain} role.
#  Rules:
#  - Preserve ALL factual claims exactly as written
#  - Do NOT add metrics, numbers, or technologies not in the original
#  - Do NOT change the technologies mentioned
#  - Keep to one line, under 120 characters
#  - Start with an action verb
#  Original: {bullet}"
#
# If rewritten bullet is longer than original by > 50% → use original
# If Gemini fails → return original bullet unchanged
# Never call this for bullets that already contain the target skills
```

### Step 4: Resume Compiler

Create `backend/app/engines/resume/compiler.py`:

```python
# compile_resume(job_id, db_conn) async function:
# 1. Load job from DB
# 2. Load user profile from DB
# 3. Run jd_analyzer on job.description
# 4. Run fragment_selector with jd_analysis + profile
# 5. For each selected fragment, run bullet_rewriter
# 6. Compute strength_score = len(jd.required_skills ∩ resume_skills) / len(jd.required_skills)
# 7. Generate resume_version_id = "rv-" + sha256(job_id + datetime)[:8]
# 8. INSERT into resume_versions table
# 9. Return resume_version dict with all fields including fragment selection_reasons
```

### Step 5: Resume API Router

Create `backend/app/routers/resumes.py`:

- `POST /resumes/generate` — body: `{ job_id }`:
  Calls `compile_resume()`, returns the new resume version
- `GET /resumes` — all resume versions sorted by `created_at DESC`
- `GET /resumes/{resume_id}` — single version
- `DELETE /resumes/{resume_id}` — hard delete (resume versions are regeneratable)

### Step 6: Gemini Client

Create `backend/app/clients/gemini.py`:

```python
# Thin wrapper around google-generativeai SDK
# get_gemini_client() → returns configured GenerativeModel('gemini-1.5-flash')
# API key loaded from env var GEMINI_API_KEY
# If key not set → log warning, return None
# All callers must handle None client gracefully (fall back to rule-based)
```

Add to `backend/requirements.txt`:
```
google-generativeai==0.5.4
```

### Step 7: Interview Kit Generator

Create `backend/app/engines/interviews/kit_generator.py`:

```python
# generate_interview_kit(application_id, db_conn) async function:
# Triggered when application_drafts.status → 'interview'
#
# 1. Load application + job + resume_version from DB
# 2. Classify interview type from job description keywords:
#    - Contains "algorithm"/"leetcode"/"coding" → 'technical_coding'
#    - Contains "architecture"/"scalability"/"distributed" → 'system_design'
#    - Contains "stakeholder"/"collaboration"/"leadership" → 'behavioral'
#    - Else → 'mixed'
# 3. Call Gemini to generate 10-12 questions structured as JSON:
#    { technical: [...], behavioral: [...], company_specific: [...] }
#    Each question: { text, category, difficulty, context_notes, skills_tested }
# 4. Generate STAR answer drafts for top 3 behavioral questions using profile data
# 5. INSERT into interview_kits table
# 6. Return kit
```

Create `backend/app/routers/interviews.py`:

- `GET /interviews/{application_id}` — returns interview kit for application
- `POST /interviews/{application_id}/generate` — manually trigger kit generation
- `PATCH /interviews/{kit_id}/answers` — update answer drafts (user edits)

Wire `PATCH /applications/{draft_id}/status` (Sashreek's router) to call `generate_interview_kit()` as a background task when new status is `'interview'`.

**Definition of done:**
- `POST /resumes/generate` with a valid `job_id` returns a resume version with fragments selected and bullets potentially rewritten
- `strength_score` is computed and stored
- `selection_reason` is populated for each fragment
- Gemini failures fall back gracefully to rule-based output (no 500 errors)
- Interview kit generates when application status moves to 'interview'

## Git Workflow (backend)

```bash
git checkout main && git pull origin main
git checkout -b feature/divy/resume-engine
git add backend/app/engines/resume/ backend/app/engines/interviews/ backend/app/routers/resumes.py backend/app/routers/interviews.py backend/app/clients/ backend/requirements.txt
git commit -m "feat(backend): resume generation engine, Gemini integration, interview kit generator"
git push origin feature/divy/resume-engine
gh pr create --title "feat(backend): resume generation + Gemini API + interview kit generator" --base main
```

- ONLY stage files inside `backend/`
- Do not modify `backend/app/db/` — that is Sashreek's domain
- Never hallucinate facts in generated content — always constrain prompts explicitly
- Always implement graceful fallback when Gemini API is unavailable
