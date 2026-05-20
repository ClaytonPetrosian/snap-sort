/**
 * useScanner hook — manages photo scanning lifecycle.
 *
 * Uses SnapSortService for the full pipeline.
 * Handles permissions, progress tracking, pause/resume.
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import * as MediaLibrary from 'expo-media-library';
import { InMemoryFeatureStore } from '@smart-photo/core';
import type { ScanProgress, PhotoAsset, IPhotoSource } from '@smart-photo/core';
import { SnapSortService } from '../services/SnapSortService.js';
import type { PipelineState } from '../services/SnapSortService.js';

export interface ScannerState {
  hasPermission: boolean;
  status: 'idle' | 'scanning' | 'paused' | 'completed' | 'error';
  progress: ScanProgress | null;
  error: string | null;
  pipelineState: PipelineState | null;
}

/**
 * Mock embedding provider for development.
 * Replace with actual CLIP adapter in production.
 */
class DevEmbeddingAdapter {
  async getEmbedding(_uri: string): Promise<number[]> {
    // Simulate CLIP embedding with random 512-dim vector
    return new Array(512).fill(0).map(() => Math.random() * 2 - 1);
  }
}

export function useScanner() {
  const [state, setState] = useState<ScannerState>({
    hasPermission: false,
    status: 'idle',
    progress: null,
    error: null,
    pipelineState: null,
  });

  const serviceRef = useRef<SnapSortService | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      serviceRef.current?.dispose();
    };
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    const perm = await MediaLibrary.requestPermissionsAsync();
    setState(prev => ({ ...prev, hasPermission: perm.granted }));
    return perm.granted;
  }, []);

  const checkPermission = useCallback(async (): Promise<boolean> => {
    const perm = await MediaLibrary.getPermissionsAsync();
    setState(prev => ({ ...prev, hasPermission: perm.granted }));
    return perm.granted;
  }, []);

  const startScan = useCallback(async () => {
    const hasPermission = await checkPermission();
    if (!hasPermission) {
      const granted = await requestPermission();
      if (!granted) {
        setState(prev => ({ ...prev, error: '需要相册权限' }));
        return;
      }
    }

    // Create the service with dev embedder
    const embedder = new DevEmbeddingAdapter();
    const store = new InMemoryFeatureStore();
    const service = new SnapSortService(embedder, store, {
      scanBatchSize: 10,
      scanBatchDelay: 50,
    });

    // Listen for state changes
    service.onStateChange((pipelineState) => {
      setState(prev => ({
        ...prev,
        scanProgress: pipelineState.scanProgress,
        pipelineState,
        status: pipelineState.phase === 'scanning' ? 'scanning'
          : pipelineState.phase === 'completed' ? 'completed'
          : prev.status,
      }));
    });

    serviceRef.current = service;
    setState(prev => ({ ...prev, status: 'scanning', error: null }));

    // Create photo source from expo-media-library
    const photoSource: IPhotoSource = {
      async getTotalCount(): Promise<number> {
        const { totalCount } = await MediaLibrary.getAssetsAsync({
          mediaType: 'photo',
          first: 0,
        });
        return totalCount;
      },
      async fetchBatch(after: string | null, limit: number): Promise<PhotoAsset[]> {
        const result = await MediaLibrary.getAssetsAsync({
          mediaType: 'photo',
          first: limit,
          after: after ?? undefined,
          sortBy: 'creationTime',
        });
        return result.assets.map(asset => ({
          id: asset.id,
          uri: asset.uri,
          width: asset.width,
          height: asset.height,
          createdAt: asset.creationTime,
        }));
      },
    };

    try {
      await service.startScan(photoSource);
      setState(prev => ({ ...prev, status: 'completed' }));
    } catch (err) {
      setState(prev => ({
        ...prev,
        status: 'error',
        error: err instanceof Error ? err.message : '扫描失败',
      }));
    }
  }, [checkPermission, requestPermission]);

  const pauseScan = useCallback(() => {
    serviceRef.current?.pauseScan();
    setState(prev => ({ ...prev, status: 'paused' }));
  }, []);

  const resumeScan = useCallback(async () => {
    if (!serviceRef.current) return;
    setState(prev => ({ ...prev, status: 'scanning' }));
    await serviceRef.current.resumeScan();
    setState(prev => ({ ...prev, status: 'completed' }));
  }, []);

  return {
    ...state,
    requestPermission,
    checkPermission,
    startScan,
    pauseScan,
    resumeScan,
    service: serviceRef.current,
  };
}
