-- ============================================
-- 管理员权限恢复脚本（兼容不同版本）
-- 适用账号：admin888@oxmate.com
-- ============================================

-- 📋 步骤 1: 检查当前 profiles 表结构
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'profiles' 
ORDER BY ordinal_position;

-- 🔧 步骤 2: 如果缺少 timestamp 字段，添加它们（仅首次运行）
-- 注意：如果这些字段已经存在，会报错忽略即可

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ⚡ 步骤 3: 直接设置管理员权限（无需时间戳字段）
-- 方法 A: 更新已有记录
UPDATE profiles 
SET 
  role = 'superadmin',               -- 授予超级管理员权限
  membership_tier = 'unlimited',     -- 无限会员
  credits_remaining = 9999,          -- 大量积分
  updated_at = NOW()                 -- 仅在有该字段时执行
WHERE email = 'admin888@oxmate.com';

-- 方法 B: 如果没有 profile 记录，创建一条
-- 不依赖 time stamp 字段，完全兼容的创建语句
INSERT INTO profiles (user_id, email, role, membership_tier, credits_remaining)
SELECT 
  u.id as user_id,
  u.email as email,
  'superadmin' as role,              -- ← 关键：超级管理员权限
  'unlimited' as membership_tier,    -- ← 无限会员
  9999 as credits_remaining,         -- ← 大量积分
  NOW(),                             -- 如果使用 create_at
  NOW()                              -- 如果使用 updated_at
FROM auth.users u
LEFT JOIN profiles p ON u.id = p.user_id
WHERE u.email = 'admin888@oxmate.com'
  AND p.id IS NULL;

-- ✅ 步骤 4: 验证设置成功
SELECT 
  user_id,
  email,
  COALESCE(role, 'null') as role,           -- 应该显示：superadmin
  COALESCE(membership_tier, 'null') as membership_tier,  -- 应该显示：unlimited
  COALESCE(credits_remaining::text, 'null') as credits_remaining,
  COALESCE(created_at::text, 'null') as created_at,
  COALESCE(updated_at::text, 'null') as updated_at
FROM profiles 
WHERE email = 'admin888@oxmate.com';

-- 🎯 说明：
-- role = 'superadmin' 或 'admin' 都能访问 /admin 后台
-- superadmin 包含所有最高权限（如生产环境特殊操作）  
-- admin 可以访问所有标准管理功能（ComfyConsole + Gen Presets 编辑）
-- 
-- 如果上面 SELECT 返回空行，说明该用户还没有 profile 记录，
-- INSERT 语句会自动创建一条
