import base64
import io
import re
import traceback
from typing import Optional

from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()


class ScanRequest(BaseModel):
    imageBase64: str
    mimeType: str


class ScannedItem(BaseModel):
    scannedName: str
    mxik: Optional[str] = None
    quantity: float = 0
    unitCost: float = 0
    totalCost: float = 0


class ScanResponse(BaseModel):
    supplierName: Optional[str] = None
    receiptDate: Optional[str] = None
    items: list[ScannedItem] = []
    tier: str = "free"


def decode_image_bytes(image_base64: str, mime_type: str) -> list:
    """Decode base64 to image(s). Returns list of PIL Images."""
    from PIL import Image

    raw = base64.b64decode(image_base64)

    if mime_type == "application/pdf":
        from pdf2image import convert_from_bytes
        return convert_from_bytes(raw)
    else:
        return [Image.open(io.BytesIO(raw))]


def parse_ocr_lines(ocr_result) -> list[str]:
    """Flatten PaddleOCR result into sorted text lines (by Y position)."""
    lines = []
    if not ocr_result:
        return lines
    for page in ocr_result:
        if not page:
            continue
        items = []
        for detection in page:
            box, (text, confidence) = detection
            if confidence < 0.7:
                continue
            # Average Y coordinate of box
            avg_y = sum(pt[1] for pt in box) / len(box)
            items.append((avg_y, text))
        items.sort(key=lambda x: x[0])
        lines.extend(t for _, t in items)
    return lines


def parse_product_lines(lines: list[str]) -> list[ScannedItem]:
    """
    Heuristic parser for Uzbekistan SoliqServis invoice format.
    Looks for 17-digit MXIK codes and associated price data.
    """
    mxik_re = re.compile(r"\b(\d{17})\b")
    number_re = re.compile(r"[\d\s]+\.?\d*")
    pack_re = re.compile(r"упаковка\s*=\s*(\d+)\s*шт", re.IGNORECASE)

    items: list[ScannedItem] = []
    i = 0
    while i < len(lines):
        line = lines[i]
        mxik_match = mxik_re.search(line)
        if mxik_match:
            mxik = mxik_match.group(1)
            # Product name is typically the line before MXIK
            name = lines[i - 1].strip() if i > 0 else ""

            # Look ahead for numeric data (up to 5 lines)
            quantity = 0.0
            total_cost = 0.0
            unit_cost = 0.0
            pack_size = 1

            for j in range(i + 1, min(i + 6, len(lines))):
                pack_match = pack_re.search(lines[j])
                if pack_match:
                    pack_size = int(pack_match.group(1))

                nums = [
                    float(n.replace(" ", "").replace(",", "."))
                    for n in re.findall(r"[\d]+(?:[\s,]\d+)*(?:\.\d+)?", lines[j])
                    if n.replace(" ", "").replace(",", "").replace(".", "").isdigit() or "." in n
                ]
                if nums and max(nums) > total_cost:
                    total_cost = max(nums)
                if 0 < min(nums, default=0) < 10000 and quantity == 0:
                    quantity = min(n for n in nums if n > 0)

            actual_quantity = quantity * pack_size if quantity > 0 else 1
            if actual_quantity > 0 and total_cost > 0:
                unit_cost = round(total_cost / actual_quantity, 2)

            items.append(ScannedItem(
                scannedName=name,
                mxik=mxik,
                quantity=actual_quantity,
                unitCost=unit_cost,
                totalCost=total_cost,
            ))
        i += 1

    return items


def extract_meta(lines: list[str]) -> tuple[Optional[str], Optional[str]]:
    """Try to extract supplier name and date from OCR lines."""
    supplier_name = None
    receipt_date = None

    date_re = re.compile(r"\b(\d{2}[.\-/]\d{2}[.\-/]\d{4}|\d{4}[.\-/]\d{2}[.\-/]\d{2})\b")
    for line in lines:
        if not receipt_date:
            m = date_re.search(line)
            if m:
                raw = m.group(1)
                # Normalise to YYYY-MM-DD
                parts = re.split(r"[.\-/]", raw)
                if len(parts[0]) == 4:
                    receipt_date = f"{parts[0]}-{parts[1]}-{parts[2]}"
                else:
                    receipt_date = f"{parts[2]}-{parts[1]}-{parts[0]}"

        # Heuristic: supplier often follows "Поставщик" or "Yetkazib beruvchi"
        if re.search(r"поставщик|yetkazib beruvchi", line, re.IGNORECASE):
            idx = lines.index(line)
            if idx + 1 < len(lines):
                supplier_name = lines[idx + 1].strip()
            break

    return supplier_name, receipt_date


@app.post("/scan", response_model=ScanResponse)
async def scan(request: ScanRequest):
    try:
        from paddleocr import PaddleOCR

        images = decode_image_bytes(request.imageBase64, request.mimeType)

        ocr = PaddleOCR(use_angle_cls=True, lang="cyrillic", show_log=False)

        all_lines: list[str] = []
        for image in images:
            import numpy as np
            img_array = np.array(image)
            result = ocr.ocr(img_array, cls=True)
            all_lines.extend(parse_ocr_lines(result))

        supplier_name, receipt_date = extract_meta(all_lines)
        items = parse_product_lines(all_lines)

        return ScanResponse(
            supplierName=supplier_name,
            receiptDate=receipt_date,
            items=items,
            tier="free",
        )
    except Exception:
        traceback.print_exc()
        raise  # Let NestJS fall back to Claude


@app.get("/health")
async def health():
    return {"status": "ok"}
