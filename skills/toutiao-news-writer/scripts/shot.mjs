#!/usr/bin/env node
/**
 * 用本机 Chrome / Edge 把 HTML 截成 PNG（零依赖）。
 *
 * 用法:
 *   node scripts/shot.mjs work/cover.html assets/cover.png --size 1280x720
 *   node scripts/shot.mjs work/cover.html assets/cover.png --size 1280x720 --scale 2
 *   node scripts/shot.mjs "work/cover.html?style=bignum&title=..." assets/cover.png
 *
 * 说明:
 *   - 自动在 Windows / macOS / Linux 常见路径找 Chrome，找不到再找 Edge。
 *   - 可用环境变量 CHROME_PATH 指定浏览器路径。
 *   - 默认 1x；--scale 2 输出 2 倍图，文字更锐利。
 */
import { existsSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, extname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('用法: node scripts/shot.mjs <input.html> <output.png> [--size 1280x720] [--scale 2]');
  process.exit(1);
}

const [input, output] = args;
const getFlag = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const [width, height] = getFlag('--size', '1280x720').split('x').map(Number);
const scale = Number(getFlag('--scale', '1'));

const candidates = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  `${process.env.LOCALAPPDATA}/Google/Chrome/Application/chrome.exe`,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
].filter(Boolean);

const browser = candidates.find((p) => existsSync(p));
if (!browser) {
  console.error('找不到 Chrome/Edge。请设置环境变量 CHROME_PATH 指向浏览器可执行文件。');
  process.exit(2);
}

if (!existsSync(input.split('?')[0])) {
  console.error(`找不到输入文件: ${input.split('?')[0]}`);
  process.exit(3);
}

mkdirSync(dirname(resolve(output)), { recursive: true });
const url = pathToFileURL(resolve(input.split('?')[0])).href + (input.includes('?') ? `?${input.split('?').slice(1).join('?')}` : '');

const flags = [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  '--allow-file-access-from-files',
  '--disable-extensions',
  '--no-first-run',
  '--no-default-browser-check',
  `--force-device-scale-factor=${scale}`,
  `--window-size=${width},${height}`,
  '--virtual-time-budget=3000',
  `--screenshot=${resolve(output)}`,
  url,
];

const result = spawnSync(browser, flags, { stdio: 'pipe', encoding: 'utf8' });
if (result.status !== 0 && !existsSync(output)) {
  console.error('截图失败：');
  console.error(result.stderr || result.stdout || `exit ${result.status}`);
  process.exit(4);
}

console.log(`OK ${output} (${width * scale}x${height * scale})`);