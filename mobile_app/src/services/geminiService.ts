const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
const GEMINI_MODEL = (import.meta.env.VITE_GEMINI_MODEL as string | undefined) ?? 'gemini-2.5-flash';

const prompt = [
  '你是視障者的環境描述助理。請只用繁體中文回答，控制在 45 字以內。',
  '請依序描述：正前方最重要的障礙物或危險、可通行方向、必要時補充地標。',
  '不要把不確定的內容說成確定事實，不要提供醫療或安全保證。',
].join('\n');

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export async function describeImageWithGemini(imageBlob: Blob): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error('尚未設定 VITE_GEMINI_API_KEY；請先建立 mobile_app/.env.local。');
  }

  const imageBase64 = arrayBufferToBase64(await imageBlob.arrayBuffer());
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        role: 'user',
        parts: [
          { text: prompt },
          { inline_data: { mime_type: imageBlob.type || 'image/jpeg', data: imageBase64 } },
        ],
      }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 128,
      },
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Gemini API 失敗：HTTP ${response.status} ${message.slice(0, 180)}`);
  }

  const payload = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('').trim();
  if (!text) throw new Error('Gemini 沒有回傳可播報文字。');
  return text;
}
