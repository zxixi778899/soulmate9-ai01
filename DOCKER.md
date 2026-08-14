# SoulMate AI - Docker Local Development Setup 🐳

## 🚀 Quick Start (3 分钟上手)

### 前提条件
- ✅ Docker Desktop installed (Windows/Mac/Linux)
- ✅ Git installed
- ✅ At least 4GB RAM available

### 步骤 1: Clone 项目
```bash
git clone https://github.com/your-org/soulmate9.git
cd soulmate9
```

### 步骤 2: Create `.env.local`
```bash
cp .env.example .env.local
```

编辑 `.env.local`:
```bash
# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sm9_dev

# Supabase Mock (local dev only)
NEXT_PUBLIC_SUPABASE_URL=http://localhost:8000
NEXT_PUBLIC_SUPABASE_ANON_KEY=test-anon-key

# Redis
UPSTASH_REDIS_URL=http://localhost:6379

# MinIO Storage
AWS_ACCESS_KEY_ID=admin
AWS_SECRET_ACCESS_KEY=password123
MINIO_ENDPOINT=localhost:9000
```

### 步骤 3: Start Services
```bash
docker compose up -d
```

等待服务启动（约 1-2 分钟）:
```
🐳 Starting PostgreSQL...
🐳 Starting Redis...
🐳 Starting MinIO...
🐳 Starting Next.js Dev Server...
✅ All services ready!
```

### 步骤 4: Access App
访问 http://localhost:3000 → 开始开发！

---

## 📦 Available Services

| Service | URL | Description |
|---------|-----|-------------|
| **Next.js** | http://localhost:3000 | Main application with hot-reload |
| **MinIO Console** | http://localhost:9001 | S3 storage management UI |
| **PgAdmin** | http://localhost:5050 | PostgreSQL GUI (admin/admin) |
| **Supabase Mock** | http://localhost:8000 | Auth & DB proxy (DEV ONLY) |

---

## 🔧 Common Commands

### View Logs
```bash
# All services
docker compose logs -f

# Just Next.js
docker compose logs -f nextjs

# Just database
docker compose logs -f postgres
```

### Stop Everything
```bash
docker compose down
```

### Reset Database
```bash
# Remove volumes (WARNING: deletes all data!)
docker compose down -v

# Restart with fresh schema
docker compose up -d
```

### Run Tests Inside Container
```bash
docker compose exec nextjs pnpm test
```

### Open Database Shell
```bash
docker compose exec postgres psql -U postgres -d sm9_dev
```

---

## 🐛 Troubleshooting

### Q1: Port Already in Use
```bash
# Error: Bind for 0.0.0.0:3000 failed: port is already allocated

# Solution 1: Kill existing process
lsof -ti:3000 | xargs kill -9  # Mac/Linux
netsh advfirewall firewall add rule name="Port 3000" dir=in action=allow  # Windows

# Solution 2: Use different port in docker-compose.yml
ports:
  - "3001:3000"  # Change host port
```

### Q2: Database Migration Failed
```bash
# Solution: Manually run migrations inside container
docker compose exec postgres psql -U postgres -d sm9_dev -f /docker-entrypoint-initdb.d/0001_generation_cache.sql
```

### Q3: MinIO Can't Upload Files
```bash
# Check bucket exists
docker compose exec minio mc ls minio/

# Create bucket manually
docker compose exec minio mc mb minio/bucket-name
```

### Q4: Hot-Reload Not Working
```bash
# Ensure volume mount is correct in docker-compose.yml
volumes:
  - .:/app      # Your code mapped to container

# Restart container if changes don't appear
docker compose restart nextjs
```

---

## 🎯 Development Workflow

### 1. Code Changes
Edit files on your host machine → Auto-reloads in browser within 500ms

### 2. Database Schema Changes
```bash
# Add migration file
touch db/migrations/0038_new_feature.sql

# Apply inside container
docker compose exec postgres psql -U postgres -d sm9_dev -f db/migrations/0038_new_feature.sql
```

### 3. Test Persona Engine
```bash
docker compose exec nextjs pnpm test:persona
```

### 4. Run E2E Conversation Tests
```bash
docker compose exec nextjs pnpm tsx scripts/test-conversation-flow.mjs
```

---

## 🔄 Production Deployment Notes

⚠️ **Before deploying to production:**

1. Replace `supabase-auth-mock` with actual Supabase:
   ```yaml
   # Remove supabase-auth-mock service from docker-compose.yml
   # Update environment variables:
   NEXT_PUBLIC_SUPABASE_URL=https://your-supabase-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-public-anon-key
   COZE_SUPABASE_URL=https://your-coze-proxy.supabase.co
   COZE_SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ```

2. Enable production mode:
   ```bash
   CONTENT_MODE=adult
   ENABLE_TELEMETRY=true
   ```

3. Set secure JWT secret:
   ```bash
   JWT_SECRET=$(openssl rand -base64 32)
   ```

4. Push to Vercel:
   ```bash
   git push vercel main
   ```

---

## 📊 Resource Usage

Default allocation per service:
- PostgreSQL: 2GB RAM
- Redis: 256MB RAM
- MinIO: 512MB RAM
- Next.js: 1GB RAM

Total minimum: ~4GB RAM free on your machine

To adjust, edit `docker-compose.yml`:
```yaml
services:
  nextjs:
    deploy:
      resources:
        limits:
          memory: 2G  # Increase if needed
```

---

## 🤝 Contributing

Add new services:
```yaml
services:
  your-new-service:
    image: your-image:latest
    ports:
      - "8080:8080"
    environment:
      - YOUR_VAR=value
```

Then run:
```bash
docker compose up -d your-new-service
```

---

## 📞 Support

遇到 Docker 问题？联系维护者或通过以下方式反馈：
- GitHub Issues: `soulmate9/docker-bugs`
- Slack Channel: `#devops-infrastructure`
- Email: `devops@soulmate.ai`

Happy coding! 🎉
