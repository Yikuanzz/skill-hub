#!/usr/bin/env node
/**
 * 下载网络图片，并把来源写进 assets/sources.md。
 *
 * 用法:
 *   node scripts/download-image.mjs <url> <output> --source "机构名 | 页面URL | 授权/使用说明"
 *   node scripts/download-image.mjs <url> assets/fig-01.jpg
 *
 * 只会下载 http/https 图片；下载后检查 Content-Type，避免把网页存成 .jpg。
 * 每张图都必须留下来源，否则不要用。
 */
import { mkdirSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { dirname, extname } from 'node:path';

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('用法: node scripts/download-image.mjs <url> <output> [--source "..."]');
  process.exit(1);
}

const [url, output] = args;
const getFlag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : '';
};
const source = getFlag('--source') || '未记录（交付前必须补）';

if (!/^https?:\/\//i.test(url)) {
  console.error('只支持 http/https URL');
  process.exit(1);
}

const typeToExt = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/avif': '.avif',
  'image/svg+xml': '.svg',
};

const res = await fetch(url, {
  headers: {
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36',
    referer: new URL(url).origin,
    accept: 'image/avif,image/webp,image/png,image/jpeg,*/*',
  },
});

if (!res.ok) {
  console.error(`下载失败: HTTP ${res.status}`);
  process.exit(2);
}

const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
if (!type.startsWith('image/')) {
  console.error(`不是图片: content-type=${type || 'unknown'}`);
  process.exit(3);
}

let out = output;
if (!extname(out)) out += typeToExt[type] || '.img';
mkdirSync(dirname(out), { recursive: true });

const buf = Buffer.from(await res.arrayBuffer());
writeFileSync(out, buf);

const sourcesPath = dirname(out) + '/sources.md';
if (!existsSync(sourcesPath)) {
  writeFileSync(sourcesPath, '# 图片来源\n\n| 文件 | 来源 | 授权/说明 | 下载时间 |\n|---|---|---|---|\n');
}
const stamp = new Date().toISOString().slice(0, 10);
appendFileSync(sourcesPath, `| ${out} | ${source} | ${url} | ${stamp} |\n`);

console.log(`OK ${out} (${(buf.length / 1024).toFixed(1)} KB, ${type})`);
console.log(`来源已记录: ${sourcesPath}`);