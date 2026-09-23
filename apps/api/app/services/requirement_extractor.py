"""RequirementExtractor — deterministic parser for BR / SRS / Use Case docs.

Step 3 (M1) reads PDF / DOCX / PPTX requirement documents and produces a list
of ``RequirementItem`` objects that Step 3 (M2) can match against evidence
rows produced by Step 2.

Design choices:

- **Deterministic first.** Heading detection, use-case table parsing and
  code generation are all done via regex + heuristics. The LLM is **only** a
  fallback when the parser cannot detect any requirement structure at all.
- **Stable codes.** If the document already provides ``UC-03`` / ``REQ-001``,
  reuse it. Otherwise synthesise ``UC-{NN}`` based on the heading order so
  reruns produce the same hash.
- **Citations.** Each requirement remembers the source document, section
  heading and the snippet that produced it so the UI can render citations.
- **Embedding.** Each requirement text is embedded via the existing
  ``embedder.embed`` and persisted to ``document_chunks`` with
  ``source_type="requirement"`` / ``source_scope="workspace"``. Step 3 (M2)
  can then vector-search both the source evidence and the requirement index.
"""
from __future__ import annotations

import hashlib
import logging
import re
from dataclasses import dataclass, field
from typing import Iterable

from app.services.embedder import embed

logger = logging.getLogger(__name__)


_UC_PATTERN = re.compile(r"\b(UC|REQ|F|NFR|BR|FR)[-_]?(\d{1,4})\b", re.IGNORECASE)
# Heading keywords that mark a brand-new section. Order matters: longer / more
# specific phrases first so the keyword scan doesn't split a line like
# "Actor: Người dùng" into a fake heading.
_HEADING_KEYWORDS = (
    "use case",
    "use-case",
    "yêu cầu chức năng",
    "yêu cầu phi chức năng",
    "business rule",
    "chức năng chính",
    "yêu cầu",
    "requirement",
    "chức năng",
    "functional requirement",
    "non-functional requirement",
    "scenario",
    "tình huống",
)
# Sub-headings that some SRS / Use Case templates insert — these are NOT
# treated as new requirements on their own.
_SUBHEADING_KEYWORDS = (
    "actor",
    "tác nhân",
    "precondition",
    "pre",
    "postcondition",
    "post",
    "description",
    "mô tả",
    "main flow",
    "alternative flow",
    "exception",
)
_ACTOR_PATTERN = re.compile(
    r"(?:actor|tác nhân)\s*[:\-]\s*([^\n\r]+)", re.IGNORECASE
)
_TITLE_STOPWORDS = {
    "use case",
    "yêu cầu chức năng",
    "functional requirement",
    "requirement",
    "uc",
    "req",
    "fr",
    "nfr",
}


@dataclass(slots=True)
class RequirementItem:
    """One requirement extracted from BR/SRS/Use Case.

    Attributes are deliberately schema-stable so they can be JSON-encoded into
    ``requirement_matches.evidence_json`` later.
    """

    code: str
    title: str
    actors: list[str] = field(default_factory=list)
    keywords: list[str] = field(default_factory=list)
    citation: dict = field(default_factory=dict)
    text: str = ""

    def to_dict(self) -> dict:
        return {
            "code": self.code,
            "title": self.title,
            "actors": self.actors,
            "keywords": self.keywords,
            "citation": self.citation,
            "text": self.text,
        }


def _slugify_section(text: str, max_len: int = 40) -> str:
    """Compact slug for citation ``section`` field."""
    slug = re.sub(r"\s+", " ", text.strip())
    slug = re.sub(r"[^\w\sÀ-ỹ-]", "", slug)
    return slug[:max_len] if slug else "n/a"


def _auto_code(prefix: str, counter: int) -> str:
    """Synthesise a stable code when the document has none."""
    prefix = prefix.upper() if prefix else "UC"
    return f"{prefix}-{counter:02d}"


def _is_heading(line: str) -> bool:
    """A line is a new section heading only if:

    1. It starts with a numbered prefix (``3.2``, ``4.1.2``) — always.
    2. OR it begins (after optional numbering) with one of the high-priority
       ``_HEADING_KEYWORDS``. We check the **prefix** of the line, not the
       whole line, so that lines like ``Actor: Người dùng`` or
       ``Pre: Tài khoản tồn tại`` are kept as body lines.
    3. OR it starts with a Markdown heading marker (``#`` to ``######``),
       regardless of subsequent numbering. ``## 3.1 Quản lý tài liệu``
       counts as a heading.
    """
    stripped = line.strip()
    if not stripped:
        return False
    lower = stripped.lower()
    # Markdown heading: one or more '#' followed by space.
    if re.match(r"^#{1,6}\s+\S", stripped):
        return True
    # Strip optional leading numbering "3.2 ", "4.1.2 ", "(1) ", "- ", "* ".
    normalised = re.sub(r"^[\(\-\*]?\s*\d+(?:\.\d+)*\.?\)?\s*", "", stripped)
    normalised_low = normalised.lower()
    for keyword in _HEADING_KEYWORDS:
        if normalised_low.startswith(keyword + ":") or normalised_low.startswith(keyword + " "):
            return True
    return False


def _is_section_heading(line: str) -> bool:
    """Detect numbered section headings like ``3.2``, ``4.1.2``."""
    return bool(re.match(r"^\s*\d+(?:\.\d+)*\.?\s+\S", line))


def _parse_table_requirement_row(line: str) -> str | None:
    """Parse a Markdown table row that contains a UC/REQ-style code.

    Examples matched:
        ``| UC-01 | Đăng nhập | ... |``  -> ``"UC-01"``
        ``| ID | Tên | Mô tả |``        -> ``None`` (header row)
        ``|----|-----|----|``            -> ``None`` (separator row)
    """
    stripped = line.strip()
    if not (stripped.startswith("|") and stripped.endswith("|")):
        return None
    cells = [c.strip() for c in stripped.strip("|").split("|")]
    if len(cells) < 2:
        return None
    if all(re.fullmatch(r"[-:]+", c) for c in cells):
        return None
    for cell in cells:
        match = _UC_PATTERN.search(cell)
        if match:
            prefix = match.group(1).upper()
            number = match.group(2)
            return f"{prefix}-{int(number):02d}"
    return None


def _extract_existing_code(line: str) -> str | None:
    match = _UC_PATTERN.search(line)
    if match:
        prefix = match.group(1).upper()
        number = match.group(2)
        return f"{prefix}-{int(number):02d}"
    return None


def _keywords_from_text(text: str, max_n: int = 10) -> list[str]:
    seen: list[str] = []
    seen_set: set[str] = set()
    for token in re.findall(r"[A-Za-zÀ-ỹ_][A-Za-z0-9_À-ỹ]{2,}", text):
        lower = token.lower()
        if lower in _TITLE_STOPWORDS or lower in seen_set:
            continue
        seen_set.add(lower)
        seen.append(lower)
        if len(seen) >= max_n:
            break
    return seen


def _extract_actor(line: str) -> str | None:
    match = _ACTOR_PATTERN.search(line)
    if match:
        actor = match.group(1).strip().strip(".,;")
        return actor if actor else None
    return None


def extract_requirements_from_text(
    text: str,
    *,
    document_name: str,
    fallback_prefix: str = "UC",
) -> list[RequirementItem]:
    """Parse requirement text without ever calling the LLM.

    Heuristic used:

    1. Split by line; treat numbered headings (``3.2 Use case ...``) and lines
       that mention any keyword from ``_HEADING_KEYWORDS`` as a candidate
       section start.
    2. Collect lines under each heading until the next heading.
    3. For each section, look for an existing UC/REQ code; otherwise generate
       one sequentially.
    4. Pull ``actors`` from lines mentioning actor / tác nhân.
    5. Build keywords from heading + section body using simple tokenisation.

    Returns an empty list when no heading matches — caller can then fall back
    to LLM extraction (handled at the router/handler level, not here).
    """
    if not text or not text.strip():
        return []

    lines = text.splitlines()
    sections: list[tuple[str, list[str]]] = []
    current_title: str | None = None
    current_body: list[str] = []

    def _flush() -> None:
        if current_title is None:
            return
        body = [line for line in current_body if line.strip()]
        sections.append((current_title, body))

    for raw_line in lines:
        line = raw_line.strip()
        if not line:
            continue
        is_heading = _is_section_heading(line) or _is_heading(line)
        if is_heading:
            _flush()
            # Strip Markdown heading markers for a cleaner title.
            current_title = re.sub(r"^#{1,6}\s+", "", line)
            current_body = []
            continue
        # Markdown table row with UC/REQ code -> synthesise a section
        # on the fly so each table row becomes its own requirement.
        table_code = _parse_table_requirement_row(line)
        if table_code:
            _flush()
            current_title = table_code
            current_body = [line]
            _flush()
            current_title = None
            current_body = []
            continue
        current_body.append(line)
    _flush()

    if not sections:
        return []

    requirements: list[RequirementItem] = []
    counter = 1
    for title, body in sections:
        existing_code = _extract_existing_code(title)
        if existing_code is None:
            for body_line in body[:5]:
                existing_code = _extract_existing_code(body_line)
                if existing_code:
                    break
        code = existing_code or _auto_code(fallback_prefix, counter)
        counter += 1

        # Strip optional leading numbering AND the "UC-01" code itself so the
        # rendered title is concise (e.g. "3.1 UC-01 Login" -> "Login").
        title_clean = re.sub(r"^\s*\d+(?:\.\d+)*\.?\s+", "", title).strip()
        if existing_code:
            title_clean = re.sub(
                rf"^\s*{re.escape(existing_code)}\s*[:\-\u2013\u2014]?\s*",
                "",
                title_clean,
                flags=re.IGNORECASE,
            ).strip()
        # Drop duplicated leading prefix like "Use Case" so the rendered title
        # is concise but still distinguishable.
        for stop in _TITLE_STOPWORDS:
            if title_clean.lower().startswith(stop):
                title_clean = title_clean[len(stop):].strip(" :-\u2013\u2014")
                break
        if not title_clean:
            title_clean = title

        actors: list[str] = []
        for body_line in body[:6]:
            actor = _extract_actor(body_line)
            if actor and actor not in actors:
                actors.append(actor)

        joined = "\n".join([title] + body[:8])
        keywords = _keywords_from_text(joined)

        section_slug = _slugify_section(title)
        text_excerpt = "\n".join(body[:5]).strip()
        citation = {
            "document": document_name,
            "section": section_slug,
            "snippet": text_excerpt[:400],
        }
        requirements.append(RequirementItem(
            code=code,
            title=title_clean,
            actors=actors,
            keywords=keywords,
            citation=citation,
            text=text_excerpt,
        ))

    return requirements


def stable_requirement_hash(items: Iterable[RequirementItem]) -> str:
    """Return a SHA256 over the requirement list for idempotency tests.

    The list is sorted by ``code`` so the hash is order-independent — reruns
    of the same requirements produce the same digest.
    """
    canonical = sorted(items, key=lambda item: item.code)
    payload = "|".join(
        f"{item.code}:{item.title}:{','.join(sorted(item.keywords))}"
        for item in canonical
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


async def embed_requirements(
    items: list[RequirementItem],
) -> list[list[float]]:
    """Embed each requirement's title + body using the project embedder.

    Returns a parallel list of vectors; an empty list of vectors when there
    are no items. Caller is responsible for persisting them.
    """
    if not items:
        return []
    texts = [
        f"{item.code} {item.title}\n{item.text}"
        for item in items
    ]
    return await embed(texts)