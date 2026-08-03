#!/usr/bin/env node

/**
 * Call IQ Premium Dashboard - Setup Checker
 * Verifies that all required files and dependencies are in place
 */

const fs = require('fs');
const path = require('path');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function checkFile(filePath, description) {
  const exists = fs.existsSync(filePath);
  if (exists) {
    log(`✅ ${description}`, 'green');
  } else {
    log(`❌ ${description} - Missing: ${filePath}`, 'red');
  }
  return exists;
}

function checkDependency(packageJson, depName) {
  const hasDep = packageJson.dependencies?.[depName] || packageJson.devDependencies?.[depName];
  if (hasDep) {
    log(`✅ ${depName} (${hasDep})`, 'green');
  } else {
    log(`❌ ${depName} - Not installed`, 'red');
  }
  return !!hasDep;
}

async function main() {
  log('\n🚀 Call IQ Premium Dashboard - Setup Checker\n', 'cyan');

  let allGood = true;

  // Check package.json
  log('📦 Checking Dependencies...', 'blue');
  const packageJsonPath = path.join(__dirname, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    log('❌ package.json not found!', 'red');
    return;
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

  const requiredDeps = [
    'next',
    'react',
    'react-dom',
    'typescript',
    'tailwindcss',
    'framer-motion',
    'recharts',
    'zustand',
    '@react-three/fiber',
    '@react-three/drei',
    'three',
    'lucide-react',
  ];

  requiredDeps.forEach(dep => {
    if (!checkDependency(packageJson, dep)) {
      allGood = false;
    }
  });

  // Check premium component files
  log('\n🎨 Checking Premium Components...', 'blue');
  const componentFiles = [
    ['src/components/ui/Card.tsx', 'Card Component'],
    ['src/components/ui/Button.tsx', 'Button Component'],
    ['src/components/ui/Badge.tsx', 'Badge Component'],
    ['src/components/ui/Waveform.tsx', 'Waveform Component'],
    ['src/components/ui/EmptyState.tsx', 'EmptyState Component'],
    ['src/components/ui/Skeleton.tsx', 'Skeleton Component'],
    ['src/components/3d/AIOrb.tsx', 'AIOrb 3D Component'],
    ['src/components/layout/PremiumSidebar.tsx', 'Premium Sidebar'],
    ['src/components/layout/PremiumTopBar.tsx', 'Premium TopBar'],
  ];

  componentFiles.forEach(([file, desc]) => {
    if (!checkFile(path.join(__dirname, file), desc)) {
      allGood = false;
    }
  });

  // Check premium pages
  log('\n📄 Checking Premium Pages...', 'blue');
  const pageFiles = [
    ['src/app/(app)/dashboard/page-premium.tsx', 'Premium Dashboard Page'],
    ['src/app/(app)/calls/page-premium.tsx', 'Premium Calls Page'],
    ['src/app/(app)/agent/page-premium.tsx', 'Premium Agent Page'],
    ['src/app/(app)/call-iq/page-premium.tsx', 'Premium Call IQ Page'],
    ['src/app/(app)/layout-premium.tsx', 'Premium Layout'],
    ['src/app/(app)/demo/page.tsx', 'Demo Page'],
  ];

  pageFiles.forEach(([file, desc]) => {
    if (!checkFile(path.join(__dirname, file), desc)) {
      allGood = false;
    }
  });

  // Check configuration files
  log('\n⚙️  Checking Configuration...', 'blue');
  const configFiles = [
    ['tailwind.config.js', 'Tailwind Config'],
    ['src/app/globals.css', 'Global Styles'],
    ['src/lib/utils.ts', 'Utility Functions'],
    ['src/store/useStore.ts', 'Zustand Store'],
  ];

  configFiles.forEach(([file, desc]) => {
    if (!checkFile(path.join(__dirname, file), desc)) {
      allGood = false;
    }
  });

  // Check documentation
  log('\n📚 Checking Documentation...', 'blue');
  const docFiles = [
    ['README_PREMIUM.md', 'Premium README'],
    ['INSTALLATION_GUIDE.md', 'Installation Guide'],
    ['PREMIUM_DASHBOARD.md', 'Dashboard Documentation'],
    ['PREMIUM_FEATURES.md', 'Features Documentation'],
    ['PRODUCTION_CHECKLIST.md', 'Production Checklist'],
  ];

  docFiles.forEach(([file, desc]) => {
    if (!checkFile(path.join(__dirname, file), desc)) {
      allGood = false;
    }
  });

  // Check activation scripts
  log('\n🔧 Checking Activation Scripts...', 'blue');
  checkFile(path.join(__dirname, 'activate-premium.sh'), 'Bash Activation Script');
  checkFile(path.join(__dirname, 'activate-premium.ps1'), 'PowerShell Activation Script');

  // Final summary
  log('\n' + '='.repeat(50), 'cyan');
  if (allGood) {
    log('✅ All checks passed! You\'re ready to go!', 'green');
    log('\nNext steps:', 'cyan');
    log('1. Run activation script:', 'yellow');
    log('   ./activate-premium.sh (Mac/Linux)', 'yellow');
    log('   .\\activate-premium.ps1 (Windows)', 'yellow');
    log('2. Start development server:', 'yellow');
    log('   npm run dev', 'yellow');
    log('3. Visit http://localhost:3000/dashboard', 'yellow');
  } else {
    log('❌ Some checks failed. Please review the errors above.', 'red');
    log('\nTo fix:', 'yellow');
    log('1. Make sure you\'re in the apps/dashboard directory', 'yellow');
    log('2. Run: npm install', 'yellow');
    log('3. Check that all premium files were created', 'yellow');
  }
  log('='.repeat(50) + '\n', 'cyan');
}

main().catch(console.error);
