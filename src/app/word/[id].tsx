import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { ClipPath, Defs, G, Path, Text as SvgText } from 'react-native-svg';
import { State } from 'ts-fsrs';
import { speakText } from '../../../lib/audio-service';
import { getQuickHskLevel } from '../../../lib/hsk-data';
import { cleanAndFormatMeanings, extractKanjis, parseFurigana } from '../../../lib/japanese-search';
import { classifyJapaneseWord } from '../../../lib/japanese-utils';
import { getKanjiJlptLevel, getQuickJlptLevel } from '../../../lib/jlpt-data';
import { getStorageItem, setStorageItem } from '../../../lib/storage-service';
import {
  CompoundWord,
  deleteWord,
  getCompoundWordsForChar,
  getWordDetailWithRelations,
  WordDetailWithRelations,
  updateWordSelectedMeanings,
  deleteWordMeaning,
  updateWordMeaningText,
} from '../../../lib/word-service';
import { useTheme } from '../../../providers/ThemeProvider';
import { Shadows, Spacing, Typography } from '../../constants/theme';

function getKanjiHex(char: string): string {
  if (!char) return '';
  const code = char.charCodeAt(0).toString(16).toLowerCase();
  return code.padStart(5, '0');
}

function extractPathsFromSvg(xmlText: string): string[] {
  if (!xmlText) return [];
  const paths: string[] = [];
  const dRegex = /\bd=["']([^"']+)["']/gi;
  let match;
  while ((match = dRegex.exec(xmlText)) !== null) {
    const dVal = match[1] ? match[1].trim() : '';
    if (
      dVal.length > 5 &&
      !dVal.startsWith('M0,0') &&
      !dVal.startsWith('M0 0') &&
      !dVal.includes('h109') &&
      !dVal.includes('H109') &&
      !/z\s*$/i.test(dVal) // Excluir contornos cerrados de relleno (Z / z)
    ) {
      paths.push(dVal);
    }
  }

  // Fallback si la fuente sólo contiene curvas cerradas
  if (paths.length === 0) {
    let fallbackMatch;
    const fallbackRegex = /\bd=["']([^"']+)["']/gi;
    while ((fallbackMatch = fallbackRegex.exec(xmlText)) !== null) {
      const dVal = fallbackMatch[1] ? fallbackMatch[1].trim() : '';
      if (
        dVal.length > 5 &&
        !dVal.startsWith('M0,0') &&
        !dVal.startsWith('M0 0') &&
        !dVal.includes('h109') &&
        !dVal.includes('H109')
      ) {
        paths.push(dVal);
      }
    }
  }

  return paths;
}

function extractTextsFromSvg(xmlText: string): { text: string; x: string; y: string }[] {
  if (!xmlText) return [];
  const texts: { text: string; x: string; y: string }[] = [];
  const matrixRegex = /transform=["']matrix\(1 0 0 1 ([0-9.]+) ([0-9.]+)\)["'][^>]*>([0-9]+)<\/text>/gi;
  let match;
  while ((match = matrixRegex.exec(xmlText)) !== null) {
    texts.push({ x: match[1], y: match[2], text: match[3] });
  }

  if (texts.length === 0) {
    const xyRegex = /<text[^>]*x=["']([0-9.]+)["'][^>]*y=["']([0-9.]+)["'][^>]*>([0-9]+)<\/text>/gi;
    while ((match = xyRegex.exec(xmlText)) !== null) {
      texts.push({ x: match[1], y: match[2], text: match[3] });
    }
  }
  return texts;
}

function extractViewBoxFromSvg(xmlText: string): string {
  const match = /viewBox=["']([^"']+)["']/i.exec(xmlText);
  if (match && match[1]) {
    return match[1].trim();
  }
  return '0 0 109 109';
}

function extractKanjiVgPaths(xmlText: string): { paths: string[]; texts: { text: string; x: string; y: string }[] } {
  if (!xmlText) return { paths: [], texts: [] };
  const paths: string[] = [];
  const texts: { text: string; x: string; y: string }[] = [];

  // Extraer trazos por id de secuencia (ej. kvg:04f60-s1, -s2...)
  const pathRegex = /<path[^>]*\bid=["'][^"']*-s([0-9]+)["'][^>]*\bd=["']([^"']+)["']/gi;
  let match;
  while ((match = pathRegex.exec(xmlText)) !== null) {
    const dVal = match[2] ? match[2].trim() : '';
    if (dVal.length > 5) {
      paths.push(dVal);
    }
  }

  // Fallback si no usan id -s1
  if (paths.length === 0) {
    const strokeGroupMatch = /<g[^>]*id=["'][^"']*StrokePaths[^"']*["'][^>]*>([\s\S]*?)<\/g>/i.exec(xmlText);
    const targetXml = strokeGroupMatch ? strokeGroupMatch[1] : xmlText;
    const dRegex = /\bd=["']([^"']+)["']/gi;
    let dMatch;
    while ((dMatch = dRegex.exec(targetXml)) !== null) {
      const dVal = dMatch[1] ? dMatch[1].trim() : '';
      if (
        dVal.length > 5 &&
        !dVal.startsWith('M0,0') &&
        !dVal.startsWith('M0 0') &&
        !dVal.includes('h109') &&
        !dVal.includes('H109')
      ) {
        paths.push(dVal);
      }
    }
  }

  // Extraer números de orden
  const matrixRegex = /transform=["']matrix\(1 0 0 1 ([0-9.]+) ([0-9.]+)\)["'][^>]*>([0-9]+)<\/text>/gi;
  let tMatch;
  while ((tMatch = matrixRegex.exec(xmlText)) !== null) {
    texts.push({ x: tMatch[1], y: tMatch[2], text: tMatch[3] });
  }

  return { paths, texts };
}

// Calcula la longitud euclidiana acumulada de un path compuesto por segmentos (M x y L x y...)
function getPolylineLength(d: string): number {
  if (!d) return 1000;
  const nums = d.match(/[-+]?[0-9]*\.?[0-9]+/g);
  if (!nums || nums.length < 4) return 1000;
  let total = 0;
  for (let i = 2; i < nums.length; i += 2) {
    const x1 = parseFloat(nums[i - 2]);
    const y1 = parseFloat(nums[i - 1]);
    const x2 = parseFloat(nums[i]);
    const y2 = parseFloat(nums[i + 1]);
    total += Math.hypot(x2 - x1, y2 - y1);
  }
  return Math.max(total, 100);
}

// Extrae los paths de AnimCJK (parsimonhi/animCJK) basado en la estructura REAL del SVG:
//   path[id="z{code}d{n}"]            → rellenos de fondo (usados como clip shapes)
//   <defs><clipPath id="z{code}c{n}"> → referencia el fondo via <use href="#z{code}d{n}"/>
//   path[clip-path="url(#z{code}c{n})"] d="M... L..."  → paths simples animados (los que queremos)
function extractAnimCjkPaths(xmlText: string): { paths: string[]; clipPaths: string[]; viewBox: string } {
  const viewBoxMatch = xmlText.match(/viewBox="([^"]+)"/);
  const viewBox = viewBoxMatch ? viewBoxMatch[1] : '0 0 1024 1024';

  const flat = xmlText.replace(/\r?\n/g, ' ');

  // 1. Extraer background paths: id="z{code}d{n}" → usados como clip shapes
  //    Regex: id="z20013d1" ... d="..."
  const bgPathMap: Record<number, string> = {};
  const bgRegex = /id="z\d+d(\d+)"[^>]*d="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = bgRegex.exec(flat)) !== null) {
    bgPathMap[parseInt(m[1], 10)] = m[2];
  }
  // Fallback: si d viene antes del id
  const bgRegex2 = /\bd="([^"]+)"[^>]*id="z\d+d(\d+)"/g;
  while ((m = bgRegex2.exec(flat)) !== null) {
    const n = parseInt(m[2], 10);
    if (!bgPathMap[n]) bgPathMap[n] = m[1];
  }

  // 2. Extraer animated paths: clip-path="url(#z{code}c{n})" d="simple line"
  //    El id de clipPath usa "c" (no "d"): z20013c1, z20013c2...
  const animMap: Record<number, string> = {};
  // Buscar atributo clip-path con "c" seguido de número
  const cpAnimRegex = /clip-path="url\(#z\d+c(\d+)\)"[^>]*\bd="([^"]+)"/g;
  while ((m = cpAnimRegex.exec(flat)) !== null) {
    animMap[parseInt(m[1], 10)] = m[2];
  }
  // Fallback: d antes de clip-path
  const cpAnimRegex2 = /\bd="([^"]+)"[^/]*clip-path="url\(#z\d+c(\d+)\)"/g;
  while ((m = cpAnimRegex2.exec(flat)) !== null) {
    const n = parseInt(m[2], 10);
    if (!animMap[n]) animMap[n] = m[1];
  }

  // 3. Combinar por numero de trazo (bg paths d{n} con animated paths c{n})
  const strokeNums = Object.keys(animMap)
    .map(k => parseInt(k, 10))
    .filter(n => bgPathMap[n])
    .sort((a, b) => a - b);

  return {
    paths: strokeNums.map(n => animMap[n]),
    clipPaths: strokeNums.map(n => bgPathMap[n]),
    viewBox,
  };
}

async function fetchAndParseStrokeSvg(char: string, isChinese: boolean = false): Promise<{ paths: string[]; clipPaths: string[]; texts: { text: string; x: string; y: string }[]; viewBox: string; strokeType: 'kanjivg' | 'animcjk' }> {
  if (!char) return { paths: [], clipPaths: [], texts: [], viewBox: '0 0 109 109', strokeType: 'kanjivg' };
  const hex4 = char.charCodeAt(0).toString(16).toLowerCase();
  const hex5 = hex4.padStart(5, '0');
  const decCode = char.charCodeAt(0);

  // Si es Hanzi (Chino), consultar EXCLUSIVAMENTE AnimCJK para mantener coherencia en todos los caracteres
  if (isChinese) {
    const animCjkUrls = [
      `https://raw.githubusercontent.com/parsimonhi/animCJK/master/svgsZhHans/${decCode}.svg`,
      `https://raw.githubusercontent.com/parsimonhi/animCJK/master/svgsJa/${decCode}.svg`,
      `https://raw.githubusercontent.com/parsimonhi/animCJK/master/svgsZhHant/${decCode}.svg`,
      `https://cdn.jsdelivr.net/gh/parsimonhi/animCJK@master/svgsZhHans/${decCode}.svg`,
      `https://cdn.jsdelivr.net/gh/parsimonhi/animCJK@master/svgsJa/${decCode}.svg`,
    ];
    for (const url of animCjkUrls) {
      try {
        const res = await fetch(url, { headers: { Accept: 'text/plain, image/svg+xml, */*' } });
        if (res.ok) {
          const xmlText = await res.text();
          const { paths, clipPaths, viewBox } = extractAnimCjkPaths(xmlText);
          if (paths.length > 0) {
            return { paths, clipPaths, texts: [], viewBox, strokeType: 'animcjk' };
          }
        }
      } catch (e) { }
    }
    return { paths: [], clipPaths: [], texts: [], viewBox: '0 0 1024 1024', strokeType: 'animcjk' };
  }

  // Si es Kanji (Japonés), consultar primero KanjiVG
  const kvgUrls = [
    `https://cdn.jsdelivr.net/gh/KanjiVG/kanjivg@master/kanji/${hex5}.svg`,
    `https://cdn.jsdelivr.net/gh/KanjiVG/kanjivg@master/kanji/${hex4}.svg`,
    `https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/${hex5}.svg`,
    `https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/${hex4}.svg`,
  ];
  for (const url of kvgUrls) {
    try {
      const res = await fetch(url, { headers: { Accept: 'text/plain, image/svg+xml, */*' } });
      if (res.ok) {
        const xmlText = await res.text();
        const { paths, texts } = extractKanjiVgPaths(xmlText);
        if (paths.length > 0) {
          return { paths, clipPaths: [], texts, viewBox: '0 0 109 109', strokeType: 'kanjivg' };
        }
      }
    } catch (e) { }
  }

  // Fallback para japonés en caso de no encontrarse en KanjiVG
  const jaFallbackUrls = [
    `https://raw.githubusercontent.com/parsimonhi/animCJK/master/svgsJa/${decCode}.svg`,
    `https://cdn.jsdelivr.net/gh/parsimonhi/animCJK@master/svgsJa/${decCode}.svg`,
  ];
  for (const url of jaFallbackUrls) {
    try {
      const res = await fetch(url, { headers: { Accept: 'text/plain, image/svg+xml, */*' } });
      if (res.ok) {
        const xmlText = await res.text();
        const { paths, clipPaths, viewBox } = extractAnimCjkPaths(xmlText);
        if (paths.length > 0) {
          return { paths, clipPaths, texts: [], viewBox, strokeType: 'animcjk' };
        }
      }
    } catch (e) { }
  }

  return { paths: [], clipPaths: [], texts: [], viewBox: '0 0 109 109', strokeType: 'kanjivg' };
}

function autoDetectViewBox(paths: string[], defaultViewBox: string): string {
  if (defaultViewBox && defaultViewBox.trim().length > 0) return defaultViewBox;
  return '0 0 109 109';
}


function UniversalKanjiStrokePlayer({ char, primaryColor, textMutedColor, isChinese = false }: { char: string; primaryColor: string; textMutedColor: string; isChinese?: boolean }) {
  const [svgPaths, setSvgPaths] = useState<string[]>([]);
  const [svgClipPaths, setSvgClipPaths] = useState<string[]>([]);
  const [kanjiTexts, setKanjiTexts] = useState<{ text: string; x: string; y: string }[]>([]);
  const [svgViewBox, setSvgViewBox] = useState<string>('0 0 109 109');
  const [svgStrokeType, setSvgStrokeType] = useState<'kanjivg' | 'animcjk'>(isChinese ? 'animcjk' : 'kanjivg');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [activeStrokeIndex, setActiveStrokeIndex] = useState(0);
  const [strokeProgress, setStrokeProgress] = useState(0); // 0..1 progreso dentro del trazo actual

  const hexCode = getKanjiHex(char);

  useEffect(() => {
    let isMounted = true;
    async function loadSvg() {
      setLoading(true);
      setError(false);
      const cacheKey = `yomi_stroke_${isChinese ? 'hanzi' : 'kanji'}_v14_${hexCode}`;
      try {
        const cached = await getStorageItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed && Array.isArray(parsed.paths) && parsed.paths.length > 0) {
            if (isMounted) {
              const detectedBox = autoDetectViewBox(parsed.paths, parsed.viewBox);
              setSvgPaths(parsed.paths);
              setSvgClipPaths(parsed.clipPaths || []);
              setKanjiTexts(parsed.texts || []);
              setSvgViewBox(detectedBox);
              setSvgStrokeType(parsed.strokeType || (isChinese ? 'animcjk' : 'kanjivg'));
              setActiveStrokeIndex(0);
              setStrokeProgress(0);
              setLoading(false);
            }
            return;
          }
        }
      } catch (e) { }

      const { paths, clipPaths, texts, viewBox, strokeType } = await fetchAndParseStrokeSvg(char, isChinese);

      if (isMounted) {
        if (paths.length > 0) {
          const detectedBox = autoDetectViewBox(paths, viewBox);
          setSvgPaths(paths);
          setSvgClipPaths(clipPaths);
          setKanjiTexts(texts);
          setSvgViewBox(detectedBox);
          setSvgStrokeType(strokeType);
          setActiveStrokeIndex(0);
          setStrokeProgress(0);
          setStorageItem(cacheKey, JSON.stringify({ paths, clipPaths, texts, viewBox: detectedBox, strokeType }));
        } else {
          setError(true);
        }
        setLoading(false);
      }
    }
    loadSvg();
    return () => {
      isMounted = false;
    };
  }, [char, hexCode, isChinese]);

  // Animación 60 FPS: strokeProgress 0→1 por cada trazo, luego avanza al siguiente
  useEffect(() => {
    if (svgPaths.length === 0) return;
    let animFrame: number;
    let startTime: number | null = null;
    const durationPerStroke = svgStrokeType === 'animcjk' ? 850 : 1050; // ms por trazo (750ms para chino, ágil y natural)
    const pauseAtEnd = 1500;
    const totalAnimationTime = (svgPaths.length * durationPerStroke) + pauseAtEnd;

    function animate(time: number) {
      if (!startTime) startTime = time;
      let elapsed = time - startTime;

      if (elapsed >= totalAnimationTime) {
        startTime = time;
        elapsed = 0;
      }

      if (elapsed < svgPaths.length * durationPerStroke) {
        const strokeIdx = Math.floor(elapsed / durationPerStroke);
        const progress = (elapsed % durationPerStroke) / durationPerStroke;
        setActiveStrokeIndex(strokeIdx);
        setStrokeProgress(progress);
      } else {
        setActiveStrokeIndex(svgPaths.length - 1);
        setStrokeProgress(1);
      }

      animFrame = requestAnimationFrame(animate);
    }

    animFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animFrame);
  }, [svgPaths.length, svgStrokeType]);

  if (loading) {
    return (
      <View style={styles.animatorContainer}>
        <ActivityIndicator size="large" color={primaryColor} />
        <Text style={[styles.animatorSub, { color: textMutedColor }]}>Cargando trazado de {char}...</Text>
      </View>
    );
  }

  if (error || svgPaths.length === 0) {
    return (
      <View style={styles.animatorContainer}>
        <Text style={styles.animatorError}>Trazado no disponible para este carácter</Text>
      </View>
    );
  }

  const isAnimCjk = svgStrokeType === 'animcjk';

  return (
    <View style={styles.animatorContainer}>
      <View style={styles.animatorCanvasBox}>
        <Svg width={190} height={190} viewBox={svgViewBox}>
          {/* AnimCJK: Defs estables con todos los ClipPaths disponibles */}
          {isAnimCjk && (
            <Defs>
              {svgClipPaths.map((cp, idx) => (
                <ClipPath key={idx} id={`acp_${idx}`}>
                  <Path d={cp} />
                </ClipPath>
              ))}
            </Defs>
          )}
          <G>
            {svgPaths.map((dStr, idx) => {
              if (idx > activeStrokeIndex) return null;
              const isCurrent = idx === activeStrokeIndex;
              const strokeLen = isAnimCjk ? Math.round(getPolylineLength(dStr) * 1.1) : 600;
              const dashoffset = isCurrent ? strokeLen * (1 - strokeProgress) : 0;

              if (isAnimCjk) {
                // AnimCJK: path animado clipeado (strokeWidth=52 para un trazado visiblemente fino y estilizado)
                return (
                  <Path
                    key={idx}
                    d={dStr}
                    clipPath={`url(#acp_${idx})`}
                    stroke={primaryColor}
                    strokeWidth={96}
                    fill="none"
                    strokeLinecap="round"
                    strokeDasharray={strokeLen}
                    strokeDashoffset={dashoffset}
                  />
                );
              }

              // KanjiVG: stroke animation con dashoffset
              return (
                <Path
                  key={idx}
                  d={dStr}
                  stroke={primaryColor}
                  strokeWidth={4}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray={strokeLen}
                  strokeDashoffset={dashoffset}
                />
              );
            })}
            {!isAnimCjk && kanjiTexts.slice(0, activeStrokeIndex + 1).map((t, idx) => {
              const posX = parseFloat(t.x);
              const posY = parseFloat(t.y);
              if (isNaN(posX) || isNaN(posY)) return null;
              return (
                <SvgText
                  key={idx}
                  x={posX}
                  y={posY}
                  fill={textMutedColor}
                  fontSize={7.5}
                  fontWeight="bold"
                >
                  {t.text}
                </SvgText>
              );
            })}
          </G>
        </Svg>
      </View>
    </View>
  );
}

export default function WordDetailScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [data, setData] = useState<WordDetailWithRelations | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedKanji, setSelectedKanji] = useState<string | null>(null);
  const [asyncCompounds, setAsyncCompounds] = useState<CompoundWord[]>([]);
  const [compoundsLoading, setCompoundsLoading] = useState(false);
  const [selectedMeanings, setSelectedMeanings] = useState<string[]>([]);
  const [editingMeaning, setEditingMeaning] = useState<string | null>(null);
  const [editMeaningText, setEditMeaningText] = useState('');

  const fetchDetail = async () => {
    if (typeof id === 'string') {
      setLoading(true);
      const res = await getWordDetailWithRelations(id);
      setData(res);

      if (res) {
        const allMeanings = cleanAndFormatMeanings(res.word.meanings);
        let currentSelected: string[] = allMeanings;

        if (res.word.auxiliaryInfo) {
          try {
            const parsed = JSON.parse(res.word.auxiliaryInfo);
            if (Array.isArray(parsed.selectedMeanings) && parsed.selectedMeanings.length > 0) {
              currentSelected = parsed.selectedMeanings;
            }
          } catch (e) {}
        } else if (res.srsItem?.displayMeaning) {
          try {
            const srsMeanings = JSON.parse(res.srsItem.displayMeaning);
            if (Array.isArray(srsMeanings) && srsMeanings.length > 0) {
              currentSelected = srsMeanings;
            }
          } catch (e) {}
        }

        setSelectedMeanings(currentSelected);
      }

      setLoading(false);
    }
  };

  const handleToggleMeaning = async (meaning: string) => {
    if (!data) return;
    let nextSelected: string[];

    if (selectedMeanings.includes(meaning)) {
      if (selectedMeanings.length <= 1) {
        Alert.alert('Aviso', 'Debes mantener al menos un significado seleccionado para repasar.');
        return;
      }
      nextSelected = selectedMeanings.filter((m) => m !== meaning);
    } else {
      nextSelected = [...selectedMeanings, meaning];
    }

    setSelectedMeanings(nextSelected);
    try {
      await updateWordSelectedMeanings(data.word.id, nextSelected);
    } catch (e) {
      console.warn('Error al guardar selección de significados:', e);
    }
  };

  const handleDeleteSingleMeaning = (meaning: string) => {
    if (!data) return;
    const currentList = cleanAndFormatMeanings(data.word.meanings);
    if (currentList.length <= 1) {
      Alert.alert('Aviso', 'No puedes eliminar el único significado de la palabra.');
      return;
    }

    Alert.alert(
      'Eliminar significado',
      `¿Deseas eliminar permanentemente "${meaning}" de esta palabra?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await deleteWordMeaning(data.word.id, meaning);
              // Actualizar estado local inmediatamente
              setData((prev) => {
                if (!prev) return null;
                return {
                  ...prev,
                  word: {
                    ...prev.word,
                    meanings: JSON.stringify(res.updatedMeanings),
                  },
                };
              });
              setSelectedMeanings(res.updatedSelected);
            } catch (e) {
              Alert.alert('Error', 'No se pudo eliminar el significado.');
            }
          },
        },
      ]
    );
  };

  const handleStartEditMeaning = (meaning: string) => {
    setEditingMeaning(meaning);
    setEditMeaningText(meaning);
  };

  const handleSaveEditedMeaning = async () => {
    if (!data || !editingMeaning) return;
    const trimmed = editMeaningText.trim();
    if (!trimmed) {
      Alert.alert('Aviso', 'El significado no puede estar vacío.');
      return;
    }

    try {
      const res = await updateWordMeaningText(data.word.id, editingMeaning, trimmed);
      setData((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          word: {
            ...prev.word,
            meanings: JSON.stringify(res.updatedMeanings),
          },
        };
      });
      setSelectedMeanings(res.updatedSelected);
      setEditingMeaning(null);
      setEditMeaningText('');
    } catch (e) {
      Alert.alert('Error', 'No se pudo actualizar el significado.');
    }
  };

  useEffect(() => {
    fetchDetail();
  }, [id]);

  // Carga asíncrona de palabras compuestas con caché local y feedback de carga
  useEffect(() => {
    if (!data) return;
    const langCode = data.deck?.languageCode || 'zh-CN';
    const char = data.word.simplified;
    const cacheKey = `yomi_compounds_cache_v2_${langCode}_${char}`;

    let isMounted = true;
    async function loadCompounds() {
      try {
        const cached = await getStorageItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            if (isMounted) {
              setAsyncCompounds(parsed);
              setCompoundsLoading(false);
            }
            return;
          }
        }
      } catch (e) {}

      if (isMounted) {
        setCompoundsLoading(true);
      }

      try {
        const compounds = await getCompoundWordsForChar(char, 3, langCode);
        if (isMounted) {
          setAsyncCompounds(compounds);
          setCompoundsLoading(false);
          if (compounds.length > 0) {
            setStorageItem(cacheKey, JSON.stringify(compounds));
          }
        }
      } catch (e) {
        if (isMounted) {
          setCompoundsLoading(false);
        }
      }
    }

    loadCompounds();
    return () => {
      isMounted = false;
    };
  }, [data]);

  // Precarga asíncrona en segundo plano de trazados de Kanji / Hanzi para apertura instantánea sin loading
  useEffect(() => {
    if (!data) return;
    const kanjis = extractKanjis(data.word.simplified);
    const isCh = (data.deck?.languageCode || 'zh-CN').startsWith('zh');
    kanjis.forEach(async (char) => {
      const hexCode = getKanjiHex(char);
      const cacheKey = `yomi_stroke_${isCh ? 'hanzi' : 'kanji'}_v14_${hexCode}`;
      try {
        const cached = await getStorageItem(cacheKey);
        if (!cached) {
          const { paths, clipPaths, texts, viewBox, strokeType } = await fetchAndParseStrokeSvg(char, isCh);
          if (paths.length > 0) {
            setStorageItem(cacheKey, JSON.stringify({ paths, clipPaths, texts, viewBox, strokeType }));
          }
        }
      } catch (e) { }
    });
  }, [data]);

  const handlePlayAudio = () => {
    if (!data) return;
    const lang = data.deck?.languageCode || 'zh-CN';
    speakText(data.word.simplified, lang);
  };

  const handleDelete = () => {
    if (!data) return;
    Alert.alert(
      'Eliminar palabra',
      `¿Deseas eliminar "${data.word.simplified}" de tu mazo?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            await deleteWord(data.word.id);
            router.back();
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!data) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.danger} />
        <Text style={[styles.errorText, { color: colors.danger }]}>No se encontró la palabra.</Text>
        <TouchableOpacity style={[styles.backButton, { backgroundColor: colors.primary }]} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Volver</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const { word, deck, srsItem, meaningsList, compoundWords, level, category } = data;
  const lang = deck?.languageCode || 'zh-CN';
  const isChinese = lang.startsWith('zh');
  const isJapanese = lang.startsWith('ja');
  const isIdeographic = isChinese || isJapanese;

  // Resolución de nivel JLPT o HSK
  let activeLevel = level;
  if (!activeLevel) {
    if (lang.startsWith('ja')) {
      activeLevel = getQuickJlptLevel(word.simplified);
    } else if (lang.startsWith('zh')) {
      const hskNum = getQuickHskLevel(word.simplified);
      if (hskNum) activeLevel = `HSK ${hskNum}`;
    }
  }

  // Lectura limpia sin romanización en paréntesis
  const rawReading = word.pinyinDisplay || '';
  const cleanReading = lang.startsWith('ja')
    ? rawReading.replace(/\s*\([^)]*\)/g, '').trim()
    : rawReading;

  // Categoría gramatical (explícita o heurística para japonés)
  const activeCategory = category || (isJapanese ? classifyJapaneseWord(word.simplified, cleanReading) : undefined);

  // Formato amigable de estado FSRS
  const getSrsStateLabel = (stateNum?: number) => {
    switch (stateNum) {
      case State.New:
        return { label: 'Nueva', color: '#3B82F6' };
      case State.Learning:
        return { label: 'Aprendiendo', color: '#F59E0B' };
      case State.Review:
        return { label: 'En Repaso', color: '#10B981' };
      case State.Relearning:
        return { label: 'Reaprendiendo', color: '#EF4444' };
      default:
        return { label: 'Sin repasar', color: colors.textMuted };
    }
  };

  const srsStateInfo = getSrsStateLabel(srsItem?.state);
  const furiganaPairs = parseFurigana(word.simplified, cleanReading);
  const kanjisList = extractKanjis(word.simplified);

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + 4 }]}>
      {/* Header superior dinámico Yomi alineado a la izquierda */}
      <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>

        <View style={styles.brandHeaderContainer}>
          <Text style={[styles.brandText, { color: colors.primary }]}>Yomi</Text>
          <Text style={[styles.brandSep, { color: colors.textMuted }]}> • </Text>
          <Text style={[styles.deckName, { color: colors.text }]} numberOfLines={1}>
            Detalle de Palabra
          </Text>
        </View>

        <TouchableOpacity onPress={handleDelete} style={styles.iconBtn}>
          <Ionicons name="trash-outline" size={22} color={colors.danger} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Tarjeta Principal de la Palabra */}
        <View style={[styles.mainCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>

          {/* Fila superior: Badges (Categoría, JLPT/HSK) a la izquierda del parlante */}
          <View style={styles.topActionsRow}>
            <View style={styles.topBadgesRow}>
              {activeCategory && !activeCategory.includes('Frase') ? (
                <View style={[styles.categoryBadge, { backgroundColor: colors.surfaceHighlight }]}>
                  <Text style={[styles.categoryBadgeText, { color: colors.primary }]}>{activeCategory}</Text>
                </View>
              ) : null}
              {activeLevel ? (
                <View style={styles.levelBadge}>
                  <Text style={[styles.levelBadgeText, { color: colors.primary }]}>
                    {activeLevel.startsWith('HSK') || activeLevel.startsWith('JLPT')
                      ? activeLevel
                      : lang.startsWith('ja')
                        ? `JLPT ${activeLevel}`
                        : `HSK ${activeLevel}`}
                  </Text>
                </View>
              ) : null}
            </View>

            <TouchableOpacity
              style={[styles.audioBtn, { backgroundColor: colors.surfaceHighlight, borderColor: colors.border }]}
              activeOpacity={0.8}
              onPress={handlePlayAudio}
            >
              <Ionicons name="volume-high" size={24} color={colors.primary} />
            </TouchableOpacity>
          </View>

          {/* Sección de la Palabra Principal con Furigana pegado en gris (textMuted) */}
          <View style={styles.wordSectionContainer}>
            <View style={styles.rubyContainer}>
              {furiganaPairs.map((pair, idx) => {
                const textLen = word.simplified.length;
                const fontSize = textLen > 12 ? 20 : textLen > 8 ? 24 : textLen > 5 ? 28 : 32;
                return (
                  <View key={idx} style={styles.rubyPair}>
                    {pair.furigana ? (
                      <Text style={[styles.rubyRt, { color: colors.textMuted }]} numberOfLines={1}>
                        {pair.furigana}
                      </Text>
                    ) : (
                      <View style={{ height: 13 }} />
                    )}
                    <Text
                      style={[
                        isIdeographic ? styles.mainCharIdeographic : styles.mainCharAlphabetic,
                        { color: colors.text, fontSize }
                      ]}
                    >
                      {pair.char}
                    </Text>
                  </View>
                );
              })}
            </View>

            {cleanReading && cleanReading !== word.simplified ? (
              <Text style={[styles.readingTextBelow, { color: colors.primaryHover }]}>
                {cleanReading}
              </Text>
            ) : null}
          </View>

          {/* Significados / Traducción con selección personalizada para repaso SRS */}
          <View style={styles.sectionBox}>
            <View style={styles.meaningHeaderRow}>
              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Significados para repasar:</Text>
              <Text style={[styles.meaningHint, { color: colors.textMuted }]}>Toca para incluir/excluir</Text>
            </View>
            <View style={styles.meaningsContainer}>
              {cleanAndFormatMeanings(word.meanings).map((meaning, index) => {
                const isSelected = selectedMeanings.includes(meaning);
                const allMeaningsCount = cleanAndFormatMeanings(word.meanings).length;
                return (
                  <View
                    key={index}
                    style={[
                      styles.meaningSelectableItem,
                      {
                        backgroundColor: isSelected ? colors.surfaceHighlight : 'transparent',
                        borderColor: isSelected ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <TouchableOpacity
                      style={styles.meaningTouchRow}
                      activeOpacity={0.7}
                      onPress={() => handleToggleMeaning(meaning)}
                    >
                      <View
                        style={[
                          styles.meaningCheckbox,
                          {
                            borderColor: isSelected ? colors.primary : colors.textMuted,
                            backgroundColor: isSelected ? colors.primary : 'transparent',
                          },
                        ]}
                      >
                        {isSelected ? <Ionicons name="checkmark" size={13} color="#FFF" /> : null}
                      </View>
                      <Text
                        style={[
                          styles.meaningText,
                          {
                            color: isSelected ? colors.text : colors.textMuted,
                            fontWeight: isSelected ? '600' : 'normal',
                            textDecorationLine: isSelected ? 'none' : 'line-through',
                            opacity: isSelected ? 1 : 0.6,
                          },
                        ]}
                      >
                        {meaning}
                      </Text>
                    </TouchableOpacity>

                    <View style={styles.meaningActionsContainer}>
                      <TouchableOpacity
                        style={styles.meaningActionBtn}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        onPress={() => handleStartEditMeaning(meaning)}
                      >
                        <Ionicons name="pencil-outline" size={16} color={colors.primary} />
                      </TouchableOpacity>

                      {allMeaningsCount > 1 && (
                        <TouchableOpacity
                          style={styles.meaningActionBtn}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          onPress={() => handleDeleteSingleMeaning(meaning)}
                        >
                          <Ionicons name="trash-outline" size={16} color={colors.danger} />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        </View>

        {/* Sección condicional: Trazado para idiomas ideográficos (Chino/Japonés) */}
        {isIdeographic && (
          <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.sectionHeaderRow}>
              <Ionicons name="brush-outline" size={20} color={colors.primary} />
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Trazado y Caracteres</Text>
            </View>

            <View style={[styles.strokeBox, { backgroundColor: colors.surfaceHighlight }]}>
              <Text
                style={[styles.strokeCharPreview, { color: colors.primary }]}
                numberOfLines={1}
                adjustsFontSizeToFit={true}
              >
                {word.simplified}
              </Text>
              <Text style={[styles.strokeTip, { color: colors.textMuted }]}>
                Total de caracteres: {word.simplified.length} {word.traditional && word.traditional !== word.simplified ? `| Tradicional: ${word.traditional}` : ''}
              </Text>
            </View>

            {/* Desglose individual de cada Kanji con su propia Badge de Nivel JLPT */}
            {kanjisList.length > 0 && (
              <View style={styles.kanjiBreakdownContainer}>
                <Text style={[styles.kanjiBreakdownLabel, { color: colors.textMuted }]}>
                  {isChinese ? `Desglose de Hanzi (${kanjisList.length}):` : `Desglose de Kanjis (${kanjisList.length}):`}
                </Text>
                {kanjisList.map((char) => {
                  const charLevel = isChinese
                    ? (getQuickHskLevel(char) ? `HSK ${getQuickHskLevel(char)}` : null)
                    : (getKanjiJlptLevel(char) ? `JLPT ${getKanjiJlptLevel(char)}` : null);
                  const formattedCharLevel = charLevel;

                  const pairMatch = furiganaPairs.find((p) => p.char === char);
                  const charFurigana = pairMatch?.furigana;

                  return (
                    <TouchableOpacity
                      key={char}
                      style={[styles.kanjiCard, { backgroundColor: colors.surfaceHighlight, borderColor: colors.border }]}
                      activeOpacity={0.7}
                      onPress={() => setSelectedKanji(char)}
                    >
                      <View style={styles.kanjiCardLeft}>
                        <View style={styles.kanjiCharWithFurigana}>
                          {charFurigana ? (
                            <Text style={[styles.kanjiBreakdownFurigana, { color: colors.textMuted }]}>
                              {charFurigana}
                            </Text>
                          ) : (
                            <View style={{ height: 11 }} />
                          )}
                          <Text style={[styles.kanjiCardChar, { color: colors.text }]}>{char}</Text>
                        </View>

                        <View style={styles.kanjiCardMeta}>
                          {formattedCharLevel ? (
                            <View style={styles.kanjiBadge}>
                              <Text style={[styles.kanjiBadgeText, { color: colors.primary }]}>
                                {formattedCharLevel}
                              </Text>
                            </View>
                          ) : (
                            <Text style={[styles.kanjiNoLevel, { color: colors.textMuted }]}>Sin nivel específico</Text>
                          )}
                        </View>
                      </View>

                      <View style={[styles.kanjiActionBtn, { backgroundColor: colors.primary }]}>
                        <Ionicons name="play" size={14} color="#FFF" style={{ marginRight: 4 }} />
                        <Text style={styles.kanjiActionBtnText}>Ver trazado</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/* Sección de Palabras Compuestas / Ejemplos Comunes con contenedor y spinner de carga */}
        {isIdeographic && (compoundsLoading || asyncCompounds.length > 0) && (
          <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.sectionHeaderRow}>
              <Ionicons name="library-outline" size={20} color={colors.primary} />
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Palabras comunes con este carácter</Text>
            </View>
            <Text style={[styles.sectionSub, { color: colors.textMuted }]}>
              {compoundsLoading ? 'Consultando diccionario...' : 'Ejemplos de uso frecuente en el diccionario:'}
            </Text>

            {compoundsLoading ? (
              <View style={styles.compoundsLoadingBox}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={[styles.compoundsLoadingText, { color: colors.textMuted }]}>
                  Buscando palabras comunes en el diccionario...
                </Text>
              </View>
            ) : (
              asyncCompounds.map((comp) => (
                <View key={comp.id} style={[styles.compoundItem, { backgroundColor: colors.surfaceHighlight }]}>
                  <View style={styles.compoundTopRow}>
                    <Text style={[styles.compoundChar, { color: colors.text }]}>{comp.simplified}</Text>
                    <Text style={[styles.compoundPinyin, { color: colors.primaryHover }]}>{comp.pinyinDisplay}</Text>
                  </View>
                  <Text style={[styles.compoundMeaning, { color: colors.textMuted }]} numberOfLines={2}>
                    {cleanAndFormatMeanings(comp.meanings).slice(0, 2).join(', ')}
                  </Text>
                </View>
              ))
            )}
          </View>
        )}

        {/* Ficha SRS FSRS */}
        {srsItem && (
          <View style={[styles.srsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.sectionHeaderRow}>
              <Ionicons name="analytics-outline" size={20} color={colors.primary} />
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Estado de Memoria (SRS)</Text>
            </View>

            <View style={styles.srsGrid}>
              <View style={[styles.srsStat, { backgroundColor: colors.surfaceHighlight }]}>
                <Text style={[styles.srsStatLabel, { color: colors.textMuted }]}>Estado</Text>
                <View style={[styles.srsBadge, { backgroundColor: srsStateInfo.color + '22' }]}>
                  <Text style={[styles.srsBadgeText, { color: srsStateInfo.color }]}>
                    {srsStateInfo.label}
                  </Text>
                </View>
              </View>

              <View style={[styles.srsStat, { backgroundColor: colors.surfaceHighlight }]}>
                <Text style={[styles.srsStatLabel, { color: colors.textMuted }]}>Repasos</Text>
                <Text style={[styles.srsStatValue, { color: colors.text }]}>{srsItem.reps} veces</Text>
              </View>

              <View style={[styles.srsStat, { backgroundColor: colors.surfaceHighlight }]}>
                <Text style={[styles.srsStatLabel, { color: colors.textMuted }]}>Dificultad</Text>
                <Text style={[styles.srsStatValue, { color: colors.text }]}>{srsItem.difficulty?.toFixed(1) || '0.0'}</Text>
              </View>

              <View style={[styles.srsStat, { backgroundColor: colors.surfaceHighlight }]}>
                <Text style={[styles.srsStatLabel, { color: colors.textMuted }]}>Próximo repaso</Text>
                <Text style={[styles.srsStatValue, { color: colors.text }]}>
                  {new Date(srsItem.due).toLocaleDateString()}
                </Text>
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Modal de Animación de Trazado de Kanji Paso a Paso */}
      <Modal
        visible={!!selectedKanji}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setSelectedKanji(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTitleRow}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>
                  {isChinese ? `Hanzi ${selectedKanji}` : `Kanji ${selectedKanji}`}
                </Text>
                {selectedKanji && (isChinese ? getQuickHskLevel(selectedKanji) : getKanjiJlptLevel(selectedKanji)) ? (
                  <View style={styles.levelBadge}>
                    <Text style={[styles.levelBadgeText, { color: colors.primary }]}>
                      {isChinese ? `HSK ${getQuickHskLevel(selectedKanji)}` : `JLPT ${getKanjiJlptLevel(selectedKanji)}`}
                    </Text>
                  </View>
                ) : null}
              </View>

              <TouchableOpacity onPress={() => setSelectedKanji(null)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={22} color={colors.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              {selectedKanji ? (
                <UniversalKanjiStrokePlayer
                  char={selectedKanji}
                  primaryColor={colors.primary}
                  textMutedColor={colors.textMuted}
                  isChinese={isChinese}
                />
              ) : null}
            </View>

            <TouchableOpacity
              style={[styles.modalCloseFullBtn, { backgroundColor: colors.primary }]}
              onPress={() => setSelectedKanji(null)}
            >
              <Text style={styles.modalCloseFullBtnText}>Cerrar Ventana</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal interactivo para editar significado */}
      <Modal
        visible={Boolean(editingMeaning)}
        transparent
        animationType="fade"
        onRequestClose={() => setEditingMeaning(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.editModalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.editModalHeader}>
              <Text style={[styles.editModalTitle, { color: colors.text }]}>Editar Significado</Text>
              <TouchableOpacity onPress={() => setEditingMeaning(null)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <TextInput
              style={[
                styles.editMeaningInput,
                {
                  backgroundColor: colors.surfaceHighlight,
                  color: colors.text,
                  borderColor: colors.border,
                },
              ]}
              value={editMeaningText}
              onChangeText={setEditMeaningText}
              placeholder="Ingresa el significado..."
              placeholderTextColor={colors.textMuted}
              multiline
              autoFocus
            />

            <View style={styles.editModalActionsRow}>
              <TouchableOpacity
                style={[styles.editModalCancelBtn, { borderColor: colors.border }]}
                onPress={() => setEditingMeaning(null)}
              >
                <Text style={[styles.editModalCancelText, { color: colors.textMuted }]}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.editModalSaveBtn, { backgroundColor: colors.primary }]}
                onPress={handleSaveEditedMeaning}
              >
                <Text style={styles.editModalSaveText}>Guardar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
  },
  brandHeaderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginLeft: Spacing.xs,
  },
  brandText: {
    fontSize: 20,
    fontWeight: '800',
  },
  brandSep: {
    fontSize: 18,
  },
  iconBtn: {
    padding: Spacing.xs,
  },
  deckName: {
    fontSize: 17,
    fontWeight: '600',
  },
  scrollContent: {
    padding: Spacing.md,
    paddingBottom: 60,
  },
  mainCard: {
    borderRadius: 20,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    borderWidth: 1,
    ...Shadows.card,
  },
  topActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  wordSectionContainer: {
    marginBottom: Spacing.md,
  },
  rubyContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    flexWrap: 'wrap',
  },
  rubyPair: {
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  rubyRt: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 13,
    marginBottom: -5,
    minHeight: 13,
    textAlign: 'center',
    alignSelf: 'center',
    width: '100%',
  },
  readingTextBelow: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 4,
    letterSpacing: 0.5,
  },
  topBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
    flex: 1,
  },
  categoryBadge: {
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.35)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  categoryBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  levelBadge: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.4)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  levelBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  mainCharIdeographic: {
    fontSize: 32,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  mainCharAlphabetic: {
    fontSize: 30,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  audioBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  sectionBox: {
    marginTop: Spacing.xs,
  },
  sectionLabel: {
    ...Typography.bodySmall,
    marginBottom: 0,
  },
  meaningHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  meaningHint: {
    fontSize: 11,
    fontStyle: 'italic',
  },
  meaningsContainer: {
    marginTop: 2,
  },
  meaningSelectableItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 6,
  },
  meaningTouchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  meaningActionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 6,
  },
  meaningActionBtn: {
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  meaningDeleteBtn: {
    padding: 6,
    marginLeft: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  editModalCard: {
    width: '90%',
    maxWidth: 400,
    borderRadius: 16,
    padding: Spacing.md + 4,
    borderWidth: 1,
    ...Shadows.card,
  },
  editModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  editModalTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  editMeaningInput: {
    borderRadius: 10,
    borderWidth: 1,
    padding: Spacing.sm + 4,
    fontSize: 14,
    minHeight: 70,
    textAlignVertical: 'top',
    marginBottom: Spacing.md,
  },
  editModalActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.sm,
  },
  editModalCancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editModalCancelText: {
    fontSize: 13,
    fontWeight: '600',
  },
  editModalSaveBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editModalSaveText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },
  meaningCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  meaningItem: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  meaningBullet: {
    fontSize: 16,
    marginRight: 8,
  },
  meaningText: {
    ...Typography.bodySmall,
    fontSize: 14,
    lineHeight: 20,
    flex: 1,
  },
  sectionCard: {
    borderRadius: 16,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    ...Shadows.card,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  sectionTitle: {
    ...Typography.body,
    fontWeight: '700',
    marginLeft: Spacing.xs,
  },
  sectionSub: {
    ...Typography.bodySmall,
    marginBottom: Spacing.sm,
  },
  strokeBox: {
    borderRadius: 12,
    padding: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.xs,
    width: '100%',
  },
  strokeCharPreview: {
    fontSize: 44,
    fontWeight: '300',
    marginVertical: Spacing.xs,
    textAlign: 'center',
    width: '100%',
  },
  strokeTip: {
    ...Typography.bodySmall,
    fontSize: 12,
  },
  kanjiBreakdownContainer: {
    marginTop: Spacing.md,
  },
  kanjiBreakdownLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: Spacing.xs,
  },
  kanjiCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.sm,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: Spacing.xs,
  },
  kanjiCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  kanjiCardChar: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  kanjiCardMeta: {
    justifyContent: 'center',
  },
  kanjiCharWithFurigana: {
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  kanjiBreakdownFurigana: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: -4,
    textAlign: 'center',
    alignSelf: 'center',
    width: '100%',
  },
  kanjiBadge: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.4)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  kanjiBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  kanjiNoLevel: {
    fontSize: 11,
  },
  kanjiActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
  },
  kanjiActionBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  compoundItem: {
    borderRadius: 12,
    padding: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  compoundTopRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 2,
  },
  compoundChar: {
    fontSize: 18,
    fontWeight: 'bold',
    marginRight: Spacing.sm,
  },
  compoundPinyin: {
    fontSize: 13,
    fontWeight: '500',
  },
  compoundMeaning: {
    ...Typography.bodySmall,
    fontSize: 12,
  },
  compoundsLoadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.lg,
    gap: Spacing.sm,
  },
  compoundsLoadingText: {
    ...Typography.bodySmall,
    fontSize: 13,
  },
  srsCard: {
    borderRadius: 16,
    padding: Spacing.md,
    borderWidth: 1,
    ...Shadows.card,
  },
  srsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: Spacing.sm,
  },
  srsStat: {
    width: '48%',
    padding: Spacing.sm,
    borderRadius: 10,
    marginBottom: Spacing.xs,
  },
  srsStatLabel: {
    fontSize: 11,
    marginBottom: 4,
  },
  srsStatValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  srsBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  srsBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  errorText: {
    ...Typography.body,
    marginTop: Spacing.md,
    marginBottom: Spacing.lg,
  },
  backButton: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: 10,
  },
  backButtonText: {
    color: '#FFF',
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.md,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 20,
    padding: Spacing.lg,
    borderWidth: 1,
    ...Shadows.card,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  modalHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginRight: Spacing.xs,
  },
  modalCloseBtn: {
    padding: Spacing.xs,
  },
  modalBody: {
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  animatorContainer: {
    width: '100%',
    height: 240,
    justifyContent: 'center',
    alignItems: 'center',
  },
  animatorCanvasBox: {
    width: 220,
    height: 220,
    justifyContent: 'center',
    alignItems: 'center',
  },
  animatorSub: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 10,
  },
  animatorError: {
    fontSize: 12,
    color: '#EF4444',
  },
  modalCloseFullBtn: {
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalCloseFullBtnText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
});
