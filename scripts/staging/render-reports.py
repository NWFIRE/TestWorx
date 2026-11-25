from pathlib import Path
import json
import pypdfium2 as pdfium
from pypdf import PdfReader

directory = Path(__file__).parent / "results"
results = []
for filename, expected, other in [
    ("evergreen-report.pdf", "Evergreen", "Northshore"),
    ("northshore-report.pdf", "Northshore", "Evergreen"),
]:
    document = pdfium.PdfDocument(directory / filename)
    reader = PdfReader(directory / filename)
    text = "\n".join(page.extract_text() for page in reader.pages)
    for index, page in enumerate(document):
        page.render(scale=1).to_pil().save(directory / f"{filename[:-4]}-{index+1}.png")
    result = {"file": filename, "pages": len(document), "correct_company": expected in text,
              "other_company_absent": other not in text, "image_count": sum(len(page.images) for page in reader.pages)}
    results.append(result)
    if not result["correct_company"] or not result["other_company_absent"]:
        raise RuntimeError(f"Unexpected company branding: {filename}")
(directory / "report-branding.json").write_text(json.dumps(results, indent=2))
print(json.dumps(results, indent=2))
