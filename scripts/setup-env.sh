#!/bin/bash
# SoulMate9 - Environment Variable Setup for New AI Services
# Run: bash scripts/setup-env.sh
# Requires: vercel CLI logged in (npx vercel whoami)

set -e

echo "=== SoulMate9 AI Services Environment Setup ==="
echo ""

# Check Vercel login
npx vercel whoami || { echo "ERROR: Not logged in to Vercel. Run: npx vercel login"; exit 1; }

# TTS Endpoint (Fish-Speech on RunPod)
echo "--- TTS (Fish-Speech) ---"
echo "After creating the RunPod endpoint, set:"
echo "  npx vercel env add RUNPOD_TTS_ENDPOINT_ID production"
echo "  Value: <your-endpoint-id>"
echo ""
echo "  RUNPOD_TTS_API_KEY will fall back to RUNPOD_API_KEY (already set)"
echo ""

# AnimateDiff Endpoint
echo "--- AnimateDiff (Dynamic Portraits) ---"
echo "After creating the RunPod endpoint, set:"
echo "  npx vercel env add RUNPOD_ANIMATEDIFF_ENDPOINT production"
echo "  Value: <your-endpoint-id>"
echo ""

# Verify existing vars
echo "--- Verifying existing variables ---"
npx vercel env ls production 2>/dev/null | grep -E "(RUNPOD|TOGETHER|OPENROUTER)" || echo "  (run 'npx vercel env ls' to see all)"
echo ""

echo "=== Done ==="
echo ""
echo "New env vars needed:"
echo "  RUNPOD_TTS_ENDPOINT_ID     - Fish-Speech TTS endpoint"
echo "  RUNPOD_ANIMATEDIFF_ENDPOINT - AnimateDiff video endpoint"
echo ""
echo "Optional (future):"
echo "  RUNPOD_WAN_VIDEO_ENDPOINT  - Wan 2.1 video generation"
echo "  RUNPOD_STT_ENDPOINT_ID     - Whisper STT (for voice calls)"
