import asyncio
import logging
import mimetypes
import os
from pathlib import Path
import requests

logger = logging.getLogger(__name__)

STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = "icepops"
LOCAL_UPLOADS_DIR = Path(__file__).resolve().parent.parent / "uploads"
_storage_key = None


def _ensure_local_dir(path: str) -> Path:
    target = LOCAL_UPLOADS_DIR / path
    target.parent.mkdir(parents=True, exist_ok=True)
    return target


def init_storage(force: bool = False) -> str | None:
    global _storage_key
    if not EMERGENT_KEY:
        return None
    if _storage_key and not force:
        return _storage_key
    try:
        resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=15)
        resp.raise_for_status()
        _storage_key = resp.json()["storage_key"]
        return _storage_key
    except Exception as e:
        logger.warning("Emergent storage init failed, falling back to local filesystem: %s", e)
        return None


def _put(path: str, data: bytes, content_type: str) -> dict:
    # Try Emergent if key is present
    key = init_storage()
    if key:
        try:
            for attempt in range(2):
                resp = requests.put(
                    f"{STORAGE_URL}/objects/{path}", data=data, timeout=30,
                    headers={"X-Storage-Key": init_storage(force=attempt > 0), "Content-Type": content_type}
                )
                if resp.status_code == 404 and attempt == 0:
                    continue
                resp.raise_for_status()
                return resp.json()
        except Exception as e:
            logger.warning("Remote storage put failed (%s), saving locally", e)

    # Local fallback
    local_file = _ensure_local_dir(path)
    local_file.write_bytes(data)
    logger.info("Saved file locally at: %s", local_file)
    return {"path": path, "size": len(data), "content_type": content_type}


def _get(path: str) -> tuple[bytes, str]:
    # Check local filesystem first
    local_file = LOCAL_UPLOADS_DIR / path
    if local_file.exists():
        guess_type = mimetypes.guess_type(str(local_file))[0] or "application/octet-stream"
        return local_file.read_bytes(), guess_type

    # Try Emergent if key exists
    key = init_storage()
    if key:
        for attempt in range(2):
            resp = requests.get(
                f"{STORAGE_URL}/objects/{path}", timeout=30,
                headers={"X-Storage-Key": init_storage(force=attempt > 0)}
            )
            if resp.status_code == 404 and attempt == 0:
                continue
            resp.raise_for_status()
            return resp.content, resp.headers.get("Content-Type", "application/octet-stream")

    raise FileNotFoundError(f"Storage object not found: {path}")


async def put_object(path: str, data: bytes, content_type: str) -> dict:
    return await asyncio.to_thread(_put, path, data, content_type)


async def get_object(path: str) -> tuple[bytes, str]:
    return await asyncio.to_thread(_get, path)
