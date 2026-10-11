/**
 * 視覺輔助語音合成與胸前板推播服務
 * 將文字轉為 16kHz 16-bit PCM WAV 並發送至 ESP32 MAX98357 擴大機播放
 */
import { playAudioOnChest } from './cameraService';

export function cancelSpeech(): void {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

export function speak(text: string, priority: 'normal' | 'urgent' = 'normal'): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  if (priority === 'urgent') {
    window.speechSynthesis.cancel();
  }
  const cleanText = text.replace(/[*#`_~]/g, '').trim();
  const utterance = new SpeechSynthesisUtterance(cleanText);
  utterance.lang = 'zh-TW';
  utterance.rate = priority === 'urgent' ? 1.15 : 1.0;
  window.speechSynthesis.speak(utterance);
}

function audioBufferToWav(buffer: AudioBuffer, targetSampleRate = 16000): Blob {
  const numChannels = 2; // ESP32 MAX98357 配置為雙聲道 (RIGHT_LEFT)
  const sourceSampleRate = buffer.sampleRate;
  const sourceLength = buffer.length;
  const targetLength = Math.round((sourceLength * targetSampleRate) / sourceSampleRate);
  
  // 取得來源聲道資料 (若來源為單聲道則複製為左右聲道)
  const leftSource = buffer.getChannelData(0);
  const rightSource = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : leftSource;

  // 線性插值重採樣至 16000Hz
  const leftResampled = new Float32Array(targetLength);
  const rightResampled = new Float32Array(targetLength);
  const ratio = sourceLength / targetLength;

  for (let i = 0; i < targetLength; i++) {
    const index = i * ratio;
    const i0 = Math.floor(index);
    const i1 = Math.min(i0 + 1, sourceLength - 1);
    const frac = index - i0;
    leftResampled[i] = leftSource[i0] * (1 - frac) + leftSource[i1] * frac;
    rightResampled[i] = rightSource[i0] * (1 - frac) + rightSource[i1] * frac;
  }

  // 封裝標準 16-bit PCM WAV (44 bytes header + interleaved 16-bit samples)
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = targetSampleRate * blockAlign;
  const dataSize = targetLength * blockAlign;
  const wavBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(wavBuffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  // RIFF Chunk Descriptor
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');

  // fmt Sub-chunk
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true);  // AudioFormat (1 for PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, targetSampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // BitsPerSample (16 bits)

  // data Sub-chunk
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  // 寫入交叉立體聲 PCM 樣本
  let offset = 44;
  for (let i = 0; i < targetLength; i++) {
    // Left channel
    let sL = Math.max(-1, Math.min(1, leftResampled[i]));
    view.setInt16(offset, sL < 0 ? sL * 0x8000 : sL * 0x7FFF, true);
    offset += 2;

    // Right channel
    let sR = Math.max(-1, Math.min(1, rightResampled[i]));
    view.setInt16(offset, sR < 0 ? sR * 0x8000 : sR * 0x7FFF, true);
    offset += 2;
  }

  return new Blob([wavBuffer], { type: 'audio/wav' });
}

/**
 * 將文字轉成適合 ESP32 MAX98357 播放的 16kHz 16-bit WAV Blob
 */
export async function synthesizeTextToWav(text: string): Promise<Blob> {
  const cleanText = text.replace(/[*#`_~]/g, '').trim();
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=zh-TW&client=tw-ob&q=${encodeURIComponent(cleanText)}`;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`TTS 語音生成失敗: HTTP ${response.status}`);
  }
  const mp3ArrayBuffer = await response.arrayBuffer();

  const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const audioCtx = new AudioContextClass();
  
  try {
    const audioBuffer = await audioCtx.decodeAudioData(mp3ArrayBuffer);
    return audioBufferToWav(audioBuffer, 16000);
  } finally {
    void audioCtx.close();
  }
}

/**
 * 智慧語音播放路由：
 * 若啟用胸前板且連線正常，自動將聲音推播至 ESP32 喇叭；若失敗或未啟用則本地朗讀
 */
export async function speakResponse(
  text: string,
  cameraUrl: string,
  useChestSpeaker: boolean,
  onStatusUpdate?: (status: string) => void
): Promise<void> {
  if (useChestSpeaker && cameraUrl) {
    try {
      onStatusUpdate?.('🔊 正在合成語音並推播至胸前板喇叭…');
      const wavBlob = await synthesizeTextToWav(text);
      const ok = await playAudioOnChest(cameraUrl, wavBlob);
      if (ok) {
        onStatusUpdate?.('🔊 已透過胸前板喇叭播放回答！');
        return;
      }
      onStatusUpdate?.('⚠️ 胸前板喇叭無回應，切換至本機喇叭播放');
    } catch (e) {
      console.warn('推播至胸前板失敗，退回本機語音:', e);
      onStatusUpdate?.('⚠️ 胸前板語音失敗，已自動由手機/電腦朗讀');
    }
  }

  // 本地設備語音朗讀
  speak(text, 'normal');
}
