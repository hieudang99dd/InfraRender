# Launch both development services from any working directory.
[CmdletBinding()]
param(
    [ValidateRange(1, 65535)] [int] $BackendPort = 8000,
    [ValidateRange(1, 65535)] [int] $FrontendPort = 3000,
    [switch] $Check,
    [switch] $SmokeTest
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$backendDirectory = Join-Path $projectRoot 'backend'
$frontendDirectory = Join-Path $projectRoot 'frontend'
$pythonPath = Join-Path $backendDirectory '.venv\Scripts\python.exe'
$nextPath = Join-Path $frontendDirectory 'node_modules\next\dist\bin\next'
$ownedProcesses = New-Object System.Collections.ArrayList
$backendUrl = "http://127.0.0.1:$BackendPort"
$frontendUrl = "http://127.0.0.1:$FrontendPort"
$previousApiUrl = $env:INFRARENDER_API_URL
$exitCode = 0

function Test-ListeningPort([int] $Port) {
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        return $client.ConnectAsync('127.0.0.1', $Port).Wait(350)
    }
    catch { return $false }
    finally { $client.Dispose() }
}

function Get-InfraRenderHealth([string] $Url) {
    try {
        $health = Invoke-RestMethod -Uri "$Url/api/health" -TimeoutSec 3
        if ($health.PSObject.Properties['service'] -and
            $health.service -eq 'InfraRender AI Backend' -and
            $health.PSObject.Properties['status'] -and $health.status -eq 'ok') {
            return $health
        }
    }
    catch { }
    return $null
}

function Start-OwnedService([string] $Name, [string] $FilePath, [string[]] $Arguments, [string] $Directory) {
    $stdoutPath = Join-Path $logDirectory "$Name-$runId.stdout.log"
    $stderrPath = Join-Path $logDirectory "$Name-$runId.stderr.log"
    $process = Start-Process -FilePath $FilePath -ArgumentList $Arguments -WorkingDirectory $Directory `
        -WindowStyle Hidden -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -PassThru
    $entry = [PSCustomObject]@{ Name = $Name; Process = $process; Stdout = $stdoutPath; Stderr = $stderrPath }
    [void] $ownedProcesses.Add($entry)
    Write-Host "Starting $Name (PID $($process.Id))..."
    return $entry
}

function Wait-ServiceReady([string] $Name, [string] $Url, $Entry) {
    $deadline = [DateTime]::UtcNow.AddSeconds(120)
    while ([DateTime]::UtcNow -lt $deadline) {
        if ($Entry -and $Entry.Process.HasExited) {
            throw "$Name stopped before it was ready. See $($Entry.Stderr) and $($Entry.Stdout)."
        }
        $health = Get-InfraRenderHealth $Url
        if ($health) { return $health }
        Start-Sleep -Milliseconds 300
    }
    throw "$Name did not become ready at $Url/api/health within 120 seconds. See logs in $logDirectory."
}

try {
    if ($BackendPort -eq $FrontendPort) { throw 'BackendPort and FrontendPort must be different.' }
    if (-not (Test-Path -LiteralPath $pythonPath -PathType Leaf)) {
        throw "Python environment is missing. In $backendDirectory run: python -m venv .venv ; .\.venv\Scripts\python.exe -m pip install -r requirements.txt"
    }
    $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
    if (-not $nodeCommand) { throw 'Node.js is missing. Install Node.js 22.18 or newer, then open a new terminal.' }
    $nodeVersionText = & $nodeCommand.Source --version
    if ($LASTEXITCODE -ne 0) { throw 'Unable to run Node.js.' }
    $nodeVersion = [version] ($nodeVersionText.Trim().TrimStart('v'))
    if ($nodeVersion -lt [version]'22.18.0') { throw "Node.js 22.18 or newer is required; found $nodeVersionText." }
    if (-not (Test-Path -LiteralPath $nextPath -PathType Leaf)) {
        throw "Frontend dependencies are missing. In $frontendDirectory run: npm.cmd ci"
    }
    & $pythonPath -c 'import sys; assert sys.version_info >= (3, 11), "Python 3.11 or newer is required"; import fastapi, httpx, multipart, PIL, dotenv, uvicorn'
    if ($LASTEXITCODE -ne 0) {
        throw "Python 3.11+ and backend dependencies are required. In $backendDirectory run: .\.venv\Scripts\python.exe -m pip install -r requirements.txt"
    }
    Write-Host "Dependencies OK (Node.js $nodeVersion)."
    if ($Check) {
        Write-Host 'Environment check passed. No services were started.'
    }
    else {
        $logDirectory = Join-Path $projectRoot '.run'
        [void] (New-Item -ItemType Directory -Path $logDirectory -Force)
        $runId = '{0}-{1}' -f (Get-Date -Format 'yyyyMMdd-HHmmss'), $PID

        if (Test-ListeningPort $BackendPort) {
            $backendHealth = Get-InfraRenderHealth $backendUrl
            if (-not $backendHealth) { throw "Port $BackendPort is occupied by a service that is not a healthy InfraRender backend. Close that service or use -BackendPort <port>." }
            Write-Host "Using existing backend at $backendUrl."
        }
        else {
            $backendEntry = Start-OwnedService 'backend' $pythonPath @('-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', "$BackendPort") $backendDirectory
            $backendHealth = Wait-ServiceReady 'Backend' $backendUrl $backendEntry
        }

        # The launcher always connects its frontend to this local backend.
        # Restore the calling environment in finally after the child inherits it.
        $env:INFRARENDER_API_URL = $backendUrl
        if (Test-ListeningPort $FrontendPort) {
            $frontendHealth = Get-InfraRenderHealth $frontendUrl
            if (-not $frontendHealth) { throw "Port $FrontendPort is occupied or its frontend cannot reach an InfraRender backend. Close that service or use -FrontendPort <port>." }
            Write-Host "Using existing frontend at $frontendUrl (its existing API configuration is retained)."
        }
        else {
            $frontendEntry = Start-OwnedService 'frontend' $nodeCommand.Source @(('"' + $nextPath + '"'), 'dev', '--hostname', '0.0.0.0', '--port', "$FrontendPort") $frontendDirectory
            [void] (Wait-ServiceReady 'Frontend / API proxy' $frontendUrl $frontendEntry)
        }

        Write-Host "Ready: http://localhost:$FrontendPort" -ForegroundColor Green
        Write-Host "Logs: $logDirectory"
        if ($backendHealth.PSObject.Properties['renderer'] -and -not $backendHealth.renderer.configured) {
            Write-Host 'Prompt generation is ready. Image rendering requires OPENAI_API_KEY in backend/.env; restart the backend after configuring it.' -ForegroundColor Yellow
        }
        if ($SmokeTest) {
            Write-Host 'Smoke test passed: backend and frontend API proxy are reachable.'
        }
        else {
            Write-Host 'Keep this terminal open. Press Ctrl+C to stop services started by this script.'
            while ($true) {
                foreach ($entry in $ownedProcesses) {
                    if ($entry.Process.HasExited) { throw "$($entry.Name) stopped. See $($entry.Stderr) and $($entry.Stdout)." }
                }
                Start-Sleep -Seconds 1
            }
        }
    }
}
catch {
    $exitCode = 1
    Write-Host "InfraRender could not start: $($_.Exception.Message)" -ForegroundColor Red
}
finally {
    $env:INFRARENDER_API_URL = $previousApiUrl
    for ($index = $ownedProcesses.Count - 1; $index -ge 0; $index--) {
        $entry = $ownedProcesses[$index]
        if (-not $entry.Process.HasExited) {
            # Only terminate a process launched here and its descendants. Never kill by port/name.
            try {
                & taskkill.exe /PID $entry.Process.Id /T /F 2>&1 | Out-Null
                if ($LASTEXITCODE -ne 0) { throw "taskkill returned $LASTEXITCODE" }
                Write-Host "Stopped $($entry.Name)."
            }
            catch {
                $exitCode = 1
                Write-Warning "Could not stop owned $($entry.Name) process $($entry.Process.Id): $($_.Exception.Message). Close it using the same account that started this script."
            }
        }
        $entry.Process.Dispose()
    }
}
exit $exitCode
