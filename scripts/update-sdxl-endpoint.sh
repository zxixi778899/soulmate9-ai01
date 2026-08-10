#!/bin/bash
# Update SDXL endpoint ID across local and Vercel environments.

ENDPOINT_ID=$1

if [ -z "$ENDPOINT_ID" ]; then
  echo "Usage: ./update-sdxl-endpoint.sh <endpoint-id>"
  exit 1
fi

echo "Updating SDXL endpoint to: $ENDPOINT_ID"

# 1. Update .env.local
echo "Updating .env.local..."
sed -i "s/^RUNPOD_ENDPOINT_ID_SDXL=.*/RUNPOD_ENDPOINT_ID_SDXL=$ENDPOINT_ID/" .env.local

# 2. Verify local config
echo "Local config:"
grep "RUNPOD_ENDPOINT_ID_SDXL" .env.local

# 3. Update Vercel production env
echo "Updating Vercel production environment..."
npx vercel env rm RUNPOD_ENDPOINT_ID_SDXL production --yes
echo "$ENDPOINT_ID" | npx vercel env add RUNPOD_ENDPOINT_ID_SDXL production --yes

echo "Done! Next steps:"
echo "1. Test endpoint: curl -X POST https://api.runpod.ai/v2/$ENDPOINT_ID/run -H 'Authorization: Bearer \$RUNPOD_API_KEY' -H 'Content-Type: application/json' -d '{\"input\":{\"prompt\":\"test\"}}'"
echo "2. Deploy: git add .env.local && git commit -m 'chore: update SDXL endpoint' && git push && npx vercel deploy --prod"
