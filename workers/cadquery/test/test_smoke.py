import math
import tempfile
import unittest
from pathlib import Path

from worker import build_and_export


class CadQueryWorkerSmoke(unittest.TestCase):
    def test_box_build_exports_and_replays_semantically(self):
        spec = {
            "id": "enclosure",
            "name": "Enclosure",
            "units": "mm",
            "primitive": "box",
            "dimensions": {"width": 100, "depth": 60, "height": 25},
            "assertions": [
                {"path": "bounds.x", "expected": 100, "tolerance": 1e-6},
                {"path": "bounds.z", "expected": 25, "tolerance": 1e-6},
            ],
        }
        with tempfile.TemporaryDirectory() as a, tempfile.TemporaryDirectory() as b:
            first = build_and_export(spec, a)
            second = build_and_export(spec, b)
            self.assertTrue(first["valid"])
            self.assertEqual(first["semanticDigest"], second["semanticDigest"])
            self.assertAlmostEqual(first["measurements"]["volume"], 150000, places=4)
            self.assertEqual(first["measurements"]["topology"]["solids"], 1)
            for name in ["model.step", "model.stl", "receipt.json"]:
                self.assertTrue((Path(a) / name).exists())
                self.assertGreater((Path(a) / name).stat().st_size, 0)

    def test_cylinder_kernel_measurements(self):
        spec = {
            "primitive": "cylinder",
            "units": "mm",
            "dimensions": {"radius": 10, "height": 20},
            "assertions": [{"path": "bounds.x", "expected": 20, "tolerance": 1e-6}],
        }
        with tempfile.TemporaryDirectory() as out:
            receipt = build_and_export(spec, out)
            self.assertTrue(receipt["valid"])
            self.assertAlmostEqual(receipt["measurements"]["volume"], math.pi * 10 * 10 * 20, places=3)


if __name__ == "__main__":
    unittest.main()
