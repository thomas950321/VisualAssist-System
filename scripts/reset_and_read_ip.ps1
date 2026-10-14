[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$port = 'COM3'

try {
    $sp = New-Object System.IO.Ports.SerialPort $port, 115200
    $sp.ReadTimeout = 500
    $sp.Open()

    # 重設 ESP32 (DTR=0, RTS=1 -> RTS=0)
    $sp.DtrEnable = $false
    $sp.RtsEnable = $true
    Start-Sleep -Milliseconds 200
    $sp.RtsEnable = $false
    Start-Sleep -Milliseconds 100

    Write-Host "[OK] 重設訊號已送出，正在監聽開機 Wi-Fi 連線日誌 (8 秒)..." -ForegroundColor Green

    $startTime = Get-Date
    while ((Get-Date) -lt $startTime.AddSeconds(8)) {
        try {
            $line = $sp.ReadLine()
            if ($line) {
                Write-Host "  [ESP32] $line" -ForegroundColor Cyan
            }
        } catch {}
    }
    $sp.Close()
} catch {
    Write-Host "[ERROR] $($_.Exception.Message)" -ForegroundColor Red
}
