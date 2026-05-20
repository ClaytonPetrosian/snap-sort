/**
 * AI Takeover Screen — final confirmation before bulk deletion.
 *
 * Shows a grid preview of AI-classified photos.
 * User can check/uncheck before triggering system delete dialog.
 */
import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  Alert,
  Dimensions,
} from 'react-native';
import * as MediaLibrary from 'expo-media-library';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_PADDING = 12;
const GRID_GAP = 4;
const COLS = 3;
const ITEM_SIZE = (SCREEN_WIDTH - GRID_PADDING * 2 - GRID_GAP * (COLS - 1)) / COLS;

interface PredictedPhoto {
  id: string;
  uri: string;
  label: string;
  confidence: number;
  selected: boolean;
}

export function AITakeoverScreen({ navigation, route }: any) {
  const { predictions: rawPredictions, onDeleteComplete } = route.params ?? {};

  const [activeTab, setActiveTab] = useState<'trash' | 'keep'>('trash');
  const [photos, setPhotos] = useState<PredictedPhoto[]>(
    (rawPredictions ?? []).map((p: any) => ({
      ...p,
      selected: p.label === 'trash', // Default: select all trash
    })),
  );
  const [deleting, setDeleting] = useState(false);

  const trashPhotos = useMemo(() => photos.filter(p => p.label === 'trash'), [photos]);
  const keepPhotos = useMemo(() => photos.filter(p => p.label !== 'trash'), [photos]);

  const displayedPhotos = activeTab === 'trash' ? trashPhotos : keepPhotos;
  const selectedTrash = trashPhotos.filter(p => p.selected);

  const toggleSelect = (id: string) => {
    setPhotos(prev =>
      prev.map(p => (p.id === id ? { ...p, selected: !p.selected } : p)),
    );
  };

  const selectAll = () => {
    setPhotos(prev =>
      prev.map(p =>
        p.label === activeTab ? { ...p, selected: true } : p,
      ),
    );
  };

  const deselectAll = () => {
    setPhotos(prev =>
      prev.map(p =>
        p.label === activeTab ? { ...p, selected: false } : p,
      ),
    );
  };

  const handleConfirmDelete = () => {
    const toDelete = photos.filter(p => p.selected && p.label === 'trash');
    if (toDelete.length === 0) {
      Alert.alert('提示', '没有选中要删除的照片');
      return;
    }

    Alert.alert(
      '确认删除',
      `即将删除 ${toDelete.length} 张照片。\n\n系统会弹出确认对话框，请点击"允许"完成操作。`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '确认删除',
          style: 'destructive',
          onPress: executeDelete,
        },
      ],
    );
  };

  const executeDelete = async () => {
    setDeleting(true);
    try {
      const toDelete = photos.filter(p => p.selected && p.label === 'trash');
      const assetIds = toDelete.map(p => p.id);

      // This triggers the system-native delete confirmation dialog
      const result = await MediaLibrary.deleteAssetsAsync(assetIds);

      if (result) {
        Alert.alert('完成', `已删除 ${toDelete.length} 张照片`, [
          {
            text: '好的',
            onPress: () => {
              onDeleteComplete?.(toDelete.length);
              navigation.goBack();
            },
          },
        ]);
      }
    } catch (err) {
      Alert.alert('删除失败', err instanceof Error ? err.message : '未知错误');
    } finally {
      setDeleting(false);
    }
  };

  const renderPhoto = ({ item }: { item: PredictedPhoto }) => (
    <TouchableOpacity
      style={[
        styles.gridItem,
        item.selected && styles.gridItemSelected,
      ]}
      onPress={() => toggleSelect(item.id)}
      activeOpacity={0.7}
    >
      <Image source={{ uri: item.uri }} style={styles.gridImage} />
      {item.selected && (
        <View style={styles.checkmark}>
          <Text style={styles.checkmarkText}>✓</Text>
        </View>
      )}
      <View style={styles.confidenceBadge}>
        <Text style={styles.confidenceText}>
          {Math.round(item.confidence * 100)}%
        </Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'trash' && styles.tabActive]}
          onPress={() => setActiveTab('trash')}
        >
          <Text style={[styles.tabText, activeTab === 'trash' && styles.tabTextActive]}>
            AI 判定垃圾 ({trashPhotos.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'keep' && styles.tabActive]}
          onPress={() => setActiveTab('keep')}
        >
          <Text style={[styles.tabText, activeTab === 'keep' && styles.tabTextActive]}>
            AI 判定留存 ({keepPhotos.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Batch actions */}
      <View style={styles.batchActions}>
        <TouchableOpacity onPress={selectAll}>
          <Text style={styles.batchActionText}>全选</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={deselectAll}>
          <Text style={styles.batchActionText}>取消全选</Text>
        </TouchableOpacity>
      </View>

      {/* Photo grid */}
      <FlatList
        data={displayedPhotos}
        renderItem={renderPhoto}
        keyExtractor={item => item.id}
        numColumns={COLS}
        contentContainerStyle={styles.grid}
        columnWrapperStyle={styles.gridRow}
      />

      {/* Bottom action */}
      <View style={styles.bottomBar}>
        <View style={styles.summary}>
          <Text style={styles.summaryText}>
            已选中 {selectedTrash.length} 张待删除
          </Text>
        </View>
        <TouchableOpacity
          style={[
            styles.deleteButton,
            (selectedTrash.length === 0 || deleting) && styles.deleteButtonDisabled,
          ]}
          onPress={handleConfirmDelete}
          disabled={selectedTrash.length === 0 || deleting}
        >
          <Text style={styles.deleteButtonText}>
            {deleting ? '删除中...' : '确认清理'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#3b82f6',
  },
  tabText: {
    color: '#666',
    fontSize: 14,
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#fff',
  },
  batchActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 16,
  },
  batchActionText: {
    color: '#3b82f6',
    fontSize: 14,
  },
  grid: {
    padding: GRID_PADDING,
  },
  gridRow: {
    gap: GRID_GAP,
  },
  gridItem: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    borderRadius: 4,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  gridItemSelected: {
    borderColor: '#ef4444',
  },
  gridImage: {
    width: '100%',
    height: '100%',
  },
  checkmark: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmarkText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  confidenceBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  confidenceText: {
    color: '#fff',
    fontSize: 10,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    paddingBottom: 34,
    borderTopWidth: 1,
    borderTopColor: '#1a1a1a',
  },
  summary: {
    flex: 1,
  },
  summaryText: {
    color: '#888',
    fontSize: 14,
  },
  deleteButton: {
    backgroundColor: '#ef4444',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
  },
  deleteButtonDisabled: {
    opacity: 0.4,
  },
  deleteButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
