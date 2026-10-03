"""Download official MaleCNS v1.0 tables and build a signed sparse graph."""
from pathlib import Path
import hashlib
import json
import urllib.request
import numpy as np
import pandas as pd
import pyarrow.feather as feather
from scipy import sparse

ROOT = Path(__file__).resolve().parent
BASE = 'https://storage.googleapis.com/flyem-male-cns/v1.0/connectome-data/flat-connectome/'
FILES = {
    'annotations': 'body-annotations-male-cns-v1.0-minconf-0.5.feather',
    'neurotransmitters': 'body-neurotransmitters-male-cns-v1.0.feather',
    'weights': 'connectome-weights-male-cns-v1.0-minconf-0.5.feather',
}

def main():
    data, build = ROOT / 'data', ROOT / 'build'
    data.mkdir(exist_ok=True); build.mkdir(exist_ok=True)
    manifest = {'dataset': 'MaleCNS v1.0', 'source': 'https://male-cns.janelia.org/download/', 'files': {}}
    for name, filename in FILES.items():
        path = data / f'{name}.feather'
        if not path.exists():
            print(f'Downloading {filename}', flush=True)
            temporary = path.with_suffix('.partial')
            urllib.request.urlretrieve(BASE + filename, temporary)
            temporary.replace(path)
        digest = hashlib.sha256()
        with path.open('rb') as stream:
            for block in iter(lambda: stream.read(1024 * 1024), b''):
                digest.update(block)
        manifest['files'][name] = {'url': BASE + filename, 'sha256': digest.hexdigest()}
    print('Reading neuron annotations', flush=True)
    ann = pd.read_feather(data / 'annotations.feather')
    ann = ann[(ann.status == 'Traced') & (ann.statusLabel != 'Glia')].drop_duplicates('bodyId').set_index('bodyId').sort_index()
    bodies = ann.index.to_numpy(dtype=np.int64)
    nt = pd.read_feather(data / 'neurotransmitters.feather').drop_duplicates('body').set_index('body')
    signs = nt.consensus_nt.reindex(bodies).fillna('').str.lower().map({
        'acetylcholine': 1., 'gaba': -1., 'glutamate': -1., 'histamine': -1.,
    }).fillna(0).to_numpy(dtype=np.float32)
    types = ann['type'].fillna(ann.get('flywireType')).fillna(ann['instance']).fillna('').to_numpy(dtype=str)
    sides = ann.somaSide.fillna('').to_numpy(dtype=str)
    table = feather.read_table(data / 'weights.feather', memory_map=True)
    pres, posts, values = [], [], []
    print(f'Filtering {table.num_rows:,} connection rows', flush=True)
    for batch in table.to_batches(max_chunksize=250_000):
        frame = batch.to_pydict()
        pre = np.asarray(frame['body_pre'], dtype=np.int64)
        post = np.asarray(frame['body_post'], dtype=np.int64)
        weight = np.asarray(frame['weight'], dtype=np.float32)
        pi, qi = np.searchsorted(bodies, pre), np.searchsorted(bodies, post)
        pi = np.minimum(pi, len(bodies)-1); qi = np.minimum(qi, len(bodies)-1)
        keep = (bodies[pi] == pre) & (bodies[qi] == post) & (weight >= 3) & (signs[pi] != 0)
        pres.append(pi[keep].astype(np.int32)); posts.append(qi[keep].astype(np.int32))
        values.append(weight[keep] * signs[pi[keep]] * .275)
    graph = sparse.csc_matrix((np.concatenate(values), (np.concatenate(posts), np.concatenate(pres))), shape=(len(bodies), len(bodies)))
    graph.sum_duplicates()
    sparse.save_npz(build / 'connectome.npz', graph)
    hex1 = pd.to_numeric(ann.assignedOlHex1, errors='coerce').to_numpy(dtype=float)
    hex2 = pd.to_numeric(ann.assignedOlHex2, errors='coerce').to_numpy(dtype=float)
    np.savez_compressed(build / 'neurons.npz', bodies=bodies, types=types, sides=sides, hex1=hex1, hex2=hex2)
    manifest.update(neurons=len(bodies), edges=graph.nnz, minimum_synapses=3,
                    description='Traced non-glia neurons; signed chemical edges; unknown/modulatory fast weights omitted')
    (build / 'manifest.json').write_text(json.dumps(manifest, indent=2))
    print(json.dumps({k: manifest[k] for k in ['neurons', 'edges']}, indent=2), flush=True)

if __name__ == '__main__':
    main()
