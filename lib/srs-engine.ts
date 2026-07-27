import * as crypto from 'expo-crypto';
import { createEmptyCard } from 'ts-fsrs';

export function createNewSrsItem(itemType: 'word' | 'sentence', itemId: string, displayData: {
  displayText: string,
  displayReading: string,
  displayMeaning: string,
}) {
  const card = createEmptyCard();
  
  return {
    id: crypto.randomUUID(),
    itemType,
    itemId,
    ...displayData,
    state: card.state,
    due: card.due,
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsed_days,
    scheduledDays: card.scheduled_days,
    reps: card.reps,
    lapses: card.lapses,
    lastReview: card.last_review,
    createdAt: new Date(),
  };
}
