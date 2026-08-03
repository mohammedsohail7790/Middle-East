#!/bin/bash

# Call IQ Premium Dashboard Activation Script
# This script replaces the existing pages with premium versions

echo "🚀 Activating Call IQ Premium Dashboard..."
echo ""

# Backup existing files
echo "📦 Creating backups..."
mkdir -p .backups

if [ -f "src/app/(app)/layout.tsx" ]; then
  cp src/app/(app)/layout.tsx .backups/layout.tsx.backup
fi

if [ -f "src/app/(app)/dashboard/page.tsx" ]; then
  cp src/app/(app)/dashboard/page.tsx .backups/dashboard-page.tsx.backup
fi

if [ -f "src/app/(app)/calls/page.tsx" ]; then
  cp src/app/(app)/calls/page.tsx .backups/calls-page.tsx.backup
fi

if [ -f "src/app/(app)/agent/page.tsx" ]; then
  cp src/app/(app)/agent/page.tsx .backups/agent-page.tsx.backup
fi

if [ -f "src/app/(app)/call-iq/page.tsx" ]; then
  cp src/app/(app)/call-iq/page.tsx .backups/call-iq-page.tsx.backup
fi

echo "✅ Backups created in .backups/"
echo ""

# Activate premium pages
echo "🎨 Activating premium pages..."

cp src/app/(app)/layout-premium.tsx src/app/(app)/layout.tsx
cp src/app/(app)/dashboard/page-premium.tsx src/app/(app)/dashboard/page.tsx
cp src/app/(app)/calls/page-premium.tsx src/app/(app)/calls/page.tsx
cp src/app/(app)/agent/page-premium.tsx src/app/(app)/agent/page.tsx
cp src/app/(app)/call-iq/page-premium.tsx src/app/(app)/call-iq/page.tsx

echo "✅ Premium pages activated!"
echo ""

echo "🎉 Premium Dashboard is now active!"
echo ""
echo "Next steps:"
echo "1. Run 'npm run dev' to start the development server"
echo "2. Visit http://localhost:3000/dashboard"
echo "3. Check PREMIUM_DASHBOARD.md for documentation"
echo ""
echo "To restore original pages, copy files from .backups/"
