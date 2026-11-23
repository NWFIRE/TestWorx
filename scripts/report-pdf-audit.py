"""Local fixture rendering only. No production database or storage access."""
import sys, json, re
from pathlib import Path
import pymupdf as fitz
from PIL import Image, ImageDraw, ImageFont

root = Path(sys.argv[1])
root.mkdir(parents=True, exist_ok=True)
font = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 50)
for name, color, size in [("alpha", "#174b7a", (1000, 250)), ("beta", "#7c2626", (450, 600))]:
    logo = Image.new("RGBA", size, (255, 255, 255, 0))
    draw = ImageDraw.Draw(logo)
    draw.rounded_rectangle((8, 8, size[0]-8, size[1]-8), 20, outline=color, width=8)
    draw.text((32, 65), name.upper(), font=font, fill=color)
    draw.text((32, 130), "FIRE SERVICES", font=ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 28), fill=color)
    logo.save(root / f"{name}.png")
photo = Image.new("RGB", (800, 500), "#dbe6ef")
ImageDraw.Draw(photo).text((40, 200), "TEST EQUIPMENT PHOTO", font=font, fill="#174b7a")
photo.save(root / "photo.png")
signature = Image.new("RGBA", (600, 180), (255, 255, 255, 0))
ImageDraw.Draw(signature).text((30, 40), "Fixture signer", font=font, fill="black")
signature.save(root / "signature.png")

summary = []
batch = next((arg.split("=", 1)[1] for arg in sys.argv if arg.startswith("--batch=")), "*")
for source in sorted(root.glob(f"{batch}/*.pdf")):
    document = fitz.open(source)
    out = source.parent / source.stem
    out.mkdir(exist_ok=True)
    texts, bounds = [], []
    thumbs = []
    for number, page in enumerate(document):
        if "--text-only" not in sys.argv:
            page.get_pixmap(matrix=fitz.Matrix(1.2, 1.2)).save(out / f"page-{number+1:03}.png")
        texts.append(page.get_text())
        for block in page.get_text("blocks"):
            if block[0] < 20 or block[2] > page.rect.width-20 or block[1] < 10 or block[3] > page.rect.height-5:
                bounds.append({"page": number+1, "box": block[:4], "text": block[4][:100]})
        image = Image.open(out / f"page-{number+1:03}.png").convert("RGB")
        image.thumbnail((300, 390))
        thumbs.append(image)
    for start in range(0, len(thumbs), 12):
        batch = thumbs[start:start+12]
        sheet = Image.new("RGB", (1200, ((len(batch)+3)//4)*415), "#d0d0d0")
        draw = ImageDraw.Draw(sheet)
        for index, thumb in enumerate(batch):
            x, y = index % 4 * 300, index // 4 * 415
            sheet.paste(thumb, (x, y+20))
            draw.text((x+8,y+3), f"{source.stem} / {start+index+1}", fill="black")
        sheet.save(out / f"sheet-{start//12+1:02}.png")
    (out / "text.txt").write_text("\n\f\n".join(texts), encoding="utf8")
    missing = []
    saved = source.with_suffix(".json")
    if saved.exists():
        payload = json.loads(saved.read_text(encoding="utf8"))
        normalized = re.sub(r"\s+", "", " ".join(texts)).lower()
        def compare(value, path):
            if isinstance(value, dict):
                for key, child in value.items(): compare(child, f"{path}.{key}")
            elif isinstance(value, list):
                for index, child in enumerate(value): compare(child, f"{path}[{index}]")
            elif isinstance(value, str) and ": recorded " in value:
                if re.sub(r"\s+", "", value).lower() not in normalized:
                    missing.append(path)
        compare(payload["draft"]["sections"], "sections")
    summary.append({"file": str(source), "pages": len(document), "boundaryFlags": bounds, "missingRecordedText": missing})
(root / "render-summary.json").write_text(json.dumps(summary, indent=2), encoding="utf8")
print(json.dumps([{"file": Path(row["file"]).name, "pages": row["pages"], "flags":len(row["boundaryFlags"])} for row in summary], indent=2))
