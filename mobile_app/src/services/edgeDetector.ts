/**
 * Offline detection boundary.
 *
 * The first prototype deliberately keeps this adapter model-agnostic. After the
 * team chooses a YOLO export and a Capacitor-native TFLite plugin, implement
 * `load()` and `detect()` here without changing App.tsx.
 */

export type Detection = {
  label: string;
  confidence: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export interface EdgeDetector {
  load(modelPath: string): Promise<void>;
  detect(image: ImageData | HTMLImageElement): Promise<Detection[]>;
}

export class NotConfiguredEdgeDetector implements EdgeDetector {
  async load(): Promise<void> {
    throw new Error('尚未設定離線 TFLite 模型；請先完成模型匯出、量化與 Android 原生插件接入。');
  }

  async detect(): Promise<Detection[]> {
    return [];
  }
}
