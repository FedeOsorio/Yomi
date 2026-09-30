/**
 * Módulo desacoplado para análisis (parsing) y transformación de texto de preguntas
 * y respuestas generadas por Inteligencia Artificial (ChatGPT, Claude, Gemini, etc.)
 * o ingresadas manualmente para mazos personalizados (custom decks).
 *
 * Diseñado para soportar preguntas y respuestas complejas, extensas, inline o multilínea.
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
 * Plantilla de prompt directa y concisa para IA.
 */
export const AI_STUDY_PROMPT_TEMPLATE = `A partir de mis apuntes, genera tarjetas de estudio usando exactamente este formato:

Pregunta: [Pregunta clara]
Respuesta: [Respuesta explicativa]

Regla: No incluyas introducciones ni conclusiones. Solo los pares de Pregunta y Respuesta.`;

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
 * Patrón para descartar frases de cierre coloquiales de IA si quedaron al final del texto.
 */
const AI_CLOSING_PHRASE_REGEX =
  /^(?:espero que|si necesitas m[aá]s|si quer[eé]s m[aá]s|av[ií]same si|ojal[aá] te sirva|espero te sea de ayuda|¡?buena suerte|buen estudio|¿deseas m[aá]s|si tienes alguna otra duda)/i;

/**
 * Analiza un bloque de texto libre y extrae pares de { pregunta, respuesta },
 * admitiendo formatos multilínea, listas numeradas, markdown variado o pares en línea.
 */
export function parseCustomQaText(rawText: string): ParseCustomQaResult {
  if (!rawText || !rawText.trim()) {
    return { items: [], totalParsed: 0, warnings: [] };
  }

  // Normalizar saltos de línea (\r\n y \r a \n)
  const text = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();

  // Escáner universal de inicio de PREGUNTA:
  // Detecta "Pregunta" o "Question" con cualquier combinación de:
  // - Markdown: **, *, __
  // - Numeración: 1., 1), 1.-, etc. antes o dentro del bold
  // - Viñetas: -, *, •, #
  // - Separadores: :, ：, -, –, —, .
  const qScanner =
    /(?:^|\n|(?:^|[.!?\n\s])\s*)(?:[-*•#>\s]*)?(?:\*\*|__|\*)?(?:\d+[\.\)\-]\s*)?(?:\*\*|__|\*)?(?:pregunta|question)(?:\s*\d+)?(?:\*\*|__|\*)?\s*[:：\-–—.]\s*(?:\*\*|__|\*)?/gi;

  const qMatches: Array<{ index: number; length: number }> = [];
  let m: RegExpExecArray | null;

  while ((m = qScanner.exec(text)) !== null) {
    qMatches.push({ index: m.index, length: m[0].length });
  }

  // Fallback si no se detectó "Pregunta" / "Question": probar prefijos cortos como P: o Q:
  if (qMatches.length === 0) {
    const shortQScanner =
      /(?:^|\n)\s*(?:[-*•#>\s]*)?(?:\*\*|__|\*)?(?:\d+[\.\)\-]\s*)?(?:\*\*|__|\*)?(?:p|q)(?:\s*\d+)?(?:\*\*|__|\*)?\s*[:：\-–—.]\s*(?:\*\*|__|\*)?/gi;
    while ((m = shortQScanner.exec(text)) !== null) {
      qMatches.push({ index: m.index, length: m[0].length });
    }
  }

  const items: CustomCardImportItem[] = [];
  const warnings: string[] = [];

  // Escáner de RESPUESTA dentro del bloque de una tarjeta:
  const aRegex =
    /(?:^|\n|\s)\s*(?:[-*•#>\s]*)?(?:\*\*|__|\*)?(?:\d+[\.\)\-]\s*)?(?:\*\*|__|\*)?(?:respuesta|answer|resp|r)(?:\s*\d+)?(?:\*\*|__|\*)?\s*[:：\-–—.]\s*(?:\*\*|__|\*)?\s*/i;

  if (qMatches.length > 0) {
    for (let i = 0; i < qMatches.length; i++) {
      const start = qMatches[i].index + qMatches[i].length;
      const end = i + 1 < qMatches.length ? qMatches[i + 1].index : text.length;
      const block = text.slice(start, end).trim();

      const aMatch = block.match(aRegex);
      if (aMatch && aMatch.index !== undefined) {
        let q = cleanMarkdownWrappers(block.slice(0, aMatch.index).trim());
        let a = cleanMarkdownWrappers(block.slice(aMatch.index + aMatch[0].length).trim());

        // Limpiar frases de cierre coloquiales de la IA en la última tarjeta
        if (i === qMatches.length - 1 && a) {
          const aLines = a.split('\n');
          if (aLines.length > 1 && AI_CLOSING_PHRASE_REGEX.test(aLines[aLines.length - 1].trim())) {
            aLines.pop();
            a = aLines.join('\n').trim();
          }
        }

        if (q && a) {
          items.push({
            id: `card_${items.length + 1}_${Date.now()}_${i}`,
            question: q,
            answer: a,
          });
        } else if (q && !a) {
          warnings.push(`Se omitió la pregunta sin respuesta: "${q.slice(0, 40)}..."`);
        }
      } else {
        warnings.push(`No se detectó respuesta para la pregunta número ${ i + 1 }.`);
      }
    }
  }

  // Fallback para texto tabular o delimitado (TSV, barra vertical, punto y coma)
  if (items.length === 0) {
    const lines = text.split('\n');
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
