# AI 识别模块说明

本文档记录进货 / 销售 AI 识别的共享边界和修改入口。

## 模块边界

| 层级 | 职责 | 文件 |
| --- | --- | --- |
| 共享识别逻辑 | 图片读取、压缩、分批识别、SSE 请求、JSON 提取、通用匹配规则 | `frontend/app/composables/useAiRecognition.ts` |
| 共享识别 UI | 上传 / 粘贴、预览、识别进度、错误、警告、结果表格外壳、底部操作区 | `frontend/app/components/ai/AiRecognitionDialog.vue` |
| 进货封装 | 进货提示词、供应商 / 日期 / 备注、候选行归一化、入账 payload | `frontend/app/composables/usePurchases.ts`、`PurchaseAiReviewDialog.vue` |
| 销售封装 | 销售提示词、在售商品范围、候选行归一化、库存校验、入账 payload | `frontend/app/composables/useSales.ts`、`SalesAiReviewDialog.vue` |
| 服务端代理 | provider 路由、密钥读取、流式响应 | `functions/api/ai-proxy.js` |

只要进货和销售都需要一致，优先改共享文件；只有业务字段、提示词、入账校验不同，才改对应业务文件。

## 数据流

```text
进货页 / 销售页
  -> PurchaseAiReviewDialog / SalesAiReviewDialog
  -> AiRecognitionDialog
  -> usePurchases / useSales
  -> useAiRecognition
  -> /api/ai-proxy?stream=1
```

## 共享规则

- 图片最大边长 `1600`。
- 超阈值图片压缩为 JPEG，质量 `0.84`。
- 默认每批识别 `4` 张图。
- 商品匹配通用规则放在 `AI_PRODUCT_MATCHING_RULES`。
- AI 结果只能作为人工确认草稿，确认前必须允许修改。
- 业务 composable 不应绕过 `useAiRecognition.ts` 直接请求 `/api/ai-proxy`。

## 修改入口

| 需求 | 修改位置 |
| --- | --- |
| 上传、粘贴、预览、进度、错误、底部操作区 | `AiRecognitionDialog.vue` |
| 图片压缩、分批、AI 请求、JSON 解析 | `useAiRecognition.ts` |
| 商品匹配原则 | `useAiRecognition.ts` |
| 进货识别字段或提示词 | `usePurchases.ts` / `PurchaseAiReviewDialog.vue` |
| 销售识别字段或提示词 | `useSales.ts` / `SalesAiReviewDialog.vue` |
| AI provider、路由、密钥读取 | `functions/api/ai-proxy.js` |

## 回归

```powershell
powershell -ExecutionPolicy Bypass -File ./scripts/test.ps1
powershell -ExecutionPolicy Bypass -File ./scripts/build.ps1
```

纯文档修改不需要前端构建。调整共享契约后，同步更新 `scripts/test-ai-recognition-contracts.mjs`。
