const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function buildPdf() {
  console.log('=== DEFEND-AI USER MANUAL: PDF GENERATOR ===\n');

  const manualDir = __dirname;
  const mdPath = path.join(manualDir, 'USER_MANUAL.md');
  const cssPath = path.join(manualDir, 'style.css');
  const markedPath = path.join(manualDir, 'marked.min.js');
  const htmlPath = path.join(manualDir, 'manual_preview.html');
  const outputPdfPath = path.join(manualDir, 'DefendAI_User_Manual.pdf');

  if (!fs.existsSync(mdPath)) throw new Error(`Not found: ${mdPath}`);
  if (!fs.existsSync(cssPath)) throw new Error(`Not found: ${cssPath}`);
  if (!fs.existsSync(markedPath)) throw new Error(`Not found: ${markedPath}`);

  const mdContent = fs.readFileSync(mdPath, 'utf8');
  const cssContent = fs.readFileSync(cssPath, 'utf8');
  const markedJs = fs.readFileSync(markedPath, 'utf8');

  console.log('1. Generating standalone HTML with embedded styles and parser...');
  const htmlContent = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>Tài liệu Hướng dẫn Sử dụng Hệ thống DefendAI</title>
  <style>
${cssContent}
  </style>
  <script>
${markedJs}
  </script>
</head>
<body>
  <div id="content"></div>
  <script>
    const markdown = ${JSON.stringify(mdContent)};
    // Configure marked
    marked.setOptions({
      gfm: true,
      breaks: true
    });
    document.getElementById('content').innerHTML = marked.parse(markdown);
  </script>
</body>
</html>`;

  fs.writeFileSync(htmlPath, htmlContent, 'utf8');
  console.log(`-> Saved HTML preview at: ${htmlPath}`);

  console.log('2. Launching Chromium via Playwright...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1200, height: 1600 },
    deviceScaleFactor: 2 // High-DPI for crisp text and screenshots in PDF
  });
  const page = await context.newPage();

  console.log('3. Loading HTML preview and waiting for images to render...');
  const fileUrl = 'file:///' + htmlPath.replace(/\\/g, '/');
  await page.goto(fileUrl, { waitUntil: 'load', timeout: 30000 });

  // Wait a moment for web fonts and images
  await page.waitForTimeout(3000);

  console.log('4. Rendering PDF (A4 Portrait, Print Backgrounds, Custom Headers/Footers)...');
  await page.pdf({
    path: outputPdfPath,
    format: 'A4',
    printBackground: true,
    margin: {
      top: '16mm',
      bottom: '18mm',
      left: '14mm',
      right: '14mm'
    },
    displayHeaderFooter: true,
    headerTemplate: `
      <div style="font-size: 7.5pt; font-family: 'Inter', sans-serif; color: #94a3b8; width: 100%; display: flex; justify-content: space-between; padding: 0 14mm;">
        <span>DefendAI — Nền tảng Mock Graduation Defense & Code Review</span>
        <span>Version 1.0.0</span>
      </div>
    `,
    footerTemplate: `
      <div style="font-size: 8pt; font-family: 'Inter', sans-serif; color: #64748b; width: 100%; display: flex; justify-content: space-between; padding: 0 14mm;">
        <span>Tài liệu nội bộ & Hướng dẫn sử dụng</span>
        <span>Trang <span class="pageNumber"></span> / <span class="totalPages"></span></span>
      </div>
    `
  });

  await browser.close();

  const stats = fs.statSync(outputPdfPath);
  const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);
  console.log(`\n========================================`);
  console.log(`SUCCESS: PDF Generated Successfully!`);
  console.log(`File: ${outputPdfPath}`);
  console.log(`Size: ${sizeMb} MB (${stats.size} bytes)`);
  console.log(`========================================\n`);
}

buildPdf().catch(err => {
  console.error('[Error] PDF generation failed:', err);
  process.exit(1);
});
