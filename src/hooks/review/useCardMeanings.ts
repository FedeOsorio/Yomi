import { useMemo } from 'react';
import { cleanAndFormatMeanings } from '../../../lib/japanese-search';
import { DueCardWithContext } from '../../../lib/srs-engine';
import { parseAux } from '../../../lib/word-aux';

/**
 * Significados a mostrar en el dorso de la tarjeta, en orden de prioridad:
 * 1. los elegidos por el usuario (auxiliaryInfo.selectedMeanings),
 * 2. displayMeaning (lista JSON o texto),
 * 3. los significados del diccionario (wordMeanings), limpios y formateados.
 */
export function getCardMeanings(card: DueCardWithContext | null): string[] {
  if (!card) return [];

  const selected = parseAux(card.auxiliaryInfo).selectedMeanings;
  if (Array.isArray(selected) && selected.length > 0) {
    const list = selected.map((m) => String(m).trim()).filter(Boolean);
    if (list.length > 0) return list;
  }

  if (card.displayMeaning) {
    let list: string[] = [];
    try {
      const parsed = JSON.parse(card.displayMeaning);
      if (Array.isArray(parsed)) list = parsed.map((m) => String(m).trim()).filter(Boolean);
      else if (typeof parsed === 'string' && parsed.trim()) list = [parsed.trim()];
    } catch {
      const raw = String(card.displayMeaning).trim();
      if (raw) list = [raw];
    }
    if (list.length > 0) return list;
  }

  if (card.wordMeanings) {
    if (card.deckType === 'custom') {
      try {
        const parsed = JSON.parse(card.wordMeanings);
        return Array.isArray(parsed) ? parsed : [String(card.wordMeanings)];
      } catch {
        return [card.wordMeanings];
      }
    }
    return cleanAndFormatMeanings(card.wordMeanings);
  }
  return [];
}

export function useCardMeanings(card: DueCardWithContext | null): string[] {
  return useMemo(() => getCardMeanings(card), [card?.id, card?.auxiliaryInfo, card?.displayMeaning, card?.wordMeanings]);
}
