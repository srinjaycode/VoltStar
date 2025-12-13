const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');
const CleanCSS = require('clean-css');
const { minify: minifyHTML } = require('html-minifier');

console.log('🔨 Building production files...\n');

// Create dist directory
const distDir = './dist';
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir);
  console.log('📁 Created dist/ directory\n');
}

// 1. OBFUSCATE JAVASCRIPT
console.log('⚙️  Obfuscating JavaScript...');
try {
  const jsCode = fs.readFileSync('./app.js', 'utf8');
  
  const obfuscatedJS = JavaScriptObfuscator.obfuscate(jsCode, {
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.75,
    deadCodeInjection: true,
    deadCodeInjectionThreshold: 0.4,
    debugProtection: false,
    debugProtectionInterval: 0,
    disableConsoleOutput: false,
    identifierNamesGenerator: 'hexadecimal',
    log: false,
    numbersToExpressions: true,
    renameGlobals: false,
    selfDefending: true,
    simplify: true,
    splitStrings: true,
    splitStringsChunkLength: 10,
    stringArray: true,
    stringArrayCallsTransform: true,
    stringArrayEncoding: ['base64'],
    stringArrayIndexShift: true,
    stringArrayRotate: true,
    stringArrayShuffle: true,
    stringArrayWrappersCount: 2,
    stringArrayWrappersChainedCalls: true,
    stringArrayWrappersParametersMaxCount: 4,
    stringArrayWrappersType: 'function',
    stringArrayThreshold: 0.75,
    transformObjectKeys: true,
    unicodeEscapeSequence: false
  });
  
  fs.writeFileSync(path.join(distDir, 'app.min.js'), obfuscatedJS.getObfuscatedCode());
  console.log('✅ JavaScript obfuscated → dist/app.min.js');
  
  const originalSize = Buffer.byteLength(jsCode, 'utf8');
  const obfuscatedSize = Buffer.byteLength(obfuscatedJS.getObfuscatedCode(), 'utf8');
  console.log(`   Original: ${(originalSize / 1024).toFixed(2)} KB`);
  console.log(`   Obfuscated: ${(obfuscatedSize / 1024).toFixed(2)} KB\n`);
} catch (error) {
  console.error('❌ Error obfuscating JavaScript:', error.message);
  process.exit(1);
}

// 2. MINIFY CSS
console.log('⚙️  Minifying CSS...');
try {
  const cssCode = fs.readFileSync('./style.css', 'utf8');
  const minifiedCSS = new CleanCSS({
    level: 2,
    format: false
  }).minify(cssCode);
  
  if (minifiedCSS.errors.length > 0) {
    console.error('❌ CSS minification errors:', minifiedCSS.errors);
    process.exit(1);
  } else {
    fs.writeFileSync(path.join(distDir, 'style.min.css'), minifiedCSS.styles);
    console.log('✅ CSS minified → dist/style.min.css');
    
    const originalSize = Buffer.byteLength(cssCode, 'utf8');
    const minifiedSize = Buffer.byteLength(minifiedCSS.styles, 'utf8');
    console.log(`   Original: ${(originalSize / 1024).toFixed(2)} KB`);
    console.log(`   Minified: ${(minifiedSize / 1024).toFixed(2)} KB`);
    console.log(`   Savings: ${(((originalSize - minifiedSize) / originalSize) * 100).toFixed(1)}%\n`);
  }
} catch (error) {
  console.error('❌ Error minifying CSS:', error.message);
  process.exit(1);
}

// 3. MINIFY HTML
console.log('⚙️  Minifying HTML...');
try {
  const htmlCode = fs.readFileSync('./index.html', 'utf8');
  
  // Replace script and css references to minified versions
  const updatedHTML = htmlCode
    .replace('app.js', 'app.min.js')
    .replace('style.css', 'style.min.css');
  
  const minifiedHTML = minifyHTML(updatedHTML, {
    collapseWhitespace: true,
    removeComments: true,
    removeRedundantAttributes: true,
    removeScriptTypeAttributes: true,
    removeStyleLinkTypeAttributes: true,
    useShortDoctype: true,
    minifyCSS: true,
    minifyJS: true
  });
  
  fs.writeFileSync(path.join(distDir, 'index.html'), minifiedHTML);
  console.log('✅ HTML minified → dist/index.html');
  
  const originalSize = Buffer.byteLength(htmlCode, 'utf8');
  const minifiedSize = Buffer.byteLength(minifiedHTML, 'utf8');
  console.log(`   Original: ${(originalSize / 1024).toFixed(2)} KB`);
  console.log(`   Minified: ${(minifiedSize / 1024).toFixed(2)} KB`);
  console.log(`   Savings: ${(((originalSize - minifiedSize) / originalSize) * 100).toFixed(1)}%\n`);
} catch (error) {
  console.error('❌ Error minifying HTML:', error.message);
  process.exit(1);
}

// 4. Create instructions file
const instructions = `VOLTSTAR PRODUCTION BUILD
========================

Your production files are ready in the 'dist/' folder:
- dist/index.html
- dist/app.min.js  
- dist/style.min.css

DEPLOYMENT INSTRUCTIONS:
1. Upload ONLY the files in the 'dist/' folder to your web server
2. Make sure your Firebase database URL is accessible
3. Test the site to ensure everything works

SECURITY NOTES:
- JavaScript is heavily obfuscated (harder to read, but not impossible)
- CSS is minified
- HTML is compressed
- IMPORTANT: Your Firebase database URL is still in the code (it has to be for the app to work)
- NEVER put API keys or secrets in client-side code
- Consider adding Firebase security rules to protect your database

FILES TO DEPLOY:
dist/index.html
dist/app.min.js  
dist/style.min.css

DO NOT deploy the original source files (app.js, style.css, index.html)

WHAT WAS OBFUSCATED:
- All variable names changed to meaningless hexadecimal
- All function names obfuscated
- String values encoded in base64
- Control flow flattened (makes logic harder to follow)
- Dead code injected (fake code to confuse)
- String array shuffled and rotated
- Code structure completely transformed

ORIGINAL CODE PROTECTION:
Keep your source files (app.js, style.css, index.html) private.
Only deploy the minified/obfuscated versions from dist/.

For Firebase Hosting:
firebase deploy --only hosting

Built on: ${new Date().toLocaleString()}
`;

fs.writeFileSync(path.join(distDir, 'README.txt'), instructions);
console.log('✅ Instructions created → dist/README.txt\n');

// 5. Summary
console.log('═══════════════════════════════════════');
console.log('🎉 BUILD COMPLETE!');
console.log('═══════════════════════════════════════');
console.log('📁 Production files are in the dist/ folder');
console.log('🚀 Upload the dist/ folder contents to your web server');
console.log('');
console.log('Next steps:');
console.log('  1. Test locally by opening dist/index.html');
console.log('  2. Upload dist/* to your hosting provider');
console.log('  3. Keep source files (app.js, style.css) private');
console.log('');
console.log('For Firebase Hosting:');
console.log('  firebase deploy --only hosting');
console.log('═══════════════════════════════════════\n');