# YOLO 模型存放目錄 (Model Assets Directory)

此目錄用於存放視障輔助系統第 1 層手機邊緣推論所需之 ONNX 模型檔案。

## 推薦模型檔案名稱
* `yolov8n.onnx`（YOLOv8 Nano 官方預訓練模型，約 6.3 MB）
* 或 `yolo11n.onnx`（YOLO11 Nano 最新版）

## 如何產生此檔案？
於具備 Python 環境之終端機執行：
```bash
pip install ultralytics
yolo export model=yolov8n.pt format=onnx imgsz=640 dynamic=False
```
完成後將產生的 `yolov8n.onnx` 複製放置於此資料夾下即可。

## 離線打包說明
當透過 Capacitor 建置 Android 原生 APK 時，`public/` 下之所有檔案將自動打包進入 Android 原生 assets 目錄，完全無需連網即可離線推論。
