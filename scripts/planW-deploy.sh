#!/bin/bash
# Plan W deploy script — run from PowerShell with WSL or Git Bash
cd /mnt/c/Users/71489/soulmate9 || cd C:/Users/71489/soulmate9
echo "=== Current state ==="
git status --short 2>&1 | head -5
echo ""
echo "=== Adding PlanW files ==="
git add src/lib/supabase.ts src/app/login/page.tsx src/app/register/page.tsx next.config.ts Dockerfile
echo "=== Committing ==="
git commit -m "fix(deploy): Plan W - fresh chunk hash, simplified login/register"
echo "=== Pushing to Railway ==="
git push origin deploy/railway
echo "DONE"
