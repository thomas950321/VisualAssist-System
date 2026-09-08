import { useEffect, useMemo, useRef, useState } from 'react';
import type { ScanResult } from '@capacitor-community/bluetooth-le';
import { BleClient } from '@capacitor-community/bluetooth-le';
import {
  connectToCane,
  initializeBle,
  scanForCane,
  stopScan,
  disconnectCane,
  type CaneConnectionHandlers,
} from './services/bleService';
import { cameraCaptureUrl, cameraStreamUrl, captureCameraJpeg } from './services/cameraService';
import { describeImageWithGemini } from './services/geminiService';
import { cancelSpeech, speak } from './services/ttsService';
import { DEFAULT_TELEMETRY, type CaneTelemetry, type GeminiDescription } from './types';
import './styles.css';

const CAMERA_URL_STORAGE_KEY = 'blind-assist-camera-url';

function App() {
  const [cameraUrl, setCameraUrl] = useState(() => localStorage.getItem(CAMERA_URL_STORAGE_KEY) ?? 'http://192.168.4.1');
  const [telemetry, setTelemetry] = useState<CaneTelemetry>(DEFAULT_TELEMETRY);
  const [caneConnected, setCaneConnected] = useState(false);
  const [devices, setDevices] = useState<ScanResult[]>([]);
  const [scanning, setScanning] = useState(false);
  const [describing, setDescribing] = useState(false);
  const [description, setDescription] = useState<GeminiDescription | null>(null);
  const [error, setError] = useState('');
  const [demoMode, setDemoMode] = useState(false);
  const [lastEvent, setLastEvent] = useState('系統尚未收到手杖資料');
  const lastUrgentKey = useRef('');

  const dangerState = useMemo(() => {
    if (telemetry.pit) return { level: 'critical', label: '地面落差／坑洞警告', text: '前方地面可能有落差，請立即停下確認。' };
    if (telemetry.obstacle) return { level: 'warning', label: '前方障礙物', text: `前方約 ${Math.round(telemetry.distanceCm)} 公尺內有障礙物。` };
    return { level: 'safe', label: '目前未偵測到急迫危險', text: '請維持使用白手杖探索環境。' };
  }, [telemetry]);

  useEffect(() => {
    if (demoMode) return;
    const handlers: CaneConnectionHandlers = {
      onTelemetry: (next) => {
        setTelemetry(next);
        setLastEvent(`收到資料：${next.raw}`);
      },
      onDisconnected: () => {
        setCaneConnected(false);
        setLastEvent('手杖藍牙已斷線');
      },
    };

    // 將 handlers 放在 ref 的簡化版本；實際連線在 connectDevice 時建立。
    void handlers;
  }, [demoMode]);

  useEffect(() => {
    if (!demoMode) return;
    const timer = window.setInterval(() => {
      const mockDistance = 70 + Math.round(Math.random() * 180);
      setTelemetry({
        distanceCm: mockDistance,
        angleDeg: Math.round((Math.random() - 0.5) * 30),
        tofMm: Math.random() > 0.92 ? 420 : 180,
        obstacle: mockDistance < 100,
        pit: false,
        receivedAt: Date.now(),
        raw: `DEMO Dist:${mockDistance},Angle:0,ToF:180`,
      });
      setLastEvent('展示模式：模擬手杖遙測資料');
    }, 1000);
    return () => window.clearInterval(timer);
  }, [demoMode]);

  useEffect(() => {
    const key = `${dangerState.level}:${Math.round(telemetry.distanceCm / 10)}:${telemetry.pit}`;
    if (dangerState.level !== 'safe' && key !== lastUrgentKey.current) {
      speak(dangerState.text, 'urgent');
      lastUrgentKey.current = key;
    }
  }, [dangerState, telemetry.distanceCm, telemetry.pit]);

  function saveCameraUrl() {
    const normalized = cameraUrl.trim().replace(/\/$/, '');
    setCameraUrl(normalized);
    localStorage.setItem(CAMERA_URL_STORAGE_KEY, normalized);
    setLastEvent(`已儲存相機位址：${normalized}`);
  }

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
          setLastEvent(`收到資料：${next.raw}`);
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
      setLastEvent('已中斷手杖藍牙');
    } catch (disconnectError) {
      setError(disconnectError instanceof Error ? disconnectError.message : 'BLE 中斷失敗');
    }
  }

  async function describeEnvironment() {
    setError('');
    setDescribing(true);
    try {
      const image = await captureCameraJpeg(cameraUrl);
      const text = await describeImageWithGemini(image);
      const nextDescription = { text, generatedAt: Date.now() };
      setDescription(nextDescription);
      speak(text, 'normal');
      setLastEvent('已完成一次雲端環境描述；照片未在 App 中保存');
    } catch (descriptionError) {
      setError(descriptionError instanceof Error ? descriptionError.message : '環境描述失敗');
    } finally {
      setDescribing(false);
    }
  }

  function stopAllSpeech() {
    cancelSpeech();
    setLastEvent('已停止語音播報');
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">BLIND ASSIST · PROTOTYPE</p>
          <h1>穿戴式盲人輔助控制中心</h1>
          <p className="subtitle">快通道由手杖與邊緣端即時處理；慢通道按需呼叫多模態 AI。</p>
        </div>
        <div className={`connection-pill ${caneConnected ? 'online' : 'offline'}`}>
          <span className="status-dot" /> {caneConnected ? '手杖已連線' : '手杖未連線'}
        </div>
      </header>

      {error && <section className="error-banner" role="alert">{error}</section>}

      <section className={`danger-panel ${dangerState.level}`} aria-live="assertive">
        <div>
          <p className="panel-kicker">保命快通道</p>
          <h2>{dangerState.label}</h2>
          <p>{dangerState.text}</p>
        </div>
        <div className="danger-number">
          <strong>{Math.round(telemetry.distanceCm)}</strong>
          <span>cm</span>
        </div>
      </section>

      <div className="main-grid">
        <section className="card camera-card">
          <div className="card-heading">
            <div>
              <p className="panel-kicker">胸前視覺中樞</p>
              <h2>即時畫面</h2>
            </div>
            <span className="tag">MJPEG</span>
          </div>
          <div className="stream-frame">
            {cameraUrl ? <img src={cameraStreamUrl(cameraUrl)} alt="胸前相機即時畫面" /> : <div className="empty-frame">請先輸入相機 IP 位址</div>}
          </div>
          <div className="form-row">
            <label htmlFor="camera-url">相機位址</label>
            <input id="camera-url" value={cameraUrl} onChange={(event) => setCameraUrl(event.target.value)} placeholder="http://192.168.4.1" />
            <button className="secondary" onClick={saveCameraUrl}>儲存</button>
          </div>
          <button className="primary wide" onClick={() => void describeEnvironment()} disabled={describing || !cameraUrl}>
            {describing ? '分析中，請稍候…' : '擷取照片並描述環境'}
          </button>
          {description && <div className="description-box"><strong>最近一次描述</strong><p>{description.text}</p></div>}
          <p className="privacy-note">原型版會直接從 App 呼叫 Gemini；正式展示請改用後端代理，避免把 API Key 放進行動 App。</p>
        </section>

        <section className="card telemetry-card">
          <div className="card-heading">
            <div>
              <p className="panel-kicker">智慧手杖節點</p>
              <h2>感測器狀態</h2>
            </div>
            <span className="tag">{demoMode ? 'DEMO' : 'BLE'}</span>
          </div>
          <div className="metric-grid">
            <Metric label="補償後距離" value={`${telemetry.distanceCm.toFixed(1)} cm`} warning={telemetry.obstacle} />
            <Metric label="手杖角度" value={`${telemetry.angleDeg.toFixed(1)}°`} />
            <Metric label="ToF 距離" value={`${telemetry.tofMm} mm`} warning={telemetry.pit} />
            <Metric label="資料時間" value={telemetry.receivedAt ? new Date(telemetry.receivedAt).toLocaleTimeString('zh-TW') : '--'} />
          </div>
          <div className="button-row">
            {!caneConnected ? <button className="primary" onClick={() => void startScan()} disabled={scanning || demoMode}>{scanning ? '掃描中…' : '掃描手杖 BLE'}</button> : <button className="secondary" onClick={() => void disconnectDevice()}>中斷連線</button>}
            <button className={`secondary ${demoMode ? 'selected' : ''}`} onClick={() => setDemoMode((value) => !value)}>{demoMode ? '關閉展示模式' : '啟用展示模式'}</button>
          </div>
          {devices.length > 0 && <div className="device-list">{devices.map((result) => <button key={result.device.deviceId} className="device-item" onClick={() => void connectDevice(result.device.deviceId)}><span>{result.localName || result.device.name || '未命名裝置'}</span><small>{result.device.deviceId}</small></button>)}</div>}
          <p className="last-event">{lastEvent}</p>
        </section>
      </div>

      <section className="card protocol-card">
        <div>
          <p className="panel-kicker">安全控制</p>
          <h2>優先級控制</h2>
          <p>危險事件以本地震動與短語音為優先，不等待雲端回覆。環境描述只在使用者主動觸發時執行。</p>
        </div>
        <button className="secondary" onClick={stopAllSpeech}>停止語音</button>
      </section>

      <footer className="footer-note">這是研究原型，不是醫療器材或自主導盲系統。實地測試前，必須由具經驗人員陪同，並保留傳統白手杖作為主要安全工具。</footer>
    </main>
  );
}

function Metric({ label, value, warning = false }: { label: string; value: string; warning?: boolean }) {
  return <div className={`metric ${warning ? 'metric-warning' : ''}`}><span>{label}</span><strong>{value}</strong></div>;
}

export default App;
