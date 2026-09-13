from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .db.schema import init_db
from .routers import discovery, drafts, health, jobs, profile
from .scheduler import start_discovery_scheduler, stop_discovery_scheduler

app = FastAPI(title="OnFile Job Search API", version="0.1.0")

# Review screenshots captured while filling an application draft (see
# drafts.py / engines/applications/submission_engine.py) are served from
# here so the frontend can show what got filled in.
SCREENSHOT_ARTIFACT_DIR = Path(__file__).resolve().parents[1] / "data" / "screenshots"
SCREENSHOT_ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
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
app.include_router(profile.router)
app.include_router(jobs.router)
app.include_router(discovery.router)
app.include_router(drafts.router)


@app.get("/")
def root():
    return {"message": "OnFile Job Search API", "docs": "/docs"}
