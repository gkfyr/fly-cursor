"""Windowed LIF responses on measured MaleCNS connectivity; artificial adapters."""
from pathlib import Path
import json
import time
import numpy as np
from scipy import sparse

ROOT = Path(__file__).resolve().parent

class Brain:
    def __init__(self, seed=42):
        self.graph = sparse.load_npz(ROOT / 'build/connectome.npz').tocsc()
        z = np.load(ROOT / 'build/neurons.npz', allow_pickle=False)
        self.meta = json.loads((ROOT / 'build/manifest.json').read_text())
        self.n = self.graph.shape[0]
        types, sides = z['types'], z['sides']
        valid = np.isfinite(z['hex1']) & np.isfinite(z['hex2']) & np.isin(types, ['L1', 'L2'])
        self.eye = np.flatnonzero(valid)
        self.on = types[self.eye] == 'L1'
        xy = np.column_stack((z['hex1'][valid] + .5 * z['hex2'][valid], z['hex2'][valid] * np.sqrt(3)/2))
        self.uv = (xy - xy.min(axis=0)) / np.maximum(np.ptp(xy, axis=0), 1)
        self.groups = {
            'left': np.flatnonzero((types == 'DNa02') & (sides == 'L')),
            'right': np.flatnonzero((types == 'DNa02') & (sides == 'R')),
            'forward': np.flatnonzero(types == 'DNa01'),
            'reverse': np.flatnonzero(types == 'MDN'),
            'stop': np.flatnonzero(types == 'DNp09'),
        }
        if len(self.eye) == 0 or any(len(g) == 0 for g in self.groups.values()):
            raise ValueError('Required visual/motor neuron groups are missing')
        self.meta['retinal_neurons'] = len(self.eye)
        self.meta['motor_groups'] = {k: len(v) for k, v in self.groups.items()}
        self.reset(seed)

    def reset(self, seed=42):
        self.rng = np.random.default_rng(seed)
        self.v = np.full(self.n, -52., dtype=np.float32)
        self.refr = np.zeros(self.n, dtype=np.int16)
        self.sim_ms = 0

    def step(self, pixels, width, height, enabled=True):
        start = time.perf_counter()
        # Independent stimulus-response windows. Persistent dynamics silenced
        # motor groups in initial testing; do not represent this as a continuous brain.
        self.v.fill(-52.)
        self.refr.fill(0)
        pixels = np.asarray(pixels, dtype=np.float32).reshape(height, width)
        ix = np.minimum((self.uv[:, 0] * (width-1)).astype(int), width-1)
        iy = np.minimum((self.uv[:, 1] * (height-1)).astype(int), height-1)
        lum = pixels[iy, ix]
        rates = np.where(self.on, lum * 180, (1-lum) * 108) if enabled else np.zeros(len(lum))
        counts = np.zeros(self.n, dtype=np.int32)
        # 100 x 0.2 ms of neural time. RNG persists; membranes reset each window.
        dt, steps = .2, 100
        graph = self.graph
        for _ in range(steps):
            self.v = -52 + (self.v + 52) * np.float32(np.exp(-dt/20))
            self.refr = np.maximum(0, self.refr - 1)
            hit = self.eye[self.rng.random(len(self.eye)) < rates * dt / 1000]
            self.v[hit] = -44
            self.v[self.refr > 0] = -52
            fired = np.flatnonzero(self.v >= -45)
            if fired.size:
                counts[fired] += 1
                self.v[fired] = -52
                self.refr[fired] = 11
                # Gather only outgoing edges of neurons that actually spiked.
                first = graph.indptr[fired]
                sizes = graph.indptr[fired+1] - first
                total = int(sizes.sum())
                if total:
                    offsets = np.repeat(first - np.r_[0, np.cumsum(sizes)[:-1]], sizes)
                    edges = offsets + np.arange(total)
                    self.v += np.bincount(graph.indices[edges], weights=graph.data[edges], minlength=self.n).astype(np.float32)
        self.sim_ms += steps * dt
        hz = {k: float(counts[g].mean() / .02) for k, g in self.groups.items()}
        # Outputs, not biological flight equations. No noise is added to the cursor.
        turn = float(np.clip((hz['right'] - hz['left']) / 450, -1, 1))
        drive = float(np.clip((hz['forward'] - hz['reverse']) / 450, -1, 1))
        drive *= 1 - float(np.clip(hz['stop']/450, 0, 1))
        return {'hz': hz, 'turn': turn, 'drive': drive, 'active': int(np.count_nonzero(counts)),
                'spikes': int(counts.sum()), 'sim_ms': self.sim_ms,
                'compute_ms': round((time.perf_counter()-start)*1000, 1),
                'retina_mean_hz': float(rates.mean())}
