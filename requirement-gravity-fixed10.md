# 需求：全系列演示页重力加速度统一固定为 10 m/s²

## 背景与目标
- 用户要求：搜索所有演示网页，取消单独调整重力加速度 g 的控件，将 g 统一固定为 10 m/s²（与系列"g=10 固定"惯例完全对齐）。

## 排查结论（全部 13 个页面）
**有 g 调节控件或错误值，需修改（3 个文件）：**
| 文件 | 现状 | 修改 |
|------|------|------|
| `horizontal-conveyor-belt.html` | "重力 g"滑条（5~15 m/s²，默认 10） | 移除滑条，g 固定 10 |
| `inclined-conveyor-belt.html` | "重力 g"滑条（5~15 m/s²，默认 10） | 移除滑条，g 固定 10 |
| `block-plate.html` | 无滑条，但 `const g = 9.8` | 改为 `const g = 10` |

**确认无需修改（g 已固定为 10，无控件）：**
`apparent-weight-demo.html`、`free-fall-motion.html`、`vertical-throw-demo.html`、`oblique-throw-motion.html`、`spring-vs-rope-demo.html`、`force-equilibrium-demo.html`、`chasing-meeting-model.html`、`horizontal-linear-motion.html`、`_repo/projectile-motion.html`、`_repo/momentum-collision.html`（均无 g 滑条；代码/说明中 g=10 固定）。
- 说明：free-fall 与 force-equilibrium 的质量 m 滑条是合法参数（改变重力大小 G=mg，不是改 g），保留。

## 改动清单
### R1 `horizontal-conveyor-belt.html`
- 删除"重力 g"参数行（label + `input#g` + `span#gv`）。
- 删除 `gEl`/`gv` 引用：变量声明、锁定列表（`[v0El, muEl, gEl, lenEl, vbSizeEl, speedEl]`）、输入监听列表（`[v0El, muEl, gEl]`）、`gv.textContent` 更新。
- `state.g = parseFloat(gEl.value)` → `state.g = 10`（固定值）。
- fixed-note 参数列表去掉"g（重力加速度）"项。

### R2 `inclined-conveyor-belt.html`
- 同 R1：删除"重力 g"参数行；`sliderEls` 与监听列表移除 `gEl`；`state.g = 10`；参数列表去掉 g 项。

### R3 `block-plate.html`
- `const g = 9.8;` → `const g = 10;`（无 UI 文案涉及 9.8，无需改文案）。

### R4 `_repo` 同步
- 三个文件同步到 `_repo`（`_repo/block-plate.html` 的 9.8 一并修复）。

## 保持不变
- 两个传送带页默认参数下的全部数值（默认 g 本就是 10，读数不变）。
- 各页其余参数滑条（μ、m、θ、v₀、v带、L、播放速度等）与布局骨架。

## 验收标准
- [ ] 两传送带页无"重力 g"滑条；fixed-note 参数列表不含可调 g；JS 无 `gEl` 残留引用；`state.g` 恒为 10。
- [ ] block-plate 代码 g=10；默认参数下力/热量等读数按 g=10 计算。
- [ ] 修改后三页在浏览器中加载无报错、默认状态渲染正常。
