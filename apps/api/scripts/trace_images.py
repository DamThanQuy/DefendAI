"""Truy vết vị trí thực tế của các ảnh trong body document.xml — ảnh nào đứng cạnh caption nào."""
import sys, re, zipfile
from xml.etree import ElementTree as ET
sys.path.insert(0, r'd:\STUDY\KY7\EXE101\DefendAI\apps\api')

NS = {
    "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "rel": "http://schemas.openxmlformats.org/package/2006/relationships",
    "v": "urn:schemas-microsoft-com:vml",
}

data = open(r'd:\STUDY\KY7\EXE101\report-cua-long.docx', 'rb').read()
with zipfile.ZipFile(__import__('io').BytesIO(data)) as z:
    doc_root = ET.fromstring(z.read('word/document.xml'))
    rels = {}
    relroot = ET.fromstring(z.read('word/_rels/document.xml.rels'))
    for rel in relroot.iter(f"{{{NS['rel']}}}Relationship"):
        t = rel.get("Target", "")
        if t.startswith("../"): t = t[3:]
        elif not t.startswith("/"): t = "word/" + t
        rels[rel.get("Id")] = t.lstrip("/")

    CAP_RE = re.compile(r"^(?:Figure|Hình)\s*(\d+)", re.IGNORECASE)

    body = doc_root.find("w:body", NS)
    print("=== Tuần tự paragraph: ảnh(s) + text xung quanh ===")
    print("(chỉ in các paragraph có ảnh HOẶC caption)\n")
    for p in body.iter(f"{{{NS['w']}}}p"):
        blips = []
        for blip in p.iter(f"{{{NS['a']}}}blip"):
            rid = blip.get(f"{{{NS['r']}}}embed")
            if rid and rid in rels:
                blips.append(rels[rid])
        text = "".join(t.text or "" for t in p.iter(f"{{{NS['w']}}}t")).strip()
        m = CAP_RE.match(text) if text else None
        if blips or m:
            marker = f"FIG-{m.group(1)}" if m else ("imgs:" + ",".join(b.split('/')[-1] for b in blips))
            print(f"  [{marker}] {text[:70]!r}")
