"""Deterministic source indexer for ZIP analysis (Step 2).

Mục tiêu: trích xuất function/class/route evidence mà KHÔNG dùng LLM. Parser sử
dụng regex + heuristic cho Python, JS/TS, Vue, Java, C# và Go — đủ để Step 3
hybrid retrieval có candidate symbol-level mà không cần tree-sitter runtime.

Đầu ra mỗi symbol là một ``EvidenceSnippet`` với:

- ``path``: relative path trong ZIP
- ``language``: python/javascript/typescript/...
- ``symbol_name`` + ``symbol_kind``: function | class | route | decorator
- ``line_start``/``line_end``: bounded range
- ``snippet``: bounded text để embed
- ``routes`` / ``calls``: structured metadata cho heuristic
- ``keywords``: top tokens cho BM25

LLM chỉ review các snippet này ở Step 4 — indexer không bao giờ gọi AI.
"""
from __future__ import annotations

import hashlib
import json
import logging
import re
from dataclasses import dataclass, field
from pathlib import Path

logger = logging.getLogger(__name__)


# ---- Python --------------------------------------------------------------

_PY_DEF_RE = re.compile(r"^(?P<indent>\s*)(async\s+def|def|class)\s+(?P<name>[A-Za-z_][A-Za-z0-9_]*)")
_PY_DECORATOR_RE = re.compile(r"^\s*@(?P<name>[A-Za-z_][A-Za-z0-9_.]*)\s*(?:\((?P<args>[^)]*)\))?")
_PY_CALL_RE = re.compile(r"\b([A-Za-z_][A-Za-z0-9_.]*)\s*\(")


# ---- JS/TS ---------------------------------------------------------------

_JS_DEF_RE = re.compile(
    r"^(?P<indent>\s*)"
    r"(?:export\s+)?(?:default\s+)?(?:async\s+)?"
    r"(?P<kind>function|class)\s+(?P<name>[A-Za-z_$][A-Za-z0-9_$]*)"
)
_JS_ROUTE_RE = re.compile(
    r"\.(?P<method>get|post|put|patch|delete|head|options)\s*\(\s*['\"`](/[^'\"`]*)['\"`]",
    re.IGNORECASE,
)
_JS_ARROW_RE = re.compile(
    r"^(?P<indent>\s*)(?:export\s+)?const\s+(?P<name>[A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:async\s+)?\("
)


# ---- Generic HTML-like template routes -----------------------------------

_TEMPLATE_TAG_RE = re.compile(r"\{\%\s*url\s+['\"]([^'\"]+)['\"]\s*\%\}")


# ---- Vocabulary ----------------------------------------------------------

_STOPWORDS = {
    "the", "and", "for", "with", "from", "this", "that", "are", "but",
    "not", "you", "your", "have", "has", "was", "were", "they", "them",
    "their", "what", "when", "where", "which", "while", "will", "would",
    "could", "should", "into", "onto", "upon", "about", "above", "below",
    "than", "then", "there", "here", "these", "those", "because", "since",
}


def _keywords(text: str, max_n: int = 8) -> list[str]:
    seen: list[str] = []
    seen_set: set[str] = set()
    for token in re.findall(r"[A-Za-z_][A-Za-z0-9_]{2,}", text):
        lower = token.lower()
        if lower in _STOPWORDS:
            continue
        if lower in seen_set:
            continue
        seen_set.add(lower)
        seen.append(lower)
        if len(seen) >= max_n:
            break
    return seen


@dataclass(slots=True)
class EvidenceSnippet:
    """One symbol-level evidence row, ready for DB persistence + embedding."""

    path: str
    language: str
    symbol_name: str
    symbol_kind: str  # function | class | route | decorator | arrow | method
    line_start: int
    line_end: int
    snippet: str
    snippet_sha256: str
    routes: list[str] = field(default_factory=list)
    calls: list[str] = field(default_factory=list)
    keywords: list[str] = field(default_factory=list)

    def to_persist_dict(self) -> dict:
        return {
            "path": self.path,
            "language": self.language,
            "symbol_name": self.symbol_name,
            "symbol_kind": self.symbol_kind,
            "line_start": self.line_start,
            "line_end": self.line_end,
            "snippet": self.snippet,
            "snippet_sha256": self.snippet_sha256,
            "routes": self.routes,
            "calls": self.calls,
            "keywords": self.keywords,
        }


def _bounded_snippet(text: str, *, max_bytes: int = 8 * 1024) -> str:
    if len(text.encode("utf-8")) <= max_bytes:
        return text
    encoded = text.encode("utf-8")[:max_bytes]
    return encoded.decode("utf-8", errors="ignore")


def _file_sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8", errors="ignore")).hexdigest()


def _language_for(path: str) -> str | None:
    name = Path(path).name.lower()
    if name in {"dockerfile", "makefile"}:
        return None  # not a language we index
    suffix = Path(path).suffix.lower()
    mapping = {
        ".py": "python",
        ".js": "javascript",
        ".jsx": "javascript",
        ".ts": "typescript",
        ".tsx": "typescript",
        ".java": "java",
        ".kt": "kotlin",
        ".cs": "csharp",
        ".go": "go",
        ".rb": "ruby",
        ".php": "php",
        ".vue": "vue",
        ".svelte": "svelte",
        ".html": "html",
        ".jinja2": "jinja2",
        ".hbs": "handlebars",
        ".ejs": "ejs",
        ".razor": "razor",
        ".cshtml": "cshtml",
        ".blade.php": "blade",
    }
    return mapping.get(suffix)


def _is_indexable(path: str) -> bool:
    return _language_for(path) is not None


def _index_python(path: str, text: str) -> list[EvidenceSnippet]:
    snippets: list[EvidenceSnippet] = []
    lines = text.splitlines()
    # Detect decorators + next def/class. Aggregate body by indent.
    i = 0
    while i < len(lines):
        line = lines[i]
        dec_match = _PY_DECORATOR_RE.match(line)
        if dec_match:
            decorator_name = dec_match.group("name")
            decorator_line = line
            j = i + 1
            while j < len(lines) and not _PY_DEF_RE.match(lines[j]):
                j += 1
            if j < len(lines):
                def_match = _PY_DEF_RE.match(lines[j])
                if def_match:
                    kind = "route" if decorator_name in _FASTAPI_DECORATORS else "decorator"
                    snippet_lines = lines[i:j + 1]
                    snippet_text = _bounded_snippet("\n".join(snippet_lines))
                    # Route literal lives on the decorator line (e.g.
                    # ``@router.post('/upload')``), NOT on the def line.
                    routes = _routes_from_decorator(decorator_name, decorator_line)
                    snippets.append(EvidenceSnippet(
                        path=path,
                        language="python",
                        symbol_name=def_match.group("name"),
                        symbol_kind=kind,
                        line_start=i + 1,
                        line_end=j + 1,
                        snippet=snippet_text,
                        snippet_sha256=_file_sha256(snippet_text),
                        routes=routes,
                        calls=_python_calls(lines, j + 1, def_match.end("name")),
                        keywords=_keywords(snippet_text),
                    ))
                    i = j + 1
                    continue
        match = _PY_DEF_RE.match(line)
        if match:
            kind = "class" if match.group(2) == "class" else "function"
            start_line = i
            indent = len(match.group("indent") or "")
            j = i + 1
            while j < len(lines):
                next_line = lines[j]
                if not next_line.strip():
                    j += 1
                    continue
                if next_line.startswith(" ") or next_line.startswith("\t"):
                    if len(next_line) - len(next_line.lstrip()) > indent:
                        j += 1
                        continue
                break
            body = "\n".join(lines[start_line:j])
            snippets.append(EvidenceSnippet(
                path=path,
                language="python",
                symbol_name=match.group("name"),
                symbol_kind=kind,
                line_start=start_line + 1,
                line_end=j,
                snippet=_bounded_snippet(body),
                snippet_sha256=_file_sha256(body),
                calls=_python_calls(lines, j, match.end("name")),
                keywords=_keywords(body),
            ))
            i = j
            continue
        i += 1
    return snippets


_FASTAPI_DECORATORS = {
    "router.get", "router.post", "router.put", "router.patch",
    "router.delete", "app.get", "app.post", "app.put", "app.patch",
    "app.delete", "api.get", "api.post", "api.put", "api.patch",
    "api.delete",
}


def _routes_from_decorator(decorator: str, def_line: str) -> list[str]:
    if decorator not in _FASTAPI_DECORATORS:
        return []
    method = decorator.split(".")[-1].upper()
    # Heuristic: route literal is on the def_line after the @ decorator — fall
    # back to scanning decorator line if not present on def_line.
    route_match = re.search(r"['\"`](/[^'\"`]*)['\"`]", def_line)
    if not route_match:
        return []
    return [f"{method} {route_match.group(1)}"]


def _python_calls(lines: list[str], end_line: int, def_offset: int) -> list[str]:
    body = "\n".join(lines[:end_line])[def_offset:]
    return sorted({match.group(1) for match in _PY_CALL_RE.finditer(body)} - {
        "self", "cls", "return", "yield", "raise", "if", "for", "while",
        "with", "async", "await",
    })


def _index_javascript_like(path: str, text: str, language: str) -> list[EvidenceSnippet]:
    snippets: list[EvidenceSnippet] = []
    lines = text.splitlines()
    for idx, line in enumerate(lines):
        match = _JS_DEF_RE.match(line)
        if match:
            kind = "class" if match.group("kind") == "class" else "function"
            snippet_text = _bounded_snippet("\n".join(lines[idx:idx + 25]))
            snippets.append(EvidenceSnippet(
                path=path,
                language=language,
                symbol_name=match.group("name"),
                symbol_kind=kind,
                line_start=idx + 1,
                line_end=idx + 1,
                snippet=snippet_text,
                snippet_sha256=_file_sha256(snippet_text),
                keywords=_keywords(snippet_text),
            ))
            continue
        arrow = _JS_ARROW_RE.match(line)
        if arrow:
            snippet_text = _bounded_snippet("\n".join(lines[idx:idx + 25]))
            snippets.append(EvidenceSnippet(
                path=path,
                language=language,
                symbol_name=arrow.group("name"),
                symbol_kind="arrow",
                line_start=idx + 1,
                line_end=idx + 1,
                snippet=snippet_text,
                snippet_sha256=_file_sha256(snippet_text),
                keywords=_keywords(snippet_text),
            ))
    # Routes (Express/Fastify-style) appear on their own lines.
    for idx, line in enumerate(lines):
        for match in _JS_ROUTE_RE.finditer(line):
            route = f"{match.group('method').upper()} {match.group(2)}"
            snippet_text = _bounded_snippet("\n".join(lines[idx:idx + 5]))
            snippets.append(EvidenceSnippet(
                path=path,
                language=language,
                symbol_name=f"route_{idx}",
                symbol_kind="route",
                line_start=idx + 1,
                line_end=idx + 1,
                snippet=snippet_text,
                snippet_sha256=_file_sha256(snippet_text),
                routes=[route],
                keywords=_keywords(snippet_text),
            ))
    return snippets


def _index_html_template(path: str, text: str, language: str) -> list[EvidenceSnippet]:
    snippets: list[EvidenceSnippet] = []
    for idx, line in enumerate(text.splitlines()):
        for match in _TEMPLATE_TAG_RE.finditer(line):
            url = match.group(1)
            snippet_text = _bounded_snippet(line)
            snippets.append(EvidenceSnippet(
                path=path,
                language=language,
                symbol_name=f"url_{idx}",
                symbol_kind="route",
                line_start=idx + 1,
                line_end=idx + 1,
                snippet=snippet_text,
                snippet_sha256=_file_sha256(snippet_text),
                routes=[f"GET {url}"],
                keywords=_keywords(snippet_text),
            ))
    return snippets


def index_source_file(path: str, text: str) -> list[EvidenceSnippet]:
    """Dispatch to the language-specific indexer."""
    language = _language_for(path)
    if language is None:
        return []
    if language == "python":
        return _index_python(path, text)
    if language in {"javascript", "typescript", "vue", "svelte"}:
        return _index_javascript_like(path, text, language)
    if language in {"html", "jinja2", "handlebars", "ejs", "razor", "cshtml", "blade"}:
        return _index_html_template(path, text, language)
    # Generic fallback: split by lines and emit per-symbol tokens via keyword
    # extraction. We deliberately do NOT produce evidence rows for unknown
    # languages — Step 3 will fall back to file-level scoring using the
    # manifest path keywords instead.
    return []


def index_source_files(
    files: list[tuple[str, str]],
) -> list[EvidenceSnippet]:
    """Convenience entry point: list of (relative_path, content) → snippets."""
    out: list[EvidenceSnippet] = []
    for path, text in files:
        if not _is_indexable(path):
            continue
        try:
            snippets = index_source_file(path, text)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Indexer failed for %s: %s", path, exc)
            continue
        out.extend(snippets)
    return out


def snippet_to_embedding_text(snippet: EvidenceSnippet) -> str:
    """Compose the bounded text sent to the embedder.

    Combines path, kind, name and snippet so vector search can match by both
    symbol name and code body.
    """
    return json.dumps({
        "path": snippet.path,
        "language": snippet.language,
        "kind": snippet.symbol_kind,
        "name": snippet.symbol_name,
        "routes": snippet.routes,
        "calls": snippet.calls[:10],
        "keywords": snippet.keywords,
        "snippet": snippet.snippet,
    }, ensure_ascii=False)