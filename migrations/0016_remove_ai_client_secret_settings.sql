UPDATE vending_records
SET
  data = json_set(
    data,
    '$.value',
    json_remove(
      json_extract(data, '$.value'),
      '$.opencode.apiKey',
      '$.opencode.apiKeyMasked',
      '$.opencode.baseUrl',
      '$.qwen.apiKey',
      '$.qwen.apiKeyMasked',
      '$.qwen.baseUrl',
      '$.deepseek.apiKey',
      '$.deepseek.apiKeyMasked',
      '$.deepseek.baseUrl',
      '$.claude.apiKey',
      '$.claude.apiKeyMasked',
      '$.claude.baseUrl',
      '$.yunwu.apiKey',
      '$.yunwu.apiKeyMasked',
      '$.yunwu.baseUrl'
    )
  ),
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE store = 'settings'
  AND record_id = 'aiClientConfigs'
  AND json_valid(data);
