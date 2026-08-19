# 🚀 灰度发布检查清单 - IP-Adapter 面部一致性优化

## Pre-Flight Checklist (部署前)

### ✅ Code Quality

- [x] TypeScript 编译通过 (`pnpm ts-check`)
- [x] ESLint 无错误 (`pnpm lint:build`)
- [ ] Unit tests pass (`pnpm test`)
- [ ] Integration tests documented

### ✅ Configuration

- [ ] `RUNPOD_IP_ADAPTER_FILENAME` env var set
- [ ] `RUNPOD_CLIP_VISION_MODEL` optional override configured
- [ ] RunPod worker has IP-Adapter custom nodes installed
- [ ] IP-Adapter model files present on worker (`/models/ipadapter-flux/`)
- [ ] Feature flag accessible via database (for gradual rollout)

### ✅ Documentation

- [x] `FACE_CONSISTENCY_FIX.md` created
- [x] `FACE_CONSISTENCY_FIX_REPORT.md` completed  
- [x] `IP_ADAPTER_E2E_TESTING_GUIDE.md` ready
- [x] Test script `scripts/test-ipadapter-e2e.js` available

---

## Stage 0: Staging Environment (Day 1)

### Deployment

```bash
# Deploy to staging
vercel deploy --prod --token $VERCEL_STAGING_TOKEN

# Wait for deployment
vercel ls --token $VERCEL_STAGING_TOKEN
```

**Checklist**:
- [ ] Staging URL active and responding
- [ ] No console errors in browser
- [ ] Network tab shows successful API calls
- [ ] Database connection established

### Smoke Tests

```bash
# Run E2E test suite
pnpm test:e2e-ipadapter

# Manual check: Create new companion
1. Navigate to /create
2. Fill out basic info
3. Generate 4 portraits
4. Verify all 4 use same identity anchor
5. Check logs: `identityReference: enabled/disabled`
```

**Expected Results**:
- [ ] New companion creation succeeds
- [ ] `face_reference_url` auto-populated after first generation
- [ ] Second generation uses IP-Adapter
- [ ] RunPod job JSON contains IP-Adapter nodes (30, 31, 33/34)
- [ ] Latency <15s (from request to response)
- [ ] Success rate >95%

### Metrics Verification

**RunPod Job Logs** (check at least 5 jobs):

```bash
# Look for these patterns in ComfyUI workflow JSON:
grep -A 20 "ApplyIPAdapterFlux" job_*.json
```

**Key Indicators**:
- ✓ Node 30 (`ApplyIPAdapterFlux`) present
- ✓ Weight ~0.78
- ✓ start_percent = 0.05
- ✓ end_percent = 0.85
- ✓ weight_type = 'linear'

**Supabase Queries**:
```sql
-- Check face_reference_url population
SELECT COUNT(*) FROM girlfriends 
WHERE face_reference_url IS NOT NULL 
  AND created_at > NOW() - INTERVAL '1 hour';

-- Monitor empty reference rates
SELECT 
  created_at::date,
  COUNT(*) FILTER (WHERE face_reference_url IS NULL) as missing_count,
  COUNT(*) FILTER (WHERE face_reference_url IS NOT NULL) as present_count
FROM girlfriends 
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY created_at;
```

**Alert Thresholds**:
- ❌ Missing `face_reference_url` rate >10%
- ❌ Average latency >20s
- ❌ Error rate >5%

---

## Stage 1: 10% Traffic Rollout (Day 2-3)

### Enable Gradual Rollout

**Option A: Feature Flag (Recommended)**

Create database migration to control rollout:

```sql
-- db/migrations/0045_ip_adapter_feature_flag.sql
INSERT INTO site_settings (key, json_data, is_active)
VALUES (
  'current',
  '{
    "feature_flags": {
      "ip_adapter_identity": true,
      "ip_adapter_rollout_percent": 10
    }
  }'::jsonb,
  true
) ON CONFLICT (key) DO UPDATE SET
  json_data = jsonb_set(
    json_data::jsonb,
    '{feature_flags.ip_adapter_rollout_percent}',
    '10'::jsonb
  )::jsonb;
```

**Option B: Direct DB Update**

```sql
UPDATE site_settings
SET json_data = jsonb_set(
  json_data::jsonb,
  '{feature_flags}',
  '{"ip_adapter_identity": true}'::jsonb
)::jsonb
WHERE key = 'current';
```

### Monitoring Dashboard

Set up实时监控 (monitoring dashboard) with:

| Metric | Target | Alert Threshold | Action |
|--------|--------|-----------------|--------|
| Success Rate | >98% | <95% | Investigate |
| Avg Latency | <12s | >20s | Consider rollback |
| OOM Errors | <1% | >5% | **Rollback** |
| Missing Identity Ref | N/A | >10% | Check data pipeline |
| User Complaints | 0 | >3/day | Review quality |

**Vercel Analytics Setup**:
```javascript
// Add to src/lib/analytics.ts
capture('ip_adapter_enabled', { 
  success: result.success,
  latency_ms: result.latency_ms,
  identity_used: !!result.identityReference
});
```

### 24-Hour Checkpoint

After 24 hours of 10% traffic:

```bash
# Query aggregated metrics
SELECT 
  DATE_TRUNC('hour', created_at) as hour,
  COUNT(*) FILTER (WHERE error IS NULL) as successes,
  COUNT(*) FILTER (WHERE error IS NOT NULL) as failures,
  AVG(latency_ms) FILTER (WHERE error IS NULL) as avg_latency
FROM generation_jobs 
WHERE feature_name = 'ip_adapter'
  AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour;
```

**Decision Criteria**:

✅ Proceed to 50% if:
- Success rate ≥97%
- Avg latency ≤15s
- No critical errors (OOM, crash)
- User feedback neutral or positive

❌ Rollback if:
- Success rate <95%
- OOM errors >10%
- Multiple user complaints about inconsistent faces
- Latency >25s consistently

---

## Stage 2: 50% → 100% Rollout (Day 4-7)

### Day 4: Increase to 50%

```sql
-- Update feature flag
UPDATE site_settings
SET json_data = jsonb_set(
  json_data::jsonb,
  '{feature_flags.ip_adapter_rollout_percent}',
  '50'::jsonb
)::jsonb
WHERE key = 'current';
```

**Focus Areas**:
- GPU utilization stability
- Memory pressure monitoring
- Queue processing time

### Day 5: Full Rollout (100%)

```sql
UPDATE site_settings
SET json_data = jsonb_set(
  json_data::jsonb,
  '{feature_flags.ip_adapter_rollout_percent}',
  '100'::jsonb
)::jsonb
WHERE key = 'current';
```

### Final Validation

Run comprehensive checks:

**Identity Preservation Test**:
```typescript
// Simulate real usage
const gfIds = ['id1', 'id2', 'id3']; // Different companions
const results = await Promise.all(gfIds.map(id => generatePortrait(id)));

// Compare similarities
results.forEach((result, i) => {
  console.log(`Companion ${i}:`, {
    identity_anchor: result.anchorUrl,
    similarity_to_first_generation: calculateSimilarity(result.image, initialImage),
  });
});
```

**Business Metrics**:
- Support ticket volume (should not spike)
- User engagement (chat frequency)
- Image generation satisfaction scores
- Return visit rate

---

## Rollback Procedure

### Emergency Rollback Steps

If any critical issue detected:

**Step 1: Disable Feature Flag**

```sql
UPDATE site_settings
SET json_data = jsonb_set(
  json_data::jsonb,
  '{feature_flags.ip_adapter_identity}',
  'false'::jsonb
)::jsonb
WHERE key = 'current';
```

**Step 2: Vercel Rollback (if code issue)**

```bash
vercel rollback --token $VERCEL_ADMIN_TOKEN
```

**Step 3: Notify Stakeholders**

- Slack channel: `#backend-alerts`
- Email: Product Manager, Engineering Lead
- Jira ticket: Create incident report

**Step 4: Post-Mortem Analysis**

Document:
- What happened
- Root cause
- Timeline
- Lessons learned
- Prevention measures

---

## Post-Rollout Checklist (Week 2+)

### Long-term Monitoring

- [ ] Weekly review of identity preservation quality
- [ ] Monthly analysis of GPU cost impact
- [ ] Quarterly user satisfaction survey

### Optimization Opportunities

- [ ] Tune IP-Adapter weight per task type
- [ ] Add fallback for failed identity resolution
- [ ] Optimize anchor image selection logic
- [ ] Consider InstantID for even stronger consistency

### Knowledge Base Updates

- [ ] Update ARCHITECTURE.md with IP-Adapter integration details
- [ ] Document runpod setup requirements
- [ ] Add troubleshooting guide to internal wiki

---

## Sign-off Templates

### Approval from Backend Lead

```
I approve the deployment of IP-Adapter facial identity preservation
to staging environment.

Name: ________________
Date: ________________
Signature: ___________
```

### Approval to Proceed to 50%

```
Based on 24h monitoring at 10% traffic, I recommend proceeding
to 50% rollout.

Issues Found: None / [List any issues]
Recommendation: Proceed / Hold / Rollback

Name: ________________
Date: ________________
Signature: ___________
```

### Final Approval (Production Ready)

```
All Stage 2 checks passed. System is stable at 100% traffic.
Ready for long-term monitoring.

Name: ________________
Date: ________________
Signature: ___________
```

---

*Created: August 17, 2026*  
*Owner: Backend Engineering Team*  
*Last Updated: August 17, 2026*
