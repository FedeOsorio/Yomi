import * as FileSystem from 'expo-file-system/legacy';

export interface SherpaCallbacks {
  onResult: (transcript: string, isFinal: boolean, alternatives?: string[]) => void;
  onError?: (errorMessage: string) => void;
  onStart?: () => void;
  onEnd?: () => void;
  onTimeout?: () => void;
}

export interface SherpaStartOptions {
  language?: string;
  initialPrompt?: string;
}

export const SENSE_VOICE_MODEL_DIR_NAME = 'models/sense-voice';

export const SENSE_VOICE_URLS = {
  model: 'https://huggingface.co/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/resolve/main/model.int8.onnx',
  tokens: 'https://huggingface.co/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/resolve/main/tokens.txt',
};

type SttModuleType = typeof import('react-native-sherpa-onnx/stt');
type AudioModuleType = typeof import('react-native-sherpa-onnx/audio');

let cachedSttModule: SttModuleType | null = null;
let cachedAudioModule: AudioModuleType | null = null;
let hasCheckedModules = false;

function getSherpaModules(): { stt: SttModuleType; audio: AudioModuleType } | null {
  if (hasCheckedModules) {
    if (cachedSttModule && cachedAudioModule) {
      return { stt: cachedSttModule, audio: cachedAudioModule };
    }
    return null;
  }
  hasCheckedModules = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const stt = require('react-native-sherpa-onnx/stt');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const audio = require('react-native-sherpa-onnx/audio');
    if (stt && typeof stt.createSTT === 'function' && audio && typeof audio.createPcmLiveStream === 'function') {
      cachedSttModule = stt;
      cachedAudioModule = audio;
      return { stt, audio };
    }
  } catch (err) {
    console.warn(
      '[SherpaVoiceService] react-native-sherpa-onnx native module is not present in this binary build.',
      err
    );
  }
  return null;
}

class SherpaVoiceService {
  private sttEngine: any = null;
  private isModelLoaded = false;
  private modelLoadPromise: Promise<boolean> | null = null;
  private isListeningActive = false;
  private liveStream: any = null;
  private audioBuffer: number[] = [];
  private generation = 0;
  private isNativeAvailable: boolean | null = null;
  private activeCallbacks: SherpaCallbacks | null = null;
  private isTranscribing = false;
  private lastTranscribedText = '';
  private cleanupFns: Array<() => void> = [];
  private transcribedSampleCount = 0;

  /**
   * Verifica si el módulo nativo de Sherpa-ONNX está enlazado y disponible.
   */
  checkNativeModule(): boolean {
    if (this.isNativeAvailable !== null) return this.isNativeAvailable;
    const modules = getSherpaModules();
    this.isNativeAvailable = Boolean(modules !== null);
    return this.isNativeAvailable;
  }

  /**
   * Ruta del directorio local en el almacenamiento de la app.
   */
  getLocalModelDirectory(): string {
    const docDir = FileSystem.documentDirectory || '';
    return `${docDir}${SENSE_VOICE_MODEL_DIR_NAME}`;
  }

  /**
   * Verifica si los archivos del modelo SenseVoice existen en el almacenamiento local.
   */
  async isModelDownloaded(): Promise<boolean> {
    try {
      const dir = this.getLocalModelDirectory();
      const modelFile = `${dir}/model.int8.onnx`;
      const tokensFile = `${dir}/tokens.txt`;

      const [modelInfo, tokensInfo] = await Promise.all([
        FileSystem.getInfoAsync(modelFile),
        FileSystem.getInfoAsync(tokensFile),
      ]);

      return Boolean(modelInfo.exists && tokensInfo.exists && (modelInfo.size || 0) > 1000000);
    } catch {
      return false;
    }
  }

  /**
   * Descarga el modelo SenseVoice-Small cuantizado (INT8) y sus tokens con reporte de progreso.
   */
  async downloadModel(onProgress?: (percent: number) => void): Promise<boolean> {
    try {
      const dir = this.getLocalModelDirectory();
      const dirInfo = await FileSystem.getInfoAsync(dir);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
      }

      const tokensPath = `${dir}/tokens.txt`;
      const modelPath = `${dir}/model.int8.onnx`;

      console.log('[SherpaVoiceService] Downloading tokens.txt...');
      await FileSystem.downloadAsync(SENSE_VOICE_URLS.tokens, tokensPath);

      console.log('[SherpaVoiceService] Downloading model.int8.onnx (~230MB)...');
      const downloadResumable = FileSystem.createDownloadResumable(
        SENSE_VOICE_URLS.model,
        modelPath,
        {},
        (downloadProgress) => {
          const progress =
            downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
          const percent = Math.min(Math.max(Math.round(progress * 100), 0), 100);
          onProgress?.(percent);
        }
      );

      const result = await downloadResumable.downloadAsync();
      if (result && result.status === 200) {
        console.log('[SherpaVoiceService] Model downloaded successfully to:', modelPath);
        onProgress?.(100);
        return true;
      }
      return false;
    } catch (err) {
      console.error('[SherpaVoiceService] Error downloading SenseVoice model:', err);
      return false;
    }
  }

  /**
   * Carga el modelo acústico SenseVoice en memoria (desde assets empaquetados o almacenamiento local).
   */
  async loadModel(): Promise<boolean> {
    if (this.isModelLoaded && this.sttEngine) {
      return true;
    }

    const modules = getSherpaModules();
    if (!modules) {
      return false;
    }

    if (this.modelLoadPromise) {
      return this.modelLoadPromise;
    }

    const loadPromise = (async () => {
      try {
        console.log('[SherpaVoiceService] Initializing SenseVoice STT Engine...');
        const hasLocal = await this.isModelDownloaded();

        let modelPathConfig: any;
        if (hasLocal) {
          modelPathConfig = {
            type: 'file',
            path: this.getLocalModelDirectory(),
          };
          console.log('[SherpaVoiceService] Using downloaded model from:', modelPathConfig.path);
        } else {
          // Intentar primero con assets de la app (si fueron empaquetados en el APK)
          modelPathConfig = {
            type: 'auto',
            path: SENSE_VOICE_MODEL_DIR_NAME,
          };
          console.log('[SherpaVoiceService] Using auto/asset model path:', modelPathConfig.path);
        }

        const engine = await modules.stt.createSTT({
          modelPath: modelPathConfig,
          modelType: 'sense_voice',
          preferInt8: true,
          numThreads: 2,
          modelOptions: {
            senseVoice: {
              useItn: true,
            },
          },
        });

        this.sttEngine = engine;
        this.isModelLoaded = true;
        console.log('[SherpaVoiceService] SenseVoice Engine initialized successfully!');
        return true;
      } catch (err) {
        console.warn('[SherpaVoiceService] Could not initialize SenseVoice model:', err);
        this.isModelLoaded = false;
        this.sttEngine = null;
        return false;
      }
    })();

    this.modelLoadPromise = loadPromise;
    try {
      return await loadPromise;
    } finally {
      this.modelLoadPromise = null;
    }
  }

  /**
   * Retorna si el motor está inicializado y listo para transcribir.
   */
  isReady(): boolean {
    return this.isModelLoaded && Boolean(this.sttEngine);
  }

  /**
   * Retorna si el micrófono está escuchando activamente.
   */
  isListening(): boolean {
    return this.isListeningActive;
  }

  /**
   * Limpia etiquetas de eventos y emociones de SenseVoice (ej. <|NEUTRAL|>, <|ja|>, etc.).
   */
  cleanSenseVoiceTranscript(rawText: string): string {
    if (!rawText) return '';
    return rawText
      .replace(/<\|.*?\|>/g, '')
      .replace(/\s+/g, '')
      .trim();
  }

  /**
   * Inicia la captura de audio en vivo y el reconocimiento con SenseVoice.
   */
  async start(
    callbacks: SherpaCallbacks,
    options?: SherpaStartOptions
  ): Promise<boolean> {
    if (!this.checkNativeModule()) return false;
    if (!this.isReady()) {
      const loaded = await this.loadModel();
      if (!loaded || !this.sttEngine) return false;
    }

    await this.abort();

    const modules = getSherpaModules();
    if (!modules) return false;

    this.generation++;
    const currentGen = this.generation;
    this.activeCallbacks = callbacks;
    this.audioBuffer = [];
    this.lastTranscribedText = '';
    this.isTranscribing = false;
    this.transcribedSampleCount = 0;

    let speechDetected = false;
    let silenceFrames = 0;
    let voiceFrames = 0;
    let framesSinceLastTranscribe = 0;

    try {
      this.liveStream = modules.audio.createPcmLiveStream({
        sampleRate: 16000,
        channelCount: 1,
      });

      const cleanupError = this.liveStream.onError((msg: string) => {
        if (this.generation !== currentGen) return;
        console.warn('[SherpaVoiceService] LiveStream error:', msg);
        callbacks.onError?.(msg);
      });

      const cleanupData = this.liveStream.onData(async (samples: Float32Array, sampleRate: number) => {
        if (this.generation !== currentGen || !this.isListeningActive) return;

        // Convertir y acumular muestras
        const chunkLength = samples.length;
        let sumSquares = 0;
        for (let i = 0; i < chunkLength; i++) {
          const val = samples[i];
          this.audioBuffer.push(val);
          sumSquares += val * val;
        }

        // Detección de energía acústica (VAD ligero)
        const rms = Math.sqrt(sumSquares / (chunkLength || 1));
        const isVoiceEnergy = rms > 0.04;

        if (isVoiceEnergy) {
          voiceFrames++;
          silenceFrames = 0;
          if (voiceFrames >= 3) {
            // ~300ms de voz real antes de considerar habla
            speechDetected = true;
          }
        } else if (speechDetected) {
          silenceFrames++;
          // ~800ms de silencio = fin de elocución, resetear estado
          if (silenceFrames >= 8) {
            speechDetected = false;
            voiceFrames = 0;
          }
        } else {
          voiceFrames = 0;
        }

        framesSinceLastTranscribe++;

        // Si se detectó voz y luego hubo silencio (~400ms = ~4-5 chunks a 16kHz)
        // O si ya se acumularon más de 1.5s de habla sin transcribir:
        const shouldTranscribe =
          speechDetected &&
          !this.isTranscribing &&
          (silenceFrames >= 4 || framesSinceLastTranscribe >= 12);

        if (shouldTranscribe && this.audioBuffer.length >= 16000 * 0.4) {
          this.isTranscribing = true;
          framesSinceLastTranscribe = 0;
          try {
            // Transcribir solo las muestras pendientes desde la última transcripción
            const pendingSamples = this.audioBuffer.slice(this.transcribedSampleCount);
            if (pendingSamples.length < 16000 * 0.3) {
              this.isTranscribing = false;
              return;
            }
            const result = await this.sttEngine.transcribeSamples([...pendingSamples], 16000);
            this.transcribedSampleCount = this.audioBuffer.length;
            if (this.generation !== currentGen) return;

            const text = this.cleanSenseVoiceTranscript(result?.text || '');
            if (text && text !== this.lastTranscribedText) {
              this.lastTranscribedText = text;
              console.log('[SherpaVoiceService] Partial transcription:', text);
              callbacks.onResult(text, false, [text]);
            }
          } catch (e) {
            console.warn('[SherpaVoiceService] Transcribe chunk error:', e);
          } finally {
            this.isTranscribing = false;
          }
        }
      });

      this.cleanupFns = [cleanupData, cleanupError];

      await this.liveStream.start();
      this.isListeningActive = true;
      callbacks.onStart?.();
      return true;
    } catch (err: any) {
      console.warn('[SherpaVoiceService] Failed to start liveStream:', err);
      this.isListeningActive = false;
      callbacks.onError?.(err?.message || 'Error al iniciar micrófono');
      return false;
    }
  }

  /**
   * Detiene la captura y realiza una transcripción final de todo el buffer acumulado.
   */
  async stop(): Promise<void> {
    if (!this.isListeningActive) return;
    this.isListeningActive = false;

    // Limpiar listeners antes de detener el stream
    this.cleanupFns.forEach(fn => { try { fn(); } catch {} });
    this.cleanupFns = [];

    if (this.liveStream) {
      try {
        await this.liveStream.stop();
      } catch {}
      this.liveStream = null;
    }

    const callbacks = this.activeCallbacks;
    const currentGen = this.generation;

    if (this.sttEngine && this.audioBuffer.length >= 16000 * 0.3) {
      try {
        const bufferCopy = [...this.audioBuffer];
        const result = await this.sttEngine.transcribeSamples(bufferCopy, 16000);
        if (this.generation === currentGen && callbacks) {
          const text = this.cleanSenseVoiceTranscript(result?.text || '');
          if (text) {
            console.log('[SherpaVoiceService] Final transcription:', text);
            callbacks.onResult(text, true, [text]);
          }
        }
      } catch (e) {
        console.warn('[SherpaVoiceService] Final transcribe error:', e);
      }
    }

    this.audioBuffer = [];
    callbacks?.onEnd?.();
  }

  /**
   * Aborta de inmediato cualquier sesión de audio y limpia buffers.
   */
  async abort(): Promise<void> {
    this.generation++;
    this.isListeningActive = false;
    this.activeCallbacks = null;
    this.isTranscribing = false;
    this.audioBuffer = [];
    this.transcribedSampleCount = 0;

    // Limpiar listeners de onData/onError antes de detener el stream
    this.cleanupFns.forEach(fn => { try { fn(); } catch {} });
    this.cleanupFns = [];

    if (this.liveStream) {
      try {
        await this.liveStream.stop();
      } catch {}
      this.liveStream = null;
    }
  }
}

export const sherpaVoiceService = new SherpaVoiceService();
