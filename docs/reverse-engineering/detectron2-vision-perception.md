# Detectron2 → Vision Perception Layer Research Dossier

**Snapshot:** 2026-10-11  
**Coordination issue:** #117  
**Source:** https://www.reddit.com/r/BestGitHubRepos/s/UZJTRCqwrN  
**Canonical upstream:** https://github.com/facebookresearch/detectron2  
**Inspected upstream head:** `1e3e13bbf607b54f62205c4c33922521822fb298` (2026-09-30)  
**License:** Apache-2.0

## Executive decision

Detectron2 should **not** be cloned as a new computer-vision framework or wrapped as a generic "Detectron2 SaaS." It is most valuable to us as a **capability donor and first reference model adapter** for a model-agnostic Vision Perception Layer.

The shared platform opportunity is:

> image/video/frame → pinned model/runtime → normalized `VisionObservation` → confidence/policy/human-review gate → agent/workflow/data consumer → immutable inference/effect evidence.

The best current standalone commercial candidate is **Visual Inspection OS for industrial/manufacturing quality workflows**. Retail shelf/store auditing and Visual ETL are strong follow-ons.

## What Detectron2 gives us

Detectron2 is a modular PyTorch computer-vision framework supporting object detection, instance/semantic/panoptic segmentation, keypoints/pose-related workloads, rotated boxes, and research projects such as DensePose, PointRend, DeepLab, ViTDet and related model families.

Reusable architectural seams include:

1. `DatasetCatalog` / `MetadataCatalog`
2. dataset mapper + augmentation
3. data loader
4. model/configuration layer
5. trainer + hooks
6. evaluators
7. checkpoints/model zoo
8. predictor / visualization
9. export/runtime adapters

The key lesson is not the individual architectures. The transferable pattern is the explicit separation of dataset representation, transformation, model execution, evaluation and runtime/export.

## Deployment reality

Detectron2 is research-oriented, not a turnkey universal deployment framework.

Upstream documentation supports TorchScript tracing/scripting for important model classes and documents Caffe2 tracing/export, while noting that the Caffe2 path is headed for deprecation and that additional format/runtime support is not a major upstream goal. Open issues continue to show friction around ONNX/TensorRT export and output equivalence.

**Decision:** Phase A is server/GPU-first. Edge/mobile is a later adapter family and must be certified against native reference outputs with hardware-specific tolerances and benchmarks.

## Market boundary

A horizontal "upload images → train → deploy" product is already crowded.

Current comparator categories include:

- **Roboflow:** dataset/annotation, training, evaluation, workflows and cloud/edge deployment.
- **Ultralytics:** YOLO-family training, export and managed deployment.
- **FiftyOne:** dataset exploration and sample-level model evaluation/error analysis.
- **Encord:** labeling, data curation, human-in-the-loop and active-learning workflows.
- **LandingLens:** manufacturing-focused visual inspection workflows.

Therefore our differentiation should be **governed perception tied to operational work and evidence**, not a generic CV studio.

## Product portfolio

### 1. Vision Agent Gateway / Agent Work OS Perception Layer — highest strategic fit

Provide typed visual tools such as:

- `detect_objects`
- `segment_regions`
- `observe_image`
- `observe_frame`
- `estimate_keypoints` when separately certified

The agent receives normalized observations with model/data/preprocessing provenance. A perception result can inform planning but never grants authority for browser/device/physical effects.

Potential consumers:

- browser agents when DOM/accessibility information is insufficient;
- mobile/desktop agents;
- media pipelines;
- inspection agents;
- warehouse/retail workflows;
- future physical-AI/robotics gateways.

### 2. Industrial Visual Inspection OS — highest standalone B2B priority

Workflow:

`camera/upload → detection/segmentation → defect/assembly rule → human review when required → alert/work item → evidence archive → uncertain/error queue → retraining`

Candidate applications:

- missing parts;
- incorrect orientation/alignment;
- scratches, dents and surface defects;
- weld/solder quality;
- sealant/adhesive coverage;
- package completeness;
- fastener/part counting;
- equipment-position monitoring;
- textile/print defects.

The product is not "AI vision." The product is **quality-inspection workflow + evidence + integration + model lifecycle**.

Likely pricing axes:

- production line/site/camera;
- inference volume;
- private/on-prem runtime;
- MES/ERP/QA connector tier;
- managed review/retraining.

### 3. Retail Shelf / Store Audit Intelligence

Applications:

- planogram compliance;
- facings/counts;
- out-of-stock detection;
- misplaced items;
- display/promotion verification;
- periodic photo audit;
- spill/aisle visual alerts where appropriate.

Useful workflow:

`store image/video → observations → merchandising rule engine → associate task → before/after evidence → analytics`.

### 4. Visual ETL / Image-to-Data

Convert visual media into governed structured data:

`image/video → detections/masks → normalized observations/events → table/Parquet/stream → warehouse/lake/BI/agent`.

Applications include asset inventory, warehouse counts, construction progress, agricultural counts, aerial imagery, media enrichment and enterprise visual telemetry.

This is a strong bridge to Snowflake/Fabric/data-engineering ecosystems.

### 5. Managed Vision Workbench

Useful as shared infrastructure:

`dataset → label/import → train/fine-tune → evaluate → inspect errors → freeze version → deploy`.

Do not lead with this as the public product because horizontal competition is strong.

### 6. Active Learning / Data Engine

Build selectively for our products:

`raw pool → model pre-label → human correction → error mining → hard-example queue → retrain → compare → promote`.

Avoid becoming a broad annotation platform unless a clear differentiation emerges.

### 7. Aerial / Geospatial

Possible workflows include roofs/buildings, roads, utility assets, solar panels, construction footprints and damage segmentation. Rotated boxes and segmentation are technically useful here, but geospatial transforms and specialized datasets are additional product requirements.

### 8. Agriculture

Possible workflows include crop/fruit counts, weed segmentation, coverage/growth estimation and visual damage detection. Distribution and reliable field capture will matter more than the model framework.

### 9. Media / Creator

Foreground masks, subject extraction, tagging and batch visual enrichment are possible, but this area is increasingly commoditized by general segmentation/foundation models.

### 10. Sports / Movement

DensePose/keypoint-style capabilities can support form/posture/movement analysis and video annotation. Identity recognition is deliberately not a default product direction.

## Recommended priority

1. **Vision Agent Gateway / Perception Layer** — shared platform capability.
2. **Industrial Visual Inspection OS** — first standalone commercial wedge.
3. **Retail Shelf / Store Audit** — follow-on vertical.
4. **Visual ETL / Image-to-Data** — enterprise/data-engineering bridge.
5. **Managed Vision Workbench** — internal/shared console.
6. **Active Learning Engine** — selective supporting capability.
7. Aerial/Agriculture — only with data/design-partner access.
8. Edge/mobile SDK — later, after export/runtime certification.

## Proposed architecture

```text
Media Source
   |
   v
Media Intake / Frame Sampler
   |
   v
Preprocess + Transform Manifest
   |
   v
Model Adapter Registry
   |---- Detectron2
   |---- future YOLO / RF-DETR adapter
   |---- future segmentation/foundation-model adapter
   |
   v
Normalized VisionObservation
   |
   +--> Visualization / Overlay
   +--> Rule / Policy Engine
   +--> Human Review
   +--> Agent Tool
   +--> Event / Data Pipeline
   +--> Evaluation / Drift Loop
   |
   v
VisionInferenceReceipt + Dataset/Model Provenance
```

### Core invariant

A model prediction is an **observation with uncertainty and provenance**. It is not automatically a real-world fact and never automatically an authorization to cause an external effect.

## Proposed contracts

### `vision-model/v1`

- adapter/model ID;
- framework/runtime;
- task classes;
- exact model/artifact digest;
- class/label-map digest;
- preprocessing digest;
- training dataset/version references where known;
- hardware/runtime requirements;
- evaluation evidence references;
- certification state.

### `vision-inference-request/v1`

- source/media digest;
- frame/time/crop identity;
- requested task/labels;
- adapter/model selection policy;
- confidence/postprocessing policy;
- retention/privacy policy;
- stable request digest.

### `vision-observation/v1`

- source/frame/request/model identity;
- classes;
- confidence/scores;
- boxes/masks/keypoints when applicable;
- coordinate/reference-space definition;
- preprocessing-transform reference;
- explicit unknown/unsupported state;
- observed timestamp;
- observation digest.

### `vision-inference-receipt/v1`

- exact media/request/model/adapter digests;
- runtime/hardware identity;
- timings/latency;
- preprocessing/postprocessing versions;
- output references;
- warnings/unsupported facts;
- terminal outcome;
- immutable receipt digest.

### `vision-dataset-revision/v1`

- dataset/version identity;
- immutable media/label manifest digest;
- label schema/class map;
- split definitions;
- source/license/provenance;
- augmentation/transform policy;
- validation warnings.

### `vision-evaluation-receipt/v1`

- exact model + dataset/split digests;
- evaluator/version;
- task/class metrics;
- thresholds;
- error-sample references;
- baseline/comparison identity;
- runtime/reproducibility metadata.

## Required failure tests

- model/label-map mismatch fails closed;
- preprocessing mismatch invalidates reference comparison;
- unsupported task/class remains unknown rather than inferred;
- no detection is not automatically proof of absence;
- low-confidence result cannot cross a trust threshold by agent choice;
- stale/uncertified model state remains visible;
- model name reuse with a different artifact digest creates a new revision;
- crop/resize/coordinate-space mismatches cannot be silently consumed;
- corrupted/missing source media cannot produce a fabricated observation;
- exported runtime must be compared against reference outputs before certification;
- one hardware benchmark cannot be generalized to another hardware class;
- GPU nondeterminism is not mislabeled as cross-hardware bit-exact reproducibility;
- unknown model/data license remains unknown;
- media retention obeys policy and raw media stays out of ordinary logs by default;
- model output cannot grant browser/device/physical action authority;
- agent cannot lower confidence/review policy to unblock itself;
- corrected human labels do not rewrite historical inference receipts.

## Phased roadmap

### P0 — research — in progress

- [x] resolve supplied Reddit source;
- [x] inspect canonical repository;
- [x] pin upstream head and license;
- [x] reconstruct core architecture;
- [x] inspect dataset/training/evaluation/deployment boundaries;
- [x] capture edge/export weaknesses;
- [x] internal dedupe;
- [x] horizontal competitor scan;
- [x] product opportunity map;
- [ ] select first vertical using real data/customer-access criteria.

### P1 — model-agnostic contracts

- [ ] freeze model/request/observation/receipt schemas;
- [ ] canonicalization/digest fixtures;
- [ ] privacy/retention policy matrix;
- [ ] negative/replay tests.

### P2 — reference Detectron2 adapter

- [ ] pinned model + pinned runtime;
- [ ] server/GPU capability preflight;
- [ ] detection + instance-mask normalization;
- [ ] preprocessing manifest;
- [ ] overlay renderer;
- [ ] inference receipts;
- [ ] golden-image tests.

### P3 — evaluation/model registry

- [ ] small versioned fixture dataset;
- [ ] evaluation receipts;
- [ ] per-class/error inspection;
- [ ] model comparison;
- [ ] promotion/certification states.

### P4 — Agent Work OS visual tool

- [ ] bounded image/frame tool surface;
- [ ] confidence/review policy;
- [ ] Work/Flow evidence binding;
- [ ] browser visual-fallback experiment;
- [ ] no direct action side effects.

### P5 — Industrial Visual Inspection vertical slice

- [ ] one narrow defect/assembly fixture;
- [ ] camera/upload intake;
- [ ] pass/fail/defect observation;
- [ ] human review;
- [ ] alert/work-item output;
- [ ] evidence bundle;
- [ ] uncertainty/error queue;
- [ ] retraining dataset loop.

### P6 — model portability

- [ ] add a non-Detectron2 adapter;
- [ ] normalize identical task types into shared observation contracts;
- [ ] compare models against the same dataset/runtime constraints;
- [ ] prove product logic is not framework-locked.

### P7 — deployment adapters

- [ ] server GPU container certification;
- [ ] CPU path if viable;
- [ ] ONNX/TensorRT only after reference-comparison gates;
- [ ] edge/mobile only after device-specific accuracy, latency, thermal and recovery tests.

### P8 — vertical production certification

- [ ] domain acceptance thresholds;
- [ ] camera/input drift tests;
- [ ] restart/recovery;
- [ ] uncertain/error capture;
- [ ] human-review workflow;
- [ ] exact model/data/deployment provenance;
- [ ] real workflow UAT;
- [ ] deployment state tracked separately from model-quality state.

## Open research questions

1. Which vertical can provide realistic labeled data immediately?
2. Is the input still image, uploaded video, or live camera?
3. What is the business cost of false positives vs false negatives?
4. Is detection enough, or do we need masks/keypoints/anomaly detection?
5. Is server latency acceptable or is edge mandatory?
6. What downstream system consumes the observation?
7. Which observations require human review?
8. What business KPI matters beyond model metrics such as mAP?
9. What privacy/retention rules apply to source media?
10. What evidence must remain reproducible months later?

## Sources reviewed

- Detectron2 repository: https://github.com/facebookresearch/detectron2
- Detectron2 docs: https://detectron2.readthedocs.io/
- Roboflow: https://roboflow.com/
- Ultralytics: https://www.ultralytics.com/
- FiftyOne: https://docs.voxel51.com/
- Encord: https://encord.com/
- LandingAI manufacturing: https://landing.ai/industries/manufacturing
- AWS manufacturing visual quality guidance: https://docs.aws.amazon.com/wellarchitected/latest/modern-industrial-data-technology-lens/mfgsce5-computer-vision-for-automated-quality-inspection.html

## Explicit non-claims

No Detectron2 parity. No new vision framework implemented. No custom model trained. No industrial product implemented. No edge/mobile certification. No ONNX/TensorRT certification. No production deployment. No production-quality accuracy claim. No tracker RE-* ID assigned yet.
