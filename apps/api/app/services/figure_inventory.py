"""
Figure Inventory — lập kê khai hình ảnh/figure từ file OOXML (DOCX/PPTX).

Vấn đề: pipeline cũ gửi mọi ảnh trong `word/media/` lên Gemini vision reader
trong MỘT request duy nhất, không kèm caption, không theo thứ tự tài liệu,
và response bị cắt bởi maxOutputTokens → tài liệu 86 figure chỉ nhận về
~10-11 mô tả, sai thứ tự, không map được "image N" ↔ "Figure N".

Giải pháp (Fix A): đọc trực tiếp OOXML XML để dựng inventory TRƯỚC khi gọi AI:
- Duyệt `word/document.xml` theo thứ tự body, bắt mọi `<a:blip r:embed>` (ảnh)
  và `<w:object o:embed>` (OLE/vector), resolve rId → `word/media/*` qua rels.
- Ghép caption: đoạn text ngay sau ảnh khớp regex `Figure <n>: ...`
  (Word chèn caption vào paragraph liền sau drawing).
- Kết quả: danh sách FigureEntry theo đúng thứ tự tài liệu, mỗi entry có
  số thứ tự, caption, đường dẫn media, loại raster/vector.

Không tốn token, chính xác theo cấu trúc file — nền tảng cho batch vision
(Fix B) và phân loại diagram/screen (Fix C).
"""
from __future__ import annotations

import logging
import re
import zipfile
from dataclasses import dataclass, field
from io import BytesIO
from typing import Dict, List, Optional
from xml.etree import ElementTree as ET

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# OOXML namespaces
# ---------------------------------------------------------------------------
_NS = {
    "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "rel": "http://schemas.openxmlformats.org/package/2006/relationships",
    "v": "urn:schemas-microsoft-com:vml",
    "o": "urn:schemas-microsoft-com:office:office",
}

# Caption: "Figure 12: mô tả" / "Hình 12 - ..." (bản tiếng Việt) / "Fig. 12 ..."
_CAPTION_RE = re.compile(
    r"^\s*(?:Figure|Hình|Hình|Fig\.?)\s*(\d+)\s*[:\-\u2013\.\u2014]\s*(.*)",
    re.IGNORECASE,
)

# Ảnh được coi là figure nếu caption xuất hiện trong vòng N paragraph sau nó
_CAPTION_LOOKAHEAD = 3

# Từ khoá trong caption để phân loại nhanh (Gemini sẽ xác nhận lại, Fix C)
# Thứ tự kiểm tra QUAN TRỌNG: diagram trước screen — caption như
# "Admin screen flow" chứa cả hai nhưng bản chất là sơ đồ luồng.
_DIAGRAM_KEYWORDS = re.compile(
    r"\b(diagram|erd|dfd|sequence|flowchart|flow|use\s*case|context|architecture|"
    r"schema|sơ\s*đồ|lu\s*đ\s*ồ|kiến\s*trúc)\b",
    re.IGNORECASE,
)
_SCREEN_KEYWORDS = re.compile(
    r"\b(screen|ui|dashboard|page|form|view|detail|màn\s*hình|giao\s*diện)\b",
    re.IGNORECASE,
)


@dataclass
class FigureEntry:
    """Một figure trong tài liệu, theo đúng thứ tự xuất hiện."""
    order: int                      # 1-based position among figures in document
    number: Optional[int]           # số hiệu trong caption (Figure 42) — None nếu không có caption
    caption: str                    # text caption (có thể rỗng)
    media_path: Optional[str]       # vd 'word/media/image42.png' — None nếu vector không extract được
    mime: Optional[str]             # image/png, image/jpeg...
    is_vector: bool = False         # EMF/WMF (OLE object) — không gửi vision được trực tiếp
    kind_hint: str = "unknown"      # heuristic từ caption: diagram | screen | unknown


@dataclass
class FigureInventory:
    """Toàn bộ figure của tài liệu + số liệu tổng hợp."""
    figures: List[FigureEntry] = field(default_factory=list)
    total_media_files: int = 0      # mọi file trong word/media (kể cả không phải figure)
    uncaptioned_images: int = 0     # ảnh có trong body nhưng không khớp caption nào

    @property
    def total_figures(self) -> int:
        return len(self.figures)

    @property
    def numbered(self) -> List[FigureEntry]:
        return [f for f in self.figures if f.number is not None]

    def deduped(self) -> "FigureInventory":
        """Gộp các figure trùng caption số (Word SEQUENCE field tạo bản duplicate).

        Word chèn số figure bằng field `SEQ Figure` — khi tài liệu có field
        update/lỗi, cùng một "Figure N" xuất hiện nhiều lần trong XML. Giữ lần
        xuất hiện ĐẦU TIÊN có media, các bản trùng chỉ đánh dấu để bỏ qua.
        """
        seen: set[int] = set()
        kept: List[FigureEntry] = []
        for f in self.figures:
            if f.number is not None:
                if f.number in seen:
                    continue
                seen.add(f.number)
            kept.append(f)
        for i, f in enumerate(kept, start=1):
            f.order = i
        dedup = FigureInventory(
            figures=kept,
            total_media_files=self.total_media_files,
        )
        dedup.uncaptioned_images = sum(1 for f in kept if f.number is None)
        return dedup

    def summary_text(self) -> str:
        """Mô tả ngắn gọn đưa vào prompt AI (Fix E — classify không cần gửi ảnh)."""
        captioned = self.numbered
        n_images = len(self.figures)
        if not captioned:
            return f"Document contains {n_images} embedded images (no numbered captions)."
        nums = [f.number for f in captioned]
        parts = [
            f"Document contains {len(captioned)} numbered figures "
            f"(Figure {min(nums)}-{max(nums)}"
            + (f", gaps at {sorted(set(range(min(nums)), max(nums)) - set(nums))}"
               if len(nums) != max(nums) - min(nums) + 1 else "")
            + ")"
            + (f", plus {n_images - len(captioned)} uncaptioned images"
               if n_images > len(captioned) else "")
            + "."
        ]
        n_diagram = sum(1 for f in captioned if f.kind_hint == "diagram")
        n_screen = sum(1 for f in captioned if f.kind_hint == "screen")
        if n_diagram or n_screen:
            parts.append(
                f"Caption heuristic: ~{n_diagram} technical diagrams, ~{n_screen} UI screens."
            )
        return " ".join(parts)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
def build_figure_inventory(file_bytes: bytes, doc_kind: str = "docx",
                           dedup: bool = True) -> FigureInventory:
    """Dựng figure inventory từ DOCX/PPTX bytes. Không raise — lỗi trả inventory rỗng.

    Args:
        file_bytes: raw file.
        doc_kind: 'docx' | 'pptx'.
        dedup: gộp figure trùng số (field SEQ của Word sinh bản duplicate).
    """
    try:
        with zipfile.ZipFile(BytesIO(file_bytes)) as archive:
            if doc_kind == "pptx":
                inv = _inventory_pptx(archive)
            else:
                inv = _inventory_docx(archive)
        if dedup:
            inv = inv.deduped()
        return inv
    except Exception as exc:  # BadZip, thiếu part... — tài liệu vẫn dùng được text
        logger.warning("Figure inventory failed (%s): %s", doc_kind, exc)
        return FigureInventory()


# ---------------------------------------------------------------------------
# DOCX
# ---------------------------------------------------------------------------
def _inventory_docx(archive: zipfile.ZipFile) -> FigureInventory:
    inv = FigureInventory()
    inv.total_media_files = len(
        [n for n in archive.namelist() if n.startswith("word/media/")]
    )
    try:
        doc_root = ET.fromstring(archive.read("word/document.xml"))
        rels = _parse_rels(archive, "word/_rels/document.xml.rels")
    except KeyError as exc:
        logger.warning("DOCX missing part for inventory: %s", exc)
        return inv

    body = doc_root.find("w:body", _NS)
    if body is None:
        return inv

    # 1. Duyệt mọi paragraph theo thứ tự tài liệu, ghi nhận:
    #    - ảnh (blip rId / OLE embed rId) trong paragraph
    #    - text của paragraph (để bắt caption ở paragraph kế tiếp)
    paras: List[dict] = []
    for p in body.iter(f"{{{_NS['w']}}}p"):
        images = _images_in_paragraph(p)
        text = "".join(t.text or "" for t in p.iter(f"{{{_NS['w']}}}t")).strip()
        paras.append({"images": images, "text": text})

    # 2. Ghép caption: caption có thể nằm CÙNG paragraph với ảnh hoặc paragraph
    #    liền sau (Word mặc định: paragraph riêng kiểu Caption).
    consumed: set[int] = set()  # index paragraph đã bị "ăn" làm caption
    pending: List[tuple] = []   # (para_idx, image_dict) chờ caption

    def _next_caption() -> Optional[tuple]:
        """Caption ở paragraph hiện tại hoặc paragraph kế tiếp (chưa dùng)."""
        for j in range(idx + 1, min(idx + 1 + _CAPTION_LOOKAHEAD, len(paras))):
            if j in consumed or not paras[j]["text"]:
                continue
            m = _CAPTION_RE.match(paras[j]["text"])
            if m:
                return (j, int(m.group(1)), m.group(2).strip())
            return None  # paragraph kế tiếp là text thường → không có caption
        return None

    for idx, para in enumerate(paras):
        if idx in consumed:
            continue
        # caption ngay tại paragraph này?
        m = _CAPTION_RE.match(para["text"]) if para["text"] else None
        if m and pending:
            number, cap_text = int(m.group(1)), m.group(2).strip()
            p_idx, img = pending.pop(0)
            consumed.add(idx)
            inv.figures.append(_make_entry(len(inv.figures) + 1, number, cap_text, img, rels))
            continue
        # ảnh trong paragraph này → thử lấy caption ở paragraph sau ngay
        imgs = para["images"]
        cap = _next_caption() if imgs else None
        if cap:
            j, number, cap_text = cap
            consumed.add(j)
            # MỌI ảnh trong cùng paragraph thuộc CÙNG 1 figure — Word gộp 2
            # screenshot cạnh nhau thành 1 paragraph, caption chung. Trước đây
            # chỉ ảnh đầu được gắn caption, ảnh sau thành "uncaptioned" → đếm
            # sai 95 thay vì 86 (bug đã xác minh trên report-cua-long.docx).
            for k, img in enumerate(imgs):
                cap_text_k = cap_text if k == 0 else f"{cap_text} (part {k + 1})"
                inv.figures.append(_make_entry(len(inv.figures) + 1, number, cap_text_k, img, rels))
        else:
            for img in imgs:
                pending.append((idx, img))

    # 3. Ảnh còn chờ mà không có caption → figure không số (vẫn gửi vision, vẫn đếm)
    for _idx, img in pending:
        inv.figures.append(_make_entry(len(inv.figures) + 1, None, "", img, rels))

    inv.uncaptioned_images = sum(1 for f in inv.figures if f.number is None)
    logger.info(
        "Figure inventory (docx): %d figures (%d captioned), %d media files",
        inv.total_figures, inv.total_figures - inv.uncaptioned_images, inv.total_media_files,
    )
    return inv


def _images_in_paragraph(p_el) -> List[dict]:
    """Trả về list image refs trong 1 paragraph: [{'rid':..., 'vector':bool}]."""
    found: List[dict] = []
    # DrawingML: <a:blip r:embed="rIdN"/>
    for blip in p_el.iter(f"{{{_NS['a']}}}blip"):
        rid = blip.get(f"{{{_NS['r']}}}embed") or blip.get(f"{{{_NS['r']}}}link")
        if rid:
            found.append({"rid": rid, "vector": False})
    # VML / OLE: <v:imagedata r:id="rIdN"/> (EMF/WMF thumbnail của object)
    for imagedata in p_el.iter(f"{{{_NS['v']}}}imagedata"):
        rid = imagedata.get(f"{{{_NS['r']}}}id")
        if rid:
            found.append({"rid": rid, "vector": True})
    # <w:object> chứa OLE — ảnh đại diện là imagedata bên trong (đã bắt ở trên)
    return found


# ---------------------------------------------------------------------------
# PPTX
# ---------------------------------------------------------------------------
def _inventory_pptx(archive: zipfile.ZipFile) -> FigureInventory:
    inv = FigureInventory()
    inv.total_media_files = len(
        [n for n in archive.namelist() if n.startswith("ppt/media/")]
    )
    slide_names = sorted(
        (n for n in archive.namelist()
         if re.fullmatch(r"ppt/slides/slide\d+\.xml", n)),
        key=lambda n: int(re.search(r"(\d+)", n).group(1)),
    )
    for slide in slide_names:
        try:
            root = ET.fromstring(archive.read(slide))
            rels_path = f"ppt/slides/_rels/{slide.rsplit('/', 1)[-1]}.rels"
            rels = _parse_rels(archive, rels_path)
        except KeyError:
            continue
        # text của slide để bắt caption
        texts = [t.text or "" for t in root.iter(f"{{{_NS['a']}}}t")]
        cap_number, cap_text = None, ""
        for t in texts:
            m = _CAPTION_RE.match(t.strip())
            if m:
                cap_number, cap_text = int(m.group(1)), m.group(2).strip()
                break
        for blip in root.iter(f"{{{_NS['a']}}}blip"):
            rid = blip.get(f"{{{_NS['r']}}}embed")
            if not rid:
                continue
            img = {"rid": rid, "vector": False}
            inv.figures.append(
                _make_entry(len(inv.figures) + 1, cap_number, cap_text, img, rels)
            )
            cap_number, cap_text = None, ""  # mỗi caption chỉ gắn 1 ảnh
    inv.uncaptioned_images = sum(1 for f in inv.figures if f.number is None)
    return inv


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
_MEDIA_MIME = {
    "png": "image/png",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "gif": "image/gif",
    "webp": "image/webp",
    "bmp": "image/bmp",
    "emf": "image/emf",
    "wmf": "image/wmf",
    "tiff": "image/tiff",
}


def _parse_rels(archive: zipfile.ZipFile, rels_path: str) -> Dict[str, str]:
    """rId -> target path (chuẩn hoá về 'word/media/imageN.png')."""
    rels: Dict[str, str] = {}
    try:
        root = ET.fromstring(archive.read(rels_path))
    except KeyError:
        return rels
    base = rels_path.rsplit("_rels/", 1)[0]  # 'word/'
    for rel in root.iter(f"{{{_NS['rel']}}}Relationship"):
        rid = rel.get("Id")
        target = rel.get("Target", "")
        if not rid:
            continue
        if target.startswith("../"):
            target = target[3:]
        elif not target.startswith("/"):
            target = base + target
        rels[rid] = target.lstrip("/")
    return rels


def _make_entry(order: int, number: Optional[int], caption: str,
                img: dict, rels: Dict[str, str]) -> FigureEntry:
    media_path = rels.get(img["rid"])
    mime = None
    is_vector = img.get("vector", False)
    if media_path:
        ext = media_path.rsplit(".", 1)[-1].lower() if "." in media_path else ""
        mime = _MEDIA_MIME.get(ext)
        if ext in ("emf", "wmf"):
            is_vector = True
    return FigureEntry(
        order=order,
        number=number,
        caption=caption,
        media_path=media_path,
        mime=mime,
        is_vector=is_vector,
        kind_hint=_kind_hint(caption),
    )


def _kind_hint(caption: str) -> str:
    if not caption:
        return "unknown"
    if _DIAGRAM_KEYWORDS.search(caption):
        return "diagram"
    if _SCREEN_KEYWORDS.search(caption):
        return "screen"
    return "unknown"


def load_media_bytes(file_bytes: bytes, media_path: str) -> Optional[bytes]:
    """Đọc raw bytes của 1 media part trong OOXML. None nếu không có."""
    try:
        with zipfile.ZipFile(BytesIO(file_bytes)) as archive:
            return archive.read(media_path)
    except Exception as exc:
        logger.debug("Media read failed %s: %s", media_path, exc)
        return None
