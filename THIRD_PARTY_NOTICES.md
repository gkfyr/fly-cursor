# Third-party notices

## MaleCNS v1.0 data

Source: https://male-cns.janelia.org/download/

Data attribution: HHMI Janelia FlyEM, University of Cambridge, MRC Laboratory of Molecular Biology, and Google Research. The official dataset is distributed under CC-BY; follow the license linked on its source page. This repository does not redistribute the dataset. `prepare.py` downloads it separately, filters traced non-glia neurons and connections, and converts synapse counts and neurotransmitter predictions into simulation weights. Generated files retain source URLs and local SHA-256 hashes in `build/manifest.json`.

## flycoinrh reference implementation

Source: https://github.com/fruitflydev/flycoinrh

`prepare.py` and `brain.py` were developed with reference to the graph construction, LIF simulation, retinal mapping, and motor readout in flycoinrh. Its repository was not vendored. The upstream MIT notice is retained here to acknowledge the implementation reference and any adapted portions.

MIT License

Copyright (c) 2026 fruitflydev

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Research references

- Shiu et al. (2024), A Drosophila computational brain model reveals sensorimotor processing: https://doi.org/10.1038/s41586-024-07763-9
- Google Research, male fruit fly connectome overview: https://research.google/blog/a-connectomics-milestone-mapping-the-complete-male-fruit-fly-brain/
- awesome-fly project catalog: https://github.com/cobanov/awesome-fly

The experimental visual encoding and cursor readout are project-defined assumptions. Research results from the cited studies do not validate this cursor model. No affiliation with or endorsement by these projects or research institutions is implied.

## Runtime dependencies

NumPy, SciPy, pandas, and PyArrow are installed separately via `requirements.txt` and retain their respective licenses. Chrome APIs are provided by the user's browser. No third-party fonts, sprites, or browser libraries are bundled.
