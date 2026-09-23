import { useEffect, useMemo, useRef, useState } from 'react';
import type { ScanResult } from '@capacitor-community/bluetooth-le';
import {
  connectToCane,
  initializeBle,
  scanForCane,
  stopScan,
  disconnectCane,
} from './services/bleService';
import {
  cameraCaptureUrl,
  cameraStreamUrl,
  captureCameraJpeg,
  fetchChestStatus,
  fetchLatestAudio,
  playAudioOnChest,
  type ChestStatus,
} from './services/cameraService';
import {
  describeImageWithGemini,
  askGeminiWithImageAndAudio,
} from './services/geminiService';
import { cancelSpeech, speak } from './services/ttsService';
import {
  LocalYoloEdgeDetector,
  type Detection,
  type SpatialZone,
} from './services/edgeDetector';
import {
  DEFAULT_TELEMETRY,
  DEFAULT_CHEST_TELEMETRY,
  type CaneTelemetry,
  type ChestTelemetry,
  type GeminiDescription,
} from './types';
import './styles.css';

const CAMERA_URL_STORAGE_KEY = 'blind-assist-camera-url';

interface ConversationItem {
  id: string;
  type: 'voice' | 'text' | 'scene';
  question?: string;
  answer: string;
  timestamp: number;
}

function App() {
  const [cameraUrl, setCameraUrl] = useState(() => localStorage.getItem(CAMERA_URL_STORAGE_KEY) ?? 'http://192.168.4.1');
  
  // Layer 0: Chest Hardware Emergency Brake Telemetry
  const [chestTelemetry, setChestTelemetry] = useState<ChestTelemetry>(DEFAULT_CHEST_TELEMETRY);
  const [chestStatus, setChestStatus] = useState<ChestStatus | null>(null);

  // Layer 1: Edge YOLO Detection State
  const [trackingEnabled, setTrackingEnabled] = useState(true);
  const [detections, setDetections] = useState<Detection[]>([]);
  const edgeDetectorRef = useRef<LocalYoloEdgeDetector | null>(null);
  const lastSpokenThreatRef = useRef<{ label: string; zone: SpatialZone; timestamp: number }>({
    label: '',
    zone: 'center',
    timestamp: 0,
  });

  // Layer 2: Cloud Gemini Description & Voice Q&A State
  const [describing, setDescribing] = useState(false);
  const [description, setDescription] = useState<GeminiDescription | null>(null);
  const [conversation, setConversation] = useState<ConversationItem[]>([]);
  const [textQuestion, setTextQuestion] = useState('');

  // 實體按鍵與音訊計數器追蹤 (防重複觸發)
  const lastTriggerCounterRef = useRef<number>(0);
  const lastAudioCounterRef = useRef<number>(0);
  const isHandlingVoiceRef = useRef<boolean>(false);

  // Optional: Smart Cane Telemetry
  const [telemetry, setTelemetry] = useState<CaneTelemetry>(DEFAULT_TELEMETRY);
  const [caneConnected, setCaneConnected] = useState(false);
  const [devices, setDevices] = useState<ScanResult[]>([]);
  const [scanning, setScanning] = useState(false);

  // System States
  const [error, setError] = useState('');
  const [demoMode, setDemoMode] = useState(false);
  const [lastEvent, setLastEvent] = useState('系統就緒：三層邊緣導盲架構已啟動');
  const streamImgRef = useRef<HTMLImageElement | null>(null);
  const lastUrgentBrakeRef = useRef(false);
  const [isRealModel, setIsRealModel] = useState(false);

  // 初始化第 1 層本地邊緣 YOLO 偵測器
  useEffect(() => {
    const detector = new LocalYoloEdgeDetector();
    detector.load().then(() => {
      edgeDetectorRef.current = detector;
      const isReal = detector.isRealModelRunning();
      setIsRealModel(isReal);
      setLastEvent(isReal ? '第 1 層：ONNX YOLOv8n 硬體加速模型載入就緒' : '第 1 層：手機本地 YOLO 動態感知就緒 (開發模擬模式)');
    });
  }, []);

  // 第 1 層：本地推論輪詢循環 (約 10~15 FPS，30~50ms 延遲)
  useEffect(() => {
    if (!trackingEnabled) {
      setDetections([]);
      return;
    }

    const interval = window.setInterval(async () => {
      const detector = edgeDetectorRef.current;
      if (!detector || !detector.isLoaded()) return;

      const img = streamImgRef.current;
      if (img) {
        try {
          const results = await detector.detect(img);
          setDetections(results);

          // 空間安全錐危險過濾語音播報 (冷卻 3 秒防聽覺疲勞)
          const criticalInCenter = results.find(
            (item) => item.zone === 'center' && (item.threatLevel === 'critical' || item.threatLevel === 'warning')
          );

          if (criticalInCenter) {
            const now = Date.now();
            const last = lastSpokenThreatRef.current;
            const isCooldownPassed = now - last.timestamp > 3200;
            const isDifferentLabel = last.label !== criticalInCenter.chineseLabel;

            if (isCooldownPassed || isDifferentLabel) {
              const distanceText = criticalInCenter.estimatedDistanceM < 2.0 ? '靠近中' : '約三公尺';
              const message = `注意，正前方有${criticalInCenter.chineseLabel}，${distanceText}`;
              speak(message, criticalInCenter.threatLevel === 'critical' ? 'urgent' : 'normal');
              lastSpokenThreatRef.current = {
                label: criticalInCenter.chineseLabel,
                zone: 'center',
                timestamp: now,
              };
              setLastEvent(`動態告警：正前方偵測到${criticalInCenter.chineseLabel} (${criticalInCenter.estimatedDistanceM}m)`);
            }
          }
        } catch {
          // 推論暫態忽略
        }
      }
    }, 90);

    return () => window.clearInterval(interval);
  }, [trackingEnabled]);

  // 第 2 層：胸前雙向語音提問處理核心
  async function handleChestVoiceQandA() {
    if (isHandlingVoiceRef.current) return;
    isHandlingVoiceRef.current = true;
    setDescribing(true);
    setError('');
    setLastEvent('🎙️ 接收到胸前麥克風提問！正在抓取照片與音訊送往 Gemini…');

    try {
      // 1. 同步抓取照片與胸前錄製之音訊
      const image = await captureCameraJpeg(cameraUrl);
      const audio = await fetchLatestAudio(cameraUrl);

      // 2. 呼叫 Gemini 多模態問答
      const answer = await askGeminiWithImageAndAudio(image, audio);
      
      // 3. 語音朗讀回答
      speak(answer, 'normal');

      // 4. 更新對話與紀錄
      const newEntry: ConversationItem = {
        id: String(Date.now()),
        type: 'voice',
        question: '胸前麥克風語音提問',
        answer,
        timestamp: Date.now(),
      };
      setConversation((prev) => [newEntry, ...prev.slice(0, 10)]);
      setDescription({ text: answer, generatedAt: Date.now() });
      setLastEvent(`🤖 Gemini 回答：${answer}`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : '語音問答失敗';
      setError(errMsg);
      setLastEvent(`❌ 語音問答錯誤：${errMsg}`);
    } finally {
      setDescribing(false);
      isHandlingVoiceRef.current = false;
    }
  }

  // 第 2 層：手動文字或點擊情境描述
  async function describeEnvironment(customQuestion?: string) {
    if (describing) return;
    setError('');
    setDescribing(true);
    try {
      const image = await captureCameraJpeg(cameraUrl);
      const text = customQuestion
        ? await askGeminiWithImageAndAudio(image, null, customQuestion)
        : await describeImageWithGemini(image);

      const nextDescription = { text, generatedAt: Date.now() };
      setDescription(nextDescription);
      speak(text, 'normal');

      const newEntry: ConversationItem = {
        id: String(Date.now()),
        type: customQuestion ? 'text' : 'scene',
        question: customQuestion,
        answer: text,
        timestamp: Date.now(),
      };
      setConversation((prev) => [newEntry, ...prev.slice(0, 10)]);
      setLastEvent(customQuestion ? `🤖 問答完成：${text}` : '第 2 層認知：已完成單張環境深度描述');
      if (customQuestion) setTextQuestion('');
    } catch (descriptionError) {
      setError(descriptionError instanceof Error ? descriptionError.message : '環境描述失敗');
    } finally {
      setDescribing(false);
    }
  }

  // 第 0 層 & 實體按鍵遙測輪詢 (/status)
  useEffect(() => {
    if (demoMode) return;
    if (!cameraUrl) return;

    const timer = window.setInterval(async () => {
      try {
        const status: ChestStatus = await fetchChestStatus(cameraUrl);
        setChestStatus(status);

        const ultrasonicCm = status.ultrasonicCm ?? 400;
        const emergencyBrake = Boolean(status.emergencyBrake || ultrasonicCm < 80);

        setChestTelemetry({
          ultrasonicCm,
          emergencyBrake,
          connected: true,
          lastUpdated: Date.now(),
        });

        // 觸發急煞廣播
        if (emergencyBrake && !lastUrgentBrakeRef.current) {
          speak('急煞警告！前方緊急近迫障礙物！', 'urgent');
          setLastEvent('第 0 層急煞：胸前硬體偵測距離小於 80cm！');
        }
        lastUrgentBrakeRef.current = emergencyBrake;

        // 偵測胸前板「按住提問錄音完畢放開」事件
        if (
          status.audioCounter !== undefined &&
          lastAudioCounterRef.current > 0 &&
          status.audioCounter > lastAudioCounterRef.current
        ) {
          lastAudioCounterRef.current = status.audioCounter;
          lastTriggerCounterRef.current = status.triggerCounter;
          void handleChestVoiceQandA();
        } else if (
          status.triggerCounter !== undefined &&
          lastTriggerCounterRef.current > 0 &&
          status.triggerCounter > lastTriggerCounterRef.current
        ) {
          // 純短按拍照事件
          lastTriggerCounterRef.current = status.triggerCounter;
          void describeEnvironment();
        }

        // 初次連線校正計數器基準點
        if (lastTriggerCounterRef.current === 0 && status.triggerCounter !== undefined) {
          lastTriggerCounterRef.current = status.triggerCounter;
        }
        if (lastAudioCounterRef.current === 0 && status.audioCounter !== undefined) {
          lastAudioCounterRef.current = status.audioCounter;
        }
      } catch {
        setChestTelemetry((prev) => ({ ...prev, connected: false }));
      }
    }, 400);

    return () => window.clearInterval(timer);
  }, [cameraUrl, demoMode]);

  function saveCameraUrl() {
    const normalized = cameraUrl.trim().replace(/\/$/, '');
    setCameraUrl(normalized);
    localStorage.setItem(CAMERA_URL_STORAGE_KEY, normalized);
    setLastEvent(`已儲存胸前相機位址：${normalized}`);
  }

  // 智慧手杖 BLE 控制（選配）
  async function startScan() {
    setError('');
    setDevices([]);
    setScanning(true);
    try {
      await initializeBle();
      await scanForCane((result) => {
        setDevices((current) => current.some((item) => item.device.deviceId === result.device.deviceId) ? current : [...current, result]);
      });
      window.setTimeout(() => {
        void stopScan();
        setScanning(false);
      }, 8000);
    } catch (scanError) {
      setScanning(false);
      setError(scanError instanceof Error ? scanError.message : 'BLE 掃描失敗');
    }
  }

  async function connectDevice(deviceId: string) {
    setError('');
    try {
      await stopScan();
      setScanning(false);
      await initializeBle();
      await connectToCane(deviceId, {
        onTelemetry: (next) => {
          setTelemetry(next);
          setLastEvent(`手杖資料：${next.raw}`);
        },
        onDisconnected: () => {
          setCaneConnected(false);
          setLastEvent('手杖藍牙已斷線');
        },
      });
      setCaneConnected(true);
      setLastEvent('手杖藍牙已連線');
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : 'BLE 連線失敗');
    }
  }

  async function disconnectDevice() {
    try {
      await disconnectCane();
      setCaneConnected(false);
      setLastEvent('已中斷手杖連線');
    } catch (disconnectError) {
      setError(disconnectError instanceof Error ? disconnectError.message : '中斷失敗');
    }
  }

  function stopAllSpeech() {
    cancelSpeech();
    setLastEvent('已停止所有語音播報');
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">BLIND ASSIST · EDGE MULTI-TIER SYSTEM</p>
          <h1>三層邊緣智慧導盲中樞</h1>
          <p className="subtitle">第0層胸前急煞 + 第1層手機本地YOLO動態追蹤 + 第2層按需雲端認知</p>
        </div>
        <div className="status-pill-group">
          <div className={`connection-pill ${chestTelemetry.connected ? 'online' : 'offline'}`}>
            <span className="status-dot" /> {chestTelemetry.connected ? '胸前相機已連線' : '胸前相機離線'}
          </div>
          <div className={`connection-pill ${caneConnected ? 'online' : 'optional'}`}>
            <span className="status-dot" /> {caneConnected ? '手杖已連接' : '手杖選配未連接'}
          </div>
        </div>
      </header>

      {error && <section className="error-banner" role="alert">{error}</section>}

      {/* 第 0 層：胸前保命急煞 (硬體反射神經) */}
      <section className={`danger-panel ${chestTelemetry.emergencyBrake ? 'critical' : 'safe'}`} aria-live="assertive">
        <div>
          <div className="layer-badge">第 0 層 · 胸前反射急煞 (&lt; 30ms)</div>
          <h2>{chestTelemetry.emergencyBrake ? '急煞警報！前方緊急障礙！' : '前方安全，未達急煞門檻'}</h2>
          <p>
            {chestTelemetry.emergencyBrake
              ? '胸前超音波測得小於 80cm 近迫障礙物，硬體蜂鳴器／震動已直接觸發急煞！'
              : '胸前超音波持續監控中，前方距離安全，系統保持正常通行。'}
          </p>
        </div>
        <div className="danger-number">
          <strong>{Math.round(chestTelemetry.ultrasonicCm)}</strong>
          <span>cm</span>
        </div>
      </section>

      <div className="main-grid">
        {/* 第 1 層：手機本地 YOLO 動態視覺感知卡片 */}
        <section className="card camera-card">
          <div className="card-heading">
            <div>
              <div className="layer-badge layer-1">第 1 層 · 手機邊緣動態 YOLO (15~30 FPS)</div>
              <h2>即時視野與動態追蹤</h2>
            </div>
            <div className="badge-group">
              <span className={`tag ${trackingEnabled ? 'active-tag' : ''}`}>
                {trackingEnabled ? 'YOLO 追蹤中' : '已暫停追蹤'}
              </span>
              <span className={`tag ${isRealModel ? 'active-tag' : ''}`}>
                {isRealModel ? '⚡ ONNX WebGL' : '🛠️ 模擬備援'}
              </span>
              <span className="tag">MJPEG</span>
            </div>
          </div>

          <div className="stream-container">
            {/* 安全錐指示標尺 */}
            <div className="spatial-guide-bar">
              <span className="zone-indicator left">左側</span>
              <span className="zone-indicator center active">中央安全錐</span>
              <span className="zone-indicator right">右側</span>
            </div>

            <div className="stream-frame">
              {cameraUrl ? (
                <img
                  ref={streamImgRef}
                  src={cameraStreamUrl(cameraUrl)}
                  alt="胸前相機即時畫面"
                  crossOrigin="anonymous"
                />
              ) : (
                <div className="empty-frame">請先輸入相機位址</div>
              )}

              {/* 疊加中央安全錐視覺標線 */}
              <div className="safety-cone-overlay" />

              {/* 即時物件邊界框繪製 */}
              {trackingEnabled &&
                detections.map((det) => {
                  const [x, y, w, h] = det.bbox;
                  return (
                    <div
                      key={det.id}
                      className={`bbox-overlay ${det.threatLevel}`}
                      style={{
                        left: `${(x * 100).toFixed(1)}%`,
                        top: `${(y * 100).toFixed(1)}%`,
                        width: `${(w * 100).toFixed(1)}%`,
                        height: `${(h * 100).toFixed(1)}%`,
                      }}
                    >
                      <span className="bbox-label">
                        {det.chineseLabel} {Math.round(det.confidence * 100)}% ({det.estimatedDistanceM}m)
                      </span>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* 偵測物件清單 */}
          <div className="detection-list">
            <strong>目前視野動態物件：</strong>
            {detections.length === 0 ? (
              <span className="no-detection">無重大近距障礙</span>
            ) : (
              detections.map((det) => (
                <span key={det.id} className={`detection-pill ${det.threatLevel}`}>
                  {det.chineseLabel} · {det.zone === 'center' ? '正前方' : det.zone === 'left' ? '左側' : '右側'} ({det.estimatedDistanceM}m)
                </span>
              ))
            )}
          </div>

          <div className="button-row">
            <button
              className={trackingEnabled ? 'secondary' : 'primary'}
              onClick={() => setTrackingEnabled((prev) => !prev)}
            >
              {trackingEnabled ? '暫停 YOLO 追蹤' : '啟動 YOLO 追蹤'}
            </button>
            <button
              className={`secondary ${demoMode ? 'selected' : ''}`}
              onClick={() => setDemoMode((value) => !value)}
            >
              {demoMode ? '關閉展示模式' : '啟用展示模式'}
            </button>
          </div>

          <div className="form-row">
            <label htmlFor="camera-url">相機位址</label>
            <input
              id="camera-url"
              value={cameraUrl}
              onChange={(e) => setCameraUrl(e.target.value)}
              placeholder="http://192.168.4.1"
            />
            <button className="secondary" onClick={saveCameraUrl}>儲存</button>
          </div>
        </section>

        {/* 第 2 層：雲端多模態 AI 認知問答卡片 (雙向語音問答大腦) */}
        <section className="card cloud-card">
          <div className="card-heading">
            <div>
              <div className="layer-badge layer-2">第 2 層 · 雲端認知大腦 (按需多模態問答)</div>
              <h2>全景情境與雙向語音提問</h2>
            </div>
            <div className="badge-group">
              <span className={`tag ${chestStatus?.isRecording ? 'critical' : ''}`}>
                {chestStatus?.isRecording ? '🔴 胸前錄音中…' : chestStatus?.micReady ? '🎙️ PDM 麥克風就緒' : '麥克風未偵測'}
              </span>
              <span className="tag">
                {chestStatus?.speakerReady ? '🔊 喇叭擴大機' : 'Gemini 2.5'}
              </span>
            </div>
          </div>

          <p className="cloud-explain">
            本層專為視障者讀取<strong>店家招牌、紅綠燈秒數、環境全景敘事與尋物</strong>設計。
          </p>

          <div className="voice-tip-box">
            <span className="voice-tip-icon">💡</span>
            <div className="voice-tip-text">
              <strong>胸前直覺操作：</strong>
              長按胸前板 <code>BOOT (GPIO 0)</code> 鍵對著麥克風說話提問，放開按鈕即自動拍照並發送給 Gemini，隨後透過語音朗讀回答！
            </div>
          </div>

          {/* 常用語音快捷提問按鈕 */}
          <div className="quick-question-row">
            <button
              className="chip-btn"
              disabled={describing}
              onClick={() => void describeEnvironment('這家店招牌寫什麼？販賣什麼？')}
            >
              🏷️ 店家招牌？
            </button>
            <button
              className="chip-btn"
              disabled={describing}
              onClick={() => void describeEnvironment('前面路口紅燈或綠燈還有幾秒？')}
            >
              🚦 紅綠燈秒數？
            </button>
            <button
              className="chip-btn"
              disabled={describing}
              onClick={() => void describeEnvironment('前方地面是否有階梯、水坑或施工障礙？')}
            >
              🚧 路況障礙？
            </button>
          </div>

          {/* 手動輸入文字提問 */}
          <form
            className="question-input-row"
            onSubmit={(e) => {
              e.preventDefault();
              if (textQuestion.trim()) {
                void describeEnvironment(textQuestion.trim());
              }
            }}
          >
            <input
              type="text"
              value={textQuestion}
              onChange={(e) => setTextQuestion(e.target.value)}
              placeholder="輸入問題或對胸前長按提問…"
              disabled={describing}
            />
            <button type="submit" className="primary" disabled={describing || !textQuestion.trim()}>
              {describing ? '分析中…' : '提問'}
            </button>
          </form>

          <button
            className="secondary wide trigger-btn"
            onClick={() => void describeEnvironment()}
            disabled={describing || !cameraUrl}
          >
            {describing ? '雲端分析中，請稍候…' : '📷 單拍快門：解讀全景情境'}
          </button>

          {/* 最新對話歷程列表 */}
          {conversation.length > 0 && (
            <div className="conversation-panel">
              <strong>💬 最新問答紀錄：</strong>
              <div className="conversation-list">
                {conversation.map((item) => (
                  <div key={item.id} className="conversation-item">
                    {item.question && (
                      <div className="conv-question">
                        <span className="conv-tag">{item.type === 'voice' ? '🎙️ 語音' : '⌨️ 文字'}</span>
                        <span>{item.question}</span>
                      </div>
                    )}
                    <div className="conv-answer">
                      <span className="conv-tag ai">🤖 Gemini</span>
                      <p>{item.answer}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 選配擴充：智慧手杖節點 */}
          <div className="cane-subpanel">
            <div className="card-heading">
              <div>
                <p className="panel-kicker">選配配件</p>
                <h3>智慧手杖節點 (地面坑洞防護)</h3>
              </div>
              <span className="tag">{caneConnected ? '已連線' : '可選配'}</span>
            </div>
            <div className="metric-grid">
              <Metric label="手杖距離" value={`${telemetry.distanceCm.toFixed(1)} cm`} warning={telemetry.obstacle} />
              <Metric label="ToF 坑洞" value={`${telemetry.tofMm} mm`} warning={telemetry.pit} />
            </div>
            <div className="button-row">
              {!caneConnected ? (
                <button className="secondary" onClick={() => void startScan()} disabled={scanning}>
                  {scanning ? '掃描中…' : '連線手杖 BLE'}
                </button>
              ) : (
                <button className="secondary" onClick={() => void disconnectDevice()}>中斷手杖</button>
              )}
            </div>
            {devices.length > 0 && (
              <div className="device-list">
                {devices.map((res) => (
                  <button key={res.device.deviceId} className="device-item" onClick={() => void connectDevice(res.device.deviceId)}>
                    <span>{res.localName || res.device.name || '未命名手杖'}</span>
                    <small>{res.device.deviceId}</small>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* 底部狀態與控制列 */}
      <section className="card protocol-card">
        <div>
          <p className="panel-kicker">系統即時日誌</p>
          <p className="last-event-text">{lastEvent}</p>
        </div>
        <button className="secondary" onClick={stopAllSpeech}>停止全部語音</button>
      </section>

      <footer className="footer-note">
        本系統為研究原型，具備三層防護分級架構。實地行走仍請配合傳統白手杖，並由專人陪同測試。
      </footer>
    </main>
  );
}

function Metric({ label, value, warning = false }: { label: string; value: string; warning?: boolean }) {
  return (
    <div className={`metric ${warning ? 'metric-warning' : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export default App;

