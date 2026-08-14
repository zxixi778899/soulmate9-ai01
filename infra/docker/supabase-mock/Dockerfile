# Supabase Mock - Lightweight Auth & Database Proxy for Local Dev
# ============================================================================
# This is a simplified Supabase-compatible proxy that mocks:
#   - User authentication (JWT-based)
#   - Basic PostgreSQL queries
#   - Real-time subscriptions (stub)
# 
# NOT FOR PRODUCTION - Use actual Supabase for deployment!
# 
# Usage in docker-compose:
#   docker build -t sm9-supabase-mock infra/docker/supabase-mock/
# ============================================================================

FROM node:20-alpine

# Install dependencies
RUN npm install -g express @supabase/supabase-js jsonwebtoken body-parser cors

WORKDIR /app

# Create Express server
COPY server.js .

EXPOSE 8000

CMD ["node", "server.js"]
