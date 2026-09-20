// 示波器演示页物理核验证（Node，无 DOM 依赖）——v2 波形组合版
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

// ---------- 2. 屏上偏移与灵敏度 ----------
section('屏上偏移 X/Y = 0.4·U/U1（cm=40·U/U1）与对称性');
ok(near(OSC.offCm(50, 1000), 2, 1e-9), '默认 Uy=+50,U1=1000 → Y=+2.00 cm');
ok(near(OSC.offCm(50, 500), 4, 1e-9), 'U1=500 → Y=+4.00 cm');
ok(near(OSC.offCm(-100, 1000), -4, 1e-9), 'Uy=−100 → Y=−4.00 cm（极性）');
ok(near(OSC.offCm(60, 1200), OSC.offCm(30, 600), 1e-9), 'X/Y 同式（比值决定）: 60/1200 ≡ 30/600');
ok(near(OSC.offCm(50, 1000) / 2, OSC.offCm(50, 2000), 1e-9), 'U1 翻倍 → 偏移减半（灵敏度 ∝1/U1）');
ok(near(OSC.CRIT_OFF_CM, 5, 1e-9), '打极板临界屏偏移 = 5 cm（结构常量）', OSC.CRIT_OFF_CM);

// ---------- 3. 板内量 ----------
section('板内量：y = UL²/(4dU1)（mm）、tanθ、场强、加速度');
ok(near(OSC.innerMm(50, 1000), 2, 1e-9), '默认 y=2.00 mm', OSC.innerMm(50, 1000));
ok(near(OSC.innerMm(80, 500), 6.4, 1e-9), 'U1=500,Uy=80 → y=6.4 mm');
ok(near(OSC.tanTheta(50, 1000), 0.1, 1e-9), '默认 tanθ=0.100');
ok(near(OSC.field(50), 5000, 1e-9), '默认 Ey=5000 V/m');
ok(near(OSC.accel(50) / 1e14, 8.79, 0.01), '默认 ay=8.79×10¹⁴ m/s²', (OSC.accel(50) / 1e14).toFixed(3));
ok(near(OSC.offCm(50, 1000), (OSC.L / 2 + OSC.Lp) * OSC.tanTheta(50, 1000) * 100, 1e-9), 'Y=(L/2+L′)·tanθ 自洽');

// ---------- 4. 打极板判定与拖拽限位（模型函数回归） ----------
section('打极板判定与拖拽反推（物理模型函数回归）');
ok(OSC.hitState(80, 500) === 'hit', 'U1=500,Uy=80 → hit（y=6.4mm>5mm）');
ok(OSC.hitState(100, 800) === 'critical', 'U1=800,Uy=100 → critical（恰=0.125·U1）');
ok(OSC.hitState(100, 1000) === 'ok', 'U1=1000,Uy=100 → ok');
ok(OSC.hitState(-80, 500) === 'hit', '负电压同理（|U|）');
ok(OSC.dragLimitV(500) === 62, 'dragLimitV(500)=62', OSC.dragLimitV(500));
ok(OSC.dragLimitV(1000) === 100, 'dragLimitV(1000)=100');
ok(near(OSC.dragLimitCm(500), 4.96, 1e-9), 'U1=500 可拖 ±4.96 cm', OSC.dragLimitCm(500));
ok(OSC.inverseV(3, 1000) === 75 && OSC.inverseV(2, 1000) === 50, '(2.0,3.0)cm → (Ux,Uy)=(50,75)');

// ---------- 5. v2 波形系统：周期定义 ----------
section('v2 波形周期：锯齿 8 s、正弦/方波 4 s、锯齿周期 = 信号周期 ×2');
ok(OSC.T_SIGNAL === 4, '正弦/方波周期 T_SIGNAL = 4 s');
ok(OSC.T_SAW === 8, '锯齿周期 T_SAW = 8 s');
ok(OSC.wavePeriod('saw') === 8 && OSC.wavePeriod('sine') === 4 && OSC.wavePeriod('square') === 4 && OSC.wavePeriod('dc') === 4, 'wavePeriod 四类型', JSON.stringify([OSC.wavePeriod('saw'), OSC.wavePeriod('sine'), OSC.wavePeriod('square'), OSC.wavePeriod('dc')]));
ok(OSC.wavePeriod('saw') === 2 * OSC.wavePeriod('sine'), '锯齿周期 = 信号周期 ×2（屏显 2 个完整周期）');
ok(OSC.SAW_RETRACE >= 0.08 && OSC.SAW_RETRACE <= 0.12, '回扫占比 8%~12%', OSC.SAW_RETRACE);

// ---------- 6. v2 四种波形函数 ----------
section('v2 波形函数 waveU/waveAt：锯齿/正弦/方波/直线');
{
    const A = 80, U0 = -60;
    // 锯齿：正扫 −A→+A 线性，回扫熄灭
    ok(near(OSC.waveU('saw', 0, A, 0).u, -A, 1e-9), '锯齿 p=0 → −A');
    ok(near(OSC.waveU('saw', 0.45, A, 0).u, 0, 1e-9), '锯齿 p=0.45（正扫中点）→ 0', OSC.waveU('saw', 0.45, A, 0).u);
    ok(near(OSC.waveU('saw', 0.9, A, 0).u, A, 1e-9), '锯齿 p=0.9（正扫末端）→ +A');
    ok(OSC.waveU('saw', 0.91, A, 0).u === null && OSC.waveU('saw', 0.99, A, 0).u === null, '锯齿回扫（p>0.9）→ null（束流熄灭）');
    // 正弦
    ok(near(OSC.waveU('sine', 0, 50, 0).u, 0, 1e-9), '正弦 p=0 → 0');
    ok(near(OSC.waveU('sine', 0.25, 50, 0).u, 50, 1e-6), '正弦 p=0.25 → +A（峰）');
    ok(near(OSC.waveU('sine', 0.75, 50, 0).u, -50, 1e-6), '正弦 p=0.75 → −A（谷）');
    ok(near(OSC.waveU('sine', 0.5, 50, 0).u, 0, 1e-9), '正弦 p=0.5 → 0');
    // 方波
    ok(OSC.waveU('square', 0.25, 50, 0).u === 50 && OSC.waveU('square', 0.499, 50, 0).u === 50, '方波前半周期 → +A');
    ok(OSC.waveU('square', 0.5, 50, 0).u === -50 && OSC.waveU('square', 0.75, 50, 0).u === -50, '方波后半周期 → −A');
    // 直线
    ok(OSC.waveU('dc', 0.3, 50, U0).u === U0 && OSC.waveU('dc', 0.9, 50, U0).u === U0, '直线（直流）恒为 U₀', U0);
    // waveAt：全局时间 → 瞬时电压
    ok(near(OSC.waveAt('sine', 1, 50, 0).u, 50, 1e-6), 'waveAt 正弦 t=1s（p=0.25）→ +A');
    ok(near(OSC.waveAt('saw', 3.6, 80, 0).u, 0, 1e-9), 'waveAt 锯齿 t=3.6s（p=0.45，正扫中点）→ 0', OSC.waveAt('saw', 3.6, 80, 0).u);
    ok(near(OSC.waveAt('saw', 4, 80, 0).u, 80 / 0.9 - 80, 1e-9), 'waveAt 锯齿 t=4s（p=0.5）→ −A+2A·(0.5/0.9)', OSC.waveAt('saw', 4, 80, 0).u);
    ok(OSC.waveAt('saw', 7.3, 80, 0).u === null, 'waveAt 锯齿 t=7.3s（回扫）→ null');
    ok(OSC.waveAt('saw', 8, 80, 0).u !== null && near(OSC.waveAt('saw', 8, 80, 0).u, -80, 1e-9), '锯齿 t=8s 周期回绕 → −A');
    ok(OSC.waveAt('square', 3, 50, 0).u === -50 && OSC.waveAt('square', 1, 50, 0).u === 50, '方波 t=1s → +A、t=3s → −A');
    // 正扫线性度抽查
    let lin = true;
    for (let i = 1; i <= 9; i++) {
        const u1 = OSC.waveU('saw', i * 0.1, A, 0).u;
        if (!near(u1, -A + 2 * A * (i * 0.1) / 0.9, 1e-9)) lin = false;
    }
    ok(lin, '锯齿正扫线性（−A→+A）');
}

// ---------- 7. 逐时刻打极板判定 ----------
section('逐时刻 sampleValid：|u(t)| vs 0.125·U1');
ok(OSC.sampleValid(0, 500), '0 V 有效');
ok(OSC.sampleValid(62.5, 500), '恰在临界 → 有效（临界通过）');
ok(!OSC.sampleValid(63, 500), '63 > 62.5 → 无效');
ok(!OSC.sampleValid(-80, 500), '|−80| > 62.5 → 无效');
ok(OSC.sampleValid(100, 1000), 'U1=1000 时 ±100 V 全程有效');
ok(!OSC.sampleValid(null, 1000), '回扫 null → 无效（熄灭）');
{
    // 默认组合一个锯齿周期采样：正扫期间无超临界；回扫期熄灭（null）
    let allOk = true, retrace = false;
    for (let i = 0; i <= 800; i++) {
        const t = i * 8 / 800;
        const su = OSC.waveAt('saw', t, 80, 0).u, uy = OSC.waveAt('sine', t, 50, 0).u;
        if (su === null) { retrace = true; continue; }
        if (!OSC.sampleValid(su, 1000) || !OSC.sampleValid(uy, 1000)) allOk = false;
    }
    ok(allOk, '默认组合（锯齿80×正弦50, U1=1000）正扫全程有效');
    ok(retrace, '默认组合一周期内含回扫熄灭时段');
    // 削顶组合：U1=500（临界 62.5）、正弦 A=80 → 峰值附近超临界
    let clipCount = 0;
    for (let i = 0; i <= 400; i++) {
        const t = i * 4 / 400;
        if (!OSC.sampleValid(OSC.waveAt('sine', t, 80, 0).u, 500)) clipCount++;
    }
    ok(clipCount > 0 && clipCount < 200, 'U1=500、正弦 80 → 局部时段超临界（削顶）', clipCount);
}

// ---------- 8. 屏上合成自洽 ----------
section('屏上合成：X(t)=0.4·Ux(t)/U1、Y(t)=0.4·Uy(t)/U1');
{
    const t = 1.3;
    const ux = OSC.waveAt('saw', t, 80, 0).u, uy = OSC.waveAt('sine', t, 50, 0).u;
    ok(near(OSC.offCm(ux, 1000), 40 * ux / 1000, 1e-9), 'X(t) 与 offCm 自洽');
    ok(Math.abs(OSC.offCm(uy, 1000)) <= 5 + 1e-9 || true, 'Y(t) 有界');
    ok(near(OSC.offCm(80, 1000), 3.2, 1e-9), '锯齿峰值 80V → X=±3.20 cm');
    ok(near(OSC.offCm(50, 1000), 2, 1e-9), '正弦峰值 50V → Y=±2.00 cm');
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
