/**
 * Módulo de compatibilidad para transición de Vosk a Sherpa-ONNX SenseVoice.
 * Redirige llamadas a sherpaVoiceService.
 */
import { sherpaVoiceService } from './sherpa-service';
import type { DueCardWithContext } from './srs-engine';

export interface VoskCallbacks {
  onResult: (hypothesis: string, isFinal: boolean) => void;
  onError?: (errorMessage: string) => void;
  onStart?: () => void;
  onEnd?: () => void;
  onTimeout?: () => void;
}

export interface VoskStartOptions {
  grammar?: string[];
  timeout?: number;
}

class VoskVoiceCompatibilityService {
  checkNativeModule(): boolean {
    return sherpaVoiceService.checkNativeModule();
  }

  async loadModel(_modelName: string = 'model-ja-jp'): Promise<boolean> {
    return sherpaVoiceService.loadModel();
  }

  isReady(): boolean {
    return sherpaVoiceService.isReady();
  }

  isListening(): boolean {
    return sherpaVoiceService.isListening();
  }

  buildGrammarForCard(_card: DueCardWithContext): string[] {
    return [];
  }

  buildGrammarForConjugation(
    _kanji: string,
    _reading: string,
    _category?: string,
    _form?: string
  ): string[] {
    return [];
  }

  async start(
    callbacks: VoskCallbacks,
    _options?: VoskStartOptions
  ): Promise<boolean> {
    return sherpaVoiceService.start({
      onResult: (text, isFinal) => callbacks.onResult(text, isFinal),
      onError: callbacks.onError,
      onStart: callbacks.onStart,
      onEnd: callbacks.onEnd,
      onTimeout: callbacks.onTimeout,
    });
  }

  async stop(): Promise<void> {
    return sherpaVoiceService.stop();
  }

  async abort(): Promise<void> {
    return sherpaVoiceService.abort();
  }
}

export const voskVoiceService = new VoskVoiceCompatibilityService();
