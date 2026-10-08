// CDP 驱动 chrome-headless-shell 验证斜面物块演示页（自起停 http 服务与浏览器）
// 用法: node inclined-plane-cdp.mjs
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const HTTP_PORT = 8642;
const DEBUG_PORT = 9223;
const PAGE_URL = `http://127.0.0.1:${HTTP_PORT}/inclined-plane-block.html`;
const SHOT = '/tmp/opencode/inclined-shot.png';
const CHROME = process.env.HOME + '/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell';
const CHROME_ENV = { ...process.env, LD_LIBRARY_PATH: process.env.HOME + '/chrome-libs/root/usr/lib/x86_64-linux-gnu' };

let pass = 0, fail = 0;
const ok = (cond, name, detail) => {
    if (cond) { pass++; console.log('  PASS ' + name); }
    else { fail++; console.log('  FAIL ' + name + (detail !== undefined ? '  → ' + String(detail) : '')); }
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const server = spawn('python3', ['-m', 'http.server', String(HTTP_PORT), '--bind', '127.0.0.1'], { cwd: DIR, stdio: 'ignore' });
const chrome = spawn(CHROME, [
    '--headless', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
    `--remote-debugging-port=${DEBUG_PORT}`, '--user-data-dir=/tmp/opencode/inclined-cdp-profile',
    '--window-size=1400,1000', 'about:blank'
], { stdio: 'ignore', env: CHROME_ENV });

async function waitPort(url, tries) {
    for (let i = 0; i < tries; i++) {
        try { const r = await fetch(url); if (r.ok) return true; } catch { }
        await sleep(250);
    }
    return false;
}

function connect(wsUrl) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(wsUrl);
        let id = 0;
        const pending = new Map();
        const bag = { msgs: [] };
        ws.onopen = () => resolve({
            send(method, params = {}) {
                return new Promise((res, rej) => {
                    const mid = ++id;
                    pending.set(mid, { res, rej });
                    ws.send(JSON.stringify({ id: mid, method, params }));
                });
            },
            bag,
            close: () => ws.close()
        });
        ws.onerror = () => reject(new Error('WS error'));
        ws.onmessage = (ev) => {
            const msg = JSON.parse(ev.data);
            if (msg.id && pending.has(msg.id)) {
                const p = pending.get(msg.id);
                pending.delete(msg.id);
                if (msg.error) p.rej(new Error(msg.error.message)); else p.res(msg.result);
            } else if (msg.method === 'Runtime.consoleAPICalled' &&
                (msg.params.type === 'error' || msg.params.type === 'warning')) {
                bag.msgs.push(msg.params.type + ': ' + msg.params.args.map(a => a.value ?? a.description ?? '').join(' '));
            } else if (msg.method === 'Runtime.exceptionThrown') {
                bag.msgs.push('EXC: ' + (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text));
            }
        };
    });
}

let cdp = null, tab = null;
try {
    if (!await waitPort(`http://127.0.0.1:${HTTP_PORT}/index.html`, 40)) throw new Error('http server 未就绪');
    if (!await waitPort(`http://127.0.0.1:${DEBUG_PORT}/json/version`, 40)) throw new Error('chrome 调试端口未就绪');

    const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?url=about:blank`, { method: 'PUT' });
    tab = await res.json();
    cdp = await connect(tab.webSocketDebuggerUrl);
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');

    const ev = async (expr) => (await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true })).result.value;
    const setP = (id, v) => ev(`(()=>{const el=document.getElementById('${id}');el.value=${v};el.dispatchEvent(new Event('input'));return true;})()`);
    const click = (sel) => ev(`document.querySelector('${sel}').click(); true`);
    const setSel = (id, v) => ev(`(()=>{const el=document.getElementById('${id}');el.value='${v}';el.dispatchEvent(new Event('change'));return true;})()`);
    const sim = () => ev('window.getSimState()');
    const wait = async (cond, timeout, label) => {
        const t0 = Date.now();
        while (Date.now() - t0 < timeout) {
            if (await ev(cond)) return true;
            await sleep(60);
        }
        ok(false, '等待超时: ' + label);
        return false;
    };
    const shot = async () => {
        const r = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
        writeFileSync(SHOT, Buffer.from(r.data, 'base64'));
    };
    const canvasHas = (id, judge) => ev(`(()=>{const c=document.getElementById('${id}');const x=c.getContext('2d');
        for(let y=0;y<c.height;y+=2)for(let px=0;px<c.width;px+=2){const d=x.getImageData(px,y,1,1).data;
        const a=d[3]/255;const r=[0,1,2].map(i=>Math.round(d[i]*a+255*(1-a)));
        if(${judge})return true;}return false;})()`);

    await cdp.send('Page.navigate', { url: PAGE_URL });
    await sleep(700);

    console.log('\n== 加载与初始渲染');
    ok((await ev('!!window.getSimState && !!window.INCLINE')), '页面脚本加载（INCLINE + getSimState）');
    ok(cdp.bag.msgs.length === 0, '控制台零错误/零警告', cdp.bag.msgs.join(' | '));
    let s0 = await sim();
    ok(s0.state === 'idle' && s0.badge === '上滑匀减速', '初始待播放且徽章=上滑匀减速', JSON.stringify(s0.badge));
    ok(s0.tEnd > 1 && s0.tEnd < 5, '默认参数时间线合理 tEnd=' + s0.tEnd.toFixed(3));
    ok(await canvasHas('canvas', 'r[0]>=240&&r[1]>=90&&r[1]<=160&&r[2]<70'), '主画布绘制物块橙色');
    ok(await canvasHas('canvas', '(Math.abs(r[0]-226)<12&&Math.abs(r[1]-232)<12&&Math.abs(r[2]-240)<12)||(document.body.classList.contains("dark")&&r[0]<90&&r[0]>0)'), '主画布绘制斜面主体');
    ok(await canvasHas('vtChart', 'r[0]<100&&r[1]<110&&r[2]>180'), 'v-t 图已绘制（蓝色曲线/坐标）');
    ok(await canvasHas('stChart', 'r[0]<60&&r[1]>110&&r[1]<180'), 's-t 图已绘制（青绿曲线）');
    ok(await ev(`!document.getElementById('enChart') && document.querySelectorAll('.chart-panel').length===2`), '能量柱状图已移除，图表区仅两图');
    ok(await ev(`document.getElementById('formulaNote').textContent.includes('临界角') && document.getElementById('formulaNote').textContent.includes('E₀=')`), '公式卡含临界角与 E₀ 能量账目行');
    ok(await ev(`document.getElementById('conclusion').textContent.length > 20`), '结论卡已生成');
    ok(await ev(`(()=>{const ids=['dT','dS','dV','dEk','dEp','dE','dWf','dWb','dG','dN','dF','dFnet','dR'];return ids.every(id=>document.getElementById(id));})()`), '单列数据面板字段齐全');

    console.log('\n== 播放 / 暂停 / 单步 / 进度回放');
    await click('#btnPlay');
    await sleep(600);
    let s1 = await sim();
    ok(s1.state === 'running' && s1.t > 0.3 && s1.t < 1.2, '播放中 t 推进', 't=' + s1.t.toFixed(3));
    ok(s1.st.v < 5 && s1.st.v > 0, '上滑减速中 v∈(0,5)', 'v=' + s1.st.v.toFixed(3));
    ok(Number(await ev(`document.getElementById('progress').value`)) > 0, '进度条随播放推进');
    await ev(`document.dispatchEvent(new KeyboardEvent('keydown',{code:'Space'}))`);
    ok((await sim()).state === 'paused', '空格键暂停');
    const tBefore = (await sim()).t;
    await click('#btnStep');
    ok(Math.abs((await sim()).t - (tBefore + 0.02)) < 1e-6, '单步 +0.02s');
    await ev(`document.getElementById('progress').value=${(s1.tEnd / 2).toFixed(3)};document.getElementById('progress').dispatchEvent(new Event('input'));true`);
    const sMid = await sim();
    ok(sMid.state === 'paused' && Math.abs(sMid.t - s1.tEnd / 2) < 0.01, '进度条拖拽回放生效', 't=' + sMid.t.toFixed(3));
    const stRef = await ev(`(()=>{const I=window.INCLINE,P=window.getSimState().params;const tl=I.buildTimeline(P);return I.stateAt(tl,${sMid.t.toFixed(3)}).s;})()`);
    ok(Math.abs(sMid.st.s - stRef) < 1e-6, '回放位置与物理核解析解一致', sMid.st.s.toFixed(4) + ' vs ' + stRef.toFixed(4));
    await ev(`document.getElementById('progress').value=${s1.tEnd.toFixed(3)};document.getElementById('progress').dispatchEvent(new Event('input'));true`);
    await click('#btnPlay');
    ok((await sim()).state === 'running' && (await sim()).t < s1.tEnd, '结束后拖回再播放，从所选历史时刻继续');
    await click('#speedGroup button[data-rate="4"]');
    await wait(`window.getSimState().state==='ended'`, 8000, '播放到结束态');
    const endedAt = await sim();
    await ev(`document.getElementById('progress').value=${(endedAt.tEnd / 2).toFixed(3)};document.getElementById('progress').dispatchEvent(new Event('input'));true`);
    const scrubbedEnded = await sim();
    await click('#btnPlay');
    await sleep(100);
    const resumedFromScrub = await sim();
    ok(resumedFromScrub.state === 'running' && resumedFromScrub.t > scrubbedEnded.t, 'ended 后拖回历史时刻再播放，从拖动位置继续', `${scrubbedEnded.t.toFixed(3)}→${resumedFromScrub.t.toFixed(3)}`);
    await click('#btnReset');

    console.log('\n== 预设场景 ②静态自锁');
    await setSel('preset', 'lock');
    s0 = await sim();
    ok(s0.badge === '静止自锁' && s0.st.a === 0, '徽章=静止自锁，a=0', s0.badge);
    ok(await ev(`(()=>{const I=window.INCLINE,P=window.getSimState().params;return Math.abs(I.forces(P,I.stateAt(I.buildTimeline(P),0.5)).f-2*9.8*0.5)<1e-9;})()`), 'f = mg·sin30° = 9.80 N');

    console.log('\n== 预设场景 ③上滑最高点自锁（TC-04 全流程）');
    await setSel('preset', 'upLock');
    await setP('mus', 0.6); await setP('musN', 0.6);
    await click('#speedGroup button[data-rate="4"]');
    await click('#btnPlay');
    await wait(`window.getSimState().state==='ended'`, 8000, '播放至结束');
    s0 = await sim();
    ok(s0.badge === '静止于最高点（自锁）', '终态徽章=静止于最高点（自锁）', s0.badge);
    ok(Math.abs(s0.st.s - 1.8947) < 0.01, '停在 s_top ≈ 1.89 m', s0.st.s.toFixed(4));
    ok(!await ev(`window.INCLINE.buildTimeline(window.getSimState().params).events.some(e=>e.type==='bottom')`), '未下滑（无到底端事件）');
    await ev(`document.getElementById('btnReset').click();true`);
    const tlLock = await ev(`window.INCLINE.buildTimeline(window.getSimState().params)`);
    const topT = tlLock.events.find(e => e.type === 'top').t;
    const stepTowardTop = Math.floor(topT / 0.02) * 0.02;
    await ev(`document.getElementById('progress').value=${stepTowardTop.toFixed(3)};document.getElementById('progress').dispatchEvent(new Event('input'));true`);
    let lastStepState = await sim();
    let stepGuard = 0;
    while (lastStepState.t < topT - 1e-8 && stepGuard++ < 60) {
        await click('#btnStep');
        lastStepState = await sim();
    }
    ok(Math.abs(lastStepState.t - topT) < 1e-8 && lastStepState.badge === '瞬时静止 · 最高点', '单步在最高点事件处自动对齐拐点', `${lastStepState.t.toFixed(5)} / ${topT.toFixed(5)} ${lastStepState.badge}`);
    await ev(`document.getElementById('progress').value=${topT.toFixed(3)};document.getElementById('progress').dispatchEvent(new Event('input'));true`);
    ok((await sim()).badge === '瞬时静止 · 最高点', '回放至拐点时徽章显示瞬时静止最高点', (await sim()).badge);
    await click('#btnReset');

    console.log('\n== 预设场景 ④上滑后反向下滑（TC-05 全流程）');
    await setSel('preset', 'upDown');
    const reverseTop = await ev(`window.INCLINE.buildTimeline(window.getSimState().params).events.find(e=>e.type==='top').t`);
    await ev(`document.getElementById('progress').value=${reverseTop.toFixed(3)};document.getElementById('progress').dispatchEvent(new Event('input'));true`);
    ok((await sim()).badge === '瞬时静止 · 最高点', '反向下滑场景拐点徽章显示瞬时静止', (await sim()).badge);
    await click('#btnReset');
    await click('#btnPlay');
    await wait(`window.getSimState().state==='ended'`, 8000, '播放至结束');
    s0 = await sim();
    ok(s0.badge === '到达底端 · 停止', '终态徽章=到达底端', s0.badge);
    const tlEnd = await ev(`(()=>{const I=window.INCLINE;const tl=I.buildTimeline(window.getSimState().params);
        const top=tl.events.find(e=>e.type==='top'),bot=tl.events.find(e=>e.type==='bottom');
        return {tu:top.t, td:bot.t-top.t};})()`);
    ok(tlEnd.tu < tlEnd.td, 't_up < t_down（0.481 vs 0.589）', JSON.stringify(tlEnd));
    ok(await ev(`(()=>{const el=document.getElementById('dWf');return parseFloat(el.textContent)>4;})()`), '摩擦生热 Wf > 4 J 已累计');
    ok(Number(await ev(`document.getElementById('dWb').textContent.replace(' J','')`)) > 0, '到底端的碰撞耗散计入 Wb');
    ok(await ev(`(()=>{const I=window.INCLINE,P=window.getSimState().params,tl=I.buildTimeline(P),st=I.stateAt(tl,tl.tEnd),e=I.energies(P,tl,st);return Math.abs(e.E+e.Wf+e.Wimpact-tl.E0)<1e-7;})()`), '到底端结束能量账 E+Wf+Wb=E₀');

    console.log('\n== 预设场景 ⑤初速度向下 + 冲顶用例');
    await setSel('preset', 'downV');
    s0 = await sim();
    ok(s0.badge === '向下匀加速' && Math.abs(s0.st.a + 3.204) < 0.01, '向下匀加速 a=−3.20', s0.badge + ' a=' + s0.st.a.toFixed(3));
    await setSel('preset', 'smooth');
    await setP('theta', 25);
    await setP('s0', 0);
    await setP('v0', 10);
    await click('#btnPlay');
    await wait(`window.getSimState().state==='ended'`, 8000, '冲顶播放至结束');
    s0 = await sim();
    ok(s0.badge === '冲出斜面顶端', '冲出顶端提示', s0.badge);
    ok(Math.abs(s0.st.s - 10) < 1e-6, '位置锁定 s=L=10', s0.st.s.toFixed(3));
    ok(Number(await ev(`document.getElementById('dWb').textContent.replace(' J','')`)) > 0, '冲顶动能已计入边界耗散 Wb');
    ok(await ev(`(()=>{const I=window.INCLINE,P=window.getSimState().params,tl=I.buildTimeline(P),st=I.stateAt(tl,tl.tEnd),e=I.energies(P,tl,st);return Math.abs(e.E+e.Wf+e.Wimpact-tl.E0)<1e-7;})()`), '冲顶结束能量账 E+Wf+Wb=E₀');
    ok(Number(await ev(`document.getElementById('dR').textContent.replace(/[^0-9.]/g,'')`)) > 0, '冲顶终态显示边界约束力 R');

    console.log('\n== 参数防呆与联动');
    await setSel('preset', 'smooth');
    await setP('muk', 0.8);
    await setP('mus', 0.1);
    ok(Number(await ev(`document.getElementById('mus').value`)) === 0.8, 'μs<μk 自动修正为 μk', await ev(`document.getElementById('mus').value`));
    ok(await ev(`document.getElementById('toast').classList.contains('show')`), '修正提示 toast 显示');
    await setSel('preset', 'upDown');
    await setP('mass', 1);
    const aM1 = (await sim()).st.a;
    await setP('mass', 10);
    const aM10 = (await sim()).st.a;
    ok(Math.abs(aM1 - aM10) < 1e-9, 'TC-06 质量无关：m=1 与 m=10 加速度一致', aM1 + ' vs ' + aM10);
    await ev(`document.getElementById('mass').value=2;document.getElementById('massN').value=2;document.getElementById('mass').dispatchEvent(new Event('input'));true`);
    await setP('len', 5);
    ok(Number(await ev(`document.getElementById('s0').max`)) === 5, 'L 缩短后 s0 上限联动');
    await setP('len', 10);

    console.log('\n== 播放中改参数 → 暂停 + 提示');
    await setSel('preset', 'upDown');
    await click('#btnPlay');
    await sleep(300);
    await setP('theta', 40);
    s0 = await sim();
    ok(s0.state === 'paused' && s0.stale === true, '自动暂停并标记 stale', JSON.stringify({ state: s0.state, stale: s0.stale }));
    ok(await ev(`document.getElementById('toast').textContent.includes('参数已调整')`), '悬浮提示文案正确');
    await click('#btnPlay');
    s0 = await sim();
    ok(s0.state === 'running' && s0.stale === false && s0.t < 0.5, '重新播放以新参数从头开始');
    await click('#btnReset');
    await setSel('preset', 'upDown');
    await click('#btnPlay');
    await sleep(180);
    await setSel('preset', 'lock');
    s0 = await sim();
    ok(s0.state === 'paused' && s0.stale && s0.params.theta === 45, '播放中切换预设先暂停，沿用当前演示数据等待生效', JSON.stringify({ state: s0.state, stale: s0.stale, theta: s0.params.theta }));
    await click('#btnReset');
    s0 = await sim();
    ok(s0.state === 'idle' && !s0.stale && s0.params.theta === 30 && s0.params.mu_s === 0.6, '重置后应用新预设参数');

    console.log('\n== 画布拖拽物块设置 s0');
    await click('#btnReset');
    const s0BeforeDrag = (await sim()).params.s0;
    const bp = await ev(`window.__blockClientPos()`);
    const dragPx = 80;
    const steps = 8;
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: bp.x, y: bp.y, button: 'left', clickCount: 1 });
    for (let i = 1; i <= steps; i++) {
        await cdp.send('Input.dispatchMouseEvent', {
            type: 'mouseMoved', button: 'left',
            x: bp.x + bp.ux * dragPx * i / steps,
            y: bp.y + bp.uy * dragPx * i / steps
        });
    }
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, x: bp.x + bp.ux * dragPx, y: bp.y + bp.uy * dragPx });
    const s0After = Number(await ev(`document.getElementById('s0').value`));
    const s0Expect = Math.round((s0BeforeDrag + dragPx / bp.pxPerM) * 10) / 10;
    ok(Math.abs(s0After - s0Expect) <= 0.1, '拖拽后 s0 ≈ ' + s0Expect + ' m', '实际 s0=' + s0After);

    console.log('\n== 主题切换 / 布局自适应（V1.2 单列布局）');
    await click('#btnTheme');
    ok(await ev(`document.body.classList.contains('dark')`), '暗色主题启用');
    ok(await canvasHas('canvas', 'r[0]<70&&r[1]<90&&r[2]<130'), '暗色下画布重绘（深色背景像素）');
    ok(cdp.bag.msgs.length === 0, '暗色切换后仍零错误', cdp.bag.msgs.join(' | '));
    await ev(`window.dispatchEvent(new Event('resize'));true`);
    await sleep(250);
    ok(await canvasHas('vtChart', 'r[0]<100&&r[1]<110&&r[2]>180'), 'resize 后图表重绘');
    ok(await ev(`(()=>{const m=document.querySelector('main');const cs=getComputedStyle(m);return parseInt(cs.maxWidth)===880;})()`), '内容容器最大宽度 880px（斜抛风格单列）');
    ok(await ev(`(()=>{const order=[];const root=document.querySelector('main');
        for(const el of root.children){if(el.id==='canvas'||el.closest('.canvas-wrap'))order.push('canvas');
        else if(el.classList.contains('charts-row'))order.push('charts');
        else if(el.classList.contains('playbar'))order.push('playbar');
        else if(el.querySelector&&el.querySelector('#dT'))order.push('data');
        else if(el.classList.contains('params'))order.push('params');
        else if(el.querySelector&&el.querySelector('#formulaNote'))order.push('formula');
        else if(el.querySelector&&el.querySelector('#conclusion'))order.push('conclusion');}
        return order.join(',')==='canvas,charts,playbar,data,params,formula,conclusion';})()`), '板块顺序符合 V1.2 布局规范');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 800, height: 900, deviceScaleFactor: 1, mobile: false });
    await sleep(350);
    ok(await ev(`document.documentElement.scrollWidth <= document.documentElement.clientWidth`), '800px 平板/窄桌面无水平溢出');
    const midRatio = await ev(`document.getElementById('canvas').clientHeight/document.getElementById('canvas').clientWidth`);
    ok(Math.abs(midRatio - 560 / 920) < 0.02, '画布保持 920:560 设计比例', midRatio);
    const chartCols = await ev(`getComputedStyle(document.querySelector('.charts-row')).gridTemplateColumns.split(' ').length`);
    ok(chartCols === 2, '800px 下 v-t/s-t 两列并排', chartCols);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 420, height: 900, deviceScaleFactor: 1, mobile: true });
    await sleep(400);
    ok(cdp.bag.msgs.length === 0, '窄屏 420px 布局无错误', cdp.bag.msgs.join(' | '));
    ok(await ev(`document.getElementById('canvas').clientWidth > 300 && document.getElementById('canvas').clientWidth <= 420`), '窄屏画布自适应宽度', await ev(`document.getElementById('canvas').clientWidth`));
    ok(await ev(`document.documentElement.scrollWidth <= document.documentElement.clientWidth`), '420px 手机布局无水平溢出');
    const chartColsNarrow = await ev(`getComputedStyle(document.querySelector('.charts-row')).gridTemplateColumns.split(' ').length`);
    ok(chartColsNarrow === 1, '420px 下图表单列', chartColsNarrow);
    await cdp.send('Emulation.clearDeviceMetricsOverride');
    await sleep(300);
    await shot();
    ok(cdp.bag.msgs.length === 0, '全程控制台零错误/零警告', cdp.bag.msgs.join(' | '));
} catch (e) {
    fail++;
    console.log('  FAIL 异常中断 → ' + e.message);
} finally {
    if (cdp) try { cdp.close(); } catch { }
    if (tab) try { await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/close/${tab.id}`); } catch { }
    try { chrome.kill(); } catch { }
    try { server.kill(); } catch { }
}
console.log('\n结果: ' + pass + ' PASS, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
