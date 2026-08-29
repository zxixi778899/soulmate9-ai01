# 🌐 RunPod API 超时（30s）与网络问题终极排查

## ❗ 错误现象

```
timeout: 30000ms
❌ API 请求超时 (>5 秒)
```

**核心原因**: 本地网络无法在合理时间内连接到 `api.runpod.ai`

---

## 🔍 立即诊断（3 分钟）

### Step 1: 检查网络连接

#### Windows PowerShell

```powershell
# 方法 A: ping 测试
ping api.runpod.ai -n 4

# 预期输出:
# 来自 1.x.x.x 的回复：bytes=32 time=XXms TTL=XXX
# 平均延迟 < 100ms = ✅ 正常
# Request timeout = ❌ 网络不通
```

#### 方法 B: nslookup DNS

```powershell
nslookup api.runpod.ai
```

**预期**: 
- ✅ 返回 IP 地址（如 `149.72.128.23`）
- ❌ "Could not find A record" = DNS 故障

---

### Step 2: 临时禁用防火墙/代理

**Windows 防火墙**:
```powershell
# 临时关闭防火墙（仅测试用！）
Set-NetFirewallProfile -Profile Domain,Public,Private -Enabled False

# 测试 API
pnpm run runpod:apikey

# 完成后立即重新开启！
Set-NetFirewallProfile -Profile Domain,Public,Private -Enabled True
```

**代理设置检查**:
```powershell
# 查看当前代理配置
netsh winhttp show proxy

# 如果使用了全局代理，添加例外
netsh winhttp add proxyexception "*.runpod.ai"

# 或者直接关闭代理（仅测试）
set HTTP_PROXY=http://localhost:7890  # → 删除此行
set HTTPS_PROXY=http://localhost:7890 # → 删除此行
```

---

### Step 3: 使用离线模式跳过实时 API 检查

如果你只需要确认捏脸功能是否正常（不关心 API 状态），可以：

```powershell
# 直接重启开发服务器，跳过 API 测试
pnpm dev
```

这样即使 API 超时也不会影响捏脸功能（只要后续实际生图时网络正常即可）。

---

## 🎯 常见场景与解决方案

### 场景 A: 在中国大陆开发环境

**问题特征**:
- API 响应时间 >10 秒
- 偶尔 401，偶尔成功
- Ping 延迟 > 200ms

**原因**: 网络跨国访问不稳定

**解决方案 1: 使用直连代理**
```bash
# 配置代理（仅限本地开发）
export HTTP_PROXY=http://127.0.0.1:7890
export HTTPS_PROXY=http://127.0.0.1:7890

# 测试
pnpm run runpod:apikey
```

**解决方案 2: 仅部署到 Vercel**
- 本地只做开发和代码提交
- Vercel 部署在海外，天然连通性好

---

### 场景 B: 公司网络限制

**问题特征**:
- Ping 完全不通
- 所有外部 API 都超时

**原因**: 公司防火墙阻止了 `runpod.ai`

**解决方案**:
```powershell
# 方案 1: 切换手机热点测试
# 断开公司 WiFi → 连接手机热点 → pnpm run runpod:apikey

# 方案 2: 联系 IT 部门放行域名
# 需要放行的域名列表:
#   api.runpod.ai
#   www.runpod.io
#   cloudflare.com (CDN)
```

---

### 场景 C: 家庭宽带问题

**问题特征**:
- 其他网站正常，只有 RunPod 超时

**原因**: ISP 路由问题或 IPv6 兼容性

**解决方案**:
```powershell
# 强制使用 IPv4（避免 IPv6 解析失败）
Resolve-DnsName api.runpod.ai -Type A

# 或者编辑 hosts 文件（高级）
notepad C:\Windows\System32\drivers\etc\hosts
# 手动添加（如果发现最佳节点 IP）
149.72.128.23 api.runpod.ai
```

---

## ⚡ 快速修复命令清单

### 优先尝试（按顺序执行）

```powershell
# 1️⃣ 基础网络检查
ping -n 4 api.runpod.ai

# 2️⃣ 清理 DNS 缓存（Windows）
ipconfig /flushdns

# 3️⃣ 短超时测试（新增的 5 秒版本）
pnpm run runpod:apikey

# 4️⃣ 如果仍然超时，直接重启开发服务器（跳过检测）
pnpm dev
```

---

## 🧪 诊断脚本输出分析

### 正常输出示例

```
🔑 RunPod API Key 诊断工具 (401 修复)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 API Key 检查:

  Length: 67 characters
  Prefix: rpa_MNOQ...
  ✅ Key 格式正确 (rpa_...)

🌐 端点配置:

  Endpoint ID: e40cgshtouocg8

🧪 测试 API 连接...

✅ 响应时间：<5 秒

Status Code: 200
✅ API 调用成功!
  Pod Status: ACTIVE
  GPU Model: NVIDIA RTX 4090

🎉 一切正常！捏脸功能应该可用了。
```

---

### 超时输出示例（已优化）

```
🔑 RunPod API Key 诊断工具 (401 修复)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 API Key 检查:

  Length: 67 characters
  Prefix: rpa_MNOQ...
  ✅ Key 格式正确 (rpa_...)

🧪 测试 API 连接...

⏰ API 请求超时 (>5 秒)，可能被防火墙/代理拦截

可能原因:
  ① 本地网络无法访问 runpod.ai
  ② Firewall/代理阻止了请求
  ③ DNS 解析失败或网络延迟过高

解决方案:
  1. 检查网络连接是否正常
  2. 尝试 ping api.runpod.ai
  3. 如果使用代理，确保排除了 *.runpod.ai
  4. 临时关闭防火墙测试
```

---

### 401 未授权输出示例

```
🔑 RunPod API Key 诊断工具 (401 修复)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 API Key 检查:

  ❌ Key 格式错误 - 这是 OpenAI/Together AI 的格式！
  💡 必须使用 RunPod 的 rpa_xxx 格式 Key

⚠️  检测到格式问题，跳过 API 测试

请首先修正 Key 格式后再运行测试
```

---

## 🛠️ 长期解决方案

### 方案 1: 配置环境变量中的超时控制

编辑 `.env.local`:

```bash
# 新增超时配置（让后续 API 调用也遵循此策略）
RUNPOD_API_TIMEOUT_MS=10000  # 10 秒超时（默认 30 秒）
```

然后在 API 调用代码中读取此值并设置 `AbortSignal.timeout()`。

---

### 方案 2: 使用 Vercel Edge Middleware（生产环境）

将 API 请求路由到 Vercel Edge Functions，利用其全球加速网络。

---

### 方案 3: 添加后端转发代理（企业级）

自建代理服务器中转 RunPod API 请求。

---

## 🆘 紧急回退方案

如果实在无法解决网络超时，但又能保证生图功能正常工作（说明实际运行时网络是通的），可以直接忽略超时警告：

```powershell
# 方法 1: 只测试 API Key 格式，不真正发起请求
node -e "console.log(process.env.RUNPOD_API_KEY?.slice(0,10))"

# 方法 2: 直接启动开发服务器
pnpm dev --no-lint  # 跳过所有自动检查
```

**核心原则**:
- 诊断脚本超时 ≠ 捏脸功能不可用
- 只要实际生图时能调用 RunPod API 就 OK

---

## 📊 性能监控建议

在生产环境，建议添加以下监控：

1. **API 响应时间分布**
   ```typescript
   // 记录每次 API 调用的耗时
   const start = Date.now();
   await fetch('https://api.runpod.ai/...');
   const duration = Date.now() - start;
   
   if (duration > 5000) {
     logger.warn('RunPod API slow', { duration });
   }
   ```

2. **超时重试机制**
   ```typescript
   async function runpodApiCall(maxRetries = 2) {
     for (let i = 0; i <= maxRetries; i++) {
       try {
         return await fetch(...);
       } catch (err) {
         if (i === maxRetries) throw err;
         await sleep(1000 * (i + 1)); // 指数退避
       }
     }
   }
   ```

3. **健康检查端点**
   - 在 `/api/runpod/health` 定期探测 RunPod API
   - 结果用于前端展示"服务可用性"状态

---

## 📞 仍无法解决？收集以下信息

1. **网络测试结果**:
   ```powershell
   ping api.runpod.ai -n 4
   nslookup api.runpod.ai
   ```

2. **诊断脚本完整输出** (`pnpm run runpod:apikey`)

3. **环境变量截图**:
   - 确认 `RUNPOD_API_KEY` 和 `RUNPOD_ENDPOINT_ID_FLUX` 已配置

4. **实际生图日志**:
   - 捏脸页面点击"生成立绘"后的控制台输出

---

**最后更新**: 2026-08-30  
**版本**: v1.0
