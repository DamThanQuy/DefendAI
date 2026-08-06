"""
Test Embedder (R3 — backend Gemini HTTP) — fake httpx client, KHÔNG gọi endpoint thật.

Cach chay:
    cd apps/api
    pytest tests/test_embedder.py -v
"""
import asyncio

import pytest

import app.services.embedder as emb


class _FakeResponse:
    def __init__(self, json_data):
        self._json = json_data

    def raise_for_status(self):
        pass

    def json(self):
        return self._json


class _FakeClient:
    """Giả httpx.AsyncClient: one-hot theo text chứa 'a' / 'b', đếm số request."""

    def __init__(self, dim=emb.EMBEDDING_DIM):
        self.dim = dim
        self.calls = 0

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def post(self, url, headers, json):
        self.calls += 1
        data = []
        for i, t in enumerate(json["input"]):
            v = [0.0] * self.dim
            v[0] = 1.0 if "a" in t else 0.0
            v[1] = 1.0 if "b" in t else 0.0
            data.append({"object": "embedding", "index": i, "embedding": v})
        return _FakeResponse({"object": "list", "data": data})


@pytest.fixture
def fake_http(monkeypatch):
    client = _FakeClient()
    monkeypatch.setattr(emb.httpx, "AsyncClient", lambda *a, **k: client)
    return client


def test_embed_empty(monkeypatch):
    assert asyncio.run(emb.embed([])) == []


def test_embed_shape_and_values(fake_http):
    vecs = asyncio.run(emb.embed(["alpha", "book"], batch_size=2))
    assert len(vecs) == 2
    assert all(len(v) == emb.EMBEDDING_DIM for v in vecs)
    assert vecs[0][0] == 1.0 and vecs[0][1] == 0.0
    assert vecs[1][0] == 0.0 and vecs[1][1] == 1.0
    assert fake_http.calls == 1


def test_embed_batches(fake_http):
    texts = [f"text-{i}" for i in range(40)]
    vecs = asyncio.run(emb.embed(texts, batch_size=32))
    assert len(vecs) == 40
    assert fake_http.calls == 2  # 32 + 8


def test_embed_dim_mismatch_raises(monkeypatch):
    bad = _FakeClient(dim=3)
    monkeypatch.setattr(emb.httpx, "AsyncClient", lambda *a, **k: bad)
    with pytest.raises(RuntimeError, match="dim mismatch"):
        asyncio.run(emb.embed(["alpha", "book"]))