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

/**
 * Mapeo de códigos BCP-47 a los códigos cortos que SenseVoice espera.
 * SenseVoice soporta: 'auto', 'zh', 'en', 'ja', 'ko', 'yue'.
 */
const SENSEVOICE_LANG_MAP: Record<string, string> = {
  'ja': 'ja',
  'ja-jp': 'ja',
  'zh': 'zh',
  'zh-cn': 'zh',
  'zh-tw': 'zh',
  'en': 'en',
  'en-us': 'en',
  'en-gb': 'en',
  'ko': 'ko',
  'ko-kr': 'ko',
  'yue': 'yue',
};

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
  private generation = 0;
  private isNativeAvailable: boolean | null = null;
  private activeCallbacks: SherpaCallbacks | null = null;
  private isTranscribing = false;
  private lastTranscribedText = '';
  private cleanupFns: Array<() => void> = [];
  private engineLanguage = '';

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
   * Resuelve el código de idioma SenseVoice a partir de un código BCP-47.
   */
  private resolveSenseVoiceLanguage(langCode?: string): string {
    if (!langCode) return 'ja'; // Default para Yomi
    const key = langCode.toLowerCase().trim();
    return SENSEVOICE_LANG_MAP[key] || SENSEVOICE_LANG_MAP[key.split('-')[0]] || 'ja';
  }

  /**
   * Carga el modelo acústico SenseVoice en memoria para el idioma especificado.
   * Si el engine ya está cargado con un idioma diferente, lo destruye y recrea.
   */
  async loadModel(languageCode?: string): Promise<boolean> {
    const targetLang = this.resolveSenseVoiceLanguage(languageCode);

    // Si ya está cargado con el mismo idioma, no recrear
    if (this.isModelLoaded && this.sttEngine && this.engineLanguage === targetLang) {
      return true;
    }

    // Si está cargado con otro idioma, destruir el engine anterior
    if (this.isModelLoaded && this.sttEngine && this.engineLanguage !== targetLang) {
      console.log(`[SherpaVoiceService] Language changed: ${this.engineLanguage} → ${targetLang}, recreating engine...`);
      try {
        await this.sttEngine.destroy();
      } catch {}
      this.sttEngine = null;
      this.isModelLoaded = false;
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
        console.log(`[SherpaVoiceService] Initializing SenseVoice STT Engine (lang: ${targetLang})...`);
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
              language: targetLang,
              useItn: true,
            },
          },
        });

        this.sttEngine = engine;
        this.isModelLoaded = true;
        this.engineLanguage = targetLang;
        console.log(`[SherpaVoiceService] SenseVoice Engine initialized (lang: ${targetLang})!`);
        return true;
      } catch (err) {
        console.warn('[SherpaVoiceService] Could not initialize SenseVoice model:', err);
        this.isModelLoaded = false;
        this.sttEngine = null;
        this.engineLanguage = '';
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
   * Limpia etiquetas de eventos y emociones de SenseVoice (ej. <|NEUTRAL|>, <|ja|>, etc.),
   * y remueve puntuación espuria. Retorna cadena vacía si no hubo habla real.
   */
  cleanSenseVoiceTranscript(rawText: string, langCode?: string): string {
    if (!rawText) return '';
    // Descartar de inmediato eventos nospeech de SenseVoice
    if (rawText.includes('<|nospeech|>')) return '';

    // Remover tokens especiales de SenseVoice (<|...|>)
    let cleaned = rawText.replace(/<\|.*?\|>/g, '').trim();

    // Remover signos de puntuación espurios que SenseVoice agrega ante silencios o pausas
    cleaned = cleaned.replace(/[。、！？!?.,:;…〜～・]/g, '').trim();

    // Espaciado según idioma: japonés/chino no usan espacios
    const isCjk = !langCode || langCode.startsWith('ja') || langCode.startsWith('zh');
    if (isCjk) {
      cleaned = cleaned.replace(/\s+/g, '');
    } else {
      cleaned = cleaned.replace(/\s+/g, ' ');
    }

    return cleaned;
  }

  /**
   * Inicia la captura de audio en vivo y el reconocimiento con SenseVoice.
   * Utiliza VAD adaptativo por energía y buffer circular de onset para transcribir
   * únicamente cuando el usuario realmente habla, evitando alucinaciones sobre silencios.
   */
  async start(
    callbacks: SherpaCallbacks,
    options?: SherpaStartOptions
  ): Promise<boolean> {
    if (!this.checkNativeModule()) return false;

    // Cargar/recrear engine con el idioma correcto
    const requestedLang = options?.language;
    if (!this.isReady() || (requestedLang && this.engineLanguage !== this.resolveSenseVoiceLanguage(requestedLang))) {
      const loaded = await this.loadModel(requestedLang);
      if (!loaded || !this.sttEngine) return false;
    }

    await this.abort();

    const modules = getSherpaModules();
    if (!modules) return false;

    this.generation++;
    const currentGen = this.generation;
    this.activeCallbacks = callbacks;
    this.lastTranscribedText = '';
    this.isTranscribing = false;

    // Constantes de audio (16kHz mono)
    const PRE_ROLL_SAMPLES = 16000 * 0.25; // 250ms de audio previo para capturar ataques consonánticos
    const MIN_UTTERANCE_SAMPLES = 16000 * 0.3; // Mínimo 300ms de audio para considerar elocución
    const MAX_UTTERANCE_SAMPLES = 16000 * 4.0; // Máximo 4s para una palabra/frase de tarjeta

    let preRollBuffer: number[] = [];
    let utteranceSamples: number[] = [];
    let isSpeaking = false;
    let voiceFrames = 0;
    let silenceFrames = 0;
    let noiseFloor = 0.015;

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

        const chunkLength = samples.length;
        if (chunkLength === 0) return;

        // 1. Calcular energía RMS del chunk
        let sumSquares = 0;
        for (let i = 0; i < chunkLength; i++) {
          const val = samples[i];
          sumSquares += val * val;
        }
        const rms = Math.sqrt(sumSquares / chunkLength);

        // 2. Calibración dinámica del piso de ruido cuando no hay habla activa
        if (!isSpeaking) {
          noiseFloor = noiseFloor * 0.92 + rms * 0.08;
        }

        // Umbral adaptativo: al menos 0.045 absoluto y 2.5x el ruido ambiental
        const voiceThreshold = Math.max(0.045, noiseFloor * 2.5);
        const isVoiceEnergy = rms > voiceThreshold;

        if (isVoiceEnergy) {
          voiceFrames++;
          silenceFrames = 0;

          if (!isSpeaking && voiceFrames >= 2) {
            // Inicio de elocución confirmado (~200ms de voz por encima del umbral)
            isSpeaking = true;
            // Arrancar elocución con el pre-roll preservado + este frame
            utteranceSamples = [...preRollBuffer];
            for (let i = 0; i < chunkLength; i++) {
              utteranceSamples.push(samples[i]);
            }
          } else if (isSpeaking) {
            for (let i = 0; i < chunkLength; i++) {
              utteranceSamples.push(samples[i]);
            }
          }
        } else {
          voiceFrames = 0;

          if (isSpeaking) {
            silenceFrames++;
            for (let i = 0; i < chunkLength; i++) {
              utteranceSamples.push(samples[i]);
            }
          } else {
            // Mantener buffer circular de pre-roll
            for (let i = 0; i < chunkLength; i++) {
              preRollBuffer.push(samples[i]);
            }
            if (preRollBuffer.length > PRE_ROLL_SAMPLES) {
              preRollBuffer = preRollBuffer.slice(preRollBuffer.length - PRE_ROLL_SAMPLES);
            }
          }
        }

        // 3. Fin de elocución: habla confirmada seguida de ~400-500ms de silencio o límite de tiempo
        const isEndOfUtterance = isSpeaking && !this.isTranscribing && silenceFrames >= 4;
        const isTooLong = isSpeaking && !this.isTranscribing && utteranceSamples.length >= MAX_UTTERANCE_SAMPLES;

        if ((isEndOfUtterance || isTooLong) && utteranceSamples.length >= MIN_UTTERANCE_SAMPLES) {
          this.isTranscribing = true;
          isSpeaking = false;
          voiceFrames = 0;
          const currentSilence = silenceFrames;
          silenceFrames = 0;

          // Recortar silencio posterior excesivo antes de enviar al modelo acústico
          const trailingSilenceSamples = Math.min(currentSilence * chunkLength, 16000 * 0.35);
          const audioToTranscribe = utteranceSamples.slice(
            0,
            Math.max(MIN_UTTERANCE_SAMPLES, utteranceSamples.length - trailingSilenceSamples)
          );

          utteranceSamples = [];
          preRollBuffer = [];

          try {
            const result = await this.sttEngine.transcribeSamples(audioToTranscribe, 16000);
            if (this.generation !== currentGen) return;

            const text = this.cleanSenseVoiceTranscript(result?.text || '', requestedLang);
            if (text && text !== this.lastTranscribedText) {
              this.lastTranscribedText = text;
              console.log('[SherpaVoiceService] Utterance transcription:', text);
              callbacks.onResult(text, true, [text]);
            }
          } catch (e) {
            console.warn('[SherpaVoiceService] Transcribe utterance error:', e);
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
   * Detiene la captura de audio en vivo de forma limpia.
   * NO transcribe silencios residuales para evitar alucinaciones.
   */
  async stop(): Promise<void> {
    if (!this.isListeningActive) return;
    this.isListeningActive = false;

    // Limpiar listeners antes de detener el stream
    this.cleanupFns.forEach((fn) => {
      try {
        fn();
      } catch {}
    });
    this.cleanupFns = [];

    if (this.liveStream) {
      try {
        await this.liveStream.stop();
      } catch {}
      this.liveStream = null;
    }

    const callbacks = this.activeCallbacks;
    this.activeCallbacks = null;
    this.isTranscribing = false;
    callbacks?.onEnd?.();
  }

  /**
   * Aborta de inmediato cualquier sesión de audio y limpia listeners.
   */
  async abort(): Promise<void> {
    this.generation++;
    this.isListeningActive = false;
    this.activeCallbacks = null;
    this.isTranscribing = false;

    this.cleanupFns.forEach((fn) => {
      try {
        fn();
      } catch {}
    });
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
