"""Phân tích sâu: bao nhiêu figure thật + các ảnh 'uncaptioned' là gì."""
import sys, collections
sys.path.insert(0, r'd:\STUDY\KY7\EXE101\DefendAI\apps\api')

from app.services.figure_inventory import build_figure_inventory, load_media_bytes
from io import BytesIO
from PIL import Image

data = open(r'd:\STUDY\KY7\EXE101\report-cua-long.docx', 'rb').read()
inv = build_figure_inventory(data, 'docx')  # build_figure_inventory đã dedup bên trong (dedup=True default)

print("=== TỔNG QUAN ===")
print("Số figure (sau dedup):", inv.total_figures)
print("  - Có caption:", inv.total_figures - inv.uncaptioned_images)
print("  - Không caption (uncaptioned):", inv.uncaptioned_images)
print("Số media file trong word/media:", inv.total_media_files)

# Media paths duy nhất được tham chiếu bởi figures
all_paths = [f.media_path for f in inv.figures if f.media_path]
unique_paths = set(all_paths)
print("Media paths duy nhất được figure tham chiếu:", len(unique_paths))
print("Media file KHÔNG được tham chiếu:", inv.total_media_files - len(unique_paths))

# Media nào bị dùng lại (1 file cho nhiều figure)?
counts = collections.Counter(all_paths)
reused = {p: c for p, c in counts.items() if c > 1}
print("Media bị dùng lại bởi nhiều figure:", len(reused))
for p, c in list(reused.items())[:10]:
    figs = [f.number for f in inv.figures if f.media_path == p]
    print(f"  {p}: dùng {c} lần cho figures {figs}")

print()
print("=== 9 UNCAPTIONED IMAGES (nếu có) — chi tiết ===")
uncap = [f for f in inv.figures if f.number is None]
for i, f in enumerate(uncap, 1):
    # đoán kích thước ảnh
    raw = load_media_bytes(data, f.media_path) if f.media_path else None
    size = ""
    if raw:
        try:
            with Image.open(BytesIO(raw)) as im:
                size = f"{im.size[0]}x{im.size[1]}px ({raw.__len__()//1024}KB)"
        except Exception as e:
            size = f"cannot open: {e}"
    print(f"  #{f.order}: media={f.media_path} mime={f.mime} is_vector={f.is_vector} size={size}")
