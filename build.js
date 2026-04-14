/**
 * DotScroll Build Script
 * 
 * Requires Node.js and npm. Run:
 *   npm install
 *   npm run build
 * 
 * This will generate minified files in dist/.
 * If you don't have Node.js, you can use the files in src/ directly
 * or use a CDN minifier like https://www.toptal.com/developers/javascript-minifier
 */

const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, 'dist');
if (!fs.existsSync(distDir)) fs.mkdirSync(distDir);

async function build() {
  console.log('🔨 Building DotScroll...\n');

  // 1. IIFE build (for <script> tags — exposes window.DotScroll)
  await esbuild.build({
    entryPoints: ['src/dotscroll.js'],
    bundle: true, minify: true,
    outfile: 'dist/dotscroll.min.js',
    format: 'iife', globalName: 'DotScrollModule',
    target: ['es2015'],
    banner: { js: '/* DotScroll v1.0.0 | MIT | github.com/your-username/dotscroll */' },
    footer: { js: 'if(typeof window!=="undefined"){window.DotScroll=DotScrollModule;}' }
  });
  console.log('  ✅ dist/dotscroll.min.js');

  // 2. Non-minified
  await esbuild.build({
    entryPoints: ['src/dotscroll.js'],
    bundle: true, minify: false,
    outfile: 'dist/dotscroll.js',
    format: 'iife', globalName: 'DotScrollModule',
    target: ['es2015'],
    banner: { js: '/* DotScroll v1.0.0 | MIT | github.com/your-username/dotscroll */' },
    footer: { js: 'if(typeof window!=="undefined"){window.DotScroll=DotScrollModule;}' }
  });
  console.log('  ✅ dist/dotscroll.js');

  // 3. CSS
  await esbuild.build({
    entryPoints: ['src/dotscroll.css'],
    bundle: true, minify: true,
    outfile: 'dist/dotscroll.min.css',
    loader: { '.css': 'css' },
  });
  await esbuild.build({
    entryPoints: ['src/dotscroll.css'],
    bundle: true, minify: false,
    outfile: 'dist/dotscroll.css',
    loader: { '.css': 'css' },
  });
  console.log('  ✅ dist/dotscroll.css + dotscroll.min.css');

  // Sizes
  console.log('\n📦 Sizes:');
  for (const f of ['dotscroll.min.js', 'dotscroll.min.css']) {
    const s = fs.statSync(path.join(distDir, f));
    console.log(`   ${f}: ${(s.size / 1024).toFixed(1)} KB`);
  }
  console.log('\n🎉 Done!');
}

build().catch(e => { console.error(e); process.exit(1); });
