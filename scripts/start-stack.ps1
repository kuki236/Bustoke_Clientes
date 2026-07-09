# ============================================================================
# start-stack.ps1 — Levanta backend + frontend en 2 terminales separadas.
#
# USO:
#   .\scripts\start-stack.ps1
#
# Requisito previo (una sola vez):
#   - venv de Python creado en backend\venv
#   - node_modules instalado en frontend-client\
#   - BD `bustoke_test` creada y poblada con seed_e2e.sql (ver docs\E2E_SETUP.md)
#
# Cierra esta ventana o presiona Ctrl+C en cada terminal para detener
# los servidores.
# ============================================================================

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$backendDir = Join-Path $repoRoot "backend"
$frontendDir = $repoRoot
$backendPort = 8000
$frontendPort = 5173

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  BUSTOKE - Iniciando stack" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# Verificar prerrequisitos
$pythonExe = Join-Path $backendDir "venv\Scripts\python.exe"
$nodeModules = Join-Path $frontendDir "node_modules"

if (-not (Test-Path $pythonExe)) {
    Write-Host "ERROR: No existe el venv de Python en: $pythonExe" -ForegroundColor Red
    Write-Host "Crea el venv:" -ForegroundColor Yellow
    Write-Host "  cd backend" -ForegroundColor Yellow
    Write-Host "  python -m venv venv" -ForegroundColor Yellow
    Write-Host "  .\venv\Scripts\Activate.ps1" -ForegroundColor Yellow
    Write-Host "  pip install -r requirements.txt" -ForegroundColor Yellow
    exit 1
}
if (-not (Test-Path $nodeModules)) {
    Write-Host "ERROR: No existe node_modules en: $nodeModules" -ForegroundColor Red
    Write-Host "Instala:" -ForegroundColor Yellow
    Write-Host "  cd frontend-client" -ForegroundColor Yellow
    Write-Host "  npm install" -ForegroundColor Yellow
    exit 1
}

# Matar procesos en los puertos si ya estan ocupados
function Kill-Port {
    param([int]$Port)
    $listeners = netstat -ano | Select-String ":$Port\s.*LISTENING"
    foreach ($l in $listeners) {
        $parts = ($l -replace "\s+", " ").Trim().Split(" ")
        $pid = $parts[-1]
        if ($pid -match "^\d+$") {
            Write-Host "  Matando PID $pid en puerto $Port..." -ForegroundColor Yellow
            Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
        }
    }
    Start-Sleep -Milliseconds 500
}

Kill-Port $backendPort
Kill-Port $frontendPort

# Terminal 1: Backend
$backendCmd = "cd '$backendDir' ; & '.\venv\Scripts\Activate.ps1' ; Write-Host 'BACKEND en http://127.0.0.1:$backendPort' -ForegroundColor Green ; uvicorn app.main:app --reload --host 127.0.0.1 --port $backendPort"
Write-Host "Abriendo terminal 1: Backend..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendCmd

Start-Sleep -Seconds 2

# Terminal 2: Frontend
$frontendCmd = "cd '$frontendDir' ; Write-Host 'FRONTEND en http://127.0.0.1:$frontendPort' -ForegroundColor Green ; npm run dev"
Write-Host "Abriendo terminal 2: Frontend..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", $frontendCmd

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "  Stack iniciandose" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Backend:  http://127.0.0.1:$backendPort" -ForegroundColor White
Write-Host "  Frontend: http://127.0.0.1:$frontendPort" -ForegroundColor White
Write-Host ""
Write-Host "Espera ~10s a que ambos arranquen." -ForegroundColor Yellow
Write-Host ""
Write-Host "Verificacion:" -ForegroundColor Cyan
Write-Host "  curl http://127.0.0.1:$backendPort/health" -ForegroundColor Gray
Write-Host "  abrir http://127.0.0.1:$frontendPort en el navegador" -ForegroundColor Gray
Write-Host ""
Write-Host "Para correr las pruebas (en otra terminal):" -ForegroundColor Cyan
Write-Host "  cd backend ; pytest tests/ -v" -ForegroundColor White
Write-Host "  cd frontend-client ; npm run cy:open" -ForegroundColor White
Write-Host ""
