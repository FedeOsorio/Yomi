/**
 * Lector de paquetes ZIP optimizado para dispositivos móviles (Expo 57 / React Native).
 *
 * Utiliza FileHandle de expo-file-system para lectura aleatoria por bloques (random access),
 * cargando en memoria únicamente el Central Directory (aprox. 400 KB para 5.000 archivos).
 * Descomprime archivo por archivo bajo demanda sin cargar el paquete ZIP entero en la memoria RAM,
 * previniendo OutOfMemoryError en Android y cierres forzados por el sistema operativo.
 */

import { File, FileMode } from 'expo-file-system';
import { Inflate, inflateSync } from 'fflate';
import { Decompress as ZstdDecompress } from 'fzstd';

export interface ZipEntry {
  name: string;
  method: 0 | 8;           // 0 = Stored (sin compresión), 8 = Deflated
  compressedSize: number;
  size: number;
  localHeaderOffset: number;
}

export interface ZipReader {
  entries: Map<string, ZipEntry>;
  hasEntry(name: string): boolean;
  getEntry(name: string): ZipEntry | undefined;
  readEntry(e: ZipEntry): Uint8Array;
  extractEntryToFile(e: ZipEntry, dest: File, options?: { zstd?: boolean }): void;
  close(): void;
}

const EOCD_SIGNATURE = 0x06054b50;      // PK\x05\x06
const EOCD_MIN_SIZE = 22;
const CD_HEADER_SIGNATURE = 0x02014b50; // PK\x01\x02
const LOCAL_HEADER_SIGNATURE = 0x04034b50; // PK\x03\x04
const STREAM_CHUNK_SIZE = 1024 * 1024;  // 1 MB por bloque para streaming

const viewOf = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

/**
 * Abre un archivo ZIP a partir de una URI nativa de Expo (file://) y lee su Central Directory.
 */
export function openZip(fileUri: string): ZipReader {
  const file = new File(fileUri);
  const fileSize = file.size;
  const handle = file.open(FileMode.ReadOnly);
  const read = (offset: number, length: number): Uint8Array => {
    handle.offset = offset;
    return handle.readBytes(length);
  };

  try {
    if (fileSize < EOCD_MIN_SIZE) {
      throw new Error('El archivo es demasiado pequeño para ser un archivo ZIP válido.');
    }

    // 1. Localizar el registro End of Central Directory (EOCD): está al final, seguido de un comentario
    // de hasta 65.535 bytes. Vale la firma cuyo comentario cierra justo el archivo; si ninguna cierra
    // (comentario mal declarado), la última firma del archivo.
    const tailLength = Math.min(fileSize, 65535 + EOCD_MIN_SIZE);
    const tail = read(fileSize - tailLength, tailLength);
    const tailView = viewOf(tail);

    let eocdPos = -1;
    let lastSignaturePos = -1;
    for (let i = tail.length - EOCD_MIN_SIZE; i >= 0; i--) {
      if (tailView.getUint32(i, true) !== EOCD_SIGNATURE) continue;
      if (lastSignaturePos === -1) lastSignaturePos = i;
      if (i + EOCD_MIN_SIZE + tailView.getUint16(i + 20, true) === tail.length) {
        eocdPos = i;
        break;
      }
    }
    if (eocdPos === -1) eocdPos = lastSignaturePos;
    if (eocdPos === -1) {
      throw new Error('No se encontró el registro final del archivo ZIP (EOCD no válido).');
    }

    const totalEntries = tailView.getUint16(eocdPos + 10, true);
    const cdSize = tailView.getUint32(eocdPos + 12, true);
    const cdOffset = tailView.getUint32(eocdPos + 16, true);
    if (totalEntries === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
      throw new Error('Los archivos en formato ZIP64 no están soportados.');
    }

    // 2. Leer secuencialmente el Central Directory (pesa apenas ~80 bytes por entrada)
    const cd = read(cdOffset, cdSize);
    const cdView = viewOf(cd);
    const textDecoder = new TextDecoder('utf-8');
    const entries = new Map<string, ZipEntry>();

    for (let cursor = 0; cursor + 46 <= cd.length && cdView.getUint32(cursor, true) === CD_HEADER_SIGNATURE; ) {
      const nameLen = cdView.getUint16(cursor + 28, true);
      const extraLen = cdView.getUint16(cursor + 30, true);
      const commentLen = cdView.getUint16(cursor + 32, true);
      const name = textDecoder.decode(cd.subarray(cursor + 46, cursor + 46 + nameLen));

      entries.set(name, {
        name,
        method: cdView.getUint16(cursor + 10, true) as 0 | 8,
        compressedSize: cdView.getUint32(cursor + 20, true),
        size: cdView.getUint32(cursor + 24, true),
        localHeaderOffset: cdView.getUint32(cursor + 42, true),
      });

      cursor += 46 + nameLen + extraLen + commentLen;
    }

    /** Offset exacto donde empiezan los datos comprimidos (después del Local File Header). */
    const getDataOffset = (e: ZipEntry): number => {
      const localView = viewOf(read(e.localHeaderOffset, 30));
      if (localView.getUint32(0, true) !== LOCAL_HEADER_SIGNATURE) {
        throw new Error(`Firma de cabecera local inválida para el archivo: ${e.name}`);
      }
      return e.localHeaderOffset + 30 + localView.getUint16(26, true) + localView.getUint16(28, true);
    };

    const assertSupported = (e: ZipEntry) => {
      if (e.method !== 0 && e.method !== 8) {
        throw new Error(`Método de compresión ZIP no soportado (${e.method}) en ${e.name}`);
      }
    };

    return {
      entries,
      hasEntry: (name) => entries.has(name),
      getEntry: (name) => entries.get(name),

      /**
       * Lee y descomprime una entrada completa en memoria.
       * Para la base de datos SQLite y el manifiesto JSON de media.
       */
      readEntry: (e) => {
        assertSupported(e);
        const rawBytes = read(getDataOffset(e), e.compressedSize);
        return e.method === 0 ? rawBytes : inflateSync(rawBytes);
      },

      /**
       * Extrae una entrada directamente a un archivo en disco mediante streaming por bloques.
       * Mantiene un consumo fijo de RAM (~2 MB) sin importar si el archivo pesa 50 KB o 500 MB.
       * Con `zstd`, además descomprime el contenido (archivos de media del formato nuevo de Anki).
       */
      extractEntryToFile: (e, dest, options) => {
        assertSupported(e);
        if (!dest.exists) dest.create();
        const destHandle = dest.open(FileMode.Truncate);

        try {
          // Cadena de bloques: zip (deflate o sin comprimir) -> zstd (opcional) -> archivo
          let writeError: unknown = null;
          const write = (chunk: Uint8Array) => {
            try {
              destHandle.writeBytes(chunk);
            } catch (err) {
              writeError = err;
            }
          };
          const zstd = options?.zstd ? new ZstdDecompress((chunk) => write(chunk)) : null;
          const afterZip = (chunk: Uint8Array, final: boolean) => (zstd ? zstd.push(chunk, final) : write(chunk));
          const inflater = e.method === 8 ? new Inflate((chunk, final) => afterZip(chunk, final)) : null;

          let offset = getDataOffset(e);
          let bytesLeft = e.compressedSize;
          while (bytesLeft > 0) {
            const chunkSize = Math.min(bytesLeft, STREAM_CHUNK_SIZE);
            const chunk = read(offset, chunkSize);
            offset += chunkSize;
            bytesLeft -= chunkSize;
            if (inflater) {
              inflater.push(chunk, bytesLeft === 0);
            } else {
              afterZip(chunk, bytesLeft === 0);
            }
            if (writeError) throw writeError;
          }
        } finally {
          try {
            destHandle.close();
          } catch {}
        }
      },

      close: () => {
        try {
          handle.close();
        } catch {}
      },
    };
  } catch (err) {
    try {
      handle.close();
    } catch {}
    throw err;
  }
}
