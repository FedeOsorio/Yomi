import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  SharedValue,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { ClipPath, Defs, G, Path, Text as SvgText } from 'react-native-svg';
import { getStorageItem, setStorageItem } from '../../../lib/storage-service';
import { useTranslation } from '../../i18n';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedSvgText = Animated.createAnimatedComponent(SvgText);

/** Tiempo de dibujo de cada trazo. */
const STROKE_MS = 500;

interface StrokeData {
  paths: string[];
  clipPaths: string[];
  texts: { text: string; x: string; y: string }[];
  viewBox: string;
  strokeType: 'kanjivg' | 'animcjk';
}

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

/**
 * Largo aproximado de un trazo SVG (rectas y curvas de Bézier, absolutas o relativas), para que la animación
 * lo dibuje a velocidad pareja. Cada curva se estima como el promedio entre la cuerda y el polígono de control.
 */
function estimatePathLength(d: string): number {
  const tokens = d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+)(?:e[-+]?\d+)?/g) ?? [];
  let i = 0;
  let cmd = '';
  let x = 0, y = 0, startX = 0, startY = 0, ctrlX = 0, ctrlY = 0;
  let total = 0;
  const num = () => parseFloat(tokens[i++]);
  const line = (ex: number, ey: number) => {
    total += Math.hypot(ex - x, ey - y);
    x = ctrlX = ex;
    y = ctrlY = ey;
  };
  const cubic = (x1: number, y1: number, x2: number, y2: number, ex: number, ey: number) => {
    const chord = Math.hypot(ex - x, ey - y);
    const net = Math.hypot(x1 - x, y1 - y) + Math.hypot(x2 - x1, y2 - y1) + Math.hypot(ex - x2, ey - y2);
    total += (chord + net) / 2;
    ctrlX = x2;
    ctrlY = y2;
    x = ex;
    y = ey;
  };

  while (i < tokens.length) {
    const before = i;
    if (/^[a-zA-Z]$/.test(tokens[i])) cmd = tokens[i++];
    const rel = cmd === cmd.toLowerCase();
    const ox = rel ? x : 0;
    const oy = rel ? y : 0;
    switch (cmd.toUpperCase()) {
      case 'M':
        x = ctrlX = startX = num() + ox;
        y = ctrlY = startY = num() + oy;
        cmd = rel ? 'l' : 'L'; // los pares que siguen a un M son rectas
        break;
      case 'L':
        line(num() + ox, num() + oy);
        break;
      case 'H':
        line(num() + ox, y);
        break;
      case 'V':
        line(x, num() + oy);
        break;
      case 'C':
        cubic(num() + ox, num() + oy, num() + ox, num() + oy, num() + ox, num() + oy);
        break;
      case 'S':
        cubic(2 * x - ctrlX, 2 * y - ctrlY, num() + ox, num() + oy, num() + ox, num() + oy);
        break;
      case 'Q':
      case 'T':
        // Poco comunes en estos archivos: se toma la recta hasta el punto final
        if (cmd.toUpperCase() === 'Q') i += 2;
        line(num() + ox, num() + oy);
        break;
      case 'Z':
        line(startX, startY);
        break;
    }
    if (i === before) i++; // nada consumido (comando desconocido): seguir
  }
  return Number.isFinite(total) && total > 0 ? total : 1000;
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

export async function fetchAndParseStrokeSvg(char: string, isChinese: boolean = false): Promise<StrokeData> {
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

/** Trazos del carácter: de la copia guardada o, la primera vez, de internet (y se guardan). null si no hay. */
async function loadStrokes(char: string, isChinese: boolean): Promise<StrokeData | null> {
  const cacheKey = `yomi_stroke_${isChinese ? 'hanzi' : 'kanji'}_v14_${getKanjiHex(char)}`;
  try {
    const cached = await getStorageItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && Array.isArray(parsed.paths) && parsed.paths.length > 0) {
        return {
          paths: parsed.paths,
          clipPaths: parsed.clipPaths || [],
          texts: parsed.texts || [],
          viewBox: parsed.viewBox || '0 0 109 109',
          strokeType: parsed.strokeType || (isChinese ? 'animcjk' : 'kanjivg'),
        };
      }
    }
  } catch (e) {}

  const data = await fetchAndParseStrokeSvg(char, isChinese);
  if (data.paths.length === 0) return null;
  setStorageItem(cacheKey, JSON.stringify(data)).catch(() => {});
  return data;
}

/** Baja y guarda los trazos en segundo plano, para que se dibujen al instante al tocar el kanji. */
export async function preloadStrokeSvg(char: string, isChinese: boolean = false): Promise<void> {
  await loadStrokes(char, isChinese).catch(() => null);
}

interface StrokePathProps {
  d: string;
  index: number;
  length: number;
  progress: SharedValue<number>;
  color: string;
  width: number;
  clipId?: string;
}

/** Un trazo: se dibuja cuando `progress` pasa por su número (0→1 el primero, 1→2 el segundo…). */
function StrokePath({ d, index, length, progress, color, width, clipId }: StrokePathProps) {
  const animatedProps = useAnimatedProps(() => {
    const p = Math.min(Math.max(progress.value - index, 0), 1);
    return { strokeDashoffset: length * (1 - p), opacity: p > 0 ? 1 : 0 };
  });
  return (
    <AnimatedPath
      d={d}
      clipPath={clipId ? `url(#${clipId})` : undefined}
      stroke={color}
      strokeWidth={width}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray={length}
      animatedProps={animatedProps}
    />
  );
}

/** Número de orden de un trazo (KanjiVG): aparece cuando empieza ese trazo. */
function StrokeNumber({ label, index, progress, color }: { label: { text: string; x: string; y: string }; index: number; progress: SharedValue<number>; color: string }) {
  const animatedProps = useAnimatedProps(() => ({ opacity: progress.value > index ? 1 : 0 }));
  const posX = parseFloat(label.x);
  const posY = parseFloat(label.y);
  if (isNaN(posX) || isNaN(posY)) return null;
  return (
    <AnimatedSvgText x={posX} y={posY} fill={color} fontSize={7.5} fontWeight="bold" animatedProps={animatedProps}>
      {label.text}
    </AnimatedSvgText>
  );
}

export interface KanjiStrokeViewerProps {
  char: string;
  primaryColor: string;
  textMutedColor: string;
  isChinese?: boolean;
  /** Lado del dibujo, en puntos. */
  size?: number;
}

/**
 * Dibuja un kanji/hanzi trazo por trazo, una vez, sobre el carácter en gris (así se ve lo que falta).
 * La animación corre en el hilo de la interfaz (Reanimated): no vuelve a dibujar la pantalla en cada cuadro.
 */
export function KanjiStrokeViewer({ char, primaryColor, textMutedColor, isChinese = false, size = 160 }: KanjiStrokeViewerProps) {
  const { t } = useTranslation();
  const [data, setData] = useState<StrokeData | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const progress = useSharedValue(0);

  useEffect(() => {
    let alive = true;
    setStatus('loading');
    loadStrokes(char, isChinese).then((loaded) => {
      if (!alive) return;
      setData(loaded);
      setStatus(loaded ? 'ready' : 'error');
    });
    return () => {
      alive = false;
    };
  }, [char, isChinese]);

  useEffect(() => {
    if (!data) return;
    progress.value = 0;
    progress.value = withTiming(data.paths.length, { duration: data.paths.length * STROKE_MS, easing: Easing.linear });
    return () => cancelAnimation(progress);
  }, [data]);

  const isAnimCjk = data?.strokeType === 'animcjk';
  const lengths = useMemo(
    () => (data ? data.paths.map((d) => Math.ceil(estimatePathLength(d) * 1.1)) : []),
    [data]
  );

  if (status === 'loading') {
    return (
      <View style={[styles.box, { width: size, height: size }]}>
        <ActivityIndicator size="small" color={primaryColor} />
      </View>
    );
  }

  if (status === 'error' || !data) {
    return (
      <View style={[styles.box, { width: size, height: size }]}>
        <Text style={styles.error}>{t('wordDetail.strokeUnavailable')}</Text>
      </View>
    );
  }

  const guideColor = textMutedColor + '40';

  return (
    <View style={[styles.box, { width: size, height: size }]}>
      <Svg width={size} height={size} viewBox={data.viewBox}>
        {isAnimCjk && (
          <Defs>
            {data.clipPaths.map((cp, idx) => (
              <ClipPath key={idx} id={`acp_${idx}`}>
                <Path d={cp} />
              </ClipPath>
            ))}
          </Defs>
        )}
        {/* El carácter completo en gris, de guía */}
        <G>
          {isAnimCjk
            ? data.clipPaths.map((cp, idx) => <Path key={idx} d={cp} fill={guideColor} />)
            : data.paths.map((d, idx) => (
                <Path key={idx} d={d} stroke={guideColor} strokeWidth={4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              ))}
        </G>
        <G>
          {data.paths.map((d, idx) => (
            <StrokePath
              key={idx}
              d={d}
              index={idx}
              length={lengths[idx]}
              progress={progress}
              color={primaryColor}
              width={isAnimCjk ? 96 : 4}
              clipId={isAnimCjk ? `acp_${idx}` : undefined}
            />
          ))}
          {!isAnimCjk &&
            data.texts.map((label, idx) => (
              <StrokeNumber key={idx} label={label} index={idx} progress={progress} color={textMutedColor} />
            ))}
        </G>
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  error: {
    fontSize: 12,
    color: '#EF4444',
    textAlign: 'center',
  },
});
