import sys, zipfile, re
sys.path.insert(0, r'd:\STUDY\KY7\EXE101\DefendAI\apps\api')

from app.services.figure_inventory import build_figure_inventory

data = open(r'd:\STUDY\KY7\EXE101\report-cua-long.docx', 'rb').read()
inv = build_figure_inventory(data, 'docx').deduped()
print('total figures:', inv.total_figures)
print('captioned:', inv.total_figures - inv.uncaptioned_images)
print('media files:', inv.total_media_files)
print('summary:', inv.summary_text())
for f in inv.figures[:8]:
    print(f'  #{f.order} Fig={f.number} kind={f.kind_hint} media={f.media_path} cap={f.caption[:50]!r}')
print('  ...')
for f in inv.figures[-5:]:
    print(f'  #{f.order} Fig={f.number} kind={f.kind_hint} media={f.media_path} cap={f.caption[:50]!r}')
nums = [f.number for f in inv.figures if f.number]
print('numbers:', nums)
