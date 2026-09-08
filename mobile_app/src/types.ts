export type CaneTelemetry = {
  distanceCm: number;
  angleDeg: number;
  tofMm: number;
  obstacle: boolean;
  pit: boolean;
  receivedAt: number;
  raw: string;
};

export type CameraConfig = {
  baseUrl: string;
};

export type GeminiDescription = {
  text: string;
  generatedAt: number;
};

export const DEFAULT_TELEMETRY: CaneTelemetry = {
  distanceCm: 400,
  angleDeg: 0,
  tofMm: 800,
  obstacle: false,
  pit: false,
  receivedAt: 0,
  raw: '',
};
