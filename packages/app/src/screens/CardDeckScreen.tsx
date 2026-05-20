/**
 * Card Deck Screen — Tinder-style gesture swipe for photo classification.
 *
 * Left swipe  → trash (delete)
 * Right swipe → keep (save)
 * Up swipe    → custom category (work/documents)
 */
import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Image,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { KNNClassifier, UncertaintySampler, selectBatch } from '@smart-photo/core';
import type { Embedding, PhotoRecord } from '@smart-photo/core';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.3;
const SWIPE_UP_THRESHOLD = -SCREEN_HEIGHT * 0.15;

// Label constants
const LABEL_TRASH = 'trash';
const LABEL_KEEP = 'keep';
const LABEL_WORK = 'work';

interface CardState {
  photo: PhotoRecord;
  label?: string;
}

export function CardDeckScreen({ navigation }: any) {
  // Core instances
  const classifierRef = useRef(new KNNClassifier({ k: 5 }));
  const samplerRef = useRef(new UncertaintySampler());

  // State
  const [cards, setCards] = useState<CardState[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [undoStack, setUndoStack] = useState<Array<{ index: number; photo: PhotoRecord }>>([]);

  // Animation values for current card
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  const handleSwipe = useCallback((direction: 'left' | 'right' | 'up') => {
    const currentCard = cards[currentIndex];
    if (!currentCard) return;

    const label = direction === 'left' ? LABEL_TRASH
               : direction === 'right' ? LABEL_KEEP
               : LABEL_WORK;

    // Add to classifier training set
    if (currentCard.photo.embedding) {
      classifierRef.current.addSample(currentCard.photo.embedding, label);
    }

    // Save to undo stack
    setUndoStack(prev => [...prev, { index: currentIndex, photo: currentCard.photo }]);

    // Move to next card
    setCurrentIndex(prev => prev + 1);

    // Reset animation values
    translateX.value = 0;
    translateY.value = 0;
  }, [cards, currentIndex]);

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const last = undoStack[undoStack.length - 1];
    classifierRef.current.removeLastSample();
    setUndoStack(prev => prev.slice(0, -1));
    setCurrentIndex(last.index);
  }, [undoStack]);

  // Pan gesture
  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      translateX.value = event.translationX;
      translateY.value = event.translationY;
    })
    .onEnd((event) => {
      const dx = event.translationX;
      const dy = event.translationY;

      if (Math.abs(dx) > SWIPE_THRESHOLD) {
        // Horizontal swipe
        const direction = dx > 0 ? 'right' : 'left';
        const targetX = direction === 'right' ? SCREEN_WIDTH : -SCREEN_WIDTH;
        translateX.value = withSpring(targetX, { damping: 20 }, () => {
          runOnJS(handleSwipe)(direction);
        });
      } else if (dy < SWIPE_UP_THRESHOLD) {
        // Up swipe
        translateY.value = withSpring(-SCREEN_HEIGHT, { damping: 20 }, () => {
          runOnJS(handleSwipe)('up');
        });
      } else {
        // Snap back
        translateX.value = withSpring(0, { damping: 20 });
        translateY.value = withSpring(0, { damping: 20 });
      }
    });

  const animatedCardStyle = useAnimatedStyle(() => {
    const rotate = interpolate(
      translateX.value,
      [-SCREEN_WIDTH, 0, SCREEN_WIDTH],
      [-15, 0, 15],
      Extrapolation.CLAMP,
    );

    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { rotate: `${rotate}deg` },
      ],
    };
  });

  // Label overlay styles
  const trashOverlayStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateX.value,
      [-SWIPE_THRESHOLD, 0],
      [1, 0],
      Extrapolation.CLAMP,
    ),
  }));

  const keepOverlayStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateX.value,
      [0, SWIPE_THRESHOLD],
      [0, 1],
      Extrapolation.CLAMP,
    ),
  }));

  const workOverlayStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateY.value,
      [SWIPE_UP_THRESHOLD, 0],
      [1, 0],
      Extrapolation.CLAMP,
    ),
  }));

  const currentCard = cards[currentIndex];
  const progress = cards.length > 0
    ? `${currentIndex}/${cards.length}`
    : '0/0';

  return (
    <View style={styles.container}>
      {/* Progress bar */}
      <View style={styles.header}>
        <Text style={styles.progress}>{progress}</Text>
        <Text style={styles.aiStatus}>AI 学习中...</Text>
      </View>

      {/* Card area */}
      <View style={styles.cardArea}>
        {currentCard ? (
          <GestureDetector gesture={panGesture}>
            <Animated.View style={[styles.card, animatedCardStyle]}>
              <Image
                source={{ uri: currentCard.photo.id }}
                style={styles.photo}
                resizeMode="cover"
              />

              {/* Swipe direction overlays */}
              <Animated.View style={[styles.overlay, styles.trashOverlay, trashOverlayStyle]}>
                <Text style={styles.overlayText}>删除</Text>
              </Animated.View>

              <Animated.View style={[styles.overlay, styles.keepOverlay, keepOverlayStyle]}>
                <Text style={styles.overlayText}>保留</Text>
              </Animated.View>

              <Animated.View style={[styles.overlay, styles.workOverlay, workOverlayStyle]}>
                <Text style={styles.overlayText}>工作/证件</Text>
              </Animated.View>
            </Animated.View>
          </GestureDetector>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>所有照片已处理完毕</Text>
          </View>
        )}
      </View>

      {/* Bottom hints */}
      <View style={styles.hints}>
        <Text style={styles.hintLeft}>← 删除</Text>
        <TouchableOpacity onPress={handleUndo} style={styles.undoButton}>
          <Text style={styles.undoText}>撤销</Text>
        </TouchableOpacity>
        <Text style={styles.hintRight}>保留 →</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 12,
  },
  progress: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  aiStatus: {
    color: '#3b82f6',
    fontSize: 14,
  },
  cardArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  card: {
    width: SCREEN_WIDTH - 32,
    height: SCREEN_HEIGHT * 0.6,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 16,
  },
  trashOverlay: {
    backgroundColor: 'rgba(239, 68, 68, 0.4)',
    borderWidth: 4,
    borderColor: '#ef4444',
  },
  keepOverlay: {
    backgroundColor: 'rgba(34, 197, 94, 0.4)',
    borderWidth: 4,
    borderColor: '#22c55e',
  },
  workOverlay: {
    backgroundColor: 'rgba(59, 130, 246, 0.4)',
    borderWidth: 4,
    borderColor: '#3b82f6',
  },
  overlayText: {
    fontSize: 32,
    fontWeight: '700',
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  emptyState: {
    alignItems: 'center',
  },
  emptyText: {
    color: '#888',
    fontSize: 18,
  },
  hints: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 40,
    paddingTop: 16,
  },
  hintLeft: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '500',
  },
  hintRight: {
    color: '#22c55e',
    fontSize: 14,
    fontWeight: '500',
  },
  undoButton: {
    backgroundColor: '#333',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 20,
  },
  undoText: {
    color: '#fff',
    fontSize: 14,
  },
});
