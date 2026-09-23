const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
const GEMINI_MODEL = (import.meta.env.VITE_GEMINI_MODEL as string | undefined) ?? 'gemini-2.5-flash';

const DEFAULT_PROMPT = [
  '你是視障者的環境描述助理。請只用繁體中文回答，控制在 45 字以內。',
  '請依序描述：正前方最重要的障礙物或危險、可通行方向、必要時補充地標。',
  '不要把不確定的內容說成確定事實，不要提供醫療或安全保證。',
].join('\n');

const VOICE_QUESTION_PROMPT = [
  '你是視障者的即時語音問答助理。',
  '使用者剛才透過胸前麥克風對你說話提問（請聆聽隨附的音訊內容）。',
  '請仔細結合隨附的現場照片與使用者的問題，用繁體中文給出最精確、親切且實用的回答。',
  '回答請保持口語化、精簡扼要，長度控制在 60 字以內，方便語音播報。',
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

/**
 * 多模態 Gemini 認知問答
 * 支援「純照片描述」或「照片 + 使用者語音提問」同步發送
 */
export async function askGeminiWithImageAndAudio(
  imageBlob: Blob,
  audioBlob?: Blob | null,
  textQuestion?: string
): Promise<string> {
  if (!GEMINI_API_KEY || GEMINI_API_KEY === 'replace_with_your_key') {
    throw new Error('尚未設定 VITE_GEMINI_API_KEY；請先在 mobile_app/.env 填入你的 Gemini API Key。');
  }

  const imageBase64 = arrayBufferToBase64(await imageBlob.arrayBuffer());
  const parts: Array<{ text?: string; inline_data?: { mime_type: string; data: string } }> = [];

  // 1. 設定系統提示詞與提問
  if (audioBlob) {
    parts.push({ text: VOICE_QUESTION_PROMPT });
  } else if (textQuestion) {
    parts.push({ text: `使用者提問：${textQuestion}\n請結合照片用繁體中文簡明回答（60字內）：` });
  } else {
    parts.push({ text: DEFAULT_PROMPT });
  }

  // 2. 加入照片
  parts.push({
    inline_data: {
      mime_type: imageBlob.type || 'image/jpeg',
      data: imageBase64,
    },
  });

  // 3. 若有語音提問音訊，加入音訊資料
  if (audioBlob) {
    const audioBase64 = arrayBufferToBase64(await audioBlob.arrayBuffer());
    parts.push({
      inline_data: {
        mime_type: audioBlob.type || 'audio/wav',
        data: audioBase64,
      },
    });
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        role: 'user',
        parts,
      }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 256,
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

/**
 * 向下相容原有函式呼叫
 */
export async function describeImageWithGemini(imageBlob: Blob): Promise<string> {
  return askGeminiWithImageAndAudio(imageBlob);
}
