-- 0043: 投流归因落库（AB 站漏斗）
-- profiles.lead_source 存储首次触达的归因 JSON：
-- { src, medium, placement, subid, fbclid, utm_source, utm_medium, utm_campaign, utm_content, utm_term, ts }

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS lead_source jsonb;

COMMENT ON COLUMN profiles.lead_source IS
  'Ad attribution captured at signup (A-site subid / utm / fbclid), first-touch';

-- 按渠道/子 ID 归因分析用索引（部分索引，仅覆盖有归因的行）
CREATE INDEX IF NOT EXISTS idx_profiles_lead_source
  ON profiles USING gin (lead_source)
  WHERE lead_source IS NOT NULL;
