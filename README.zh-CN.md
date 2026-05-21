# SnapSort

[English](./README.md) | 中文

AI 驱动的智能相册清理工具 — 本地优先、跨平台、隐私无忧。

SnapSort 使用 CLIP 嵌入 + KNN 分类 + 主动学习，帮你快速整理成千上万张照片。全程在本地运行（无需联网），批量处理图片，并在你滑动分类的过程中越用越准。

## 特性

- **本地优先 AI** — CLIP ONNX 推理完全在设备端运行，数据不出本机
- **主动学习** — 不确定性采样优先展示最"纠结"的照片，减少标注量
- **跨平台** — Tauri 桌面端 (Windows/macOS/Linux) + React Native 移动端 (iOS/Android)
- **智能预处理** — ImageNet 归一化、中心裁剪、L2 标准化嵌入
- **批量扫描** — 扫描整个目录，批量并行提取 Embedding
- **KNN 分类器** — 距离加权 K 近邻，K 值可配置

## 项目结构

```
snap-sort/
├── packages/
│   ├── core/          # 纯 JS — 分类器、向量运算、特征存储、扫描器
│   ├── ai-engine/     # CLIP 推理适配器 (Node / Tauri / React Native / Gemini)
│   ├── desktop/       # Tauri v2 桌面应用 (Rust 后端 + Vite 前端)
│   └── app/           # React Native Expo 移动应用
├── pnpm-workspace.yaml
└── package.json
```

### 包说明

| 包名 | 说明 | 平台 |
|------|------|------|
| `@smart-photo/core` | KNN 分类器、向量运算、特征存储、照片扫描器 | 通用 (JS) |
| `@smart-photo/ai-engine` | CLIP 嵌入适配器、ONNX 模型管理、图像预处理 | Node / Tauri / RN |
| `@smart-photo/desktop` | Tauri v2 桌面应用，原生 ONNX 推理 | Windows / macOS / Linux |
| `@smart-photo/app` | React Native Expo 移动应用 | iOS / Android |

### 数据流

```
扫描目录 → 批量提取 CLIP Embedding
  → 存入 FeatureStore (内存 / SQLite)
  → 主动学习挑选不确定样本
  → 用户滑动标注 (保留 / 删除)
  → KNN 从标注中学习 → 自动分类剩余照片
  → 确认删除
```

## 快速开始

### 环境要求

- [Node.js](https://nodejs.org/) >= 18
- [pnpm](https://pnpm.io/) >= 9（可执行 `corepack enable`）

```bash
git clone https://github.com/ClaytonPetrosian/snap-sort.git
cd snap-sort
pnpm install
```

### 构建 & 测试

```bash
pnpm build          # 构建 core + ai-engine
pnpm test           # 运行全部 92 个测试
pnpm typecheck      # TypeScript 严格模式检查
```

### 下载 CLIP 模型

```bash
# 查看可用模型
pnpm download-model --list

# 下载默认模型 (~351 MB)
pnpm download-model

# 下载到指定目录
pnpm download-model --dir ./my-models
```

可用模型：

| 模型 | 大小 | 维度 | 说明 |
|------|------|------|------|
| `clip-vit-base-patch32` | ~351 MB | 512 | 默认，精度最高 |
| `clip-vit-base-patch32-text` | ~351 MB | 512 | 文本编码器变体 |
| `mobileclip-s0` | ~87 MB | 512 | 更小更快，适合移动端 |

### 桌面应用 (Tauri)

需要先安装 [Rust 工具链](https://rustup.rs/)：

```bash
# 开发模式
pnpm desktop:dev

# 生产构建
pnpm desktop:build
```

桌面端使用 `ort`（ONNX Runtime）进行原生 CLIP 推理，速度快且不需要 GPU。

### 移动应用 (React Native)

```bash
pnpm app:start        # 启动 Expo 开发服务器
pnpm app:android      # 在 Android 上运行
pnpm app:ios          # 在 iOS 上运行
```

## 核心 API

### `@smart-photo/core`

```typescript
import {
  KNNClassifier,
  UncertaintySampler,
  InMemoryFeatureStore,
  PhotoScanner,
  cosineSimilarity,
} from '@smart-photo/core';

// 分类器
const clf = new KNNClassifier({ k: 5 });
clf.addSample(embedding, 'keep');
const pred = clf.predict(newEmbedding);
// → { label: 'keep', confidence: 0.87 }

// 主动学习 — 选择最不确定的样本
const sampler = new UncertaintySampler();
const next = sampler.selectNext(predictions);

// 特征存储
const store = new InMemoryFeatureStore();
await store.saveBatch(records);
const unclassified = await store.getUnclassified();
```

### `@smart-photo/ai-engine`

```typescript
import { NodeAdapter, ModelManager, getModel } from '@smart-photo/ai-engine';

// 下载并缓存模型
const manager = new ModelManager();
const model = getModel('clip-vit-base-patch32');
const localPath = await manager.resolve(model, (progress) => {
  console.log(`${progress.percent}% (${progress.bytesPerSecond} B/s)`);
});

// 提取嵌入向量
const adapter = new NodeAdapter({ model: 'clip-vit-base-patch32' });
await adapter.init();
const embedding = await adapter.getEmbedding('photo.jpg');
// → Float32Array(512), L2 标准化
```

## 项目进度

- [x] 核心库（KNN、向量运算、特征存储、扫描器）— 56 个测试
- [x] AI 引擎（CLIP 适配器、预处理、模型管理）— 36 个测试
- [x] Tauri 桌面应用（Rust ONNX 后端 + Web 前端）
- [x] React Native Expo 应用（卡片牌 UI、手势控制）
- [ ] 应用商店打包与分发
- [ ] GPU 加速支持

## 技术栈

| 层级 | 技术 |
|------|------|
| 核心算法 | 纯 TypeScript（零依赖） |
| AI 推理 | ONNX Runtime（Rust `ort` / Node `onnxruntime-node`） |
| 图像预处理 | Rust `image` crate / Node `sharp` |
| 桌面 UI | Tauri v2 + Vite + 原生 TS |
| 移动 UI | React Native + Expo + Reanimated |
| 特征存储 | 内存 / SQLite（better-sqlite3 / expo-sqlite） |
| 包管理 | pnpm workspaces |

## License

MIT
