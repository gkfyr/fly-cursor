"""Integration checks against the downloaded graph, not mock movement."""
import unittest
from pathlib import Path
import numpy as np
from brain import Brain

@unittest.skipUnless(all((Path(__file__).resolve().parents[1] / 'build' / name).exists()
                         for name in ['connectome.npz', 'neurons.npz', 'manifest.json']),
                     'Run prepare.py to enable real-data integration tests')
class BrainChecks(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.brain = Brain()

    def test_measured_graph_and_groups(self):
        self.assertEqual(self.brain.n, 165122)
        self.assertEqual(self.brain.graph.nnz, 10228000)
        self.assertTrue(all(len(g) for g in self.brain.groups.values()))

    def test_visual_drive_and_repeatability(self):
        pixels = np.tile(np.linspace(0,1,64),40).tolist()
        self.brain.reset(42)
        first = self.brain.step(pixels,64,40)
        self.brain.reset(42)
        again = self.brain.step(pixels,64,40)
        self.assertEqual(first['hz'],again['hz'])
        self.assertGreater(first['spikes'],0)
        self.assertTrue(any(first['hz'].values()))
        self.assertTrue(first['drive'] or first['turn'])
        # Turning off sensory input removes neural and cursor output.
        off = self.brain.step(pixels,64,40,False)
        self.assertEqual(off['spikes'],0)
        self.assertEqual(off['drive'],0)
        self.assertEqual(off['turn'],0)

if __name__ == '__main__':
    unittest.main()
