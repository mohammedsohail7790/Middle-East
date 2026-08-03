# ============================================================================
# Call IQ — Production Deployment Script (PowerShell)
# Usage:
#   .\deploy.ps1 -Environment production -Service gateway
#   .\deploy.ps1 -Environment staging -Service all
# ============================================================================
param(
    [Parameter(Position=0)]
    [string]$Environment = "production",
    [Parameter(Position=1)]
    [string]$Service = "all"
)

function Write-Step {
    param([string]$Message)
    Write-Host "=== $Message ===" -ForegroundColor Cyan
}

function Load-Env {
    param([string]$EnvName)
    $envFile = ".env.$EnvName"
    if (Test-Path $envFile) {
        Write-Step "Loading $envFile"
        Get-Content $envFile | ForEach-Object {
            if ($_ -match '^\s*([^#=]+)=(.*)\s*$') {
                $name = $matches[1].Trim()
                $value = $matches[2].Trim()
                [Environment]::SetEnvironmentVariable($name, $value)
            }
        }
    } elseif (Test-Path ".env") {
        Write-Host "Warning: $envFile not found, falling back to .env" -ForegroundColor Yellow
        Get-Content ".env" | ForEach-Object {
            if ($_ -match '^\s*([^#=]+)=(.*)\s*$') {
                $name = $matches[1].Trim()
                $value = $matches[2].Trim()
                [Environment]::SetEnvironmentVariable($name, $value)
            }
        }
    } else {
        Write-Host "Error: No environment file found" -ForegroundColor Red
        exit 1
    }
}

function Build-All {
    Write-Step "Building all packages"
    npm ci
    npm run build:packages
    npm run build:apps
    Write-Host "Build complete" -ForegroundColor Green
}

function Build-Gateway {
    Write-Step "Building gateway"
    npm ci
    npm run build:packages
    npm run build:gateway
    Write-Host "Gateway build complete" -ForegroundColor Green
}

function Build-Dashboard {
    Write-Step "Building dashboard"
    npm ci
    npm run build:dashboard
    Write-Host "Dashboard build complete" -ForegroundColor Green
}

function Docker-Deploy {
    param([string]$ServiceName)
    Write-Step "Deploying $ServiceName via Docker"
    docker-compose -f docker-compose.yml -f docker-compose.production.yml build $ServiceName
    if ($LASTEXITCODE -ne 0) { throw "Docker build failed for $ServiceName" }
    docker-compose -f docker-compose.yml -f docker-compose.production.yml up -d $ServiceName
    if ($LASTEXITCODE -ne 0) { throw "Docker up failed for $ServiceName" }
    Write-Host "$ServiceName deployed" -ForegroundColor Green
}

function Health-Check {
    param([string]$Url, [int]$MaxRetries = 12)
    Write-Step "Health check: $Url"
    for ($i = 1; $i -le $MaxRetries; $i++) {
        try {
            $response = Invoke-WebRequest -Uri $Url -Method GET -TimeoutSec 5 -UseBasicParsing
            if ($response.StatusCode -eq 200) {
                Write-Host "Health check passed (attempt $i/$MaxRetries)" -ForegroundColor Green
                return $true
            }
        } catch {
            # service not ready yet
        }
        Write-Host "Waiting for service... (attempt $i/$MaxRetries)" -ForegroundColor Yellow
        Start-Sleep -Seconds 5
    }
    Write-Host "Health check FAILED after $MaxRetries attempts" -ForegroundColor Red
    return $false
}

# --- Main ---

Write-Host "=== Call IQ Deployment ===" -ForegroundColor Cyan
Write-Host "Environment: $Environment" -ForegroundColor White
Write-Host "Service:     $Service" -ForegroundColor White
Write-Host ""

Load-Env $Environment

switch ($Service) {
    "all" {
        Build-All
        Write-Host ""
        Docker-Deploy "gateway"
        Health-Check "http://localhost:3003/health"
        Docker-Deploy "dashboard"
        Health-Check "http://localhost:3000/api/health"
        Write-Host ""
        Write-Host "=== Deployment complete ===" -ForegroundColor Green
    }
    "gateway" {
        Build-Gateway
        Docker-Deploy "gateway"
        Health-Check "http://localhost:3003/health"
        Write-Host "Gateway deployed" -ForegroundColor Green
    }
    "dashboard" {
        Build-Dashboard
        Docker-Deploy "dashboard"
        Health-Check "http://localhost:3000/api/health"
        Write-Host "Dashboard deployed" -ForegroundColor Green
    }
    default {
        Write-Host "Unknown service: $Service" -ForegroundColor Red
        Write-Host "Usage: .\deploy.ps1 -Environment production\|staging -Service all\|gateway\|dashboard"
        exit 1
    }
}
