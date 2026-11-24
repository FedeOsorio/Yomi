import { SupportedLanguage } from '../src/i18n/types';

const EN_WORDS = new Set([
  'to', 'the', 'of', 'and', 'a', 'in', 'that', 'have', 'i', 'it', 'for', 'not', 'on', 'with', 'he', 'as',
  'you', 'do', 'at', 'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she', 'or', 'an',
  'will', 'my', 'one', 'all', 'would', 'there', 'their', 'what', 'so', 'up', 'out', 'if', 'about', 'who',
  'get', 'which', 'go', 'me', 'when', 'make', 'can', 'like', 'time', 'no', 'just', 'him', 'know', 'take',
  'people', 'into', 'year', 'your', 'good', 'some', 'could', 'them', 'see', 'other', 'than', 'then', 'now',
  'look', 'only', 'come', 'its', 'over', 'think', 'also', 'back', 'after', 'use', 'two', 'how', 'our',
  'work', 'first', 'well', 'way', 'even', 'new', 'want', 'because', 'any', 'these', 'give', 'day', 'most',
  'us', 'great', 'such', 'person', 'house', 'water', 'fire', 'food', 'action', 'state', 'thing', 'place',
  'group', 'sound', 'feeling', 'light', 'dark', 'world', 'life', 'part', 'hand', 'eye', 'mind', 'word',
  'name', 'number', 'friend', 'eat', 'drink', 'read', 'write', 'book', 'car', 'dog', 'cat', 'big', 'small',
  'long', 'short', 'red', 'blue', 'white', 'black', 'green', 'man', 'woman', 'child', 'body', 'head', 'foot',
  'face', 'door', 'room', 'city', 'country', 'sea', 'river', 'tree', 'flower', 'sun', 'moon', 'star',
  'wind', 'rain', 'snow', 'esp', 'especially', 'usually', 'formal', 'informal', 'often', 'archaic', 'slang',
  'colloquial', 'used', 'having', 'being', 'made', 'relating', 'pertaining', 'similar', 'someone', 'something',
  'anything', 'nothing', 'everything', 'somewhere'
]);

const ES_WORDS = new Set([
  'de', 'la', 'el', 'en', 'y', 'a', 'los', 'las', 'del', 'al', 'un', 'una', 'por', 'para', 'con', 'no',
  'su', 'sus', 'lo', 'como', 'más', 'pero', 'este', 'esta', 'estos', 'estas', 'ese', 'esa', 'esos', 'esas',
  'aquel', 'aquella', 'hacer', 'tener', 'ser', 'estar', 'ir', 'persona', 'casa', 'tiempo', 'año', 'día',
  'palabra', 'ver', 'decir', 'poder', 'dar', 'saber', 'querer', 'llegar', 'pasar', 'deber', 'poner', 'parecer',
  'quedar', 'creer', 'hablar', 'llevar', 'dejar', 'seguir', 'encontrar', 'llamar', 'venir', 'pensar', 'salir',
  'volver', 'tomar', 'conocer', 'sentir', 'tratar', 'mirar', 'contar', 'empezar', 'esperar', 'buscar', 'existir',
  'entrar', 'trabajar', 'escribir', 'perder', 'producir', 'ocurrir', 'entender', 'pedir', 'recibir', 'recordar',
  'terminar', 'permitir', 'aparecer', 'conseguir', 'comenzar', 'servir', 'sacar', 'necesitar', 'mantener',
  'resultar', 'leer', 'caer', 'cambiar', 'presentar', 'crear', 'abrir', 'considerar', 'oir', 'acabar', 'ganar',
  'formar', 'traer', 'partir', 'morir', 'aceptar', 'realizar', 'suponer', 'comprender', 'lograr', 'explicar',
  'preguntar', 'tocar', 'reconocer', 'agua', 'fuego', 'amigo', 'escuela', 'libro', 'perro', 'rojo', 'hoy',
  'comer', 'beber', 'hombre', 'mujer', 'niño', 'cuerpo', 'cabeza', 'pie', 'cara', 'puerta', 'habitación',
  'cuarto', 'ciudad', 'país', 'mar', 'río', 'árbol', 'flor', 'sol', 'luna', 'estrella', 'viento', 'lluvia',
  'nieve', 'esp', 'especialmente', 'usualmente', 'formal', 'informal', 'usado', 'usada', 'relativo', 'relativa',
  'alguien', 'algo', 'nada', 'todo', 'donde', 'cuando', 'quien', 'cual'
]);

const PT_WORDS = new Set([
  'de', 'a', 'o', 'da', 'do', 'em', 'um', 'uma', 'para', 'com', 'não', 'como', 'mais', 'mas', 'este',
  'esta', 'fazer', 'ter', 'ser', 'estar', 'ir', 'pessoa', 'casa', 'tempo', 'ano', 'dia', 'palavra', 'ver',
  'dizer', 'poder', 'dar', 'saber', 'querer', 'chegar', 'passar', 'dever', 'pôr', 'parecer', 'ficar',
  'crer', 'falar', 'levar', 'deixar', 'seguir', 'encontrar', 'chamar', 'vir', 'pensar', 'sair', 'voltar',
  'tomar', 'conhecer', 'sentir', 'olhar', 'começar', 'esperar', 'procurar', 'entrar', 'trabalhar', 'escrever',
  'perder', 'entender', 'pedir', 'receber', 'lembrar', 'terminar', 'abrir', 'água', 'fogo', 'amigo',
  'escola', 'livro', 'cão', 'cachorro', 'vermelho', 'hoje', 'comer', 'beber', 'homem', 'mulher'
]);

/**
 * Detecta de forma heurística el idioma en el que están redactados los significados de una palabra.
 * Devuelve 'en' | 'es' | 'pt' | 'ja', o null si no se puede determinar.
 */
export function detectMeaningsLanguage(meanings: string[]): SupportedLanguage | null {
  if (!meanings || meanings.length === 0) return null;

  const text = meanings.join(' ').toLowerCase();

  // 1. Caracteres japoneses (hiragana / katakana)
  if (/[\u3040-\u30ff]/.test(text)) return 'ja';

  // 2. Caracteres inequívocos
  if (/[ñ¿¡]/.test(text)) return 'es';
  if (/[çãõ]/.test(text)) return 'pt';

  const tokens = text.match(/[a-záéíóúâêôãõçñ]+/g) || [];
  let enScore = 0;
  let esScore = 0;
  let ptScore = 0;

  // Verbos en infinitivo en inglés (ej. "to go", "to eat", típico de JMDict)
  if (/\bto\s+[a-z]+/.test(text)) enScore += 4;

  for (const t of tokens) {
    if (EN_WORDS.has(t)) enScore++;
    if (ES_WORDS.has(t)) esScore++;
    if (PT_WORDS.has(t)) ptScore++;

    // Sufijos comunes
    if (t.endsWith('tion') || t.endsWith('ing') || t.endsWith('ed') || t.endsWith('ly') || t.endsWith('ness')) {
      enScore += 2;
    }
    if (t.endsWith('ción') || t.endsWith('sión') || t.endsWith('mente') || t.endsWith('ando') || t.endsWith('iendo') || t.endsWith('ado') || t.endsWith('ido')) {
      esScore += 2;
    }
    if (t.endsWith('ção') || t.endsWith('são') || t.endsWith('osamente')) {
      ptScore += 2;
    }
  }

  const maxScore = Math.max(enScore, esScore, ptScore);
  if (maxScore === 0) return null;

  if (enScore === maxScore && enScore > esScore && enScore > ptScore) return 'en';
  if (esScore === maxScore && esScore > enScore && esScore > ptScore) return 'es';
  if (ptScore === maxScore && ptScore > enScore && ptScore > esScore) return 'pt';

  return null;
}
