# Blind Assist 專題整合指南

本文件說明目前專案框架整合了哪些開源專案、每段程式碼對應哪些硬體、如何接線與燒錄、手機 App 如何連線，以及目前已完成與尚未完成的功能邊界。整體設計採用兩條不同優先級的資料路徑：手杖感測器與手機端警告組成**保命快通道**；胸前照片、Gemini 描述與語音播報組成**認知慢通道**。

> **重要定位**：目前內容是可編譯的研究原型與整合骨架，不是醫療器材，也不是可以獨立取代白手杖、陪同者或專業導盲訓練的安全系統。所有戶外測試都應在熟悉場地、由陪同人員監護下進行。

## 1. 目前實際整合的開源專案

目前程式碼沒有直接複製任何 GitHub repository 的整個原始碼，而是採用官方文件、開源專案的硬體設定與架構概念，再由本專題建立較小的獨立原型。這樣做可以避免把不必要的功能整包帶入，也較容易在專題報告中清楚說明修改內容與授權來源。

| 開源專案或套件 | 在本專案中的角色 | 目前是否直接作為依賴 | 相容性與注意事項 |
| :--- | :--- | :---: | :--- |
| [`espressif/esp-who`](https://github.com/espressif/esp-who) | 參考 ESP32-S3-EYE 的官方板級支援、相機與影像辨識架構 | 否 | 官方範例較偏 ESP-IDF。若要使用其完整 `object_detect`，建議另開 ESP-IDF 分支，不要與目前 Arduino sketch 混用。 |
| [`espressif/esp-bsp`](https://github.com/espressif/esp-bsp) | 取得 ESP32-S3-EYE v2.1/v2.2 的相機 GPIO 與 BSP 設定 | 否 | 本專案的胸前相機程式使用官方 BSP 標頭檔公布的相機腳位；官方 S3-EYE 的 GPIO 已被相機、LCD、音訊與按鍵大量佔用。 |
| [`arkhipenko/esp32-cam-mjpeg`](https://github.com/arkhipenko/esp32-cam-mjpeg) | 參考 MJPEG multipart HTTP 串流模式 | 否 | 本專案自行實作 `/`、`/capture`、`/status`，沒有將該 repository 直接放進專案。若日後直接拷貝其程式，必須保留原授權檔。 |
| [`manishmeganathan/smartwalkingcane`](https://github.com/manishmeganathan/smartwalkingcane) | 參考超音波導盲杖的基本警告流程 | 否 | 原始專案使用較簡單的 Arduino 架構；本專案改為 ESP32-S3、BLE、IMU 角度遮罩與 ToF 基線判斷。 |
| [`@capacitor-community/bluetooth-le`](https://github.com/capacitor-community/bluetooth-le) | 手機 App 的 BLE 掃描、連線與 notification | 是 | 已列入 `mobile_app/package.json`。Android 需要在原生專案設定藍牙權限；瀏覽器版只能作為 UI 測試，不能假設所有 Web Bluetooth 行為都等同原生 App。 |

這種整合策略的優點是硬體端可以先用 Arduino IDE 快速驗證，手機端再用 React、Vite 與 Capacitor 做成 Android 原型。若評審要求「直接使用某個 GitHub 專案」，可以在報告中把 `esp-who` 或 `esp-bsp` 的官方 ESP-IDF 分支列為比較組，但不要宣稱目前 Arduino sketch 已經直接使用 ESP-WHO 的推論管線。

## 2. 專案資料夾與功能狀態

```text
blind_assist_project/
├── README.md
├── INTEGRATION_GUIDE.md
├── chest_vision/
│   └── chest_vision.ino
├── smart_cane/
│   └── smart_cane.ino
└── mobile_app/
    ├── package.json
    ├── pnpm-lock.yaml
    ├── capacitor.config.ts
    ├── vite.config.ts
    ├── tsconfig*.json
    ├── index.html
    ├── .env.example
    └── src/
        ├── App.tsx
        ├── main.tsx
        ├── styles.css
        ├── types.ts
        └── services/
            ├── bleService.ts
            ├── cameraService.ts
            ├── geminiService.ts
            └── ttsService.ts
```

目前功能狀態如下。胸前端已包含官方 ESP32-S3-EYE 相機腳位、Wi-Fi station 連線、fallback AP、MJPEG 串流、單張 JPEG 擷取、第 0 層超音波急煞取樣與 `/status` 端點。手機 App 包含相機畫面、即時邊緣 YOLO 動態追蹤（含中央安全錐與左中右方位過濾）、第 0 層急煞聯動監控、第 2 層按需 Gemini 深度情境描述、TTS 語音與選配手杖 BLE 儀表板。

手機端第 1 層邊緣推論採用 `edgeDetector.ts`，已實作空間方位切割（`left` / `center` / `right`）、碰撞急迫度估算（`threatLevel`）與 3 秒語音冷卻機制。打包為 Android 原生 APK 時，模型權重（ONNX / TFLite）可直接放置於靜態資源目錄或原生 assets 中，完全無需依賴外網，隨裝即用。

## 3. 後續採購清單與程式碼對應

以下清單以「不自製 PCB、以現成模組與杜邦線／端子板完成第一版」為原則。價格為台灣電子材料行、蝦皮或露天常見的概略區間，實際金額會因品牌、保固、運費與套裝數量變動，採購前仍要核對賣場照片與腳位標示。

| 目的 | 建議材料 | 數量 | 估計單價 | 對應程式碼 | 採購搜尋關鍵字 |
| :--- | :--- | ---: | ---: | :--- | :--- |
| 胸前相機 | Espressif ESP32-S3-EYE v2.1/v2.2 | 1 | NT$1,000–1,800 | `chest_vision/chest_vision.ino` | `ESP32-S3-EYE v2.2` |
| 手杖控制器 | ESP32-S3 DevKitC-1 N8R8 或同等 ESP32-S3 開發板 | 1 | NT$250–500 | `smart_cane/smart_cane.ino` | `ESP32-S3 DevKitC N8R8` |
| 前方測距 | JSN-SR04T 防水超音波模組 | 1 | NT$180–400 | `NewPing` 與 `readUltrasonicCm()` | `JSN-SR04T-2.0 防水超音波` |
| 姿態 | GY-521 MPU6050 | 1 | NT$40–150 | `MPU6050_tockn` | `GY-521 MPU6050` |
| 地面距離 | GY-530 VL53L0X ToF 模組 | 1 | NT$60–250 | `Adafruit_VL53L0X` | `GY-530 VL53L0X ToF` |
| 震動輸出 | 3V 扁平震動馬達模組，或 3V MOSFET／電晶體驅動板 | 2 組馬達，至少 2 組驅動 | NT$30–150／組 | `setMotors()`、`urgentVibration()` | `3V vibration motor module MOSFET driver` |
| 不焊 PCB | 麵包板、端子台、JST 接頭、杜邦線 | 1 組 | NT$100–300 | 所有硬體 | `ESP32 麵包板 端子擴展板` |
| 電源 | 5V USB 行動電源，或有保護板的鋰電池套件 | 1–2 | NT$250–800 | USB 供電 | `小型 5V 行動電源` |
| 結構 | 現成白手杖、魔鬼氈、束帶、防水盒 | 1 組 | NT$300–1,000 | 不涉及韌體 | `白手杖 防水電子盒 魔鬼氈` |

第一版不建議同時購買 ESP32-S3-EYE 與「ESP32-S3-DevKitC + OV2640」兩種胸前相機方案。若選 ESP32-S3-EYE，就按照本專案的官方腳位版本；若買不到 S3-EYE，改用外接 OV2640 時，必須重新確認該模組的 DVP 腳位並修改相機常數，不能直接燒錄本版本。

## 4. 智慧手杖接線

目前 `smart_cane.ino` 預設使用下表。GPIO 編號以 ESP32-S3 DevKitC 的實際絲印與板型資料表為準；若購買的是其他 ESP32-S3 clone，應先查詢該板的 pinout。

| ESP32-S3 GPIO | 連接對象 | 模組腳位 | 備註 |
| :---: | :--- | :--- | :--- |
| GPIO5 | JSN-SR04T | TRIG | 3.3 V 邏輯輸出 |
| GPIO18 | JSN-SR04T | ECHO | **必須經電阻分壓或電平轉換**，不可把 5 V ECHO 直接接到 ESP32 |
| GPIO21 | MPU6050、VL53L0X | SDA | I2C 共用資料線 |
| GPIO22 | MPU6050、VL53L0X | SCL | I2C 共用時脈線 |
| GPIO25 | 左側驅動板 | IN／Gate | 只能控制驅動板，不能直接帶馬達 |
| GPIO26 | 右側驅動板 | IN／Gate | 只能控制驅動板，不能直接帶馬達 |
| 3V3 | MPU6050、VL53L0X、邏輯端 | VCC | 先核對模組是否帶穩壓與電平轉換 |
| 5V／VIN | JSN-SR04T、馬達電源 | VCC | 依模組標示供電，與 ESP32 共地 |
| GND | 全部模組 | GND | 必須共地 |

JSN-SR04T 的 ECHO 常見為 5 V 輸出，建議採用 10 kΩ 與 20 kΩ 電阻分壓：將 10 kΩ 接在 ECHO 與 GPIO18 之間，20 kΩ 接在 GPIO18 與 GND 之間，理想輸出約為 3.33 V。若使用現成邏輯電平轉換器，則按照模組的 HV、LV、GND 接法安裝。

震動馬達啟動電流可能高於 ESP32 GPIO 可承受的範圍，因此必須使用現成 MOSFET／NPN 驅動板。馬達電源使用獨立的 3 V 或模組指定電壓，驅動板 GND 與 ESP32 GND 共地；若驅動板沒有內建續流二極體，必須加裝二極體。這項限制不是程式問題，而是避免損壞開發板的基本硬體安全要求。

## 5. 胸前 ESP32-S3-EYE 接線與網路

官方 ESP32-S3-EYE v2.1/v2.2 的相機已經接在板上，因此本專案不要求您接 OV2640 排線。`chest_vision.ino` 使用官方 BSP 公開的主要相機 GPIO：XCLK 15、PCLK 13、VSYNC 6、HREF 7、D0–D7 對應 11、9、8、10、12、18、17、16，SCCB SDA/SCL 為 GPIO4/GPIO5。官方板的 GPIO0 是 BOOT 鍵，因此目前把它當作原型觸發按鍵；燒錄或重置時不要持續按住 GPIO0。

### 胸前第 0 層硬體急煞擴充腳位

為實現**「無需手杖也能獨立運作」**並提供 `< 30ms` 零 AI 算力的硬體保命急煞，胸前節點擴充了超音波與急煞告警：

| ESP32-S3-EYE 腳位 | 功能說明 | 連接模組腳位 | 安全與電壓規範 |
| :---: | :--- | :--- | :--- |
| **GPIO1** | 超音波觸發 (TRIG) | JSN-SR04T / HC-SR04 TRIG | 3.3V 輸出脈衝 |
| **GPIO2** | 超音波回波 (ECHO) | JSN-SR04T / HC-SR04 ECHO | **必須經分壓降至 3.3V**（嚴禁 5V 直入） |
| **GPIO44** | 急煞警報輸出 | 蜂鳴器 / 震動馬達驅動板 | 驅動 MOSFET/電晶體（嚴禁直接帶載） |

- **第 0 層急煞運作機制**：ESP32-S3 核心每 25ms 取樣一次。當測量距離小於 **80cm** 時，硬體直接輸出高頻方波脈衝驅動 GPIO44 進行急煞蜂鳴或震動，**完全不經 Wi-Fi 與手機，保證 30ms 內反射反應**。
- **`/status` 遙測格式**：同時將狀態透過 JSON 端點輸出：`{"triggerCounter":1,"ip":"192.168.4.1","ultrasonicCm":68.5,"emergencyBrake":true}`，供手機 App 進行視覺聯動。

正常模式下，將 `WIFI_SSID` 與 `WIFI_PASSWORD` 改為手機可連線的區域網路，開機後從序列埠監控器讀取相機 IP，例如 `http://192.168.1.123`。在 App 中輸入不含結尾斜線的位址，畫面會使用 `/` 串流，按下「按鍵觸發：拍照並解讀周遭情境」會呼叫 `/capture`。

如果 Wi-Fi station 在 15 秒內連不上，韌體會建立 `BlindAssist-Camera` 無線基地台，密碼為 `blindassist`，預設 IP 通常是 `http://192.168.4.1`。手機必須先連上這個 AP，再把 App 的相機位址設為 `http://192.168.4.1`。這個 fallback AP 只解決相機與手機的區域連線，不代表 Gemini 雲端 API 在斷網時仍可用；斷網時第 0 層硬體急煞與第 1 層手機邊緣 YOLO 均可完全離線正常工作。

## 6. 通訊協定與手機 App 串接

手杖使用 BLE GATT notification。服務與特徵 UUID 在韌體與 App 中完全相同：服務 UUID 是 `19b10f00-e8f2-537e-4f6c-d104768a1214`，資料特徵 UUID 是 `19b10f01-e8f2-537e-4f6c-d104768a1214`。手杖每次傳送一行文字，例如 `Dist:83.4,Angle:-4.0,ToF:181`。App 的 `parseCaneTelemetry()` 會把它轉成 `CaneTelemetry`，並依距離與 ToF 值設定障礙物／地面落差旗標。

目前 App 的操作順序如下。先啟動手杖，再在 App 按「掃描手杖 BLE」，選擇名稱 `SmartCane_BLE` 的裝置並連線。接著輸入胸前相機的 IP 位址並按「儲存」。如果尚未購買硬體，也可以啟用「展示模式」檢查危險面板、TTS 與儀表板。Gemini 描述功能則需要相機可達且環境變數已設定。

### App 建置指令

```bash
cd mobile_app
pnpm install
cp .env.example .env.local
# 編輯 .env.local，填入原型測試用 API Key
pnpm run dev
```

產生 Android 原生專案的流程如下：

```bash
cd mobile_app
pnpm run build
pnpm exec cap add android
pnpm run cap:sync
pnpm exec cap open android
```

Android 原生專案中還需要依照 `@capacitor-community/bluetooth-le` 的官方說明確認 Android 版本、掃描與連線權限，以及 Android 12 以上的 `BLUETOOTH_SCAN`、`BLUETOOTH_CONNECT` 權限。手機 App 不應在 UI 端永久保存影像；本原型收到 Gemini 文字後也不會將照片寫入檔案。

## 7. Gemini 與隱私注意事項

`geminiService.ts` 是原型版本，直接由瀏覽器／App 呼叫 Gemini REST API，因此 API Key 會進入前端建置環境。這只適合在專題開發與短期展示使用，不適合公開發佈。正式版本應增加自己的後端代理，例如由 Node.js 伺服器保存 API Key，手機只上傳一次性 JPEG 並取得文字結果；後端也應設定請求大小限制、速率限制與日誌去識別化。

影像處理上，建議將原始照片僅保留於記憶體，API 回應後立即釋放 Blob 引用，不寫入相簿、SD 卡或雲端硬碟。若要進一步提高隱私，應在上傳前加入人臉與車牌模糊化；但這項功能目前尚未加入，不能在報告中宣稱已完成。

## 8. 建議的開發順序

第一階段先只測試手杖端：讓 JSN-SR04T、MPU6050 與震動輸出各自通過序列埠測試，再啟用 BLE。第二階段測試 ESP32-S3-EYE 的 `/capture` 與 MJPEG `/`，確認手機與相機在同一網路可互通。第三階段接上 App 的 BLE 與相機畫面。第四階段才加入 Gemini，最後才建立自己的收集資料集與 TFLite 物件偵測模型。

每次只引入一個變因。不要在超音波、ToF、BLE、Wi-Fi、Gemini 尚未分別通過測試時一次全部裝到手杖上；否則遇到錯誤時很難判斷是電源、接線、IP、權限、模型或演算法造成。

## 9. 驗收測試表

| 測試項目 | 通過條件 | 測試方式 |
| :--- | :--- | :--- |
| 超音波 | 距離變化與實際尺量相近，角度超過遮罩時不誤報正前方 | 以 50、100、150 cm 物體測試，記錄 30 筆 |
| ToF | 平地與階梯邊緣的讀值可重複，無效值不被當成坑洞 | 每個場景重複 20 次 |
| 震動安全 | GPIO 只驅動模組，ESP32 不重置、不發熱 | 連續運作 10 分鐘 |
| BLE | App 能掃描、連線、收到至少 5 Hz 資料 | 觀察原始資料與時間戳 |
| 相機 | `/` 能顯示串流，`/capture` 回傳 `image/jpeg` | 手機瀏覽器與 App 各測一次 |
| 斷網快通道 | 雲端不可用時，手杖震動與本地狀態仍可工作 | 關閉 Wi-Fi／手機行動數據後測試 |
| Gemini 慢通道 | 按需觸發才上傳，回覆能被 TTS 播報 | 使用 10 張固定測試照片並記錄延遲 |

## 10. 參考資料

[1]: https://github.com/espressif/esp-who "Espressif esp-who"
[2]: https://github.com/espressif/esp-bsp "Espressif esp-bsp"
[3]: https://github.com/arkhipenko/esp32-cam-mjpeg "esp32-cam-mjpeg"
[4]: https://github.com/manishmeganathan/smartwalkingcane "smartwalkingcane"
[5]: https://github.com/capacitor-community/bluetooth-le "Capacitor Community Bluetooth LE"
[6]: https://github.com/espressif/esp-bsp/blob/master/bsp/esp32_s3_eye/include/bsp/esp32_s3_eye.h "ESP32-S3-EYE official BSP header"
[7]: https://github.com/espressif/esp-who/blob/master/docs/en/get-started/ESP32-S3-EYE_Getting_Started_Guide.md "ESP32-S3-EYE Getting Started Guide"
