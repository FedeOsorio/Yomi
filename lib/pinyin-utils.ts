const TONE_MAP: Record<string, string[]> = {
  'a': ['ā', 'á', 'ǎ', 'à'],
  'e': ['ē', 'é', 'ě', 'è'],
  'i': ['ī', 'í', 'ǐ', 'ì'],
  'o': ['ō', 'ó', 'ǒ', 'ò'],
  'u': ['ū', 'ú', 'ǔ', 'ù'],
  'v': ['ǖ', 'ǘ', 'ǚ', 'ǜ'],
  'ü': ['ǖ', 'ǘ', 'ǚ', 'ǜ'],
};

export function extractToneNumber(syllable: string): { base: string, tone: number } {
  const match = syllable.match(/^([a-z:]+)([1-5]?)$/i);
  if (!match) return { base: syllable, tone: 5 };
  return { base: match[1], tone: match[2] ? parseInt(match[2]) : 5 };
}

export function numericToDisplay(pinyinNumeric: string): string {
  const syllables = pinyinNumeric.toLowerCase().split(' ');
  const result = syllables.map(syl => {
    const { base, tone } = extractToneNumber(syl);
    if (tone === 5) return base.replace(/u:/g, 'ü').replace(/v/g, 'ü');
    
    let chars = base.split('');
    let targetIdx = -1;

    // Rule 1: 'a' or 'e'
    targetIdx = chars.findIndex(c => c === 'a' || c === 'e');
    // Rule 2: 'ou'
    if (targetIdx === -1 && base.includes('ou')) targetIdx = chars.indexOf('o');
    // Rule 3: last vowel
    if (targetIdx === -1) {
      for (let i = chars.length - 1; i >= 0; i--) {
        if (['i', 'o', 'u', 'v', ':'].includes(chars[i])) {
          targetIdx = i;
          if (chars[i] === ':' && chars[i-1] === 'u') targetIdx = i - 1;
          break;
        }
      }
    }

    if (targetIdx !== -1) {
      const charToReplace = chars[targetIdx] === 'u' && chars[targetIdx+1] === ':' ? 'ü' : chars[targetIdx];
      const mapKey = charToReplace === 'v' ? 'ü' : charToReplace;
      if (TONE_MAP[mapKey]) {
        chars[targetIdx] = TONE_MAP[mapKey][tone - 1];
        if (charToReplace === 'ü' && base.includes('u:')) chars[targetIdx + 1] = '';
      }
    }
    
    return chars.join('').replace(/u:/g, 'ü').replace(/v/g, 'ü');
  });
  return result.join('');
}

export function toSearchKey(input: string): string {
  return input
    .toLowerCase()
    .replace(/[1-5 ]/g, '')
    .replace(/u:/g, 'v')
    .replace(/ü/g, 'v');
}
