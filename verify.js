/* =========================================================
 * 仙缘协议 · 数据自检脚本（开发用，不参与页面运行）
 *   node verify.js
 * 检查：id 唯一性 / 题目引用的仙家是否存在 / 选项数与权重是否合规 /
 *       字段完整性 / 是否有仙家从未被引用 / 随机答题的结果分布
 * ========================================================= */
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, 'assets/js/data.js'), 'utf8');
const sandbox = {};
new Function('window', src).call(sandbox, sandbox);
const D = sandbox.SPIRIT_DATA;

// 与 app.js 保持一致
const ALPHA = 0.72;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

const ids = D.spirits.map(s => s.id);
const err = [];
const warn = [];

// 1. id 唯一
if (new Set(ids).size !== ids.length) err.push('存在重复 id');

// 2. 题目结构
D.questions.forEach((q, qi) => {
  if (!q.q) err.push(`Q${qi + 1} 缺少题干`);
  if (!q.options || q.options.length !== 4) err.push(`Q${qi + 1} 选项数不是 4（实际 ${q.options ? q.options.length : 0}）`);
  (q.options || []).forEach((o, oi) => {
    if (!o.label) err.push(`Q${qi + 1} 选项${oi + 1} 缺 label`);
    const ws = Object.values(o.score || {});
    if (ws.length !== 3) err.push(`Q${qi + 1} 选项${oi + 1} 权重项数=${ws.length}（应为 3）`);
    Object.keys(o.score || {}).forEach(id => {
      if (!ids.includes(id)) err.push(`Q${qi + 1} 选项${oi + 1} 引用了不存在的仙家: ${id}`);
    });
    ws.forEach(w => { if (![1, 2, 3].includes(w)) err.push(`Q${qi + 1} 选项${oi + 1} 权重非法: ${w}`); });
  });
});

// 3. 仙家字段完整性
const REQUIRED = ['id', 'name', 'real', 'sci', 'glyph', 'emoji', 'hue', 'group',
                  'title', 'omen', 'range', 'habit', 'fact', 'status', 'lore'];
D.spirits.forEach(s => {
  REQUIRED.forEach(k => { if (!s[k]) err.push(`${s.id} 缺字段 ${k}`); });
  if (!Array.isArray(s.tags) || s.tags.length !== 3) err.push(`${s.id} tags 不是 3 个`);
  if (!Array.isArray(s.good) || !s.good.length) err.push(`${s.id} good 为空`);
  if (!Array.isArray(s.bad) || !s.bad.length) err.push(`${s.id} bad 为空`);
  if (typeof s.hue !== 'number' || s.hue < 0 || s.hue > 360) err.push(`${s.id} hue 非法: ${s.hue}`);
});

// 4. 引用覆盖度
const refCount = {};
ids.forEach(i => refCount[i] = 0);
D.questions.forEach(q => q.options.forEach(o => Object.keys(o.score).forEach(id => refCount[id]++)));
ids.forEach(i => { if (refCount[i] < 3) warn.push(`${i} 只出现在 ${refCount[i]} 道题里（建议 >= 3，否则出现率会偏低）`); });

// 5. 理论满分
const maxS = {};
ids.forEach(i => maxS[i] = 0);
D.questions.forEach(q => {
  const best = {};
  q.options.forEach(o => Object.keys(o.score).forEach(id => { best[id] = Math.max(best[id] || 0, o.score[id]); }));
  Object.keys(best).forEach(id => maxS[id] += best[id]);
});

// 6. 蒙特卡洛：随机答题看结果分布
function simulate(answers) {
  const raw = {};
  ids.forEach(i => raw[i] = 0);
  answers.forEach((a, qi) => {
    const sc = D.questions[qi].options[a].score;
    Object.keys(sc).forEach(id => raw[id] += sc[id]);
  });
  const ranked = ids.map(id => {
    const max = maxS[id] || 1;
    const strength = raw[id] / max;
    return {
      id, raw: raw[id], strength,
      value: raw[id] / Math.pow(max, ALPHA),
      fit: clamp(Math.round(52 + strength * 47), 50, 99)
    };
  }).sort((a, b) => b.value - a.value || b.raw - a.raw || ids.indexOf(a.id) - ids.indexOf(b.id));
  const lead = clamp((ranked[0].value - ranked[1].value) / (ranked[0].value || 1), 0, 1);
  ranked[0].fit = clamp(Math.round(60 + ranked[0].strength * 28 + lead * 10), 62, 97);
  return ranked;
}

const N = 200000;
const win = {}, fitSum = {}, fitMin = {}, fitMax = {};
ids.forEach(i => { win[i] = 0; fitSum[i] = 0; fitMin[i] = 999; fitMax[i] = 0; });
for (let n = 0; n < N; n++) {
  const ans = D.questions.map(() => Math.floor(Math.random() * 4));
  const top = simulate(ans)[0];
  win[top.id]++;
  fitSum[top.id] += top.fit;
  fitMin[top.id] = Math.min(fitMin[top.id], top.fit);
  fitMax[top.id] = Math.max(fitMax[top.id], top.fit);
}

const pad = (s, n) => {
  let w = 0;
  for (const ch of String(s)) w += /[一-龥＀-￯]/.test(ch) ? 2 : 1;
  return String(s) + ' '.repeat(Math.max(0, n - w));
};

console.log('仙家 ' + D.spirits.length + ' 位 | 题目 ' + D.questions.length + ' 道 | 排序指数 α=' + ALPHA);
console.log('\n随机答题 ' + N.toLocaleString() + ' 次，各仙家成为主缘的比例：\n');
D.spirits.map(s => ({
  name: s.name, real: s.real,
  pct: win[s.id] / N * 100,
  fit: fitSum[s.id] / (win[s.id] || 1),
  lo: fitMin[s.id] === 999 ? '-' : fitMin[s.id],
  hi: fitMax[s.id],
  refs: refCount[s.id]
})).sort((a, b) => b.pct - a.pct).forEach(r => {
  console.log('  ' + pad(r.name, 12) + pad(r.real, 24) +
    '占比 ' + r.pct.toFixed(2).padStart(6) + '%' +
    '   契合度均值 ' + r.fit.toFixed(1) +
    '   区间 ' + r.lo + '~' + r.hi +
    '   出现题数 ' + r.refs);
});

const pcts = ids.map(i => win[i] / N * 100);
const dead = D.spirits.filter(s => win[s.id] === 0).map(s => s.name);
console.log('\n最低 ' + Math.min(...pcts).toFixed(2) + '%   最高 ' + Math.max(...pcts).toFixed(2) +
            '%   极差比 ' + (Math.max(...pcts) / Math.max(0.0001, Math.min(...pcts))).toFixed(2));
console.log('死结果（永远抽不到）: ' + (dead.length ? dead.join('、') : '无'));
console.log('\n错误: ' + (err.length ? '\n  - ' + err.join('\n  - ') : '无'));
console.log('提示: ' + (warn.length ? '\n  - ' + warn.join('\n  - ') : '无'));
process.exit(err.length ? 1 : 0);
