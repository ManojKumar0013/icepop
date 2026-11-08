# Read-only DB inspection helper for product 1 deletion investigation
import asyncio, sys
sys.path.insert(0, "/app/backend/tests")
from urllib.parse import urlsplit
from test_icepops_api import BE_ENV
import asyncpg

async def main():
    u = urlsplit(BE_ENV["DATABASE_URL"])
    conn = await asyncpg.connect(f"postgresql://{u.netloc}{u.path}", ssl="require", statement_cache_size=0)
    for q in sys.argv[1:]:
        try:
            rows = await conn.fetch(q)
            print(q, "->", [dict(r) for r in rows][:30])
        except Exception as e:
            print(q, "ERR", e)
    await conn.close()
asyncio.run(main())
