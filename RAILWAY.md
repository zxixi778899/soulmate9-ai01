# Railway 部署指南（5 分钟）

> 自动部署：GitHub push → Railway 自动构建 → 部署到生产。
> 详细步骤见 [../docs/DEPLOY.md](../docs/DEPLOY.md)

## 一键部署

1. 打开 https://railway.app/new
2. 选择 **Deploy from GitHub repo** → 选 `soulmate9`
3. Railway 自动检测到 `Dockerfile` 开始构建
4. 配置环境变量（详见 [DEPLOY.md 第 4 节](../docs/DEPLOY.md#4-环境变量完整清单)）
5. 添加 Custom Domain `soulmateai.shop`
6. 等待部署完成（5-10 分钟）

## 自动部署流程

```
git push origin main
        ↓
GitHub webhook → Railway
        ↓
Dockerfile build (3-5 min)
        ↓
Container start
        ↓
Healthcheck pass → Green ✅
        ↓
Domain DNS propagate → https://soulmateai.shop 可访问
```

## 预览部署（PR 环境）

Railway 默认对每个 PR 创建独立预览部署：
- 域名：`pr-123.soulmateai.shop.up.railway.app`
- 用独立的 Preview 环境变量（可在 Vercel 风格下分别配置）
- PR 合并 → 预览自动销毁

## 监控

| 维度 | 工具 |
|---|---|
| 运行时日志 | Railway Dashboard → Logs |
| 性能 / 错误 | Sentry |
| 用户行为 | PostHog |
| 业务指标 | /admin/dashboard |
| 容量 / 成本 | Railway → Usage |

## 容量 / 成本预估（Railway）

| MAU | 月成本 | 备注 |
|---|---|---|
| 100 | $10-15 | Hobby plan 起步 |
| 500 | $30-50 | 标准负载 |
| 1000 | $80-120 | 需扩到 2 副本 + 大内存 |
| 5000 | $400-600 | 需考虑迁移到自托管 |

详细费用模型见 [../docs/RUNBOOK.md 容量规划](../docs/RUNBOOK.md#容量规划)。

## 故障排查

### 构建失败

```bash
# 本地复现
docker build -t soulmate9:test .

# 常见错误：
# 1. pnpm-lock.yaml 与 package.json 不一致 → pnpm install --no-frozen-lockfile
# 2. node_modules 体积超限 → 检查 serverExternalPackages
# 3. 内存 OOM → 升级 Railway plan
```

### 启动后 502

```bash
# Railway Logs 查看启动日志
# 常见：
# 1. env 缺失 → 报错 "process.env.X is undefined"
# 2. Coze Proxy 连不上 → 检查网络
# 3. R2 签名 URL 失败 → 检查 OSS_ACCESS_KEY_*
```

### 健康检查失败

`HEALTHCHECK` 默认 GET `/`。如果首页慢（>5s），改为：
```dockerfile
HEALTHCHECK CMD curl -f http://localhost:3000/api/health || exit 1
```

## 升级路径

| 阶段 | 方案 |
|---|---|
| MVP（< 500 MAU） | Railway Hobby + 1 副本 |
| 成长期（500-2000 MAU） | Railway Pro + 2 副本 + 4GB |
| 稳定期（> 2000 MAU） | 评估自托管 VPS（Hetzner CX42） |
| 规模化（> 10000 MAU） | 多区域部署 + 自建 CDN |