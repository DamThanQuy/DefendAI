"""
Test script: goi tat ca AI endpoints qua FastAPI TestClient (khong can server that).

Cach chay:
    cd apps/api
    python tests/test_ai_endpoints.py

Luu y:
- Test nay KHONG can uvicorn chay, dung TestClient in-process
- Status 503 = provider chua co key that (binh thuong khi .env dung PLACEHOLDER)
- Khi inject API key that, cac test se goi duoc AI that
"""
# -*- coding: utf-8 -*-
import os
import sys
import io
import json

# Force UTF-8 cho stdout (fix loi cp1252 tren Windows console)
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
sys.path.insert(0, '.')

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

print("=" * 70)
print("TEST 1: GET / (root → redirect to /docs)")
print("=" * 70)
r = client.get("/", follow_redirects=False)
print(f"Status: {r.status_code} (expect 307 → /docs)")
print(f"Location: {r.headers.get('location')}")

print("\n" + "=" * 70)
print("TEST 2: GET /health (check AI providers ready)")
print("=" * 70)
r = client.get("/health")
print(f"Status: {r.status_code}")
print(json.dumps(r.json(), indent=2, ensure_ascii=False))

print("\n" + "=" * 70)
print("TEST 3: GET /api/ai/providers")
print("=" * 70)
r = client.get("/api/ai/providers")
print(f"Status: {r.status_code}")
print(json.dumps(r.json(), indent=2, ensure_ascii=False))

print("\n" + "=" * 70)
print("TEST 4: GET /api/ai/models")
print("=" * 70)
r = client.get("/api/ai/models")
print(f"Status: {r.status_code}")
print(json.dumps(r.json(), indent=2, ensure_ascii=False))

print("\n" + "=" * 70)
print("TEST 5: POST /api/ai/test (validation - empty prompt)")
print("=" * 70)
r = client.post("/api/ai/test", json={"prompt": ""})
print(f"Status: {r.status_code} (expect 422)")
detail = r.json().get('detail', [])
if isinstance(detail, list) and detail:
    print(f"Validation error: {detail[0].get('msg')}")
else:
    print(detail)

print("\n" + "=" * 70)
print("TEST 6: POST /api/ai/test (Google - real call)")
print("=" * 70)
r = client.post("/api/ai/test", json={
    "prompt": "Hello",
    "provider": "google"
})
print(f"Status: {r.status_code}")
if r.status_code == 200:
    data = r.json()
    print(f"Provider: {data['provider']}")
    print(f"Model: {data['model']}")
    print(f"Latency: {data['latency_ms']}ms")
    print(f"Tokens: {data['usage']}")
    print(f"Response: {data['content'][:200]}...")
else:
    print(json.dumps(r.json(), indent=2, ensure_ascii=False))

print("\n" + "=" * 70)
print("TEST 7: POST /api/ai/test (NVIDIA - 503 if PLACEHOLDER)")
print("=" * 70)
r = client.post("/api/ai/test", json={
    "prompt": "Hello",
    "provider": "nvidia"
})
print(f"Status: {r.status_code}")
print(json.dumps(r.json(), indent=2, ensure_ascii=False))

print("\n" + "=" * 70)
print("TEST 8: OpenAPI schema")
print("=" * 70)
r = client.get("/openapi.json")
data = r.json()
print(f"Total paths: {len(data.get('paths', {}))}")
ai_paths = [p for p in data.get('paths', {}).keys() if '/api/ai' in p]
print(f"AI paths: {ai_paths}")

print("\n" + "=" * 70)
print("[DONE] All endpoint tests finished.")
print("       Status 503 = API key is PLACEHOLDER (expected).")
print("       Inject real key into .env to test AI calls.")
print("=" * 70)