/**
 * Base de datos rápida de clasificación JLPT (N5 a N1) para resolución instantánea offline.
 */

// Mapeo rápido de Kanjis y Vocabulario N5 a N1
export const JLPT_DICTIONARY: Record<string, string> = {
  // N5 (Básico / Principiante)
  '一': 'N5', '二': 'N5', '三': 'N5', '四': 'N5', '五': 'N5',
  '六': 'N5', '七': 'N5', '八': 'N5', '九': 'N5', '十': 'N5',
  '百': 'N5', '千': 'N5', '万': 'N5', '円': 'N5', '日': 'N5',
  '月': 'N5', '火': 'N5', '水': 'N5', '木': 'N5', '金': 'N5',
  '土': 'N5', '年': 'N5', '今': 'N5', '時': 'N5', '分': 'N5',
  '半': 'N5', '人': 'N5', '男': 'N5', '女': 'N5', '子': 'N5',
  '父': 'N5', '母': 'N5', '友': 'N5', '本': 'N5', '何': 'N5',
  '大': 'N5', '小': 'N5', '中': 'N5', '長': 'N5', '高': 'N5',
  '安': 'N5', '新': 'N5', '古': 'N5', '白': 'N5', '黒': 'N5',
  '赤': 'N5', '青': 'N5', '前': 'N5', '後': 'N5', '上': 'N5',
  '下': 'N5', '左': 'N5', '右': 'N5', '東': 'N5', '西': 'N5',
  '南': 'N5', '北': 'N5', '口': 'N5', '目': 'N5', '耳': 'N5',
  '手': 'N5', '足': 'N5', '車': 'N5', '門': 'N5', '道': 'N5',
  '山': 'N5', '川': 'N5', '花': 'N5', '雨': 'N5', '天': 'N5',
  '気': 'N5', '空': 'N5', '魚': 'N5', '肉': 'N5', '犬': 'N5',
  '名': 'N5', '語': 'N5', '校': 'N5', '学': 'N5', '生': 'N5',
  '先': 'N5', '会': 'N5', '社': 'N5', '店': 'N5', '国': 'N5',
  '見': 'N5', '行': 'N5', '来': 'N5', '食': 'N5', '飲': 'N5',
  '買': 'N5', '聞': 'N5', '読': 'N5', '書': 'N5', '話': 'N5',
  '出': 'N5', '入': 'N5', '立': 'N5', '休': 'N5', '言': 'N5',
  
  // Palabras y expresiones cotidianas N5
  '日本': 'N5', '日本人': 'N5', '日本語': 'N5', '本屋': 'N5',
  '今日': 'N5', '明日': 'N5', '昨日': 'N5', '毎日': 'N5',
  '先生': 'N5', '学生': 'N5', '学校': 'N5', '大学': 'N5',
  '友達': 'N5', '時間': 'N5', '天気': 'N5', '電話': 'N5',
  '電車': 'N5', '自転車': 'N5', '食べる': 'N5',
  '飲む': 'N5', '行く': 'N5', '来る': 'N5', '見る': 'N5',
  '聞く': 'N5', '話す': 'N5', '読む': 'N5', '書く': 'N5',
  '買う': 'N5', '会う': 'N5', '待つ': 'N5', '持つ': 'N5',
  '猫': 'N5', 'ありがとう': 'N5', 'ありがとうございます': 'N5',
  'こんにちは': 'N5', 'はい': 'N5', 'いいえ': 'N5',
  'お願いします': 'N5', 'おねがいします': 'N5',
  'おはよう': 'N5', 'おはようございます': 'N5',
  'こんばんは': 'N5', 'さようなら': 'N5',
  'すみません': 'N5', 'ごめ息': 'N5', 'ごめんなさい': 'N5',
  'いただきます': 'N5', 'ごちそうさまでした': 'N5',

  // N4 (Elemental)
  '家': 'N4', '族': 'N4', '兄': 'N4', '弟': 'N4', '姉': 'N4',
  '妹': 'N4', '私': 'N4', '町': 'N4', '村': 'N4', '京': 'N4',
  '都': 'N4', '寺': 'N4', '駅': 'N4', '銀': 'N4', '病': 'N4',
  '院': 'N4', '医': 'N4', '者': 'N4', '屋': 'N4', '室': 'N4',
  '教': 'N4', '場': 'N4', '所': 'N4', '海': 'N4', '野': 'N4',
  '菜': 'N4', '心': 'N4', '思': 'N4', '知': 'N4', '答': 'N4',
  '家族': 'N4', '兄弟': 'N4', '病院': 'N4', '医者': 'N4',
  '教室': 'N4', '場所': 'N4', '旅行': 'N4', '写真': 'N4',
  '勉強': 'N4', '仕事': 'N4', '買い物': 'N4', '散歩': 'N4',
  '教える': 'N4', '習う': 'N4', '始まる': 'N4', '終わる': 'N4',
  '考える': 'N4', '覚える': 'N4', '忘れる': 'N4', '起きる': 'N4',

  // N3 (Intermedio)
  '願': 'N3', '願い': 'N3', '願う': 'N3',
  '政': 'N3', '治': 'N3', '経': 'N3', '済': 'N3', '歴': 'N3',
  '史': 'N3', '文': 'N3', '化': 'N3', '求': 'N3', '望': 'N3',
  '政治': 'N3', '経済': 'N3', '歴史': 'N3', '文化': 'N3',
  '社会': 'N3', '関係': 'N3', '経験': 'N3', '準備': 'N3',
  '連絡': 'N3', '案内': 'N3', '紹介': 'N3', '相談': 'N3',

  // N2 & N1 (Avanzado)
  '環境': 'N2', '影響': 'N2', '発展': 'N2', '国際': 'N2',
  '意識': 'N1', '概念': 'N1', '構造': 'N1', '傾向': 'N1',
};

/**
 * Busca de forma instantánea el nivel JLPT exclusivo de una PALABRA COMPLETA.
 * No asigna el nivel de Kanjis individuales a palabras compuestas.
 */
export function getQuickJlptLevel(word: string): string | undefined {
  if (!word) return undefined;
  const trimmed = word.trim();

  // Coincidencia exacta de palabra completa
  if (JLPT_DICTIONARY[trimmed]) {
    return JLPT_DICTIONARY[trimmed];
  }

  // Coincidencia removiendo prefijo honorífico
  const withoutHonorific = trimmed.replace(/^[おご]/, '');
  if (JLPT_DICTIONARY[withoutHonorific]) {
    return JLPT_DICTIONARY[withoutHonorific];
  }

  return undefined;
}

/**
 * Busca el nivel JLPT de un KANJI individual para el desglose.
 */
export function getKanjiJlptLevel(char: string): string | undefined {
  if (!char) return undefined;
  return JLPT_DICTIONARY[char.trim()];
}
