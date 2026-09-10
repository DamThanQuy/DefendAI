"""Quick script: check MinIO object size + ZIP member count for a given storage_key."""
import asyncio
import sys

from app.services.storage import get_object_size, iter_zip_members
from app.core.config import settings


async def main(storage_key: str) -> None:
    bucket = settings.minio.bucket
    size = await get_object_size(storage_key, bucket=bucket)
    print(f"Bucket: {bucket}")
    print(f"Key:    {storage_key}")
    print(f"Size:   {size:,} bytes ({size/1024/1024/1024:.3f} GB)")

    if storage_key.lower().endswith(".zip"):
        print("\nListing ZIP members (streaming)...")
        count = 0
        total = 0
        try:
            async for path, raw in iter_zip_members(bucket=bucket, key=storage_key):
                count += 1
                total += len(raw)
                if count <= 5:
                    print(f"  [{count:5d}] {path} ({len(raw):,} bytes)")
        except Exception as exc:
            print(f"  ERROR: {exc}")
        print(f"\nTotal members: {count}")
        print(f"Total uncompressed: {total:,} bytes ({total/1024/1024/1024:.3f} GB)")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python check_size.py <storage_key>")
        sys.exit(1)
    asyncio.run(main(sys.argv[1]))
