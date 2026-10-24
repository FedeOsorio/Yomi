import { File, Paths } from 'expo-file-system';
import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { renderAnkiCard, wrapCardHtml } from '../../../lib/anki-template';
import { AnkiDeckDesign, getDeckAnkiDesign } from '../../../lib/deck-service';
import {
  CARD_PAGE_PREFIX,
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
}

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
}: AnkiCardViewProps) {
  const { isDark, colors } = useTheme();
  const webRef = useRef<WebView>(null);
  const [design, setDesign] = useState<AnkiDeckDesign | null | undefined>(undefined);
  const [pageUri, setPageUri] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const shownAnswer = useRef(false);

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
      return renderAnkiCard({ noteType, fields: ref.fields, ord: ref.ord, tags: ref.tags, mediaUrl });
    } catch {
      return null;
    }
  }, [aux, design]);

  // La página empieza siempre con el frente (y el dorso se agrega después, como en Anki)
  useEffect(() => {
    if (!card) return;
    const file = new File(getMediaDir(), `${CARD_PAGE_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2)}.html`);
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
    if (autoplay) playMediaSequence(card.answerAudio);
  }, [card, loaded, side, autoplay]);

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
    if (autoplay && side === 'question') playMediaSequence(card.questionAudio);
  };

  const onMessage = (event: WebViewMessageEvent) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);
      if (message?.type === 'play' && typeof message.url === 'string') playMediaAudio(message.url);
    } catch {}
  };

  return (
    <View style={[styles.container, style]}>
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
          nestedScrollEnabled
          onLoadEnd={onLoadEnd}
          onMessage={onMessage}
          style={styles.webview}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  webview: { flex: 1, backgroundColor: 'transparent' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
