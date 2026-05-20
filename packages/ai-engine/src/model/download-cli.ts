#!/usr/bin/env node
/**
 * CLI script to download CLIP ONNX models.
 *
 * Usage:
 *   npx @smart-photo/ai-engine/download-model [model-id]
 *
 * Examples:
 *   npx @smart-photo/ai-engine/download-model                    # Download default (clip-vit-base-patch32)
 *   npx @smart-photo/ai-engine/download-model clip-vit-base-patch32
 *   npx @smart-photo/ai-engine/download-model mobileclip-s0
 *   npx @smart-photo/ai-engine/download-model --list             # List available models
 *   npx @smart-photo/ai-engine/download-model --dir ./my-models  # Custom cache dir
 */

import { ModelManager } from './manager.js';
import { MODEL_REGISTRY, listModels, getModel } from './registry.js';

function printUsage(): void {
  console.log(`
SnapSort Model Downloader

Usage:
  download-model [options] [model-id]

Options:
  --list          List all available models
  --dir <path>    Custom cache directory (default: ~/.snap-sort/models/)
  --no-download   Only check if model is cached, don't download
  --help          Show this help

Examples:
  download-model                         # Download default model
  download-model clip-vit-base-patch32   # Download specific model
  download-model mobileclip-s0           # Download lightweight model
  download-model --list                  # List available models
`);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function listAvailableModels(): void {
  console.log('\nAvailable CLIP ONNX models:\n');
  for (const id of listModels()) {
    const model = MODEL_REGISTRY[id];
    console.log(`  ${model.id}`);
    console.log(`    Name: ${model.name}`);
    console.log(`    ${model.description}`);
    console.log(`    Size: ${formatBytes(model.sizeBytes)}`);
    console.log(`    Input: ${model.inputName} [1, 3, ${model.imageSize}, ${model.imageSize}]`);
    console.log(`    Output: ${model.outputName} [1, ${model.dimension}]`);
    console.log('');
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  let modelId = 'clip-vit-base-patch32';
  let cacheDir: string | undefined;
  let checkOnly = false;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--help':
        printUsage();
        process.exit(0);
        break;
      case '--list':
        listAvailableModels();
        process.exit(0);
        break;
      case '--dir':
        cacheDir = args[++i];
        break;
      case '--no-download':
        checkOnly = true;
        break;
      default:
        if (!args[i].startsWith('--')) {
          modelId = args[i];
        }
        break;
    }
  }

  const manager = new ModelManager({ cacheDir, autoDownload: !checkOnly });

  // Check if already cached
  if (await manager.isCached(modelId)) {
    const model = getModel(modelId);
    const path = manager.getLocalPath(model);
    console.log(`✅ Model already cached: ${model.name}`);
    console.log(`   Path: ${path}`);
    process.exit(0);
  }

  if (checkOnly) {
    console.log(`❌ Model not cached: ${modelId}`);
    process.exit(1);
  }

  // Download
  const model = getModel(modelId);
  console.log(`\nDownloading ${model.name} (${formatBytes(model.sizeBytes)})...\n`);

  try {
    const path = await manager.resolve(modelId, (progress) => {
      const bar = '█'.repeat(Math.floor(progress.percentComplete / 5));
      const empty = '░'.repeat(20 - Math.floor(progress.percentComplete / 5));
      const downloaded = formatBytes(progress.downloadedBytes);
      const total = formatBytes(progress.totalBytes);
      process.stdout.write(
        `\r  [${bar}${empty}] ${progress.percentComplete}% (${downloaded} / ${total})`,
      );
    });

    console.log(`\n\n✅ Model downloaded successfully!`);
    console.log(`   Path: ${path}`);
    console.log(`\n   You can now use it with NodeAdapter:`);
    console.log(`   const adapter = new NodeAdapter({ model: '${modelId}' });`);
    console.log(`   await adapter.init(); // will auto-resolve cached model\n`);
  } catch (err) {
    console.error(`\n❌ Download failed: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
