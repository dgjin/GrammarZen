-- 在用户配置表中增加「加密存储的大模型 API Key」字段
-- 执行后，前端可在个人中心配置 API Key，并以加密方式保存到此列

alter table public.grammarzen_user_configs
  add column if not exists encrypted_api_keys jsonb default '{}'::jsonb;

comment on column public.grammarzen_user_configs.encrypted_api_keys is 'Encrypted API keys by provider, e.g. {"gemini": "base64encrypted..."}';
