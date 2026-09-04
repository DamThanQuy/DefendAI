"""Test re-upload 2.7GB file via multipart API to get a valid ZIP."""
import asyncio
import os
import sys
import time
from pathlib import Path

import aiohttp


API_BASE = "http://localhost:8000"
LOCAL_FILE = r"D:\STUDY\KY7\EXE101\DefendAI.zip"
EMAIL = "admin@defendai.dev"
PASSWORD = "DefendAI@123"
# Override MinIO URL to be reachable from inside API container.
# API's env has MINIO_PUBLIC_ENDPOINT=http://localhost:9000, but inside the
# container localhost:9000 is not MinIO. Use host.docker.internal instead.
MINIO_HOST_FOR_REWRITES = "host.docker.internal:9000"


async def main() -> None:
    if not os.path.exists(LOCAL_FILE):
        print(f"❌ File not found: {LOCAL_FILE}")
        sys.exit(1)
    file_size = os.path.getsize(LOCAL_FILE)
    print(f"📁 Local file: {LOCAL_FILE} ({file_size:,} bytes = {file_size/1024/1024/1024:.3f} GB)")

    async with aiohttp.ClientSession() as session:
        # 1. Login
        print("\n🔐 Login...")
        async with session.post(
            f"{API_BASE}/api/auth/login",
            json={"email": EMAIL, "password": PASSWORD},
        ) as resp:
            if resp.status != 200:
                print(f"❌ Login failed: {resp.status} {await resp.text()}")
                return
            data = await resp.json()
            token = data["token"]
        print(f"✅ Logged in, token len={len(token)}")
        headers = {"Authorization": f"Bearer {token}"}

        # 2. Init multipart
        print("\n📤 Init multipart upload...")
        async with session.post(
            f"{API_BASE}/api/documents/multipart/init",
            json={
                "filename": "DefendAI.zip",
                "size": file_size,
                "mime": "application/zip",
                "purpose": "student_project",
            },
            headers=headers,
        ) as resp:
            if resp.status != 201:
                print(f"❌ Init failed: {resp.status} {await resp.text()}")
                return
            init = await resp.json()
        upload_id = init["upload_id"]
        storage_key = init["storage_key"]
        chunk_size = init["chunk_size"]
        part_infos = init["parts"]
        part_urls = [p["url"] for p in part_infos]
        part_size = chunk_size
        print(f"✅ upload_id={upload_id}")
        print(f"   storage_key={storage_key}")
        print(f"   parts={len(part_urls)} part_size={part_size:,}")
        print(f"   (document_id will be returned in complete response)")

        # 3. Upload parts
        print("\n⬆️  Uploading parts (this may take 5-10 minutes for 2.7GB)...")
        t0 = time.time()
        parts_meta = []
        with open(LOCAL_FILE, "rb") as f:
            for i, url in enumerate(part_urls, start=1):
                chunk = f.read(part_size)
                if not chunk:
                    break
                # Rewrite URL: replace localhost:9000 with host.docker.internal:9000
                # (container-internal accessible hostname)
                url_for_container = url.replace("localhost:9000", MINIO_HOST_FOR_REWRITES)
                async with session.put(url_for_container, data=chunk) as resp:
                    if resp.status not in (200, 204):
                        print(f"❌ Part {i} upload failed: {resp.status}")
                        return
                    etag = resp.headers.get("ETag", "").strip('"')
                    parts_meta.append({"PartNumber": i, "ETag": etag})
                    pct = (i / len(part_urls)) * 100
                    elapsed = time.time() - t0
                    rate = (i * part_size) / elapsed / 1024 / 1024 if elapsed > 0 else 0
                    print(f"  Part {i:4d}/{len(part_urls)} ({pct:5.1f}%) {rate:.1f} MB/s")

        print(f"\n✅ All {len(parts_meta)} parts uploaded in {time.time()-t0:.1f}s")

        # 4. Complete
        print("\n🔗 Completing multipart...")
        async with session.post(
            f"{API_BASE}/api/documents/multipart/{upload_id}/complete",
            json={"parts": parts_meta},
            headers=headers,
        ) as resp:
            if resp.status != 200:
                print(f"❌ Complete failed: {resp.status} {await resp.text()}")
                return
            final = await resp.json()
        print(f"✅ Document {final['document_id']} ready: {final.get('storage_key')}")


if __name__ == "__main__":
    asyncio.run(main())
