[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$port = 'COM3'

try {
    $sp = New-Object System.IO.Ports.SerialPort $port, 115200
    $sp.ReadTimeout = 800
    $sp.DtrEnable = $true
    $sp.RtsEnable = $true
    $sp.Open()
    Write-Host "[OK] 已成功連接至 $port，正在監聽 ESP32 序列埠 (5 秒)..." -ForegroundColor Green
    
    # 送出換行嘗試觸發輸出
    $sp.WriteLine("")
    
    $startTime = Get-Date
    while ((Get-Date) -lt $startTime.AddSeconds(5)) {
        try {
            $line = $sp.ReadLine()
            if ($line) {
                Write-Host "  [ESP32] $line" -ForegroundColor Cyan
            }
        } catch {}
    }
    $sp.Close()
} catch {
    Write-Host "[ERROR] 序列埠讀取錯誤: $($_.Exception.Message)" -ForegroundColor Red
}
