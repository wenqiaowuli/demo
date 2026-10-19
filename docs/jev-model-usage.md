# jev 模型调用备忘

本文档说明如何通过 OpenCode Zen 调用 jev 模型（TypeSafe AI 的 System One 模型），供其它模型快速上手。

## 1. 基本事实

- jev **不是对话/文本生成模型**。它对一个 `state`（文本状态）逐个回答结构化问题，返回值与概率。
- 不要用 `chat/completions`、`responses`、`messages` 端点调用 jev，会返回 `ModelProtocolUnsupported`。
- 正确端点：`https://opencode.ai/zen/v1/systemone`
- 模型 ID：
  - 付费版：`jev-1.13`
  - 免费版：`jev-1.13-free`（仅限 OpenCode 内部使用，直接 curl 会报 `FreeTierError`）
- 认证：`Authorization: Bearer $OPENCODE_API_KEY`（环境变量，**不要把密钥写入文档或代码**）。
- 计费：付费版按 token 计费，输入约 $0.042 / 1M（以官网价格为准）。

## 2. 请求格式

```json
{
  "model": "jev-1.13",
  "state": "待评估的文本描述",
  "questions": {
    "<问题ID>": { ... 问题定义 ... }
  }
}
```

支持三种问题类型：

| type | 含义 | 必填字段 | 返回字段 |
|---|---|---|---|
| `noul` | 是/否判断 | `instructions` | `noul`（0–1，越高越倾向“是”） |
| `choice` | 多选一 | `instructions`, `criteria`（对象：选项ID -> 说明） | `choice`, `probabilities` |
| `score` | 量表评分 | `instructions`, `criteria`（数组，按由低到高排列） | `score`, `confidence`, `probabilities` |

示例：

```json
{
  "model": "jev-1.13",
  "state": "我的订单迟到了，商品也损坏了，我要退款。",
  "questions": {
    "is_urgent": {"type": "noul", "instructions": "是否需要紧急处理？"},
    "department": {
      "type": "choice",
      "instructions": "应该由哪个团队处理？",
      "criteria": {
        "returns": "退款、换货或商品损坏",
        "shipping": "配送延迟或丢件",
        "billing": "收费、发票或支付问题"
      }
    },
    "frustration": {
      "type": "score",
      "instructions": "客户有多生气？",
      "criteria": ["平静", "不满", "非常生气"]
    }
  }
}
```

同一请求可包含多个问题，jev 会并行评估。

## 3. 调用方法

### 方法 A：curl（推荐，最直接）

```bash
curl -s -m 300 https://opencode.ai/zen/v1/systemone \
  -H "Authorization: Bearer $OPENCODE_API_KEY" \
  -H "Content-Type: application/json" \
  --data-binary @/tmp/opencode/jev_req.json
```

请求体较长（含中文或大段 state）时，先写入 JSON 文件，再用 `--data-binary @文件` 发送，避免 shell 转义问题。

### 方法 B：Python 生成请求体（避免手写转义）

```python
import json
req = {
    "model": "jev-1.13",
    "state": state_text,          # 字符串
    "questions": questions,       # 按上面格式的 dict
}
with open("/tmp/opencode/jev_req.json", "w", encoding="utf-8") as f:
    json.dump(req, f, ensure_ascii=False)
```

然后用方法 A 发送。

### 不要用的方式

- `opencode run -m opencode/jev-1.13 "..."`：会返回 `UnknownError`，因为 OpenCode CLI 把它当作对话模型。
- `opencode models` 列表中可能不显示 jev（列表刷新后仍不包含），不要依赖它判断模型是否可用。

## 4. 返回值读取

返回为 JSON，结构示例：

```json
{
  "model": "jev-1.13",
  "answers": {
    "is_urgent": {"type": "noul", "noul": 0.96},
    "frustration": {"type": "score", "score": 3.31, "confidence": 0.72,
                    "probabilities": {"0": 0, "1": 0, "2": 0.01, "3": 0.67, "4": 0.32}},
    "department": {"type": "choice", "choice": "returns",
                   "probabilities": {"returns": 0.8, "shipping": 0.1, "billing": 0.1}}
  },
  "usage": {"input_tokens": 290, "output_tokens": 23}
}
```

解读要点：
- `noul`：数值接近 1 表示“是”，接近 0 表示“否”，中间值表示不确定。
- `score`：`score` 是加权均值（0 到 criteria 长度减 1），可与 `probabilities` 一起看分布。`confidence` 低时结论不可靠。
- `choice`：取 `choice` 为最高概率选项，同时检查 `probabilities` 是否接近（接近说明模型不确定）。
- jev 只返回数值，不给理由。需要解释时，应由调用方补充说明或另行用对话模型解释。

## 5. 使用建议

- `state` 应包含完整、客观的事实描述；jev 只能根据 `state` 判断，无法访问外部页面。若要评估网页，需先提取关键代码、文字、结构，写入 `state`。
- 问题应拆分为独立、可判断的命题，每个问题只问一件事。
- 对 `choice` 和 `score` 的结果，若 `confidence` 或最高概率低于约 0.5，应标注为“不确定”，不要当作定论。
- 评估结论需人工复核关键问题，尤其是涉及物理公式、数值精度等场景。

## 6. 常见错误

| 错误信息 | 原因 | 处理 |
|---|---|---|
| `ModelProtocolUnsupported` | 用了 chat/responses/messages 端点 | 改用 `/zen/v1/systemone` |
| `FreeTierError` | 免费版在 OpenCode 外调用 | 改用付费版 `jev-1.13` |
| `UnknownError` / `Unexpected server error` | 通过 `opencode run` 调用，或服务端异常 | 改用 curl 直接调用 `systemone`，仍失败则记录 ref 并稍后重试 |
| 401 / 403 | 密钥无效或未开通 | 检查 `OPENCODE_API_KEY` 与 Zen 账户状态 |

## 7. 历史调用记录（供参考）

- 对 `physics-work/projectile-motion.html`（平抛运动演示）完成评估，提交了公式、标签一致性、移动端适配、整体质量、问题优先级等 5 个问题，结果详见对话记录。
