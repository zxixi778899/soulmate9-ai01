-- ============================================
-- 为 admin888@oxmate.com 授予管理员权限
-- ============================================

-- 方法 1: 直接修改 profiles.role（推荐）
UPDATE profiles 
SET role = 'admin' 
WHERE email = 'admin888@oxmate.com';

-- 如果没有 records，创建一条新的 profile 记录
INSERT INTO profiles (user_id, email, role, membership_tier, credits_remaining, created_at, updated_at)
SELECT 
  u.id as user_id,
  u.email as email,
  'admin' as role,
  'free' as membership_tier,
  50 as credits_remaining,
  NOW() as created_at,
  NOW() as updated_at
FROM auth.users u
LEFT JOIN profiles p ON u.id = p.user_id
WHERE u.email = 'admin888@oxmate.com'
  AND p.id IS NULL;

-- ============================================
-- 可选：添加邮箱白名单作为备用方案
-- ============================================
-- 在 Vercel 环境变量中添加：
-- ALLOWED_ADMIN_EMAILS=admin888@oxmate.com
-- 然后 Redeploy 部署

-- 验证查询：确认管理员权限已正确设置
SELECT 
  user_id,
  email,
  role,
  membership_tier,
  credits_remaining,
  created_at,
  updated_at
FROM profiles 
WHERE email = 'admin888@oxmate.com';
