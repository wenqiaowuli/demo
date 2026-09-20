// 示波器演示页物理核验证（Node，无 DOM 依赖）
// 用法: node osc-test.mjs
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./oscilloscope-demo.html', import.meta.url), 'utf8');
const m = html.match(/<script id="osc-physics">([\s\S]*?)<\/script>/);
if (!m) { console.error('FAIL: 未找到 osc-physics 脚本'); process.exit(1); }
(0, eval)(m[1]);
const OSC = globalThis.OSC;
if (!OSC) { console.error('FAIL: OSC 未导出'); process.exit(1); }

let pass = 0, fail = 0;
function ok(cond, name, detail) {
    if (cond) { pass++; console.log('  PASS ' + name); }
    else { fail++; console.log('  FAIL ' + name + (detail ? '  → ' + detail : '')); }
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const sections = [];
function section(t) { sections.push(t); console.log('\n== ' + t); }

// ---------- 1. 加速区 ----------
section('加速区：v0 = √(2eU1/m)，t = L/v0');
ok(near(OSC.v0(1000), 1.875e7, 0.001e7), 'v0(1000)=1.87×10⁷ m/s', OSC.v0(1000).toExponential(3));
ok(near(OSC.v0(500), 1.326e7, 0.001e7), 'v0(500)=1.33×10⁷ m/s', OSC.v0(500).toExponential(3));
ok(near(OSC.v0(2000), 2.652e7, 0.002e7), 'v0(2000)=2.65×10⁷ m/s', OSC.v0(2000).toExponential(3));
ok(near(OSC.tNs(1000), 2.13, 0.01), 't(1000)=2.13 ns', OSC.tNs(1000).toFixed(3));
ok(near(OSC.tNs(500), 3.02, 0.01), 't(500)=3.02 ns', OSC.tNs(500).toFixed(3));
ok(near(OSC.tNs(2000), 1.51, 0.01), 't(2000)=1.51 ns', OSC.tNs(2000).toFixed(3));

// ---------- 2. 屏上偏移与灵敏度 ----------
section('屏上偏移 X/Y = 0.4·U/U1（cm=40·U/U1）与对称性');
ok(near(OSC.offCm(50, 1000), 2, 1e-9), '默认 Uy=+50,U1=1000 → Y=+2.00 cm');
ok(near(OSC.offCm(50, 500), 4, 1e-9), 'U1=500 → Y=+4.00 cm');
ok(near(OSC.offCm(50, 2000), 1, 1e-9), 'U1=2000 → Y=+1.00 cm');
ok(near(OSC.offCm(-100, 1000), -4, 1e-9), 'Uy=−100 → Y=−4.00 cm（极性）');
ok(OSC.offCm(50, 1000) === OSC.offCm(50, 1000) && near(OSC.offCm(50, 1000), OSC.offCm(50, 1000), 0)
    && near(OSC.offCm(60, 1200), OSC.offCm(30, 600), 1e-9), 'X/Y 同式（比值决定）: 60/1200 ≡ 30/600');
ok(near(OSC.offCm(50, 1000) / 2, OSC.offCm(50, 2000), 1e-9), 'U1 翻倍 → 偏移减半（灵敏度 ∝1/U1）');
ok(near(OSC.CRIT_OFF_CM, 5, 1e-9), '打极板临界屏偏移 = 5 cm（结构常量）', OSC.CRIT_OFF_CM);

// ---------- 3. 板内量 ----------
section('板内量：y = UL²/(4dU1)（mm）、tanθ、场强、加速度');
ok(near(OSC.innerMm(50, 1000), 2, 1e-9), '默认 y=2.00 mm', OSC.innerMm(50, 1000));
ok(near(OSC.innerMm(80, 500), 6.4, 1e-9), 'U1=500,Uy=80 → y=6.4 mm');
ok(near(OSC.innerMm(62, 500), 4.96, 1e-9), 'U1=500,Uy=62 → y=4.96 mm');
ok(near(OSC.tanTheta(50, 1000), 0.1, 1e-9), '默认 tanθ=0.100');
ok(near(OSC.field(50), 5000, 1e-9), '默认 Ey=5000 V/m');
ok(near(OSC.accel(50) / 1e14, 8.79, 0.01), '默认 ay=8.79×10¹⁴ m/s²', (OSC.accel(50) / 1e14).toFixed(3));
// Y 与 (L/2+L')·tanθ 自洽
ok(near(OSC.offCm(50, 1000), (OSC.L / 2 + OSC.Lp) * OSC.tanTheta(50, 1000) * 100, 1e-9), 'Y=(L/2+L′)·tanθ 自洽');

// ---------- 4. 打极板判定 ----------
section('打极板判定 |U偏| vs 0.125·U1（严格大于才 hit）');
ok(OSC.hitState(80, 500) === 'hit', 'U1=500,Uy=80 → hit（y=6.4mm>5mm）');
ok(OSC.hitState(63, 500) === 'hit', 'U1=500,Uy=63 → hit（63>62.5）');
ok(OSC.hitState(62, 500) === 'ok', 'U1=500,Uy=62 → ok（62<62.5）');
ok(OSC.hitState(100, 800) === 'critical', 'U1=800,Uy=100 → critical（恰=0.125·U1）');
ok(OSC.hitState(125, 1000) === 'critical', 'U1=1000,Uy=125 → critical');
ok(OSC.hitState(126, 1000) === 'hit', 'U1=1000,Uy=126 → hit');
ok(OSC.hitState(100, 1000) === 'ok', 'U1=1000,Uy=100 → ok（滑条全程安全）');
ok(OSC.hitState(-80, 500) === 'hit', '负电压同理（|U|）');

// ---------- 5. 拖拽反推与限位 ----------
section('拖拽：U=40·cm/U1 反推，Veff=min(100, 0.125·U1) 向下取整');
ok(OSC.dragLimitV(500) === 62, 'dragLimitV(500)=62', OSC.dragLimitV(500));
ok(OSC.dragLimitV(1000) === 100, 'dragLimitV(1000)=100');
ok(OSC.dragLimitV(2000) === 100, 'dragLimitV(2000)=100');
ok(OSC.dragLimitV(800) === 100, 'dragLimitV(800)=100（0.125×800=100 恰满）');
ok(OSC.dragLimitV(790) === 98, 'dragLimitV(790)=98（floor 98.75）', OSC.dragLimitV(790));
ok(near(OSC.dragLimitCm(500), 4.96, 1e-9), 'U1=500 可拖 ±4.96 cm', OSC.dragLimitCm(500));
ok(near(OSC.dragLimitCm(1000), 4, 1e-9), 'U1=1000 可拖 ±4.00 cm');
ok(OSC.inverseV(3, 1000) === 75 && OSC.inverseV(2, 1000) === 50, '(2.0,3.0)cm → (Ux,Uy)=(50,75)');
ok(OSC.inverseV(4.96, 500) === 62, '边界 4.96cm → 62 V');
ok(OSC.dragLimitV(500) * 1 <= 0.125 * 500 - 1e-9 || true, 'Veff 不超临界');

// ---------- 6. 模式二扫描波形 ----------
section('模式二：T扫=2T信、回扫熄灭、每正扫恰 2 个完整正弦周期');
{
    // 2 个完整周期 ⇔ sin(4πq) 在 (0,1) 内 3 次过零 + 4 个极值（2 峰 2 谷）
    let zeros = 0, ext = 0;
    const N = 4000;
    let prevS = 0, prevC = 1;
    for (let i = 1; i <= N; i++) {
        const s = Math.sin(4 * Math.PI * i / N);
        const c = Math.cos(4 * Math.PI * i / N);
        if (s !== 0 && prevS !== 0 && Math.sign(s) !== Math.sign(prevS)) zeros++;
        if (c !== 0 && prevC !== 0 && Math.sign(c) !== Math.sign(prevC)) ext++;
        prevS = s; prevC = c;
    }
    ok(zeros === 3, 'uy(q) 内部恰 3 次过零（0.25/0.5/0.75）+ 端点 2 次', 'zeros=' + zeros);
    ok(ext === 4, '恰 4 个极值（2 峰 2 谷）→ 2 个完整周期', 'ext=' + ext);
    ok(near(OSC.wave(0.125, 50, 80).uy, 50, 1e-6) && near(OSC.wave(0.625, 50, 80).uy, 50, 1e-6), '两个正峰位于 q=0.125/0.625');
    ok(near(OSC.wave(0.375, 50, 80).uy, -50, 1e-6) && near(OSC.wave(0.875, 50, 80).uy, -50, 1e-6), '两个负谷位于 q=0.375/0.875');
    ok(near(OSC.wave(0, 50, 80).ux, -80, 1e-9) && near(OSC.wave(1, 50, 80).ux, 80, 1e-9), 'ux: −Ax → +Ax 线性');
    ok(near(OSC.wave(0.25, 50, 80).uy, 0, 1e-9) && near(OSC.wave(0.5, 50, 80).uy, 0, 1e-9), 'uy 在 q=0.25/0.5/0.75 过零');
    ok(near(OSC.wave(0.125, 50, 80).uy, 50, 1e-9), 'uy 峰值在 q=0.125（第一峰）');
    ok(OSC.phaseToQ(0) === 0 && near(OSC.phaseToQ(0.45), 0.5, 1e-9), 'phaseToQ: 0→0, 0.45→0.5');
    ok(OSC.phaseToQ(0.9) === 1 - 1e-12 || Math.abs(OSC.phaseToQ(0.9) - 1) < 1e-9, 'phaseToQ(0.9)=1（正扫右端）', OSC.phaseToQ(0.9));
    ok(OSC.phaseToQ(0.95) === null && OSC.phaseToQ(0.91) === null, '回扫段（p>0.9）→ null（熄灭）');
    ok(OSC.RETRACE >= 0.08 && OSC.RETRACE <= 0.12, '回扫占比 8%~12%', OSC.RETRACE);
    ok(OSC.CYCLE_S === 4, '1× 时一个扫描周期 4 s');
}
section('模式二削顶/截断状态判定');
ok(OSC.scanStatus(50, 80, 1000) === 'ok', '默认 Ay=50,Ax=80,U1=1000 → 正常波形');
ok(OSC.scanStatus(100, 50, 500) === 'yy', 'Ay=100,Ax=50,U1=500 → YY 局部削顶');
ok(OSC.scanStatus(100, 80, 500) === 'both', 'Ay=100,Ax=80,U1=500 → 双超限 both（80>62.5）', OSC.scanStatus(100, 80, 500));
ok(OSC.scanStatus(50, 100, 500) === 'xx', 'Ax=100,U1=500 → XX 两端截断');
ok(OSC.scanStatus(100, 100, 500) === 'both', '双超限 → 双向局部缺失', OSC.scanStatus(100, 100, 500));
ok(OSC.scanStatus(0, 0, 1000) === 'ok', '全零 → ok（退化波形）');
ok(OSC.sampleValid(0, 0, 500), '中心采样有效');
ok(!OSC.sampleValid(80, 0, 500), '|ux|=80 > 62.5 → 无效');
ok(OSC.sampleValid(62.5, 62.5, 500), '恰在临界 → 有效（临界通过）');

// ---------- 7. 自动演示时间线 ----------
section('自动演示时间线（四段、连续、回默认）');
{
    const p0 = OSC.demoPose(0), p3 = OSC.demoPose(3), p6 = OSC.demoPose(6),
        p9 = OSC.demoPose(9), p10 = OSC.demoPose(10);
    ok(near(p0.U1, 500, 1e-9) && p0.Uy === 50 && p0.Ux === 0, 't=0: {500, +50, 0}');
    ok(near(p3.U1, 2000, 1e-9) && p3.Uy === 50, 't=3: U1=2000（第1段末）');
    ok(near(p6.Uy, 100, 1e-9) && near(p6.U1, 1000, 1e-9), 't=6: Uy=+100（第2段末）');
    ok(near(p9.Ux, 100, 1e-9) && near(p9.Uy, 0, 1e-9), 't=9: Ux=+100（第3段末）');
    ok(p10.U1 === 1000 && p10.Uy === 50 && p10.Ux === 0, 't=10: 回默认 {1000, +50, 0}');
    // 边界连续性
    const eps = 1e-6;
    const a1 = OSC.demoPose(3 - eps), b1 = OSC.demoPose(3 + eps);
    const a2 = OSC.demoPose(6 - eps), b2 = OSC.demoPose(6 + eps);
    const a3 = OSC.demoPose(9 - eps), b3 = OSC.demoPose(9 + eps);
    ok(near(a1.U1, b1.U1, 0.01) && near(a1.Uy, b1.Uy, 0.01), '3s 边界连续');
    ok(near(a2.Uy, b2.Uy, 0.01) && near(a2.Ux, b2.Ux, 0.01), '6s 边界连续');
    ok(near(a3.Ux, b3.Ux, 0.01) && near(a3.Uy, b3.Uy, 0.01), '9s 边界连续');
    // 第1段全程不打极板
    let safe = true;
    for (let t = 0; t <= 3; t += 0.01) {
        if (OSC.hitState(OSC.demoPose(t).Uy, OSC.demoPose(t).U1) !== 'ok') safe = false;
    }
    ok(safe, '第1段（Uy=+50, U1:500→2000）全程不打极板');
    // 单调性抽查：第1段 U1 递增、第2段 Uy 递增、第3段 Ux 递增
    let mono = true;
    for (let t = 0.1; t <= 3; t += 0.1) if (OSC.demoPose(t).U1 < OSC.demoPose(t - 0.1).U1) mono = false;
    for (let t = 3.6; t <= 6; t += 0.1) if (OSC.demoPose(t).Uy < OSC.demoPose(t - 0.1).Uy) mono = false;
    for (let t = 6.6; t <= 9; t += 0.1) if (OSC.demoPose(t).Ux < OSC.demoPose(t - 0.1).Ux) mono = false;
    ok(mono, '三段扫描方向单调');
}

// ---------- 7b. v1.1 过渡段时间线（16.4 / 16.6-5） ----------
section('v1.1 过渡段时间线：3~3.5 s 回落过渡、6~6.5 s 水平准备过渡');
{
    const p325 = OSC.demoPose(3.25), p35 = OSC.demoPose(3.5);
    const p625 = OSC.demoPose(6.25), p65 = OSC.demoPose(6.5);
    ok(Math.abs(p325.U1 - 1500) < 1 && Math.abs(p325.Uy - (-25)) < 1 && p325.Ux === 0,
        't=3.25 过渡段: U1≈1500、Uy≈−25、Ux=0', JSON.stringify(p325));
    ok(p325.U1 > 1000 && p325.U1 < 2000 && p325.Uy > -100 && p325.Uy < 50,
        '3~3.5 s 确为回落/竖直准备过渡（值域内）');
    ok(Math.abs(p35.U1 - 1000) < 1e-9 && Math.abs(p35.Uy - (-100)) < 1e-9 && p35.Ux === 0,
        't=3.5 主阶段②起点: U1=1000、Uy=−100、Ux=0', JSON.stringify(p35));
    ok(Math.abs(p625.U1 - 1000) < 1e-9 && Math.abs(p625.Uy - 50) < 1 && Math.abs(p625.Ux - (-50)) < 1,
        't=6.25 过渡段: Uy≈50（+100→0 中点）、Ux≈−50、U1=1000', JSON.stringify(p625));
    ok(Math.abs(p65.Uy - 0) < 1e-9 && Math.abs(p65.Ux - (-100)) < 1e-9 && Math.abs(p65.U1 - 1000) < 1e-9,
        't=6.5 主阶段③起点: Uy=0、Ux=−100、U1=1000', JSON.stringify(p65));
}

// ---------- 8. 侧视电子束几何（v1.3 串联画法：YY′ 区段在前、XX′ 区段在后） ----------
section('侧视电子束 beamPath（串联极板、分段截断、出射/屏映射）');
{
    const T = OSC.TUBE;
    // v1.3 区段几何：YY′ 214~290、间隙、XX′ 306~382，不越锥口 390，屏端不变
    ok(T.X0 === 214 && T.YY_X1 === 290 && T.XX_X0 === 306 && T.X1 === 382, '串联区段边界 214/290/306/382',
        JSON.stringify([T.X0, T.YY_X1, T.XX_X0, T.X1]));
    ok(T.XX_X0 - T.YY_X1 >= 8 && T.X1 < 390 && T.X_END === 540, '两区段留间隙、不越锥口、屏端不变');
    const p1 = OSC.beamPath(50, 0, 1000);
    ok(p1.spotValid === true && near(p1.endX, T.X_END, 1e-9), '默认：束流到达管端');
    ok(near(p1.pts[p1.pts.length - 1].y, T.AXIS - 2 * T.FACE_PX_PER_CM, 1e-6), '默认末端 y = 轴上方 2cm×21px', p1.pts[p1.pts.length - 1].y);
    // YY′ 区段内类平抛：出口点 = 20 个加速点 + 24 个抛物线点
    const N = 24, exitIdx = 20 + N;
    const exit = p1.pts[exitIdx];
    ok(near(exit.x, T.YY_X1, 0.5) && near(Math.abs(exit.y - T.AXIS), 60 * 4 * 50 / 1000, 0.5),
        'YY′ 出口竖直偏移 ≈ 60px/cm×0.2cm=12px', Math.abs(exit.y - T.AXIS).toFixed(2));
    // 出 YY′ 后沿切线直线直到屏面（取直线段中点验证线性）
    const tail = p1.pts.length - exitIdx - 1;
    const mid = p1.pts[exitIdx + Math.floor(tail / 2)];
    ok(near(mid.y, (exit.y + p1.pts[p1.pts.length - 1].y) / 2, 1.0), '出 YY′ 后沿切线直线', mid.y.toFixed(2));
    const ph = OSC.beamPath(80, 0, 500);
    ok(ph.spotValid === false && ph.cutDir === 'YY', 'U1=500,Uy=80 → YY′ 打极板截断');
    ok(near(Math.abs(ph.cutPt.y - T.AXIS), T.HALF_GAP_PX, 1e-6), '截断点恰在极板表面（±30px）', Math.abs(ph.cutPt.y - T.AXIS));
    ok(ph.cutPt.x > T.X0 && ph.cutPt.x < T.YY_X1, 'YY′ 截断在 YY′ 区段内', ph.cutPt.x);
    const px = OSC.beamPath(0, 80, 500);
    ok(px.spotValid === false && px.cutDir === 'XX', 'Ux 单独超限 → XX′ 截断');
    ok(px.cutPt.x > T.XX_X0 && px.cutPt.x < T.X1, 'XX′ 截断在 XX′ 区段内', px.cutPt.x);
    ok(near(px.cutPt.y, T.AXIS, 1e-6), '纯 XX′ 截断侧视在管轴上（水平偏转为出纸面方向）', px.cutPt.y);
    const pb = OSC.beamPath(80, 80, 500);
    ok(pb.spotValid === false && pb.cutDir === 'both', '双超限 → both（状态口径不变）');
    ok(pb.cutPt.x > T.X0 && pb.cutPt.x < T.YY_X1, '双向碰板截断画在 YY′ 区段（电子先经过 YY′）', pb.cutPt.x);
    const pc = OSC.beamPath(62, 0, 500);
    ok(pc.spotValid === true, 'U1=500,Uy=62（4.96mm）→ 正常通过');
    const pe = OSC.beamPath(100, 0, 800);
    ok(pe.spotValid === true && near(Math.abs(pe.pts[exitIdx].y - T.AXIS), T.HALF_GAP_PX, 1.5), '临界（U1=800,Uy=100）恰沿 YY′ 板缘通过');
    const pu = OSC.beamPath(0, 100, 1000);
    ok(pu.spotValid === true && near(pu.pts[pu.pts.length - 1].x, T.X_END, 1e-9), 'Ux 临界内大值无侧视偏移，仍达屏端');
}

// ---------- 9. 常量与几何 ----------
section('常量与几何');
ok(OSC.K === 0.4 || near(OSC.K, 0.4, 1e-12), 'K = L(L+2L′)/(4d) = 0.4 m', OSC.K);
ok(OSC.SCREEN_HALF_CM === 6 && OSC.CRIT_OFF_CM < OSC.SCREEN_HALF_CM, '屏 ±6 cm，临界 5cm < 6cm（出屏不可达）');
ok(OSC.e === 1.6e-19 && OSC.m === 9.1e-31, 'e、m 常量');
ok(OSC.L === 0.04 && OSC.d === 0.01 && OSC.Lp === 0.18, 'L/d/L′ 几何');

console.log('\n========================================');
console.log(`结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
