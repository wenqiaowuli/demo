# 倾斜传送带演示网页 · 对齐标准骨架

## 1. 背景与目标
- **对标文件**：`inclined-conveyor-belt.html`（倾斜传送带演示｜高中物理）。
- **在线地址**：https://wenqiaowuli.github.io/demo/inclined-conveyor-belt.html
- **前置**：v1（倾斜带面/滚筒/受力箭头/双速度/v-t·s-t/擦痕/g=10）已上线；v2（动态纵轴/零线加粗/实线/带方向正方向）已上线。
- **目标**：对齐三页标准骨架（平抛/斜抛/竖直上抛）的视觉风格与 DOM 结构。
- **参照**：`projectile-motion.html`、`oblique-throw-motion.html`——主画布 880:520 蓝框、图表 20:9 蓝框、control-panel 左右分栏、actions 独立区。

## 2. 改动清单

### S1 主画布样式
- 画布尺寸：`880×520`（原 `880×370`），CSS `aspect-ratio: 880 / 520`。
- 边框：`2px solid #3388dd`，`border-radius: 10px`，背景 `#0b1828`。
- `.canvas-wrap`：仅 `position: relative; width: 100%`，无背景/无边框/无 overflow。
- `geom()` 默认高度 `520`（原 `370`），场景按比例缩放。

### S2 图表对齐
- `.chart-panel`：`background: transparent; border: none; border-radius: 0; padding: 0`。
- `.chart-panel canvas`：`aspect-ratio: 20 / 9`，`border: 2px solid #3388dd`，`background: #0b1828`。
- `.charts-row`：`gap: 14px`（原 `12px`）。
- 图表画布属性：`width="440" height="198"`（原 `430×200`）。

### S3 DOM 结构对齐
- DOM 顺序：`h1 → canvas-wrap → charts-row → control-panel → actions → legend`。
- `.card-title` → `.group-title`（统一命名）。
- 操作按钮（开始/暂停/继续/重置）从 `param-group` 移出至独立 `<div class="actions">`。
- 键盘快捷键信息移入 `legend`。

### S4 按钮样式统一
- 字号 `14px`，内距 `9px 16px`，圆角 `8px`。
- hover：`background: #2f7cc8`（仅非 disabled）。
- active：`transform: translateY(1px)`（仅非 disabled）。
- transition：`background-color 0.15s ease, transform 0.15s ease`。

### S5 背景色统一
- `clear()` 填充 `#0b1828`（原 `#0d141b`），与画布 CSS 背景一致。

## 3. 保持不变
- 物理模型（倾角可调、沿斜面向上为正、摩擦力方向判定、共速条件）。
- 滚筒样式（8 辐条 + 双轮缘 + 空心轮毂 + 旋转亮斑）。
- 受力箭头（G 红 / N 紫 / f 粉=滑动·绿=静摩擦）。
- v-t / s-t 图表内容（非对称自适应纵轴、零线加粗、共速竖线）。
- 控件功能（θ/v₀/v带/μ/g/L/倍速滑条、底端/中部/顶端位置按钮）。
- 快捷键（Space/R）、aria-live、g=10。

## 4. 验收标准
- [ ] 主画布 880×520，蓝框 `#3388dd`，背景 `#0b1828`，`aspect-ratio: 880/520`。
- [ ] `.canvas-wrap` 无背景/无边框。
- [ ] 图表面板透明，画布 `20:9` 蓝框，`gap: 14px`。
- [ ] DOM 顺序：`h1 → canvas → charts → control-panel → actions → legend`。
- [ ] 按钮在独立 `.actions` div 中，不在 `param-group` 内。
- [ ] `card-title` 全部改为 `group-title`。
- [ ] `clear()` 背景 `#0b1828`。
- [ ] `geom()` 默认高度 `520`，场景比例正确。
- [ ] 物理功能不回归（倾角调节、摩擦力方向、共速、擦痕）。
