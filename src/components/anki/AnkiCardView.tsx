import { File, Paths } from 'expo-file-system';
import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { renderAnkiCard, wrapCardHtml } from '../../../lib/anki-template';
import { AnkiDeckDesign, getDeckAnkiDesign } from '../../../lib/deck-service';
import {
  deleteFileQuietly,
  getMediaDir,
  mediaPath,
  playMediaAudio,
  playMediaSequence,
  sanitizeMediaName,
  stopMediaAudio,
} from '../../../lib/media-service';
import { parseAux } from '../../../lib/word-aux';
import { useTheme } from '../../../providers/ThemeProvider';

interface AnkiCardViewProps {
  deckId: string | null | undefined;
  auxiliaryInfo: string | null | undefined;
  /** Lado visible. Al pasar de 'question' a 'answer' el dorso se muestra en el mismo documento, como en Anki. */
  side: 'question' | 'answer';
  /** Reproducir solos los audios de cada lado al mostrarlo (repaso: sí; detalle de la palabra: no). */
  autoplay?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Lo que se muestra si la tarjeta no se puede dibujar (mazo sin diseño guardado, plantilla rota). */
  fallback?: ReactNode;
  /**
   * Alto según el contenido (para mostrarla dentro de un ScrollView). Sin esto ocupa el espacio disponible.
   */
  autoHeight?: boolean;
  /**
   * Dorso de un mazo de idioma, solo como contexto: texto y audios, sin el JavaScript del mazo (la evaluación
   * es de Yomi) ni imágenes o videos (eso es de los mazos personalizados).
   */
  languageContext?: boolean;
  /** Se llama cuando terminan los audios que sonaron solos (o enseguida, si no hay o la tarjeta no se dibuja). */
  onAutoplayDone?: () => void;
}

/** Alto máximo con autoHeight: corta un posible ciclo con CSS en vh (más alto -> imagen más alta -> …). */
const MAX_AUTO_HEIGHT = 4000;
/** Alto mientras la página todavía no informó el suyo. */
const MIN_AUTO_HEIGHT = 120;

/**
 * Tarjeta de un mazo de Anki dibujada con su propio diseño (plantillas, CSS y JavaScript del mazo),
 * en un WebView. La página se escribe como archivo dentro de `media/`, así las imágenes, fuentes y videos
 * del mazo se cargan desde disco con sus rutas relativas.
 */
export function AnkiCardView({
  deckId,
  auxiliaryInfo,
  side,
  autoplay = true,
  style,
  fallback = null,
  autoHeight = false,
  languageContext = false,
  onAutoplayDone,
}: AnkiCardViewProps) {
  const { isDark, colors } = useTheme();
  const webRef = useRef<WebView>(null);
  const [design, setDesign] = useState<AnkiDeckDesign | null | undefined>(undefined);
  const [pageUri, setPageUri] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [contentHeight, setContentHeight] = useState<number | null>(null);
  const shownAnswer = useRef(false);
  const onAutoplayDoneRef = useRef(onAutoplayDone);
  onAutoplayDoneRef.current = onAutoplayDone;
  const autoplayDone = () => onAutoplayDoneRef.current?.();

  useEffect(() => {
    let alive = true;
    if (!deckId) setDesign(null);
    else getDeckAnkiDesign(deckId).then((d) => alive && setDesign(d));
    return () => {
      alive = false;
    };
  }, [deckId]);

  const aux = useMemo(() => parseAux(auxiliaryInfo), [auxiliaryInfo]);

  const card = useMemo(() => {
    const ref = aux.anki;
    const noteType = ref && design?.noteTypes[String(ref.mid)];
    if (!ref || !noteType || !design) return null;
    const pathsByName = new Map<string, string>();
    for (const m of aux.media ?? []) if (m.path) pathsByName.set(m.file, m.path);
    const mediaUrl = (name: string) =>
      new File(Paths.document, pathsByName.get(name) ?? design.files[name] ?? mediaPath(sanitizeMediaName(name))).uri;
    try {
      const rendered = renderAnkiCard({ noteType, fields: ref.fields, ord: ref.ord, tags: ref.tags, mediaUrl });
      if (!languageContext) return rendered;
      return { ...rendered, question: textAndAudioOnly(rendered.question), answer: textAndAudioOnly(rendered.answer) };
    } catch {
      return null;
    }
  }, [aux, design, languageContext]);

  // La página empieza siempre con el frente (y el dorso se agrega después, como en Anki)
  useEffect(() => {
    if (!card) return;
    const file = new File(getMediaDir(), `.anki-card-${Date.now()}-${Math.random().toString(36).slice(2)}.html`);
    file.write(
      wrapCardHtml(card.question, card, {
        nightMode: isDark,
        platform: Platform.OS === 'ios' ? 'ios' : 'android',
        languageCode: design?.language,
        colors: { background: colors.surface, text: colors.text },
      })
    );
    shownAnswer.current = false;
    setLoaded(false);
    setPageUri(file.uri);
    return () => {
      stopMediaAudio();
      deleteFileQuietly(file.uri);
    };
  }, [card, isDark, colors, design?.language]);

  // Dorso: se inyecta en el mismo documento cuando corresponde (al cargar, o al tocar "Mostrar respuesta")
  useEffect(() => {
    if (!card || !loaded || side !== 'answer' || shownAnswer.current) return;
    shownAnswer.current = true;
    webRef.current?.injectJavaScript(`yomiShowAnswer(${JSON.stringify(card.answer)}); true;`);
    if (autoplay) playMediaSequence(card.answerAudio, autoplayDone);
  }, [card, loaded, side, autoplay]);

  // Sin tarjeta que dibujar no hay audios: avisar enseguida (el modo voz espera este aviso para avanzar)
  useEffect(() => {
    if (design !== undefined && !card) autoplayDone();
  }, [design, card]);

  if (design === undefined) {
    return (
      <View style={[styles.center, style]}>
        <ActivityIndicator />
      </View>
    );
  }
  if (!card) return <>{fallback}</>;

  const onLoadEnd = () => {
    setLoaded(true);
    if (autoplay && side === 'question') playMediaSequence(card.questionAudio, autoplayDone);
  };

  const onMessage = (event: WebViewMessageEvent) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);
      if (message?.type === 'play' && typeof message.url === 'string') playMediaAudio(message.url);
      if (message?.type === 'height' && autoHeight && typeof message.value === 'number') {
        const height = Math.min(Math.ceil(message.value), MAX_AUTO_HEIGHT);
        setContentHeight((current) => (current !== null && Math.abs(current - height) < 4 ? current : height));
      }
    } catch {}
  };

  return (
    <View style={[autoHeight ? { height: contentHeight ?? MIN_AUTO_HEIGHT } : styles.container, style]}>
      {pageUri && (
        <WebView
          ref={webRef}
          source={{ uri: pageUri }}
          originWhitelist={['*']}
          // Sólo para cargar la página y su media (img, audio, video, CSS). Sin allowFileAccessFromFileURLs ni
          // allowUniversalAccessFromFileURLs: el JavaScript del mazo (bajado de internet) no puede leer los
          // archivos de la app (la base con los mazos y el progreso) ni mandarlos afuera
          allowFileAccess
          allowingReadAccessToURL={getMediaDir().uri}
          // La tarjeta no sale de su página: los enlaces del mazo no llevan a ningún lado (se muestran como
          // texto, ver anki-template) y target=_blank tampoco abre ventanas
          onShouldStartLoadWithRequest={(request) => request.url.startsWith(pageUri) || request.url === 'about:blank'}
          setSupportMultipleWindows={false}
          mediaPlaybackRequiresUserAction={false}
          allowsInlineMediaPlayback
          allowsFullscreenVideo
          javaScriptEnabled
          // Con alto automático el scroll es el de la pantalla, no el del visor
          scrollEnabled={!autoHeight}
          nestedScrollEnabled
          onLoadEnd={onLoadEnd}
          onMessage={onMessage}
          style={styles.webview}
        />
      )}
    </View>
  );
}

/**
 * Deja solo texto y botones de audio: quita los <script> del mazo (con su código, para que no quede a la
 * vista), las imágenes y los videos.
 */
function textAndAudioOnly(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<script\b[\s\S]*$/i, '')
    .replace(/<video\b[\s\S]*?<\/video>/gi, '')
    // (svg no: es el ícono de los botones de audio)
    .replace(/<(?:img|video|source|picture|canvas)\b[^>]*>/gi, '');
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  webview: { flex: 1, backgroundColor: 'transparent' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
