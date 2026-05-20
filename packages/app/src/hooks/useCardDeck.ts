/**
 * useCardDeck hook — manages the active learning card deck.
 *
 * - Phase 1 (cold start): random 20 photos
 * - Phase 2 (active learning): uncertainty-sampled ordering
 * - Tracks undo stack, classifier state, AI readiness
 */
import { useState, useCallback, useRef, useMemo } from 'react';
import {
  KNNClassifier,
  UncertaintySampler,
  selectBatch,
  InMemoryFeatureStore,
} from '@smart-photo/core';
import type { PhotoRecord, Embedding, Label, Prediction } from '@smart-photo/core';

const LABEL_TRASH = 'trash';
const LABEL_KEEP = 'keep';
const LABEL_WORK = 'work';

const COLD_START_COUNT = 20;
const AI_READY_THRESHOLD = 0.8; // 80% of remaining photos with >90% confidence

export interface DeckCard {
  photo: PhotoRecord;
  prediction?: Prediction;
  isAIDecided: boolean;
}

export interface UndoEntry {
  index: number;
  photo: PhotoRecord;
  label: Label;
}

export interface DeckState {
  cards: DeckCard[];
  currentIndex: number;
  totalPhotos: number;
  labeledCount: number;
  phase: 'cold-start' | 'active-learning' | 'completed';
  aiReady: boolean;
  aiStats: {
    trash: number;
    keep: number;
    work: number;
    unclassified: number;
  };
}

export function useCardDeck(store: InMemoryFeatureStore | null) {
  const classifierRef = useRef(new KNNClassifier({ k: 5 }));
  const samplerRef = useRef(new UncertaintySampler());
  const undoStackRef = useRef<UndoEntry[]>([]);
  const allPhotosRef = useRef<PhotoRecord[]>([]);

  const [state, setState] = useState<DeckState>({
    cards: [],
    currentIndex: 0,
    totalPhotos: 0,
    labeledCount: 0,
    phase: 'cold-start',
    aiReady: false,
    aiStats: { trash: 0, keep: 0, work: 0, unclassified: 0 },
  });

  /**
   * Initialize the deck from the feature store.
   * Loads all unclassified photos and shuffles the first batch.
   */
  const initializeDeck = useCallback(async () => {
    if (!store) return;

    const allPhotos = await store.getUnclassified();
    allPhotosRef.current = allPhotos;

    // Phase 1: random shuffle for cold start
    const shuffled = [...allPhotos].sort(() => Math.random() - 0.5);
    const initialCards: DeckCard[] = shuffled.map(photo => ({
      photo,
      isAIDecided: false,
    }));

    setState({
      cards: initialCards,
      currentIndex: 0,
      totalPhotos: allPhotos.length,
      labeledCount: 0,
      phase: 'cold-start',
      aiReady: false,
      aiStats: { trash: 0, keep: 0, work: 0, unclassified: allPhotos.length },
    });
  }, [store]);

  /**
   * Label the current card and advance.
   */
  const labelCard = useCallback((label: Label) => {
    setState(prev => {
      const card = prev.cards[prev.currentIndex];
      if (!card) return prev;

      // Add to classifier
      if (card.photo.embedding) {
        classifierRef.current.addSample(card.photo.embedding, label);
      }

      // Save undo
      undoStackRef.current.push({
        index: prev.currentIndex,
        photo: card.photo,
        label,
      });

      const newIndex = prev.currentIndex + 1;
      const newLabeled = prev.labeledCount + 1;
      const newPhase = newLabeled >= COLD_START_COUNT ? 'active-learning' : 'cold-start';

      // Check AI readiness
      const aiReady = checkAIReadiness(prev.cards, newIndex, classifierRef.current);

      // Update stats
      const aiStats = { ...prev.aiStats };
      aiStats[label] = (aiStats[label] ?? 0) + 1;
      aiStats.unclassified = Math.max(0, aiStats.unclassified - 1);

      // If in active learning phase, re-sort remaining cards
      let newCards = prev.cards;
      if (newPhase === 'active-learning' && newLabeled === COLD_START_COUNT) {
        newCards = reorderForActiveLearning(prev.cards, newIndex, classifierRef.current, samplerRef.current);
      }

      return {
        ...prev,
        cards: newCards,
        currentIndex: newIndex,
        labeledCount: newLabeled,
        phase: newIndex >= prev.cards.length ? 'completed' : newPhase,
        aiReady,
        aiStats,
      };
    });
  }, []);

  /**
   * Undo the last labeling action.
   */
  const undo = useCallback(() => {
    const lastEntry = undoStackRef.current.pop();
    if (!lastEntry) return;

    classifierRef.current.removeLastSample();

    setState(prev => {
      const aiStats = { ...prev.aiStats };
      aiStats[lastEntry.label] = Math.max(0, (aiStats[lastEntry.label] ?? 0) - 1);
      aiStats.unclassified++;

      return {
        ...prev,
        currentIndex: lastEntry.index,
        labeledCount: Math.max(0, prev.labeledCount - 1),
        phase: lastEntry.index < COLD_START_COUNT ? 'cold-start' : 'active-learning',
        aiReady: false,
        aiStats,
      };
    });
  }, []);

  /**
   * Get AI takeover stats — how many photos can be auto-classified.
   */
  const getAITakeoverStats = useCallback(() => {
    const classifier = classifierRef.current;
    if (classifier.sampleCount === 0) return null;

    const remaining = state.cards.slice(state.currentIndex);
    let highConfidenceCount = 0;
    const predictions: Array<{ index: number; label: string; confidence: number }> = [];

    for (let i = 0; i < remaining.length; i++) {
      try {
        const pred = classifier.predict(remaining[i].photo.embedding);
        predictions.push({ index: i, label: pred.label, confidence: pred.confidence });
        if (pred.confidence > 0.9) {
          highConfidenceCount++;
        }
      } catch {
        // Skip if classifier can't predict
      }
    }

    const ratio = remaining.length > 0 ? highConfidenceCount / remaining.length : 0;

    return {
      totalRemaining: remaining.length,
      highConfidence: highConfidenceCount,
      ratio,
      aiReady: ratio >= AI_READY_THRESHOLD,
      predictions,
    };
  }, [state.cards, state.currentIndex]);

  const canUndo = undoStackRef.current.length > 0;

  return {
    state,
    initializeDeck,
    labelCard,
    undo,
    canUndo,
    getAITakeoverStats,
    classifier: classifierRef.current,
  };
}

/**
 * Reorder remaining cards using uncertainty sampling.
 * Most uncertain photos go to the top of the deck.
 */
function reorderForActiveLearning(
  cards: DeckCard[],
  fromIndex: number,
  classifier: KNNClassifier,
  sampler: UncertaintySampler,
): DeckCard[] {
  const remaining = cards.slice(fromIndex);
  const embeddings = remaining.map(c => c.photo.embedding);

  // Score each card by uncertainty
  const scored = remaining.map((card, i) => {
    try {
      const pred = classifier.predict(card.embedding);
      const uncertainty = 1 - Math.abs(pred.confidence - 0.5) * 2;
      return { card, uncertainty, prediction: pred, originalIndex: i };
    } catch {
      return { card, uncertainty: 1, prediction: undefined, originalIndex: i };
    }
  });

  // Sort by uncertainty descending (most uncertain first)
  scored.sort((a, b) => b.uncertainty - a.uncertainty);

  const reordered = scored.map(s => ({
    ...s.card,
    prediction: s.prediction,
    isAIDecided: false,
  }));

  return [...cards.slice(0, fromIndex), ...reordered];
}

/**
 * Check if enough photos have high confidence for AI takeover.
 */
function checkAIReadiness(
  cards: DeckCard[],
  fromIndex: number,
  classifier: KNNClassifier,
): boolean {
  if (classifier.sampleCount < COLD_START_COUNT) return false;

  const remaining = cards.slice(fromIndex);
  if (remaining.length === 0) return false;

  let highConfidenceCount = 0;
  for (const card of remaining) {
    try {
      const pred = classifier.predict(card.photo.embedding);
      if (pred.confidence > 0.9) highConfidenceCount++;
    } catch {
      // Skip
    }
  }

  return highConfidenceCount / remaining.length >= AI_READY_THRESHOLD;
}
