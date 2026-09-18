const normalizeBaseUrl = (baseUrl: string): string => baseUrl.trim().replace(/\/$/, '');

export const cameraStreamUrl = (baseUrl: string): string => {
  const url = normalizeBaseUrl(baseUrl);
  return url ? `${url}/` : '';
};

export const cameraCaptureUrl = (baseUrl: string): string => {
  const url = normalizeBaseUrl(baseUrl);
  return `${url}/capture`;
};

export type ChestStatus = {
  triggerCounter: number;
  ip: string;
  ultrasonicCm?: number;
  emergencyBrake?: boolean;
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

