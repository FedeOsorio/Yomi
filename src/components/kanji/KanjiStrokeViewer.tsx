import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Svg, { ClipPath, Defs, G, Path, Text as SvgText } from 'react-native-svg';
import { getStorageItem, setStorageItem } from '../../../lib/storage-service';

export function getKanjiHex(char: string): string {
  if (!char) return '';
  const code = char.charCodeAt(0).toString(16).toLowerCase();
  return code.padStart(5, '0');
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
function extractAnimCjkPaths(xmlText: string): { paths: string[]; clipPaths: string[]; viewBox: string } {
  const viewBoxMatch = xmlText.match(/viewBox="([^"]+)"/);
  const viewBox = viewBoxMatch ? viewBoxMatch[1] : '0 0 1024 1024';

  const flat = xmlText.replace(/\r?\n/g, ' ');

  // 1. Extraer background paths: id="z{code}d{n}" → usados como clip shapes
  const bgPathMap: Record<number, string> = {};
  const bgRegex = /id="z\d+d(\d+)"[^>]*d="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = bgRegex.exec(flat)) !== null) {
    bgPathMap[parseInt(m[1], 10)] = m[2];
  }
  const bgRegex2 = /\bd="([^"]+)"[^>]*id="z\d+d(\d+)"/g;
  while ((m = bgRegex2.exec(flat)) !== null) {
    const n = parseInt(m[2], 10);
    if (!bgPathMap[n]) bgPathMap[n] = m[1];
  }

  // 2. Extraer animated paths: clip-path="url(#z{code}c{n})" d="simple line"
  const animMap: Record<number, string> = {};
  const cpAnimRegex = /clip-path="url\(#z\d+c(\d+)\)"[^>]*\bd="([^"]+)"/g;
  while ((m = cpAnimRegex.exec(flat)) !== null) {
    animMap[parseInt(m[1], 10)] = m[2];
  }
  const cpAnimRegex2 = /\bd="([^"]+)"[^/]*clip-path="url\(#z\d+c(\d+)\)"/g;
  while ((m = cpAnimRegex2.exec(flat)) !== null) {
    const n = parseInt(m[2], 10);
    if (!animMap[n]) animMap[n] = m[1];
  }

  // 3. Combinar por número de trazo
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

export async function fetchAndParseStrokeSvg(
  char: string,
  isChinese: boolean = false
): Promise<{
  paths: string[];
  clipPaths: string[];
  texts: { text: string; x: string; y: string }[];
  viewBox: string;
  strokeType: 'kanjivg' | 'animcjk';
}> {
  if (!char) return { paths: [], clipPaths: [], texts: [], viewBox: '0 0 109 109', strokeType: 'kanjivg' };
  const hex4 = char.charCodeAt(0).toString(16).toLowerCase();
  const hex5 = hex4.padStart(5, '0');
  const decCode = char.charCodeAt(0);

  // Si es Hanzi (Chino), consultar EXCLUSIVAMENTE AnimCJK
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
      } catch (e) {}
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
    } catch (e) {}
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
    } catch (e) {}
  }

  return { paths: [], clipPaths: [], texts: [], viewBox: '0 0 109 109', strokeType: 'kanjivg' };
}

export async function preloadStrokeSvg(char: string, isChinese: boolean = false): Promise<void> {
  const hexCode = getKanjiHex(char);
  const cacheKey = `yomi_stroke_${isChinese ? 'hanzi' : 'kanji'}_v14_${hexCode}`;
  try {
    const cached = await getStorageItem(cacheKey);
    if (!cached) {
      const { paths, clipPaths, texts, viewBox, strokeType } = await fetchAndParseStrokeSvg(char, isChinese);
      if (paths.length > 0) {
        await setStorageItem(cacheKey, JSON.stringify({ paths, clipPaths, texts, viewBox, strokeType }));
      }
    }
  } catch (e) {}
}

function autoDetectViewBox(paths: string[], defaultViewBox: string): string {
  if (defaultViewBox && defaultViewBox.trim().length > 0) return defaultViewBox;
  return '0 0 109 109';
}

export interface KanjiStrokeViewerProps {
  char: string;
  primaryColor: string;
  textMutedColor: string;
  isChinese?: boolean;
}

export function KanjiStrokeViewer({
  char,
  primaryColor,
  textMutedColor,
  isChinese = false,
}: KanjiStrokeViewerProps) {
  const [svgPaths, setSvgPaths] = useState<string[]>([]);
  const [svgClipPaths, setSvgClipPaths] = useState<string[]>([]);
  const [kanjiTexts, setKanjiTexts] = useState<{ text: string; x: string; y: string }[]>([]);
  const [svgViewBox, setSvgViewBox] = useState<string>('0 0 109 109');
  const [svgStrokeType, setSvgStrokeType] = useState<'kanjivg' | 'animcjk'>(isChinese ? 'animcjk' : 'kanjivg');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [activeStrokeIndex, setActiveStrokeIndex] = useState(0);
  const [strokeProgress, setStrokeProgress] = useState(0);

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
      } catch (e) {}

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
    const durationPerStroke = svgStrokeType === 'animcjk' ? 850 : 1050;
    const pauseAtEnd = 1500;
    const totalAnimationTime = svgPaths.length * durationPerStroke + pauseAtEnd;

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
            {!isAnimCjk &&
              kanjiTexts.slice(0, activeStrokeIndex + 1).map((t, idx) => {
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

const styles = StyleSheet.create({
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
    marginTop: 10,
  },
  animatorError: {
    fontSize: 12,
    color: '#EF4444',
  },
});
