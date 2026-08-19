# RunPod Multi-Endpoint Health Check Script

## Usage

```powershell
.\test-endpoints.ps1
```

## Features

1. Tests all configured endpoints simultaneously
2. Shows response time and status
3. Validates checkpoint availability
4. Generates correlation ID for tracing
5. Provides detailed diagnostics

---

## What to Look For

✅ **Good Configuration:**
```
Primary FLUX (wozrrlcdipyl3p):     ✅ Online | 20ms | RUNNING | vGPU:A100
SDXL Fallback (kbca2e380jc74s):   ✅ Online | 25ms | RUNNING | vGPU:RTX4090
Backup FLUX:                        ✅ Same as primary
```

⚠️ **Needs Attention:**
```
Primary FLUX:                       ❌ OFFLINE or 404 Not Found
SDXL Fallback:                      ⚠️ IN_QUEUE with long wait time
Both offline:                       🚨 Switch to backup endpoint
```

---

## Troubleshooting

### Problem: "404 Not Found"

**Cause:** Endpoint deleted or suspended in RunPod Console

**Solution:**
1. Login to https://runpod.ai/console
2. Go to Serverless → Endpoints  
3. Find your ComfyUI worker (look for "ComfyUI", "FLUX", "Image Generation")
4. Copy the Endpoint ID from URL or list
5. Update `.env.local`:
   ```bash
   RUNPOD_ENDPOINT_ID=new-working-id-here
   ```

### Problem: "IN_QUEUE for > 5 minutes"

**Cause:** Worker overloaded or scaling limits hit

**Solutions:**
1. Manual restart in RunPod Console
2. Wait and retry
3. Add a second endpoint for failover
4. Upgrade GPU tier (more resources = faster startup)

### Problem: "NO_CAPACITY" or "Insufficient GPU"

**Cause:** RunPod region out of GPU inventory

**Solution:**
1. Try different region (US, EU, Asia)
2. Use multiple endpoints across regions
3. Consider dedicated instance (reserved capacity)

---

## Expected Output Example

```powershell
[1] Testing Primary FLUX Endpoint...
Status: ONLINE
Name: comfy-default (wozrrlcdipyl3p)
Pod Status: RUNNING
Response Time: 23ms
✅ Ready for generation!

[2] Testing SDXL Fallback...
Status: ONLINE
Name: sdxl-worker-prod (kbca2e380jc74s)
Pod Status: RUNNING  
Response Time: 31ms
✅ Ready for fallback!

==================================================
CONCLUSION: All endpoints operational
Correlation ID: rp_1724006800_healthcheck
Ready to deploy!
==================================================
```
