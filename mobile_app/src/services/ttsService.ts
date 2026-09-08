let lastSpeechAt = 0;
let lastSpeechText = '';

export type SpeechPriority = 'urgent' | 'normal';

export function speak(text: string, priority: SpeechPriority = 'normal'): void {
  if (!('speechSynthesis' in window) || !text.trim()) return;

  const now = Date.now();
  const cooldown = priority === 'urgent' ? 500 : 2500;
  if (text === lastSpeechText && now - lastSpeechAt < cooldown) return;

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'zh-TW';
  utterance.rate = priority === 'urgent' ? 1.1 : 0.95;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);

  lastSpeechAt = now;
  lastSpeechText = text;
}

export function cancelSpeech(): void {
  window.speechSynthesis?.cancel();
}
