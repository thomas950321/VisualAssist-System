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
  type ChestStatus,
} from './services/cameraService';
import { describeImageWithGemini } from './services/geminiService';
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

function App() {
  const [cameraUrl, setCameraUrl] = useState(() => localStorage.getItem(CAMERA_URL_STORAGE_KEY) ?? 'http://192.168.4.1');
  
  // Layer 0: Chest Hardware Emergency Brake Telemetry
  const [chestTelemetry, setChestTelemetry] = useState<ChestTelemetry>(DEFAULT_CHEST_TELEMETRY);

  // Layer 1: Edge YOLO Detection State
  const [trackingEnabled, setTrackingEnabled] = useState(true);
  const [detections, setDetections] = useState<Detection[]>([]);
  const edgeDetectorRef = useRef<LocalYoloEdgeDetector | null>(null);
  const lastSpokenThreatRef = useRef<{ label: string; zone: SpatialZone; timestamp: number }>({
    label: '',
    zone: 'center',
    timestamp: 0,
  });

  // Layer 2: Cloud Gemini Description State
  const [describing, setDescribing] = useState(false);
  const [description, setDescription] = useState<GeminiDescription | null>(null);

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

  // 初始化第 1 層本地邊緣 YOLO 偵測器
  useEffect(() => {
    const detector = new LocalYoloEdgeDetector();
    detector.load().then(() => {
      edgeDetectorRef.current = detector;
      setLastEvent('第 1 層：手機本地 YOLO 動態模型載入就緒');
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

  // 第 0 層：胸前硬體遙測輪詢 (/status)
  useEffect(() => {
    if (demoMode) return;
    if (!cameraUrl) return;

    const timer = window.setInterval(async () => {
      try {
        const status: ChestStatus = await fetchChestStatus(cameraUrl);
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
      } catch {
        setChestTelemetry((prev) => ({ ...prev, connected: false }));
      }
    }, 450);

    return () => window.clearInterval(timer);
  }, [cameraUrl, demoMode]);

  // 展示模式模擬
  useEffect(() => {
    if (!demoMode) return;
    const timer = window.setInterval(() => {
      const mockDist = 45 + Math.round(Math.random() * 160);
      const isBrake = mockDist < 80;
      setChestTelemetry({
        ultrasonicCm: mockDist,
        emergencyBrake: isBrake,
        connected: true,
        lastUpdated: Date.now(),
      });

      if (isBrake && !lastUrgentBrakeRef.current) {
        speak('急煞警告！前方緊急障礙！', 'urgent');
        setLastEvent('展示模式：觸發第 0 層急煞');
      }
      lastUrgentBrakeRef.current = isBrake;
    }, 800);

    return () => window.clearInterval(timer);
  }, [demoMode]);

  function saveCameraUrl() {
    const normalized = cameraUrl.trim().replace(/\/$/, '');
    setCameraUrl(normalized);
    localStorage.setItem(CAMERA_URL_STORAGE_KEY, normalized);
    setLastEvent(`已儲存胸前相機位址：${normalized}`);
  }

  // 第 2 層：雲端 Gemini 按需深度認知
  async function describeEnvironment() {
    setError('');
    setDescribing(true);
    try {
      const image = await captureCameraJpeg(cameraUrl);
      const text = await describeImageWithGemini(image);
      const nextDescription = { text, generatedAt: Date.now() };
      setDescription(nextDescription);
      speak(text, 'normal');
      setLastEvent('第 2 層認知：已完成單張環境深度描述');
    } catch (descriptionError) {
      setError(descriptionError instanceof Error ? descriptionError.message : '環境描述失敗');
    } finally {
      setDescribing(false);
    }
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

        {/* 第 2 層：雲端多模態 AI 認知問答卡片 */}
        <section className="card cloud-card">
          <div className="card-heading">
            <div>
              <div className="layer-badge layer-2">第 2 層 · 雲端認知大腦 (按需觸發)</div>
              <h2>全景情境與文字解讀</h2>
            </div>
            <span className="tag">Gemini API</span>
          </div>

          <p className="cloud-explain">
            本層專為讀取店家招牌、環境全景敘事與尋物設計。<strong>非避障通道</strong>，單次拍照按需觸發，不產生連續延遲與高額流量。
          </p>

          <button
            className="primary wide trigger-btn"
            onClick={() => void describeEnvironment()}
            disabled={describing || !cameraUrl}
          >
            {describing ? '雲端分析中，請稍候…' : '📷 按鍵觸發：拍照並解讀周遭情境'}
          </button>

          {description && (
            <div className="description-box">
              <strong>最新情境描述：</strong>
              <p>{description.text}</p>
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

