#!/usr/bin/env node
/**
 * 扫 AI 腔 v2：词句层 + 结构层。
 *
 * 用法:
 *   node scripts/scan-ai-tone.mjs article.md
 *   node scripts/scan-ai-tone.mjs article.md --json
 *
 * 依据:
 *   - natural-talk（MIT）
 *   - lieflat-less-ai-tone：270 对同题配对复测，区分强信号与已否决特征
 *   - shuorenhua：最小改动、信息守恒
 *
 * 说明:
 *   - 只提示，不自动改写。引语、数据、公告原文里的命中人工跳过。
 *   - high 必须处理；medium 看语境；low 是结构参考，不要求逐条改。
 *   - 序数词小标题、低密度破折号、设问、句长均匀：研究里不是稳定 AI 信号，不列为 high。
 */
import fs from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('用法: node scripts/scan-ai-tone.mjs <article.md> [--json]');
  process.exit(1);
}

const raw = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
const lines = raw.split(/\r?\n/);
const inCode = [];
let code = false;
for (const line of lines) {
  if (/^\s*```/.test(line)) code = !code;
  inCode.push(code);
}

const patterns = [
  // ---- 强信号：两轮复测都同向 ----
  { id: 'fanan', sev: 'high', re: /(不是|并非|不只是|不仅仅是|与其说)[^。！？\n]{0,50}[，,]\s*(而是|是|只是|纯粹是|更是|不如说)|表面[^。！？\n]{0,25}(实际|其实)|看似[^。！？\n]{0,25}(实则|其实)|你以为[^。！？\n]{0,30}(其实|实际上)/g, note: '翻案腔：直接写正面判断，别先立假靶子' },
  { id: 'guide-word', sev: 'high', re: /先说结论|说白了|说穿了|简单来说|简单说|说到底|归根结底|综上所述|由此可见|总而言之/g, note: '起手式/空总结：删掉引导词' },
  { id: 'colon-prompt', sev: 'high', re: /(一句话总结|核心是|原因如下|关键在于|本质上|底层逻辑|答案就是|直接给答案|结论是)[：:]/g, note: '提示语冒号：删提示语，直接写内容' },
  { id: 'when-clause', sev: 'high', re: /当[^。！？\n]{6,40}时[，,]/g, note: '“当……时”前置从句：删“当/时”，让从句直接作前一分句' },
  { id: 'topic-shell', sev: 'high', re: /对于[^。！？\n]{2,20}(来说|而言)|就[^。！？\n]{2,20}而言|在[^。！？\n]{2,15}方面/g, note: '前置话题壳：后文主语本来就是它时，删壳' },
  { id: 'vague-source', sev: 'high', re: /有研究表明|业内(普遍)?认为|专家指出|不少用户反馈|知情人士(称|表示)|据悉/g, note: '模糊归因：补来源或删' },
  { id: 'decorative-metaphor', sev: 'high', re: /像.{0,8}(导师|引擎|灯塔|钟表|交响|哨兵|守门人|手术刀|永动机)|像溺水者|像一潭死水|像受惊的小兽|像炸毛/g, note: '装饰性比喻：换成具体动作或数据' },

  // ---- 语境信号：不是每处都改 ----
  { id: 'restate', sev: 'medium', re: /这意味着|这表明|换句话说|也就是说/g, note: '机械复述：若只是重复上一句，删；若引出新推论，可留' },
  { id: 'noteworthy', sev: 'medium', re: /值得注意的是|值得一提的是|需要指出的是|不难发现/g, note: '提醒式套话：多数可删' },
  { id: 'emphasis', sev: 'medium', re: /真正.{0,8}的是|核心在于|问题的本质|本质上/g, note: '“真正/核心/本质”三件套：改成具体陈述' },
  { id: 'two-sides', sev: 'medium', re: /一方面[^。！？\n]{0,60}另一方面/g, note: '无实质权衡时，合并成有倾向的陈述' },
  { id: 'hedge', sev: 'medium', re: /从某种程度上说|在某种意义上|不得不说|或许可以说/g, note: '空泛对冲：给条件或删' },
  { id: 'written-end', sev: 'medium', re: /^##\s*(写在最后|结语|尾声|最后说几句)/gm, note: '“写在最后”是模板标记：直接结束，或换成具体事实' },
];

const hits = [];
const push = (h) => hits.push(h);

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (inCode[i] || /^\s*\|/.test(line)) continue;
  for (const p of patterns) {
    p.re.lastIndex = 0;
    let m;
    while ((m = p.re.exec(line)) !== null) {
      push({ line: i + 1, sev: p.sev, id: p.id, note: p.note, text: m[0], excerpt: line.trim().slice(0, 140) });
    }
  }
  const sentences = line.split(/[。！？!?]/).filter((s) => s.trim().length > 0);
  // 过长前置定语：排除书名、引号内的规范名称
  const probe = line.replace(/《[^》]*》/g, '').replace(/「[^」]*」/g, '').replace(/“[^”]*”/g, '');
  const attr = probe.match(/[\u4e00-\u9fa5]{16,}的[\u4e00-\u9fa5]{2,}/);
  if (attr) push({ line: i + 1, sev: 'high', id: 'long-attribute', note: '过长前置定语：拆成两个分句', text: attr[0], excerpt: line.trim().slice(0, 140) });
  for (const s of sentences) {
    const n = (s.match(/、/g) || []).length;
    if (n >= 3) push({ line: i + 1, sev: 'medium', id: 'dunhao', note: '顿号罗列过密：改短句或列表，或打散其中一项的句法', text: `${n} 个顿号`, excerpt: s.trim().slice(0, 140) });
    const cn = (s.match(/[\u4e00-\u9fa5]/g) || []).length;
    if (cn > 90) push({ line: i + 1, sev: 'low', id: 'long-sentence', note: '单句过长，拆开（不要为参差而参差）', text: `${cn} 字`, excerpt: s.trim().slice(0, 90) });
  }
}

// ---- 结构层 ----
const body = raw.replace(/^---[\s\S]*?---/, '').replace(/```[\s\S]*?```/g, '');
const totalChars = (body.match(/[\u4e00-\u9fa5]/g) || []).length;
const paragraphs = body.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p && !p.startsWith('![') && !p.startsWith('#') && !p.startsWith('>') && !p.startsWith('---') && !p.startsWith('|'));
const sections = body.split(/^##\s+/m).slice(1).map((s) => s.trim());
const sectionLens = sections.map((s) => (s.match(/[\u4e00-\u9fa5]/g) || []).length);
const sectionParas = sections.map((s) => s.split(/\n\s*\n/).filter((x) => x.trim()).length);

const metrics = {
  totalChars,
  paragraphs: paragraphs.length,
  sections: sections.length,
  sectionLens,
  sectionParas,
  sectionLenSpread: sectionLens.length ? Math.max(...sectionLens) - Math.min(...sectionLens) : 0,
  avgParagraphChars: paragraphs.length ? Math.round(paragraphs.reduce((a, p) => a + (p.match(/[\u4e00-\u9fa5]/g) || []).length, 0) / paragraphs.length) : 0,
  paragraphStarters: paragraphs.map((p) => p.slice(0, 2)),
  dashCount: (body.match(/——/g) || []).length,
  dashPer1000: totalChars ? +(((body.match(/——/g) || []).length / totalChars) * 1000).toFixed(2) : 0,
  numberedHeadings: sections.filter((s) => /^0?\d+[\s、.．]/.test(s)).length,
  conclusionColon: (body.match(/[：:]/g) || []).length,
};

// 节长过于均匀：所有节都在 250–500 字之间
if (sections.length >= 3 && sectionLens.every((n) => n >= 250 && n <= 500)) {
  push({ line: 0, sev: 'medium', id: 'uniform-sections', note: '每一节都在 250–500 字：模板感来源。合并一节、拆开一节，或删掉一个小标题', text: `节长 ${sectionLens.join('/')}`, excerpt: '' });
}
// 每节段数都一样
if (sections.length >= 3 && new Set(sectionParas).size === 1) {
  push({ line: 0, sev: 'medium', id: 'uniform-paragraphs', note: '每节段数完全相同：至少让一节只写一段，或让一节写到五段以上', text: `每节 ${sectionParas[0]} 段`, excerpt: '' });
}
// 段首雷同
const starterCount = {};
for (const s of metrics.paragraphStarters) starterCount[s] = (starterCount[s] || 0) + 1;
const topStarter = Object.entries(starterCount).sort((a, b) => b[1] - a[1])[0];
if (paragraphs.length >= 6 && topStarter && topStarter[1] / paragraphs.length >= 0.35) {
  push({ line: 0, sev: 'medium', id: 'same-start', note: '超过三分之一的段落用同两个字开头：换主语、换场景，或直接给事实', text: `“${topStarter[0]}” × ${topStarter[1]}`, excerpt: '' });
}
// 破折号密度（>2/千字才优先）
if (metrics.dashPer1000 > 2) {
  push({ line: 0, sev: 'medium', id: 'dash-density', note: `破折号 ${metrics.dashPer1000}/千字，超过 2/千字的优先线：逐处看能否改成句号`, text: `${metrics.dashCount} 处`, excerpt: '' });
}
// 结论冒号占比（粗判：冒号后是展开论证）
// 冒号只在有明确提示语时才算信号（见 colon-prompt），不做整篇频率判断。

const summary = {
  high: hits.filter((h) => h.sev === 'high').length,
  medium: hits.filter((h) => h.sev === 'medium').length,
  low: hits.filter((h) => h.sev === 'low').length,
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ file, hits, metrics, summary }, null, 2));
} else {
  console.log(`\n${file}`);
  console.log('─'.repeat(64));
  if (!hits.length) console.log('没有命中。仍建议朗读一遍。');
  else {
    for (const h of hits.sort((a, b) => a.line - b.line || (a.sev === 'high' ? -1 : 1))) {
      const tag = h.sev === 'high' ? 'HIGH' : h.sev === 'medium' ? 'MED ' : 'LOW ';
      console.log(`${tag} ${h.line ? 'L' + h.line : '全局'}  [${h.id}] ${h.note}`);
      if (h.text) console.log(`     ${h.text}${h.excerpt ? '  ← ' + h.excerpt : ''}`);
    }
  }
  console.log('─'.repeat(64));
  console.log(`high ${summary.high} / medium ${summary.medium} / low ${summary.low}`);
  console.log(`结构：${metrics.sections} 节，节长 ${metrics.sectionLens.join('/')}，每节 ${metrics.sectionParas.join('/')} 段，段均 ${metrics.avgParagraphChars} 字`);
  console.log('序数词小标题不是 AI 信号，只作信息；不要为“参差”机械改句长。');
}