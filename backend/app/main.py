from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from .db.schema import init_db
from .routers import (
    applications,
    discovery,
    drafts,
    health,
    insights,
    interviews,
    jobs,
    outcomes,
    profile,
    resumes,
    settings,
)
from .scheduler import start_discovery_scheduler, stop_discovery_scheduler

app = FastAPI(title="OnFile API", version="0.1.0")
SCREENSHOT_ARTIFACT_DIR = Path(__file__).resolve().parents[1] / "data" / "screenshots"
SCREENSHOT_ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount(
    "/artifacts/screenshots",
    StaticFiles(directory=str(SCREENSHOT_ARTIFACT_DIR)),
    name="artifacts-screenshots",
)

@app.on_event("startup")
async def startup() -> None:
    init_db()
    start_discovery_scheduler()


@app.on_event("shutdown")
async def shutdown() -> None:
    await stop_discovery_scheduler()


app.include_router(health.router)
app.include_router(insights.router)
app.include_router(outcomes.router)
app.include_router(profile.router)
app.include_router(jobs.router)
app.include_router(applications.router)
app.include_router(drafts.router)
app.include_router(discovery.router)
app.include_router(resumes.router)
app.include_router(interviews.router)
app.include_router(settings.router)


@app.get("/")
def root():
    return {"message": "OnFile API", "docs": "/docs"}
