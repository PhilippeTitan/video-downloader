// Inline all CSS/JS into dist/index.html so the bundle works under file://
// (WebKit blocks ES-module scripts loaded cross-origin under file://).
const fs = require('fs');
const path = require('path');

const dist = path.join(__dirname, '..', 'web', 'dist');
const htmlPath = path.join(dist, 'index.html');
let html = fs.readFileSync(htmlPath, 'utf8');
const before = html.length;

html = html.replace(
  /<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g,
  (m, href) => {
    const file = path.join(dist, href.replace(/^\.?\//, ''));
    const css = fs.readFileSync(file, 'utf8');
    return `<style>\n${css}\n</style>`;
  }
);

html = html.replace(
  /<script\b[^>]*type="module"[^>]*src="([^"]+)"[^>]*>\s*<\/script>/g,
  (m, src) => {
    const file = path.join(dist, src.replace(/^\.?\//, ''));
    let js = fs.readFileSync(file, 'utf8');
    js = js.replace(/<\/script/gi, '<\\/script');
    return `<script type="module">\n${js}\n</script>`;
  }
);

if (html === fs.readFileSync(htmlPath, 'utf8')) {
  console.error('inline.cjs: no <script>/<link> tags were inlined — check dist/index.html');
  process.exit(1);
}

fs.writeFileSync(htmlPath, html);
console.log(`inline.cjs: index.html ${before} -> ${html.length} bytes`);
