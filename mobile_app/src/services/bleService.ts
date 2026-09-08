import { BleClient, type BleDevice, type ScanResult } from '@capacitor-community/bluetooth-le';
import type { CaneTelemetry } from '../types';

export const CANE_SERVICE_UUID = '19b10f00-e8f2-537e-4f6c-d104768a1214';
export const CANE_CHARACTERISTIC_UUID = '19b10f01-e8f2-537e-4f6c-d104768a1214';

export type CaneConnectionHandlers = {
  onTelemetry: (telemetry: CaneTelemetry) => void;
  onDisconnected: () => void;
};

let connectedDevice: BleDevice | null = null;

export function parseCaneTelemetry(raw: string): CaneTelemetry {
  const values: Record<string, number> = {};
  for (const token of raw.split(',')) {
    const [key, value] = token.split(':');
    const parsed = Number(value);
    if (key && Number.isFinite(parsed)) values[key.trim()] = parsed;
  }

  const distanceCm = values.Dist ?? 400;
  const angleDeg = values.Angle ?? 0;
  const tofMm = values.ToF ?? 800;

  return {
    distanceCm,
    angleDeg,
    tofMm,
    obstacle: distanceCm > 0 && distanceCm < 100,
    // Firmware uses 8190 as an invalid ToF sentinel; never treat it as a pit.
    pit: tofMm > 300 && tofMm < 2000,
    receivedAt: Date.now(),
    raw,
  };
}

function bytesToString(dataView: DataView): string {
  return new TextDecoder().decode(new Uint8Array(dataView.buffer));
}

export async function initializeBle(): Promise<void> {
  await BleClient.initialize();
}

export async function scanForCane(onFound: (result: ScanResult) => void): Promise<void> {
  await BleClient.requestLEScan(
    { services: [CANE_SERVICE_UUID], allowDuplicates: false },
    onFound,
  );
}

export async function stopScan(): Promise<void> {
  await BleClient.stopLEScan();
}

export async function connectToCane(
  deviceId: string,
  handlers: CaneConnectionHandlers,
): Promise<void> {
  await BleClient.connect(deviceId, handlers.onDisconnected);
  connectedDevice = await BleClient.getConnectedDevices([CANE_SERVICE_UUID]).then(
    (devices) => devices.find((device) => device.deviceId === deviceId) ?? { deviceId },
  );

  await BleClient.startNotifications(
    deviceId,
    CANE_SERVICE_UUID,
    CANE_CHARACTERISTIC_UUID,
    (value) => handlers.onTelemetry(parseCaneTelemetry(bytesToString(value))),
  );
}

export async function disconnectCane(): Promise<void> {
  if (!connectedDevice) return;
  await BleClient.stopNotifications(
    connectedDevice.deviceId,
    CANE_SERVICE_UUID,
    CANE_CHARACTERISTIC_UUID,
  );
  await BleClient.disconnect(connectedDevice.deviceId);
  connectedDevice = null;
}
