param(
    [int]$Port = 8765,
    [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$DataDir = Join-Path $RootDir "data"
$DataFile = Join-Path $DataDir "hospitalist-data.json"

if (-not (Test-Path $DataDir)) {
    New-Item -ItemType Directory -Path $DataDir | Out-Null
}

$Loopback = [System.Net.IPAddress]::Loopback
$Listener = $null

for ($p = $Port; $p -lt ($Port + 10); $p++) {
    try {
        $tryListener = New-Object System.Net.Sockets.TcpListener($Loopback, $p)
        $tryListener.Start()
        $Listener = $tryListener
        $Port = $p
        break
    } catch {
        # Port in use, try next
    }
}

if (-not $Listener) {
    Write-Error "Could not bind any local port starting at $Port."
    exit 1
}

$Url = "http://localhost:$Port/"
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  RoundingOS - Hospitalist Workflow Tracker (LOCAL ONLY)  " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  URL:       $Url" -ForegroundColor Green
Write-Host "  Data File: $DataFile" -ForegroundColor Green
Write-Host "  Keep this window open while using the app." -ForegroundColor Gray
Write-Host "  Press Ctrl+C to stop the local server." -ForegroundColor Gray
Write-Host ""

if (-not $NoBrowser) {
    Start-Process $Url
}

$MimeTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".svg"  = "image/svg+xml"
    ".png"  = "image/png"
    ".ico"  = "image/x-icon"
}

function Send-HttpResponse {
    param(
        [System.Net.Sockets.NetworkStream]$Stream,
        [int]$StatusCode,
        [string]$StatusText,
        [string]$ContentType,
        [byte[]]$BodyBytes
    )
    $headerText = "HTTP/1.1 $StatusCode $StatusText`r`n" +
                  "Content-Type: $ContentType`r`n" +
                  "Content-Length: $($BodyBytes.Length)`r`n" +
                  "Cache-Control: no-store`r`n" +
                  "Connection: close`r`n`r`n"
    $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($headerText)
    $Stream.Write($headerBytes, 0, $headerBytes.Length)
    if ($BodyBytes.Length -gt 0) {
        $Stream.Write($BodyBytes, 0, $BodyBytes.Length)
    }
    $Stream.Flush()
}

try {
    while ($true) {
        $Client = $Listener.AcceptTcpClient()
        try {
            $Client.ReceiveTimeout = 5000
            $Stream = $Client.GetStream()

            # Read HTTP headers byte-by-byte until \r\n\r\n
            $headerStream = New-Object System.IO.MemoryStream
            $matched = 0
            while ($true) {
                $b = $Stream.ReadByte()
                if ($b -lt 0) { break }
                $headerStream.WriteByte([byte]$b)
                if (($matched -eq 0 -or $matched -eq 2) -and $b -eq 13) { $matched++ }
                elseif (($matched -eq 1 -or $matched -eq 3) -and $b -eq 10) { $matched++ }
                else { $matched = if ($b -eq 13) { 1 } else { 0 } }
                if ($matched -eq 4) { break }
                if ($headerStream.Length -gt 65536) { break }
            }

            $headerStr = [System.Text.Encoding]::ASCII.GetString($headerStream.ToArray())
            $lines = $headerStr -split "`r`n"
            if ($lines.Length -eq 0 -or [string]::IsNullOrWhiteSpace($lines[0])) {
                continue
            }

            $reqParts = $lines[0].Split(" ")
            $method = $reqParts[0].ToUpper()
            $rawTarget = if ($reqParts.Length -ge 2) { $reqParts[1] } else { "/" }
            $path = ($rawTarget -split "\?")[0]

            $contentLength = 0
            $reqHeaders = @{}
            foreach ($line in $lines[1..($lines.Length - 1)]) {
                if ($line -match "^([A-Za-z0-9-]+):\s*(.*)$") {
                    $reqHeaders[$Matches[1].ToLower()] = $Matches[2].Trim()
                }
            }
            if ($reqHeaders.ContainsKey("content-length")) {
                $contentLength = [int]$reqHeaders["content-length"]
            }
            if ($contentLength -gt 50MB) { $contentLength = 0 }

            # --- Security: only answer requests addressed to this local server (blocks DNS rebinding)
            $AllowedHosts = @("localhost:$Port", "127.0.0.1:$Port")
            $hostHdr = if ($reqHeaders.ContainsKey("host")) { $reqHeaders["host"].ToLower() } else { "" }
            if ($AllowedHosts -notcontains $hostHdr) {
                $fb = [System.Text.Encoding]::UTF8.GetBytes("Forbidden")
                Send-HttpResponse -Stream $Stream -StatusCode 403 -StatusText "Forbidden" -ContentType "text/plain" -BodyBytes $fb
                continue
            }

            $bodyBytes = New-Object byte[] $contentLength
            $totalRead = 0
            while ($totalRead -lt $contentLength) {
                $n = $Stream.Read($bodyBytes, $totalRead, $contentLength - $totalRead)
                if ($n -le 0) { break }
                $totalRead += $n
            }

            if ($path -eq "/api/data") {
                # --- Security: block cross-site requests (CSRF). Browsers cannot add a custom header
                # cross-origin without a CORS preflight, which this server never approves.
                $originOk = (-not $reqHeaders.ContainsKey("origin")) -or (@("http://localhost:$Port", "http://127.0.0.1:$Port") -contains $reqHeaders["origin"].ToLower())
                $markerOk = $reqHeaders.ContainsKey("x-roundingos") -and $reqHeaders["x-roundingos"] -eq "1"
                $jsonOk = ($method -ne "POST") -or ($reqHeaders.ContainsKey("content-type") -and $reqHeaders["content-type"].ToLower().StartsWith("application/json"))
                if (-not ($originOk -and $markerOk -and $jsonOk)) {
                    $fb = [System.Text.Encoding]::UTF8.GetBytes("Forbidden")
                    Send-HttpResponse -Stream $Stream -StatusCode 403 -StatusText "Forbidden" -ContentType "text/plain" -BodyBytes $fb
                    continue
                }
                if ($method -eq "GET") {
                    if (Test-Path $DataFile) {
                        $outBytes = [System.IO.File]::ReadAllBytes($DataFile)
                    } else {
                        $outBytes = [System.Text.Encoding]::UTF8.GetBytes("{}")
                    }
                    Send-HttpResponse -Stream $Stream -StatusCode 200 -StatusText "OK" -ContentType "application/json; charset=utf-8" -BodyBytes $outBytes
                } elseif ($method -eq "POST") {
                    $jsonText = [System.Text.Encoding]::UTF8.GetString($bodyBytes, 0, $totalRead)
                    # Refuse anything that is not a RoundingOS state object
                    try { $parsedCheck = $jsonText | ConvertFrom-Json } catch { $parsedCheck = $null }
                    if ($null -eq $parsedCheck -or $null -eq $parsedCheck.patients) {
                        $bb = [System.Text.Encoding]::UTF8.GetBytes('{"ok":false}')
                        Send-HttpResponse -Stream $Stream -StatusCode 400 -StatusText "Bad Request" -ContentType "application/json; charset=utf-8" -BodyBytes $bb
                        continue
                    }
                    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
                    # Atomic write: temp file, keep a rolling backup, then replace
                    $tmpFile = "$DataFile.tmp"
                    [System.IO.File]::WriteAllText($tmpFile, $jsonText, $utf8NoBom)
                    if (Test-Path $DataFile) {
                        $stamp = (Get-Date).ToString("yyyyMMdd-HH")
                        $hourly = Join-Path $DataDir "backup-$stamp.json"
                        if (-not (Test-Path $hourly)) { Copy-Item $DataFile $hourly -Force }
                        Get-ChildItem $DataDir -Filter "backup-*.json" | Sort-Object Name -Descending | Select-Object -Skip 24 | Remove-Item -Force -ErrorAction SilentlyContinue
                    }
                    Move-Item -Path $tmpFile -Destination $DataFile -Force
                    $okBytes = [System.Text.Encoding]::UTF8.GetBytes('{"ok":true}')
                    Send-HttpResponse -Stream $Stream -StatusCode 200 -StatusText "OK" -ContentType "application/json; charset=utf-8" -BodyBytes $okBytes
                } else {
                    $errBytes = [System.Text.Encoding]::UTF8.GetBytes("Method Not Allowed")
                    Send-HttpResponse -Stream $Stream -StatusCode 405 -StatusText "Method Not Allowed" -ContentType "text/plain" -BodyBytes $errBytes
                }
            } else {
                $decoded = [System.Uri]::UnescapeDataString($path)
                $relPath = if ($decoded -eq "/") { "index.html" } else { $decoded.TrimStart("/").Replace("/", "\") }
                $fullPath = [System.IO.Path]::GetFullPath((Join-Path $RootDir $relPath))

                $rootWithSep = $RootDir.TrimEnd('\') + '\'
                $dataWithSep = $DataDir.TrimEnd('\') + '\'
                $inRoot = $fullPath.StartsWith($rootWithSep, [System.StringComparison]::OrdinalIgnoreCase)
                $inData = $fullPath.StartsWith($dataWithSep, [System.StringComparison]::OrdinalIgnoreCase)
                if (-not $inRoot -or $inData -or -not (Test-Path $fullPath -PathType Leaf)) {
                    $nfBytes = [System.Text.Encoding]::UTF8.GetBytes("Not Found")
                    Send-HttpResponse -Stream $Stream -StatusCode 404 -StatusText "Not Found" -ContentType "text/plain" -BodyBytes $nfBytes
                } else {
                    $ext = [System.IO.Path]::GetExtension($fullPath).ToLower()
                    $mime = if ($MimeTypes.ContainsKey($ext)) { $MimeTypes[$ext] } else { "application/octet-stream" }
                    $fileBytes = [System.IO.File]::ReadAllBytes($fullPath)
                    Send-HttpResponse -Stream $Stream -StatusCode 200 -StatusText "OK" -ContentType $mime -BodyBytes $fileBytes
                }
            }
        } catch {
            # Ignore broken pipe / client abort
        } finally {
            $Client.Close()
        }
    }
} finally {
    $Listener.Stop()
}

