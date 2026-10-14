<div align="center">

# 穿戴式視覺輔助系統

**結合胸前硬體即時急煞、手機邊緣動態視覺感知與雲端多模態 AI 認知的多層次輔助系統**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./INTEGRATION_GUIDE.md)

</div>

---

## 專案簡介

本專案（專案代號：DEWANS）為針對視障輔助設計的前瞻研究原型。系統以**「胸前穿戴裝置 + 隨身手機邊緣運算」**為核心，擺脫傳統手杖限制獨立運作。

為解決傳統雲端 VLM 思考時間過長（1~3秒）、行走時車載式動態畫面連續延遲、高功耗與連續播報聽覺疲勞等痛點，本系統創新採用**「三層分級混合避障架構」**：

1. **第 0 層 · 胸前硬體反射神經 (< 30ms，零 AI 算力)**：胸前超音波感測器以高頻率（25ms）取樣前方距離。一旦進入 80cm 近迫危險區，胸前微控制器（ESP32-S3）立即直接透過硬體蜂鳴器或震動馬達給予急促回饋，達成無延遲保命急煞。
2. **第 1 層 · 手機邊緣動態感知 (15~30 FPS，30~50ms 延遲)**：手機 App 接收胸前相機即時串流，於手機本地執行輕量級 YOLO 物件偵測，即時追蹤行人、車輛、單車、紅綠燈、階梯等，並結合**「中央安全錐 (Center Safe Cone)」**與左右空間劃分，僅在真正具備碰撞風險時發出簡潔方位語音。
3. **第 2 層 · 雲端多模態認知大腦 (1~3 秒，按需主動觸發)**：**絕不作為即時避障用途**。僅在使用者主動按鍵發問時，擷取單張靜態相片送交 Gemini API 進行店家招牌、環境全景敘事與尋物解讀。

> 注意：本專案目前為可編譯與驗證之研究原型骨架，非醫療器材或自主導盲設備。實測時須在專人監護下配合傳統白手杖使用。

## 解決痛點

傳統輔助導引設備常面臨以下挑戰：

1. **雲端大模型思考延遲長**：連續移動時若將影像持續送雲端，因處理需時數秒，障礙物已撞上結果才出來，且網路流量與耗電極大。
2. **聽覺過載與語音碎念**：缺乏空間安全錐過濾，畫面邊緣所有物體連續播報會導致視障者聽覺癱瘓。
3. **揮動擺角補償失真**：傳統將感測器綁於手杖上需耗費大量演算法濾除擺動角；本系統將超音波獨立安裝於胸前朝前微仰，大幅穩定測距基準。

## 專案內容與結構

| 目錄 / 檔案 | 功能說明 | 主要技術 |
| :--- | :--- | :--- |
| `chest_vision/chest_vision.ino` | 胸前相機串流、第 0 層硬體超音波急煞（< 80cm 蜂鳴器）、/status 遙測 | ESP32-S3-EYE, `esp_camera`, 超音波 GPIO1/2, 急煞 GPIO44 |
| `mobile_app/` | 第 1 層手機本地 YOLO 追蹤、安全錐過濾、第 2 層按需 Gemini 與 TTS | React 19, TypeScript, Vite, Capacitor, 邊緣推論 |
| `INTEGRATION_GUIDE.md` | 系統整合指南、硬體採購清單、接線圖、三層協定規範與 APK 打包 | Markdown |

## 硬體與接線安全規範

- **超音波 ECHO 準位轉換**：JSN-SR04T 之 ECHO 輸出為 5V 邏輯準位，必須使用電阻分壓或邏輯準位轉換器降至 3.3V 後方可接入 ESP32。
- **馬達供電隔離**：震動馬達嚴禁直接由 ESP32 GPIO 腳位供電，必須經由專用 MOSFET / 電晶體驅動板控制，並提供獨立馬達電源。
- **ESP32-S3-EYE 板載按鍵**：GPIO0 為官方 BOOT 鍵，長按可進行語音提問，短按拍照。

## 快速開始

### 0. 全新電腦一鍵啟動（推薦）

專案已內建**全新電腦一鍵自動化啟動器**。若您在其他全新 Windows 電腦使用，只要將 ESP32-S3 連接 USB 線至電腦，並**直接雙擊根目錄下的任一檔案**：
- **`一鍵啟動_視覺輔助系統.bat`** 或 **`start.bat`**
- （若已編譯）**`一鍵啟動_視覺輔助系統.exe`**

**自動化流程包含：**
1. **Node.js 智慧檢測**：若電腦尚未安裝 Node.js，將自動免權限下載官方可攜版 Node.js LTS（免設定 PATH）。
2. **依賴套件自動安裝**：自動執行 `npm install` 下載所有前端依賴套件與檢查 YOLO 模型檔。
3. **USB 序列埠與硬體偵測**：自動掃描並提示已連接之 ESP32 序列埠 (COM Port)。
4. **邊緣前端啟動**：自動啟動 Vite 本地開發與邊緣推論伺服器。
5. **開啟操作畫面**：自動喚起預設瀏覽器進入 `http://localhost:5173`，並顯示手機同網測試網址。

### 1. 燒錄胸前相機端（首次硬體部署）

1. 使用 PlatformIO 或 Arduino IDE 開啟 `chest_vision/chest_vision.ino`。
2. 板型選擇 ESP32-S3 相關開發板並啟用 PSRAM (OPI)。
3. 修改程式內 `WIFI_SSID` 與 `WIFI_PASSWORD` 預設值後進行燒錄。
4. 啟動後從序列埠監控器取得 IP 位址（若連線失敗將開啟預設 AP `BlindAssist-Camera` / 密碼 `blindassist`）。
5. 提供端點：`/`（MJPEG 串流）、`/capture`（單張 JPEG）、`/status`（按鍵事件與狀態）。

### 2. 啟動手機 App

```bash
cd mobile_app
pnpm install
cp .env.example .env.local
# 修改 .env.local 並填入 Gemini API Key
pnpm run dev
```

如需建置 Android 原生 App：

```bash
cd mobile_app
pnpm run build
pnpm exec cap add android
pnpm run cap:sync
pnpm exec cap open android
```

## 建議開發與測試順序

1. **胸前感測測試**：優先確認胸前超音波於序列埠穩定輸出距離數據，再測試急煞蜂鳴器。
2. **影像端點測試**：單獨驗證 ESP32-S3-EYE 的 `/capture` 與 `/` 端點可正常存取。
3. **App 邊緣推論測試**：使用手機 App 串接相機串流，驗證 YOLOv8n 本地偵測與安全錐播報。
4. **雲端 AI 整合**：加入 Gemini API 發送實景照片，驗證繁體中文播報流暢度。

## 參考來源

| 專案名稱 | 參考與應用說明 |
| :--- | :--- |
| [Espressif esp-who](https://github.com/espressif/esp-who) | ESP32 AI 與 ESP32-S3-EYE 官方範例參考 |
| [Espressif esp-bsp](https://github.com/espressif/esp-bsp) | ESP32-S3-EYE 板級設定腳位參考 |
| [esp32-cam-mjpeg](https://github.com/arkhipenko/esp32-cam-mjpeg) | MJPEG 高效影像串流架構 |
| [Ultralytics YOLOv8](https://github.com/ultralytics/ultralytics) | 輕量化邊緣物件偵測模型與量化 |
| [ONNX Runtime Web](https://github.com/microsoft/onnxruntime) | 跨平台 WebAssembly / WebGPU 邊緣推論引擎 |

## 授權條款

本專案基於 [MIT License](./INTEGRATION_GUIDE.md) 條款開源釋出。詳細整合與協力廠商聲明請參閱 `INTEGRATION_GUIDE.md`。
