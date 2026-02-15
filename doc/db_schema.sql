-- GrammarZen Supabase Database Schema

-- 1. 用户配置表 (grammarzen_user_configs)
-- 用于存储用户的个性化设置：白名单和敏感词库
-- User ID 直接关联 Supabase Auth 的 users 表
create table public.grammarzen_user_configs (
  user_id uuid not null references auth.users on delete cascade,
  whitelist jsonb default '[]'::jsonb,
  sensitive_words jsonb default '[]'::jsonb,
  updated_at timestamp with time zone default timezone('utc'::text, now()),
  primary key (user_id)
);

-- 2. 规则库表 (grammarzen_rule_libraries)
-- 用于存储用户自定义的校验规则集
create table public.grammarzen_rule_libraries (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  description text,
  rules jsonb default '[]'::jsonb, -- 存储规则字符串数组
  created_at bigint not null -- 存储时间戳
);

-- 3. 历史记录表 (grammarzen_history)
-- 用于存储用户的校对历史记录
create table public.grammarzen_history (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references auth.users on delete cascade,
  original_text text, -- 存储原文 (如果是长文本)
  file_name text,     -- 如果是文件上传
  file_type text,     -- 文件类型
  check_mode text,    -- 校对模式
  summary text,       -- 摘要
  score integer,      -- 评分
  result_json jsonb,  -- 完整的 ProofreadResult 对象
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 4. 启用行级安全性 (Row Level Security - RLS)
alter table public.grammarzen_user_configs enable row level security;
alter table public.grammarzen_rule_libraries enable row level security;
alter table public.grammarzen_history enable row level security;

-- 5. 配置 grammarzen_user_configs 表的安全策略 (Policies)

create policy "Users can select their own config"
  on public.grammarzen_user_configs for select
  using (auth.uid() = user_id);

create policy "Users can insert their own config"
  on public.grammarzen_user_configs for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own config"
  on public.grammarzen_user_configs for update
  using (auth.uid() = user_id);

-- 6. 配置 grammarzen_rule_libraries 表的安全策略 (Policies)

create policy "Users can select their own rules"
  on public.grammarzen_rule_libraries for select
  using (auth.uid() = user_id);

create policy "Users can insert their own rules"
  on public.grammarzen_rule_libraries for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own rules"
  on public.grammarzen_rule_libraries for update
  using (auth.uid() = user_id);

create policy "Users can delete their own rules"
  on public.grammarzen_rule_libraries for delete
  using (auth.uid() = user_id);

-- 7. 配置 grammarzen_history 表的安全策略 (Policies)

create policy "Users can select their own history"
  on public.grammarzen_history for select
  using (auth.uid() = user_id);

create policy "Users can insert their own history"
  on public.grammarzen_history for insert
  with check (auth.uid() = user_id);

create policy "Users can delete their own history"
  on public.grammarzen_history for delete
  using (auth.uid() = user_id);

-- 8. (可选) 实时订阅支持
begin;
  drop publication if exists supabase_realtime;
  create publication supabase_realtime;
commit;
alter publication supabase_realtime add table public.grammarzen_user_configs;
alter publication supabase_realtime add table public.grammarzen_rule_libraries;
-- 历史记录通常不需要实时推送到所有客户端，暂不添加

-- 9. 配置存储桶 (Storage) - 头像上传
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "Avatar images are publicly accessible"
  on storage.objects for select
  using ( bucket_id = 'avatars' );

create policy "Authenticated users can upload avatars"
  on storage.objects for insert
  with check ( bucket_id = 'avatars' and auth.role() = 'authenticated' );

create policy "Users can update their own avatars"
  on storage.objects for update
  using ( bucket_id = 'avatars' and auth.uid() = owner );

create policy "Users can delete their own avatars"
  on storage.objects for delete
  using ( bucket_id = 'avatars' and auth.uid() = owner );