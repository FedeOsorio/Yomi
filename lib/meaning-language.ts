/**
 * Idioma en que están escritos los significados de un mazo (español, inglés o portugués), para escuchar la
 * respuesta con el reconocedor de ese idioma. Una traducción sola dice poco ("tele"), así que se juntan las
 * de todo el mazo: artículos, palabras frecuentes y letras propias de cada idioma (ñ, ¿, ã, ç…).
 */

const WORDS: Record<string, Set<string>> = {
  'es-ES': new Set(
    'el la los las un una unos unas de del al que y o no sí es son está esto eso esta este ese esa por para con sin muy algo cosa hacer ser estar tener ir decir pero también cuando donde cómo qué quién'.split(' ')
  ),
  'en-US': new Set(
    'the a an of to and or not is are be this that it its for with without very something thing do make have go say but also when where how what who which one'.split(' ')
  ),
  'pt-BR': new Set(
    'o os as um uma uns umas do da dos das ao que e ou não sim é são está isto isso esta este por para com sem muito algo coisa fazer ser estar ter ir dizer mas também quando onde como quem'.split(' ')
  ),
};

const LETTERS: Record<string, RegExp> = {
  'es-ES': /[ñ¿¡]/g,
  'pt-BR': /[ãõçâêô]/g,
};

/** Devuelve el idioma más probable de los significados, o null si no hay pistas suficientes. */
export function detectMeaningLocale(meanings: string[]): string | null {
  const score: Record<string, number> = { 'es-ES': 0, 'en-US': 0, 'pt-BR': 0 };
  for (const meaning of meanings) {
    const text = meaning.toLowerCase();
    for (const [locale, letters] of Object.entries(LETTERS)) score[locale] += (text.match(letters) || []).length * 2;
    for (const word of text.split(/[^a-záéíóúüñãõçâêôà]+/)) {
      for (const [locale, words] of Object.entries(WORDS)) if (words.has(word)) score[locale]++;
    }
  }
  const [best, second] = Object.entries(score).sort((a, b) => b[1] - a[1]);
  // Sin pistas o empate: que decida quien llama (el idioma de la app)
  return best[1] > 0 && best[1] > second[1] ? best[0] : null;
}
