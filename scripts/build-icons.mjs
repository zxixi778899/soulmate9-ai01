// Renders the oxmate brand icons.
//
// Edge (old headless mode) rasterizes the SVG masters at large sizes only:
// small headless windows can hang on some machines. The small PNGs are
// therefore downscaled from the 512px master with GDI+ (HighQualityBicubic),
// and favicon.ico is packed from the 16/32/48 PNGs (PNG-in-ICO).
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = resolve(root, 'public');
const EDGE =
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

function edgeScreenshot(svgPath, outFile, width, height) {
  const svg = readFileSync(svgPath, 'utf8');
  const tmpDir = mkdtempSync(join(tmpdir(), 'oxmate-'));
  const html = join(tmpDir, 'icon.html');
  writeFileSync(
    html,
    `<!doctype html><html><head><meta charset="utf-8"><style>` +
      `html,body{margin:0;padding:0;overflow:hidden;background:#0a0a0f}` +
      `</style></head><body><img ` +
      `src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" ` +
      `width="${width}" height="${height}" alt=""></body></html>`
  );
  const result = spawnSync(
    EDGE,
    [
      '--headless',
      '--disable-gpu',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-sync',
      '--force-device-scale-factor=1',
      '--virtual-time-budget=3000',
      `--user-data-dir=${join(tmpDir, 'profile')}`,
      `--window-size=${width},${height}`,
      `--screenshot=${outFile.replace(/\\/g, '/')}`,
      `file:///${html.replace(/\\/g, '/')}`,
    ],
    { stdio: 'pipe', timeout: 90000 }
  );
  rmSync(tmpDir, { recursive: true, force: true });
  if (result.status !== 0 || !existsSync(outFile)) {
    throw new Error(
      `Edge render failed (${result.status}): ` +
        `${result.stderr?.toString() || 'no output'}`
    );
  }
  console.log(`rendered ${outFile} (${width}x${height})`);
}

function gdiDownscale() {
  const ps1 = join(tmpdir(), `oxmate-downscale-${Date.now()}.ps1`);
  const quote = (p) => `'${p.replace(/'/g, "''")}'`;
  const script = [
    'Add-Type -AssemblyName System.Drawing',
    `$src = [System.Drawing.Image]::FromFile(${quote(join(publicDir, 'icon-512.png'))})`,
    'foreach ($size in @(192, 180, 48, 32, 16)) {',
    '  $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)',
    '  $g = [System.Drawing.Graphics]::FromImage($bmp)',
    '  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic',
    '  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality',
    '  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality',
    '  $g.DrawImage($src, 0, 0, $size, $size)',
    '  $g.Dispose()',
    `  $name = if ($size -eq 192) { 'icon-192.png' } elseif ($size -eq 180) { 'apple-touch-icon.png' } else { 'oxmate-mark-' + $size + '.png' }`,
    `  $bmp.Save(${quote(publicDir)} + '\\' + $name, [System.Drawing.Imaging.ImageFormat]::Png)`,
    '  $bmp.Dispose()',
    '}',
    '$src.Dispose()',
  ].join('\r\n');
  writeFileSync(ps1, script);
  const result = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', ps1],
    { stdio: 'pipe', timeout: 60000 }
  );
  rmSync(ps1, { force: true });
  if (result.status !== 0) {
    throw new Error(
      `GDI+ downscale failed (${result.status}): ` +
        `${result.stderr?.toString() || 'no output'}`
    );
  }
  console.log('downscaled small PNGs (192/180/48/32/16)');
}

function packIco() {
  const pngs = [16, 32, 48].map((size) => ({
    buffer: readFileSync(join(publicDir, `oxmate-mark-${size}.png`)),
    size,
  }));
  const buf = Buffer.alloc(6 + 16 * pngs.length);
  buf.writeUInt16LE(0, 0);
  buf.writeUInt16LE(1, 2);
  buf.writeUInt16LE(pngs.length, 4);
  let offset = 6 + 16 * pngs.length;
  const chunks = [];
  pngs.forEach((png, i) => {
    const base = 6 + 16 * i;
    buf.writeUInt8(png.size, base);
    buf.writeUInt8(png.size, base + 1);
    buf.writeUInt16LE(1, base + 4);
    buf.writeUInt16LE(32, base + 6);
    buf.writeUInt32LE(png.buffer.length, base + 8);
    buf.writeUInt32LE(offset, base + 12);
    offset += png.buffer.length;
    chunks.push(png.buffer);
  });
  writeFileSync(join(publicDir, 'favicon.ico'), Buffer.concat([buf, ...chunks]));
  console.log('packed favicon.ico (16/32/48)');
}

edgeScreenshot(
  join(publicDir, 'oxmate-mark.svg'),
  join(publicDir, 'icon-512.png'),
  512,
  512
);
edgeScreenshot(
  join(publicDir, 'oxmate-lockup.svg'),
  join(publicDir, 'oxmate-lockup.png'),
  1440,
  440
);
gdiDownscale();
packIco();
console.log('done');