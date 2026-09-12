# OnFile

OnFile helps you find relevant jobs, tailor your resume, and apply with AI assistance while you stay in control.

## Install (First)

### Option 1: Docker (Recommended)

1. Install Docker Desktop.
2. From the project root run:

```bash
docker compose up --build
```

3. Open:
- App: `http://localhost:3000`
- Backend health: `http://localhost:8000/health`

### Option 2: Run locally (without Docker)

#### Frontend

```bash
pnpm install
pnpm dev
```

#### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## What it does

- Finds jobs matched to your profile.
- Scores jobs by fit so you can focus on the best ones.
- Generates tailored resumes for specific roles.
- Helps draft application answers.
- Runs AI-assisted apply in a visible browser session (you can intervene anytime).
- Tracks applications, outcomes, and interview prep.

## How to use

1. **Set up your profile**
- Add your core details, skills, experience, projects, and education.
- Upload your resume to improve auto-fill quality.

2. **Discover jobs**
- Use Job Feed and AI Auto Search.
- Filter by location/role and shortlist relevant jobs.

3. **Prepare resume**
- Open Resume Studio.
- Generate a tailored resume for the selected job.
- Review and export.

4. **AI Assisted Apply**
- Open a job and click **AI Assisted Apply**.
- AI navigates and fills what it can.
- If a field is ambiguous, AI asks in chat.
- You always keep final control over submission.

5. **Track progress**
- Move applications through stages in Applications.
- Use Interviews and Insights to prepare and improve.

## Visible browser setup (required for browser-assisted features)

Start Chrome with remote debugging before using AI Auto Search or AI Assisted Apply.

### macOS

```bash
open -na "Google Chrome" --args --remote-debugging-port=9222 --remote-debugging-address=0.0.0.0 --user-data-dir=/tmp/onfile-cdp
```

### Windows

```bat
chrome.exe --remote-debugging-port=9222 --remote-debugging-address=0.0.0.0 --user-data-dir=%TEMP%\onfile-cdp
```

If `chrome.exe` is not in PATH:

```bat
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --remote-debugging-address=0.0.0.0 --user-data-dir=%TEMP%\onfile-cdp
```

Verify endpoint:

```bash
curl http://localhost:9222/json/version
```

## Quick troubleshooting

- App not loading: make sure frontend is on `:3000` and backend on `:8000`.
- Browser features not working: check Chrome debug endpoint above.
- AI output weak or unavailable: confirm your backend AI API key is configured.

## Small technical overview

OnFile is a local-first monorepo:

- **Frontend**: React + TypeScript
- **Backend**: FastAPI + Python
- **Automation**: Playwright (browser-assisted flows)
- **Data**: SQLite (local storage)
- **AI**: Gemini-powered generation and guidance

Design goal: user-controlled automation, not blind one-click mass applying.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE).