/**
 * Home Screen — entry point showing scan status and action buttons.
 *
 * Displays:
 * - Photo count
 * - Scan progress (when scanning)
 * - "Start cleanup" / "Continue" / "View results" actions
 * - Settings access
 */
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import { useScanner } from '../hooks/useScanner';

export function HomeScreen({ navigation }: any) {
  const {
    hasPermission,
    status,
    progress,
    error,
    pipelineState,
    requestPermission,
    startScan,
    pauseScan,
    resumeScan,
    service,
  } = useScanner();

  const [photoCount, setPhotoCount] = useState<number | null>(null);

  useEffect(() => {
    if (hasPermission) {
      loadPhotoCount();
    }
  }, [hasPermission]);

  useEffect(() => {
    if (error) {
      Alert.alert('错误', error);
    }
  }, [error]);

  const loadPhotoCount = async () => {
    const { totalCount } = await MediaLibrary.getAssetsAsync({
      mediaType: 'photo',
      first: 0,
    });
    setPhotoCount(totalCount);
  };

  const handleStartScan = async () => {
    if (!hasPermission) {
      const granted = await requestPermission();
      if (!granted) {
        Alert.alert(
          '需要相册权限',
          '请在系统设置中允许 SnapSort 访问您的照片。',
          [{ text: '好的' }],
        );
        return;
      }
    }
    startScan();
  };

  const handleContinueToDeck = () => {
    navigation.navigate('CardDeck', { service });
  };

  const handleViewResults = () => {
    navigation.navigate('AITakeover', { service });
  };

  // Permission not granted
  if (!hasPermission) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>SnapSort</Text>
        <Text style={styles.subtitle}>AI 智能相册清理</Text>
        <View style={styles.permissionCard}>
          <Text style={styles.permissionText}>
            需要访问您的相册以扫描和整理照片
          </Text>
          <TouchableOpacity style={styles.primaryButton} onPress={requestPermission}>
            <Text style={styles.buttonText}>授权访问相册</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Scanning in progress
  if (status === 'scanning') {
    const percent = progress?.percentComplete ?? 0;
    const scanned = progress?.scanned ?? 0;
    const total = progress?.totalPhotos ?? 0;
    const newPhotos = progress?.newPhotos ?? 0;

    return (
      <View style={styles.container}>
        <Text style={styles.title}>SnapSort</Text>
        <Text style={styles.subtitle}>正在扫描相册...</Text>

        <View style={styles.scanCard}>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${percent}%` }]} />
          </View>
          <Text style={styles.progressText}>{percent}%</Text>
          <Text style={styles.progressDetail}>
            已扫描 {scanned} / {total} 张照片
          </Text>
          <Text style={styles.progressDetail}>
            新增 {newPhotos} 张 embedding
          </Text>
        </View>

        <TouchableOpacity style={styles.secondaryButton} onPress={pauseScan}>
          <Text style={styles.secondaryButtonText}>暂停扫描</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Paused
  if (status === 'paused') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>SnapSort</Text>
        <Text style={styles.subtitle}>扫描已暂停</Text>

        <View style={styles.scanCard}>
          <Text style={styles.progressDetail}>
            已扫描 {progress?.scanned ?? 0} / {progress?.totalPhotos ?? 0} 张
          </Text>
        </View>

        <TouchableOpacity style={styles.primaryButton} onPress={resumeScan}>
          <Text style={styles.buttonText}>继续扫描</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Scan complete — ready for card deck
  if (status === 'completed') {
    const newCount = progress?.newPhotos ?? 0;

    return (
      <View style={styles.container}>
        <Text style={styles.title}>SnapSort</Text>
        <Text style={styles.subtitle}>扫描完成</Text>

        <View style={styles.statsCard}>
          <Text style={styles.statsNumber}>{newCount}</Text>
          <Text style={styles.statsLabel}>张照片已分析</Text>
        </View>

        <TouchableOpacity style={styles.primaryButton} onPress={handleContinueToDeck}>
          <Text style={styles.buttonText}>开始分类</Text>
        </TouchableOpacity>

        {pipelineState?.aiReady && (
          <TouchableOpacity style={styles.aiButton} onPress={handleViewResults}>
            <Text style={styles.aiButtonText}>AI 已就绪，查看接管结果</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  // Default: idle state
  return (
    <View style={styles.container}>
      <Text style={styles.title}>SnapSort</Text>
      <Text style={styles.subtitle}>AI 智能相册清理</Text>

      <View style={styles.statsCard}>
        <Text style={styles.statsNumber}>{photoCount ?? '...'}</Text>
        <Text style={styles.statsLabel}>张照片待处理</Text>
      </View>

      <TouchableOpacity style={styles.primaryButton} onPress={handleStartScan}>
        <Text style={styles.buttonText}>开始清理</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.secondaryButton}
        onPress={() => navigation.navigate('Settings')}
      >
        <Text style={styles.secondaryButtonText}>设置</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 36,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#888',
    marginBottom: 48,
  },
  permissionCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    width: '100%',
  },
  permissionText: {
    color: '#ccc',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 24,
  },
  scanCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    marginBottom: 24,
    width: '100%',
  },
  progressBar: {
    width: '100%',
    height: 8,
    backgroundColor: '#333',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#3b82f6',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 32,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  progressDetail: {
    fontSize: 14,
    color: '#888',
    marginBottom: 4,
  },
  statsCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    marginBottom: 32,
    width: '100%',
  },
  statsNumber: {
    fontSize: 48,
    fontWeight: '700',
    color: '#fff',
  },
  statsLabel: {
    fontSize: 14,
    color: '#888',
    marginTop: 4,
  },
  primaryButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 48,
    width: '100%',
    alignItems: 'center',
    marginBottom: 12,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  secondaryButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  secondaryButtonText: {
    color: '#666',
    fontSize: 16,
  },
  aiButton: {
    backgroundColor: '#10b981',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    width: '100%',
    alignItems: 'center',
    marginTop: 8,
  },
  aiButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
