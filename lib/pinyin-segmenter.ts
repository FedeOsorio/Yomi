import { PINYIN_SYLLABLES } from '../constants/pinyin-syllables';

export function segmentPinyin(input: string, start = 0, memo: Record<number, string[][]> = {}): string[][] {
  if (start === input.length) return [[]];
  if (memo[start]) return memo[start];

  const results: string[][] = [];
  
  for (let maxLen = input.length - start; maxLen >= 1; maxLen--) {
    const prefix = input.substring(start, start + maxLen);
    
    if (PINYIN_SYLLABLES.has(prefix)) {
      const suffixes = segmentPinyin(input, start + prefix.length, memo);
      for (const suffix of suffixes) {
        results.push([prefix, ...suffix]);
      }
    }
  }

  memo[start] = results;
  return results;
}

export function bestSegmentation(input: string): string[] {
  const allSegmentations = segmentPinyin(input);
  if (allSegmentations.length === 0) return [];
  
  let best = allSegmentations[0];
  for (let i = 1; i < allSegmentations.length; i++) {
    if (allSegmentations[i].length < best.length) {
      best = allSegmentations[i];
    }
  }
  return best;
}
