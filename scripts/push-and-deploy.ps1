# Push to GitHub (triggers Vercel dashboard deploy + Render gateway if linked)
Set-Location $PSScriptRoot\..
Write-Host "Pushing to GitHub..."
git push origin HEAD
if ($LASTEXITCODE -ne 0) {
  Write-Host "Push failed. Check internet / VPN, then run again." -ForegroundColor Red
  exit 1
}
Write-Host "Push OK. Vercel + Render should deploy in a few minutes." -ForegroundColor Green
