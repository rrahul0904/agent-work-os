import unittest

from rea_gate import evaluate


class ReaGateTests(unittest.TestCase):
    def test_unresolved_short_link_is_blocked(self):
        self.assertEqual(evaluate({}), "SOURCE_IDENTITY_BLOCKED")

    def test_donor_cannot_skip_clean_room_boundary(self):
        record = {
            "canonical_url": "https://www.reddit.com/r/x/comments/a/b/",
            "evidence_captured": True,
            "provenance": "DONOR_REFERENCE",
            "clean_room_required": False,
        }
        self.assertEqual(evaluate(record), "CLEAN_ROOM_REQUIRED")

    def test_existing_lineage_is_folded_not_new_sku(self):
        record = {
            "canonical_url": "https://www.reddit.com/r/x/comments/a/b/",
            "evidence_captured": True,
            "provenance": "OWNED",
            "dedupe_decision": "FOLD_EXISTING",
            "existing_lineage": "Sentinel Reliability Runtime",
        }
        self.assertEqual(evaluate(record), "FOLDED_EXISTING_LINEAGE")

    def test_sellable_candidate_requires_all_gates(self):
        record = {
            "canonical_url": "https://www.reddit.com/r/x/comments/a/b/",
            "evidence_captured": True,
            "provenance": "OWNED",
            "dedupe_decision": "NEW_LINEAGE",
            "implementation_state": "COMPLETE",
            "verification_state": "PASS",
            "packaging_state": "COMPLETE",
        }
        self.assertEqual(evaluate(record), "SELLABLE_CANDIDATE")


if __name__ == "__main__":
    unittest.main()
