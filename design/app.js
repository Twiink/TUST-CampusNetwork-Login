const I = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><circle cx="12" cy="20" r="1"/></svg>',
  settings:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/></svg>',
  logs: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/></svg>',
  about:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>',
  refresh:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36L21 8"/><path d="M21 3v5h-5"/></svg>',
  search:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  wifi: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12.55a11 11 0 0 1 14.08 0M8.53 16.11a6 6 0 0 1 6.95 0"/><circle cx="12" cy="20" r="1"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
  chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
  check:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
};
const NAV = [
  ['home', '运行状态', I.home],
  ['settings', '配置设置', I.settings],
  ['logs', '运行日志', I.logs],
  ['about', '关于', I.about],
];
const S = { page: 'home', night: false, phone: false, net: 'online', level: '全部' };

const stars = (n, seed) =>
  Array.from({ length: n }, (_, i) => {
    const x = (i * 37 + seed * 13) % 97,
      y = (i * 53 + seed * 7) % 89;
    return `<span class="st" style="left:${x}%;top:${y}%"></span>`;
  }).join('');

const CLOUD = 'M28 60a18 18 0 0 1-2-35.9A26 26 0 0 1 75 16a20 20 0 0 1 21 13a16 16 0 0 1-2 31z';
const weather = () => `<svg class="wx" viewBox="0 0 220 150" aria-hidden="true">
  <circle class="wx-glow" cx="138" cy="50" r="58" fill="url(#wxSunGlow)"/>
  <circle class="wx-sun" cx="138" cy="50" r="30" fill="url(#wxSun)"/>
  <g class="wx-moon"><circle cx="138" cy="50" r="28" fill="url(#wxMoon)"/><circle cx="128" cy="44" r="5" fill="#ecdca6" opacity=".55"/><circle cx="147" cy="60" r="3.5" fill="#ecdca6" opacity=".5"/><circle cx="146" cy="39" r="2.5" fill="#ecdca6" opacity=".45"/></g>
  <path class="wx-cloud back" d="${CLOUD}" transform="translate(6 24) scale(.82)" opacity=".75"/>
  <path class="wx-cloud main" d="${CLOUD}" transform="translate(62 50) scale(1.3)" filter="url(#wxShadow)"/>
  <g class="wx-rain"><path d="M112 136l-6 12M134 136l-6 12M156 136l-6 12M178 136l-6 12"/></g></svg>`;
const DEFS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
  <radialGradient id="wxSun" cx=".36" cy=".34"><stop offset="0" stop-color="#fff5c0"/><stop offset=".7" stop-color="#ffd84d"/><stop offset="1" stop-color="#ffc107"/></radialGradient>
  <radialGradient id="wxSunGlow"><stop offset=".45" stop-color="#ffe680" stop-opacity=".55"/><stop offset="1" stop-color="#ffe680" stop-opacity="0"/></radialGradient>
  <radialGradient id="wxMoon" cx=".34" cy=".32"><stop offset="0" stop-color="#fff"/><stop offset=".55" stop-color="#fff6d9"/><stop offset="1" stop-color="#f2e3a8"/></radialGradient>
  <radialGradient id="wxMoonGlow"><stop offset=".4" stop-color="#ffecb0" stop-opacity=".35"/><stop offset="1" stop-color="#ffecb0" stop-opacity="0"/></radialGradient>
  <linearGradient id="wxDay" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset=".7" stop-color="#f3f8fe"/><stop offset="1" stop-color="#d6e6f7"/></linearGradient>
  <linearGradient id="wxGrey" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e3e7ec"/><stop offset="1" stop-color="#a9b2bd"/></linearGradient>
  <linearGradient id="wxNight" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5d6c8c"/><stop offset="1" stop-color="#36425c"/></linearGradient>
  <linearGradient id="wxNightGrey" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5a5258"/><stop offset="1" stop-color="#352d33"/></linearGradient>
  <linearGradient id="rcg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity=".55"/></linearGradient>
  <filter id="wxShadow" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="6" stdDeviation="6" flood-color="#1b4f86" flood-opacity=".22"/></filter>
</defs></svg>`;
const dd = (
  label,
  opts,
  sel = 0,
  up = false
) => `<div class="dd${up ? ' up' : ''}"><button type="button" class="input dd-btn" aria-haspopup="listbox" aria-expanded="false" aria-label="${label}"><span>${opts[sel]}</span>${I.chev}</button>
  <ul class="dd-pop" role="listbox" aria-label="${label}" hidden>${opts.map((o, i) => `<li role="option" tabindex="-1" aria-selected="${i === sel}">${I.check}${o}</li>`).join('')}</ul></div>`;

function sky() {
  const v = {
    online: {
      cls: 'clear',
      where: '当前 WiFi',
      title: '已认证并联网',
      body: '<span class="ssid">TUST</span> 已通过校园网认证，互联网可达。',
      chips: '<span class="chip">需要认证</span><span class="chip">中国移动 · 2023101234</span>',
      acts: '<button class="btn ghost-sky">断开连接</button>',
    },
    recover: {
      cls: 'cloud',
      where: 'WiFi 自动重连',
      title: '正在认证',
      body: '正在连接 <span class="ssid">TUST</span>，第 2 / 3 次尝试。',
      chips: '<span class="chip">剩余 12 秒后重试</span>',
      bar: true,
      acts: '<button class="btn ghost-sky">停止恢复</button>',
    },
    offline: {
      cls: 'storm',
      where: '网络连接状态',
      title: '未连接 WiFi',
      body: '当前设备未连接到任何 WiFi 网络。连接到 WiFi 后才能使用网络认证功能。',
      chips: '<span class="chip alert">心跳检测已暂停</span>',
      acts: '<button class="btn on-sky">立即重试</button>',
    },
  }[S.net];
  return `<section class="sky ${v.cls}" aria-label="网络连接状态">
    <div class="sky-art" aria-hidden="true">${stars(18, 3)}${weather()}</div>
    <div class="sky-copy"><div class="where">${v.where}</div><h2>${v.title}</h2><p>${v.body}</p><div style="display:flex;gap:6px;margin-top:12px;flex-wrap:wrap">${v.chips}</div>${v.bar ? '<div class="sky-bar" role="progressbar" aria-label="尝试进度" aria-valuenow="2" aria-valuemax="3"><i style="width:66%"></i></div>' : ''}</div>
    <div class="sky-actions">${v.acts}</div></section>`;
}

function home() {
  const off = S.net === 'offline',
    ok = S.net === 'online';
  const strip = off
    ? ''
    : `<section class="panel"><dl class="strip">
    <div><dt>信号强度</dt><dd class="t-ok">72%<small>良好</small></dd></div>
    <div><dt>连接速度</dt><dd>206 Mbps</dd></div>
    <div><dt>频段</dt><dd>5GHz</dd></div>
    <div><dt>互联网</dt><dd class="${ok ? 't-ok' : 't-bad'}">${ok ? '可达' : '不可达'}</dd></div>
    <div class="beat"><dt>心跳检测 · 每 30 秒</dt><dd><span class="dot ${ok ? 'ok' : 'bad'}"></span><span class="${ok ? 't-ok' : 't-bad'}">${ok ? '正常' : '异常'}</span><small class="countdown-text">18s 后检测</small></dd></div></dl></section>`;
  const details = off
    ? `<section class="panel"><div class="panel-h"><span class="dot"></span><h2>心跳检测 (已暂停)</h2></div><div class="panel-b"><p class="small muted">当前未连接 WiFi，心跳检测功能暂停。连接到 WiFi 后将自动恢复检测。</p></div></section>`
    : `<section class="panel"><div class="panel-h"><h2>网络详情</h2><span class="grow"></span><button class="btn icon-btn" aria-label="刷新 WiFi 信息">${I.refresh}</button></div>
    <div class="panel-b"><dl class="kv"><dt>IPv4 地址</dt><dd class="mono">10.48.13.127</dd><dt>IPv6 地址</dt><dd class="mono">2001:da8:a005:330::23</dd><dt>BSSID</dt><dd class="mono">28:e4:24:2c:e5:c0</dd><dt>WiFi 信道</dt><dd class="num">36</dd><dt>安全类型</dt><dd>WPA2 个人</dd></dl></div></section>`;
  const row = (name, sub, tag, cur) =>
    `<li class="${cur ? 'current' : ''}">${I.wifi}<div class="grow"><div class="name">${name}</div><div class="sub">${sub}</div></div><span class="tags"><span class="badge ${tag === '校园网认证' ? 'accent' : ''}">${tag}</span></span>${cur ? `<span class="cur">${I.check}当前</span>` : '<button class="btn">切换</button>'}</li>`;
  const sw = `<section class="panel"><div class="panel-h"><h2>切换 WiFi</h2><span class="grow"></span><span class="small muted">按优先级排序</span></div><ul class="list wifi" style="margin-top:10px">
    ${row('TUST', '优先级 1 · WPA2 个人', '校园网认证', ok)}${row('TUST-5G', '优先级 2 · WPA2 个人', '校园网认证', false)}${row('宿舍热点', '优先级 10 · WPA3 个人', '普通热点', false)}</ul></section>`;
  return `<div class="page-head"><div class="grow"><h1>运行状态</h1></div></div>${sky()}<div class="stack" style="margin-top:16px">${strip}</div>
    <div class="cols">${details}${sw}</div>`;
}

const setting = (label, desc, on) =>
  `<div class="setting"><div class="grow"><label>${label}</label>${desc ? `<p>${desc}</p>` : ''}</div><input type="checkbox" role="switch" class="switch" aria-label="${label}" ${on ? 'checked' : ''}></div>`;
const stepper = (label, v) =>
  `<div class="setting"><div class="grow"><label>${label}</label></div><div class="stepper"><button aria-label="减少">−</button><input value="${v}" aria-label="${label}"><button aria-label="增加">+</button></div></div>`;
function settings() {
  return `<div class="page-head"><div class="grow"><h1>配置设置</h1><p>修改后立即保存并生效</p></div></div>
  <div class="group-title">通用设置</div><section class="panel">
    ${setting('开机自动启动', '', false)}
    ${setting('启用心跳检测', '按间隔检测网络；关闭后仅在 WiFi 变化时检测，另有 30 秒兜底检查', true)}
    ${setting('断线自动重连', '认证失效时自动登录；WiFi 断开时按优先级重连已开启自动连接的 WiFi', true)}
    ${setting('启动时自动连接', '启动时若未连接 WiFi，按优先级连接已配置的 WiFi', false)}
    ${setting('保持当前连接', '启动时已连接其他 WiFi 则不切换；关闭后切换到附近最高优先级的已配置 WiFi', true)}
    ${setting('自动检查更新', '启动后自动检查新版本', true)}
    ${stepper('心跳检测间隔 (秒)', 30)}${stepper('连续失败阈值 (次)', 3)}${stepper('每个 WiFi 最多尝试次数（含首次）', 3)}${stepper('冷却期时长 (分钟，0 为不冷却)', 5)}
  </section>
  <div class="group-title">账号管理</div><section class="panel" aria-label="账号配置"><ul class="list">
    <li>${I.user}<div class="grow"><div class="name">2023101234</div><div class="sub">中国移动</div></div><span class="badge ok">使用中</span><button class="btn">编辑</button><button class="btn danger">删除</button></li>
    <li>${I.user}<div class="grow"><div class="name">2023105678</div><div class="sub">校园网</div></div><button class="btn">使用此账号</button><button class="btn">编辑</button><button class="btn danger">删除</button></li></ul>
    <div class="form-row"><label class="field"><span>用户名</span><input class="input" placeholder="请输入学号/用户名"></label><label class="field"><span>密码</span><input class="input" type="password" placeholder="请输入密码"></label><div class="field"><span>运营商</span>${dd('运营商', ['校园网', '中国移动', '中国联通', '中国电信'])}</div><button class="btn primary">保存并添加账号</button></div></section>
  <div class="group-title">WiFi 配置</div><section class="panel"><div class="panel-h"><p class="small muted grow">新添加的 WiFi 默认启用自动重连，断开后会按优先级尝试重新连接。</p><button class="btn primary">添加 WiFi</button></div><ul class="list" style="margin-top:10px">
    <li>${I.wifi}<div class="grow"><div class="name">TUST</div><div class="sub">关联账号: 2023101234 · 断开后自动重连</div></div><span class="badge accent">需要认证</span><span class="badge ok">★ 优先级 1</span><button class="btn">编辑</button></li>
    <li>${I.wifi}<div class="grow"><div class="name">宿舍热点</div><div class="sub">手动连接</div></div><span class="badge">无需认证</span><span class="badge">★ 优先级 10</span><button class="btn">编辑</button></li></ul></section>
  <div class="group-title">附近 WiFi</div><section class="panel"><div class="panel-h"><p class="small muted grow">扫描附近网络，选择后添加配置或编辑已保存的网络。</p><button class="btn">扫描</button></div><ul class="list" style="margin-top:10px">
    <li>${I.wifi}<div class="grow"><div class="name">TUST</div><div class="sub">72% · 5GHz · 已保存</div></div><button class="btn">编辑</button></li>
    <li>${I.wifi}<div class="grow"><div class="name">CMCC-EDU</div><div class="sub">41% · 2.4GHz</div></div><button class="btn">选择</button></li></ul></section>
  <div class="group-title">通知设置</div><section class="panel">${setting('WiFi 断开', '', true)}${setting('自动重连成功', '', true)}${setting('自动重连全部失败', '', true)}${setting('认证恢复成功', '', false)}</section>`;
}

const LOGS = [
  ['11:52:14', 'success', '成功', 'auth', '认证成功 · TUST · 2023101234'],
  ['11:52:10', 'info', '信息', 'network', 'verifying · TUST'],
  ['11:52:10', 'info', '信息', 'network', 'authenticating · TUST'],
  ['11:52:06', 'info', '信息', 'network', 'connecting · TUST'],
  ['11:51:58', 'warn', '警告', 'heartbeat', '心跳检测失败 1 / 3，门户返回超时'],
  ['11:48:30', 'err', '错误', 'auth', '认证失败：账号或密码错误（2023105678）'],
  ['11:40:02', 'debug', '调试', 'agent', '网络事件监听已连接 NetworkManager'],
  ['11:30:00', 'info', '信息', 'heartbeat', '心跳检测正常，延迟 38 ms'],
];
function logs() {
  const lv = ['全部', '信息', '成功', '警告', '错误', '调试'];
  const rows =
    LOGS.filter((l) => S.level === '全部' || l[2] === S.level)
      .map(
        (l) =>
          `<div class="log" tabindex="0"><time>2026-10-30 ${l[0]}</time><span class="lvl ${l[1] === 'success' ? 'ok' : l[1]}">${l[2]}</span><span class="src">${l[3]}</span><span class="msg">${l[4]}</span></div>`
      )
      .join('') ||
    '<p class="muted" style="padding:28px 16px;text-align:center">没有匹配的日志</p>';
  return `<div class="page-head"><div class="grow"><h1>运行日志</h1><p>连接、认证与恢复记录，保留最近 7 天</p></div><button class="btn" aria-label="搜索 / 刷新">${I.refresh}刷新</button></div>
  <section class="panel"><div class="toolbar"><div class="search">${I.search}<input class="input" placeholder="搜索消息或详情" aria-label="搜索全部保留历史"></div>
    <input class="input" style="width:130px" placeholder="全部来源" aria-label="来源"><div class="stepper"><button aria-label="减少">−</button><input value="0" aria-label="最近小时（0=全部）"><button aria-label="增加">+</button></div><button class="btn">筛选</button></div>
    <div class="toolbar"><div class="seg" role="group" aria-label="级别">${lv.map((x) => `<button data-level="${x}" aria-pressed="${S.level === x}">${x}</button>`).join('')}</div><span class="grow" style="flex:1"></span><span class="small muted num">共 29 条，已加载 29 条</span></div>
    <div>${rows}</div>
    <div class="logs-foot"><button class="btn">上一页</button><button class="btn">下一页</button><span class="grow"></span>
      ${dd('导出范围', ['全部保留日志', '当前筛选结果'], 0, true)}${dd('格式', ['可读文本 LOG', '结构化 JSON'], 0, true)}<button class="btn">导出日志</button><button class="btn danger">清除日志</button></div></section>`;
}

function about() {
  const f = [
    'WiFi 自动重连（三阶段优先级切换）',
    '校园网认证自动登录',
    '多账户管理',
    '网络状态监控',
    '心跳检测与断线重连',
  ];
  return `<div class="page-head"><div class="grow"><h1>关于</h1></div></div><div class="about">
  <section class="panel about-hero"><div class="mark">${I.home}</div><div class="grow" style="flex:1"><h2>NetMate</h2><p class="muted">智能 WiFi 管理工具</p></div><span class="badge accent">版本 2.0.0</span></section>
  <section class="panel"><div class="panel-h"><h2>核心功能</h2></div><div class="panel-b"><ul class="features">${f.map((x) => `<li>${I.check}${x}</li>`).join('')}</ul></div></section>
  <div class="stack"><section class="panel"><div class="panel-h"><h2>更新检查</h2></div><div class="panel-b"><p class="small muted">当前已是最新版本</p><div style="margin-top:12px"><button class="btn primary">检查更新</button></div></div></section>
  <section class="panel"><div class="panel-h"><h2>项目信息</h2></div><div class="panel-b" style="display:grid;gap:8px"><a class="link" href="#">GitHub 仓库</a><a class="link" href="#">问题反馈</a><p class="small muted" style="margin-top:6px">© 2026 NetMate. All rights reserved.</p><div><button class="btn danger">退出 NetMate</button></div></div></section></div></div>`;
}

const toggleHTML =
  () => `<button class="toggle" aria-label="${S.night ? '切换至白天模式' : '切换至黑夜模式'}" title="${S.night ? '切换至白天模式' : '切换至黑夜模式'}">
  <span class="t-sun"></span><span class="t-cloud c1"></span><span class="t-cloud c2"></span><span class="t-cloud c3"></span><span class="t-cloud c4"></span>
  <span class="t-moon"></span>${[1, 2, 3, 4, 5, 6, 7, 8].map((i) => `<span class="t-star s${i}"></span>`).join('')}<span class="t-knob"></span></button>`;

function render() {
  document.body.classList.toggle('night', S.night);
  const w = document.querySelector('.window');
  w.classList.toggle('phone', S.phone);
  const pages = S.phone ? NAV.slice(0, 3) : NAV;
  if (S.phone && S.page === 'about') S.page = 'home';
  w.querySelector('.nav').innerHTML = NAV.map(
    ([k, t, ic]) =>
      `<button data-page="${k}" ${S.page === k ? 'aria-current="page"' : ''}>${ic}<span>${t}</span></button>`
  ).join('');
  w.querySelector('.tabbar').innerHTML = pages
    .map(
      ([k, t, ic]) =>
        `<button data-page="${k}" ${S.page === k ? 'aria-current="page"' : ''}><span class="ic">${ic}</span>${t}</button>`
    )
    .join('');
  w.querySelector('.main').innerHTML =
    { home, settings, logs, about }[S.page]() + '<p class="feedback" aria-live="polite"></p>';
  document
    .querySelectorAll('.proto-bar [data-net]')
    .forEach((b) => b.setAttribute('aria-pressed', b.dataset.net === S.net));
  document.querySelector('[data-phone]').setAttribute('aria-pressed', S.phone);
}

const closeDD = (except) =>
  document.querySelectorAll('.dd-btn[aria-expanded=true]').forEach((b) => {
    if (b !== except) {
      b.setAttribute('aria-expanded', 'false');
      b.nextElementSibling.hidden = true;
    }
  });
document.addEventListener('click', (e) => {
  const opt = e.target.closest('.dd-pop li');
  if (opt) {
    const pop = opt.parentElement,
      btn = pop.previousElementSibling;
    pop.querySelectorAll('li').forEach((li) => li.setAttribute('aria-selected', li === opt));
    btn.querySelector('span').textContent = opt.textContent;
    closeDD();
    btn.focus();
    return;
  }
  const t = e.target.closest('button');
  if (!t || !t.classList.contains('dd-btn')) closeDD();
  if (!t) return;
  if (t.classList.contains('dd-btn')) {
    const open = t.getAttribute('aria-expanded') !== 'true';
    closeDD(t);
    t.setAttribute('aria-expanded', open);
    t.nextElementSibling.hidden = !open;
    if (open) t.nextElementSibling.querySelector('[aria-selected=true]').focus();
    return;
  }
  if (t.classList.contains('toggle')) {
    S.night = !S.night;
    document.body.classList.toggle('night', S.night);
    document.querySelectorAll('.toggle').forEach((x) => {
      x.setAttribute('aria-label', S.night ? '切换至白天模式' : '切换至黑夜模式');
      x.title = x.getAttribute('aria-label');
    });
    return;
  }
  if (t.dataset.page) {
    S.page = t.dataset.page;
    render();
  } else if (t.dataset.net) {
    S.net = t.dataset.net;
    S.page = 'home';
    render();
  } else if (t.dataset.level) {
    S.level = t.dataset.level;
    render();
  } else if ('phone' in t.dataset) {
    S.phone = !S.phone;
    render();
  }
});

document.addEventListener('keydown', (e) => {
  const li = e.target.closest('.dd-pop li');
  if (e.key === 'Escape') {
    const b = document.querySelector('.dd-btn[aria-expanded=true]');
    closeDD();
    b && b.focus();
  } else if (li && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
    e.preventDefault();
    (e.key === 'ArrowDown' ? li.nextElementSibling : li.previousElementSibling)?.focus();
  } else if (li && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    li.click();
  }
});
document.body.insertAdjacentHTML('afterbegin', DEFS);
document.querySelectorAll('.toggle-slot').forEach((s) => (s.innerHTML = toggleHTML()));
document.querySelector('.rail-sky').innerHTML =
  `<svg class="rc rc1" viewBox="0 0 120 64"><path d="${CLOUD}"/></svg><svg class="rc rc2" viewBox="0 0 120 64"><path d="${CLOUD}"/></svg>` +
  Array.from(
    { length: 14 },
    (_, i) => `<b style="left:${(i * 41) % 95}%;top:${(i * 29) % 70}%"></b>`
  ).join('');
render();
