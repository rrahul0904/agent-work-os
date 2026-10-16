# CadQuery kernel worker

P2 engine adapter for CAD Agent Studio. It turns a normalized `cad.agent.model/v1` spec into real OCCT-backed geometry through pinned CadQuery, exports STEP/STL, measures the resulting kernel shape, evaluates assertions, and emits a replay-oriented receipt.

This initial worker deliberately accepts a small declarative primitive schema rather than arbitrary agent-generated Python. Arbitrary model-code execution belongs behind the later isolated-code runner with no-egress, workspace-root, timeout, memory and syscall controls.

## Run

```bash
python -m pip install -r workers/cadquery/requirements.lock.txt
python workers/cadquery/worker.py --spec model.json --out ./out
```

## Replay rule
Artifact bytes are recorded but are not the semantic equality gate because CAD exporters may encode non-semantic differences. Replay compares `semanticDigest`, which is derived from normalized model intent plus kernel measurements/topology.
