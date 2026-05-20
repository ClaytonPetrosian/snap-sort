/**
 * Home Screen — entry point showing scan status and action buttons.
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

export function HomeScreen({ navigation }: any) {
  const [permission, setPermission] = useState<MediaLibrary.PermissionResponse | null>(null);
  const [photoCount, setPhotoCount] = useState<number | null>(null);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    checkPermission();
  }, []);

  const checkPermission = async () => {
    const perm = await MediaLibrary.getPermissionsAsync();
    setPermission(perm);
    if (perm.granted) {
      loadPhotoCount();
    }
  };

  const requestPermission = async () => {
    const perm = await MediaLibrary.requestPermissionsAsync();
    setPermission(perm);
    if (perm.granted) {
      loadPhotoCount();
    } else {
      Alert.alert(
        '需要相册权限',
        '请在系统设置中允许 SnapSort 访问您的照片。',
        [{ text: '好的' }],
      );
    }
  };

  const loadPhotoCount = async () => {
    const { totalCount } = await MediaLibrary.getAssetsAsync({
      mediaType: 'photo',
      first: 0,
    });
    setPhotoCount(totalCount);
  };

  const startScan = () => {
    setScanning(true);
    // TODO: Start background CLIP scanning
    // For now, navigate to the card deck
    navigation.navigate('CardDeck');
  };

  if (!permission?.granted) {
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

  return (
    <View style={styles.container}>
      <Text style={styles.title}>SnapSort</Text>
      <Text style={styles.subtitle}>AI 智能相册清理</Text>

      <View style={styles.statsCard}>
        <Text style={styles.statsNumber}>{photoCount ?? '...'}</Text>
        <Text style={styles.statsLabel}>张照片待处理</Text>
      </View>

      <TouchableOpacity
        style={[styles.primaryButton, scanning && styles.disabledButton]}
        onPress={startScan}
        disabled={scanning}
      >
        {scanning ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>开始清理</Text>
        )}
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
  disabledButton: {
    opacity: 0.5,
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
});
