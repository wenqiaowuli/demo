// CDP 驱动 chrome-headless-shell 验证示波器演示页（v4，覆盖需求 16.6 + 18.7 验证清单）
// 用法: node osc-cdp.mjs  (需 http://127.0.0.1:8642 + 9223 调试端口)
import { writeFileSync } from 'node:fs';

const DEBUG_PORT = 9223;
const PAGE_URL = 'http://127.0.0.1:8642/oscilloscope-demo.html';
const SHOTS = '/home/wq/physics-work/';

let pass = 0, fail = 0;
const ok = (cond, name, detail) => {
    if (cond) { pass++; console.log('  PASS ' + name); }
    else { fail++; console.log('  FAIL ' + name + (detail !== undefined ? '  → ' + String(detail) : '')); }
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function newTab() {
    const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?url=about:blank`, { method: 'PUT' });
    return res.json();
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

const tab = await newTab();
const cdp = await connect(tab.webSocketDebuggerUrl);
await cdp.send('Runtime.enable');
await cdp.send('Page.enable');

const ev = async (expr) => (await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true })).result.value;
const read = (sel) => ev(`document.querySelector('${sel}').textContent`);
const readAll = (sel) => ev(`[...document.querySelectorAll('${sel} b')].map(e=>e.textContent)`);
const shot = async (name) => {
    const r = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    writeFileSync(SHOTS + name, Buffer.from(r.data, 'base64'));
};
const dbg = () => ev('window.getOscDebug && window.getOscDebug()');
const setInput = (id, v) => ev(`(()=>{const el=document.getElementById('${id}');el.value=${v};el.dispatchEvent(new Event('input'));return true;})()`);
const click = (id) => ev(`document.getElementById('${id}').click(); true`);
const sceneData = () => ev(`document.getElementById('scene').toDataURL()`);
async function waitForDbg(pred, timeoutMs, label) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
        const d = await dbg();
        if (d && pred(d)) return d;
        await sleep(60);
    }
    throw new Error('waitForDbg 超时: ' + label);
}
async function mouseAt(designX, designY, press, release) {
    const g = await ev(`(() => {
        const c = document.getElementById('scene');
        const r = c.getBoundingClientRect();
        const fit = c.clientWidth / 880;
        return { x: r.left + ${designX} * fit, y: r.top + ${designY} * fit };
    })()`);
    const mev = (type, x, y) => cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: type === 'mousePressed' ? 1 : 0 });
    if (press) await mev('mousePressed', g.x, g.y);
    if (press && release) await mev('mouseMoved', g.x, g.y);
    if (release) await mev('mouseReleased', g.x, g.y);
}
// chartR 像素探测：judge(rgb) 命中返回 true（合成到白底）
const chartRProbe = (uVal, yVal, rad, judgeExpr) => ev(`(() => {
    const c = document.getElementById('chartR');
    const ctx = c.getContext('2d');
    const W = c.clientWidth, H = c.clientHeight;
    const M = { l: 40, r: 14, t: 18, b: 28 };
    const xmin = -100, xmax = 100;
    const cx = M.l + (${uVal} - xmin) / 200 * (W - M.l - M.r);
    const cy = H - M.b - (${yVal} - (-6)) / 12 * (H - M.t - M.b);
    for (let dy = -${rad}; dy <= ${rad}; dy++) for (let dx = -${rad}; dx <= ${rad}; dx++) {
        const x = Math.round(cx + dx), y = Math.round(cy + dy);
        if (x < 0 || y < 0 || x >= c.width || y >= c.height) continue;
        const d = ctx.getImageData(x, y, 1, 1).data;
        const a = d[3] / 255;
        const rgb = [0, 1, 2].map(i => Math.round(d[i] * a + 255 * (1 - a)));
        if (${judgeExpr}) return true;
    }
    return false;
})()`);

console.log('== 1. 加载页面');
await cdp.send('Page.navigate', { url: PAGE_URL });
await sleep(1800);
ok(cdp.bag.msgs.length === 0, '页面加载/运行无控制台错误', cdp.bag.msgs.slice(0, 3).join(' | '));
ok(await ev('document.title') === '示波器演示｜高中物理', '页面标题正确');
ok(!!(await dbg()), 'getOscDebug 验证钩子可用');

console.log('== 2. 模式一默认态 + 零值显示（18.7-7）');
let data = await readAll('#dataGrid .data-item');
ok(data[0] === '1000 V' && data[3] === '1.88×10⁷ m/s', '默认读数 U1/v₀ 正确', data[0] + '/' + data[3]);
ok(data.includes('+2.00 cm') && data.includes('0.00 cm'), 'Y=+2.00 cm、X=0.00 cm');
ok(data.includes('0.00×10¹⁴ m/s²'), 'Ux=0 → ax 显示 0.00（无 + 号）', JSON.stringify(data.filter(v => v.includes('10¹⁴'))));
ok(data[data.length - 1].includes('正常成像'), '成像状态：正常成像');
await setInput('rB', 0);
await sleep(200);
data = await readAll('#dataGrid .data-item');
ok(data.includes('0.00×10¹⁴ m/s²') && data.filter(v => v === '0.00×10¹⁴ m/s²').length >= 2, 'Uy=0 → ay 也显示 0.00', JSON.stringify(data.filter(v => v.includes('10¹⁴'))));
await setInput('rB', 50);

console.log('== 3. v1.1 拖拽命中：空白网格按下不瞬移 + 命中拖拽（16.6-4）');
await mouseAt(767, 215, true, true);
await sleep(250);
{
    const d = await dbg();
    ok(d.Ux === 0 && d.Uy === 50, '空白处按下 Ux/Uy 不变', JSON.stringify({ Ux: d.Ux, Uy: d.Uy }));
}
await mouseAt(725, 236, true, false);
{
    const g = await ev(`(() => {
        const c = document.getElementById('scene');
        const r = c.getBoundingClientRect();
        const fit = c.clientWidth / 880;
        return { x: r.left + 767 * fit, y: r.top + 215 * fit };
    })()`);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: g.x, y: g.y, button: 'left' });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: g.x, y: g.y, button: 'left' });
    await sleep(250);
}
{
    const d = await dbg();
    ok(d.Ux === 50 && d.Uy === 75, '命中拖拽反推 Ux=+50、Uy=+75', JSON.stringify({ Ux: d.Ux, Uy: d.Uy }));
}

console.log('== 4. v1.2 跨方向碰板右图整体无效态（18.1 / 18.7-1）');
await setInput('rB', 50);       // 恢复 Uy（拖拽测试遗留 75，避免双向碰板干扰单方向用例）
await setInput('rU1', 500);
await setInput('rC', 100);      // Ux=100 → 仅 XX 碰板；Uy=50 正常
await sleep(300);
data = await readAll('#dataGrid .data-item');
ok(data[data.length - 1].includes('XX 极板'), '状态：电子打在 XX 极板上', data[data.length - 1]);
ok(await ev(`document.getElementById('dirY').getAttribute('aria-pressed') === 'true'`) === true, '当前处于 Y 图');
{
    const blueAtY = await chartRProbe(50, 2, 5, 'rgb[2] > 180 && rgb[0] < 110');
    const redAt5 = await chartRProbe(50, 5, 7, 'rgb[0] > 150 && rgb[1] < 100');
    ok(!blueAtY, 'Y 图 (Uy=50) 不显示普通蓝色成像点（整体碰板）');
    ok(redAt5, 'Y 图在 ±5 cm 临界线处显示红色碰板标记');
}
await click('dirX');
await sleep(200);
{
    const blueAt6 = await chartRProbe(100, 6, 5, 'rgb[2] > 180 && rgb[0] < 110');
    const redAt5 = await chartRProbe(100, 5, 7, 'rgb[0] > 150 && rgb[1] < 100');
    ok(!blueAt6, 'X 图 (Ux=100) 不在 ±6 边界显示普通点');
    ok(redAt5, 'X 图在 ±5 cm 临界线处显示红色碰板标记');
}
await shot('osc-shot-bubble-edge.png');   // 碰板气泡右缘定位（18.5 视觉复核）
await setInput('rU1', 1000);
await click('dirY');            // 切回 Y 图再验证恢复后的普通当前点
await sleep(300);
data = await readAll('#dataGrid .data-item');
ok(data[data.length - 1].includes('正常成像'), '恢复安全参数后正常成像');
{
    const blueAtY = await chartRProbe(50, 2, 5, 'rgb[2] > 180 && rgb[0] < 110');
    ok(blueAtY, '恢复后 Y 图重新显示普通蓝色当前点');
}

console.log('== 5. v1.1 模式一重置恢复速度（16.2 / 16.6-3）');
await setInput('rC', 0);
await setInput('rSpd', 2);
ok(await read('#vSpd') === '2.0×', '速度已调至 2.0×');
await click('btnReset');
await sleep(250);
{
    const d = await dbg();
    ok(await read('#vSpd') === '1.0×' && d.speed === 1, '重置后速度恢复 1.0×');
    ok(d.U1 === 1000 && d.Uy === 50 && d.Ux === 0, '重置后参数恢复默认');
}

console.log('== 6. 自动演示过渡段采样（16.4 / 16.6-5）+ 运行态 aria');
await click('btnAuto');
{
    ok(await read('#btnAuto') === '演示中…', '运行中按钮“演示中…”');
    ok(await ev(`document.getElementById('btnAuto').getAttribute('aria-label')`) === '演示中…', '运行中 btnAuto aria-label 同步更新');
    ok(await ev(`document.getElementById('rU1').disabled`) === true, '运行中滑条锁定');
    let d1 = null;
    try { d1 = await waitForDbg(d => d.m1phase === 'running' && d.m1t >= 3.2 && d.m1t < 3.45, 8000, 't≈3.25'); } catch (e) { }
    ok(!!d1 && d1.U1 > 1000 && d1.U1 < 2000 && d1.Uy > -100 && d1.Uy < 50 && d1.Ux === 0,
        '3~3.5 s 处于回落/竖直准备过渡', d1 && JSON.stringify({ U1: d1.U1, Uy: d1.Uy }));
    let d2 = null;
    try { d2 = await waitForDbg(d => d.m1phase === 'running' && d.m1t >= 6.2 && d.m1t < 6.45, 8000, 't≈6.25'); } catch (e) { }
    ok(!!d2 && d2.U1 === 1000 && d2.Uy > 0 && d2.Uy < 100 && d2.Ux < 0 && d2.Ux > -100,
        '6~6.5 s 处于水平准备过渡', d2 && JSON.stringify({ Uy: d2.Uy, Ux: d2.Ux }));
    const de = await waitForDbg(d => d.m1phase === 'ended', 12000, '演示结束');
    ok(de.U1 === 1000 && de.Uy === 50 && de.Ux === 0, '演示结束回默认');
}
await shot('osc-shot-mode1.png');

console.log('== 7. ended 禁拖（16.3 / 16.6-6）');
{
    await mouseAt(725, 236, true, true);
    await sleep(200);
    let d = await dbg();
    ok(d.Ux === 0 && d.Uy === 50, 'ended 状态在亮点上按下不改变参数');
    await mouseAt(767, 215, true, true);
    await sleep(200);
    d = await dbg();
    ok(d.Ux === 0 && d.Uy === 50, 'ended 状态空白处按下也不改变参数');
    await click('btnReset');
    await sleep(200);
    ok((await dbg()).m1phase === 'idle', '重置后回 idle');
}

console.log('== 8. 临界与负极性回归');
await setInput('rU1', 500);
await setInput('rB', 62);
await sleep(1350);
data = await readAll('#dataGrid .data-item');
ok(data[data.length - 1].includes('正常成像') && data.includes('+4.96 cm'), 'U1=500,Uy=62 → 正常成像 Y=+4.96 cm');
await setInput('rU1', 1000);
await setInput('rB', -100);
await sleep(1350);
data = await readAll('#dataGrid .data-item');
ok(data.includes('−4.00 cm'), 'Uy=−100 → Y=−4.00 cm（下偏）');

console.log('== 9. v1.2 模式一暂停冻结全部动画（18.2 / 18.7-2）');
await setInput('rB', 50);
await click('btnAuto');
await waitForDbg(d => d.m1phase === 'running' && d.m1t > 0.8, 5000, '运行 0.8s');
await click('btnPause');
await sleep(150);
{
    const d1 = await dbg(), c1 = await sceneData();
    await sleep(700);
    const d2 = await dbg(), c2 = await sceneData();
    ok(d1.m1t === d2.m1t && d1.beamClock === d2.beamClock && d1.vclock === d2.vclock && d1.trailLen === d2.trailLen,
        '暂停 700ms：m1.t/beamClock/vclock/拖尾数量全部冻结', JSON.stringify({ a: d1, b: d2 }));
    ok(c1 === c2, '暂停期间画布完全静止（toDataURL 一致）');
    ok(await read('#btnPause') === '继续', '暂停按钮显示“继续”');
}
await click('btnPause');   // 继续
await sleep(400);
{
    const d3 = await dbg();
    ok(d3.m1phase === 'running' && d3.m1t > 0.8, '继续后时间线恢复推进', JSON.stringify({ t: d3.m1t }));
}
await click('btnPause');   // 先暂停（运行态重置按钮禁用），再重置
await sleep(200);
await click('btnReset');
await sleep(200);
ok((await dbg()).m1phase === 'idle', '重置后回 idle');

console.log('== 10. v1.1 模式二笔画独立与回扫断笔（16.1 / 16.6-1、2）');
await setInput('rSpd', 2);
await click('mBtn2');
await sleep(400);
ok(await read('#btnAuto') === '扫描中', '模式二按钮显示“扫描中”');
{
    let sawRetraceClosed = false, sawForwardPoints = false, maxStrokes = 0, strokesFinal = 0;
    const t0 = Date.now();
    while (Date.now() - t0 < 6800) {
        const d = await dbg();
        if (!d) break;
        maxStrokes = Math.max(maxStrokes, d.strokes);
        if (d.strokes >= 2) strokesFinal = d.strokes;
        if (d.p > 0.905) { if (d.curPts === 0) sawRetraceClosed = true; }
        else if (d.p > 0.05 && d.curPts > 0) sawForwardPoints = true;
        await sleep(70);
    }
    ok(sawRetraceClosed, '回扫阶段当前笔画已关闭');
    ok(sawForwardPoints, '正扫阶段正常写入笔画点');
    ok(maxStrokes <= 2 && strokesFinal >= 2, `波形缓冲始终 ≤2 条独立笔画（峰值 ${maxStrokes}）`);
}
data = await readAll('#dataGrid .data-item');
ok(data.includes('±3.20 cm') && data.includes('±2.00 cm'), '波形包络 Xmax=±3.20 / Ymax=±2.00 cm');
ok(data[data.length - 1].includes('正常波形'), '状态：正常波形');
await shot('osc-shot-mode2.png');

console.log('== 11. 模式二 U1 收缩与滑条可调');
await setInput('rU1', 2000);
await sleep(300);
data = await readAll('#dataGrid .data-item');
ok(data.includes('±1.60 cm') && data.includes('±1.00 cm'), 'U1=2000 → 包络减半');
ok(await ev(`!document.getElementById('rU1').disabled`) === true, '模式二运行中滑条实时可调');

console.log('== 12. v1.1 模式二无效采样段断笔（16.6-8）');
await setInput('rU1', 500);
await setInput('rB', 100);
await sleep(300);
{
    let sawGap = false;
    const t0 = Date.now();
    while (Date.now() - t0 < 4500) {
        const d = await dbg();
        if (d && d.curHasGap) { sawGap = true; break; }
        await sleep(80);
    }
    ok(sawGap, '无效采样段断笔');
}
data = await readAll('#dataGrid .data-item');
ok(data[data.length - 1].includes('双向'), '状态：双向局部缺失', data[data.length - 1]);

console.log('== 13. 右图方向切换（模式二包络空心点）');
await click('dirX');
ok(await ev(`document.getElementById('dirX').getAttribute('aria-pressed') === 'true' && document.getElementById('dirY').getAttribute('aria-pressed') === 'false'`) === true, 'dirX aria-pressed 切换正确');
await click('dirY');

console.log('== 14. v1.2 模式二暂停冻结 + 暂停调参静态预览（18.2 / 18.7-3）');
await click('btnPause');
await sleep(150);
{
    const d1 = await dbg(), c1 = await sceneData();
    await sleep(700);
    const d2 = await dbg(), c2 = await sceneData();
    ok(d1.p === d2.p && d1.beamClock === d2.beamClock && d1.vclock === d2.vclock &&
       d1.curPts === d2.curPts && d1.strokes === d2.strokes,
        'scan-paused 700ms：相位/beamClock/vclock/笔画全部冻结', JSON.stringify({ a: d1, b: d2 }));
    ok(c1 === c2, 'scan-paused 画布完全静止');
    await setInput('rB', 60);   // 暂停中调参
    await sleep(200);
    const d3 = await dbg();
    ok(d3.strokes === 0 && d3.curPts === 0 && d3.Ay === 60, '暂停调参清空旧缓冲（静态预览）', JSON.stringify({ strokes: d3.strokes, Ay: d3.Ay }));
    const c3 = await sceneData();
    await sleep(400);
    ok(c3 === await sceneData(), '暂停调参后画布仍静止（无时间动画）');
}
await click('btnPause');   // 继续
await sleep(400);
{
    const d = await dbg();
    ok(d.m2phase === 'scan-running' && d.curPts > 0, '继续后重新写入新笔画', JSON.stringify({ curPts: d.curPts }));
}
await click('btnReset');
await sleep(200);
{
    const d = await dbg();
    ok(d.speed === 1 && d.Ay === 50 && d.Ax === 80 && d.U1 === 1000, '模式二重置恢复默认（含速度 1×）', JSON.stringify(d));
}

console.log('== 15. 空格/R 快捷键');
await click('btnPause');   // 模式二重置后为 scan-running，先暂停才允许切模式
await sleep(200);
await click('mBtn1');
await ev(`document.activeElement && document.activeElement.blur(); true`);
await sleep(250);
await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'Space', key: ' ', windowsVirtualKeyCode: 32 });
await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Space', key: ' ', windowsVirtualKeyCode: 32 });
await sleep(300);
ok(await read('#btnAuto') === '演示中…', '空格触发自动演示');
await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyR', key: 'r', windowsVirtualKeyCode: 82 });
await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyR', key: 'r', windowsVirtualKeyCode: 82 });
await sleep(300);
ok(await read('#btnAuto') === '▶ 自动演示', 'R 重置回 idle');
{
    const d = await dbg();
    ok(d.speed === 1 && d.Uy === 50 && d.Ux === 0, 'R 重置含速度恢复');
}

console.log('== 16. v1.2 无障碍属性完整性（18.3 / 18.7-4）');
{
    const a = await ev(`(() => {
        const g = id => { const e = document.getElementById(id); return { label: e.getAttribute('aria-label'), pressed: e.getAttribute('aria-pressed'), disabled: e.disabled }; };
        return { btnAuto: g('btnAuto'), btnPause: g('btnPause'), btnReset: g('btnReset'),
                 dirY: g('dirY'), dirX: g('dirX'), mBtn1: g('mBtn1'), mBtn2: g('mBtn2'),
                 rU1: document.getElementById('rU1').getAttribute('aria-valuetext'),
                 rB: document.getElementById('rB').getAttribute('aria-valuetext'),
                 rC: document.getElementById('rC').getAttribute('aria-valuetext'),
                 rSpd: document.getElementById('rSpd').getAttribute('aria-valuetext') };
    })()`);
    ok(a.btnAuto.label && a.btnPause.label && a.btnReset.label, '三个控制按钮均有 aria-label', JSON.stringify(a));
    ok(a.dirY.label && a.dirX.label && a.dirY.pressed === 'true' && a.dirX.pressed === 'false', '方向切换 aria-label + aria-pressed 正确');
    ok(a.mBtn1.label && a.mBtn2.label && a.mBtn1.pressed === 'true' && a.mBtn2.pressed === 'false', '模式切换 aria-label + aria-pressed 正确');
    ok(a.rU1 && a.rU1.includes('伏') && a.rB && a.rB.includes('伏') && a.rSpd && a.rSpd.includes('倍'), '滑条 aria-valuetext 带单位', JSON.stringify({ rU1: a.rU1, rB: a.rB, rSpd: a.rSpd }));
}

console.log('== 17. 窄屏 375px + 过渡提示可辨识（18.4 / 18.7-5）');
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
await sleep(800);
ok(await ev(`document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1`) === true, '375px 无横向溢出');
await click('btnAuto');
{
    let d = null;
    try { d = await waitForDbg(x => x.m1phase === 'running' && x.m1t >= 3.2 && x.m1t < 3.45, 9000, '窄屏过渡窗口'); } catch (e) { }
    ok(!!d, '窄屏捕获过渡窗口');
    await shot('osc-shot-narrow-transition.png');   // 人工复核“· 参数过渡”可见
    const de = await waitForDbg(x => x.m1phase === 'ended', 14000, '窄屏演示结束');
    ok(de.U1 === 1000 && de.Uy === 50, '窄屏演示结束回默认');
}
await shot('osc-shot-narrow.png');
await cdp.send('Emulation.clearDeviceMetricsOverride');
await sleep(400);

console.log('== 18. 全程控制台错误复查（18.7-8）');
ok(cdp.bag.msgs.length === 0, '交互全程无控制台错误', cdp.bag.msgs.slice(0, 3).join(' | '));

cdp.close();
console.log('\n========================================');
console.log(`浏览器验证(v1.2): ${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
