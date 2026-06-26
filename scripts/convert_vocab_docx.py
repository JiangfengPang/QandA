#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
from collections import OrderedDict
from datetime import date
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET
from zipfile import ZipFile


WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
SECTION_NAMES = {"Words in use", "Word building", "Banked cloze", "Expressions in use"}
SECTION_SLUGS = {
    "Words in use": "words-in-use",
    "Word building": "word-building",
    "Banked cloze": "banked-cloze",
    "Expressions in use": "expressions-in-use",
    "高频重复候选词": "high-frequency",
}


def qn(name: str) -> str:
    return f"{{{WORD_NS}}}{name}"


def clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def paragraph_text(node: ET.Element) -> str:
    return clean_text("".join(text.text or "" for text in node.findall(".//" + qn("t"))))


def table_rows(node: ET.Element) -> list[list[str]]:
    rows: list[list[str]] = []
    for tr in node.findall("./" + qn("tr")):
        cells: list[str] = []
        for tc in tr.findall("./" + qn("tc")):
            parts = [paragraph_text(p) for p in tc.findall("./" + qn("p"))]
            cells.append(clean_text(" ".join(part for part in parts if part)))
        if any(cells):
            rows.append(cells)
    return rows


def iter_document_blocks(docx_path: Path):
    with ZipFile(docx_path) as archive:
        root = ET.fromstring(archive.read("word/document.xml"))
    body = root.find(qn("body"))
    if body is None:
        return
    for child in body:
        if child.tag == qn("p"):
            yield "p", paragraph_text(child)
        elif child.tag == qn("tbl"):
            yield "tbl", table_rows(child)


def slugify(value: str, fallback: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or fallback


def safe_filename(value: str) -> str:
    name = re.sub(r'[\\/:*?"<>|]+', "-", value)
    name = re.sub(r"\s+", " ", name).strip()
    return name or "vocab-bank"


def normalize_term(value: str) -> str:
    return clean_text(value)


def normalize_meaning(value: str) -> str:
    return clean_text(value)


def is_standard_vocab_table(rows: list[list[str]]) -> bool:
    if not rows:
        return False
    header = rows[0]
    return len(header) >= 3 and "候选词" in header[1] and "中文" in header[2]


def is_frequency_table(rows: list[list[str]]) -> bool:
    if not rows:
        return False
    header = rows[0]
    return len(header) >= 4 and header[0] == "候选词" and "出现" in header[1] and "中文" in header[3]


def ensure_unit(units: OrderedDict[str, dict[str, Any]], key: str, name: str, title: str, number: int | None):
    if key not in units:
        units[key] = {"key": key, "name": name, "title": title, "number": number, "items": []}
    return units[key]


def parse_docx(docx_path: Path) -> OrderedDict[str, dict[str, Any]]:
    units: OrderedDict[str, dict[str, Any]] = OrderedDict()
    current_unit_key = ""
    current_section = ""
    frequency_mode = False

    for kind, payload in iter_document_blocks(docx_path):
        if kind == "p":
            text = str(payload)
            unit_match = re.match(r"^Unit\s+(\d+)\s+(.+)$", text)
            if unit_match:
                number = int(unit_match.group(1))
                title = clean_text(unit_match.group(2))
                current_unit_key = f"unit-{number}"
                current_section = ""
                frequency_mode = False
                ensure_unit(units, current_unit_key, f"Unit {number} {title}", title, number)
                continue

            if text in SECTION_NAMES:
                current_section = text
                continue

            if text.startswith("高频重复候选词"):
                current_unit_key = "high-frequency"
                current_section = "高频重复候选词"
                frequency_mode = True
                ensure_unit(units, current_unit_key, text, text, None)
                continue

        if kind != "tbl":
            continue

        rows = payload
        if is_standard_vocab_table(rows) and current_unit_key and current_section in SECTION_NAMES:
            unit = units[current_unit_key]
            for row in rows[1:]:
                if len(row) < 3:
                    continue
                term = normalize_term(row[1])
                meaning = normalize_meaning(row[2])
                if not term or not meaning:
                    continue
                unit["items"].append({
                    "term": term,
                    "meaning": meaning,
                    "section": current_section,
                    "source": f"{unit['name']} · {current_section}",
                })
            continue

        if frequency_mode and is_frequency_table(rows):
            unit = units[current_unit_key]
            for row in rows[1:]:
                if len(row) < 4:
                    continue
                term = normalize_term(row[0])
                meaning = normalize_meaning(row[3])
                if not term or not meaning:
                    continue
                unit["items"].append({
                    "term": term,
                    "meaning": meaning,
                    "section": current_section,
                    "count": clean_text(row[1]),
                    "positions": clean_text(row[2]),
                    "source": current_section,
                })

    return units


def make_question(unit: dict[str, Any], item: dict[str, str], index: int, subject_id: str) -> dict[str, Any]:
    section = item["section"]
    section_slug = SECTION_SLUGS.get(section, slugify(section, "vocab"))
    term_slug = slugify(item["term"], f"term-{index:03d}")
    unit_slug = unit["key"].replace("_", "-")
    source = item.get("source") or unit["name"]
    explanation_lines = [
        f"正确词汇：{item['term']}",
        f"中文记忆：{item['meaning']}",
        f"来源：{source}",
    ]
    if item.get("count"):
        explanation_lines.append(f"出现次数：{item['count']}")
    if item.get("positions"):
        explanation_lines.append(f"出现位置：{item['positions']}")

    return {
        "id": f"{subject_id}-{unit_slug}-{section_slug}-{index:03d}-{term_slug}",
        "type": "fill",
        "typeLabel": "词汇填空",
        "difficulty": "easy",
        "tags": [unit["name"], section, "词汇"],
        "score": 1,
        "question": f"{item['meaning']}\n\n请写出对应的英文候选词 / 短语。",
        "answer": [item["term"]],
        "explanation": "\n".join(explanation_lines),
    }


def make_bank(unit: dict[str, Any], args: argparse.Namespace) -> dict[str, Any]:
    unit_id = f"{args.subject_id}-{unit['key']}"
    questions = [
        make_question(unit, item, index, args.subject_id)
        for index, item in enumerate(unit["items"], 1)
    ]
    return {
        "version": 1,
        "source": Path(args.input_docx).name,
        "subject": {
            "id": args.subject_id,
            "name": args.subject_name,
            "description": args.subject_description,
            "color": args.subject_color,
        },
        "unit": {
            "id": unit_id,
            "name": unit["name"],
            "description": "由 Word 词汇表自动转换为填空刷词题。",
        },
        "questions": questions,
    }


def write_json(path: Path, payload: Any):
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def update_index(index_path: Path, subject: dict[str, Any]):
    if index_path.exists():
        index = json.loads(index_path.read_text(encoding="utf-8"))
    else:
        index = {"version": 1, "subjects": []}

    subjects = [
        item for item in index.get("subjects", [])
        if item.get("id") != subject["id"] and item.get("name") != subject["name"]
    ]
    subjects.append(subject)
    index["subjects"] = subjects
    index["updatedAt"] = date.today().isoformat()
    write_json(index_path, index)


def convert(args: argparse.Namespace):
    docx_path = Path(args.input_docx).expanduser().resolve()
    if not docx_path.exists():
        raise SystemExit(f"找不到 Word 文件：{docx_path}")

    question_banks_dir = Path(args.question_banks_dir).resolve()
    question_banks_dir.mkdir(parents=True, exist_ok=True)

    units = parse_docx(docx_path)
    if not units:
        raise SystemExit("没有在 Word 文件中找到可转换的词汇表。")

    index_units = []
    total_questions = 0
    for unit in units.values():
        if not unit["items"]:
            continue
        bank = make_bank(unit, args)
        file_name = f"{safe_filename(args.subject_name)}-{safe_filename(unit['name'])}.json"
        out_path = question_banks_dir / file_name
        write_json(out_path, bank)
        total_questions += len(bank["questions"])
        index_units.append({
            "id": bank["unit"]["id"],
            "name": bank["unit"]["name"],
            "description": bank["unit"]["description"],
            "file": file_name,
            "questionCount": len(bank["questions"]),
        })
        print(f"写入 {out_path}：{len(bank['questions'])} 题")

    if args.update_index:
        subject_entry = {
            "id": args.subject_id,
            "name": args.subject_name,
            "description": args.subject_description,
            "color": args.subject_color,
            "units": index_units,
        }
        update_index(question_banks_dir / "index.json", subject_entry)
        print(f"已更新 {(question_banks_dir / 'index.json')}")

    print(f"转换完成：{len(index_units)} 个单元，{total_questions} 道词汇填空题")


def main():
    parser = argparse.ArgumentParser(description="把 Word 词汇表转换成 QandA 填空刷词题库 JSON。")
    parser.add_argument("input_docx", help="Word 词汇表 .docx 路径")
    parser.add_argument("--question-banks-dir", default="question-banks", help="题库 JSON 输出目录")
    parser.add_argument("--subject-id", default="subject-new-horizon-2-vocab")
    parser.add_argument("--subject-name", default="新视野大学英语2词汇")
    parser.add_argument("--subject-description", default="Unit 1-5 PPT 候选词汇填空刷词题。")
    parser.add_argument("--subject-color", default="#2f80ed")
    parser.add_argument("--update-index", action="store_true", help="把生成的词汇题库写入 question-banks/index.json")
    convert(parser.parse_args())


if __name__ == "__main__":
    main()
