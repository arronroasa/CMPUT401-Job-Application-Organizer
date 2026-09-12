# Agent Brief: Haq

## Role
Infrastructure + Settings Engineer. You own the Settings feature (fully self-contained) and the Docker/backend infrastructure. Your work is independent of all other feature packages.

## Assigned Packages
- `packages/feature-settings` — Settings page with localStorage persistence
- `backend/` — FastAPI stub
- `docker-compose.yml`, `packages/app/Dockerfile`, `packages/app/nginx.conf`

## Prerequisite
Wait for Sashreek's `feat(app)` PR to merge before running `pnpm dev` to verify settings. You can work on backend/Docker independently immediately.

---

## Task 1: Improve packages/feature-settings

Read all files in `packages/feature-settings/src/`.

**Current state:** SettingsPage with 4 sections. Zustand store persists to localStorage. All inputs are wired.

**Your improvements:**

1. **Add a "Save" confirmation toast**:
   When any input changes and the user moves focus away (onBlur), show a subtle inline confirmation: a small green checkmark icon + "Saved" text that appears for 2 seconds then fades. Implement with `useState<boolean>` and `setTimeout`. Place it in the top-right corner of each section card.

2. **LLMSection — improve API key input**:
   - Add a "Test Connection" button that, when clicked, shows `Testing…` for 1 second then shows either a green "✓ Connected" or red "✗ Failed" message (stub — always show "Connected" after 1s delay using `setTimeout`). Use `useState` for the test state.
   - The test button should be disabled if `llmApiKey` is empty.

3. **BackupRestoreSection — implement export**:
   When "Export Backup" is clicked, serialize the entire `useSettingsStore` state to a JSON blob and trigger a real file download named `onfile-backup-<date>.json`. Use:
   ```ts
   const state = useSettingsStore.getState();
   const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
   const url = URL.createObjectURL(blob);
   const a = document.createElement('a'); a.href = url; a.download = `onfile-backup-${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(url);
   ```

4. **Add a version display** at the bottom of the page:
   ```tsx
   <p className="text-xs text-zinc-600 text-center pt-4">OnFile v0.1.0 — scaffold phase</p>
   ```

**Definition of done:** Settings page renders all 4 sections. Values persist to localStorage (verify via DevTools → Application → Local Storage). Export backup downloads a JSON file. No TypeScript errors.

---

## Task 2: Verify and finalise Docker infrastructure

Read `docker-compose.yml`, `backend/Dockerfile`, `packages/app/Dockerfile`, `packages/app/nginx.conf`.

**Backend verification:**

1. From the repo root, run:
   ```bash
   cd backend
   pip install -r requirements.txt
   uvicorn app.main:app --reload --port 8000
   ```
2. Verify `http://localhost:8000/health` returns `{"status": "ok", "timestamp": "..."}`.
3. Verify `http://localhost:8000/docs` shows FastAPI Swagger UI.

**Add a second backend route for readiness:**

In `backend/app/routers/health.py`, add:
```python
@router.get("/ready")
def readiness_check():
    return {"ready": True, "version": "0.1.0"}
```

**Docker Compose verification:**

1. From the repo root, run `docker compose up --build`
2. Wait for both services to start (check logs)
3. Verify `http://localhost:3000` serves the React app
4. Verify `http://localhost:8000/health` returns OK from inside Docker

**Fix nginx config if needed:**
If the frontend can't reach the backend at `/api/`, verify the nginx proxy_pass is `http://backend:8000/` (service name matches docker-compose service name `backend`).

**Definition of done:** `docker compose up --build` completes without errors. Both endpoints are reachable. `docker compose down` cleans up correctly.

---

## Git Workflow

```bash
# Before starting:
git fetch origin
git checkout main
git pull origin main

# Task 1 (settings — independent, start immediately):
git checkout -b feature/haq/settings
git add packages/feature-settings/
git commit -m "feat(feature-settings): save toast, LLM test, export backup, version display"
git push origin feature/haq/settings
gh pr create --title "feat(feature-settings): settings improvements and export backup" --base main

# Task 2 (infrastructure — independent, start immediately in parallel):
git checkout main && git pull origin main
git checkout -b feature/haq/docker
# Only touch backend/ and docker-compose.yml and packages/app/Dockerfile and packages/app/nginx.conf
git add backend/ docker-compose.yml packages/app/Dockerfile packages/app/nginx.conf
git commit -m "chore(docker): verify and finalise backend + docker-compose"
git push origin feature/haq/docker
gh pr create --title "chore(docker): finalise containerization and health endpoints" --base main
```

## Rules
- For settings task: ONLY stage `packages/feature-settings/`
- For docker task: ONLY stage `backend/`, `docker-compose.yml`, `packages/app/Dockerfile`, `packages/app/nginx.conf`
- Never stage `packages/app/src/` — that is Sashreek's domain
- Never use `git add .` or `git add -A`
- Never commit to main directly
- Both tasks are independent — you can work on them simultaneously in separate branches

---

# Backend Assignment: Job Discovery Engine + Scheduling

## Role
You own the engine that finds real jobs. This is the top of the entire pipeline — without discovered jobs, nothing else in the system has data to work with. You build the query generator, source adapters, deduplication logic, and the background scheduler.

## Assigned Backend Path
`backend/app/engines/discovery/`

## Prerequisite
Wait for Sashreek's `feat(backend/db-schema)` PR to merge. You write jobs into the `jobs` table he creates.

## Task 3: Build the Job Discovery Engine

### Step 1: Query Generator

Create `backend/app/engines/discovery/query_generator.py`:

```python
# Input: role (str), location (str), remote (bool)
# Output: list of search query strings
#
# Logic:
# - Load role synonyms from backend/app/data/role_synonyms.json
# - Generate combinations: role_synonym + location + modifiers
# - Modifiers: ["intern", "junior", "entry level"] depending on experience level
# - Return deduplicated list of query strings (max 12 per role)
```

Create `backend/app/data/role_synonyms.json`:
```json
{
  "backend engineer": ["backend developer", "server-side developer", "API engineer", "software engineer backend"],
  "frontend engineer": ["frontend developer", "UI engineer", "React developer", "web developer"],
  "full stack engineer": ["full stack developer", "software engineer", "web engineer"],
  "data engineer": ["data developer", "ETL engineer", "data pipeline engineer"],
  "ml engineer": ["machine learning engineer", "AI engineer", "MLOps engineer"]
}
```

### Step 2: Source Adapter Interface + Implementations

Create `backend/app/engines/discovery/adapters/base.py`:
```python
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional

@dataclass
class RawJobData:
    title: str
    company: str
    location: str
    description: str
    source_url: str
    source: str
    posted_date: Optional[str] = None

class JobSourceAdapter(ABC):
    @abstractmethod
    async def search(self, query: str, max_results: int = 20) -> list[RawJobData]:
        pass
```

Create `backend/app/engines/discovery/adapters/remotive.py`:
- Implement adapter using Remotive's free public API: `https://remotive.com/api/remote-jobs?search=<query>&limit=<max>`
- Parse JSON response into `RawJobData` objects
- Handle HTTP errors gracefully (return empty list on failure, log error)
- Add 1 second delay between requests (`asyncio.sleep(1)`)

Create `backend/app/engines/discovery/adapters/github_jobs_rss.py`:
- Stub adapter that returns an empty list with a `# TODO: implement RSS feed parsing` comment
- This is a placeholder for future RSS adapters

### Step 3: Parser & Normalizer

Create `backend/app/engines/discovery/normalizer.py`:
```python
# Input: RawJobData
# Output: dict ready to INSERT into the jobs table
#
# Logic:
# - Generate a stable job ID: sha256(title + company + location)[:16]
# - Extract skills from description using skill dictionary matching
# - Load skill dictionary from backend/app/data/skill_taxonomy.json
# - Return normalized dict with all jobs table columns populated
```

Create `backend/app/data/skill_taxonomy.json` — a flat list of ~60 common tech skills to match against:
```json
["Python", "JavaScript", "TypeScript", "React", "Node.js", "FastAPI", "Django",
 "PostgreSQL", "SQLite", "MySQL", "MongoDB", "Redis", "Docker", "Kubernetes",
 "AWS", "GCP", "Azure", "Git", "REST API", "GraphQL", "gRPC", "Kafka",
 "Celery", "pytest", "Jest", "Tailwind CSS", "Next.js", "Vue.js", "Go",
 "Rust", "Java", "Spring Boot", "C++", "C#", ".NET", "Swift", "Kotlin",
 "TensorFlow", "PyTorch", "scikit-learn", "pandas", "NumPy", "Spark",
 "Airflow", "dbt", "Terraform", "Ansible", "Linux", "Bash", "CI/CD",
 "GitHub Actions", "Jenkins", "Nginx", "microservices", "system design",
 "distributed systems", "WebSockets", "OAuth2", "JWT"]
```

### Step 4: Deduplication Engine

Create `backend/app/engines/discovery/deduplicator.py`:
```python
# Input: list of normalized job dicts, existing job IDs from DB
# Output: filtered list with duplicates removed
#
# Layer 1: Exact ID match (sha256 hash — if ID already in DB, skip)
# Layer 2: Fuzzy title+company match using difflib.SequenceMatcher
#          If similarity > 0.85 between (title+company) pairs → skip
# Return only jobs that are genuinely new
```

### Step 5: Ranking Engine

Create `backend/app/engines/discovery/ranker.py`:
```python
# Input: normalized job dict, user profile dict (from user_profile table)
# Output: match_score (0.0–1.0) and match_tier ('high'/'medium'/'low')
#
# Formula:
#   skill_match = len(job_skills ∩ user_skills) / len(job_skills) if job_skills else 0
#   match_score = skill_match  (simple for now — expand later)
#   tier: score >= 0.7 → 'high', >= 0.4 → 'medium', else 'low'
```

### Step 6: Discovery Orchestrator

Create `backend/app/engines/discovery/orchestrator.py`:
```python
# run_discovery(db_conn, user_profile) async function:
# 1. Log discovery run start to discovery_runs table
# 2. Generate queries from user profile's role_interests
# 3. For each query, call RemotiveAdapter.search()
# 4. Normalize all results
# 5. Deduplicate against existing DB jobs
# 6. Rank each new job against user profile
# 7. Bulk INSERT new jobs into jobs table
# 8. Update discovery run log with jobs_found, jobs_new, status='completed'
# 9. Max 50 new jobs per run, rate-limited (1s between adapter calls)
```

### Step 7: Scheduler + API trigger

Create `backend/app/routers/discovery.py`:
- `POST /discovery/run` → triggers `run_discovery()` as a background task (FastAPI `BackgroundTasks`)
- `GET /discovery/status` → returns the most recent row from `discovery_runs`

Create `backend/app/scheduler.py`:
- On app startup (FastAPI lifespan event), schedule `run_discovery()` to run every N minutes (N = configurable, default 60)
- Use `asyncio` — no external scheduler dependency needed
- Only run if a user profile exists in DB

**Definition of done:**
- `POST /discovery/run` triggers a real run against Remotive API
- New jobs appear in the `jobs` table after a run
- `GET /jobs` (Sashreek's router) returns the discovered jobs
- Dedup prevents the same job from being inserted twice
- No crashes on empty user profile (graceful skip with log message)

## Git Workflow (backend)

```bash
git checkout main && git pull origin main
git checkout -b feature/haq/job-discovery
git add backend/app/engines/discovery/ backend/app/routers/discovery.py backend/app/scheduler.py backend/app/data/
git commit -m "feat(backend): job discovery engine, adapters, dedup, ranking, scheduler"
git push origin feature/haq/job-discovery
gh pr create --title "feat(backend): job discovery engine with Remotive adapter and scheduler" --base main
```

- ONLY stage files inside `backend/`
- Do not modify `backend/app/db/` — that is Sashreek's domain
- Do not modify other engineers' routers
