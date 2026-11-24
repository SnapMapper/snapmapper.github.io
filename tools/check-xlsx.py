#!/usr/bin/env python3
"""Check an exported .xlsx: every zip entry is well-formed XML and openpyxl can read it.

    python3 tools/check-xlsx.py mapper-log-2026-11-23.xlsx

openpyxl is optional; without it only the zip and XML checks run.
"""
import sys
import zipfile
import xml.dom.minidom


def main(path):
    with zipfile.ZipFile(path) as z:
        bad = z.testzip()
        assert bad is None, f"bad CRC in {bad}"
        for info in z.infolist():
            xml.dom.minidom.parseString(z.read(info.filename))
            print(f"  ok  {info.filename} ({info.file_size} bytes, method {info.compress_type})")
    try:
        import openpyxl
    except ImportError:
        print("openpyxl not installed; skipped the workbook check")
        return
    wb = openpyxl.load_workbook(path)
    for ws in wb.worksheets:
        print(f"\nSheet {ws.title!r}: {ws.max_row - 1} data rows, {ws.max_column} columns")
        for row in ws.iter_rows(min_row=1, max_row=min(ws.max_row, 4), values_only=True):
            print("  ", row)


if __name__ == "__main__":
    main(sys.argv[1])
