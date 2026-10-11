# 專題命名與採購連結整理稿

## 建議正式中文題名

**穿戴式視覺輔助系統**

## 建議英文題名

**Wearable Visual Assist System**

## 建議簡稱

**DEWANS**（Dual-path Edge Wearable Assistive Navigation System）

## 其他可選題名

| 中文題名 | 英文題名 | 適合強調的特色 |
| :--- | :--- | :--- |
| 穿戴式視覺輔助系統 | Wearable Visual Assist System | 最簡潔、聚焦穿戴與視覺 |
| 三層邊緣智慧穿戴輔助系統 | Three-Tier Edge Intelligence Wearable Assistive System | 強調三層分級架構（急煞、邊緣推論、雲端認知） |
| 邊緣與雲端協同之穿戴視覺系統 | Edge–Cloud Collaborative Wearable Visual System | 強調手機本地與雲端大腦之協同 |

## 採購清單與規格

下單前請重新確認型號、記憶體容量、電壓、腳位與是否含排針。

| 編號 | 零件 | 建議規格 | 對應程式碼 | 說明 |
| :---: | :--- | :--- | :--- | :--- |
| 1 | 胸前視覺主板 | ESP32-S3-EYE v2.2 (8MB Flash + 8MB PSRAM) | `chest_vision/chest_vision.ino` | 官方相機開發板，含麥克風、喇叭擴大機、相機 |
| 2 | 前方急煞測距 | JSN-SR04T-2.0 防水超音波 (或 HC-SR04) | `readUltrasonicCm()` | 偵測前方 80cm 內極近障礙物 |
| 3 | 急煞回饋輸出 | 3V 有源蜂鳴器模組 或 扁平震動馬達模組 | `EMERGENCY_BRAKE_PIN` | 提供硬體即時急煞警報 |
| 4 | 驅動模組 | IRF520 MOSFET 驅動模組 或 NPN 電晶體板 | 急煞輸出電路 | 嚴禁 GPIO 直接驅動馬達/大電流負載 |
| 5 | 連接擴充配件 | 杜邦線、端子擴展板、10kΩ/20kΩ 電阻 (分壓用) | 硬體接線 | ECHO 腳位 5V 轉 3.3V 必備 |
| 6 | 隨身供電 | 5V 小型輕量行動電源 | USB 供電 | 供電給 ESP32-S3-EYE |

## 必須另外採購的安全配件

- 5V 行動電源、Type-C / Micro-USB 供電線
- 杜邦線、麵包板或端子板
- 10 kΩ 與 20 kΩ 電阻（用於超音波 ECHO 5V 轉 3.3V 邏輯準位轉換）
- 胸前穿戴背帶、掛繩或 3D 列印固定外殼

## 參考來源

[1]: https://github.com/espressif/esp-who "Espressif esp-who"
[2]: https://github.com/espressif/esp-bsp "Espressif esp-bsp"
[3]: https://github.com/arkhipenko/esp32-cam-mjpeg "esp32-cam-mjpeg"
