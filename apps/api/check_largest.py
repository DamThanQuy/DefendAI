"""List top 20 largest files in ZIP - diagnostic."""
import asyncio
import sys
import zipfile
import tempfile
import os
import aioboto3
import aiohttp

BUCKET = "defend-files"
ENDPOINT = "http://minio:9000"
ACCESS_KEY = "minioadmin"
SECRET_KEY = "minioadmin"

async def main():
    if len(sys.argv) < 2:
        print("Usage: check_largest.py <key>")
        return
    key = sys.argv[1]
    session = aioboto3.Session()
    async with session.client("s3", endpoint_url=ENDPOINT,
                                aws_access_key_id=ACCESS_KEY,
                                aws_secret_access_key=SECRET_KEY) as s3:
        resp = await s3.get_object(Bucket=BUCKET, Key=key)
        body = resp["Body"]
        with tempfile.NamedTemporaryFile(suffix=".zip", delete=False) as tf:
            tmp = tf.name
            total = 0
            while True:
                chunk = await body.read(8 * 1024 * 1024)
                if not chunk:
                    break
                tf.write(chunk)
                total += len(chunk)
        print(f"Downloaded {total} bytes")

    # List by size
    sizes = []
    with zipfile.ZipFile(tmp, "r") as zf:
        for info in zf.infolist():
            if not info.is_dir():
                sizes.append((info.file_size, info.compress_size, info.filename))
    sizes.sort(reverse=True)
    print(f"\nTop 20 largest uncompressed files in {key}:")
    for size, comp, name in sizes[:20]:
        print(f"  {size:>15,} ({comp:>12,} compressed)  {name}")
    print(f"\nTotal files: {len(sizes)}")
    print(f"Total uncompressed: {sum(s for s,_,_ in sizes):,} bytes")
    os.unlink(tmp)

if __name__ == "__main__":
    asyncio.run(main())
