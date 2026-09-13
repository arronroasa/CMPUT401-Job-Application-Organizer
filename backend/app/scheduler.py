import asyncio
import logging
import os
import sqlite3

from .db.database import get_db
from .engines.discovery.orchestrator import run_discovery

logger = logging.getLogger(__name__)

_scheduler_task: asyncio.Task | None = None
DEFAULT_INTERVAL_MINUTES = 60


def _resolve_interval_minutes(conn: sqlite3.Connection) -> int:
    env_value = os.environ.get("DISCOVERY_INTERVAL_MINUTES")
    if env_value:
        try:
            parsed = int(env_value)
            if parsed > 0:
                return parsed
        except ValueError:
            logger.warning("Invalid DISCOVERY_INTERVAL_MINUTES value: %s", env_value)

    try:
        row = conn.execute(
            "SELECT discovery_interval_minutes FROM settings WHERE id = 1"
        ).fetchone()
        if row:
            parsed = int(row[0])
            if parsed > 0:
                return parsed
    except Exception:
        logger.exception("Failed to read discovery interval from settings")
    return DEFAULT_INTERVAL_MINUTES


def _has_profile(conn: sqlite3.Connection) -> bool:
    row = conn.execute("SELECT 1 FROM user_profile WHERE id = 'local'").fetchone()
    return row is not None


async def _discovery_scheduler_loop() -> None:
    while True:
        conn = get_db()
        try:
            interval_minutes = _resolve_interval_minutes(conn)
            profile_exists = _has_profile(conn)
        finally:
            conn.close()

        if profile_exists:
            run_conn = get_db()
            try:
                await run_discovery(run_conn)
            except Exception:
                logger.exception("Scheduled discovery run failed")
            finally:
                run_conn.close()
        else:
            logger.info("Scheduler skipped discovery run: no user profile")

        await asyncio.sleep(interval_minutes * 60)


def start_discovery_scheduler() -> None:
    global _scheduler_task
    if _scheduler_task and not _scheduler_task.done():
        return
    loop = asyncio.get_running_loop()
    _scheduler_task = loop.create_task(_discovery_scheduler_loop())
    logger.info("Discovery scheduler started")


async def stop_discovery_scheduler() -> None:
    global _scheduler_task
    if _scheduler_task is None:
        return
    _scheduler_task.cancel()
    try:
        await _scheduler_task
    except asyncio.CancelledError:
        pass
    _scheduler_task = None
    logger.info("Discovery scheduler stopped")
