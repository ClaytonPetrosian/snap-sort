/**
 * SnapSort Desktop — Frontend Application
 *
 * Uses Tauri invoke() to communicate with the Rust backend for:
 * - CLIP model loading and inference
 * - Image preprocessing
 * - File system scanning
 *
 * The UI is vanilla TypeScript with no framework dependencies.
 */

import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import {
  KNNClassifier,
  UncertaintySampler,
  InMemoryFeatureStore,
} from '@smart-photo/core';
import type { PhotoRecord, Prediction, Label, IFeatureStore } from '@smart-photo/core';

// --- State ---

interface AppState {
  modelLoaded: boolean;
  modelPath: string;
  scanning: boolean;
  scannedFiles: string[];
  store: IFeatureStore;
  classifier: KNNClassifier;
  sampler: UncertaintySampler;
  classifiedCount: number;
  currentCardIndex: number;
  labeledPhotos: Array<{ id: string; label: Label; embedding: number[] }>;
}

const state: AppState = {
  modelLoaded: false,
  modelPath: '',
  scanning: false,
  scannedFiles: [],
  store: new InMemoryFeatureStore(),
  classifier: new KNNClassifier({ k: 5 }),
  sampler: new UncertaintySampler(),
  classifiedCount: 0,
  currentCardIndex: 0,
  labeledPhotos: [],
};

// --- Tauri Command Wrappers ---

interface ModelInfo {
  path: string;
  loaded: boolean;
}

interface EmbeddingResult {
  embedding: number[];
  dimension: number;
}

interface ScanResult {
  files: string[];
  count: number;
}

async function initModel(modelPath: string): Promise<ModelInfo> {
  return invoke('init_clip_model', { modelPath });
}

async function getEmbedding(filePath: string): Promise<EmbeddingResult> {
  return invoke('get_image_embedding', { filePath });
}

async function getEmbeddingsBatch(filePaths: string[]): Promise<{
  embeddings: number[][];
  count: number;
  errors: string[];
}> {
  return invoke('get_image_embeddings_batch', { filePaths: filePaths });
}

async function scanDir(dirPath: string): Promise<ScanResult> {
  return invoke('scan_directory', { dirPath });
}

async function isModelLoaded(): Promise<boolean> {
  return invoke('get_model_status');
}

// --- Navigation ---

function initNavigation(): void {
  const navBtns = document.querySelectorAll<HTMLButtonElement>('.nav-btn');
  navBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      if (!view) return;

      // Update nav
      navBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      // Update view
      document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
      document.getElementById(`view-${view}`)?.classList.add('active');
    });
  });
}

// --- Home View ---

function initHomeView(): void {
  const btnPickFolder = document.getElementById('btn-pick-folder') as HTMLButtonElement;
  const btnCancelScan = document.getElementById('btn-cancel-scan') as HTMLButtonElement;
  const btnStartClassify = document.getElementById('btn-start-classify') as HTMLButtonElement;

  btnPickFolder.addEventListener('click', handlePickFolder);
  btnCancelScan.addEventListener('click', handleCancelScan);
  btnStartClassify.addEventListener('click', () => switchToView('classify'));
}

async function handlePickFolder(): Promise<void> {
  try {
    const selected = await open({
      directory: true,
      multiple: false,
      title: '选择照片文件夹',
    });

    if (!selected) return;

    await startScan(selected as string);
  } catch (err) {
    setStatus(`选择文件夹失败: ${err}`);
  }
}

async function startScan(dirPath: string): Promise<void> {
  if (!state.modelLoaded) {
    setStatus('请先加载 CLIP 模型');
    return;
  }

  state.scanning = true;
  showScanProgress(true);
  setStatus('正在扫描目录...');

  try {
    // 1. Scan directory for images
    const scanResult = await scanDir(dirPath);
    state.scannedFiles = scanResult.files;
    updateScanProgress(0, scanResult.count, '发现照片，开始提取 Embedding...');

    // 2. Batch extract embeddings
    const batchSize = 10;
    let processed = 0;
    let errors = 0;
    const records: PhotoRecord[] = [];

    for (let i = 0; i < scanResult.files.length; i += batchSize) {
      if (!state.scanning) break;

      const batch = scanResult.files.slice(i, i + batchSize);
      try {
        const result = await getEmbeddingsBatch(batch);

        for (let j = 0; j < result.embeddings.length; j++) {
          const filePath = batch[j];
          const record: PhotoRecord = {
            id: filePath,
            embedding: result.embeddings[j],
            createdAt: Date.now(),
          };
          records.push(record);
        }

        errors += result.errors.length;
        processed += batch.length;
      } catch (err) {
        errors += batch.length;
        processed += batch.length;
      }

      updateScanProgress(
        processed,
        scanResult.count,
        `已处理 ${processed}/${scanResult.count}`,
        records.length,
        errors,
      );
    }

    // 3. Save to store
    await state.store.init();
    await state.store.saveBatch(records);

    // 4. Show completion
    state.scanning = false;
    showScanComplete(records.length, errors);
    setStatus(`扫描完成: ${records.length} 张照片`);

    // Save to recent scans
    addRecentScan(dirPath, records.length);
  } catch (err) {
    state.scanning = false;
    setStatus(`扫描失败: ${err}`);
    showScanProgress(false);
  }
}

function handleCancelScan(): void {
  state.scanning = false;
  showScanProgress(false);
  setStatus('扫描已取消');
}

function showScanProgress(show: boolean): void {
  const el = document.getElementById('scan-progress');
  const folderPicker = document.querySelector('.folder-picker');
  const complete = document.getElementById('scan-complete');

  if (show) {
    el?.classList.remove('hidden');
    folderPicker?.classList.add('hidden');
    complete?.classList.add('hidden');
  } else {
    el?.classList.add('hidden');
    folderPicker?.classList.remove('hidden');
  }
}

function updateScanProgress(
  scanned: number,
  total: number,
  statusText: string,
  newCount = 0,
  errorCount = 0,
): void {
  const percent = total > 0 ? Math.round((scanned / total) * 100) : 0;
  const fill = document.getElementById('progress-fill');
  const status = document.getElementById('scan-status');
  const count = document.getElementById('scan-count');
  const statNew = document.getElementById('stat-new');
  const statErrors = document.getElementById('stat-errors');

  if (fill) fill.style.width = `${percent}%`;
  if (status) status.textContent = statusText;
  if (count) count.textContent = `${scanned} / ${total}`;
  if (statNew) statNew.textContent = String(newCount);
  if (statErrors) statErrors.textContent = String(errorCount);
}

function showScanComplete(newCount: number, errorCount: number): void {
  const progress = document.getElementById('scan-progress');
  const complete = document.getElementById('scan-complete');
  const summary = document.getElementById('complete-summary');

  progress?.classList.add('hidden');
  complete?.classList.remove('hidden');
  if (summary) {
    summary.textContent = `成功提取 ${newCount} 张照片的 Embedding${errorCount > 0 ? `，${errorCount} 张失败` : ''}`;
  }
}

function addRecentScan(path: string, count: number): void {
  const list = document.getElementById('recent-list');
  if (!list) return;

  const item = document.createElement('div');
  item.className = 'recent-item';
  item.innerHTML = `
    <div class="recent-item-info">
      <span class="recent-item-path">${path}</span>
      <span class="recent-item-stats">${count} 张照片</span>
    </div>
    <button class="btn btn-secondary btn-sm">继续分类</button>
  `;
  item.querySelector('button')?.addEventListener('click', () => switchToView('classify'));
  list.prepend(item);
}

// --- Classify View ---

async function initClassifyView(): Promise<void> {
  const btnKeep = document.getElementById('btn-keep') as HTMLButtonElement;
  const btnTrash = document.getElementById('btn-trash') as HTMLButtonElement;
  const btnUndo = document.getElementById('btn-undo') as HTMLButtonElement;
  const btnGoCleanup = document.getElementById('btn-go-cleanup') as HTMLButtonElement;

  btnKeep.addEventListener('click', () => labelCurrentCard('keep'));
  btnTrash.addEventListener('click', () => labelCurrentCard('trash'));
  btnUndo.addEventListener('click', handleUndo);
  btnGoCleanup.addEventListener('click', () => switchToView('cleanup'));

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    const classifyView = document.getElementById('view-classify');
    if (!classifyView?.classList.contains('active')) return;

    if (e.key === 'ArrowLeft') labelCurrentCard('keep');
    if (e.key === 'ArrowRight') labelCurrentCard('trash');
    if (e.key === 'ArrowUp') handleUndo();
  });
}

async function loadCardDeck(): Promise<void> {
  const unclassified = await state.store.getUnclassified();
  if (unclassified.length === 0) {
    showClassifyEmpty(true);
    return;
  }

  state.currentCardIndex = 0;
  showClassifyEmpty(false);
  showNextCard();
}

async function showNextCard(): Promise<void> {
  const unclassified = await state.store.getUnclassified();
  const total = unclassified.length;

  if (total === 0 || state.currentCardIndex >= total) {
    showClassifyEmpty(true);
    return;
  }

  // Sort by uncertainty if we have enough labeled samples
  let sorted = unclassified;
  if (state.classifier.sampleCount >= 5) {
    sorted = [...unclassified].sort((a, b) => {
      try {
        const predA = state.classifier.predict(a.embedding);
        const predB = state.classifier.predict(b.embedding);
        const uncA = 1 - Math.abs(predA.confidence - 0.5) * 2;
        const uncB = 1 - Math.abs(predB.confidence - 0.5) * 2;
        return uncB - uncA;
      } catch {
        return 0;
      }
    });
  }

  const record = sorted[state.currentCardIndex];
  const cardImage = document.getElementById('card-image') as HTMLImageElement;
  const predictionBadge = document.getElementById('card-prediction');
  const confidenceEl = document.getElementById('card-confidence');

  cardImage.src = `file://${record.id}`;

  // Show prediction if available
  if (state.classifier.sampleCount >= 5) {
    try {
      const pred = state.classifier.predict(record.embedding);
      if (predictionBadge) {
        predictionBadge.textContent = pred.label;
        predictionBadge.classList.remove('hidden');
      }
      if (confidenceEl) {
        confidenceEl.textContent = `置信度: ${(pred.confidence * 100).toFixed(1)}%`;
      }
    } catch {
      predictionBadge?.classList.add('hidden');
      if (confidenceEl) confidenceEl.textContent = '';
    }
  } else {
    predictionBadge?.classList.add('hidden');
    if (confidenceEl) confidenceEl.textContent = '';
  }

  updateClassifyStats(total);
}

async function labelCurrentCard(label: Label): Promise<void> {
  const unclassified = await state.store.getUnclassified();
  if (unclassified.length === 0) return;

  let sorted = unclassified;
  if (state.classifier.sampleCount >= 5) {
    sorted = [...unclassified].sort((a, b) => {
      try {
        const predA = state.classifier.predict(a.embedding);
        const predB = state.classifier.predict(b.embedding);
        const uncA = 1 - Math.abs(predA.confidence - 0.5) * 2;
        const uncB = 1 - Math.abs(predB.confidence - 0.5) * 2;
        return uncB - uncA;
      } catch {
        return 0;
      }
    });
  }

  const record = sorted[state.currentCardIndex];

  // Add to classifier
  state.classifier.addSample(record.embedding, label);

  // Update store
  try {
    const pred = state.classifier.predict(record.embedding);
    await state.store.updateLabel(record.id, label, pred.confidence);
  } catch {
    await state.store.updateLabel(record.id, label);
  }

  // Save for undo
  state.labeledPhotos.push({
    id: record.id,
    label,
    embedding: record.embedding,
  });

  state.classifiedCount++;
  state.currentCardIndex++;

  await showNextCard();
}

function handleUndo(): void {
  if (state.labeledPhotos.length === 0) return;

  state.classifier.removeLastSample();
  state.labeledPhotos.pop();
  state.classifiedCount = Math.max(0, state.classifiedCount - 1);

  if (state.currentCardIndex > 0) {
    state.currentCardIndex--;
    showNextCard();
  }
}

function updateClassifyStats(remaining: number): void {
  const total = document.getElementById('classify-total');
  const done = document.getElementById('classify-done');

  if (total) total.textContent = `${remaining} 张待分类`;
  if (done) done.textContent = `已分类: ${state.classifiedCount}`;
}

function showClassifyEmpty(show: boolean): void {
  const deck = document.querySelector('.card-deck');
  const empty = document.getElementById('classify-empty');

  if (show) {
    deck?.classList.add('hidden');
    empty?.classList.remove('hidden');
  } else {
    deck?.classList.remove('hidden');
    empty?.classList.add('hidden');
  }
}

// --- Cleanup View ---

async function initCleanupView(): Promise<void> {
  const btnConfirmDelete = document.getElementById('btn-confirm-delete') as HTMLButtonElement;
  const btnCancel = document.getElementById('btn-cancel-cleanup') as HTMLButtonElement;

  btnConfirmDelete.addEventListener('click', handleConfirmDelete);
  btnCancel.addEventListener('click', () => switchToView('classify'));
}

async function loadCleanupView(): Promise<void> {
  const all = await state.store.getAll();
  const trash = all.filter((r) => r.label === 'trash');
  const keep = all.filter((r) => r.label && r.label !== 'trash');

  const trashCount = document.getElementById('cleanup-trash-count');
  const keepCount = document.getElementById('cleanup-keep-count');

  if (trashCount) trashCount.textContent = String(trash.length);
  if (keepCount) keepCount.textContent = String(keep.length);

  const list = document.getElementById('cleanup-list');
  if (!list) return;

  list.innerHTML = '';
  for (const record of trash) {
    const item = document.createElement('div');
    item.className = 'cleanup-item selected';
    item.dataset.id = record.id;
    item.innerHTML = `<img src="file://${record.id}" alt="Photo" loading="lazy" />`;
    item.addEventListener('click', () => item.classList.toggle('selected'));
    list.appendChild(item);
  }
}

async function handleConfirmDelete(): Promise<void> {
  const selectedItems = document.querySelectorAll('.cleanup-item.selected');
  const ids = Array.from(selectedItems)
    .map((el) => (el as HTMLElement).dataset.id)
    .filter(Boolean) as string[];

  if (ids.length === 0) {
    setStatus('没有选中的照片');
    return;
  }

  if (!confirm(`确定要删除 ${ids.length} 张照片吗？此操作不可撤销。`)) {
    return;
  }

  setStatus(`正在删除 ${ids.length} 张照片...`);

  // Mark as deleted in store
  for (const id of ids) {
    await state.store.updateLabel(id, 'deleted', 1.0);
  }

  // Remove from store
  await state.store.deleteByIds(ids);

  setStatus(`已删除 ${ids.length} 张照片`);
  await loadCleanupView();
}

// --- Settings View ---

function initSettingsView(): void {
  const btnBrowseModel = document.getElementById('btn-browse-model') as HTMLButtonElement;
  const btnLoadModel = document.getElementById('btn-load-model') as HTMLButtonElement;
  const btnDownloadModel = document.getElementById('btn-download-model') as HTMLButtonElement;
  const modelPathInput = document.getElementById('model-path') as HTMLInputElement;

  btnBrowseModel.addEventListener('click', async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'ONNX Model', extensions: ['onnx'] }],
        title: '选择 ONNX 模型文件',
      });
      if (selected) {
        modelPathInput.value = selected as string;
      }
    } catch (err) {
      setStatus(`选择模型失败: ${err}`);
    }
  });

  btnLoadModel.addEventListener('click', async () => {
    const path = modelPathInput.value.trim();
    if (!path) {
      setStatus('请先选择模型文件');
      return;
    }

    setStatus('正在加载模型...');
    try {
      await initModel(path);
      state.modelLoaded = true;
      state.modelPath = path;
      updateModelStatus(true);
      setStatus('模型加载成功');
    } catch (err) {
      setStatus(`模型加载失败: ${err}`);
      updateModelStatus(false);
    }
  });

  btnDownloadModel.addEventListener('click', () => {
    setStatus('请使用 CLI 下载模型: npx @smart-photo/ai-engine/download-model');
  });

  // Load batch size / K settings
  const batchSizeInput = document.getElementById('batch-size') as HTMLInputElement;
  const knnKInput = document.getElementById('knn-k') as HTMLInputElement;

  batchSizeInput.addEventListener('change', () => {
    localStorage.setItem('snap-sort-batch-size', batchSizeInput.value);
  });

  knnKInput.addEventListener('change', () => {
    state.classifier = new KNNClassifier({ k: parseInt(knnKInput.value) || 5 });
    localStorage.setItem('snap-sort-knn-k', knnKInput.value);
  });
}

function updateModelStatus(loaded: boolean): void {
  const statusEl = document.getElementById('model-status');
  const statusBarEl = document.getElementById('status-model');

  if (statusEl) {
    statusEl.textContent = loaded ? '已加载' : '未加载';
    statusEl.className = `status-badge ${loaded ? 'loaded' : 'not-loaded'}`;
  }

  if (statusBarEl) {
    statusBarEl.textContent = loaded ? `模型: ${state.modelPath}` : '模型: 未加载';
  }
}

// --- View Switching ---

function switchToView(view: string): void {
  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));
  document.querySelector(`.nav-btn[data-view="${view}"]`)?.classList.add('active');

  document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
  document.getElementById(`view-${view}`)?.classList.add('active');

  // Load view-specific data
  if (view === 'classify') {
    loadCardDeck();
  } else if (view === 'cleanup') {
    loadCleanupView();
  }
}

// --- Status Bar ---

function setStatus(message: string): void {
  const el = document.getElementById('status-text');
  if (el) el.textContent = message;
}

// --- Init ---

async function init(): Promise<void> {
  initNavigation();
  initHomeView();
  await initClassifyView();
  await initCleanupView();
  initSettingsView();

  // Check if model is already loaded
  try {
    state.modelLoaded = await isModelLoaded();
    updateModelStatus(state.modelLoaded);
  } catch {
    // Tauri not available (dev mode without Rust backend)
  }

  // Restore settings
  const savedBatchSize = localStorage.getItem('snap-sort-batch-size');
  const savedKnnK = localStorage.getItem('snap-sort-knn-k');

  if (savedBatchSize) {
    (document.getElementById('batch-size') as HTMLInputElement).value = savedBatchSize;
  }
  if (savedKnnK) {
    (document.getElementById('knn-k') as HTMLInputElement).value = savedKnnK;
    state.classifier = new KNNClassifier({ k: parseInt(savedKnnK) || 5 });
  }

  setStatus('就绪');
}

init().catch(console.error);
