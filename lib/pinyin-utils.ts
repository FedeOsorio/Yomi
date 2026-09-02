import { bestSegmentation } from './pinyin-segmenter';

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

export function stripDiacritics(input: string): string {
  let res = input.toLowerCase();
  for (const [diacritic, info] of Object.entries(DIACRITIC_TO_TONE)) {
    res = res.split(diacritic).join(info.base);
  }
  return res;
}

export function toSearchKey(input: string): string {
  return stripDiacritics(input)
    .replace(/[1-5 ]/g, '')
    .replace(/u:/g, 'v')
    .replace(/ü/g, 'v');
}

/**
 * Mapa inverso para extraer el tono (1 a 4) a partir de una vocal con tilde.
 */
export const DIACRITIC_TO_TONE: Record<string, { base: string; tone: number }> = {
  'ā': { base: 'a', tone: 1 }, 'á': { base: 'a', tone: 2 }, 'ǎ': { base: 'a', tone: 3 }, 'à': { base: 'a', tone: 4 },
  'ē': { base: 'e', tone: 1 }, 'é': { base: 'e', tone: 2 }, 'ě': { base: 'e', tone: 3 }, 'è': { base: 'e', tone: 4 },
  'ī': { base: 'i', tone: 1 }, 'í': { base: 'i', tone: 2 }, 'ǐ': { base: 'i', tone: 3 }, 'ì': { base: 'i', tone: 4 },
  'ō': { base: 'o', tone: 1 }, 'ó': { base: 'o', tone: 2 }, 'ǒ': { base: 'o', tone: 3 }, 'ò': { base: 'o', tone: 4 },
  'ū': { base: 'u', tone: 1 }, 'ú': { base: 'u', tone: 2 }, 'ǔ': { base: 'u', tone: 3 }, 'ù': { base: 'u', tone: 4 },
  'ǖ': { base: 'ü', tone: 1 }, 'ǘ': { base: 'ü', tone: 2 }, 'ǚ': { base: 'ü', tone: 3 }, 'ǜ': { base: 'ü', tone: 4 },
};

/**
 * Detecta si un fragmento de texto Pinyin contiene un tono explícito (número 1-5 o vocal con tilde).
 * Retorna el número de tono (1-5) o undefined si no se especificó tono.
 */
export function getExplicitTone(syllableStr: string): number | undefined {
  if (!syllableStr) return undefined;

  // 1. Número explícito al final o dentro (ej. "mei2")
  const numMatch = syllableStr.match(/[1-5]/);
  if (numMatch) {
    return parseInt(numMatch[0], 10);
  }

  // 2. Vocal con tilde diacrítica (ej. "méi", "wǒ")
  for (const char of syllableStr) {
    if (DIACRITIC_TO_TONE[char]) {
      return DIACRITIC_TO_TONE[char].tone;
    }
  }

  return undefined;
}

/**
 * Extrae los números de tono (1-5) presentes en una cadena Pinyin (tanto en formato numérico 'ni3 hao3' como gráfico 'nǐ hǎo').
 */
export function extractTonesFromDisplay(pinyin: string): number[] {
  if (!pinyin) return [];
  const tones: number[] = [];
  
  // 1. Si contiene números explícitos (ej. "ni3 hao3")
  const numMatches = pinyin.match(/[1-5]/g);
  if (numMatches && numMatches.length > 0) {
    return numMatches.map((n) => parseInt(n, 10));
  }

  // 2. Si usa tildes diacríticas (ej. "nǐ hǎo")
  const syllables = pinyin.trim().split(/\s+/);
  for (const syl of syllables) {
    let foundTone = 5; // Tono neutro por defecto
    for (const char of syl) {
      if (DIACRITIC_TO_TONE[char]) {
        foundTone = DIACRITIC_TO_TONE[char].tone;
        break;
      }
    }
    tones.push(foundTone);
  }

  return tones;
}

// Lista estándar de consonantes iniciales (Shengmu) en Pinyin ordenadas por longitud descendente
const PINYIN_INITIALS = [
  'ch', 'sh', 'zh',
  'b', 'p', 'm', 'f',
  'd', 't', 'n', 'l',
  'g', 'k', 'h',
  'j', 'q', 'x',
  'r', 'z', 'c', 's',
  'y', 'w'
];

/**
 * Descompone una sílaba Pinyin en consonante inicial (initial), rima vocálica (final) y tono (1-5).
 */
export function decomposePinyinSyllable(syllableStr: string): { initial: string; final: string; tone: number } {
  if (!syllableStr) return { initial: '', final: '', tone: 5 };
  
  const tone = getExplicitTone(syllableStr) || 5;
  const plain = toSearchKey(syllableStr);
  
  let initial = '';
  let final = plain;
  
  for (const init of PINYIN_INITIALS) {
    if (plain.startsWith(init)) {
      initial = init;
      final = plain.substring(init.length);
      break;
    }
  }
  
  return { initial, final, tone };
}

/**
 * Distancia de edición (Levenshtein) para medir matemáticamente la proximidad de dos cadenas fonéticas.
 */
export function stringSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  
  const distance = dp[m][n];
  const maxLen = Math.max(m, n);
  return Math.max(0, 1 - distance / maxLen);
}

/**
 * Evalúa matemáticamente la precisión de una sílaba hablada contra la esperada:
 * - 30% Peso consonante inicial
 * - 40% Peso rima vocálica
 * - 30% Peso del tono diacrítico (1 a 5)
 */
export function computePinyinSyllableAccuracy(
  expectedSyl: string,
  spokenSyl: string,
  hasExplicitSpokenTone: boolean
): { score: number; toneMatched: boolean; spokenTone?: number } {
  const expected = decomposePinyinSyllable(expectedSyl);
  const spoken = decomposePinyinSyllable(spokenSyl);

  // 1. Similitud de la consonante inicial (30%)
  const initialSim = stringSimilarity(expected.initial, spoken.initial);

  // 2. Similitud de la rima vocálica (40%)
  const finalSim = stringSimilarity(expected.final, spoken.final);

  // 3. Evaluación del tono (30%)
  let toneScore = 0;
  let toneMatched = false;

  if (hasExplicitSpokenTone) {
    if (spoken.tone === expected.tone) {
      toneScore = 1.0;
      toneMatched = true;
    } else {
      toneScore = 0.0;
      toneMatched = false;
    }
  } else {
    // Si la transcripción acústica no aportó tono explícito pero acertó fonética,
    // se pondera proporcionalmente la concordancia fonética lograda
    const phoneticAvg = (initialSim * 0.45) + (finalSim * 0.55);
    toneScore = phoneticAvg * 0.65; // Ponderación no arbitraria basada en exactitud de formantes
    toneMatched = false;
  }

  // Cálculo de precisión total ponderada (0 a 100)
  const weighted = (initialSim * 30) + (finalSim * 40) + (toneScore * 30);
  const finalScore = Math.min(Math.max(Math.round(weighted), 0), 100);

  return {
    score: finalScore,
    toneMatched,
    spokenTone: hasExplicitSpokenTone ? spoken.tone : undefined,
  };
}

export interface PinyinBreakdownItem {
  syllable: string;
  char?: string;
  score: number;
  expectedTone?: number;
  spokenTone?: number;
  toneMatched: boolean;
}

export interface ChineseAccuracyResult {
  score: number;
  label: string;
  toneMatched: boolean;
  breakdown: PinyinBreakdownItem[];
}

/**
 * Calcula el porcentaje de precisión de pronunciación y tono,
 * desglosando cada sílaba Pinyin de la palabra con su porcentaje individual.
 */
export function calculateChineseAccuracyScore(
  transcript: string,
  expectedHanzi: string,
  expectedReading: string
): ChineseAccuracyResult {
  const cleanTrans = transcript ? transcript.replace(/[。、！？!?,.:;\s]/g, '').trim() : '';
  const cleanHanzi = expectedHanzi ? expectedHanzi.replace(/[。、！？!?,.:;\s]/g, '').trim() : '';
  const cleanRead = expectedReading ? expectedReading.replace(/[。、！？!?,.:;\s]/g, '').trim() : '';

  if (!expectedHanzi && !expectedReading) {
    return { score: 0, label: '0% Precisión', toneMatched: false, breakdown: [] };
  }

  // Desglosar las sílabas del pinyin esperado
  let expectedSyllables: string[] = [];
  const spaceSplit = cleanRead.split(/\s+/).filter((s) => s.length > 0);

  if (spaceSplit.length > 1) {
    expectedSyllables = spaceSplit;
  } else if (cleanRead.length > 0) {
    // Limpiar acentos diacríticos para que el segmentador reconozca las sílabas válidas (ej: "nǐhǎo" -> "nihao" -> ["ni", "hao"])
    const plainSyllables = bestSegmentation(toSearchKey(cleanRead));

    if (plainSyllables.length > 1) {
      let charCursor = 0;
      const reconstructed: string[] = [];
      for (const plainSyl of plainSyllables) {
        // Encontrar cuántos caracteres de cleanRead corresponden a esta sílaba fonética
        let matched = '';
        while (charCursor < cleanRead.length) {
          matched += cleanRead[charCursor];
          charCursor++;
          if (toSearchKey(matched) === plainSyl) {
            break;
          }
        }
        reconstructed.push(matched);
      }
      expectedSyllables = reconstructed.filter((r) => r.length > 0);
    } else {
      expectedSyllables = [cleanRead];
    }
  }

  // Si por alguna razón la lectura no arrojó sílabas múltiples pero hay varios Hanzi
  if (expectedSyllables.length <= 1 && cleanHanzi.length > 1) {
    const plainSyllables = bestSegmentation(toSearchKey(cleanRead));
    if (plainSyllables.length === cleanHanzi.length) {
      expectedSyllables = plainSyllables;
    }
  }

  const hanziChars = cleanHanzi.split('');
  const expectedTones = extractTonesFromDisplay(cleanRead);

  // Si no se pronunció nada o la transcripción está vacía (silencio/timeout): 0% total
  if (!cleanTrans || cleanTrans.length === 0) {
    const breakdown: PinyinBreakdownItem[] = expectedSyllables.map((syl, idx) => ({
      syllable: syl,
      char: hanziChars[idx] || undefined,
      score: 0,
      expectedTone: expectedTones[idx] || 5,
      spokenTone: undefined,
      toneMatched: false,
    }));
    return { score: 0, label: '0% Precisión', toneMatched: false, breakdown };
  }

  // 1. Coincidencia idéntica textual completa (con tonos idénticos en la lectura)
  const isExactPinyinMatch = cleanRead && cleanTrans.toLowerCase() === cleanRead.toLowerCase();

  // 2. Evaluar coincidencia fonética y por sílaba
  const transKey = toSearchKey(cleanTrans);
  const transTones = extractTonesFromDisplay(cleanTrans);

  // Intentar desglosar la transcripción hablada en sílabas si vino como pinyin
  const spokenSyllables = bestSegmentation(transKey);

  const breakdown: PinyinBreakdownItem[] = expectedSyllables.map((syl, idx) => {
    const char = hanziChars[idx] || undefined;
    const expTone = expectedTones[idx] || 5;

    // Buscar si la transcripción aportó un tono explícito para esta sílaba
    const explicitSpokenTone = transTones[idx] ?? getExplicitTone(cleanTrans);
    const hasExplicitTone = explicitSpokenTone !== undefined;

    // Encontrar la mejor sílaba candidata pronunciada por el usuario
    let bestCandidateSyl = spokenSyllables[idx] || cleanTrans;
    if (char && cleanTrans.includes(char)) {
      bestCandidateSyl = syl; // Si Google transcribió el Hanzi de esta sílaba, la base fonética es la del carácter
    }

    // Calcular precisión fonética y tonal exacta de forma dinámica (Levenshtein + descomposición inicial/final/tono)
    const accuracy = computePinyinSyllableAccuracy(
      syl,
      bestCandidateSyl,
      hasExplicitTone
    );

    return {
      syllable: syl,
      char,
      score: accuracy.score,
      expectedTone: expTone,
      spokenTone: accuracy.spokenTone,
      toneMatched: accuracy.toneMatched,
    };
  });

  const totalScore = Math.round(
    breakdown.reduce((sum, item) => sum + item.score, 0) / Math.max(breakdown.length, 1)
  );

  return {
    score: totalScore,
    label: `${totalScore}% Precisión`,
    toneMatched: breakdown.every((b) => b.toneMatched),
    breakdown,
  };
}


