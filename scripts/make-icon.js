// Generuje assets/icon.png (512) i assets/icon.ico (16..256) z assets/icon.svg.
// Uruchom: npx electron scripts/make-icon.js
const { app, BrowserWindow, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');

app.disableHardwareAcceleration();
const root = path.join(__dirname, '..');
const SIZES = [16, 24, 32, 48, 64, 128, 256];

app.whenReady().then(async () => {
  const svg = fs.readFileSync(path.join(root, 'assets', 'icon.svg'), 'utf8');
  const win = new BrowserWindow({ show: false, width: 512, height: 512, useContentSize: true, transparent: true, frame: false,
    webPreferences: { offscreen: false } });
  const html = `<html><body style="margin:0;background:transparent;overflow:hidden">${svg}</body></html>`;
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  await new Promise((r) => setTimeout(r, 400));
  const big = await win.webContents.capturePage({ x: 0, y: 0, width: 512, height: 512 });
  fs.writeFileSync(path.join(root, 'assets', 'icon.png'), big.toPNG());

  const pngs = SIZES.map((s) => big.resize({ width: s, height: s, quality: 'best' }).toPNG());
  const head = Buffer.alloc(6);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(SIZES.length, 4);
  const dir = Buffer.alloc(16 * SIZES.length);
  let offset = 6 + dir.length;
  SIZES.forEach((s, i) => {
    dir[i * 16] = s >= 256 ? 0 : s;
    dir[i * 16 + 1] = s >= 256 ? 0 : s;
    dir.writeUInt16LE(1, i * 16 + 4);
    dir.writeUInt16LE(32, i * 16 + 6);
    dir.writeUInt32LE(pngs[i].length, i * 16 + 8);
    dir.writeUInt32LE(offset, i * 16 + 12);
    offset += pngs[i].length;
  });
  fs.writeFileSync(path.join(root, 'assets', 'icon.ico'), Buffer.concat([head, dir, ...pngs]));
  // podglądy do sprawdzenia wzrokiem
  const prev = process.env.ICON_PREVIEW_DIR;
  if (prev) SIZES.forEach((s, i) => fs.writeFileSync(path.join(prev, `icon-${s}.png`), pngs[i]));
  app.quit();
});
