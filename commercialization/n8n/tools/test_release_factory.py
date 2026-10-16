import json
import tempfile
import unittest
from pathlib import Path

from release_factory import (
    REQUIRED_PACKAGE_FILES,
    audit_repo,
    compute_state,
    load_registry,
    scaffold,
)


class ReleaseFactoryTests(unittest.TestCase):
    def test_registry_has_20_unique_products(self):
        registry = Path(__file__).parents[1] / "release_registry.json"
        payload = load_registry(registry)
        self.assertEqual(len(payload["products"]), 20)
        self.assertEqual(len({p["slug"] for p in payload["products"]}), 20)

    def test_donor_cannot_be_sellable(self):
        state = compute_state(
            donor_only=True,
            clean_room_required=True,
            clean_room_complete=False,
            rights_clear=False,
            package_complete=True,
            workflow_valid=True,
            secret_hits=[],
            provider_required=False,
            provider_e2e_pass=False,
        )
        self.assertEqual(state, "REBUILD_REQUIRED")

    def test_provider_gate_blocks_sellable(self):
        state = compute_state(
            donor_only=False,
            clean_room_required=False,
            clean_room_complete=False,
            rights_clear=True,
            package_complete=True,
            workflow_valid=True,
            secret_hits=[],
            provider_required=True,
            provider_e2e_pass=False,
        )
        self.assertEqual(state, "E2E_REQUIRED")

    def test_scaffold_and_audit_can_reach_sellable(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            scaffold(root, "Demo")
            self.assertTrue(all((root / f).exists() for f in REQUIRED_PACKAGE_FILES))
            workflow = root / "workflow.json"
            workflow.write_text(json.dumps({"nodes": [{"name": "Start", "type": "n8n-nodes-base.set"}], "connections": {}}))
            result = audit_repo(
                root,
                workflow,
                rights_clear=True,
                provider_required=False,
                provider_e2e_pass=False,
            )
            self.assertEqual(result.computed_state, "SELLABLE")

    def test_secret_hit_blocks_sellable(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            scaffold(root, "Demo")
            workflow = root / "workflow.json"
            workflow.write_text(json.dumps({"nodes": [{"name": "Start"}], "connections": {}}))
            (root / ".env").write_text("API_KEY=abcdefghijklmnop123456789")
            result = audit_repo(root, workflow, rights_clear=True, provider_required=False)
            self.assertEqual(result.computed_state, "PACKAGE_REQUIRED")
            self.assertIn(".env", result.secret_hits)


if __name__ == "__main__":
    unittest.main()
