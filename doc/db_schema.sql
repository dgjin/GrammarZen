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

-- 3. 启用行级安全性 (Row Level Security - RLS)
-- 这一步至关重要，确保前端直接访问数据库时，用户只能看到自己的数据
alter table public.grammarzen_user_configs enable row level security;
alter table public.grammarzen_rule_libraries enable row level security;

-- 4. 配置 grammarzen_user_configs 表的安全策略 (Policies)

-- 允许用户查询自己的配置
create policy "Users can select their own config"
  on public.grammarzen_user_configs for select
  using (auth.uid() = user_id);

-- 允许用户插入自己的配置 (通常在第一次保存时)
create policy "Users can insert their own config"
  on public.grammarzen_user_configs for insert
  with check (auth.uid() = user_id);

-- 允许用户更新自己的配置
create policy "Users can update their own config"
  on public.grammarzen_user_configs for update
  using (auth.uid() = user_id);

-- 5. 配置 grammarzen_rule_libraries 表的安全策略 (Policies)

-- 允许用户查询自己的规则库
create policy "Users can select their own rules"
  on public.grammarzen_rule_libraries for select
  using (auth.uid() = user_id);

-- 允许用户创建新的规则库
create policy "Users can insert their own rules"
  on public.grammarzen_rule_libraries for insert
  with check (auth.uid() = user_id);

-- 允许用户更新自己的规则库
create policy "Users can update their own rules"
  on public.grammarzen_rule_libraries for update
  using (auth.uid() = user_id);

-- 允许用户删除自己的规则库
create policy "Users can delete their own rules"
  on public.grammarzen_rule_libraries for delete
  using (auth.uid() = user_id);

-- 6. (可选) 实时订阅支持
-- 如果需要在前端实时监听数据变化，可以打开 realtime
begin;
  drop publication if exists supabase_realtime;
  create publication supabase_realtime;
commit;
alter publication supabase_realtime add table public.grammarzen_user_configs;
alter publication supabase_realtime add table public.grammarzen_rule_libraries;

-- 7. 配置存储桶 (Storage) - 头像上传
-- 创建一个名为 'avatars' 的公开存储桶
-- 注意：storage schema 是 Supabase 内置的
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- 设置存储桶策略 (Policies)
-- 针对 storage.objects 表设置 RLS，确保用户只能上传/修改自己的文件

-- 策略 7.1: 允许所有人读取 avatars 桶中的文件 (公开访问)
create policy "Avatar images are publicly accessible"
  on storage.objects for select
  using ( bucket_id = 'avatars' );

-- 策略 7.2: 允许已登录用户上传文件到 avatars 桶
-- Supabase Storage 会自动将 owner 字段设置为当前用户的 UUID
create policy "Authenticated users can upload avatars"
  on storage.objects for insert
  with check ( bucket_id = 'avatars' and auth.role() = 'authenticated' );

-- 策略 7.3: 允许用户更新自己的文件 (owner = auth.uid())
create policy "Users can update their own avatars"
  on storage.objects for update
  using ( bucket_id = 'avatars' and auth.uid() = owner );

-- 策略 7.4: 允许用户删除自己的文件
create policy "Users can delete their own avatars"
  on storage.objects for delete
  using ( bucket_id = 'avatars' and auth.uid() = owner );
