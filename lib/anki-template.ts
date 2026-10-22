/**
 * Motor de plantillas de tarjetas de Anki: arma el HTML del frente y del dorso de una tarjeta a partir de
 * las plantillas del tipo de nota (qfmt / afmt), su CSS y los campos de la nota, igual que el reviewer de Anki.
 *
 * Es lo que permite mostrar cualquier mazo "como lo pensó su autor" (incluido su CSS y su JavaScript),
 * sin interpretar qué significa cada campo. No depende de módulos nativos: se puede probar en Node.
 *
 * Sintaxis soportada (la del reviewer de Anki): {{Campo}}, {{#Campo}}…{{/Campo}}, {{^Campo}}…{{/Campo}},
 * filtros encadenados ({{text:kana:Campo}}, se aplican de derecha a izquierda), {{FrontSide}}, {{Tags}},
 * {{Deck}}, {{Subdeck}}, {{Card}}, {{Type}}, y los filtros furigana, kana, kanji, text, cloze, cloze-only,
 * hint, type y edit.
 */

import { getMediaKind } from './media-types';

export interface AnkiCardTemplate {
  name: string;
  /** Plantilla del frente */
  qfmt: string;
  /** Plantilla del dorso */
  afmt: string;
}

export interface AnkiNoteType {
  name: string;
  /** 0 = estándar, 1 = cloze */
  kind: 0 | 1;
  css: string;
  fieldNames: string[];
  templates: AnkiCardTemplate[];
}

export interface RenderCardInput {
  noteType: AnkiNoteType;
  /** Valores de los campos, en el orden de noteType.fieldNames */
  fields: string[];
  /** Plantilla (tarjeta estándar) o número de cloze - 1 (tarjeta cloze): cards.ord */
  ord: number;
  tags?: string[];
  deckName?: string;
  /** URL con la que el visor encuentra cada archivo de media (nombre como lo referencia la nota) */
  mediaUrl: (fileName: string) => string;
}

export interface RenderedCard {
  /** HTML del cuerpo del frente / dorso (sin <html>; ver wrapCardHtml) */
  question: string;
  answer: string;
  /** Audios que se reproducen al mostrar cada lado, en orden (URLs de mediaUrl) */
  questionAudio: string[];
  answerAudio: string[];
  css: string;
  /** Clase de la tarjeta, como la pone Anki ("card card1") */
  cardClass: string;
}

// ─── Utilidades de texto ───────────────────────────────────────────────────────────────────────

const stripHtml = (html: string) =>
  html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");

/**
 * Anki considera vacío un campo que, sin HTML, sólo tiene espacios, pero conserva los nombres de archivo
 * de la media: un campo con sólo <img src="x.webp"> NO está vacío ({{#Image}} se muestra).
 */
const isEmptyField = (value: string) =>
  stripHtml(value.replace(/<(?:img|video|audio|source)\b[^>]*?\bsrc\s*=\s*["']?([^"'\s>]+)[^>]*>/gi, ' $1 '))
    .replace(/​/g, '')
    .trim() === '';

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Furigana de Anki: " 漢字[かんじ]" (el espacio inicial es separador, no se muestra). */
const FURIGANA = / ?([^ >]+?)\[(.+?)\]/g;

function furiganaFilter(text: string): string {
  return text.replace(FURIGANA, (_m, base: string, reading: string) =>
    reading.startsWith('sound:') ? _m : `<ruby><rb>${base}</rb><rt>${reading}</rt></ruby>`
  );
}
function kanaFilter(text: string): string {
  return text.replace(FURIGANA, (_m, _base: string, reading: string) => (reading.startsWith('sound:') ? _m : reading));
}
function kanjiFilter(text: string): string {
  return text.replace(FURIGANA, (_m, base: string, reading: string) => (reading.startsWith('sound:') ? _m : base));
}

function hintFilter(text: string, fieldName: string): string {
  if (isEmptyField(text)) return '';
  const id = `hint${Math.abs(hash(fieldName + text))}`;
  return (
    `<a class="hint" href="#" onclick="this.style.display='none';document.getElementById('${id}').style.display='block';return false;">` +
    `${escapeHtml(fieldName)}</a><div id="${id}" class="hint" style="display: none">${text}</div>`
  );
}

function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return h;
}

// ─── Cloze ─────────────────────────────────────────────────────────────────────────────────────

const CLOZE = /\{\{c(\d+)::([\s\S]*?)(?:::([\s\S]*?))?\}\}/g;

function clozeFilter(text: string, clozeNumber: number, side: 'question' | 'answer', only: boolean): string {
  if (only) {
    const parts = [...text.matchAll(CLOZE)].filter((m) => Number(m[1]) === clozeNumber).map((m) => m[2]);
    return parts.join(', ');
  }
  return text.replace(CLOZE, (_m, n: string, content: string, hint?: string) => {
    if (Number(n) !== clozeNumber) return content;
    return side === 'question'
      ? `<span class="cloze" data-cloze="${escapeHtml(content)}">[${hint ? escapeHtml(hint) : '...'}]</span>`
      : `<span class="cloze">${content}</span>`;
  });
}

// ─── Parser de plantillas ──────────────────────────────────────────────────────────────────────

type Node =
  | { type: 'text'; text: string }
  | { type: 'replace'; field: string; filters: string[] }
  | { type: 'conditional'; field: string; negated: boolean; children: Node[] };

function parseTemplate(template: string): Node[] {
  const root: Node[] = [];
  const stack: Array<{ field: string; children: Node[] }> = [{ field: '', children: root }];
  const tag = /\{\{([\s\S]*?)\}\}/g;
  let last = 0;

  for (const m of template.matchAll(tag)) {
    const current = stack[stack.length - 1].children;
    if (m.index! > last) current.push({ type: 'text', text: template.slice(last, m.index) });
    last = m.index! + m[0].length;

    const body = m[1].trim();
    const sigil = body[0];
    if (sigil === '#' || sigil === '^') {
      const node: Node = { type: 'conditional', field: body.slice(1).trim(), negated: sigil === '^', children: [] };
      current.push(node);
      stack.push({ field: node.field, children: node.children });
    } else if (sigil === '/') {
      // Anki exige que cierre el último abierto; si no coincide, se cierra igual para no romper la tarjeta
      if (stack.length > 1) stack.pop();
    } else {
      const parts = body.split(':');
      const field = parts.pop()!.trim();
      current.push({ type: 'replace', field, filters: parts.map((p) => p.trim()).reverse() });
    }
  }
  const tail = stack[stack.length - 1].children;
  if (last < template.length) tail.push({ type: 'text', text: template.slice(last) });
  return root;
}

interface RenderContext {
  side: 'question' | 'answer';
  fieldValues: Map<string, string>;
  specials: Map<string, string>;
  clozeNumber: number;
}

function fieldValue(ctx: RenderContext, name: string): string | undefined {
  return ctx.specials.get(name) ?? ctx.fieldValues.get(name);
}

function applyFilters(value: string, filters: string[], fieldName: string, ctx: RenderContext): string {
  let out = value;
  for (const filter of filters) {
    switch (filter) {
      case 'text':
        out = stripHtml(out);
        break;
      case 'furigana':
        out = furiganaFilter(out);
        break;
      case 'kana':
        out = kanaFilter(out);
        break;
      case 'kanji':
        out = kanjiFilter(out);
        break;
      case 'cloze':
        out = clozeFilter(out, ctx.clozeNumber, ctx.side, false);
        break;
      case 'cloze-only':
        out = clozeFilter(out, ctx.clozeNumber, ctx.side, true);
        break;
      case 'hint':
        out = hintFilter(out, fieldName);
        break;
      case 'type':
        // Respuesta escrita: el visor pone la caja de texto en el frente y la comparación en el dorso
        out =
          ctx.side === 'question'
            ? `<input type="text" id="typeans" class="typeans" autocomplete="off" autocapitalize="off" spellcheck="false">`
            : `<div id="typeans-expected" class="typeans" data-expected="${escapeHtml(stripHtml(out))}"></div>`;
        break;
      default:
        // edit:, nc:, tts y filtros de complementos: se muestra el campo tal cual (tts no tiene contenido visible)
        if (filter.startsWith('tts')) out = '';
        break;
    }
  }
  return out;
}

function renderNodes(nodes: Node[], ctx: RenderContext): string {
  let out = '';
  for (const node of nodes) {
    if (node.type === 'text') {
      out += node.text;
    } else if (node.type === 'replace') {
      const value = fieldValue(ctx, node.field);
      if (value === undefined) continue; // campo inexistente: Anki muestra un error; acá, nada
      out += applyFilters(value, node.filters, node.field, ctx);
    } else {
      const value = fieldValue(ctx, node.field) ?? '';
      const empty = isEmptyField(value);
      if (empty === node.negated) out += renderNodes(node.children, ctx);
    }
  }
  return out;
}

// ─── Media ─────────────────────────────────────────────────────────────────────────────────────

const SOUND = /\[sound:([^\]]+)\]/g;

/** Archivos que pide el HTML ya armado: src="…" de img/video/audio/source. */
const SRC_ATTR = /(<(?:img|video|audio|source)\b[^>]*?\bsrc\s*=\s*)(["'])([^"']+)\2/gi;

function decodeName(raw: string): string {
  let name = raw;
  try {
    name = decodeURIComponent(name);
  } catch {}
  return name.replace(/&amp;/gi, '&').trim().normalize('NFC');
}

/** Reemplaza [sound:x] por un botón de reproducir y apunta los src a la media local. */
function bindMedia(html: string, mediaUrl: (fileName: string) => string, audio: string[], autoplay: boolean): string {
  return html
    .replace(SRC_ATTR, (_m, start: string, quote: string, raw: string) => {
      if (/^(https?:|data:|file:)/i.test(raw)) return _m;
      return `${start}${quote}${escapeHtml(mediaUrl(decodeName(raw)))}${quote}`;
    })
    .replace(SOUND, (_m, raw: string) => {
      const name = decodeName(raw);
      const url = escapeHtml(mediaUrl(name));
      // Un video en [sound:] se ve en la tarjeta (Anki lo abre en su reproductor); el audio, con un botón
      if (getMediaKind(name) === 'video') {
        return `<video class="yomi-video" src="${url}" controls playsinline preload="metadata"${autoplay ? ' autoplay' : ''}></video>`;
      }
      if (autoplay) audio.push(mediaUrl(name));
      return (
        `<a class="replay-button soundLink" href="#" data-audio="${url}" onclick="return yomiPlay(this);">` +
        `<svg class="playImage" viewBox="0 0 64 64" width="40" height="40"><circle cx="32" cy="32" r="29" fill="none" stroke="currentColor" stroke-width="4"/>` +
        `<path d="M25 18 L46 32 L25 46 Z" fill="currentColor"/></svg></a>`
      );
    });
}

// ─── Tipografía de Yomi ────────────────────────────────────────────────────────────────────────

/** Tipografías de íconos: sin ellas se verían letras sueltas, así que se conservan. */
const ICON_FONT = /icon|awesome|material|symbol/i;
/** Tipografías de orden de trazos: Yomi tiene su propio visor (KanjiVG / AnimCJK), las secciones se ocultan. */
const STROKE_ORDER_FONT = /stroke|kanjivg|筆順|書き順/i;
const FONT_FILE = /\.(ttf|otf|woff2?)$/i;

/** Valor de una declaración CSS (con nombres entre comillas): hasta ; o } */
const CSS_VALUE = String.raw`((?:"[^"]*"|'[^']*'|[^;}"'])+)`;
const FONT_FAMILY_DECL = new RegExp(String.raw`font-family\s*:\s*` + CSS_VALUE, 'gi');
const FONT_SHORTHAND_DECL = new RegExp(String.raw`(^|[\s;{])font\s*:\s*` + CSS_VALUE, 'gi');

/**
 * Las tarjetas se ven con la tipografía de Yomi (la del sistema, la misma que el resto de la app),
 * no con la del autor del mazo. Las de íconos se conservan; las de orden de trazos ocultan su sección.
 */
function adaptCssFonts(css: string): string {
  return css
    .replace(/@font-face\s*\{[^}]*\}/gi, (block) => (ICON_FONT.test(block) ? block : ''))
    .replace(FONT_FAMILY_DECL, (decl, value: string) => {
      if (ICON_FONT.test(value)) return decl;
      if (STROKE_ORDER_FONT.test(value)) return 'font-family: var(--yomi-font); display: none !important';
      return 'font-family: var(--yomi-font)';
    })
    .replace(FONT_SHORTHAND_DECL, (decl, start: string, value: string) => {
      if (ICON_FONT.test(value)) return decl;
      const hide = STROKE_ORDER_FONT.test(value) ? '; display: none !important' : '';
      return `${start}font: ${value.trim()}; font-family: var(--yomi-font)${hide}`;
    });
}

/** Lo mismo dentro del HTML de los campos y plantillas: atributos style, bloques <style> y <font face>. */
function adaptHtmlFonts(html: string): string {
  return html
    .replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (_m, open: string, css: string, close: string) => open + adaptCssFonts(css) + close)
    .replace(/(\bstyle\s*=\s*)"([^"]*)"/gi, (_m, start: string, css: string) => `${start}"${adaptCssFonts(css)}"`)
    .replace(/(\bstyle\s*=\s*)'([^']*)'/gi, (_m, start: string, css: string) => `${start}'${adaptCssFonts(css)}'`)
    .replace(/(<font\b[^>]*?)\s+face\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '$1');
}

/**
 * Los enlaces del mazo que llevan fuera de la tarjeta (diccionarios, buscadores, otras apps) se muestran como
 * texto: la tarjeta no sale de Yomi. Los internos (href="#", javascript:) siguen: botones de audio, pistas.
 */
function disableExternalLinks(html: string): string {
  return html.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (link, attrs: string, content: string) => {
    const href = attrs.match(/\bhref\s*=\s*["']?\s*([^"'\s>]*)/i)?.[1];
    if (href === undefined || href.startsWith('#') || /^javascript:/i.test(href)) return link;
    return `<span class="yomi-link">${content}</span>`;
  });
}

/** Ajustes de Yomi sobre el HTML de una tarjeta ya armada: su tipografía y sin enlaces hacia afuera. */
function adaptCardHtml(html: string): string {
  return disableExternalLinks(adaptHtmlFonts(html));
}

/**
 * Idioma del documento y tipografía del sistema según el idioma del mazo ("ja-JP", "zh-CN"…): con el idioma
 * el WebView elige la forma japonesa o china de cada kanji/hanzi (直, 骨, 角 cambian entre los dos).
 */
function cardTypography(languageCode?: string): { lang?: string; fontStack: string } {
  if (languageCode?.startsWith('ja')) {
    return {
      lang: 'ja',
      fontStack: 'system-ui, -apple-system, "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans CJK JP", "Noto Sans JP", Roboto, sans-serif',
    };
  }
  if (languageCode?.startsWith('zh')) {
    return { lang: 'zh-Hans', fontStack: 'system-ui, -apple-system, "PingFang SC", "Noto Sans CJK SC", "Noto Sans SC", Roboto, sans-serif' };
  }
  return { fontStack: 'system-ui, -apple-system, Roboto, "Noto Sans CJK JP", sans-serif' };
}

/** Rutas del CSS del mazo (fuentes, @import) apuntando a los archivos guardados. */
function bindCssUrls(css: string, mediaUrl: (fileName: string) => string): string {
  const resolve = (raw: string) => (/^(https?:|data:|file:|#)/i.test(raw) ? raw : mediaUrl(decodeName(raw)));
  return css
    .replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi, (_m, quote: string, raw: string) => `url(${quote}${resolve(raw)}${quote})`)
    .replace(/@import\s+(["'])([^"']+)\1/gi, (_m, quote: string, raw: string) => `@import ${quote}${resolve(raw)}${quote}`);
}

// ─── API ───────────────────────────────────────────────────────────────────────────────────────

/** Arma el frente y el dorso de una tarjeta. */
export function renderAnkiCard(input: RenderCardInput): RenderedCard {
  const { noteType, fields, ord } = input;
  const isCloze = noteType.kind === 1;
  const template = isCloze ? noteType.templates[0] : noteType.templates[ord];
  if (!template) throw new Error(`El tipo de nota "${noteType.name}" no tiene la plantilla ${ord}`);

  const fieldValues = new Map<string, string>();
  noteType.fieldNames.forEach((name, i) => fieldValues.set(name, fields[i] ?? ''));

  const deck = input.deckName ?? '';
  const specials = new Map<string, string>([
    ['Tags', (input.tags ?? []).join(' ')],
    ['Deck', deck],
    ['Subdeck', deck.split('::').pop() ?? ''],
    ['Card', template.name],
    ['CardFlag', ''],
    ['Type', noteType.name],
  ]);
  const clozeNumber = isCloze ? ord + 1 : 0;

  const questionRaw = renderNodes(parseTemplate(template.qfmt), { side: 'question', fieldValues, specials, clozeNumber });
  const questionAudio: string[] = [];
  const question = adaptCardHtml(bindMedia(questionRaw, input.mediaUrl, questionAudio, true));

  // En el dorso, {{FrontSide}} es el frente ya armado; sus audios no se vuelven a reproducir solos
  // (sin la caja de {{type:}}: en el dorso la respuesta escrita se ve en la comparación, como en Anki)
  const frontSideHtml = bindMedia(questionRaw, input.mediaUrl, [], false).replace(/<input type="text" id="typeans"[^>]*>/g, '');
  const answerSpecials = new Map(specials);
  answerSpecials.set('FrontSide', '\u0000FRONTSIDE\u0000');
  const answerRaw = renderNodes(parseTemplate(template.afmt), { side: 'answer', fieldValues, specials: answerSpecials, clozeNumber });
  const answerAudio: string[] = [];
  const answer = adaptCardHtml(
    bindMedia(answerRaw, input.mediaUrl, answerAudio, true).split('\u0000FRONTSIDE\u0000').join(frontSideHtml)
  );

  return {
    question,
    answer,
    questionAudio,
    answerAudio,
    css: bindCssUrls(adaptCssFonts(noteType.css), input.mediaUrl),
    cardClass: `card card${(isCloze ? 0 : ord) + 1}`,
  };
}

/**
 * Archivos de media que pide el diseño del tipo de nota (CSS importado, imágenes del CSS o de las plantillas,
 * p. ej. @import "_estilos.css" o <img src="_logo.png">). Las notas no los referencian, así que hay que
 * extraerlos aparte. Las tipografías no: las tarjetas usan la de Yomi.
 */
export function noteTypeMediaFiles(noteType: AnkiNoteType): string[] {
  const files = new Set<string>();
  const source = [noteType.css, ...noteType.templates.flatMap((t) => [t.qfmt, t.afmt])].join('\n');
  for (const m of source.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) files.add(decodeName(m[1]));
  for (const m of source.matchAll(/@import\s+["']([^"']+)["']/gi)) files.add(decodeName(m[1]));
  for (const m of source.matchAll(/\bsrc\s*=\s*["']([^"'{}]+)["']/gi)) files.add(decodeName(m[1]));
  // Las tipografías no hacen falta (se usa la de Yomi), salvo las de íconos
  return [...files].filter((f) => !/^(https?:|data:|#)/i.test(f) && (!FONT_FILE.test(f) || ICON_FONT.test(f)));
}

/**
 * Documento HTML completo para el visor (WebView): CSS del mazo, clases que pone Anki (los mazos las usan
 * para adaptarse a móvil y modo oscuro) y un reproductor de audio para los botones de [sound:].
 */
export function wrapCardHtml(
  body: string,
  card: RenderedCard,
  options: {
    nightMode?: boolean;
    platform?: 'android' | 'ios';
    /** Idioma del contenido del mazo ("ja-JP", "zh-CN"…): elige la forma de kanji/hanzi */
    languageCode?: string;
    /** Fondo y color base del texto de Yomi (los colores puntuales del mazo se mantienen) */
    colors?: { background: string; text: string };
  } = {}
): string {
  const platform = options.platform ?? 'android';
  const night = options.nightMode ? ' nightMode night_mode' : '';
  const { lang, fontStack } = cardTypography(options.languageCode);
  const yomiBase = `
:root { --yomi-font: ${fontStack}; }
html, body, .card { font-family: var(--yomi-font); }
${options.colors ? `html, body { background: ${options.colors.background} !important; }
.card { background: transparent !important; color: ${options.colors.text} !important; }` : ''}`;
  return `<!doctype html>
<html class="mobile ${platform} js${options.nightMode ? ' night-mode' : ''}"${lang ? ` lang="${lang}"` : ''}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
body { margin: 0; padding: 12px; }
.replay-button { display: inline-block; vertical-align: middle; color: inherit; text-decoration: none; }
.yomi-video { display: block; max-width: 100%; margin: 8px auto; }
/* Imágenes al ancho de la pantalla (como en Anki): las del mazo suelen ser más grandes y había que achicarlas
   a mano. !important porque el CSS del mazo, que va después, suele fijarles un ancho en píxeles */
img { max-width: 100% !important; height: auto !important; }
.typeGood { color: #10b981; } .typeBad { color: #ef4444; text-decoration: line-through; } .typeMissed { color: #10b981; }
.typeans { font-size: 1.1em; width: 90%; }
</style>
<style>${card.css}</style>
<style>${yomiBase}</style>
<script>
var yomiAudio = null;
function yomiPlay(el) {
  var url = el.getAttribute('data-audio');
  if (window.ReactNativeWebView) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'play', url: url }));
  } else {
    if (yomiAudio) yomiAudio.pause();
    yomiAudio = new Audio(url);
    yomiAudio.play();
  }
  return false;
}
/* Los <script> insertados con innerHTML no se ejecutan: se recrean (como hace el reviewer de Anki) */
function yomiRunScripts(root) {
  var scripts = root.querySelectorAll('script');
  for (var i = 0; i < scripts.length; i++) {
    var old = scripts[i];
    var fresh = document.createElement('script');
    for (var j = 0; j < old.attributes.length; j++) fresh.setAttribute(old.attributes[j].name, old.attributes[j].value);
    fresh.text = old.text;
    old.parentNode.replaceChild(fresh, old);
  }
}
function yomiEscape(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
/* Muestra el dorso en el mismo documento, conservando lo que se escribió en {{type:Campo}} */
function yomiShowAnswer(html) {
  var typed = document.getElementById('typeans');
  var typedValue = typed ? typed.value : '';
  var qa = document.getElementById('qa');
  qa.innerHTML = html;
  yomiRunScripts(qa);
  var expected = document.getElementById('typeans-expected');
  if (expected) {
    var want = expected.getAttribute('data-expected') || '';
    var ok = typedValue.trim().toLowerCase() === want.trim().toLowerCase();
    expected.innerHTML = ok
      ? '<span class="typeGood">' + yomiEscape(want) + '</span>'
      : (typedValue ? '<span class="typeBad">' + yomiEscape(typedValue) + '</span><br>' : '') +
        '<span class="typeMissed">' + yomiEscape(want) + '</span>';
  }
  // Como Anki: el dorso suele repetir el frente ({{FrontSide}}) y después <hr id=answer>. Se salta hasta ahí
  // para que se vea la respuesta y no otra vez la imagen o el gif del frente (queda arriba, a un scroll)
  // Si la tarjeta no entra en la pantalla, se agrega lugar debajo para que la respuesta pueda quedar arriba
  var answer = document.getElementById('answer');
  document.body.style.minHeight = '';
  if (answer && document.documentElement.scrollHeight > window.innerHeight) {
    document.body.style.minHeight = (answer.getBoundingClientRect().top + window.scrollY + window.innerHeight) + 'px';
    answer.scrollIntoView({ block: 'start' });
  } else {
    window.scrollTo(0, 0);
  }
  yomiReportHeight();
}
/* Alto del contenido, para que la app ajuste el visor (se mide la tarjeta, no el documento:
   el documento nunca es más bajo que el visor y no le permitiría achicarse) */
function yomiReportHeight() {
  var qa = document.getElementById('qa');
  if (!window.ReactNativeWebView || !qa) return;
  var height = qa.getBoundingClientRect().bottom + window.scrollY + 12;
  window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'height', value: height }));
}
document.addEventListener('DOMContentLoaded', function () {
  yomiReportHeight();
  if (window.ResizeObserver) new ResizeObserver(yomiReportHeight).observe(document.getElementById('qa'));
});
window.addEventListener('load', yomiReportHeight);
</script>
</head>
<body class="${card.cardClass}${night}">
<div id="qa">${body}</div>
</body>
</html>`;
}
