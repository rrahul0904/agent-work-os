from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Iterable

ALLOWED_STATES = {
    "DONOR_ONLY", "REBUILD_REQUIRED", "PACKAGE_REQUIRED", "E2E_REQUIRED",
    "RIGHTS_REQUIRED", "SELLABLE", "PUBLISHED"
}

REQUIRED_PACKAGE_FILES = [
    "QUICKSTART.md", "DEPENDENCIES.md", "TEST_MATRIX.md", "SUPPORT.md",
    "PROVENANCE.md", "LICENSE_STATUS.md", "RELEASE_RECEIPT.md"
]

SECRET_PATTERNS = [
    re.compile(r"(?i)(api[_-]?key|secret|token|password)\s*[:=]\s*['\"]?[A-Za-z0-9_\-]{16,}"),
    re.compile(r"sk-[A-Za-z0-9]{20,}"),
    re.compile(r"ghp_[A-Za-z0-9]{20,}"),
]

@dataclass
class AuditResult:
    repo_root: str
    workflow_path: str | None
    workflow_valid_json: bool
    workflow_has_nodes: bool
    required_files_present: list[str]
    missing_files: list[str]
    secret_hits: list[str]
    rights_clear: bool
    provider_e2e_pass: bool
    clean_room_complete: bool
    computed_state: str


def load_registry(path: Path) -> dict:
    payload = json.loads(path.read_text())
    products = payload.get("products", [])
    slugs = [p.get("slug") for p in products]
    repos = [p.get("repo") for p in products]
    if len(products) != 20:
        raise ValueError(f"expected 20 code-backed products, found {len(products)}")
    if None in slugs or len(set(slugs)) != len(slugs):
        raise ValueError("product slugs must be present and unique")
    if None in repos:
        raise ValueError("every product must have a repo")
    for p in products:
        if p.get("state") not in ALLOWED_STATES:
            raise ValueError(f"invalid state for {p['slug']}: {p.get('state')}")
        if p.get("state") == "DONOR_ONLY" and not p.get("clean_room"):
            raise ValueError(f"DONOR_ONLY product {p['slug']} must require clean-room work")
    return payload


def _iter_text_files(root: Path) -> Iterable[Path]:
    for p in root.rglob("*"):
        if not p.is_file() or ".git" in p.parts:
            continue
        if p.stat().st_size > 2_000_000:
            continue
        if p.suffix.lower() in {".md", ".json", ".yml", ".yaml", ".env", ".txt", ".js", ".mjs", ".ts"} or p.name.startswith(".env"):
            yield p


def scan_secrets(root: Path) -> list[str]:
    hits: list[str] = []
    for p in _iter_text_files(root):
        try:
            text = p.read_text(errors="ignore")
        except OSError:
            continue
        for pattern in SECRET_PATTERNS:
            if pattern.search(text):
                hits.append(str(p.relative_to(root)))
                break
    return sorted(set(hits))


def validate_workflow(path: Path | None) -> tuple[bool, bool]:
    if not path or not path.exists():
        return False, False
    try:
        payload = json.loads(path.read_text())
    except Exception:
        return False, False
    return True, isinstance(payload.get("nodes"), list) and len(payload["nodes"]) > 0


def compute_state(*, donor_only: bool, clean_room_required: bool, clean_room_complete: bool,
                  rights_clear: bool, package_complete: bool, workflow_valid: bool,
                  secret_hits: list[str], provider_required: bool, provider_e2e_pass: bool) -> str:
    if donor_only:
        return "REBUILD_REQUIRED" if clean_room_required else "DONOR_ONLY"
    if clean_room_required and not clean_room_complete:
        return "REBUILD_REQUIRED"
    if not rights_clear:
        return "RIGHTS_REQUIRED"
    if secret_hits or not workflow_valid or not package_complete:
        return "PACKAGE_REQUIRED"
    if provider_required and not provider_e2e_pass:
        return "E2E_REQUIRED"
    return "SELLABLE"


def audit_repo(root: Path, workflow: Path | None, *, donor_only: bool = False,
               clean_room_required: bool = False, clean_room_complete: bool = False,
               rights_clear: bool = False, provider_required: bool = True,
               provider_e2e_pass: bool = False) -> AuditResult:
    present = [f for f in REQUIRED_PACKAGE_FILES if (root / f).exists()]
    missing = [f for f in REQUIRED_PACKAGE_FILES if f not in present]
    valid_json, has_nodes = validate_workflow(workflow)
    secrets = scan_secrets(root)
    state = compute_state(
        donor_only=donor_only,
        clean_room_required=clean_room_required,
        clean_room_complete=clean_room_complete,
        rights_clear=rights_clear,
        package_complete=not missing,
        workflow_valid=valid_json and has_nodes,
        secret_hits=secrets,
        provider_required=provider_required,
        provider_e2e_pass=provider_e2e_pass,
    )
    return AuditResult(
        repo_root=str(root), workflow_path=str(workflow) if workflow else None,
        workflow_valid_json=valid_json, workflow_has_nodes=has_nodes,
        required_files_present=present, missing_files=missing, secret_hits=secrets,
        rights_clear=rights_clear, provider_e2e_pass=provider_e2e_pass,
        clean_room_complete=clean_room_complete, computed_state=state,
    )


def scaffold(root: Path, product: str) -> list[str]:
    root.mkdir(parents=True, exist_ok=True)
    templates = {
        "QUICKSTART.md": f"# {product} Quickstart\n\n## Supported n8n version\nTBD\n\n## Install\n1. Configure credentials outside Git.\n2. Import the workflow.\n3. Run deterministic demo fixtures before activation.\n",
        "DEPENDENCIES.md": f"# {product} Dependencies\n\nList every runtime, provider, paid service, credential type, callback URL, and expected cost here.\n",
        "TEST_MATRIX.md": f"# {product} Test Matrix\n\n| Scenario | Expected result | Evidence |\n|---|---|---|\n| Import | Workflow imports on pinned n8n version | PENDING |\n| Happy path | Deterministic expected output | PENDING |\n| Malformed input | Safe rejection | PENDING |\n| Duplicate | No duplicate side effect | PENDING |\n| Provider outage | Classified retry/fallback | PENDING |\n| Replay | Safe replay or documented non-replayable boundary | PENDING |\n| Kill switch | Side effects can be disabled | PENDING |\n",
        "SUPPORT.md": f"# {product} Support Boundary\n\nDocument supported n8n versions, provider versions, installation scope, response commitments, exclusions, and upgrade policy.\n",
        "PROVENANCE.md": f"# {product} Provenance\n\nStatus: UNVERIFIED\n\nRecord source identity, exact source SHA, authorship/license evidence, donor references, and clean-room boundary.\n",
        "LICENSE_STATUS.md": f"# {product} License Status\n\nShipping status: NO-GO until commercial rights are evidenced or a clean-room implementation is substituted.\n",
        "RELEASE_RECEIPT.md": f"# {product} Release Receipt\n\nDecision: NO-GO\n\nCandidate SHA: TBD\nSupported n8n: TBD\nImport: PENDING\nDeterministic tests: PENDING\nProvider-safe E2E: PENDING\nSecret scan: PENDING\nRights/provenance: PENDING\n",
    }
    created = []
    for name, body in templates.items():
        p = root / name
        if not p.exists():
            p.write_text(body)
            created.append(name)
    return created


def main() -> int:
    parser = argparse.ArgumentParser(description="n8n commercial release factory")
    sub = parser.add_subparsers(dest="cmd", required=True)

    v = sub.add_parser("validate-registry")
    v.add_argument("registry", type=Path)

    s = sub.add_parser("scaffold")
    s.add_argument("repo_root", type=Path)
    s.add_argument("--product", required=True)

    a = sub.add_parser("audit")
    a.add_argument("repo_root", type=Path)
    a.add_argument("--workflow", type=Path)
    a.add_argument("--rights-clear", action="store_true")
    a.add_argument("--provider-required", action="store_true")
    a.add_argument("--provider-e2e-pass", action="store_true")
    a.add_argument("--donor-only", action="store_true")
    a.add_argument("--clean-room-required", action="store_true")
    a.add_argument("--clean-room-complete", action="store_true")

    args = parser.parse_args()
    if args.cmd == "validate-registry":
        payload = load_registry(args.registry)
        print(json.dumps({"valid": True, "count": len(payload["products"])}, indent=2))
        return 0
    if args.cmd == "scaffold":
        print(json.dumps({"created": scaffold(args.repo_root, args.product)}, indent=2))
        return 0
    result = audit_repo(
        args.repo_root, args.workflow,
        donor_only=args.donor_only,
        clean_room_required=args.clean_room_required,
        clean_room_complete=args.clean_room_complete,
        rights_clear=args.rights_clear,
        provider_required=args.provider_required,
        provider_e2e_pass=args.provider_e2e_pass,
    )
    print(json.dumps(asdict(result), indent=2))
    return 0 if result.computed_state == "SELLABLE" else 2


if __name__ == "__main__":
    raise SystemExit(main())
