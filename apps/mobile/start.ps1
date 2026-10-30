# Starts the app for the Expo Go app on your phone. Temporary files go on E: (C: is almost full).
# For the installed development build (automatic attendance) use: npm run start:dev
$tmp = Join-Path $PSScriptRoot '.tmp'
New-Item -ItemType Directory -Force $tmp | Out-Null
$env:TEMP = $tmp; $env:TMP = $tmp
$env:npm_config_cache = Join-Path $tmp 'npm-cache'

# The PC has several network adapters (VirtualBox etc). Expo can put the wrong one in the QR code,
# and the phone then cannot reach it. Use the real Wi-Fi/LAN address: the one on the same network as the phone.
$gwIfaces = (Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue).InterfaceIndex
$ip = Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notmatch '^(127\.|169\.254\.|192\.168\.56\.)' -and $_.InterfaceAlias -notmatch 'VirtualBox|VMware|vEthernet|Loopback|Bluetooth|WSL' -and $gwIfaces -contains $_.InterfaceIndex } |
  Sort-Object -Property InterfaceMetric | Select-Object -First 1 -ExpandProperty IPAddress
if ($ip) { $env:REACT_NATIVE_PACKAGER_HOSTNAME = $ip; Write-Host "Using PC address $ip" }

npx expo start -c --go
