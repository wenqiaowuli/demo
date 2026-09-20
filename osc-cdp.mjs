// CDP 驱动 chrome-headless-shell 验证示波器演示页（v6，覆盖 v2 需求第十三节验证清单）
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
async function closeTab(tab) {
    // 用完即关：泄漏的标签页各自跑 rAF 循环，会拖慢后续运行的渲染帧率
    try { await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/close/${tab.id}`); } catch { /* 忽略 */ }
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
const setSel = (id, v) => ev(`(()=>{const el=document.getElementById('${id}');el.value='${v}';el.dispatchEvent(new Event('change'));return true;})()`);
const click = (id) => ev(`document.getElementById('${id}').click(); true`);
const clickSeg = (seg, t) => ev(`document.querySelector('#${seg} button[data-t="${t}"]').click(); true`);
const canvasData = (id) => ev(`document.getElementById('${id}').toDataURL()`);
// 设计坐标区域探测（tube 560×360 / scope 400×360 均为设计变换画布）
const designProbe = (id, dw, x0, y0, w, h, judgeExpr) => ev(`(() => {
    const c = document.getElementById('${id}');
    const ctx = c.getContext('2d');
    const s = c.width / ${dw};
    for (let y = Math.round(${y0} * s); y < Math.round((${y0} + ${h}) * s); y += 2) {
        for (let x = Math.round(${x0} * s); x < Math.round((${x0} + ${w}) * s); x += 2) {
            const d = ctx.getImageData(x, y, 1, 1).data;
            const a = d[3] / 255;
            const rgb = [0, 1, 2].map(i => Math.round(d[i] * a + 255 * (1 - a)));
            if (${judgeExpr}) return true;
        }
    }
    return false;
})()`);
// 图表画布（无设计变换，DPR=1）整体探测
const chartHas = (id, judgeExpr) => ev(`(() => {
    const c = document.getElementById('${id}');
    const ctx = c.getContext('2d');
    for (let y = 0; y < c.height; y += 2) for (let x = 0; x < c.width; x += 2) {
        const d = ctx.getImageData(x, y, 1, 1).data;
        const a = d[3] / 255;
        const rgb = [0, 1, 2].map(i => Math.round(d[i] * a + 255 * (1 - a)));
        if (${judgeExpr}) return true;
    }
    return false;
})()`);
const GREEN = 'rgb[1] > 130 && rgb[0] < 120 && rgb[2] < 150';
const RED = 'rgb[0] > 150 && rgb[1] < 110 && rgb[2] < 110';
const INK = 'rgb[0] < 110 && rgb[1] < 110 && rgb[2] < 110';
const BLUE = 'rgb[2] > 150 && rgb[0] < 120 && rgb[1] < 160';

console.log('== 1. 加载页面（v2 布局与默认组合）');
await cdp.send('Page.navigate', { url: PAGE_URL });
await sleep(1800);
ok(cdp.bag.msgs.length === 0, '页面加载/运行无控制台错误', cdp.bag.msgs.slice(0, 3).join(' | '));
ok(await ev('document.title') === '示波器演示｜高中物理', '页面标题正确');
ok(!!(await dbg()), 'getOscDebug 验证钩子可用');
{
    const d = await dbg();
    ok(d.phase === 'running', '加载即运行（连续波形）', d.phase);
    ok(d.uxType === 'saw' && d.uyType === 'sine', '默认组合：水平=锯齿、竖直=正弦', d.uxType + '/' + d.uyType);
    ok(d.U1 === 1000 && d.uxA === 80 && d.uyA === 50, '默认参数 U1=1000、A=80/50');
    ok(await read('#btnStart') === '运行中…' && await ev(`document.getElementById('btnStart').disabled`) === true, '运行中开始按钮禁用"运行中…"');
}
{
    const five = await ev(`(() => {
        const ids = ['tubeCanvas','scopeCanvas','chartX','chartY'];
        const okOrder = [];
        let y = -1;
        for (const id of ids) {
            const cy = document.getElementById(id).getBoundingClientRect().top;
            okOrder.push(cy >= y - 1); y = cy;
        }
        const dataTop = document.querySelector('.data-group').getBoundingClientRect().top;
        const paramTop = document.querySelector('.control-panel').getBoundingClientRect().top;
        const deriveTop = document.querySelector('.formula-card').getBoundingClientRect().top;
        const barTop = document.querySelector('.play-bar').getBoundingClientRect().top;
        return { okOrder, dataTop, paramTop, deriveTop, barTop,
                 chartsTop: document.getElementById('chartX').getBoundingClientRect().top };
    })()`);
    ok(five.okOrder.every(Boolean), '画布自上而下：原理图→荧光屏→Ux图→Uy图', JSON.stringify(five.okOrder));
    ok(five.barTop > five.chartsTop, '按钮条在第二排两图下方');
    ok(five.dataTop < five.paramTop && five.paramTop < five.deriveTop, '实时数值 → 参数设定 → 推导与判断 顺序正确');
    ok(await ev(`document.querySelectorAll('#dataGrid .data-item').length`) >= 9, '实时数值整行分列（≥9 个字段）');
}

console.log('== 2. 默认组合（锯齿×正弦）动态波形');
{
    // 无头环境 rAF 启动/节流有波动 → 轮询等待时间推进与轨迹累积
    let d = null;
    const t0 = Date.now();
    while (Date.now() - t0 < 8000) {
        const cur = await dbg();
        if (cur.t > 0.3 && cur.pts > 20) { d = cur; break; }
        await sleep(200);
    }
    ok(!!d, '时间推进、屏上轨迹累积', JSON.stringify({ t: d?.t, pts: d?.pts }));
    ok(await designProbe('scopeCanvas', 400, 74, 80, 240, 240, GREEN), '荧光屏出现荧光绿波形');
    ok(await chartHas('chartX', INK), 'Ux–t 图有锯齿实线');
    ok(await chartHas('chartX', RED), 'Ux–t 图有回扫红色虚线');
    ok(await chartHas('chartY', INK), 'Uy–t 图有正弦实线');
    ok(!await chartHas('chartY', RED), 'Uy–t 图无红色（正弦无削顶/回扫）');
    ok(await chartHas('chartX', BLUE) || await chartHas('chartY', BLUE), '波形图有当前时刻游标');
    // 默认组合（saw80×sine50, U1=1000）无超临界时段 → 成像状态不得误报"削顶"（瞬时回扫除外）
    let sawClip = false;
    const tc = Date.now();
    while (Date.now() - tc < 2500) {
        const sTxt = (await readAll('#dataGrid .data-item')).pop();
        if (sTxt.includes('削顶')) { sawClip = true; break; }
        await sleep(150);
    }
    ok(!sawClip, '默认组合无误报削顶（回扫熄灭不计入削顶）');
}
await shot('osc2-shot-default.png');

console.log('== 3. 暂停冻结（四画布逐字节一致）');
await click('btnPause');
await sleep(200);
{
    const d1 = await dbg();
    const c1 = [await canvasData('tubeCanvas'), await canvasData('scopeCanvas'), await canvasData('chartX'), await canvasData('chartY')];
    await sleep(700);
    const d2 = await dbg();
    const c2 = [await canvasData('tubeCanvas'), await canvasData('scopeCanvas'), await canvasData('chartX'), await canvasData('chartY')];
    ok(d1.t === d2.t, '暂停 700ms：t 冻结');
    ok(c1.every((v, i) => v === c2[i]), '四画布逐字节一致（含静态原理图）');
    ok(await read('#btnPause') === '继续' && await read('#btnStart') === '重新开始', '暂停后：暂停→继续、开始→重新开始');
    ok(await ev(`!document.getElementById('btnStart').disabled && !document.getElementById('btnReset').disabled`) === true, '暂停态开始/重置可用');
}
console.log('== 4. 继续');
await click('btnPause');
await sleep(400);
{
    const d = await dbg();
    ok(d.phase === 'running' && d.t > 0.2, '继续后时间推进', JSON.stringify({ phase: d.phase, t: d.t }));
}

console.log('== 5. 四种波形切换（水平×竖直组合遍历）');
{
    const types = ['saw', 'sine', 'square', 'dc'];
    let allSwitch = true;
    for (const ty of types) { await clickSeg('segY', ty); await sleep(60); if ((await dbg()).uyType !== ty) allSwitch = false; }
    for (const tx of types) { await clickSeg('segX', tx); await sleep(60); if ((await dbg()).uxType !== tx) allSwitch = false; }
    ok(allSwitch, '水平/竖直波形类型 4×4 全部可切换');
    // 恢复非 dc 组合再验证代表性合成
    await clickSeg('segX', 'dc'); await clickSeg('segY', 'sine');
    await setInput('rX', 0);
    await sleep(600);
    const d = await dbg();
    ok(d.uxType === 'dc' && d.uyType === 'sine' && d.speed === 1, '组合 直流×正弦 生效', JSON.stringify({ x: d.uxType, y: d.uyType }));
    ok(await designProbe('scopeCanvas', 400, 174, 80, 52, 240, GREEN), '直流×正弦 → 屏上竖直直线（中线附近绿）');
    // 直流×直流 → 静止亮点
    await clickSeg('segY', 'dc');
    await setInput('rY', 40);
    await sleep(500);
    ok(await designProbe('scopeCanvas', 400, 188, 158, 24, 24, GREEN), '直流×直流(+40V) → 屏上静止亮点（Y=+1.6cm）');
    const label = await read('#lY');
    ok(label.includes('直流'), '直线形时滑条标签切换为直流 U₀', label);
    // 方波×方波 → 矩形
    await clickSeg('segX', 'square'); await clickSeg('segY', 'square');
    await setInput('rX', 60); await setInput('rY', 60);
    await sleep(900);
    ok(await designProbe('scopeCanvas', 400, 120, 110, 160, 160, GREEN), '方波×方波 → 屏上矩形轨迹');
    // 正弦×正弦 → 李萨如椭圆
    await clickSeg('segX', 'sine'); await clickSeg('segY', 'sine');
    await sleep(900);
    ok(await designProbe('scopeCanvas', 400, 120, 110, 160, 160, GREEN), '正弦×正弦 → 屏上李萨如椭圆');
    // 组合切换清屏：切换波形类型后旧轨迹立即清除、重新积累
    await clickSeg('segX', 'saw');
    await sleep(150);
    const dClear = await dbg();
    ok(dClear.pts < 20, '切换组合后荧光屏旧轨迹清除', dClear.pts);
    await sleep(800);
    ok((await dbg()).pts > dClear.pts, '清除后新波形重新积累');
}
await shot('osc2-shot-combo.png');

console.log('== 6. 直流电压可调（−100~+100 V）');
{
    await clickSeg('segX', 'dc');
    await setInput('rX', -60);
    await sleep(400);
    ok(await read('#vX') === '−60 V', '水平直流 −60 V 显示', await read('#vX'));
    const mn = await ev(`+document.getElementById('rX').min`);
    ok(mn === -100, '直流模式滑条下限 −100', mn);
    ok((await read('#lX')).includes('直流'), '标签为"水平直流 U₀"');
    ok((await dbg()).uxDC === -60, 'dbg 直流值同步');
    await setInput('rX', 0);
}

console.log('== 7. 逐时刻打极板（削顶/截断 + 状态文字）');
await clickSeg('segX', 'saw');
await clickSeg('segY', 'sine');
await setInput('rU1', 500);
await setInput('rY', 80);
await sleep(800);
{
    const stTxt = (await readAll('#dataGrid .data-item')).pop();
    ok(stTxt.includes('YY′'), '状态文字带撇：' + stTxt, stTxt);
    ok(stTxt.includes('削顶') || stTxt.includes('打在'), '削顶/打极板判定生效', stTxt);
    ok(await chartHas('chartY', RED), 'Uy–t 图超临界段红色虚线');
    const ds = await read('#deriveStatus');
    ok(ds.includes('当前组合'), '推导与判断区有动态组合说明', ds.slice(0, 40));
    // 双向：方波 80 × 正弦 80，U1=500；逐时刻口径下"同时打在"出现在正弦峰值时段，轮询捕获
    await clickSeg('segX', 'square');
    await setInput('rX', 80);
    let st2 = '', sawBoth = false;
    const t0b = Date.now();
    while (Date.now() - t0b < 8000) {
        st2 = (await readAll('#dataGrid .data-item')).pop();
        if (st2.includes('同时打在')) { sawBoth = true; break; }
        await sleep(120);
    }
    ok(sawBoth, '双向超临界 → "同时打在"口径（轮询至正弦峰值时段）', st2);
    await setInput('rU1', 1000);
    await setInput('rX', 80);
    await sleep(400);
}
await shot('osc2-shot-clip.png');

console.log('== 8. 播放速度（0.5~4×）');
{
    // 无头环境 rAF 节流且帧率随时间波动 → 以相邻同时长窗口的推进量比值校验速度生效
    await setSel('speed', '1');
    await sleep(100);
    const s0 = await dbg();
    await sleep(600);
    const s1 = await dbg();
    const a1 = s1.t - s0.t;
    await setSel('speed', '4');
    await sleep(100);
    const d0 = await dbg();
    await sleep(600);
    const d1 = await dbg();
    const a4 = d1.t - d0.t;
    ok(d0.speed === 4 && a4 > a1 * 2, '4× 明显快于 1×（推进 ≥2 倍）', JSON.stringify({ a1: a1.toFixed(2), a4: a4.toFixed(2) }));
    await setSel('speed', '0.5');
    await sleep(100);
    const w0 = await dbg();
    await sleep(600);
    const w1 = await dbg();
    const a05 = w1.t - w0.t;
    ok(w0.speed === 0.5 && a05 < a1 * 0.75, '0.5× 明显慢于 1×（推进 <0.75 倍）', JSON.stringify({ a1: a1.toFixed(2), a05: a05.toFixed(2) }));
    await setSel('speed', '1');
}

console.log('== 9. 重置恢复默认');
await click('btnPause');
await sleep(150);
await click('btnReset');
await sleep(300);
{
    const d = await dbg();
    ok(d.phase === 'running' && d.t < 0.5, '重置后回运行态、t≈0', JSON.stringify({ phase: d.phase, t: d.t }));
    ok(d.uxType === 'saw' && d.uyType === 'sine' && d.uxA === 80 && d.uyA === 50 && d.U1 === 1000, '重置恢复默认组合与参数');
    ok(await ev(`document.getElementById('speed').value`) === '1', '速度下拉恢复 1×');
}

console.log('== 10. 空格/R 快捷键');
await ev(`document.activeElement && document.activeElement.blur(); true`);
await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'Space', key: ' ', windowsVirtualKeyCode: 32 });
await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Space', key: ' ', windowsVirtualKeyCode: 32 });
await sleep(200);
ok((await dbg()).phase === 'paused' && await read('#btnPause') === '继续', '空格暂停');
await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'Space', key: ' ', windowsVirtualKeyCode: 32 });
await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Space', key: ' ', windowsVirtualKeyCode: 32 });
await sleep(200);
ok((await dbg()).phase === 'running', '空格继续');
await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'Space', key: ' ', windowsVirtualKeyCode: 32 });
await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Space', key: ' ', windowsVirtualKeyCode: 32 });
await sleep(150);
await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyR', key: 'r', windowsVirtualKeyCode: 82 });
await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyR', key: 'r', windowsVirtualKeyCode: 82 });
await sleep(300);
{
    const d = await dbg();
    ok(d.phase === 'running' && d.t < 0.5 && d.uxType === 'saw' && d.uyType === 'sine', '暂停态 R 重置回默认并运行', JSON.stringify(d));
}

console.log('== 11. 无障碍属性');
{
    const a = await ev(`(() => {
        const g = id => { const e = document.getElementById(id); return { label: e.getAttribute('aria-label'), disabled: e.disabled }; };
        const segBtns = [...document.querySelectorAll('#segX button, #segY button')].map(b => b.getAttribute('aria-pressed'));
        return { btnStart: g('btnStart'), btnPause: g('btnPause'), btnReset: g('btnReset'),
                 rX: document.getElementById('rX').getAttribute('aria-valuetext'),
                 rY: document.getElementById('rY').getAttribute('aria-valuetext'),
                 rU1: document.getElementById('rU1').getAttribute('aria-valuetext'),
                 speed: document.getElementById('speed').getAttribute('aria-label'),
                 segPressed: segBtns, segActive: document.querySelectorAll('#segX button.active, #segY button.active').length };
    })()`);
    ok(a.btnStart.label && a.btnPause.label && a.btnReset.label, '三个按钮均有 aria-label');
    ok(a.rX && a.rX.includes('伏') && a.rU1 && a.rU1.includes('伏'), '滑条 aria-valuetext 带单位', JSON.stringify({ rX: a.rX, rU1: a.rU1 }));
    ok(!!a.speed, '速度下拉有 aria-label');
    ok(a.segPressed.length === 8 && a.segPressed.every(v => v === 'true' || v === 'false'), '8 个波形按钮均有 aria-pressed');
    ok(a.segActive === 2, '每组恰一个激活波形按钮');
}

console.log('== 12. 静态原理图无动画（运行中逐字节一致）');
{
    const c1 = await canvasData('tubeCanvas');
    await sleep(700);
    const c2 = await canvasData('tubeCanvas');
    ok(c1 === c2, '原理图 700ms 逐字节一致（无动画）');
    // 数值标注仅刷新数字：暂停态改 U1 → 原理图像素变化（仅数值区）
    await click('btnPause');
    await sleep(150);
    const t1 = await canvasData('tubeCanvas');
    await setInput('rU1', 1500);
    await sleep(300);
    const t2 = await canvasData('tubeCanvas');
    ok(t1 !== t2, '静态图 U1 数值标注随参数刷新（无动画，仅数字变）');
    await setInput('rU1', 1000);
    await click('btnPause');
    ok(await designProbe('tubeCanvas', 560, 232, 124, 58, 104, 'rgb[2] > 180 && rgb[0] < 180 && rgb[1] < 150'), '原理图含 XX′ 竖直极板（紫色竖直平行四边形）');
    ok(await designProbe('tubeCanvas', 560, 150, 140, 60, 70, 'rgb[0] > 180 && rgb[1] < 170 && rgb[2] < 130'), '原理图含 YY′ 水平极板（橙）');
    ok(await designProbe('tubeCanvas', 560, 40, 260, 90, 70, INK), '原理图含电源符号与导线');
}

console.log('== 13. 窄屏 375px');
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
await sleep(800);
{
    ok(await ev(`document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1`) === true, '375px 无横向溢出');
    const cols = await ev(`getComputedStyle(document.querySelector('.top-row')).gridTemplateColumns.split(' ').length`);
    ok(cols === 1, '窄屏第 1 排上下堆叠', cols);
    const cols2 = await ev(`getComputedStyle(document.querySelector('.charts-row')).gridTemplateColumns.split(' ').length`);
    ok(cols2 === 1, '窄屏第 2 排上下堆叠', cols2);
    const dataCols = await ev(`getComputedStyle(document.querySelector('#dataGrid')).gridTemplateColumns.split(' ').length`);
    ok(dataCols === 2, '窄屏实时数值 2 列', dataCols);
}
await shot('osc2-shot-narrow.png');
await cdp.send('Emulation.clearDeviceMetricsOverride');
await sleep(400);

console.log('== 13b. 满窗口截图（4× 加速积累轨迹后暂停）');
{
    await setSel('speed', '4');
    let dFull = null;
    const tf = Date.now();
    while (Date.now() - tf < 25000) {
        const d = await dbg();
        if (d.t >= 10.5 && d.pts >= 400) { dFull = d; break; }
        await sleep(300);
    }
    await setSel('speed', '1');
    await click('btnPause');
    await sleep(200);
    const d = await dbg();
    ok(!!dFull && d.phase === 'paused', '满窗口积累完成（t≥10.5s、暂停冻结）', JSON.stringify({ t: d.t, pts: d.pts }));
    await shot('osc2-shot-full.png');
    await click('btnPause');
}

console.log('== 14. 全程控制台错误复查');
ok(cdp.bag.msgs.length === 0, '交互全程无控制台错误', cdp.bag.msgs.slice(0, 3).join(' | '));

await closeTab(tab);
cdp.close();
console.log('\n========================================');
console.log(`浏览器验证(v2): ${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
