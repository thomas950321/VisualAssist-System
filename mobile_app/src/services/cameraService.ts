const normalizeBaseUrl = (baseUrl: string): string => baseUrl.trim().replace(/\/$/, '');

export const cameraStreamUrl = (baseUrl: string): string => {
  const url = normalizeBaseUrl(baseUrl);
  return url ? `${url}/` : '';
};

export const cameraCaptureUrl = (baseUrl: string): string => {
  const url = normalizeBaseUrl(baseUrl);
  return `${url}/capture`;
};

export const cameraAudioUrl = (baseUrl: string): string => {
  const url = normalizeBaseUrl(baseUrl);
  return `${url}/audio`;
};

export type ChestStatus = {
  triggerCounter: number;
  audioCounter?: number;
  isRecording?: boolean;
  micReady?: boolean;
  speakerReady?: boolean;
  ip: string;
  ultrasonicCm?: number;
  emergencyBrake?: boolean;
  cameraReady?: boolean;
  cameraModel?: string;
  wifiRssi?: number;
};

export async function captureCameraJpeg(baseUrl: string): Promise<Blob> {
  const response = await fetch(cameraCaptureUrl(baseUrl), {
    method: 'GET',
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(`相機擷取失敗：HTTP ${response.status}`);
  }
  return response.blob();
}

/**
 * 從胸前板獲取最新錄製的使用者提問音訊 (WAV 格式)
 */
export async function fetchLatestAudio(baseUrl: string): Promise<Blob | null> {
  try {
    const response = await fetch(cameraAudioUrl(baseUrl), {
      method: 'GET',
      cache: 'no-store',
    });
    if (!response.ok) return null;
    return await response.blob();
  } catch {
    return null;
  }
}

/**
 * 將音訊發送至胸前板，由內建 MAX98357 擴大機與喇叭接口播放
 */
export async function playAudioOnChest(baseUrl: string, audioBlob: Blob): Promise<boolean> {
  try {
    const url = normalizeBaseUrl(baseUrl);
    const response = await fetch(`${url}/play`, {
      method: 'POST',
      headers: { 'Content-Type': 'audio/wav' },
      body: audioBlob,
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function fetchChestStatus(baseUrl: string): Promise<ChestStatus> {
  const url = normalizeBaseUrl(baseUrl);
  const response = await fetch(`${url}/status`, {
    method: 'GET',
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(`相機狀態讀取失敗：HTTP ${response.status}`);
  }
  return response.json();
}
