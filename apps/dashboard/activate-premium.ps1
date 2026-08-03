# Call IQ Premium Dashboard Activation Script (PowerShell)
# This script replaces the existing pages with premium versions

Write-Host "Activating Call IQ Premium Dashboard..." -ForegroundColor Cyan
Write-Host ""

# Create backup directory
Write-Host "Creating backups..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path ".backups" | Out-Null

# Backup existing files
$filesToBackup = @(
    @{Source = "src/app/(app)/layout.tsx"; Backup = ".backups/layout.tsx.backup"},
    @{Source = "src/app/(app)/dashboard/page.tsx"; Backup = ".backups/dashboard-page.tsx.backup"},
    @{Source = "src/app/(app)/calls/page.tsx"; Backup = ".backups/calls-page.tsx.backup"},
    @{Source = "src/app/(app)/agent/page.tsx"; Backup = ".backups/agent-page.tsx.backup"},
    @{Source = "src/app/(app)/call-iq/page.tsx"; Backup = ".backups/call-iq-page.tsx.backup"}
)

foreach ($file in $filesToBackup) {
    if (Test-Path $file.Source) {
        Copy-Item $file.Source $file.Backup -Force
    }
}

Write-Host "Backups created in .backups/" -ForegroundColor Green
Write-Host ""

# Activate premium pages
Write-Host "Activating premium pages..." -ForegroundColor Yellow

Copy-Item "src/app/(app)/layout-premium.tsx" "src/app/(app)/layout.tsx" -Force
Copy-Item "src/app/(app)/dashboard/page-premium.tsx" "src/app/(app)/dashboard/page.tsx" -Force
Copy-Item "src/app/(app)/calls/page-premium.tsx" "src/app/(app)/calls/page.tsx" -Force
Copy-Item "src/app/(app)/agent/page-premium.tsx" "src/app/(app)/agent/page.tsx" -Force
Copy-Item "src/app/(app)/call-iq/page-premium.tsx" "src/app/(app)/call-iq/page.tsx" -Force

Write-Host "Premium pages activated!" -ForegroundColor Green
Write-Host ""

Write-Host "Premium Dashboard is now active!" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor White
Write-Host "1. Run npm run dev to start the development server"
Write-Host "2. Visit http://localhost:3000/dashboard"
Write-Host "3. Check PREMIUM_DASHBOARD.md for documentation"
Write-Host ""
Write-Host "To restore original pages, copy files from .backups/" -ForegroundColor Gray
