from __future__ import annotations

import argparse
import json
from pathlib import Path


def evaluate(record: dict) -> str:
    if not record.get("canonical_url"):
        return "SOURCE_IDENTITY_BLOCKED"

    if not record.get("evidence_captured"):
        return "EVIDENCE_PENDING"

    provenance = record.get("provenance")
    if provenance not in {"OWNED", "LICENSE_CLEAR", "DONOR_REFERENCE"}:
        return "PROVENANCE_PENDING"

    if provenance == "DONOR_REFERENCE" and not record.get("clean_room_required"):
        return "CLEAN_ROOM_REQUIRED"

    dedupe = record.get("dedupe_decision")
    if dedupe not in {"NEW_LINEAGE", "FOLD_EXISTING"}:
        return "DEDUPE_PENDING"

    if dedupe == "FOLD_EXISTING":
        if not record.get("existing_lineage"):
            return "DEDUPE_PENDING"
        return "FOLDED_EXISTING_LINEAGE"

    if provenance == "DONOR_REFERENCE" and record.get("clean_room_state") != "COMPLETE":
        return "CLEAN_ROOM_REBUILD"

    if record.get("implementation_state") != "COMPLETE":
        return "IMPLEMENTATION_REQUIRED"

    if record.get("verification_state") != "PASS":
        return "E2E_REQUIRED"

    if record.get("packaging_state") != "COMPLETE":
        return "PACKAGE_REQUIRED"

    return "SELLABLE_CANDIDATE"


def main() -> int:
    parser = argparse.ArgumentParser(description="Evaluate an n8n REA target against commercialization gates.")
    parser.add_argument("record", type=Path)
    args = parser.parse_args()
    payload = json.loads(args.record.read_text())
    print(evaluate(payload))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
