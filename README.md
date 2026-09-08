<div align="center">

# 雙軌式邊緣智慧穿戴導盲輔助系統

**結合邊緣感測即時避障與多模態 AI 認知理解的穿戴式輔助導航系統**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./INTEGRATION_GUIDE.md)

</div>

---

## 專案簡介

本專案（專案代號：DEWANS）為針對視障輔助設計的研究原型，整合胸前相機（ESP32-S3-EYE）、智慧手杖（ESP32-S3）與跨平台手機 App（React + Vite + Capacitor）。系統提出「快慢雙軌」架構：保命快通道在邊緣端實時進行感測與震動回饋，不依賴網路；認知慢通道在使用者觸發時擷取影像，經由 Gemini 雲端模型產生繁體中文環境敘事並以語音播報。

> 注意：本專案目前為可編譯與驗證之研究原型骨架，非醫療器材或自主導盲設備。實測時須在專人監護下配合傳統白手杖使用。

## 解決痛點

傳統輔助導引設備常面臨以下挑戰：

1. **雲端延遲與中斷風險**：完全依賴雲端 AI 的方案在網路不佳或斷線時無法及時警告即時障礙物，存在安全風險。
2. **邊緣運算資源受限**：低功耗邊緣硬體難以單獨承載複雜的多模態語意理解與情境描述。
3. **資訊過載與互動不佳**：單一距離感測缺乏空間語意，而連續語音播報易造成使用者聽覺疲勞。

## 核心優勢

- **雙軌分工避障架構**：保命快通道提供毫秒級低延遲超音波、ToF 與 IMU 角度補償震動警示；認知慢通道提供按需觸發的全景語意理解。
- **無縫跨平台整合**：透過 BLE GATT 廣播遙測數據與感測狀態，手機 App 整合輕量介面、多模態 Gemini API 與語音合成（TTS）。
- **模組化開源設計**：硬體與韌體拆分為獨立控制器（胸前影像與手杖感測），降低模組相依性，利於分工開發與後續模型擴展。

## 運作原理

系統運作分為兩條平行路徑：

1. **保命快通道 (Fast Path)**：智慧手杖讀取 JSN-SR04T 超音波、VL53L0X ToF 與 MPU6050 姿態角，經角度遮罩與距離補償演算後，透過 MOSFET 驅動左右震動馬達提示方位，並經由 BLE 將遙測數據廣播至手機。
2. **認知慢通道 (Slow Path)**：使用者觸發相機，ESP32-S3-EYE 擷取影像並經由 HTTP 提供單張 JPEG/MJPEG 串流，手機 App 取得影像後發送至 Gemini API 進行繁體中文視覺分析，再透過 TTS 播報周遭情境。

## 專案內容與結構

| 目錄 / 檔案 | 功能說明 | 主要技術 |
| :--- | :--- | :--- |
| `smart_cane/smart_cane.ino` | 手杖端感測器整合、姿態補償、震動控制與 BLE 廣播 | ESP32-S3, Arduino C++, BLE GATT |
| `chest_vision/chest_vision.ino` | 胸前相機影像擷取、Wi-Fi AP/STA 模式與 HTTP 影像串流 | ESP32-S3-EYE, `esp_camera`, MJPEG Server |
| `mobile_app/` | 相機視訊整合、BLE 遙測接收、Gemini 分析與 TTS 播報 | React, TypeScript, Vite, Capacitor |
| `INTEGRATION_GUIDE.md` | 系統整合指南、硬體採購清單、接線圖與通訊協定規範 | Markdown |

## 硬體與接線安全規範

- **超音波 ECHO 準位轉換**：JSN-SR04T 之 ECHO 輸出為 5V 邏輯準位，必須使用電阻分壓或邏輯準位轉換器降至 3.3V 後方可接入 ESP32 GPIO18。
- **馬達供電隔離**：震動馬達嚴禁直接由 ESP32 GPIO 腳位供電，必須經由專用 MOSFET / 電晶體驅動板控制，並提供獨立馬達電源。
- **ESP32-S3-EYE 板載按鍵**：GPIO0 為官方 BOOT 鍵，燒錄或重置時切勿持續按住。

## 快速開始

### 1. 燒錄智慧手杖端

1. 使用 Arduino IDE 開啟 `smart_cane/smart_cane.ino`。
2. 安裝必要函式庫：`NewPing`、`MPU6050_tockn` 與 `Adafruit_VL53L0X`。
3. 板型選擇 `ESP32S3 Dev Module`，確認預設腳位：
   - 超音波 TRIG / ECHO：GPIO5 / GPIO18
   - I2C SDA / SCL：GPIO21 / GPIO22
   - 震動驅動輸出：GPIO25 / GPIO26
4. 驗證 GPIO 輸出訊號後，方可接上馬達驅動板。

### 2. 燒錄胸前相機端

1. 使用 Arduino IDE 開啟 `chest_vision/chest_vision.ino`。
2. 板型選擇 ESP32-S3 相關開發板並啟用 PSRAM。
3. 修改程式內 `WIFI_SSID` 與 `WIFI_PASSWORD` 預設值後進行燒錄。
4. 啟動後從序列埠監控器取得 IP 位址（若連線失敗將開啟預設 AP `BlindAssist-Camera` / 密碼 `blindassist`）。
5. 提供端點：`/`（MJPEG 串流）、`/capture`（單張 JPEG）、`/status`（按鍵事件與狀態）。

### 3. 啟動手機 App

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

1. **硬體單元測試**：優先確認手杖端感測器於序列埠穩定輸出距離與姿態數據，再測試震動馬達與 BLE 廣播。
2. **影像端點測試**：單獨驗證 ESP32-S3-EYE 的 `/capture` 與 `/` 端點可正常存取。
3. **App 整合測試**：使用手機 App 同時串接相機串流與手杖 BLE 數據。
4. **雲端 AI 整合**：加入 Gemini API 發送實景照片，驗證繁體中文播報流暢度。

## 參考來源

| 專案名稱 | 參考與應用說明 |
| :--- | :--- |
| [Espressif esp-who](https://github.com/espressif/esp-who) | ESP32 AI 與 ESP32-S3-EYE 官方範例參考 |
| [Espressif esp-bsp](https://github.com/espressif/esp-bsp) | ESP32-S3-EYE 板級設定腳位參考 |
| [esp32-cam-mjpeg](https://github.com/arkhipenko/esp32-cam-mjpeg) | MJPEG 高效影像串流架構 |
| [smartwalkingcane](https://github.com/manishmeganathan/smartwalkingcane) | 智慧手杖超音波導航演算法參考 |
| [Capacitor Bluetooth LE](https://github.com/capacitor-community/bluetooth-le) | 跨平台 BLE 原生套件整合 |

## 授權條款

本專案基於 [MIT License](./INTEGRATION_GUIDE.md) 條款開源釋出。詳細整合與協力廠商聲明請參閱 `INTEGRATION_GUIDE.md`。
