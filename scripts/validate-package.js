#!/usr/bin/env node

/**
 * Pre-package validation script
 * Validates that the extension is ready for packaging by checking:
 * - All registered commands are declared in package.json
 * - All declared commands have handlers in code
 * - Required files exist (config.json, media files)
 * - Build output is valid
 */

const fs = require('fs');
const path = require('path');

let errors = [];
let warnings = [];

function error(msg) {
  errors.push(msg);
  console.error(`❌ ERROR: ${msg}`);
}

function warn(msg) {
  warnings.push(msg);
  console.warn(`⚠️  WARNING: ${msg}`);
}

function info(msg) {
  console.log(`ℹ️  ${msg}`);
}

// Load package.json
const packageJsonPath = path.join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

// Load extension.ts to check registered commands
const extensionPath = path.join(__dirname, '..', 'src', 'extension.ts');
const extensionCode = fs.readFileSync(extensionPath, 'utf8');

// Extract declared commands from package.json
const declaredCommands = (packageJson.contributes?.commands || []).map(cmd => cmd.command);
const activationEvents = (packageJson.activationEvents || [])
  .filter(event => event.startsWith('onCommand:'))
  .map(event => event.replace('onCommand:', ''));

// Extract registered commands from extension.ts
const commandMatches = extensionCode.matchAll(/registerCommand\(['"]([^'"]+)['"]/g);
const registeredCommands = Array.from(commandMatches, match => match[1]);

info(`Found ${declaredCommands.length} declared commands in package.json`);
info(`Found ${registeredCommands.length} registered commands in extension.ts`);
info(`Found ${activationEvents.length} command activation events`);

// Check 1: All registered commands should be declared in package.json
info('\nChecking registered commands are declared...');
const undeclaredCommands = registeredCommands.filter(cmd => !declaredCommands.includes(cmd));
if (undeclaredCommands.length > 0) {
  error(`Registered commands not declared in package.json: ${undeclaredCommands.join(', ')}`);
} else {
  info('✓ All registered commands are declared in package.json');
}

// Check 2: All declared commands should have activation events (if they're not always available)
info('\nChecking activation events...');
const missingActivationEvents = declaredCommands.filter(
  cmd => !activationEvents.includes(cmd) && cmd !== 'devgrid.openVulnerability' // openVulnerability is triggered via context menu
);
if (missingActivationEvents.length > 0) {
  warn(`Declared commands without activation events: ${missingActivationEvents.join(', ')}`);
  warn('These commands may not be accessible via command palette');
}

// Check 3: Verify required files exist
info('\nChecking required files...');
const requiredFiles = [
  { path: 'src/config.json', description: 'Config file' },
  { path: 'dist/extension.js', description: 'Built extension file' },
  { path: 'dist/config.json', description: 'Config file in dist' },
  { path: packageJson.icon, description: 'Extension icon' },
];

for (const file of requiredFiles) {
  const filePath = path.join(__dirname, '..', file.path);
  if (fs.existsSync(filePath)) {
    info(`✓ ${file.description} exists: ${file.path}`);
  } else {
    error(`${file.description} missing: ${file.path}`);
  }
}

// Check media files referenced in package.json
info('\nChecking media files...');
if (packageJson.icon) {
  const iconPath = path.join(__dirname, '..', packageJson.icon);
  if (fs.existsSync(iconPath)) {
    info(`✓ Extension icon exists: ${packageJson.icon}`);
  } else {
    error(`Extension icon missing: ${packageJson.icon}`);
  }
}

// Check walkthrough media
const walkthroughs = packageJson.contributes?.walkthroughs || [];
for (const walkthrough of walkthroughs) {
  for (const step of walkthrough.steps || []) {
    if (step.media?.path) {
      const mediaPath = path.join(__dirname, '..', step.media.path);
      if (fs.existsSync(mediaPath)) {
        info(`✓ Walkthrough media exists: ${step.media.path}`);
      } else {
        error(`Walkthrough media missing: ${step.media.path}`);
      }
    }
  }
}

// Check 4: Verify build output
info('\nChecking build output...');
const distPath = path.join(__dirname, '..', 'dist');
if (!fs.existsSync(distPath)) {
  error('dist/ directory does not exist. Run npm run compile first.');
} else {
  const extensionJsPath = path.join(distPath, 'extension.js');
  if (fs.existsSync(extensionJsPath)) {
    const stats = fs.statSync(extensionJsPath);
    if (stats.size === 0) {
      error('dist/extension.js is empty');
    } else {
      info(`✓ dist/extension.js exists (${(stats.size / 1024).toFixed(2)} KB)`);
    }
  } else {
    error('dist/extension.js does not exist');
  }
}

// Check 5: Verify package.json structure
info('\nValidating package.json structure...');
if (!packageJson.main) {
  error('package.json missing "main" field');
} else {
  const mainPath = path.join(__dirname, '..', packageJson.main);
  if (fs.existsSync(mainPath)) {
    info(`✓ Main entry point exists: ${packageJson.main}`);
  } else {
    error(`Main entry point missing: ${packageJson.main}`);
  }
}

if (!packageJson.contributes?.commands || packageJson.contributes.commands.length === 0) {
  error('package.json missing commands in contributes section');
}

if (!packageJson.activationEvents || packageJson.activationEvents.length === 0) {
  warn('package.json has no activation events');
}

// Summary
console.log('\n' + '='.repeat(60));
if (errors.length === 0 && warnings.length === 0) {
  console.log('✅ All validation checks passed!');
  process.exit(0);
} else {
  if (errors.length > 0) {
    console.error(`\n❌ Found ${errors.length} error(s). Please fix before packaging.`);
  }
  if (warnings.length > 0) {
    console.warn(`\n⚠️  Found ${warnings.length} warning(s).`);
  }
  process.exit(errors.length > 0 ? 1 : 0);
}

