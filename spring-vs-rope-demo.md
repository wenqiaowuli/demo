# 弹簧 vs 绳子对比演示 — 动画页面实现规格书

## 1. 目标

复现“哪个球先落地”的对比实验，直观展示：
- 弹性约束（弹簧）释放具有时滞；
- 不可伸长约束（绳子）释放是瞬时的。

核心结论：**B 球（绳）先落地**。

---

## 2. 页面布局（Layout）

```
┌─────────────────────────────────────────┐
│  标题：哪个球先落地？                      │
├──────────────────┬──────────────────────┤
│   A 球（弹簧）    │    B 球（绳子）        │
│                  │                      │
│   [固定支点]     │   [固定支点]          │
│      |           │      |               │
│   ~~~~弹簧~~~~   │   ||| 绳子 |||        │
│      O 质量块    │      O 质量块         │
│                  │                      │
│  时间: 0.00s     │   时间: 0.00s         │
│  状态: 静止       │   状态: 静止           │
│  加速度: 0        │   加速度: 0            │
├──────────────────┴──────────────────────┤
│  [开始实验]  [重置]  速度: 1x            │
└─────────────────────────────────────────┘
```

实现要求：单文件 HTML，内联 CSS + JS，无外部依赖，优先使用 Canvas 2D。

---

## 3. 核心数据结构

```javascript
// 物理常量
const G = 9.8;           // m/s²
const PIXEL_SCALE = 100; // 1m = 100px
const MASS = 1;          // kg
const SPRING_K = 50;     // N/m

// 系统状态枚举
const State = {
  READY: 'ready',      // 初始平衡
  CUTTING: 'cutting',  // 剪断后运动中
  FALLING: 'falling',  // A球弹簧恢复原长后进入自由落体
  LANDED: 'landed'     // 落地
};

// 左侧弹簧系统
let systemA = {
  state: State.READY,
  y: 0,               // 质量块位置（canvas坐标，向下为正）
  vy: 0,              // 速度
  ay: 0,              // 加速度
  springLength: 0,    // 弹簧当前长度
  springStretch: 0,   // 弹簧伸长量
  landTime: null
};

// 右侧绳系统
let systemB = {
  state: State.READY,
  y: 0,
  vy: 0,
  ay: 0,
  landTime: null
};

// 全局
let time = 0;
let isRunning = false;
let speed = 1;
```

---

## 4. 物理模型（高中范围）

### 4.1 初始平衡

- **A 球**：弹簧静伸长 $x_0$ 满足胡克定律
  $$k x_0 = mg$$
- **B 球**：不可伸长轻绳，长度 $L_0$，张力 $T = mg$

### 4.2 剪断后运动方程

**A 球（弹簧系统）**
- 剪断瞬间弹簧形变不能突变，弹力保持 $F_e = k x_0 = mg$（向上）
- 剪断后极短时间 $t \in [0, t_1)$：
  - 合力 $\sum F_A = mg - kx_0 = 0$
  - $a_A = 0$, $v_A = 0$
  - 质点保持静止，弹簧开始收缩（可近似阻尼振动/弹簧恢复过程）
- $t = t_1$：弹簧恢复原长，弹力消失， thereafter 进入自由落体 $a = g$

**B 球（绳系统）**
- 剪断后约束立即解除，绳张力瞬间消失
- 剪断后立即：
  - 合力 $\sum F_B = mg$
  - $a_B = g$（向下）
  - 立即进入自由落体

---

## 5. 状态机与事件流

```
[READY]
    ↓ 点击"开始实验"
[CUTTING]
    ├─ A球：等待弹簧收缩（约 0.3-0.5s）
    │         ↓ 弹簧恢复原长后
    │       [FALLING]
    │         ↓ 落地
    │       [LANDED_A]
    │
    └─ B球：立即自由落体
              ↓ 落地
            [LANDED_B]

[LANDED] ← 两者都落地后显示结论
```

---

## 6. 动画帧逻辑（伪代码）

```javascript
function update(dt) {
  if (!isRunning) return;

  dt *= speed;
  time += dt;

  // ---- B球：立即自由落体 ----
  if (systemB.state === State.CUTTING) {
    systemB.vy += G * dt;
    systemB.y += systemB.vy * dt;

    if (systemB.y >= GROUND_Y) {
      systemB.y = GROUND_Y;
      systemB.state = State.LANDED;
      systemB.landTime = time;
      checkConclusion();
    }
  }

  // ---- A球：先静止，等弹簧收缩 ----
  if (systemA.state === State.CUTTING) {
    // 弹簧力 + 阻尼
    let springForce = SPRING_K * systemA.springStretch;
    let dampingForce = -0.1 * systemA.vy; // 可选阻尼
    let netForce = MASS * G - springForce + dampingForce;
    systemA.ay = netForce / MASS;
    systemA.vy += systemA.ay * dt;
    systemA.y += systemA.vy * dt;
    systemA.springStretch -= systemA.vy * dt;

    // 当弹簧接近原长时切换
    if (systemA.springStretch <= 0.01) {
      systemA.springStretch = 0;
      systemA.state = State.FALLING;
    }
  }

  // ---- A球进入自由落体阶段 ----
  if (systemA.state === State.FALLING) {
    systemA.vy += G * dt;
    systemA.y += systemA.vy * dt;

    if (systemA.y >= GROUND_Y) {
      systemA.y = GROUND_Y;
      systemA.state = State.LANDED;
      systemA.landTime = time;
      checkConclusion();
    }
  }

  updateUI();
}
```

---

## 7. 渲染要点

- **弹簧绘制**：用锯齿折线模拟弹簧，根据 `springStretch` 动态调整长度
- **绳子绘制**：直线，剪断后透明度渐变消失
- **剪刀动画**：剪断瞬间显示剪刀图标，0.5s 后消失
- **地面标记**：显示两球的落地位置和时间差
- **颜色区分**：A 系统蓝色，B 系统红色

---

## 8. UI 控件

| 控件 | 功能 |
|------|------|
| 开始实验按钮 | 触发剪断动作，进入 CUTTING 状态 |
| 重置按钮 | 回到 READY 状态，清零时间 |
| 速度滑条 | 调整动画播放速度（0.5x / 1x / 2x） |
| 实时数据面板 | 显示时间、速度、加速度、弹簧形变量 |
| 结论弹窗 | 两球都落地后显示 "B球先落地" 及时间差 |

---

## 9. 关键数值参考

```
m = 1 kg
k = 50 N/m
x₀ = mg/k = 0.196 m（初始伸长）

弹簧收缩周期 T = 2π√(m/k) ≈ 0.89 s（阻尼后约 0.3-0.5s）

B球落地时间 t_B = √(2h/g)
A球落地时间 t_A = t_弹簧收缩 + √(2h/g)

时间差 Δt ≈ 0.3-0.5s
```

---

## 10. 验证与部署

- 语法检查：`node --check` 验证 `<script>` 段
- DOM id 交叉核对：`getElementById` 引用的 id 必须都在 HTML 中定义
- 标签配对检查：`div` / `script` / `canvas` 开闭数量一致
- 部署目标：GitHub 仓库 `wenqiaowuli-coder/physics` 的 `physics/` 子目录
- 上线 URL 格式：`https://wenqiaowuli-coder.github.io/physics/physics/<文件名>`

---

## 11. 交付清单

- [x] 单文件 HTML（内联 CSS + JS）
- [x] Canvas 动画区（双 Canvas 并排，A 弹簧 / B 绳子）
- [x] 参数控件（高度 h、刚度 k、质量 m、收缩时间 τ、重力 g、播放速度）
- [x] 实时数据面板（时间 / 速度 / 加速度 / 形变）
- [x] 结论提示（A 球 / B 球落地时间差 + 物理原因）
- [x] 本机静态检查通过（node --check + DOM id 27/27 配对 + 标签配对）
- [x] 部署到 GitHub Pages 并确认上线

### 部署信息

- 仓库：`wenqiaowuli/demo`（由 `wenqiaowuli-coder/physics` 重命名而来）
- 线上 URL：https://wenqiaowuli.github.io/demo/spring-vs-rope-demo.html
- 索引页：https://wenqiaowuli.github.io/demo/index.html （已加入第 8 张卡片）
- Commit：`561f9ac feat(physics): 弹簧 vs 绳子对比演示 - 哪个球先落地`

### 物理模型说明

采用**共落参考系阻尼简谐振动**（真实物理，非线性收缩近似）：

- **A 球（弹簧）**：
  - 剪断瞬间：弹簧形变不能突变，stretch = x₀ = mg/k，弹力 kx₀ = mg，此刻球加速度 = 0。
  - 剪断后年代落参考系内弹簧做阻尼简谐振动 $m\ddot{x}+c\dot{x}+kx=0$（初态 $x=x_0,\dot{x}=0$），
    $c=2\zeta\sqrt{mk}$（阻尼比 $\zeta$ 由滑条控制）。
  - 地面系球的离地高度 $y(t)=h-\tfrac12 gt^2+(x_0-x(t))$：整体自由落体 + 弹簧"拖住/抬升"的形变修正。
  - 形变 $x$ 在 $[x_0]$ 附近衰减振荡，弹簧随球整体下落且**形变可见**（弹簧反复伸缩）。
- **B 球（不可伸长绳）**：剪断瞬间张力立即消失，立即自由落体 $a=g$。

> 真实物理下，弹簧球比绳球晚落地不多（默认参数约晚几十毫秒）；
> 增大质量 / 减小刚度（x₀ 更大）时形变更明显、晚落地更显著。

### 默认参数下的预期结果

- 落地高度 `h = 5 m`，重力 `g = 9.8 m/s²`，m=1kg，k=50N/m，ζ=0.12
- B 球落地：`t_B ≈ 1.01 s`（自由落体）
- A 球（阻尼弹簧振荡）落地：`t_A ≈ 1.02 s`
- 时间差 `Δt ≈ 十几毫秒`，**B 球先落地** ✓（随 x₀ 增大而更明显）
