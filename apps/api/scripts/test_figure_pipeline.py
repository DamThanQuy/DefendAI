"""Smoke test offline cho pipeline figure mới (Fix A/C/D/E) — không gọi Gemini/DB.

Chạy: python apps/api/scripts/test_figure_pipeline.py
"""
import asyncio
import sys
from pathlib import Path
from unittest import mock

API_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(API_ROOT))

DOCX = Path(r"d:\STUDY\KY7\EXE101\report-cua-long.docx")

from app.services.figure_inventory import build_figure_inventory  # noqa: E402
from app.services import vision_read as vr  # noqa: E402
from app.services.vision_read import ImagePart, ReadResult, DiagramInfo  # noqa: E402
from app.services.chunk_indexer import diagram_chunk_text  # noqa: E402

failures = []


def check(name, cond, detail=""):
    status = "PASS" if cond else "FAIL"
    print(f"[{status}] {name} {detail}")
    if not cond:
        failures.append(name)


# ---------- Fix A: inventory ----------
data = DOCX.read_bytes()
inv = build_figure_inventory(data, "docx")
check("inventory: 86 captioned figures", len(inv.numbered) == 86, f"got {len(inv.numbered)}")
check("inventory: numbers 1..86 contiguous", [f.number for f in inv.numbered] == list(range(1, 87)))
check("inventory: Fig1 = Context diagram", inv.numbered[0].caption == "Context diagram")
check("inventory: Fig86 present", inv.numbered[-1].number == 86)
check("inventory: diagram kind for Fig1", inv.numbered[0].kind_hint == "diagram")
check("inventory: screen kind for Fig8", inv.numbered[7].kind_hint == "screen")
summary = inv.summary_text()
check("summary: says 86 numbered", "86 numbered figures" in summary, summary)

# ---------- Fix B: batching + merge (mock Gemini) ----------
calls = []


async def fake_call(file_bytes, mime_type, *, images=None, body_text=None,
                    max_output_tokens=8192, max_retries=3):
    calls.append(len(images) if images else 0)
    # giả lập: batch đầu bị cắt -> phải trigger split
    infos = [
        DiagramInfo(figure=None, kind="screen", caption=im.label or "", description=f"desc for {im.label}")
        for im in (images or [])
    ]
    truncated = len(calls) == 1 and len(infos) > 2
    if truncated:
        infos = infos[:2]  # chỉ mô tả được 2/10 ảnh
    return ReadResult(text="", diagrams=[i.description for i in infos], diagram_infos=infos), truncated


parts = [ImagePart(data=b"x", mime_type="image/png", label=f"Figure {i}: cap{i}") for i in range(1, 26)]
with mock.patch.object(vr, "_call_gemini_vision_once", fake_call):
    res = asyncio.run(vr._read_office_batched(parts, "body"))

check("batch: 25 imgs -> multiple calls", len(calls) >= 3, f"calls={calls}")
check("batch: split recovered truncated imgs", len(res.diagram_infos) == 25, f"got {len(res.diagram_infos)}")
figs = sorted(i.figure for i in res.diagram_infos if i.figure)
check("batch: all figure numbers recovered", figs == list(range(1, 26)), f"got {len(figs)}")
check("batch: labels preserved", all(i.caption.startswith("Figure") for i in res.diagram_infos))

# ---------- Fix C: parse structured diagrams ----------
raw_json = ('{"text": "", "diagrams": ['
            '{"figure": 42, "kind": "screen", "caption": "Withdraw detail", "description": "A screen"},'
            '{"figure": 7, "kind": "diagram", "caption": "ERD", "description": "Entities"}]}')
parsed = vr._parse_vision_json(raw_json)
check("parse: 2 diagram_infos", len(parsed.diagram_infos) == 2)
check("parse: figure numbers", {i.figure for i in parsed.diagram_infos} == {42, 7})
check("parse: backward-compat diagrams list", len(parsed.diagrams) == 2)
legacy = vr._parse_vision_json('{"text": "", "diagrams": ["plain string desc"]}')
check("parse: legacy string still works", len(legacy.diagram_infos) == 1 and legacy.diagram_infos[0].figure is None)

# ---------- Fix D: diagram chunk text ----------
info = DiagramInfo(figure=42, kind="screen", caption="Withdraw request detail screen", description="Shows balance...")
t = diagram_chunk_text(info)
check("chunk text: contains Figure 42", "Figure 42" in t, t)
check("chunk text: contains kind label", "UI screen" in t)
check("chunk text: contains caption", "Withdraw request detail screen" in t)

# ---------- Fix E: classify image selection ----------
from app.services.deliverable_classify import _select_classify_images  # noqa: E402
sel = _select_classify_images(data, "report.docx", ["data:image/png;base64,AAA"])
check("classify: selects captioned figure images", sel is not None and len(sel) == 4, f"got {len(sel or [])}")
check("classify: images are real base64 png/jpeg", all(s.startswith("data:image/") for s in sel or []))

print()
if failures:
    print(f"{len(failures)} FAILURES: {failures}")
    sys.exit(1)
print("ALL CHECKS PASSED")
