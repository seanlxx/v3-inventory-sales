import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = dirname(scriptDir);

function readProjectFile(...segments) {
  return readFileSync(join(root, ...segments), 'utf8');
}

const sharedComposable = readProjectFile('frontend', 'app', 'composables', 'useAiRecognition.ts');
const purchasesComposable = readProjectFile('frontend', 'app', 'composables', 'usePurchases.ts');
const salesComposable = readProjectFile('frontend', 'app', 'composables', 'useSales.ts');
const sharedDialog = readProjectFile('frontend', 'app', 'components', 'ai', 'AiRecognitionDialog.vue');
const purchaseDialog = readProjectFile('frontend', 'app', 'components', 'purchases', 'PurchaseAiReviewDialog.vue');
const salesDialog = readProjectFile('frontend', 'app', 'components', 'sales', 'SalesAiReviewDialog.vue');

assert.match(
  sharedComposable,
  /\/ai-proxy\?stream=1/,
  'shared AI recognition composable should own the server-side AI proxy stream call'
);

assert.match(
  sharedComposable,
  /apiKey: string/,
  'shared AI recognition composable should require a per-request API key'
);

assert.match(
  sharedComposable,
  /AI 结果只用于人工确认，不能自动入账/,
  'shared AI recognition prompt rules must keep AI results out of automatic posting'
);

assert.match(
  sharedComposable,
  /AI_PRODUCT_MATCHING_RULES/,
  'shared AI recognition composable should own common product matching prompt rules'
);

for (const [label, source] of [
  ['purchase', purchasesComposable],
  ['sales', salesComposable]
]) {
  assert.match(
    source,
    /useAiRecognition\(\)/,
    `${label} AI recognition should use the shared recognition composable`
  );
  assert.doesNotMatch(
    source,
    /\/ai-proxy\?stream=1/,
    `${label} composable should not call the AI proxy directly`
  );
  assert.match(
    source,
    /AI_PRODUCT_MATCHING_RULES/,
    `${label} prompt should include the shared product matching rules`
  );
  assert.match(
    source,
    /recognizeImageBatches/,
    `${label} recognition should use the shared image batch flow`
  );
  assert.match(
    source,
    /useAiSessionKey\(\)/,
    `${label} recognition should read the current login session AI key`
  );
  assert.match(
    source,
    /apiKey,\s*\n\s*images:/,
    `${label} recognition should pass the current login session AI key into the shared flow`
  );
}

assert.match(
  sharedDialog,
  /useClipboardImagePaste/,
  'shared AI recognition dialog should own paste-to-upload behavior'
);

assert.match(
  sharedDialog,
  /class="ai-recognition__image-lightbox"/,
  'shared AI recognition dialog should own image preview lightbox UI'
);

assert.match(
  sharedDialog,
  /multiple @change="handleFileChange"/,
  'shared AI recognition dialog should support selecting multiple images at once'
);

for (const [label, source] of [
  ['purchase', purchaseDialog],
  ['sales', salesDialog]
]) {
  assert.match(
    source,
    /<AiRecognitionDialog/,
    `${label} AI review dialog should render the shared AI recognition dialog`
  );
  assert.doesNotMatch(
    source,
    /useClipboardImagePaste/,
    `${label} AI review dialog should not duplicate paste upload behavior`
  );
  assert.doesNotMatch(
    source,
    /type="file" accept="image\/\*" multiple/,
    `${label} AI review dialog should not duplicate upload control markup`
  );
}

console.log('AI recognition shared logic and UI contract tests passed');
