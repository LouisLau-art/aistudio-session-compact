#!/usr/bin/env python3
import argparse
import json
import sys


def extract_lines(result):
    lines = []
    if not result:
        return lines

    for page in result:
        if not page:
            continue
        for item in page:
            if not isinstance(item, (list, tuple)) or len(item) < 2:
                continue
            meta = item[1]
            if not isinstance(meta, (list, tuple)) or len(meta) < 1:
                continue
            text = str(meta[0]).strip()
            if text:
                lines.append(text)
    return lines


def main():
    parser = argparse.ArgumentParser(description="Run PaddleOCR on one image and return JSON")
    parser.add_argument("--image", required=True, help="Path to image")
    parser.add_argument("--lang", default="ch", help="PaddleOCR lang, e.g. ch/en")
    args = parser.parse_args()

    try:
        from paddleocr import PaddleOCR
    except Exception as exc:
        print(json.dumps({"error": f"paddleocr import failed: {exc}"}, ensure_ascii=False))
        sys.exit(2)

    try:
        ocr = PaddleOCR(use_angle_cls=True, lang=args.lang, show_log=False)
        result = ocr.ocr(args.image, cls=True)
        lines = extract_lines(result)
        payload = {
            "engine": "paddleocr",
            "lang": args.lang,
            "line_count": len(lines),
            "text": " ".join(lines).strip(),
        }
        print(json.dumps(payload, ensure_ascii=False))
    except Exception as exc:
        print(json.dumps({"error": f"paddleocr run failed: {exc}"}, ensure_ascii=False))
        sys.exit(3)


if __name__ == "__main__":
    main()
