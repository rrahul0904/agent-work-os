#!/usr/bin/env python3
import argparse
import hashlib
import json
import math
import platform
from pathlib import Path
from typing import Any

import cadquery as cq

SCHEMA = "cad.agent.kernel-receipt/v1"


def _stable_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _sha256_json(value: Any) -> str:
    return _sha256_bytes(_stable_json(value).encode("utf-8"))


def _sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def _positive(value: Any, name: str) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{name} must be numeric") from exc
    if not math.isfinite(number) or number <= 0:
        raise ValueError(f"{name} must be a positive finite number")
    return number


def normalize_spec(raw: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raise ValueError("model spec must be an object")
    primitive = raw.get("primitive")
    if primitive not in {"box", "cylinder"}:
        raise ValueError(f"unsupported primitive: {primitive}")
    units = raw.get("units", "mm")
    if units != "mm":
        raise ValueError("kernel v1 supports millimeters only")
    dims = dict(raw.get("dimensions") or {})
    if primitive == "box":
        dims = {
            "width": _positive(dims.get("width"), "width"),
            "depth": _positive(dims.get("depth"), "depth"),
            "height": _positive(dims.get("height"), "height"),
        }
    else:
        dims = {
            "radius": _positive(dims.get("radius"), "radius"),
            "height": _positive(dims.get("height"), "height"),
        }
    return {
        "schemaVersion": "cad.agent.model/v1",
        "id": str(raw.get("id", "untitled")),
        "name": str(raw.get("name", "Untitled model")),
        "units": units,
        "primitive": primitive,
        "dimensions": dims,
        "assertions": list(raw.get("assertions") or []),
    }


def build_shape(spec: dict[str, Any]):
    dims = spec["dimensions"]
    if spec["primitive"] == "box":
        return cq.Workplane("XY").box(dims["width"], dims["depth"], dims["height"])
    return cq.Workplane("XY").circle(dims["radius"]).extrude(dims["height"])


def measure_shape(workplane) -> dict[str, Any]:
    shape = workplane.val()
    bb = shape.BoundingBox()
    topology = {
        "solids": len(shape.Solids()),
        "faces": len(shape.Faces()),
        "edges": len(shape.Edges()),
        "vertices": len(shape.Vertices()),
    }
    return {
        "bounds": {"x": bb.xlen, "y": bb.ylen, "z": bb.zlen},
        "volume": shape.Volume(),
        "topology": topology,
    }


def _read_path(root: dict[str, Any], path: str):
    current: Any = root
    for part in path.split("."):
        if not isinstance(current, dict) or part not in current:
            return None
        current = current[part]
    return current


def evaluate_assertions(measurements: dict[str, Any], assertions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    results = []
    for raw in assertions:
        path = str(raw.get("path", ""))
        expected = raw.get("expected")
        tolerance = float(raw.get("tolerance", 0.0))
        actual = _read_path(measurements, path)
        ok = isinstance(actual, (int, float)) and isinstance(expected, (int, float)) and abs(actual - expected) <= tolerance
        results.append({"path": path, "expected": expected, "tolerance": tolerance, "actual": actual, "ok": ok})
    return results


def _safe_out_dir(path: str) -> Path:
    out = Path(path).expanduser().resolve()
    if out == Path(out.anchor):
        raise ValueError("refusing filesystem root as output directory")
    out.mkdir(parents=True, exist_ok=True)
    return out


def build_and_export(raw_spec: dict[str, Any], out_dir: str) -> dict[str, Any]:
    spec = normalize_spec(raw_spec)
    out = _safe_out_dir(out_dir)
    workplane = build_shape(spec)
    measurements = measure_shape(workplane)
    checks = evaluate_assertions(measurements, spec["assertions"])

    step_path = out / "model.step"
    stl_path = out / "model.stl"
    cq.exporters.export(workplane, str(step_path))
    cq.exporters.export(workplane, str(stl_path))

    semantic_payload = {
        "spec": {key: value for key, value in spec.items() if key != "assertions"},
        "measurements": measurements,
    }
    receipt = {
        "schemaVersion": SCHEMA,
        "engine": {
            "adapter": "cadquery",
            "cadquery": getattr(cq, "__version__", "unknown"),
            "python": platform.python_version(),
        },
        "spec": spec,
        "measurements": measurements,
        "assertions": checks,
        "valid": all(item["ok"] for item in checks),
        "semanticDigest": _sha256_json(semantic_payload),
        "artifacts": {
            "step": {"path": step_path.name, "sha256": _sha256_file(step_path), "bytes": step_path.stat().st_size},
            "stl": {"path": stl_path.name, "sha256": _sha256_file(stl_path), "bytes": stl_path.stat().st_size},
        },
    }
    receipt["receiptDigest"] = _sha256_json(receipt)
    receipt_path = out / "receipt.json"
    receipt_path.write_text(json.dumps(receipt, indent=2, sort_keys=True), encoding="utf-8")
    return receipt


def main() -> int:
    parser = argparse.ArgumentParser(description="Pinned CAD Agent Studio CadQuery worker")
    parser.add_argument("--spec", required=True, help="Path to cad.agent.model/v1 JSON")
    parser.add_argument("--out", required=True, help="Output directory")
    args = parser.parse_args()

    spec_path = Path(args.spec).expanduser().resolve()
    raw = json.loads(spec_path.read_text(encoding="utf-8"))
    receipt = build_and_export(raw, args.out)
    print(json.dumps(receipt, sort_keys=True))
    return 0 if receipt["valid"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
