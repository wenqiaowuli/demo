# 演示网页移动端窄屏适配全量核查记录

- 核查日期：2026-09-17
- 核查范围：仓库当前已提交的全部 15 个演示网页
- 触发背景：共点力平衡（`force-equilibrium-demo.html`）与力的合成与分解（`force-composition-demo.html`）先后在安卓手机上出现"演示窗口画面不显示"，修复后对全部页面做一次统一排查，确认是否还有同类问题。
- 配套需求：
  - 两页裁剪缺陷修复 → `requirement-force-equilibrium-v3.md`、`requirement-force-composition-v3.md`（已随各自提交上线）
  - 其余 13 页场景字体统一缩放 → `requirement-mobile-narrow-screen-font-v1.md`（本次提交）

## 一、检查方法

1. **视口模拟**：playwright-core + chromium headless，手机视口 390×844（`isMobile` + `hasTouch`，DPR 2，模拟安卓手机 Chrome 典型宽度）与桌面视口 1280×940（DPR 2）。
2. **代码走查**：逐页确认场景画布的几何来源——
   - **固定设计坐标**：按 880×520 设计空间硬编码绘制（`force-equilibrium`、`force-composition` 属此类）；
   - **实际宽度自适应**：几何按 `clientWidth`/`view.width` 实时推导（其余 13 页属此类）。
   前者若 `setupCanvas` 只做 DPR 缩放，窄屏下内容会整体画到屏幕外（即两页缺陷的根因）；后者天然随宽度收缩，无裁剪风险。
3. **像素级墨迹审计**：对每页场景画布读取 `getImageData`，统计中心区（x∈[12%,86%]×y∈[6%,82%，排除左侧标尺列与底部地面行]）非白像素占比（中心墨迹）、水平质心位置（质心 X%）。判读规则：
   - 质心贴近画布左/右边缘，或手机中心墨迹显著低于桌面 → 内容被裁出屏外（固定坐标未适配的典型特征）；
   - 手机中心墨迹 ≥ 桌面（自适应页重排后相对更"满"）且质心居中 → 画面完整。
4. **字体值直读**：加载后直接读场景 `ctx.font` 的实际字符串，确认缩放函数生效档位。
5. **改动前后对照**：改动前基线经 `git stash` 临时回退取数，改动后全量复跑，墨迹差值用于确认"字体缩放未引起构图回退"。

## 二、结论总览

| 页面 | 布局类型 | 核查结论 | 处置 |
|---|---|---|---|
| force-equilibrium-demo.html | 固定 880×520 设计坐标 | ❌ 窄屏裁剪，演示画面画到屏外 | v3 修复（fit 等比缩放＋场景字体下限＋窄屏提示换行），已验证 |
| force-composition-demo.html | 固定 880×520 设计坐标 | ❌ 同上 | v3 修复（同方案，含分解场景提示换行与红条避让），已验证 |
| 其余 13 页（见下） | 实际宽度自适应 | ✅ 画面完整；⚠️ 场景文字为固定 px，窄屏相对偏大 | 本次统一加 `sceneFont` 等比缩放＋10px 下限 |

13 页清单：apparent-weight-demo、block-plate、chasing-meeting-model、free-fall-motion、friction-transition-demo、horizontal-conveyor-belt、horizontal-linear-motion、inclined-conveyor-belt、momentum-collision、oblique-throw-motion、projectile-motion、spring-vs-rope-demo、vertical-throw-demo。

## 三、逐页数据（改动前 → 改动后）

手机 390×844（场景画布实际宽 362px，缩放比 0.411）：

| 页面 | 中心墨迹（手机） | 质心 X（手机） | 场景字号（手机，改动前→后） | 中心墨迹（桌面 876px） |
|---|---|---|---|---|
| apparent-weight-demo | 25% → 24.6% | 52.6% → 52.8% | bold 13px → bold 10px | 4.3% → 4.3% |
| block-plate | 9.5% → 9.3% | 48.5% → 48.4% | bold 11px → bold 10px | 5% → 5% |
| chasing-meeting-model | 6.3% → 6% | 46.4% → 46.2% | 12px → 10px | 1.4% → 1.4% |
| free-fall-motion | 6.2% → 5.6% | 44.6% → 44.5% | 12px → 10px | 0.6% → 0.6% |
| friction-transition-demo | 10.4% → 9.8% | 32.7% → 31.6% | bold 12px → bold 10px | 1% → 1% |
| horizontal-conveyor-belt | 24.6% → 24.6% | 41.1% → 41.1% | 10px → 10px | 12.4% → 12.4% |
| horizontal-linear-motion | 4.7% → 4.1% | 49.1% → 49% | 12px → 10px | 1.1% → 1.1% |
| inclined-conveyor-belt | 28.3% → 27.9% | 49.7% → 49.6% | 10px → 10px | 14% → 14% |
| momentum-collision | 10.7% → 10.5% | 57.9% → 58% | bold 12px → bold 10px | 3.3% → 3.3% |
| oblique-throw-motion | 7.3% → 7% | 44.5% → 44.9% | 12px → 10px | 2% → 2% |
| projectile-motion | 8.3% → 8.2% | 44.3% → 44.6% | 11px → 10px | 2.4% → 2.4% |
| spring-vs-rope-demo | 12.4% → 12.2% | 49.5% → 49.5% | 11px → 10px | 9.1% → 9.1% |
| vertical-throw-demo | 4.3% → 3.9% | 41.3% → 41.5% | 12px → 10px | 0.3% → 0.3% |

判读：13 页改动后手机墨迹与改动前差值均 ≤0.6 个百分点、质心差值 ≤1.1 个百分点（字体由 11–13px 降到 10px 下限导致的预期微小变化，无构图回退）；所有页面手机墨迹仍高于桌面、质心落在 31%–58% 区间，无裁剪特征。

两个 v3 已修页（本次未再改动，仅回归确认）：force-composition 手机中心墨迹 4.2%（桌面 2.4%）、质心 44.9%；force-equilibrium 手机 2.8%（桌面 1.2%）、质心 51.4% —— 手机墨迹高于桌面，确认 v3 的 fit 缩放在窄屏下仍然完整呈现，无二次回归。

## 四、本次字体改动的实现与边界

- 每页新增顶层 `sceneFont(px, bold)`：字号 = 设计字号 × (场景画布实际宽 / 880)，下限 10px。桌面 876px 宽时缩放比 0.995，实测场景字号 12px 档 = 11.95px、11px 档 = 10.95px、10px 档维持 10px，与改动前逐像素一致；手机 362px 宽时全部触发 10px 下限。
- 共替换 13 页 77 处场景字体字面量（各页明细见需求文件 R2）。
- **图表画布字号一律未动**：各页图表 ctx 变量（`ctx2`、`gctx`/`stctx`、`vtctx`/`ptctx`、`chartCtx`、`cx`、chasing 的 `chartFrame`/`g.ctx`、`drawChart(view, ctx, …)` 参数同名变量）与场景 ctx 变量名存在重叠，替换采用负向后顾精确锚定 + 逐页 grep 复核，确认图表 `font` 字面量零改动。
- chasing-meeting-model 为特例：该页无 IIFE，场景 `ctx` 来自 `prep()` 解构，`sceneFont` 定义在 `boot()` 内 `el` 之后，仅替换 `drawAnim` 场景函数内 9 处，`chartFrame` 内 10.5px 与图例 `g.ctx` 字号保持原样。

## 五、回归验证结果

1. 13 页 `<script>` 块抽取后 `node --check` 全部通过。
2. 15 页双视口全量渲染：0 个 `pageerror`、0 个 console error、0 个画布缺失。
3. 手机/桌面墨迹与质心对照见上表，无回退、无裁剪。
4. 场景字体实际值直读：13 页手机 = 10px（下限生效）、桌面 = 设计值×0.995；两 v3 页手机场景字号 = 24.3 设计px（`10/fit`，经 fit 缩放后等效 10 CSS px，与 13 页下限物理一致）。

## 六、遗留与建议

1. **图表字号维持固定 px**：各页速度-时间图、位移-时间图等的坐标轴/图例文字仍为固定字号（10–12px）。图表区域独立成幅且本身字号较小，窄屏下可读性尚可，本次未纳入；若后续反馈图表文字过小，可按同一 `sceneFont` 模式为其单独加缩放。
2. **新页面约定**：后续新增演示页，若场景采用固定设计坐标，必须同时实现"画布宽度→设计坐标"的等比缩放（`setTransform(dpr·fit, 0, 0, dpr·fit, 0, 0)`）与场景字体下限，避免重蹈 force-equilibrium/force-composition 的窄屏裁剪问题；优先推荐直接采用"按实际宽度自适应几何"的布局方式。
3. **真机抽查**：本次以 390×844（DPR 2）模拟安卓 Chrome，建议上线后在 1–2 台真机（不同宽度档位，如 360px 与 414px）各抽查一个传送带页与一个抛体页，确认无模拟差异。
