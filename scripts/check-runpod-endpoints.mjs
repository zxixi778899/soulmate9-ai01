#!/usr/bin/env node
/**
 * RunPod 端点诊断脚本
 * 用途：检查 FLUX/SDXL 端点配置与可用性
 */

const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

// 加载环境变量
dotenv.config({ path: path.join(__dirname, '.env.local') });

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🔍 RunPod 端点诊断工具');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// === 1. 基础配置检查 ===
const config = {
  fluxEndpoint: process.env.RUNPOD_ENDPOINT_ID_FLUX || process.env.RUNPOD_ENDPOINT_ID || '',
  sdxlPony: process.env.RUNPOD_ENDPOINT_ID_SDXL_PONY || '',
  sdxlIllustrious: process.env.RUNPOD_ENDPOINT_ID_SDXL_ILLUSTRIOUS || '',
  sdxFailopen: process.env.RUNPOD_ENDPOINT_ID_SDXL || '',
  sdxlReady: process.env.RUNPOD_SDXL_MODELS_READY?.toLowerCase() === 'true',
  apiKey: process.env.RUNPOD_API_KEY ? `${process.env.RUNPOD_API_KEY.slice(0, 8)}...` : '',
};

console.log('📋 环境变量配置:\n');
console.log(`  FLUX 端点 ID     : ${config.fluxEndpoint || '❌ 未配置'}${!config.fluxEndpoint ? ' ⚠️' : ''}`);
console.log(`  SDXL Pony       : ${config.sdxlPony || '❌ 未配置'}`);
console.log(`  SDXL Illustrious: ${config.sdxlIllustrious || '❌ 未配置'}`);
console.log(`  SDXL 总闸       : ${config.sdxlReady ? '✅ 开启' : '⏸️ 关闭'}`);
console.log(`  API Key         : ${config.apiKey ? `🔑 ${config.apiKey}...` : '❌ 未配置'}\n`);

// === 2. 路由策略推断 ===
console.log('🔄 生图路由策略推断:\n');

if (!config.fluxEndpoint) {
  console.log('  ❌ 错误：FLUX 端点未配置，所有生图请求将失败');
  console.log('  💡 解决：在 .env.local 中添加 RUNPOD_ENDPOINT_ID_FLUX\n');
} else if (config.sdxlReady && (config.sdxlPony || config.sdxlIllustrious)) {
  console.log('  ✅ SDXL 矩阵就绪（高性能模式）');
  console.log('     ├─ NSFW (≥3) → SDXL (强制)');
  console.log('     ├─ SFW 写实 → SDXL Pony');
  console.log('     ├─ SFW 二次元 → SDXL Illustrious');
  console.log('     └─ SFW 3D/产品 → FLUX 兜底');
} else if (config.fluxEndpoint) {
  console.log('  ⚡ FLUX 统一方案（稳定模式）');
  console.log('     ├─ 所有类型 → FLUX e40cgshtouocg8');
  console.log('     └─ 质量：⭐⭐⭐⭐⭐ | 速度：8-15 秒/张');
}

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🧪 下一步操作建议:\n');

if (!config.fluxEndpoint) {
  console.log('  1️⃣ 立即修复：\n');
  console.log('     # 编辑 .env.local');
  console.log('     RUNPOD_ENDPOINT_ID_FLUX=e40cgshtouocg8  # 或你的实际端点 ID');
  console.log('     RUNPOD_API_KEY=your_actual_api_key_here');
  console.log('\n  2️⃣ 重启开发服务器');
  console.log('     pnpm dev\n');
} else if (!config.sdxlReady) {
  console.log('  当前状态正常，可考虑升级性能:\n');
  console.log('  选项 A: 保持 FLUX 统一方案（稳定可靠）');
  console.log('  选项 B: 启用 SDXL 矩阵（更快但需额外部署）');
  console.log('\n  测试捏脸功能：');
  console.log('    1. 打开 http://localhost:5000/create');
  console.log('    2. 填写信息后点击"生成立绘"\n');
} else {
  console.log('  🎉 一切就绪！可以直接使用:\n');
  console.log('    http://localhost:5000/create\n');
}

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// === 3. 健康检查（可选）===
async function healthCheck(endpointId) {
  if (!endpointId) return;
  
  console.log('🌐 尝试连接 RunPod...\n');
  
  try {
    const response = await fetch(`https://api.runpod.ai/graphql`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${process.env.RUNPOD_API_KEY}`,
      },
      body: JSON.stringify({
        query: `query {
          pod(where: {id: "${endpointId}"}) {
            status
            gpuDisplayName
            networkVolumeMountPoint
          }
        }`,
      }),
    });

    const data = await response.json();
    
    if (data.errors) {
      console.log('  ❌ RunPod API 响应错误:', data.errors[0].message);
    } else if (data.data?.pod) {
      console.log('  ✅ Pod 状态：', data.data.pod.status);
      console.log('  ✅ GPU 型号：', data.data.pod.gpuDisplayName || '未知');
    } else {
      console.log('  ⚠️  Pod 不存在或未授权访问');
    }
  } catch (err) {
    console.log('  ❌ 网络连接失败:', err.message);
  }
}

// 自动检查主端点
if (config.fluxEndpoint) {
  healthCheck(config.fluxEndpoint).catch(console.error);
}
