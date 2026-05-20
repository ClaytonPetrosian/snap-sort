# SnapSort

AI-powered photo cleanup tool — local-first, cross-platform, privacy-respecting.

SnapSort uses CLIP embeddings + KNN classification with active learning to help you quickly sort through thousands of photos. It runs entirely on your device (no cloud required), processes images in batches, and learns your preferences as you swipe.

## Features

- **Local-first AI** — CLIP ONNX inference runs on-device, no data leaves your machine
- **Active Learning** — uncertainty sampling shows the most confusing photos first, so you label fewer images
- **Cross-platform** — Tauri desktop (Windows/macOS/Linux) + React Native (iOS/Android)
- **Smart preprocessing** — ImageNet normalization, center-crop, L2-normalized embeddings
- **Batch scanning** — scan entire directories, extract embeddings in parallel batches
- **KNN classifier** — distance-weighted K-nearest-neighbor, configurable K

## Architecture

```
snap-sort/
├── packages/
│   ├── core/          # Pure JS — classifier, vector math, feature store, scanner
│   ├── ai-engine/     # CLIP inference adapters (Node / Tauri / React Native / Gemini)
│   ├── desktop/       # Tauri v2 desktop app (Rust backend + Vite frontend)
│   └── app/           # React Native Expo app
├── pnpm-workspace.yaml
└── package.json
```

### Packages

| Package | Description | Platform |
|---------|-------------|----------|
| `@smart-photo/core` | KNN classifier, vector math, feature stores, photo scanner | Universal (JS) |
| `@smart-photo/ai-engine` | CLIP embedding adapters, ONNX model management, preprocessing | Node / Tauri / RN |
| `@smart-photo/desktop` | Tauri v2 desktop app with native ONNX inference | Windows / macOS / Linux |
| `@smart-photo/app` | React Native Expo app | iOS / Android |

### Data Flow

```
Scan directory → Extract CLIP embeddings (batch)
  → Store in FeatureStore (InMemory / SQLite)
  → Active learning picks uncertain samples
  → User swipes (keep / trash)
  → KNN learns from labels → auto-classifies remaining
  → Confirm & delete
```

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [pnpm](https://pnpm.io/) >= 9 (`corepack enable`)

```bash
git clone https://github.com/ClaytonPetrosian/snap-sort.git
cd snap-sort
pnpm install
```

### Build & Test

```bash
pnpm build          # Build core + ai-engine
pnpm test           # Run all 92 tests
pnpm typecheck      # TypeScript strict check
```

### Download a CLIP Model

```bash
# List available models
pnpm download-model --list

# Download default model (~351 MB)
pnpm download-model

# Download to custom directory
pnpm download-model --dir ./my-models
```

Available models:

| Model | Size | Dimension | Notes |
|-------|------|-----------|-------|
| `clip-vit-base-patch32` | ~351 MB | 512 | Default, best accuracy |
| `clip-vit-base-patch32-text` | ~351 MB | 512 | Text encoder variant |
| `mobileclip-s0` | ~87 MB | 512 | Smaller, faster, good for mobile |

### Desktop App (Tauri)

Requires [Rust toolchain](https://rustup.rs/):

```bash
# Development mode
pnpm desktop:dev

# Production build
pnpm desktop:build
```

The desktop app uses `ort` (ONNX Runtime) for native CLIP inference — fast and GPU-free.

### Mobile App (React Native)

```bash
pnpm app:start        # Start Expo dev server
pnpm app:android      # Run on Android
pnpm app:ios          # Run on iOS
```

## Core API

### `@smart-photo/core`

```typescript
import {
  KNNClassifier,
  UncertaintySampler,
  InMemoryFeatureStore,
  PhotoScanner,
  cosineSimilarity,
} from '@smart-photo/core';

// Classifier
const clf = new KNNClassifier({ k: 5 });
clf.addSample(embedding, 'keep');
const pred = clf.predict(newEmbedding);
// → { label: 'keep', confidence: 0.87 }

// Active learning — pick the most uncertain sample
const sampler = new UncertaintySampler();
const next = sampler.selectNext(predictions);

// Feature store
const store = new InMemoryFeatureStore();
await store.saveBatch(records);
const unclassified = await store.getUnclassified();
```

### `@smart-photo/ai-engine`

```typescript
import { NodeAdapter, ModelManager, getModel } from '@smart-photo/ai-engine';

// Download and cache a model
const manager = new ModelManager();
const model = getModel('clip-vit-base-patch32');
const localPath = await manager.resolve(model, (progress) => {
  console.log(`${progress.percent}% (${progress.bytesPerSecond} B/s)`);
});

// Extract embeddings
const adapter = new NodeAdapter({ model: 'clip-vit-base-patch32' });
await adapter.init();
const embedding = await adapter.getEmbedding('photo.jpg');
// → Float32Array(512), L2-normalized
```

## Project Status

- [x] Core library (KNN, vector math, feature stores, scanner) — 56 tests
- [x] AI engine (CLIP adapters, preprocessing, model management) — 36 tests
- [x] Tauri desktop app (Rust ONNX backend + web frontend)
- [x] React Native Expo app (card deck UI, gesture controls)
- [ ] App store packaging & distribution
- [ ] GPU acceleration support

## Tech Stack

| Layer | Technology |
|-------|------------|
| Core algorithms | Pure TypeScript (zero deps) |
| AI inference | ONNX Runtime via `ort` (Rust) / `onnxruntime-node` |
| Image preprocessing | `image` crate (Rust) / `sharp` (Node) |
| Desktop UI | Tauri v2 + Vite + vanilla TS |
| Mobile UI | React Native + Expo + Reanimated |
| Feature storage | In-memory / SQLite (better-sqlite3 / expo-sqlite) |
| Package management | pnpm workspaces |

## License

MIT
