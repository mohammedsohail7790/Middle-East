# Force fresh production deploys (Render gateway + optional Vercel dashboard).
# Requires env vars — see docs/DEPLOYMENT_RUNBOOK.md
#
#   $env:RENDER_API_KEY = "rnd_..."
#   $env:RENDER_GATEWAY_SERVICE_ID = "srv-..."   # calliq-gateway
#   .\scripts\force-fresh-deploy.ps1
#   .\scripts\force-fresh-deploy.ps1 -Vercel

param(
    [switch]$Vercel,
    [switch]$GatewayOnly,
    [switch]$SkipVercel
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path $PSScriptRoot -Parent

function Invoke-RenderFreshDeploy {
    param([string]$ServiceId, [string]$Label)

    if (-not $ServiceId) {
        Write-Warning "Skip Render $Label — set RENDER_${Label}_SERVICE_ID or RENDER_GATEWAY_SERVICE_ID"
        return
    }
    if ($ServiceId -notmatch '^srv-') { $ServiceId = "srv-$ServiceId" }

    $apiKey = $env:RENDER_API_KEY
    if (-not $apiKey) {
        $hook = $env:RENDER_GATEWAY_DEPLOY_HOOK_KEY
        if ($hook) {
            $url = "https://api.render.com/deploy/$ServiceId"
            if ($hook -notmatch '^srv-') {
                $url = "https://api.render.com/deploy/srv-$hook"
            }
            Write-Host "Triggering Render deploy hook ($Label)..."
            Invoke-RestMethod -Method Post -Uri $url
            Write-Host "Render deploy hook accepted."
            return
        }
        Write-Warning "Set RENDER_API_KEY or RENDER_GATEWAY_DEPLOY_HOOK_KEY for Render deploy."
        return
    }

    $body = @{ clearCache = "clear" } | ConvertTo-Json
    $uri = "https://api.render.com/v1/services/$ServiceId/deploys"
    Write-Host "Render: clear build cache + deploy ($Label)..."
    $headers = @{
        Authorization = "Bearer $apiKey"
        "Content-Type" = "application/json"
    }
    $deploy = Invoke-RestMethod -Method Post -Uri $uri -Headers $headers -Body $body
    Write-Host "Deploy queued: $($deploy.id)"

    Write-Host "Purging Render edge cache..."
    try {
        Invoke-RestMethod -Method Post -Uri "https://api.render.com/v1/services/$ServiceId/cache/purge" -Headers $headers | Out-Null
        Write-Host "Edge cache purge accepted."
    } catch {
        Write-Warning "Edge cache purge failed (non-fatal): $_"
    }
}

$gatewayId = $env:RENDER_GATEWAY_SERVICE_ID
if (-not $gatewayId) { $gatewayId = $env:RENDER_SERVICE_ID }

Invoke-RenderFreshDeploy -ServiceId $gatewayId -Label "GATEWAY"

if (-not $GatewayOnly -and (-not $SkipVercel -or $Vercel)) {
    Write-Host "Vercel: production deploy with --force..."
    Push-Location (Join-Path $repoRoot "apps\dashboard")
    try {
        if (-not (Test-Path ".vercel")) {
            npx vercel link --project call-iq-dashboard --yes
        }
        npx vercel deploy --prod --force --yes
        Write-Host "Vercel deploy finished."
    } finally {
        Pop-Location
    }
}

Write-Host "Done. Gateway health: https://gateway.hallaai.com/health"
