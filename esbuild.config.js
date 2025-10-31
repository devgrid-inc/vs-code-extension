const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

// Determine if we're in production mode
const isProduction = process.argv.includes('--production');

const buildOptions = {
  entryPoints: ['./src/extension.ts'],
  bundle: true,
  outfile: './dist/extension.js',
  external: ['vscode'],
  format: 'cjs',
  target: 'node16',
  platform: 'node',
  sourcemap: true,
  minify: isProduction,
  keepNames: !isProduction, // Keep function names for debugging in development
  treeShaking: true,
  loader: {
    '.json': 'json', // Allow importing JSON files like config.json
  },
  banner: {
    js: '/* DevGrid VS Code Extension - Built with esbuild */',
  },
};

async function build() {
  try {
    console.log(`Building extension (${isProduction ? 'production' : 'development'})...`);
    const result = await esbuild.build(buildOptions);
    
    // Copy config.json to dist/ directory
    // Note: esbuild bundles JSON imports inline, but we also want the file available
    // for runtime requires if needed
    const configSource = path.join(__dirname, 'src', 'config.json');
    const configDest = path.join(__dirname, 'dist', 'config.json');
    if (fs.existsSync(configSource)) {
      fs.copyFileSync(configSource, configDest);
      console.log('Copied config.json to dist/');
    }
    
    console.log('Build completed successfully!');

    if (result.warnings.length > 0) {
      console.log('Warnings:');
      result.warnings.forEach(warning => console.log(`  ${warning.text}`));
    }

    return result;
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

async function watch() {
  console.log('Starting watch mode...');
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  console.log('Watching for changes...');
}

// Run build or watch based on arguments
if (process.argv.includes('--watch')) {
  watch();
} else {
  build();
}
