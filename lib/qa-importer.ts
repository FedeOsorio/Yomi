/**
 * Módulo desacoplado para análisis (parsing) y transformación de texto de preguntas
 * y respuestas generadas por Inteligencia Artificial (ChatGPT, Claude, Gemini, etc.)
 * o ingresadas manualmente para mazos personalizados (custom decks).
 *
 * Diseñado para soportar preguntas y respuestas complejas, extensas y multilínea.
 */

import { Share } from 'react-native';

export interface CustomCardImportItem {
  id: string; // ID temporal en memoria para la lista de previsualización
  question: string;
  answer: string;
}

export interface ParseCustomQaResult {
  items: CustomCardImportItem[];
  totalParsed: number;
  warnings: string[];
}

/**
 * Plantilla de prompt optimizada para que el usuario la copie y pegue en su IA preferida.
 */
export const AI_STUDY_PROMPT_TEMPLATE = `Actúa como un profesor universitario y pedagogo experto. A partir del texto, apuntes o documento que te proporciono a continuación, genera tarjetas de estudio para repasar con repetición espaciada.

FORMATO OBLIGATORIO DE SALIDA:
Genera cada tarjeta usando exactamente este formato:

Pregunta: [Escribe aquí una pregunta clara, directa y concisa]
Respuesta: [Escribe aquí la respuesta explicativa, completa y precisa]

REGLAS ESTRICTAS:
1. No incluyas introducciones ni saludos (ej: "¡Claro! Aquí tienes las tarjetas...").
2. No enumeres las preguntas ni las respuestas (no pongas "1.", "2."). Solo el prefijo "Pregunta:" y "Respuesta:".
3. Deja una línea en blanco entre cada tarjeta.
4. Las respuestas pueden contener explicaciones detalladas o viñetas si el concepto lo amerita.
5. No agregues conclusiones, despedidas ni notas finales.

CONTENIDO A PROCESAR:
[Pega aquí tus apuntes, resumen o documento]`;

/**
 * Comparte o permite copiar el prompt de estudio al portapapeles a través del share sheet nativo.
 */
export async function copyOrShareAiPrompt(): Promise<boolean> {
  try {
    const result = await Share.share({
      title: 'Prompt para generar tarjetas con IA en Yomi',
      message: AI_STUDY_PROMPT_TEMPLATE,
    });
    return result.action === Share.sharedAction;
  } catch (error) {
    console.warn('[QA-Importer] Error al compartir prompt:', error);
    return false;
  }
}

/**
 * Detecta si el texto ingresado tiene indicios claros de ser formato Pregunta/Respuesta
 * proveniente de IA o apuntes.
 */
export function isLikelyQaFormat(text: string): boolean {
  if (!text || text.trim().length === 0) return false;
  const hasQuestion = /(?:pregunta|question|^p\b|^q\b)/im.test(text);
  const hasAnswer = /(?:respuesta|answer|resp\b|^r\b|^a\b)/im.test(text);
  return hasQuestion && hasAnswer;
}

/**
 * Limpia delimitadores gruesos de markdown si envuelven por completo un bloque.
 */
function cleanMarkdownWrappers(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith('**') && cleaned.endsWith('**') && cleaned.length > 4) {
    cleaned = cleaned.slice(2, -2).trim();
  } else if (cleaned.startsWith('__') && cleaned.endsWith('__') && cleaned.length > 4) {
    cleaned = cleaned.slice(2, -2).trim();
  }
  return cleaned;
}

/**
 * Expresión regular para detectar el inicio de una PREGUNTA.
 * Soporta:
 * - Pregunta: / pregunta: / PREGUNTA:
 * - 1. Pregunta: / 1) Pregunta: / - Pregunta: / * Pregunta:
 * - **Pregunta:** / **Pregunta**: / __Pregunta__:
 * - Pregunta 1: / Pregunta 2:
 * - Question: / **Question:**
 * - P: / p: / Q: / q:
 */
const QUESTION_START_REGEX =
  /^(?:(?:\d+[\.\)]|[-*•#>]+)\s*)?(?:\*\*|__)?(?:(?:pregunta|question)(?:\s*\d+)?\s*[:：\-–—.]|(?:p|q)(?:\s*\d+)?\s*[:：\-–—])(?:\*\*|__)?\s*(.*)$/i;

/**
 * Expresión regular para detectar el inicio de una RESPUESTA.
 * Soporta:
 * - Respuesta: / respuesta: / RESPUESTA:
 * - 1. Respuesta: / 1) Respuesta: / - Respuesta: / * Respuesta:
 * - **Respuesta:** / **Respuesta**: / __Respuesta__:
 * - Respuesta 1: / Respuesta 2:
 * - Answer: / **Answer:**
 * - R: / r: / A: / a:
 */
const ANSWER_START_REGEX =
  /^(?:(?:\d+[\.\)]|[-*•#>]+)\s*)?(?:\*\*|__)?(?:(?:respuesta|answer|resp)(?:\s*\d+)?\s*[:：\-–—.]|(?:r|a)(?:\s*\d+)?\s*[:：\-–—])(?:\*\*|__)?\s*(.*)$/i;

/**
 * Patrón para descartar frases de cierre coloquiales de IA si quedaron al final del texto.
 */
const AI_CLOSING_PHRASE_REGEX =
  /^(?:espero que|si necesitas m[aá]s|si quer[eé]s m[aá]s|av[ií]same si|ojal[aá] te sirva|espero te sea de ayuda|¡?buena suerte|buen estudio|¿deseas m[aá]s|si tienes alguna otra duda)/i;

/**
 * Analiza un bloque de texto libre y extrae pares de { pregunta, respuesta },
 * admitiendo contenido multilínea y listas dentro de las respuestas.
 */
export function parseCustomQaText(rawText: string): ParseCustomQaResult {
  if (!rawText || !rawText.trim()) {
    return { items: [], totalParsed: 0, warnings: [] };
  }

  const lines = rawText.split(/\r?\n/);
  const items: CustomCardImportItem[] = [];
  const warnings: string[] = [];

  let currentQuestionLines: string[] = [];
  let currentAnswerLines: string[] = [];
  let state: 'IDLE' | 'IN_QUESTION' | 'IN_ANSWER' = 'IDLE';

  const flushCard = () => {
    // Si la última respuesta incluye una frase de cierre típica de ChatGPT al final, removerla
    if (currentAnswerLines.length > 1) {
      const lastLine = currentAnswerLines[currentAnswerLines.length - 1].trim();
      if (AI_CLOSING_PHRASE_REGEX.test(lastLine)) {
        currentAnswerLines.pop();
      }
    }

    const q = cleanMarkdownWrappers(currentQuestionLines.join('\n').trim());
    const a = cleanMarkdownWrappers(currentAnswerLines.join('\n').trim());

    if (q && a) {
      items.push({
        id: `card_${items.length + 1}_${Date.now()}`,
        question: q,
        answer: a,
      });
    } else if (q && !a) {
      warnings.push(`Se omitió la pregunta sin respuesta: "${q.slice(0, 45)}..."`);
    }

    currentQuestionLines = [];
    currentAnswerLines = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // Omitir líneas separadoras de markdown (ej. --- o *** o ===)
    if (/^[-*_=\s]{3,}$/.test(trimmed)) {
      continue;
    }

    const questionMatch = trimmed.match(QUESTION_START_REGEX);
    if (questionMatch) {
      if (state === 'IN_ANSWER' || (currentQuestionLines.length > 0 && currentAnswerLines.length > 0)) {
        flushCard();
      }
      state = 'IN_QUESTION';
      const captured = questionMatch[1]?.trim();
      if (captured) {
        currentQuestionLines.push(captured);
      }
      continue;
    }

    const answerMatch = trimmed.match(ANSWER_START_REGEX);
    if (answerMatch) {
      state = 'IN_ANSWER';
      const captured = answerMatch[1]?.trim();
      if (captured) {
        currentAnswerLines.push(captured);
      }
      continue;
    }

    if (state === 'IN_QUESTION') {
      if (!trimmed && currentQuestionLines.length === 0) continue;
      if (!trimmed && currentQuestionLines[currentQuestionLines.length - 1] === '') continue;
      currentQuestionLines.push(rawLine);
    } else if (state === 'IN_ANSWER') {
      if (!trimmed && currentAnswerLines.length === 0) continue;
      if (!trimmed && currentAnswerLines[currentAnswerLines.length - 1] === '') continue;
      currentAnswerLines.push(rawLine);
    }
  }

  // Descargar la última tarjeta pendiente
  flushCard();

  // Fallback si no se detectaron etiquetas explícitas: probar delimitadores (tabulación, pipe, punto y coma)
  if (items.length === 0) {
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || /^[-*_=\s]{3,}$/.test(trimmed)) continue;

      let parts: string[] = [];
      if (trimmed.includes('\t')) {
        parts = trimmed.split('\t');
      } else if (trimmed.includes('|')) {
        parts = trimmed.split('|').filter((p) => p.trim() && !/^[-:\s]+$/.test(p));
      } else if (trimmed.includes(';')) {
        parts = trimmed.split(';');
      }

      if (parts.length >= 2) {
        const q = cleanMarkdownWrappers(parts[0].trim());
        const a = cleanMarkdownWrappers(parts.slice(1).join(' ').trim());
        if (q && a) {
          items.push({
            id: `fallback_${items.length + 1}_${Date.now()}`,
            question: q,
            answer: a,
          });
        }
      }
    }
  }

  return {
    items,
    totalParsed: items.length,
    warnings,
  };
}
