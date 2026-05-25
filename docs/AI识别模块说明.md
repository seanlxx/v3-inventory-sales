# AI 识别模块说明

本文档记录重构后的进货 / 销售 AI 识别模块边界、数据流和后续修改规则。

## 1. 重构目标

原来的进货识别和销售识别各自维护一套 AI 识别逻辑与弹窗 UI，导致一个页面修复后，另一个页面仍保留旧问题。现在改为“共享识别底座 + 业务差异封装”：

| 层级 | 职责 | 文件 |
| --- | --- | --- |
| 共享识别逻辑 | 图片读取、压缩、批量识别、SSE 请求、JSON 提取、通用提示词规则 | `frontend/app/composables/useAiRecognition.ts` |
| 共享识别 UI | 上传 / 粘贴图片、预览、识别进度、错误提示、结果表格外壳、底部操作区 | `frontend/app/components/ai/AiRecognitionDialog.vue` |
| 进货业务封装 | 进货提示词、供应商 / 日期 / 备注元数据、进货候选行归一化 | `frontend/app/composables/usePurchases.ts` |
| 销售业务封装 | 销售提示词、在售商品范围、销售候选行归一化、库存校验接入 | `frontend/app/composables/useSales.ts` |
| 进货确认弹窗 | 进货字段、人工修正、确认入账 payload | `frontend/app/components/purchases/PurchaseAiReviewDialog.vue` |
| 销售确认弹窗 | 销售字段、人工修正、确认入账 payload | `frontend/app/components/sales/SalesAiReviewDialog.vue` |

以后只要是“两个页面都应该一致”的能力，优先改共享文件；只有业务字段、提示词和入账校验不同，才改进货或销售自己的文件。

## 2. 模块数据流

```text
进货页面 / 销售页面
  |
  | 打开业务确认弹窗
  v
PurchaseAiReviewDialog.vue / SalesAiReviewDialog.vue
  |
  | 使用统一弹窗外壳
  v
AiRecognitionDialog.vue
  |
  | 上传、粘贴、预览、触发识别
  v
usePurchases.ts / useSales.ts
  |
  | 构造业务提示词、传入商品目录、处理识别结果
  v
useAiRecognition.ts
  |
  | 压缩图片、分批、请求 /api/ai-proxy?stream=1、解析 JSON
  v
functions/api/ai-proxy.js
```

## 3. 共享识别逻辑

`useAiRecognition.ts` 是进货和销售共用的 AI 识别底座，主要暴露这些能力：

| 能力 | 说明 |
| --- | --- |
| `AiRecognitionImage` | 统一图片结构，保存图片 id、文件名、预览地址、base64、mimeType、size |
| `AiRecognitionPromptOptions` | 统一提示词上下文，包含商品列表、批次图片、总批次数和当前批次 |
| `AI_PRODUCT_MATCHING_RULES` | 商品匹配通用规则，进货和销售提示词都应复用 |
| `AI_HUMAN_CONFIRMATION_RULE` | 人工确认通用规则，强调 AI 结果不能自动入账 |
| `extractAiJsonObject` | 从模型返回文本中提取 JSON 对象 |
| `roundAiMoney` | 统一金额四舍五入规则 |
| `readImageFiles` | 读取图片文件，生成预览和可发送给模型的 base64 |
| `requestAiStream` | 请求 `/api/ai-proxy?stream=1`，处理流式返回和进度文本 |
| `recognizeImageBatches` | 按批次识别多张图片，收集成功结果和失败警告 |

图片处理规则集中在共享模块内：

- 最大边长限制为 `1600`。
- 超过阈值的图片会压缩为 JPEG。
- JPEG 质量为 `0.84`。
- 默认每批识别 `4` 张图。

这些参数影响进货和销售两边，不要在业务弹窗里重复定义。

## 4. 共享 UI

`AiRecognitionDialog.vue` 只负责通用交互壳，不理解“进货价”“销售额”等业务含义。

它负责：

- 文件选择和拖入后的事件分发。
- 剪贴板图片粘贴入口。
- 图片缩略图、删除、预览大图。
- 识别中进度、错误、警告展示。
- 无图片、无结果、识别中等空状态。
- 结果表格的统一布局。
- 底部“手动添加 / 确认”操作区。
- 移动端堆叠和横向滚动。

业务弹窗通过插槽提供自己的字段和行内容：

| 插槽 | 用途 |
| --- | --- |
| `fields` | 顶部业务字段，例如进货日期、供应商、销售日期、机器编号等 |
| `rows` | 结果表格行，例如商品、数量、进货价、销售额等 |

业务弹窗不应再复制上传区、图片预览、识别按钮、进度条、错误提示、表格外壳。

## 5. 进货识别边界

进货侧代码集中在：

- `frontend/app/composables/usePurchases.ts`
- `frontend/app/components/purchases/PurchaseAiReviewDialog.vue`

进货侧负责：

- 构造进货识别提示词。
- 要求模型识别商品、数量、进货单价、供应商、日期、备注。
- 合并多批次识别到同一个进货候选列表。
- 根据商品目录匹配 `product_id`。
- 生成进货入账需要的 payload。

只影响进货的需求，例如“增加供应商识别规则”“进货价字段改名”“进货单备注识别得更细”，应该改这里。

## 6. 销售识别边界

销售侧代码集中在：

- `frontend/app/composables/useSales.ts`
- `frontend/app/components/sales/SalesAiReviewDialog.vue`

销售侧负责：

- 构造销售识别提示词。
- 只把在售商品传给识别上下文。
- 要求模型识别商品、数量、销售金额等销售候选行。
- 合并多批次识别结果。
- 接入销售确认前的库存校验和入账 payload。

只影响销售的需求，例如“销售金额识别规则调整”“售出数量字段校验”“销售确认时增加字段”，应该改这里。

## 7. 修改规则

| 需求类型 | 修改位置 |
| --- | --- |
| 进货和销售都要同步优化图片上传、粘贴、预览、进度、错误展示 | `AiRecognitionDialog.vue` |
| 进货和销售都要同步优化图片压缩、分批、AI 请求、JSON 解析 | `useAiRecognition.ts` |
| 进货和销售都要同步优化商品匹配原则 | `useAiRecognition.ts` 中的 `AI_PRODUCT_MATCHING_RULES` |
| 只改进货识别字段或进货提示词 | `usePurchases.ts` / `PurchaseAiReviewDialog.vue` |
| 只改销售识别字段或销售提示词 | `useSales.ts` / `SalesAiReviewDialog.vue` |
| AI 代理 provider、路由、密钥读取方式 | `functions/api/ai-proxy.js` |

新增能力时先判断是否属于共享能力。只要进货和销售都可能复用，就放在共享模块，避免再次出现两边行为不一致。

## 8. 回归测试

AI 识别相关测试入口：

```powershell
powershell -ExecutionPolicy Bypass -File ./scripts/test.ps1
```

其中与本模块直接相关的脚本：

| 脚本 | 说明 |
| --- | --- |
| `scripts/test-ai-recognition-contracts.mjs` | 检查共享模块、共享弹窗、进货 / 销售接入是否仍保持统一边界 |
| `scripts/test-ai-purchase-recognition.mjs` | 检查进货识别提示词和结构化结果契约 |
| `scripts/test-ai-product-match.mjs` | 检查商品匹配规则 |
| `scripts/test-ai-proxy-routing.mjs` | 检查 AI 代理路由 |

改了前端源码时还需要跑：

```powershell
powershell -ExecutionPolicy Bypass -File ./scripts/build.ps1
```

纯文档修改不需要单独跑前端构建，但提交后仍按项目规则执行部署脚本。

## 9. 安全与产品规则

- AI 识别结果只作为人工确认草稿，不能自动入账。
- 任何识别结果在确认前必须允许人工修改。
- 不要把 API Key、token 或 provider 密钥写进源码、Markdown 或测试输出。
- 业务 composable 不应绕过 `useAiRecognition.ts` 直接调用 `/api/ai-proxy`。
- 不要在进货和销售弹窗里复制同一套 UI。通用交互必须回到 `AiRecognitionDialog.vue`。
- 调整共享契约后，同步更新 `scripts/test-ai-recognition-contracts.mjs`，避免后续改动又把两边拆开。
