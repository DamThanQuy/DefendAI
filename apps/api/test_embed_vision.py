# -*- coding: utf-8 -*-
"""Quick smoke test: validate embedding dim + vision config resolution from env/DB."""
from __future__ import annotations

import asyncio
import os
import sys
import io

# Ensure UTF-8 output
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

# Suppress SQLAlchemy SQL logging
import logging
logging.disable(logging.WARNING)

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from pathlib import Path
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env")


async def main() -> None:
    print("=" * 60)
    print("SMOKE TEST: embedding + vision config resolution")
    print("=" * 60)

    # --- Embedding ---
    print("\n[EMBEDDING]")
    from app.services.embedder import (
        EMBEDDING_DIM,
        EMBEDDING_MODEL,
        get_embedding_effective_config,
        test_embedding_dim,
    )
    print(f"  EMBEDDING_DIM = {EMBEDDING_DIM}")
    print(f"  EMBEDDING_MODEL (fallback) = {EMBEDDING_MODEL}")

    cfg = await get_embedding_effective_config()
    print(f"  Resolved: provider={cfg['provider']} model={cfg['model']} type={cfg['provider_type']}")
    print(f"  has api_key: {bool(cfg['api_key'])}")
    print(f"  base_url: {cfg['base_url']}")

    if cfg["api_key"]:
        print("  Calling test_embedding_dim() (real API probe)...")
        result = await test_embedding_dim()
        print(f"  ok={result['ok']}")
        print(f"  detail={result['detail']}")
        if result.get("received_dim"):
            print(f"  received_dim={result['received_dim']} expected_dim={result['expected_dim']}")
    else:
        print("  SKIP test: no api_key")

    # --- Vision ---
    print("\n[VISION]")
    from app.services.vision_read import (
        get_vision_effective_config,
        test_vision_connection,
    )
    cfg_v = await get_vision_effective_config()
    print(f"  Resolved: provider={cfg_v['provider']} model={cfg_v['model']}")
    print(f"  has api_key: {bool(cfg_v['api_key'])}")
    print(f"  base_url: {cfg_v['base_url']}")

    if cfg_v["api_key"]:
        print("  Calling test_vision_connection()...")
        result_v = await test_vision_connection()
        print(f"  ok={result_v['ok']}")
        print(f"  detail={result_v['detail']}")
    else:
        print("  SKIP test: no api_key")

    # --- Features ---
    print("\n[FEATURE_AI FEATURES]")
    from app.services.feature_ai import FEATURES
    print(f"  {FEATURES}")

    print("\n" + "=" * 60)
    print("DONE")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
