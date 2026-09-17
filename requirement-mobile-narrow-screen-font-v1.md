# 需求：移动端窄屏适配 v1（13 个自适应演示页场景字体统一缩放）

> 本次改动基于"全量演示网页安卓手机适配检查"（核查记录见 `docs/mobile-narrow-screen-audit.md`）。检查发现 15 个演示页中 2 页（共点力平衡、力的合成与分解）存在窄屏裁剪缺陷，已分别按 v3 需求修复；其余 13 页画面本身可正常显示，但场景画布内文字使用固定像素字号，窄屏下相对偏大、文字相互挤占。本需求统一为这 13 页的场景文字加上"随画布宽度等比缩放＋10px 可读下限"。

## 背景与问题
- 13 个自适应页（apparent-weight、block-plate、chasing-meeting、free-fall、friction-transition、horizontal-conveyor、horizontal-linear-motion、inclined-conveyor、momentum-collision、oblique-throw、projectile、spring-vs-rope、vertical-throw）的几何按画布实际 CSS 宽度推导，窄屏下画面完整，但场景内标注（速度/位移读数、坐标轴刻度、状态提示等）仍是 `11px`/`12px`/`13px` 固定字号。
- 手机视口下画布实际宽约 362px（设计基准 880px），固定 12px 文字相对画布放大约 2.4 倍，文字密度高、易互相遮挡；桌面端（画布宽 ≥880px）则按原样显示。
- 图表画布（速度-时间图、位移-时间图等）的字号**不在本次范围内**：图表区域独立成幅、本身有留白设计，且各页图表 ctx 变量与场景 ctx 变量名部分重叠（如 `ctx`、`c`、`cx`、`ctx2`、`gctx`、`g.ctx`），需精确区分，本次只动场景上下文。

## 修订清单

### R1 场景字体统一缩放函数
- 每页在场景 ctx 声明处旁新增顶层 `sceneFont(px, bold)`：
  `sceneFont = (px, bold) => (bold ? 'bold ' : '') + Math.max(px * ((场景画布.clientWidth || 880) / 880), 10) + 'px system-ui, sans-serif'`
- 语义：字号 = 设计字号 × (实际画布宽 / 880)，并设 10px 绝对下限。桌面端比例 ≈1，显示与原设计一致；窄屏端全部落在 10px 下限，保证可读且不相对放大。
- 各页"场景画布"取该页场景 canvas 的实际元素：`sceneCanvas`（apparent-weight / free-fall / friction / horizontal-linear / vertical-throw）、`canvas`（block-plate / momentum / oblique / projectile）、`cv`（两个传送带 / spring-vs-rope）、`el('animCanvas')`（chasing，该页无 IIFE，`sceneFont` 定义在 `boot()` 内 `el` 之后）。

### R2 场景字体字面量替换
- 13 页共 77 处场景 `ctx.font = '…px …'` 字面量替换为 `sceneFont(字号, 加粗?)` 调用（chasing 9 处、horizontal-conveyor 10 处、inclined-conveyor 9 处、momentum 9 处、apparent-weight 6 处、friction 6 处、spring 6 处、free-fall 5 处、horizontal-linear 5 处、vertical-throw 4 处、block-plate 3 处、oblique 3 处、projectile 2 处）。
- 图表上下文的 `font` 赋值一律不动（两传送带的 `ctx2`、block-plate 的 `gctx/stctx`、momentum 的 `vtctx/ptctx`、oblique/projectile 的 `chartCtx`、spring 的 `cx`、chasing 的 `chartFrame` 内 `ctx` 与 `g.ctx`、各页 `drawChart(view, ctx, …)` 参数同名变量）。
- 个别字面量原为 `'Npx system-ui'`（无 `sans-serif`），替换后统一输出 `'px system-ui, sans-serif'`，属无害的字体族规范化。

## 验收标准
1. 手机视口（390×844，DPR 2）：13 页场景画布内文字实际字号为 10px（下限生效），无 JS 报错，画面构图与改动前一致（中心区墨迹变化 <1 个百分点）。
2. 桌面视口（1280×940，画布宽 876px）：13 页场景文字字号 ≈ 原设计值（12px 档实测 11.95px、11px 档实测 10.95px、10px 档维持 10px），画面与改动前逐像素一致（中心区墨迹不变）。
3. 13 页的图表画布字号、曲线、游标、实时数值面板、按钮/滑条行为与改动前完全一致（图表 `font` 字面量零改动）。
4. chasing 页的 `chartFrame`（774 行 `10.5px`）与图例/关键帧标注（`g.ctx`）保持原字号，仅 `drawAnim` 场景函数内 9 处文字改走 `sceneFont`。
5. 两个 v3 已修页（force-equilibrium、force-composition）在本次全量回归中无 JS 报错、手机画面完整（v3 的 fit 缩放与字体下限维持生效），无二次回归。

## 验证记录（2026-09-17）
- 工具：playwright-core + chromium headless，视口 390×844（isMobile，DPR 2）与 1280×940；指标为场景画布中心区（x∈[12%,86%]×y∈[6%,82%]）非白像素占比与水平质心，字体值直接读 `ctx.font`。
- 改动前基线经 `git stash` 临时回退取得，改动后 15 页全量复跑。
- 结果：15 页 0 JS 报错、0 画布缺失；13 页手机场景字号全部 = 10px（改动前 11–13px），桌面字号 = 设计值×0.995（10.95/11.95/10px），中心区墨迹变化 ≤0.6 个百分点、质心变化 ≤1.1 个百分点（无裁剪信号：13 页手机墨迹仍高于桌面，质心均落在 31%–58%）；两传送带与 projectile 桌面端 10px/11px 档维持原值。
- 13 页脚本块 `node --check` 全部通过；图表 `font` 字面量经逐页 grep 复核零改动。
