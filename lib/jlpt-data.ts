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
  '間': 'N5', '外': 'N5', '毎': 'N5', '多': 'N5', '少': 'N5',
  '午': 'N5', '駅': 'N5',
  
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
  '都': 'N4', '寺': 'N4', '銀': 'N4', '病': 'N4',
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

export interface KanjiReadingDetail {
  essential: string; // Lectura esencial/cotidiana en Hiragana para N5 (ej: "やま", "なに")
  on?: string;        // Lectura On'yomi canónica (ej: "サン")
  kun?: string;       // Lectura Kun'yomi canónica (ej: "やま")
  meaning?: string;   // Significado representativo en español
  level: string;      // 'N5' | 'N4'
}

/**
 * Catálogo canónico y offline de los 103 Kanjis de JLPT N5 (+ comunes N4)
 * con su lectura esencial de vocabulario y desglose On/Kun.
 */
export const JLPT_KANJI_READINGS: Record<string, KanjiReadingDetail> = {
  // Números y contadores
  '一': { essential: 'いち', on: 'イチ', kun: 'ひと・つ', meaning: 'uno', level: 'N5' },
  '二': { essential: 'に', on: 'ニ', kun: 'ふた・つ', meaning: 'dos', level: 'N5' },
  '三': { essential: 'さん', on: 'サン', kun: 'みっ・つ', meaning: 'tres', level: 'N5' },
  '四': { essential: 'よん', on: 'シ', kun: 'よっ・つ, よん', meaning: 'cuatro', level: 'N5' },
  '五': { essential: 'ご', on: 'ゴ', kun: 'いつ・つ', meaning: 'cinco', level: 'N5' },
  '六': { essential: 'ろく', on: 'ロク', kun: 'むっ・つ', meaning: 'seis', level: 'N5' },
  '七': { essential: 'なな', on: 'シチ', kun: 'なな・つ', meaning: 'siete', level: 'N5' },
  '八': { essential: 'はち', on: 'ハチ', kun: 'やっ・つ', meaning: 'ocho', level: 'N5' },
  '九': { essential: 'きゅう', on: 'キュウ, ク', kun: 'ここの・つ', meaning: 'nueve', level: 'N5' },
  '十': { essential: 'じゅう', on: 'ジュウ', kun: 'とお', meaning: 'diez', level: 'N5' },
  '百': { essential: 'ひゃく', on: 'ヒャク', meaning: 'cien', level: 'N5' },
  '千': { essential: 'せん', on: 'セン', kun: 'ち', meaning: 'mil', level: 'N5' },
  '万': { essential: 'まん', on: 'マン, バン', meaning: 'diez mil', level: 'N5' },
  '円': { essential: 'えん', on: 'エン', kun: 'まる・い', meaning: 'yen, círculo', level: 'N5' },

  // Naturaleza, elementos y tiempo
  '日': { essential: 'ひ', on: 'ニチ, ジツ', kun: 'ひ, -び, -か', meaning: 'día, sol', level: 'N5' },
  '月': { essential: 'つき', on: 'ゲツ, ガツ', kun: 'つき', meaning: 'mes, luna', level: 'N5' },
  '火': { essential: 'ひ', on: 'カ', kun: 'ひ', meaning: 'fuego', level: 'N5' },
  '水': { essential: 'みず', on: 'スイ', kun: 'みず', meaning: 'agua', level: 'N5' },
  '木': { essential: 'き', on: 'モク, ボク', kun: 'き', meaning: 'árbol, madera', level: 'N5' },
  '金': { essential: 'かね', on: 'キン, コン', kun: 'かね', meaning: 'dinero, oro', level: 'N5' },
  '土': { essential: 'つち', on: 'ド, ト', kun: 'つち', meaning: 'tierra, suelo', level: 'N5' },
  '山': { essential: 'やま', on: 'サン', kun: 'やま', meaning: 'montaña', level: 'N5' },
  '川': { essential: 'かわ', on: 'セン', kun: 'かわ', meaning: 'río', level: 'N5' },
  '花': { essential: 'はな', on: 'カ', kun: 'はな', meaning: 'flor', level: 'N5' },
  '雨': { essential: 'あめ', on: 'ウ', kun: 'あめ', meaning: 'lluvia', level: 'N5' },
  '天': { essential: 'てん', on: 'テン', kun: 'あま', meaning: 'cielo, celestial', level: 'N5' },
  '気': { essential: 'き', on: 'キ, ケ', meaning: 'espíritu, energía', level: 'N5' },
  '空': { essential: 'そら', on: 'クウ', kun: 'そら, あ・く', meaning: 'cielo, aire', level: 'N5' },

  // Tiempo cronológico
  '年': { essential: 'とし', on: 'ネン', kun: 'とし', meaning: 'año', level: 'N5' },
  '今': { essential: 'いま', on: 'コン, キン', kun: 'いま', meaning: 'ahora', level: 'N5' },
  '時': { essential: 'とき', on: 'ジ', kun: 'とき', meaning: 'tiempo, hora', level: 'N5' },
  '分': { essential: 'ふん', on: 'ブン, フン', kun: 'わ・ける', meaning: 'minuto, parte', level: 'N5' },
  '半': { essential: 'はん', on: 'ハン', kun: 'なか・ば', meaning: 'mitad', level: 'N5' },
  '午': { essential: 'ご', on: 'ゴ', meaning: 'mediodía', level: 'N5' },
  '毎': { essential: 'まい', on: 'マイ', meaning: 'cada', level: 'N5' },
  '間': { essential: 'あいだ', on: 'カン, ケン', kun: 'あいだ, ま', meaning: 'intervalo, entre', level: 'N5' },

  // Personas y relaciones
  '人': { essential: 'ひと', on: 'ジン, ニン', kun: 'ひと', meaning: 'persona', level: 'N5' },
  '男': { essential: 'おとこ', on: 'ダン, ナン', kun: 'おとこ', meaning: 'hombre', level: 'N5' },
  '女': { essential: 'おんな', on: 'ジョ', kun: 'おんな', meaning: 'mujer', level: 'N5' },
  '子': { essential: 'こ', on: 'シ, ス', kun: 'こ', meaning: 'niño, hijo', level: 'N5' },
  '父': { essential: 'ちち', on: 'フ', kun: 'ちち', meaning: 'padre', level: 'N5' },
  '母': { essential: 'はは', on: 'ボ', kun: 'はは', meaning: 'madre', level: 'N5' },
  '友': { essential: 'とも', on: 'ユウ', kun: 'とも', meaning: 'amigo', level: 'N5' },

  // Animales y comida
  '魚': { essential: 'さかな', on: 'ギョ', kun: 'さかな, うお', meaning: 'pescado, pez', level: 'N5' },
  '肉': { essential: 'にく', on: 'ニク', meaning: 'carne', level: 'N5' },
  '犬': { essential: 'いぬ', on: 'ケン', kun: 'いぬ', meaning: 'perro', level: 'N5' },

  // Partes del cuerpo
  '口': { essential: 'くち', on: 'コウ, ク', kun: 'くち', meaning: 'boca', level: 'N5' },
  '目': { essential: 'め', on: 'モク', kun: 'め', meaning: 'ojo', level: 'N5' },
  '耳': { essential: 'みみ', on: 'ジ', kun: 'みみ', meaning: 'oreja', level: 'N5' },
  '手': { essential: 'て', on: 'シュ', kun: 'て', meaning: 'mano', level: 'N5' },
  '足': { essential: 'あし', on: 'ソク', kun: 'あし, た・りる', meaning: 'pie, pierna', level: 'N5' },

  // Posiciones y direcciones
  '上': { essential: 'うえ', on: 'ジョウ', kun: 'うえ, あ・がる', meaning: 'arriba, sobre', level: 'N5' },
  '下': { essential: 'した', on: 'カ, ゲ', kun: 'した, さ・がる', meaning: 'abajo, debajo', level: 'N5' },
  '左': { essential: 'ひだり', on: 'サ', kun: 'ひだり', meaning: 'izquierda', level: 'N5' },
  '右': { essential: 'みぎ', on: 'ウ, ユウ', kun: 'みぎ', meaning: 'derecha', level: 'N5' },
  '中': { essential: 'なか', on: 'チュウ', kun: 'なか', meaning: 'dentro, centro', level: 'N5' },
  '前': { essential: 'まえ', on: 'ゼン', kun: 'まえ', meaning: 'delante, antes', level: 'N5' },
  '後': { essential: 'あと', on: 'ゴ, コウ', kun: 'のち, うし・ろ, あと', meaning: 'detrás, después', level: 'N5' },
  '東': { essential: 'ひがし', on: 'トウ', kun: 'ひがし', meaning: 'este (oriente)', level: 'N5' },
  '西': { essential: 'にし', on: 'セイ, サイ', kun: 'にし', meaning: 'oeste (occidente)', level: 'N5' },
  '南': { essential: 'みなみ', on: 'ナン', kun: 'みなみ', meaning: 'sur', level: 'N5' },
  '北': { essential: 'きた', on: 'ホク', kun: 'きた', meaning: 'norte', level: 'N5' },
  '外': { essential: 'そと', on: 'ガイ, ゲ', kun: 'そと, ほか', meaning: 'fuera, exterior', level: 'N5' },

  // Objetos, sociedad y lugares
  '本': { essential: 'ほん', on: 'ホン', kun: 'もと', meaning: 'libro, base', level: 'N5' },
  '何': { essential: 'なに', on: 'カ', kun: 'なに, なん', meaning: 'qué', level: 'N5' },
  '車': { essential: 'くるま', on: 'シャ', kun: 'くるま', meaning: 'coche, vehículo', level: 'N5' },
  '電': { essential: 'でん', on: 'デン', kun: '', meaning: 'electricidad', level: 'N5' },
  '門': { essential: 'もん', on: 'モン', kun: 'かど', meaning: 'puerta, portón', level: 'N5' },
  '道': { essential: 'みち', on: 'ドウ', kun: 'みち', meaning: 'camino, calle', level: 'N5' },
  '駅': { essential: 'えき', on: 'エキ', meaning: 'estación', level: 'N5' },
  '社': { essential: 'しゃ', on: 'シャ', kun: 'やしろ', meaning: 'compañía, santuario', level: 'N5' },
  '会': { essential: 'かい', on: 'カイ', kun: 'あ・う', meaning: 'reunión, encontrarse', level: 'N5' },
  '店': { essential: 'みせ', on: 'テン', kun: 'みせ', meaning: 'tienda', level: 'N5' },
  '国': { essential: 'くに', on: 'コク', kun: 'くに', meaning: 'país', level: 'N5' },
  '校': { essential: 'こう', on: 'コウ', meaning: 'escuela', level: 'N5' },
  '名': { essential: 'な', on: 'メイ, ミョウ', kun: 'な', meaning: 'nombre', level: 'N5' },
  '語': { essential: 'ご', on: 'ゴ', kun: 'かた・る', meaning: 'idioma, palabra', level: 'N5' },

  // Adjetivos
  '大': { essential: 'おおきい', on: 'ダイ, タイ', kun: 'おお・きい', meaning: 'grande', level: 'N5' },
  '小': { essential: 'ちいさい', on: 'ショウ', kun: 'ちい・さい', meaning: 'pequeño', level: 'N5' },
  '長': { essential: 'ながい', on: 'チョウ', kun: 'なが・い', meaning: 'largo, líder', level: 'N5' },
  '高': { essential: 'たかい', on: 'コウ', kun: 'たか・い', meaning: 'alto, caro', level: 'N5' },
  '安': { essential: 'やすい', on: 'アン', kun: 'やす・い', meaning: 'barato, tranquilo', level: 'N5' },
  '新': { essential: 'あたらしい', on: 'シン', kun: 'あたら・しい', meaning: 'nuevo', level: 'N5' },
  '古': { essential: 'ふるい', on: 'コ', kun: 'ふる・い', meaning: 'viejo, antiguo', level: 'N5' },
  '多': { essential: 'おおい', on: 'タ', kun: 'おお・い', meaning: 'mucho', level: 'N5' },
  '少': { essential: 'すくない', on: 'ショウ', kun: 'すく・ない, すこ・し', meaning: 'poco', level: 'N5' },
  '白': { essential: 'しろ', on: 'ハク', kun: 'しろ, しろ・い', meaning: 'blanco', level: 'N5' },
  '黒': { essential: 'くろ', on: 'コク', kun: 'くろ, くろ・い', meaning: 'negro', level: 'N5' },
  '赤': { essential: 'あか', on: 'セキ', kun: 'あか, あか・い', meaning: 'rojo', level: 'N5' },
  '青': { essential: 'あお', on: 'セイ', kun: 'あお, あお・い', meaning: 'azul', level: 'N5' },

  // Verbos y acciones básicas
  '見': { essential: 'みる', on: 'ケン', kun: 'み・る', meaning: 'ver, mirar', level: 'N5' },
  '行': { essential: 'いく', on: 'コウ, ギョウ', kun: 'い・く, ゆ・く', meaning: 'ir', level: 'N5' },
  '来': { essential: 'くる', on: 'ライ', kun: 'く・る', meaning: 'venir', level: 'N5' },
  '食': { essential: 'たべる', on: 'ショク', kun: 'た・べる', meaning: 'comer', level: 'N5' },
  '飲': { essential: 'のむ', on: 'イン', kun: 'の・む', meaning: 'beber', level: 'N5' },
  '買': { essential: 'かう', on: 'バイ', kun: 'か・う', meaning: 'comprar', level: 'N5' },
  '聞': { essential: 'きく', on: 'ブン, モン', kun: 'き・く', meaning: 'escuchar, oír', level: 'N5' },
  '読': { essential: 'よむ', on: 'ドク', kun: 'よ・む', meaning: 'leer', level: 'N5' },
  '書': { essential: 'かく', on: 'ショ', kun: 'か・く', meaning: 'escribir', level: 'N5' },
  '話': { essential: 'はなす', on: 'ワ', kun: 'はな・す, はなし', meaning: 'hablar', level: 'N5' },
  '出': { essential: 'でる', on: 'シュツ', kun: 'で・る, だ・す', meaning: 'salir', level: 'N5' },
  '入': { essential: 'はいる', on: 'ニュウ', kun: 'はい・る, い・れる', meaning: 'entrar', level: 'N5' },
  '立': { essential: 'たつ', on: 'リツ', kun: 'た・つ', meaning: 'levantarse, estar de pie', level: 'N5' },
  '休': { essential: 'やすむ', on: 'キュウ', kun: 'やす・む', meaning: 'descansar', level: 'N5' },
  '言': { essential: 'いう', on: 'ゲン, ゴン', kun: 'い・う', meaning: 'decir', level: 'N5' },
  '学': { essential: 'がく', on: 'ガク', kun: 'まな・ぶ', meaning: 'estudiar, aprender', level: 'N5' },
  '生': { essential: 'せい', on: 'セイ, ショウ', kun: 'い・きる, う・まれる, なま', meaning: 'vida, nacer', level: 'N5' },
  '先': { essential: 'さき', on: 'セン', kun: 'さき', meaning: 'anterior, punta', level: 'N5' },

  // N4 Comunes esenciales
  '家': { essential: 'いえ', on: 'カ, ケ', kun: 'いえ, や', meaning: 'casa', level: 'N4' },
  '私': { essential: 'わたし', on: 'シ', kun: 'わたし, わたくし', meaning: 'yo, privado', level: 'N4' },
  '町': { essential: 'まち', on: 'チョウ', kun: 'まち', meaning: 'pueblo, ciudad', level: 'N4' },
  '村': { essential: 'むら', on: 'ソン', kun: 'むら', meaning: 'aldea', level: 'N4' },
  '海': { essential: 'うみ', on: 'カイ', kun: 'うみ', meaning: 'mar', level: 'N4' },
  '野': { essential: 'の', on: 'ヤ', kun: 'の', meaning: 'campo, silvestre', level: 'N4' },
  '心': { essential: 'こころ', on: 'シン', kun: 'こころ', meaning: 'corazón, mente', level: 'N4' },
  '思': { essential: 'おもう', on: 'シ', kun: 'おも・う', meaning: 'pensar', level: 'N4' },
  '知': { essential: 'しる', on: 'チ', kun: 'し・る', meaning: 'saber, conocer', level: 'N4' },
  '答': { essential: 'こたえ', on: 'トウ', kun: 'こた・える, こたえ', meaning: 'respuesta', level: 'N4' },
};

/**
 * Deduce de forma inteligente la lectura esencial y el desglose de un Kanji individual.
 * - Si el Kanji está en el catálogo canónico (N5/N4), usa su lectura estándar cotidiana.
 * - Si no está en catálogo pero tiene Kun'yomi, extrae el Kun'yomi limpio como lectura principal de carácter independiente.
 * - Si solo tiene On'yomi, usa el On'yomi limpio.
 */
export function getKanjiEssentialReading(
  kanji: string,
  rawOn?: string,
  rawKun?: string
): {
  essentialReading: string;
  kanjiReadings?: string;
  onReading?: string;
  kunReading?: string;
} {
  const cleanChar = (kanji || '').trim();
  const entry = JLPT_KANJI_READINGS[cleanChar];

  const cleanOn = (rawOn || entry?.on || '').replace(/[・]/g, '').trim();
  const cleanKun = (rawKun || entry?.kun || '').replace(/[・]/g, '').trim();

  let kanjiReadings: string | undefined = undefined;
  if (cleanOn && cleanKun) {
    kanjiReadings = `On: ${cleanOn}  •  Kun: ${cleanKun}`;
  } else if (cleanOn) {
    kanjiReadings = `On: ${cleanOn}`;
  } else if (cleanKun) {
    kanjiReadings = `Kun: ${cleanKun}`;
  }

  // 1. Si está en el catálogo canónico de JLPT N5 / N4
  if (entry) {
    return {
      essentialReading: entry.essential,
      kanjiReadings,
      onReading: cleanOn || entry.on,
      kunReading: cleanKun || entry.kun,
    };
  }

  // 2. Heurística general para caracteres no catalogados:
  // En japonés, un kanji aislado como palabra casi siempre toma su Kun'yomi (limpio de okurigana)
  if (cleanKun) {
    // Tomar la primera variante antes de comas o barras
    const firstKun = cleanKun.split(/[,、\/\s]/)[0] || '';
    // Limpiar okurigana marcado con punto medio o guion (ej. "た・べる" -> "たべる", "-び" -> "び")
    const normalizedKun = firstKun.replace(/[・\-\~]/g, '').trim();
    if (normalizedKun.length > 0) {
      return {
        essentialReading: normalizedKun,
        kanjiReadings,
        onReading: cleanOn || undefined,
        kunReading: cleanKun || undefined,
      };
    }
  }

  // 3. Si solo tiene On'yomi
  if (cleanOn) {
    const firstOn = cleanOn.split(/[,、\/\s]/)[0] || '';
    const normalizedOn = firstOn.replace(/[・\-\~]/g, '').trim();
    if (normalizedOn.length > 0) {
      return {
        essentialReading: normalizedOn,
        kanjiReadings,
        onReading: cleanOn || undefined,
        kunReading: cleanKun || undefined,
      };
    }
  }

  return {
    essentialReading: cleanChar,
    kanjiReadings,
    onReading: cleanOn || undefined,
    kunReading: cleanKun || undefined,
  };
}

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


