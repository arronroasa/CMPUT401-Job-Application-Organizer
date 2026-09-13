from fastapi import APIRouter
from datetime import datetime

router = APIRouter()


@router.get("/health")
def health_check():
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat()}


@router.get("/ready")
def readiness_check():
    return {"ready": True, "version": "0.1.0"}
