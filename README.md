# 雙軌式邊緣智慧穿戴導盲輔助系統

**Dual-Path Edge Intelligence Wearable Assistive Navigation System**

專案代號：**DEWANS**

本專案是一個資工系專題用的研究原型，包含胸前相機、智慧手杖與手機 App。核心概念是把系統分成兩條路徑：**保命快通道**由手杖感測器、震動馬達與手機端即時狀態組成，不依賴雲端；**認知慢通道**則在使用者主動觸發時擷取胸前照片，交給 Gemini 產生繁體中文環境描述，再用手機 TTS 播報。

> 目前程式碼是可編譯的整合骨架，不是醫療器材或自主導盲系統。請勿在未經陪同與校正的情況下直接用於道路安全；實測時仍須使用傳統白手杖並由人員監護。

## 專案內容

| 目錄 | 功能 | 主要技術 |
| :--- | :--- | :--- |
| `chest_vision/chest_vision.ino` | ESP32-S3-EYE 官方腳位、Wi-Fi、MJPEG、單張 JPEG、按鍵事件 | Arduino-ESP32、`esp_camera`、HTTP server |
| `smart_cane/smart_cane.ino` | 超音波、IMU、ToF、角度遮罩、距離補償、震動、BLE notification | ESP32-S3、Arduino C++、GATT |
| `mobile_app/` | 相機畫面、照片擷取、BLE 掃描與遙測、Gemini、TTS、展示模式 | React、TypeScript、Vite、Capacitor |
| `INTEGRATION_GUIDE.md` | 開源專案、採購清單、接線、通訊協定、燒錄與驗收測試 | Markdown |

目前 App 尚未內建完整 YOLO/TFLite 模型。模型需要依專題資料集、量化方式與 Android 原生推論方案確定後再加入；先把感測器、BLE、影像與雲端流程驗證完成，比先放入未驗證模型更適合專題開發。

## 重要硬體安全提醒

JSN-SR04T 的 ECHO 常見為 5 V，必須用電阻分壓或邏輯電平轉換器後再接 ESP32 GPIO18。震動馬達不可直接由 ESP32 GPIO 供電，必須使用現成 MOSFET／電晶體驅動板，並依驅動板規格提供馬達電源。ESP32-S3-EYE 的 GPIO0 是官方 BOOT 鍵；燒錄或重置時不要持續按住。

## 快速開始

### 1. 燒錄智慧手杖端

使用 Arduino IDE 開啟 `smart_cane/smart_cane.ino`，安裝 `NewPing`、`MPU6050_tockn` 與 `Adafruit_VL53L0X`。選擇您的 ESP32-S3 開發板，確認下列預設腳位與實際板型一致：超音波 TRIG/ECHO 為 GPIO5/18，I2C SDA/SCL 為 GPIO21/22，左右震動驅動輸出為 GPIO25/26。先不接馬達，使用 LED 或萬用電表驗證 GPIO，再接驅動板。

### 2. 燒錄胸前相機端

使用 Arduino IDE 開啟 `chest_vision/chest_vision.ino`，安裝 ESP32 Arduino board package，選擇 ESP32-S3 相關開發板並啟用 PSRAM。程式內的相機 GPIO 依 Espressif ESP32-S3-EYE BSP 設定。修改 `WIFI_SSID` 與 `WIFI_PASSWORD` 後燒錄，從序列埠監控器讀取相機 IP。若 Wi-Fi 連線失敗，程式會建立 `BlindAssist-Camera` AP，密碼為 `blindassist`，通常可用 `http://192.168.4.1` 存取。

相機端提供以下端點：`/` 是 MJPEG 串流、`/capture` 是單張 JPEG、`/status` 是按鍵事件計數與 IP 狀態。手機 App 的相機位址應填入主機位址，例如 `http://192.168.1.123`，不要填入 `/capture`。

### 3. 啟動手機 App

```bash
cd mobile_app
pnpm install
cp .env.example .env.local
# 編輯 .env.local，填入原型測試用 Gemini API Key
pnpm run dev
```

若要建立 Android 原生專案：

```bash
cd mobile_app
pnpm run build
pnpm exec cap add android       # 只需第一次執行
pnpm run cap:sync
pnpm exec cap open android
```

Android Manifest 已加入網路與 BLE 權限，但第一次執行仍應依手機版本授予掃描與連線權限。瀏覽器 `pnpm run dev` 可測試介面與展示模式；BLE 實機測試應使用 Capacitor Android App。

## 開源專案整合說明

本專案參考 `espressif/esp-who` 的 ESP32-S3-EYE AI 生態、`espressif/esp-bsp` 的官方板級腳位、`arkhipenko/esp32-cam-mjpeg` 的 MJPEG 串流模式，以及 `manishmeganathan/smartwalkingcane` 的基礎超音波導盲杖流程。這些原始專案目前沒有被整包複製進來；本專案保留自己的小型程式碼，並在 `INTEGRATION_GUIDE.md` 說明每個來源的角色、相容性與授權注意事項。

## 建議開發順序

先讓手杖端在序列埠穩定輸出距離、角度與 ToF，再測試震動驅動與 BLE。接著單獨確認 ESP32-S3-EYE 的 `/capture` 與 `/`，再用 App 同時串接相機與手杖。最後才加入 Gemini API，並以固定圖片建立錯誤案例資料集。YOLO/TFLite 應放在上述流程穩定後，以實測的手機推論速度、誤報率與耗電量決定模型。

## 參考來源

| 來源 | 用途 |
| :--- | :--- |
| [Espressif esp-who](https://github.com/espressif/esp-who) | ESP32 AI 與 ESP32-S3-EYE 官方範例 |
| [Espressif esp-bsp](https://github.com/espressif/esp-bsp) | ESP32-S3-EYE v2.1/v2.2 板級設定 |
| [esp32-cam-mjpeg](https://github.com/arkhipenko/esp32-cam-mjpeg) | MJPEG 串流設計參考 |
| [smartwalkingcane](https://github.com/manishmeganathan/smartwalkingcane) | Arduino 智慧手杖流程參考 |
| [Capacitor Community Bluetooth LE](https://github.com/capacitor-community/bluetooth-le) | 手機 BLE 原生整合 |
