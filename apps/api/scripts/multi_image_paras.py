"""Liệt kê mọi paragraph có 2+ ảnh + caption đi kèm — xác minh ảnh 'uncaptioned'."""
import sys, zipfile, re
sys.path.insert(0, r'd:\STUDY\KY7\EXE101\DefendAI\apps\api')
from io import BytesIO
from xml.etree import ElementTree as ET

NS = {
    "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "rel": "http://schemas.openxmlformats.org/package/2006/relationships",
}
data = open(r'd:\STUDY\KY7\EXE101\report-cua-long.docx', 'rb').read()
with zipfile.ZipFile(BytesIO(data)) as z:
    doc = ET.fromstring(z.read('word/document.xml'))
    rels = {}
    rr = ET.fromstring(z.read('word/_rels/document.xml.rels'))
    for rel in rr.iter('{%s}Relationship' % NS['rel']):
        t = rel.get('Target', '')
        if t.startswith('../'):
            t = t[3:]
        elif not t.startswith('/'):
            t = 'word/' + t
        rels[rel.get('Id')] = t.lstrip('/')
    body = doc.find('w:body', NS)
    n_multi = 0
    for p in body.iter('{%s}p' % NS['w']):
        blips = []
        for b in p.iter('{%s}blip' % NS['a']):
            rid = b.get('{%s}embed' % NS['r'])
            if rid and rid in rels:
                blips.append(rels[rid])
        if len(blips) <= 1:
            continue
        n_multi += 1
        text = ''.join(t.text or '' for t in p.iter('{%s}t' % NS['w'])).strip()
        print(f"PARA {n_multi} ({len(blips)} imgs): {[b.split('/')[-1] for b in blips]} | caption: {text[:60]!r}")
    print(f"\nTổng paragraph có 2+ ảnh: {n_multi}")
