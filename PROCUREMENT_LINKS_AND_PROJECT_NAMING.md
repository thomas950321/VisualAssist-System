# 專題命名與採購連結整理稿

## 建議正式中文題名

**雙軌式邊緣智慧穿戴導盲輔助系統**

## 建議英文題名

**Dual-Path Edge Intelligence Wearable Assistive Navigation System**

## 建議簡稱

**DEWANS**（Dual-path Edge Wearable Assistive Navigation System）

## 其他可選題名

| 中文題名 | 英文題名 | 適合強調的特色 |
| :--- | :--- | :--- |
| 雙軌式邊緣智慧穿戴導盲輔助系統 | Dual-Path Edge Intelligence Wearable Assistive Navigation System | 最完整、適合正式專題提案 |
| 多模態感知穿戴式視障導航輔助系統 | Multimodal Wearable Navigation Assistance System for Visually Impaired Users | 強調超音波、IMU、ToF、影像與語意 AI |
| 邊緣與雲端協同之智慧導盲穿戴系統 | Edge–Cloud Collaborative Wearable Navigation System | 強調快通道與慢通道協同 |
| 智慧手杖與胸前視覺融合之視障輔助平台 | Smart Cane and Chest-Vision Fusion Platform for Visual Assistance | 強調硬體整合與系統平台 |

## 蝦皮台灣採購連結

以下連結是商品頁或搜尋結果頁的參考連結。蝦皮商品的價格、庫存、賣家、規格選項與運費可能變動；下單前請重新確認型號、記憶體容量、電壓、腳位與是否含排針。

| 編號 | 零件 | 建議規格 | 連結 | 對應程式碼 |
| :---: | :--- | :--- | :--- | :--- |
| 1 | 胸前視覺板 | ESP32-S3-EYE v2.2 | [蝦皮商品頁](https://shopee.tw/-%E7%89%A9%E8%81%AF%E6%B1%AA%E6%B1%AA-%E5%90%AB%E7%A8%85%E9%99%84%E7%99%BC%E7%A5%A8~-ESP32-S3-EYE-%E5%9C%96%E5%83%8F%E3%80%81%E8%AA%9E%E9%9F%B3%E7%AD%89%E4%BA%BA%E5%B7%A5%E6%99%BA%E6%85%A7%E9%96%8B%E7%99%BC%E6%9D%BF(%E6%96%B0%E7%89%88ESP-EYE)-i.9340697.21376636501) | `chest_vision/chest_vision.ino` |
| 2 | 手杖控制器 | ESP32-S3-DevKitC-1 N8R8 | [蝦皮商品頁](https://shopee.tw/iCshop-ESP32-S3-DevKitC-1-N8R8-N32R8V-N8-%E9%96%8B%E7%99%BC%E6%9D%BF-%E6%A8%82%E9%91%AB%E5%8E%9F%E5%BB%A0-IOT-i.15050169.22107114978) | `smart_cane/smart_cane.ino` |
| 3 | 防水超音波 | JSN-SR04T-2.0 | [蝦皮商品頁](https://shopee.tw/%E3%80%90%E7%92%B0%E5%B3%B6%E7%A7%91%E6%8A%80%E3%80%91%E8%B6%85%E8%81%B2%E6%B3%A2%E6%B8%AC%E8%B7%9D%E6%A8%A1%E7%B5%84-JSN-SR04T-2.0-%E4%B8%80%E9%AB%94%E5%8C%96%E8%B6%85%E8%81%B2%E6%B3%A2%E6%A8%A1%E7%B5%84-%E5%80%92%E8%BB%8A%E9%9B%B7%E9%81%94-%E9%98%B2%E6%B0%B4%E5%9E%8B%E8%B6%85%E9%9F%B3%E6%B3%A2%E6%A8%A1%E7%B5%84-i.280233910.6545811258) | `readUltrasonicCm()` |
| 4 | IMU | GY-521 MPU6050 | [蝦皮商品頁](https://shopee.tw/-%E7%92%B0%E5%B3%B6%E7%A7%91%E6%8A%80-GY-521-MPU-6050-%E6%A8%A1%E5%A1%8A%E4%B8%89%E8%BB%B8%E5%8A%A0%E9%80%9F%E5%BA%A6-%E9%99%80%E8%9E%BA%E5%84%80-6DOF-%E6%A8%A1%E5%A1%8A-%E5%8E%9F%E8%A3%9D%E8%8A%AF%E7%89%87%E9%BB%83%E9%89%AD%E9%9B%BB%E5%AE%B9-Arduino-i.280233910.7250520084) | `MPU6050_tockn` |
| 5 | ToF 測距 | GY-530 VL53L0X | [蝦皮商品頁](https://shopee.tw/%E3%80%90%E7%92%B0%E5%B3%B6%E7%A7%91%E6%8A%80%E3%80%91GY-530-VL53L0X-%E6%BF%80%E5%85%89%E6%B8%AC%E8%B7%9D%E5%82%B3%E6%84%9F%E5%99%A8-ToF-%E6%B8%AC%E8%B7%9D%E9%A3%9B%E8%A1%8C%E6%99%82%E9%96%93%E6%B8%AC%E6%A8%A1%E7%B5%84-i.280233910.8806788268) | `Adafruit_VL53L0X` |
| 6 | 震動馬達 | 1027／3 V 震動馬達模組 | [蝦皮商品頁](https://shopee.tw/%E6%8C%AF%E5%8B%95%E9%A6%AC%E9%81%94%E6%A8%A1%E7%B5%84-%E9%9C%87%E5%8B%95%E9%A6%AC%E9%81%94%E6%A8%A1%E7%B5%84-1027%E9%81%A9%E7%94%A8Arduino-%E6%A8%B9%E8%8E%93stm32%E5%8F%8A%E4%BD%A9%E6%88%B4%E8%A8%AD%E5%82%99%E7%9A%84%E7%84%A1%E8%81%B2%E6%8F%90%E9%86%92-i.4491023.4979538231) | `setMotors()` |
| 7 | 馬達驅動 | IRF520 MOSFET 驅動模組 | [蝦皮商品頁](https://shopee.tw/IRF520-%E9%A9%85%E5%8B%95%E6%A8%A1%E7%B5%84-MOSFET-MOS%E7%AE%A1-%E5%A0%B4%E6%95%88%E6%87%89%E9%9B%BB%E6%99%B6%E9%AB%94PWM%E8%AA%BF%E7%AF%80%E8%BC%B8%E5%87%BA-i.656213378.25131047831) | `setMotors()` |
| 8 | GPIO 擴展 | ESP32-S3 44-pin 擴展板 | [蝦皮商品頁](https://shopee.tw/ESP32-S3%E6%93%B4%E5%B1%95%E6%9D%BF-44%E8%85%B3-%E5%AF%AC%E5%BA%A625.4%E5%8F%8A27.8mm%E9%9B%99%E6%8F%92%E5%BA%A7-%E5%B7%A5%E6%8E%A7%E6%87%89%E7%94%A8GPIO%E6%93%B4%E5%B1%95%E6%9D%BF-%E7%B6%A0%E6%9D%BF-i.4491023.28255332966) | 接線輔助，不涉及韌體 |
| 9 | ESP32-S3 備選板 | ESP32-S3-DevKitC-1 N16R8 | [蝦皮商品頁](https://shopee.tw/%E3%80%90%E7%92%B0%E5%B3%B6%E7%A7%91%E6%8A%80%E3%80%91ESP32-S3-DevKitC-1-N16R8-%E5%B7%B2%E7%84%8A%E6%8E%92%E9%87%9D-S3%E9%96%8B%E7%99%BC%E6%9D%BF-%E6%A8%82%E9%91%AB%E5%8E%9F%E5%BB%A0%E6%99%B6%E7%89%87-ESP32-S3%E6%93%B4%E5%B1%95%E6%9D%BF-i.280233910.19393632683) | 可作為手杖控制器備選 |

## 必須另外採購的安全配件

除了上述核心模組，還需要 5 V 行動電源、USB 線、杜邦線、麵包板或端子板、10 kΩ 與 20 kΩ 電阻、電阻分壓或邏輯電平轉換器、防水盒、魔鬼氈、束帶及現成白手杖。JSN-SR04T 的 ECHO 常見為 5 V，不能直接接 ESP32 GPIO；震動馬達也不能直接由 GPIO 供電，必須透過驅動模組並共地。

## 最終建議

正式提案建議使用「雙軌式邊緣智慧穿戴導盲輔助系統」作為主標題，副標題可寫成「結合智慧手杖感測融合、胸前視覺與雲端多模態語意分析之研究原型」。這個命名能清楚表達本專題的核心技術，又不會過度宣稱系統已經能完全取代專業導盲工具。

> 商品連結僅供採購參考；下單前應逐項確認賣場規格與電氣相容性。

## 參考來源

[1]: https://github.com/espressif/esp-who "Espressif esp-who"
[2]: https://github.com/espressif/esp-bsp "Espressif esp-bsp"
[3]: https://github.com/capacitor-community/bluetooth-le "Capacitor Community Bluetooth LE"
