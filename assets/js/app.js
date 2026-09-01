/* =========================================================
 * 仙缘协议 · SPIRIT-PROTOCOL :: 主逻辑
 * 纯前端：答题 → 加权算分 → 结果页 → 分享
 * 所有数据只在本地浏览器内处理
 * ========================================================= */
(function () {
  'use strict';

  const DATA = window.SPIRIT_DATA;
  const SPIRITS = DATA.spirits;
  const QUESTIONS = DATA.questions;
  const MAP = {};
  SPIRITS.forEach(function (s) { MAP[s.id] = s; });

  const $ = function (id) { return document.getElementById(id); };
  const esc = function (str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  const clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };

  /* ---------------------------------------------------------
   * 状态
   * --------------------------------------------------------- */
  const state = {
    idx: 0,
    answers: new Array(QUESTIONS.length).fill(-1),
    result: null,
    agreed: false
  };

  /* ---------------------------------------------------------
   * 屏幕切换
   * --------------------------------------------------------- */
  function show(name) {
    ['hero', 'quiz', 'loading', 'result', 'archive'].forEach(function (n) {
      const el = $('screen-' + n);
      if (el) el.classList.toggle('is-active', n === name);
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------------------------------------------------------
   * 背景：雪花 + 时钟
   * --------------------------------------------------------- */
  function initSnow() {
    const box = $('snow');
    if (!box || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const frag = document.createDocumentFragment();
    for (let i = 0; i < 46; i++) {
      const f = document.createElement('span');
      f.className = 'flake';
      const size = 2 + Math.random() * 3;
      f.style.left = (Math.random() * 100).toFixed(2) + '%';
      f.style.width = f.style.height = size.toFixed(1) + 'px';
      f.style.opacity = (0.18 + Math.random() * 0.45).toFixed(2);
      f.style.animationDuration = (11 + Math.random() * 16).toFixed(1) + 's';
      f.style.animationDelay = (-Math.random() * 20).toFixed(1) + 's';
      f.style.setProperty('--dx', (Math.random() * 120 - 60).toFixed(0) + 'px');
      frag.appendChild(f);
    }
    box.appendChild(frag);
  }

  function initClock() {
    const el = $('clock');
    if (!el) return;
    function tick() {
      const d = new Date();
      const p = function (n) { return String(n).padStart(2, '0'); };
      el.textContent = p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
    }
    tick();
    setInterval(tick, 1000);
  }

  /* ---------------------------------------------------------
   * 免责声明门
   * --------------------------------------------------------- */
  function initGate() {
    const list = $('discList');
    list.innerHTML = DATA.disclaimer.map(function (d, i) {
      return '<li><b>0' + (i + 1) + ' ' + esc(d.t) + '</b>' + esc(d.d) + '</li>';
    }).join('');

    const gate = $('gate');
    const agree = $('gateAgree');
    const ok = $('gateOk');

    try { state.agreed = localStorage.getItem('spirit_agreed') === '1'; } catch (e) { state.agreed = false; }

    function openGate() { gate.hidden = false; }
    function closeGate() { gate.hidden = true; }

    $('gateClose').onclick = closeGate;
    gate.addEventListener('click', function (e) { if (e.target === gate) closeGate(); });
    agree.addEventListener('change', function () { ok.disabled = !agree.checked; });
    ok.onclick = function () {
      state.agreed = true;
      try { localStorage.setItem('spirit_agreed', '1'); } catch (e) {}
      closeGate();
      startQuiz();
    };
    return openGate;
  }

  /* ---------------------------------------------------------
   * 答题
   * --------------------------------------------------------- */
  function startQuiz() {
    state.idx = 0;
    state.answers = new Array(QUESTIONS.length).fill(-1);
    show('quiz');
    renderQuestion();
  }

  let typeTimer = null;

  function renderQuestion() {
    const q = QUESTIONS[state.idx];
    const total = QUESTIONS.length;

    $('qIndex').textContent = String(state.idx + 1).padStart(2, '0');
    $('progressText').textContent = String(state.idx + 1).padStart(2, '0') + ' / ' + total;
    $('progressBar').style.width = ((state.idx) / total * 100).toFixed(1) + '%';

    // 进度小格
    $('quizChips').innerHTML = QUESTIONS.map(function (_, i) {
      const cls = i === state.idx ? 'chip on' : (state.answers[i] >= 0 ? 'chip done' : 'chip');
      return '<span class="' + cls + '"></span>';
    }).join('');

    // 题干打字机
    const title = $('qTitle');
    if (typeTimer) clearInterval(typeTimer);
    title.textContent = '';
    const caret = document.createElement('span');
    caret.className = 'caret';
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      title.textContent = q.q;
    } else {
      let n = 0;
      title.appendChild(caret);
      typeTimer = setInterval(function () {
        n++;
        title.textContent = q.q.slice(0, n);
        title.appendChild(caret);
        if (n >= q.q.length) {
          clearInterval(typeTimer);
          if (caret.parentNode) caret.parentNode.removeChild(caret);
        }
      }, 34);
    }

    // 选项
    const box = $('options');
    box.innerHTML = '';
    q.options.forEach(function (opt, i) {
      const btn = document.createElement('button');
      btn.className = 'opt' + (state.answers[state.idx] === i ? ' sel' : '');
      btn.type = 'button';
      btn.innerHTML =
        '<span class="opt-key">' + 'ABCD'[i] + '</span>' +
        '<span class="opt-main">' +
          '<span class="opt-label">' + esc(opt.label) + '</span>' +
          '<span class="opt-desc">' + esc(opt.desc) + '</span>' +
        '</span>';
      btn.onclick = function () { pick(i); };
      box.appendChild(btn);
    });

    $('btnPrev').disabled = state.idx === 0;
    $('btnNext').disabled = state.answers[state.idx] < 0;
    $('btnNext').textContent = state.idx === total - 1 ? '查看结果 →' : '下一题 →';
  }

  function pick(i) {
    state.answers[state.idx] = i;
    Array.prototype.forEach.call($('options').children, function (el, k) {
      el.classList.toggle('sel', k === i);
    });
    $('btnNext').disabled = false;

    // 自动进入下一题（末题不自动，避免误触）
    if (state.idx < QUESTIONS.length - 1) {
      setTimeout(function () { next(); }, 240);
    }
  }

  function next() {
    if (state.answers[state.idx] < 0) return;
    if (state.idx < QUESTIONS.length - 1) {
      state.idx++;
      renderQuestion();
    } else {
      runLoading();
    }
  }

  function prev() {
    if (state.idx > 0) { state.idx--; renderQuestion(); }
  }

  /* ---------------------------------------------------------
   * 算分
   * --------------------------------------------------------- */
  // 每个仙家的理论最大分：每题中它能拿到的最高权重之和
  const MAX_SCORES = (function () {
    const m = {};
    SPIRITS.forEach(function (s) { m[s.id] = 0; });
    QUESTIONS.forEach(function (q) {
      const best = {};
      q.options.forEach(function (opt) {
        Object.keys(opt.score).forEach(function (id) {
          best[id] = Math.max(best[id] || 0, opt.score[id]);
        });
      });
      Object.keys(best).forEach(function (id) { m[id] += best[id]; });
    });
    return m;
  })();

  // 排序指数：0 = 完全按原始总分（冷门仙家几乎抽不到），1 = 完全归一化（热门仙家反而被压）。
  // 0.72 是蒙特卡洛扫参后的均衡点：36 位仙家出现率 1.0%~4.3%，无死结果。
  const ALPHA = 0.72;

  function compute() {
    const raw = {};
    SPIRITS.forEach(function (s) { raw[s.id] = 0; });
    state.answers.forEach(function (ans, qi) {
      if (ans < 0) return;
      const sc = QUESTIONS[qi].options[ans].score;
      Object.keys(sc).forEach(function (id) {
        if (raw[id] === undefined) raw[id] = 0;
        raw[id] += sc[id];
      });
    });

    const order = SPIRITS.map(function (s) { return s.id; });
    const ranked = order
      .map(function (id) {
        const max = MAX_SCORES[id] || 1;
        const strength = raw[id] / max;                      // 完成度：占自身理论满分的比
        const value = raw[id] / Math.pow(max, ALPHA);        // 排序值：兼顾绝对分与完成度
        return {
          id: id,
          raw: raw[id],
          strength: strength,
          value: value,
          fit: clamp(Math.round(52 + strength * 47), 50, 99)
        };
      })
      .sort(function (a, b) {
        if (b.value !== a.value) return b.value - a.value;
        if (b.raw !== a.raw) return b.raw - a.raw;
        return order.indexOf(a.id) - order.indexOf(b.id);
      });

    // 契合度：完成度为主，再叠加一点「领先第二名多少」的区分度，
    // 避免只出现在 2 道题里的仙家恒定顶到 99%。
    const lead = ranked.length > 1
      ? clamp((ranked[0].value - ranked[1].value) / (ranked[0].value || 1), 0, 1)
      : 1;
    ranked[0].fit = clamp(Math.round(60 + ranked[0].strength * 28 + lead * 10), 62, 97);

    return { ranked: ranked, main: ranked[0], sub: ranked[1] };
  }

  /* ---------------------------------------------------------
   * 结算动画
   * --------------------------------------------------------- */
  function runLoading() {
    show('loading');
    const log = $('loadingLog');
    const mainId = compute().main.id;
    const lines = [
      '> 读取答题序列 ................ OK',
      '> 载入仙家名录 [36 UNITS] ..... OK',
      '> 加权计算缘分强度 ........... OK',
      '> 匹配林海数据库 ............. OK',
      '> 解析物种信息表 ............. OK',
      '> 生成签文 ................... DONE',
      '',
      '>> 匹配完成：' + MAP[mainId].name + '（' + MAP[mainId].real + '）',
      '>> 正在渲染数据卡 ...'
    ];

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      log.textContent = lines.join('\n');
      setTimeout(finish, 300);
      return;
    }

    log.textContent = '';
    let i = 0;
    const timer = setInterval(function () {
      log.textContent += lines[i] + '\n';
      i++;
      if (i >= lines.length) {
        clearInterval(timer);
        setTimeout(finish, 620);
      }
    }, 190);

    function finish() { renderResult(compute()); }
  }

  /* ---------------------------------------------------------
   * 结果页
   * --------------------------------------------------------- */
  function ringSVG(pct, hue) {
    const r = 34, c = 2 * Math.PI * r;
    const off = c * (1 - pct / 100);
    return '<svg width="84" height="84" viewBox="0 0 84 84">' +
      '<circle cx="42" cy="42" r="' + r + '" fill="none" stroke="rgba(255,255,255,.10)" stroke-width="5"/>' +
      '<circle cx="42" cy="42" r="' + r + '" fill="none" stroke="hsl(' + hue + ' 100% 60%)" stroke-width="5" ' +
        'stroke-linecap="round" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '" ' +
        'style="filter:drop-shadow(0 0 6px hsl(' + hue + ' 100% 60%))">' +
        '<animate attributeName="stroke-dashoffset" from="' + c.toFixed(1) + '" to="' + off.toFixed(1) + '" dur="1.1s" fill="freeze" calcMode="spline" keySplines="0.2 0.8 0.2 1" keyTimes="0;1"/>' +
      '</circle></svg>';
  }

  function renderResult(res, opts) {
    const main = MAP[res.main.id];
    const sub = MAP[res.sub.id];
    const isShare = !!(opts && opts.share);

    document.documentElement.style.setProperty('--h', main.hue);

    const top5 = res.ranked.slice(0, 5);
    const maxValue = top5[0].value || top5[0].raw || 1;

    const html = ''
      /* ---- 主卡 ---- */
      + '<div class="result-hero">'
      +   '<div class="plaque">'
      +     '<span class="plaque-glyph">' + esc(main.glyph) + '</span>'
      +     '<span class="plaque-emoji">' + main.emoji + '</span>'
      +   '</div>'
      +   '<div class="result-title">'
      +     '<p class="result-tag mono">MATCHED UNIT // ' + esc(main.group) + '</p>'
      +     '<h2 class="result-name">' + esc(main.name) + '</h2>'
      +     '<p class="result-real">' + esc(main.real) + ' · ' + esc(main.sci) + '</p>'
      +     '<p class="result-title-ttl">「' + esc(main.title) + '」</p>'
      +     '<div class="tags">' + main.tags.map(function (t) { return '<span class="tag">' + esc(t) + '</span>'; }).join('') + '</div>'
      +     '<div class="fit">'
      +       '<div class="fit-ring">' + ringSVG(res.main.fit, main.hue) + '<span class="fit-num">' + res.main.fit + '%</span></div>'
      +       '<div class="fit-txt"><b>缘分契合度</b>依据 ' + QUESTIONS.length + ' 道选择题的加权结果<br>数值仅供娱乐，别太当真</div>'
      +     '</div>'
      +   '</div>'
      + '</div>'

      /* ---- 签文 ---- */
      + '<div class="block">'
      +   '<h3 class="sect-title">签 文</h3>'
      +   '<p class="sect-note mono dim">OMEN // 一句话，今天够用了</p>'
      +   '<div class="card"><p class="omen">' + esc(main.omen) + '</p></div>'
      + '</div>'

      /* ---- 宜忌 ---- */
      + '<div class="block">'
      +   '<h3 class="sect-title">宜 与 忌</h3>'
      +   '<p class="sect-note mono dim">DO / DON\'T // 娱乐向，非建议</p>'
      +   '<div class="gb">'
      +     '<div class="gb-col ok"><h4>宜</h4><ul>' + main.good.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>'
      +     '<div class="gb-col no"><h4>忌</h4><ul>' + main.bad.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>'
      +   '</div>'
      + '</div>'

      /* ---- 次缘 ---- */
      + '<div class="block">'
      +   '<h3 class="sect-title">次 缘</h3>'
      +   '<p class="sect-note mono dim">SECOND MATCH // 与你第二合拍的一路</p>'
      +   '<div class="card"><div class="sub-card">'
      +     '<div class="sub-glyph">' + esc(sub.glyph) + '</div>'
      +     '<div><b style="font-size:17px">' + esc(sub.name) + '</b>'
      +       '<span class="mono dim" style="margin-left:8px;font-size:12px">' + esc(sub.real) + '</span>'
      +       '<p style="margin:6px 0 0;font-size:13.5px;color:#c9d7ea">' + esc(sub.omen) + '</p></div>'
      +   '</div></div>'
      + '</div>'

      /* ---- 图谱 ---- */
      + '<div class="block">'
      +   '<h3 class="sect-title">缘 分 图 谱</h3>'
      +   '<p class="sect-note mono dim">TOP 5 // 你与这些仙家的相对强度</p>'
      +   '<div class="card"><div class="rank">'
      +   top5.map(function (r) {
            const s = MAP[r.id];
          const v = r.value !== undefined ? r.value : r.raw;
            const w = Math.max(6, Math.round(v / maxValue * 100));
            return '<div class="rank-row">'
              + '<span class="g" style="border-color:hsl(' + s.hue + ' 100% 60% / .5);color:hsl(' + s.hue + ' 100% 78%)">' + esc(s.glyph) + '</span>'
              + '<span class="nm">' + esc(s.name) + '<em>' + esc(s.real) + '</em></span>'
              + '<span class="track"><i style="width:' + w + '%;background:linear-gradient(90deg,hsl(' + s.hue + ' 100% 55% / .5),hsl(' + s.hue + ' 100% 62%))"></i></span>'
              + '</div>';
          }).join('')
      +   '</div></div>'
      + '</div>'

      /* ---- 动植物科普 ---- */
      + '<div class="block">'
      +   '<h3 class="sect-title">这 是 真 实 的 它</h3>'
      +   '<p class="sect-note mono dim">SPECIES DATA SHEET // 科普部分，正经的</p>'
      +   '<div class="card"><div class="kv">'
      +     '<div class="kv-item"><span class="kv-k">学 名</span><p class="kv-v sci">' + esc(main.sci) + '</p></div>'
      +     '<div class="kv-item"><span class="kv-k">在东北</span><p class="kv-v">' + esc(main.range) + '</p></div>'
      +     '<div class="kv-item"><span class="kv-k">习 性</span><p class="kv-v">' + esc(main.habit) + '</p></div>'
      +     '<div class="kv-item"><span class="kv-k">冷知识</span><p class="kv-v">' + esc(main.fact) + '</p></div>'
      +     '<div class="kv-item"><span class="kv-k">保护现状</span><p class="kv-v">' + esc(main.status) + '</p></div>'
      +     '<div class="kv-item"><span class="kv-k">民俗侧写</span><p class="kv-v">' + esc(main.lore) + '</p></div>'
      +   '</div></div>'
      + '</div>'

      /* ---- 东北生态 ---- */
      + '<div class="block">'
      +   '<h3 class="sect-title">东 北 的 野 生 生 灵</h3>'
      +   '<p class="sect-note mono dim">NORTHEAST WILDLIFE // 它们比传说更好看</p>'
      +   '<div class="eco">'
      +   DATA.ecoNotes.map(function (n) {
            return '<div class="eco-item"><h4>' + esc(n.title) + '</h4><p>' + esc(n.body) + '</p></div>';
          }).join('')
      +   '</div>'
      + '</div>'

      /* ---- 操作 ---- */
      + '<div class="result-actions">'
      +   '<button class="btn btn-primary btn-sm" id="btnShareText">复制分享文案</button>'
      +   '<button class="btn btn-ghost btn-sm" id="btnShareLink">复制结果链接</button>'
      +   '<button class="btn btn-ghost btn-sm" id="btnRetry">再测一次</button>'
      +   '<button class="btn btn-ghost btn-sm" id="btnToArchive">仙家名录</button>'
      + '</div>'

      + '<p class="disclaimer-mini">'
      +   '<b>提醒：</b>本结果为娱乐性质的趣味匹配，不代表任何性格或命运判断；「仙家」属于东北地区民间信仰与民俗叙事，本项目仅作为文化趣味与动植物科普的入口。'
      +   '物种资料整理自公开资料，保护级别以最新版《国家重点保护野生动物名录》《国家重点保护野生植物名录》及主管部门发布信息为准。'
      +   '请拒绝捕猎、购买、食用野生动物及其制品；遇到受伤野生动物，请联系当地林业和草原部门或野生动物救助机构。'
      + '</p>';

    $('resultRoot').innerHTML = html;
    state.result = res;
    show('result');

    if (!isShare) {
      try { localStorage.setItem('spirit_last', res.main.id); } catch (e) {}
      setHash('#r=' + res.main.id + '&s=' + res.sub.id + '&f=' + res.main.fit);
    }

    $('btnShareText').onclick = function () { shareText(res); };
    $('btnShareLink').onclick = function () { shareLink(res); };
    $('btnRetry').onclick = function () {
      setHash('');
      startQuiz();
    };
    $('btnToArchive').onclick = function () { openArchive('result'); };
  }

  // 取不含 hash 的当前地址，兼容 http(s) 与本地 file:// 直开
  function baseURL() {
    return location.href.split('#')[0];
  }

  function resultURL(res) {
    return baseURL() + '#r=' + res.main.id + '&s=' + res.sub.id + '&f=' + res.main.fit;
  }

  function setHash(hash) {
    try { history.replaceState(null, '', hash || baseURL()); } catch (e) {}
  }

  function copy(text, tip) {
    function fallback() {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta);
      toast(tip);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast(tip); }, fallback);
    } else {
      fallback();
    }
  }

  function shareText(res) {
    const m = MAP[res.main.id], s = MAP[res.sub.id];
    const txt =
      '【仙缘协议】我测出来与「' + m.name + '」（' + m.real + '）最有缘，契合度 ' + res.main.fit + '%。\n' +
      '赛博称号：' + m.title + '\n' +
      '关键词：' + m.tags.join(' · ') + '\n' +
      '次缘：' + s.name + '（' + s.real + '）\n' +
      '签文：' + m.omen + '\n' +
      '\n（趣味测试，仅供娱乐，附东北野生动物科普）\n' +
      resultURL(res);
    copy(txt, '分享文案已复制');
  }

  function shareLink(res) { copy(resultURL(res), '结果链接已复制'); }

  let toastTimer = null;
  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 1900);
  }

  /* ---------------------------------------------------------
   * 名录 / 详情
   * --------------------------------------------------------- */
  let archiveFrom = 'hero';

  function openArchive(from) {
    archiveFrom = from || 'hero';
    const grid = $('archiveGrid');
    grid.innerHTML = SPIRITS.map(function (s) {
      return '<div class="arc" data-id="' + s.id + '" style="--ah:' + s.hue + '">'
        + '<div class="g">' + esc(s.glyph) + '</div>'
        + '<div class="n">' + esc(s.name) + '</div>'
        + '<div class="r">' + esc(s.real) + '</div>'
        + '</div>';
    }).join('');
    Array.prototype.forEach.call(grid.querySelectorAll('.arc'), function (el) {
      el.onclick = function () { openDetail(el.getAttribute('data-id')); };
    });
    show('archive');
  }

  function openDetail(id) {
    const s = MAP[id];
    if (!s) return;
    $('detailTag').textContent = 'DATA SHEET // ' + s.group;
    $('detailBody').innerHTML =
      '<div style="display:flex;gap:16px;align-items:center;margin-bottom:18px">'
      + '<div class="sub-glyph" style="--h:' + s.hue + ';width:64px;height:64px;font-size:30px">' + esc(s.glyph) + '</div>'
      + '<div><b style="font-size:20px">' + esc(s.name) + '</b><span class="mono dim" style="margin-left:8px;font-size:12px">'
      + esc(s.real) + '</span><div class="mono" style="font-size:11.5px;color:var(--txt-dim);font-style:italic;margin-top:2px">'
      + esc(s.sci) + '</div></div></div>'
      + '<p style="margin:0 0 16px;font-size:14px;color:#dbe7f5">「' + esc(s.omen) + '」</p>'
      + '<div class="kv">'
      + '<div class="kv-item"><span class="kv-k">关键词</span><p class="kv-v">' + esc(s.tags.join(' · ')) + '</p></div>'
      + '<div class="kv-item"><span class="kv-k">在东北</span><p class="kv-v">' + esc(s.range) + '</p></div>'
      + '<div class="kv-item"><span class="kv-k">习 性</span><p class="kv-v">' + esc(s.habit) + '</p></div>'
      + '<div class="kv-item"><span class="kv-k">冷知识</span><p class="kv-v">' + esc(s.fact) + '</p></div>'
      + '<div class="kv-item"><span class="kv-k">保护现状</span><p class="kv-v">' + esc(s.status) + '</p></div>'
      + '<div class="kv-item"><span class="kv-k">民俗侧写</span><p class="kv-v">' + esc(s.lore) + '</p></div>'
      + '</div>';
    $('detail').hidden = false;
  }

  function initModals() {
    $('detailClose').onclick = function () { $('detail').hidden = true; };
    $('detail').addEventListener('click', function (e) { if (e.target === $('detail')) $('detail').hidden = true; });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { $('detail').hidden = true; $('gate').hidden = true; }
    });
  }

  /* ---------------------------------------------------------
   * 分享链接恢复
   * --------------------------------------------------------- */
  function restoreFromHash() {
    const m = /r=([a-z_]+)/.exec(location.hash || '');
    if (!m || !MAP[m[1]]) return false;
    const f = /f=(\d+)/.exec(location.hash || '');
    const s = /s=([a-z_]+)/.exec(location.hash || '');
    const res = computePlaceholder(m[1], s && MAP[s[1]] ? s[1] : null, f ? parseInt(f[1], 10) : null);
    renderResult(res, { share: true });
    return true;
  }

  // 从链接恢复时没有真实答题数据，构造一个只展示用的结果对象
  function computePlaceholder(mainId, subId, fit) {
    const ranked = SPIRITS.map(function (sp, i) {
      let raw = Math.max(1, 55 - i);
      let f = clamp(66 - i, 40, 78);
      if (sp.id === mainId) { raw = 100; f = fit || 88; }
      if (subId && sp.id === subId) { raw = 99; f = clamp((fit || 88) - 14, 40, 80); }
      return { id: sp.id, raw: raw, strength: raw / 100, value: raw, fit: f };
    });
    ranked.sort(function (a, b) { return b.value - a.value; });
    return { ranked: ranked, main: ranked[0], sub: ranked[1] };
  }

  /* ---------------------------------------------------------
   * 启动
   * --------------------------------------------------------- */
  // 页脚「其他作品」：数据来自 SPIRIT_DATA.otherWorks，加链接只需改 data.js
  function initWorks() {
    const box = $('worksBox'), list = $('worksList');
    if (!box || !list || !DATA.otherWorks || !DATA.otherWorks.length) return;
    list.innerHTML = DATA.otherWorks.map(function (w) {
      return '<a class="work-card" href="' + esc(w.url) + '" target="_blank" rel="noopener">'
        + '<span class="work-name">' + esc(w.name) + '</span>'
        + (w.desc ? '<span class="work-desc mono">' + esc(w.desc) + '</span>' : '')
        + '<span class="work-arrow mono">→</span>'
        + '</a>';
    }).join('');
  }

  function init() {
    initSnow();
    initClock();
    initModals();
    initWorks();
    const openGate = initGate();

    $('btnStart').onclick = function () {
      if (state.agreed) startQuiz(); else openGate();
    };
    $('btnArchiveFromHero').onclick = function () { openArchive('hero'); };
    $('btnBackFromArchive').onclick = function () { show(archiveFrom); };
    $('btnPrev').onclick = prev;
    $('btnNext').onclick = next;

    // 键盘：1-4 / A-D 选择，←→ 翻页，Enter 下一题
    document.addEventListener('keydown', function (e) {
      if (!$('screen-quiz').classList.contains('is-active')) return;
      const k = e.key.toUpperCase();
      const pos = '1A2B3C4D'.indexOf(k);
      if (pos >= 0) {
        const idx = Math.floor(pos / 2);
        if (idx < QUESTIONS[state.idx].options.length) pick(idx);
      } else if (e.key === 'ArrowLeft') { prev(); }
      else if (e.key === 'ArrowRight' || e.key === 'Enter') { next(); }
    });

    if (!restoreFromHash()) {
      const last = (function () { try { return localStorage.getItem('spirit_last'); } catch (e) { return null; } })();
      // 上次结果仅用于展示"继续查看"入口，不自动跳转
      if (last && MAP[last]) {
        const btn = $('btnStart');
        btn.textContent = '再测一次';
      }
    }

    // 同一标签页里直接粘贴分享链接时不会重新加载，补一次还原
    window.addEventListener('hashchange', function () {
      if (/r=/.test(location.hash || '')) restoreFromHash();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
