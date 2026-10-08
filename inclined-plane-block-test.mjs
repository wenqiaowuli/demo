// 斜面物块演示页物理核验证（Node，无 DOM 依赖）——覆盖 PRD 9.1 测试矩阵 TC-01~TC-06 及扩展
// 用法: node inclined-plane-block-test.mjs
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./inclined-plane-block.html', import.meta.url), 'utf8');
const m = html.match(/<script id="incline-physics">([\s\S]*?)<\/script>/);
if (!m) { console.error('FAIL: 未找到 incline-physics 脚本'); process.exit(1); }
(0, eval)(m[1]);
const INC = globalThis.INCLINE;
if (!INC) { console.error('FAIL: INCLINE 未导出'); process.exit(1); }

let pass = 0, fail = 0;
function ok(cond, name, detail) {
    if (cond) { pass++; console.log('  PASS ' + name); }
    else { fail++; console.log('  FAIL ' + name + (detail !== undefined ? '  → ' + detail : '')); }
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const sections = [];
function section(t) { sections.push(t); console.log('\n== ' + t); }

const G0 = { theta: 30, L: 10, m: 2, mu_k: 0, mu_s: 0, s0: 5, v0: 0, g: 9.8 };

// ---------- TC-01 光滑斜面自由下滑 ----------
section('TC-01 光滑斜面自由下滑：a = g·sinθ = 4.90，机械能恒定误差 < 0.01%');
{
    const P = { ...G0 };
    const d = INC.derive(P);
    ok(near(-d.aUp, 4.90, 1e-9), 'a = 4.90 m/s²', (-d.aUp).toFixed(4));
    const tl = INC.buildTimeline(P);
    const bottomEv = tl.events.find(e => e.type === 'bottom');
    ok(!!bottomEv, '存在到达底端事件', JSON.stringify(tl.events));
    const tHit = bottomEv.t;
    ok(near(tHit, Math.sqrt(2 * 5 / 4.9), 1e-9), 't底 = √(2s/a) = 1.4286 s', tHit.toFixed(6));
    const E0 = INC.energies(P, tl, INC.stateAt(tl, 0)).E;
    let maxDev = 0;
    for (let i = 0; i <= 200; i++) {
        const st = INC.stateAt(tl, tHit * i / 201);
        const en = INC.energies(P, tl, st);
        maxDev = Math.max(maxDev, Math.abs(en.E - E0));
    }
    ok(maxDev / E0 < 1e-10, '机械能全程波动 < 0.01%（实际 ' + (maxDev / E0 * 100).toExponential(1) + '%）', maxDev);
    const stEnd = INC.stateAt(tl, tHit - 1e-6);
    ok(near(stEnd.v, -Math.sqrt(2 * 4.9 * 5), 1e-4), '撞底前瞬时速度 = √(2as) = 7.00 m/s', stEnd.v.toFixed(4));
    const enEnd = INC.energies(P, tl, stEnd);
    ok(near(enEnd.Ek, 49, 1e-4), '撞底前动能 = 49 J（=初始势能）', enEnd.Ek.toFixed(4));
}

// ---------- TC-02 粗糙斜面静态自锁 ----------
section('TC-02 粗糙斜面静态自锁：tan30°=0.577 ≤ 0.60，a=0，f = mg·sin30°');
{
    const P = { theta: 30, L: 10, m: 2, mu_k: 0.5, mu_s: 0.6, s0: 5, v0: 0, g: 9.8 };
    ok(INC.isLocked(P), 'isLocked = true', 'tanθ=' + Math.tan(INC.rad(30)).toFixed(4));
    const tl = INC.buildTimeline(P);
    const st = INC.stateAt(tl, 0.5);
    ok(st.phase === 'locked', '阶段 = locked', st.phase);
    ok(near(st.a, 0, 1e-12), 'a = 0');
    const F = INC.forces(P, st);
    ok(near(F.f, 2 * 9.8 * 0.5, 1e-9), 'f = mg·sin30° = 9.80 N', F.f.toFixed(4));
    ok(near(F.N, 2 * 9.8 * Math.cos(INC.rad(30)), 1e-9), 'N = mg·cos30° = 16.97 N', F.N.toFixed(4));
    ok(near(F.Fnet, 0, 1e-12), 'F合 = 0');
    ok(near(INC.stateAt(tl, tl.tEnd).s, 5, 1e-9), '位置始终 s=5');
    ok(near(INC.criticalAngleDeg(P), Math.atan(0.6) * 180 / Math.PI, 1e-9), '临界角 = arctan(0.6) = 30.96°', INC.criticalAngleDeg(P).toFixed(4));
}

// ---------- TC-03 粗糙斜面滑动临界 ----------
section('TC-03 粗糙斜面滑动临界：θ=45°, μs=μk=0.50 → a = 9.8(√2/2−0.5·√2/2) ≈ 3.46');
{
    const P = { theta: 45, L: 10, m: 2, mu_k: 0.5, mu_s: 0.5, s0: 5, v0: 0, g: 9.8 };
    ok(!INC.isLocked(P), 'isLocked = false（tan45°=1 > 0.5）');
    const tl = INC.buildTimeline(P);
    const st = INC.stateAt(tl, 0.4);
    ok(st.phase === 'down-acc', '阶段 = down-acc', st.phase);
    ok(near(-st.a, 9.8 * (Math.SQRT1_2 - 0.5 * Math.SQRT1_2), 1e-9), 'a = 3.4648 m/s²', (-st.a).toFixed(4));
    ok(near(-st.a, 3.46, 0.01), 'PRD 判据 ≈3.46 m/s²');
    const F = INC.forces(P, st);
    ok(near(F.f, 0.5 * 2 * 9.8 * Math.SQRT1_2, 1e-9), 'f = μk·mg·cos45° = 6.93 N（沿斜面向上）', F.f.toFixed(4));
    ok(F.f > 0, '下滑时摩擦力沿 +s（向上）');
}

// ---------- TC-04 上滑最高点自锁 ----------
section('TC-04 上滑最高点自锁：θ=30°, μs=0.60, μk=0.20, v0=5 → a_up≈6.598，停于最高点');
{
    const P = { theta: 30, L: 10, m: 2, mu_k: 0.2, mu_s: 0.6, s0: 0, v0: 5, g: 9.8 };
    const tl = INC.buildTimeline(P);
    const aUp = 9.8 * (0.5 + 0.2 * Math.sqrt(3) / 2);
    const stUp = INC.stateAt(tl, 0.3);
    ok(stUp.phase === 'up', '上滑阶段', stUp.phase);
    ok(near(-stUp.a, aUp, 1e-9), 'a_up = 6.5974 m/s²', (-stUp.a).toFixed(4));
    const topEv = tl.events.find(e => e.type === 'top');
    ok(!!topEv, '存在最高点事件');
    ok(near(topEv.t, 5 / aUp, 1e-9), 't_top = v0/a_up = 0.7579 s', topEv.t.toFixed(6));
    ok(near(topEv.s, 25 / (2 * aUp), 1e-9), 's_top = v0²/2a_up = 1.8947 m', topEv.s.toFixed(6));
    ok(!tl.events.some(e => e.type === 'bottom'), '不发生下滑（无到底端事件）');
    const stAfter = INC.stateAt(tl, topEv.t + 0.3);
    ok(stAfter.phase === 'locked' && stAfter.note === 'top', '最高点自锁（locked/top）', stAfter.phase + '/' + stAfter.note);
    ok(near(stAfter.s, topEv.s, 1e-9), '停在 s_top');
    ok(near(INC.stateAt(tl, tl.tEnd).s, topEv.s, 1e-9), 'tEnd 时仍在最高点');
    const F0 = INC.forces(P, INC.stateAt(tl, 0.1));
    ok(F0.f < 0, '上滑时 f 沿 −s（向下）', F0.f.toFixed(3));
    const F1 = INC.forces(P, INC.stateAt(tl, topEv.t + 0.05));
    ok(F1.f > 0, '静止后 f 突变为沿 +s（向上）', F1.f.toFixed(3));
}

// ---------- TC-05 上滑后反向下滑 ----------
section('TC-05 上滑后反向下滑：a_up≈8.32 > a_down≈5.54，t_up < t_down');
{
    const P = { theta: 45, L: 10, m: 2, mu_k: 0.2, mu_s: 0.2, s0: 0, v0: 4, g: 9.8 };
    const tl = INC.buildTimeline(P);
    const aUp = 9.8 * (Math.SQRT1_2 + 0.2 * Math.SQRT1_2);
    const aDn = 9.8 * (Math.SQRT1_2 - 0.2 * Math.SQRT1_2);
    const stUp = INC.stateAt(tl, 0.2);
    ok(near(-stUp.a, aUp, 1e-9), 'a_up = 8.3155 m/s²', (-stUp.a).toFixed(4));
    const topEv = tl.events.find(e => e.type === 'top');
    const botEv = tl.events.find(e => e.type === 'bottom');
    ok(!!topEv && !!botEv, '存在最高点与底端事件');
    ok(near(topEv.t, 4 / aUp, 1e-9), 't_up = 0.4810 s', topEv.t.toFixed(6));
    ok(near(topEv.s, 16 / (2 * aUp), 1e-9), 's_top = 0.9621 m', topEv.s.toFixed(6));
    const tDn = botEv.t - topEv.t;
    ok(near(tDn, Math.sqrt(2 * topEv.s / aDn), 1e-9), 't_down = 0.5892 s', tDn.toFixed(6));
    ok(topEv.t < tDn, 't_up < t_down（上滑快、下滑慢）');
    ok(near(aDn, 5.5437, 1e-3), 'a_down ≈ 5.54 m/s²', aDn.toFixed(4));
    const stMid = INC.stateAt(tl, (topEv.t + botEv.t) / 2);
    ok(stMid.phase === 'down-acc' && stMid.note === 'reverse', '反向下滑阶段', stMid.phase + '/' + stMid.note);
    const stEnd = INC.stateAt(tl, botEv.t - 1e-6);
    ok(near(Math.abs(stEnd.v), Math.sqrt(2 * aDn * topEv.s), 1e-4), '回到底端前速率 3.266 m/s', Math.abs(stEnd.v).toFixed(4));
    const en0 = INC.energies(P, tl, INC.stateAt(tl, 0));
    const enEnd = INC.energies(P, tl, stEnd);
    ok(near(en0.E - enEnd.E, enEnd.Wf, 1e-4), '功能定理：ΔE = Wf', (en0.E - enEnd.E).toFixed(4) + ' vs ' + enEnd.Wf.toFixed(4));
    const wfTheo = 0.2 * 2 * 9.8 * Math.SQRT1_2 * 2 * topEv.s;
    ok(near(enEnd.Wf, wfTheo, 1e-4), 'Wf = μk·mg·cosθ·2s_top = 5.333 J', enEnd.Wf.toFixed(4) + ' vs ' + wfTheo.toFixed(4));
}

// ---------- TC-06 质量无关性 ----------
section('TC-06 质量无关性：m 1→10 kg 加速度与时间线一致，仅力按比例放大');
{
    const base = { theta: 30, L: 10, mu_k: 0.2, mu_s: 0.3, s0: 3, v0: 4, g: 9.8 };
    const tl1 = INC.buildTimeline({ ...base, m: 1 });
    const tl10 = INC.buildTimeline({ ...base, m: 10 });
    let maxDiff = 0;
    for (let i = 0; i <= 50; i++) {
        const tt = tl1.tEnd * i / 50;
        const s1 = INC.stateAt(tl1, tt), s10 = INC.stateAt(tl10, tt);
        maxDiff = Math.max(maxDiff, Math.abs(s1.s - s10.s), Math.abs(s1.v - s10.v), Math.abs(s1.a - s10.a));
    }
    ok(near(tl1.tEnd, tl10.tEnd, 1e-9) && maxDiff < 1e-9, '运动完全一致（max|Δ|=0）', maxDiff);
    const f1 = INC.forces({ ...base, m: 1 }, INC.stateAt(tl1, 0.2));
    const f10 = INC.forces({ ...base, m: 10 }, INC.stateAt(tl10, 0.2));
    ok(near(f10.G / f1.G, 10, 1e-9) && near(f10.N / f1.N, 10, 1e-9) && near(f10.f / f1.f, 10, 1e-9) && near(f10.Fnet / f1.Fnet, 10, 1e-9),
        'G/N/f/F合 均放大 10 倍', (f10.G / f1.G).toFixed(3));
}

// ---------- 场景五：初速度向下 ----------
section('场景五 初速度向下：加速 / 匀速（tanθ=μk）/ 减速三态判定');
{
    const acc = { theta: 30, L: 10, m: 2, mu_k: 0.2, mu_s: 0.3, s0: 10, v0: -5, g: 9.8 };
    const tlA = INC.buildTimeline(acc);
    ok(INC.stateAt(tlA, 0.1).phase === 'down-acc', 'tanθ>μk → down-acc');
    ok(near(-INC.stateAt(tlA, 0.1).a, 9.8 * (0.5 - 0.2 * Math.sqrt(3) / 2), 1e-9), 'a = 3.204 m/s²', (-INC.stateAt(tlA, 0.1).a).toFixed(4));
    const uni = { theta: Math.atan(0.4) * 180 / Math.PI, L: 10, m: 2, mu_k: 0.4, mu_s: 0.5, s0: 8, v0: -3, g: 9.8 };
    const tlU = INC.buildTimeline(uni);
    const stU = INC.stateAt(tlU, 0.3);
    ok(stU.phase === 'down-uni', 'tanθ=μk → down-uni', stU.phase);
    ok(near(stU.a, 0, 1e-9) && near(stU.v, -3, 1e-9), 'a=0，v 恒为 −3 m/s', stU.v.toFixed(3));
    const dec = { theta: 20, L: 30, m: 2, mu_k: 0.5, mu_s: 0.6, s0: 20, v0: -6, g: 9.8 };
    const tlD = INC.buildTimeline(dec);
    const stD1 = INC.stateAt(tlD, 0.2);
    ok(stD1.phase === 'down-dec', 'tanθ<μk → down-dec', stD1.phase);
    ok(near(stD1.a, 9.8 * (0.5 * Math.cos(INC.rad(20)) - Math.sin(INC.rad(20))), 1e-9), 'a = +1.253 m/s²（沿斜面向上）', stD1.a.toFixed(4));
    const stopEv = tlD.events.find(e => e.type === 'stop');
    ok(!!stopEv, '存在减速停止事件');
    const stD2 = INC.stateAt(tlD, stopEv.t + 0.2);
    ok(stD2.phase === 'locked' && stD2.note === 'down-stop', '停止后自锁', stD2.phase + '/' + stD2.note);
    ok(stD2.s > 0 && near(stD2.s, 20 - 36 / (2 * stD1.a), 1e-9), '停在 s = 5.63 m', stD2.s.toFixed(3));
    ok(near(stopEv.t, 6 / stD1.a, 1e-9), 't_stop = v0/|a| = 4.790 s', stopEv.t.toFixed(4));
}

// ---------- 边界与状态机 ----------
section('边界处理：底端停止 / 冲出顶端 / 底端静止释放 / s0 越界截断');
{
    const ov = { theta: 20, L: 4, m: 2, mu_k: 0.05, mu_s: 0.1, s0: 0, v0: 6, g: 9.8 };
    const tlO = INC.buildTimeline(ov);
    ok(tlO.events.some(e => e.type === 'overflow'), '冲出顶端事件', JSON.stringify(tlO.events));
    const stO = INC.stateAt(tlO, tlO.tEnd);
    ok(stO.phase === 'overflow' && near(stO.s, 4, 1e-9) && near(stO.v, 0, 1e-12), '锁定 s=L, v=0', stO.phase);
    const bt = { theta: 30, L: 10, m: 2, mu_k: 0.2, mu_s: 0.3, s0: 2, v0: -3, g: 9.8 };
    const tlB = INC.buildTimeline(bt);
    const stB = INC.stateAt(tlB, tlB.tEnd);
    ok(stB.phase === 'bottom' && near(stB.s, 0, 1e-12) && near(stB.v, 0, 1e-12), '到底端锁定 s=0, v=0', stB.phase);
    const rest = { theta: 30, L: 10, m: 2, mu_k: 0.2, mu_s: 0.3, s0: 4, v0: 0, g: 9.8 };
    const tlR = INC.buildTimeline(rest);
    ok(!tlR.locked, 'tan30°≈0.577 > μs=0.3 → 不自锁，立即下滑');
    ok(INC.stateAt(tlR, tlR.tEnd).phase === 'bottom', '底端释放立即判 bottom', INC.stateAt(tlR, tlR.tEnd).phase);
    const clamp = INC.buildTimeline({ theta: 30, L: 5, m: 2, mu_k: 0, mu_s: 0, s0: 9, v0: 0, g: 9.8 });
    ok(near(INC.stateAt(clamp, 0).s, 5, 1e-12), 's0 > L 被截断为 L', INC.stateAt(clamp, 0).s.toFixed(3));
}

// ---------- 回放一致性 ----------
section('stateAt 任意时刻回放与解析解一致（scrub 可靠性）');
{
    const P = { theta: 35, L: 12, m: 1.5, mu_k: 0.15, mu_s: 0.25, s0: 1, v0: 6, g: 9.8 };
    const tl = INC.buildTimeline(P);
    const aUp = -(P.g * (Math.sin(INC.rad(35)) + 0.15 * Math.cos(INC.rad(35))));
    for (const tt of [0, 0.13, 0.5, 0.9, 1.2, 2.0, tl.tEnd]) {
        const st = INC.stateAt(tl, tt);
        if (st.phase === 'up') {
            const sAna = 1 + 6 * tt + 0.5 * aUp * tt * tt;
            const vAna = 6 + aUp * tt;
            ok(near(st.s, sAna, 1e-9) && near(st.v, vAna, 1e-9), 't=' + tt + ' 与解析解一致', `s=${st.s.toFixed(6)} vs ${sAna.toFixed(6)}`);
        }
        ok(st.s >= -1e-9 && st.s <= P.L + 1e-9, 't=' + tt + ' 位置在 [0,L] 内', st.s.toFixed(4));
    }
    const stTop = INC.stateAt(tl, tl.events.find(e => e.type === 'top').t);
    ok(near(stTop.v, 0, 1e-9), '最高点时刻 v=0', stTop.v.toExponential(2));
}

// ---------- 水平面与重力环境 ----------
section('θ=0 水平面（+s / −s 两方向）与 g 预设（月球）');
{
    const flatA = { theta: 0, L: 10, m: 2, mu_k: 0.3, mu_s: 0.4, s0: 2, v0: 4, g: 9.8 };
    const tlA = INC.buildTimeline(flatA);
    const stA = INC.stateAt(tlA, 0.1);
    ok(stA.phase === 'up' && near(stA.a, -9.8 * 0.3, 1e-9), '沿 +s 运动 → up 相减速 a = −2.94', stA.phase + '/' + stA.a.toFixed(4));
    const stopA = tlA.events.find(e => e.type === 'stop');
    ok(!!stopA && near(stopA.t, 4 / 2.94, 1e-9) && near(stopA.s, 2 + 16 / (2 * 2.94), 1e-9), 't=1.361s 停于 s=4.721m', stopA.t.toFixed(4) + '/' + stopA.s.toFixed(4));
    ok(INC.stateAt(tlA, stopA.t + 0.1).phase === 'locked', '水平面静止后自锁');
    const flatB = { theta: 0, L: 10, m: 2, mu_k: 0.3, mu_s: 0.4, s0: 5, v0: -4, g: 9.8 };
    const tlB = INC.buildTimeline(flatB);
    const stB = INC.stateAt(tlB, 0.1);
    ok(stB.phase === 'down-dec' && near(stB.a, 9.8 * 0.3, 1e-9), '沿 −s 运动 → down-dec 相 a = +2.94', stB.phase + '/' + stB.a.toFixed(4));
    const stopB = tlB.events.find(e => e.type === 'stop');
    ok(!!stopB && near(stopB.s, 5 - 16 / (2 * 2.94), 1e-9), '停于 s=2.279m', stopB.s.toFixed(4));
    const moon = { theta: 30, L: 10, m: 2, mu_k: 0, mu_s: 0, s0: 5, v0: 0, g: 1.62 };
    ok(near(-INC.derive(moon).aUp, 1.62 * 0.5, 1e-9), '月球 g=1.62 → a = 0.81 m/s²', (-INC.derive(moon).aUp).toFixed(4));
}

console.log('\n结果: ' + pass + ' PASS, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
