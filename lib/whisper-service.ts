import * as FileSystem from 'expo-file-system/legacy';
import { initWhisper, type WhisperContext } from 'whisper.rn/index';
import { RealtimeTranscriber } from 'whisper.rn/realtime-transcription/index';
import { AudioPcmStreamAdapter } from 'whisper.rn/realtime-transcription/adapters/AudioPcmStreamAdapter';

const MODEL_DOWNLOAD_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin';
const MODEL_DIR = `${FileSystem.documentDirectory}models/`;
const MODEL_FILE_PATH = `${MODEL_DIR}ggml-tiny.bin`;
const MIN_VALID_MODEL_SIZE = 70 * 1024 * 1024; // ~75MB para ggml-tiny.bin

export interface WhisperCallbacks {
  onResult: (transcript: string, isFinal: boolean) => void;
  onError?: (error: string) => void;
  onStart?: () => void;
  onEnd?: () => void;
}

export interface WhisperListenOptions {
  lang: string;
  initialPrompt?: string;
}

class WhisperVoiceService {
  private whisperContext: WhisperContext | null = null;
  private currentTranscriber: RealtimeTranscriber | null = null;
  private isListeningActive = false;
  private downloadInProgress: Promise<string> | null = null;
  private isNativeAvailable: boolean | null = null;
  private generation = 0;

  /**
   * Mapea códigos BCP-47 al código ISO de 2 letras que Whisper espera.
   */
  private normalizeLanguage(code: string): string {
    const lower = code.toLowerCase();
    if (lower.startsWith('ja')) return 'ja';
    if (lower.startsWith('zh')) return 'zh';
    if (lower.startsWith('es')) return 'es';
    if (lower.startsWith('en')) return 'en';
    if (lower.startsWith('fr')) return 'fr';
    if (lower.startsWith('de')) return 'de';
    if (lower.startsWith('ko')) return 'ko';
    if (lower.startsWith('it')) return 'it';
    if (lower.startsWith('pt')) return 'pt';
    if (lower.startsWith('ru')) return 'ru';
    return 'auto';
  }

  /**
   * Comprueba si el módulo nativo de whisper.rn está presente en el runtime.
   */
  checkNativeModule(): boolean {
    if (this.isNativeAvailable !== null) return this.isNativeAvailable;
    try {
      // Si la función initWhisper existe y el entorno nativo está vinculado
      this.isNativeAvailable = typeof initWhisper === 'function';
    } catch {
      this.isNativeAvailable = false;
    }
    return this.isNativeAvailable;
  }

  /**
   * Verifica si el modelo ggml-tiny ya se encuentra descargado y es íntegro en almacenamiento local.
   */
  async isModelReady(): Promise<boolean> {
    try {
      const info = await FileSystem.getInfoAsync(MODEL_FILE_PATH);
      return Boolean(info.exists && info.size && info.size >= MIN_VALID_MODEL_SIZE);
    } catch {
      return false;
    }
  }

  /**
   * Descarga el modelo GGML si no existe localmente.
   */
  async ensureModel(onProgress?: (progressPercent: number) => void): Promise<string> {
    const ready = await this.isModelReady();
    if (ready) return MODEL_FILE_PATH;

    if (this.downloadInProgress) {
      return this.downloadInProgress;
    }

    this.downloadInProgress = (async () => {
      try {
        const dirInfo = await FileSystem.getInfoAsync(MODEL_DIR);
        if (!dirInfo.exists) {
          await FileSystem.makeDirectoryAsync(MODEL_DIR, { intermediates: true });
        }

        const resumable = FileSystem.createDownloadResumable(
          MODEL_DOWNLOAD_URL,
          MODEL_FILE_PATH,
          {},
          (downloadProgress) => {
            if (downloadProgress.totalBytesExpectedToWrite > 0 && onProgress) {
              const pct = Math.round(
                (downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite) * 100
              );
              onProgress(pct);
            }
          }
        );

        const result = await resumable.downloadAsync();
        if (!result || !result.uri) {
          throw new Error('Fallo al descargar el modelo de Whisper');
        }

        // Verificar tamaño para evitar archivos corruptos
        const fileInfo = await FileSystem.getInfoAsync(MODEL_FILE_PATH);
        if (!fileInfo.exists || !fileInfo.size || fileInfo.size < MIN_VALID_MODEL_SIZE) {
          try {
            await FileSystem.deleteAsync(MODEL_FILE_PATH, { idempotent: true });
          } catch { }
          throw new Error('El archivo del modelo descargado está incompleto');
        }

        return MODEL_FILE_PATH;
      } finally {
        this.downloadInProgress = null;
      }
    })();

    return this.downloadInProgress;
  }

  /**
   * Obtiene o inicializa el contexto de Whisper (singleton).
   */
  async getContext(onProgress?: (progressPercent: number) => void): Promise<WhisperContext | null> {
    if (this.whisperContext) return this.whisperContext;
    if (!this.checkNativeModule()) return null;

    try {
      const modelPath = await this.ensureModel(onProgress);
      this.whisperContext = await initWhisper({
        filePath: modelPath,
        isBundleAsset: false,
        useGpu: true,
      });
      return this.whisperContext;
    } catch (e) {
      console.warn('[WhisperVoiceService] Error inicializando contexto Whisper:', e);
      return null;
    }
  }

  /**
   * Inicia la captura y transcripción en tiempo real con inyección de prompt contextual.
   */
  async start(
    options: WhisperListenOptions,
    callbacks: WhisperCallbacks
  ): Promise<boolean> {
    this.generation++;
    const currentGen = this.generation;

    await this.stop();

    const ctx = await this.getContext();
    if (!ctx) {
      callbacks.onError?.('El motor Whisper no está disponible en este entorno.');
      return false;
    }

    try {
      const adapter = new AudioPcmStreamAdapter();
      const whisperLang = this.normalizeLanguage(options.lang);

      this.currentTranscriber = new RealtimeTranscriber(
        {
          whisperContext: ctx,
          audioStream: adapter,
        },
        {
          initialPrompt: options.initialPrompt,
          promptPreviousSlices: false,
          audioSliceSec: 2.5,
          audioMinSec: 0.4,
          realtimeProcessingPauseMs: 150,
          initRealtimeAfterMs: 100,
          transcribeOptions: {
            language: whisperLang,
            maxThreads: 4,
            prompt: options.initialPrompt,
            temperature: 0.0,
          },
        },
        {
          onTranscribe: (event) => {
            if (this.generation !== currentGen) return;
            const text = event.data?.result?.trim() || '';
            if (text) {
              const isFinal = event.type === 'end' || !event.isCapturing;
              callbacks.onResult(text, isFinal);
            }
          },
          onStatusChange: (isRecording) => {
            if (this.generation !== currentGen) return;
            if (isRecording) {
              this.isListeningActive = true;
              callbacks.onStart?.();
            } else {
              this.isListeningActive = false;
              callbacks.onEnd?.();
            }
          },
        }
      );

      await this.currentTranscriber.start();
      this.isListeningActive = true;
      return true;
    } catch (err) {
      this.isListeningActive = false;
      const msg = err instanceof Error ? err.message : 'Error iniciando escucha de Whisper';
      console.warn('[WhisperVoiceService] Error al iniciar:', msg);
      callbacks.onError?.(msg);
      return false;
    }
  }

  /**
   * Detiene la escucha y libera recursos de audio de manera limpia.
   */
  async stop(): Promise<void> {
    this.generation++;
    this.isListeningActive = false;
    if (this.currentTranscriber) {
      try {
        await this.currentTranscriber.stop();
      } catch (e) {
        console.warn('[WhisperVoiceService] Error deteniendo transcriber:', e);
      }
      this.currentTranscriber = null;
    }
  }

  /**
   * Indica si Whisper está escuchando en este momento.
   */
  isListening(): boolean {
    return this.isListeningActive;
  }

  /**
   * Invalida llamadas pendientes en transiciones de tarjetas.
   */
  invalidate(): void {
    this.generation++;
  }

  getGeneration(): number {
    return this.generation;
  }
}

export const whisperVoiceService = new WhisperVoiceService();
