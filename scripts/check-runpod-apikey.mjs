#!/usr/bin/env node
/**
 * RunPod API Key 诊断与修复工具
 * 用途：检测 401 Unauthorized 错误并提供修复建议
 */

const dotenv = require('dotenv');
const path = require('path');

// 加载环境变量
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🔑 RunPod API Key 诊断工具 (401 修复)');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const apiKey = process.env.RUNPOD_API_KEY;

// === 1. Key 格式验证 ===
console.log('📋 API Key 检查:\n');

if (!apiKey) {
  console.log('  ❌ 未找到 RUNPOD_API_KEY 环境变量');
  console.log('  💡 立即修复:');
  console.log('\n    # 编辑 .env.local 文件');
  console.log('    # 添加以下行（从 RunPod Console 获取）');
  console.log('    RUNPOD_API_KEY=rpa_your_actual_key_here\n');
} else {
  // 检查 Key 格式
  const isValidFormat = /^[a-zA-Z0-9_-]{30,}$/.test(apiKey);
  const isRunPodFormat = apiKey.startsWith('rpa_');
  const isTooShort = apiKey.length < 30;
  
  console.log(`  Length: ${apiKey.length} characters`);
  console.log(`  Prefix: ${apiKey.slice(0, 8)}...`);
  
  if (isTooShort) {
    console.log('  ⚠️  Key 长度过短 (<30 字符)');
  }
  
  if (isRunPodFormat) {
    console.log('  ✅ Key 格式正确 (rpa_...)');
  } else if (/^sk_/.test(apiKey)) {
    console.log('  ❌  Key 格式错误 - 这是 OpenAI/Together AI 的格式！');
    console.log('  💡 必须使用 RunPod 的 rpa_xxx 格式 Key');
  } else {
    console.log('  ⚠️  未知 Key 格式');
  }
}

// === 2. 端点配置检查 ===
const endpointId = process.env.RUNPOD_ENDPOINT_ID_FLUX || 
                   process.env.RUNPOD_ENDPOINT_ID || 
                   'e40cgshtouocg8';

console.log('\n🌐 端点配置:\n');
console.log(`  Endpoint ID: ${endpointId}`);

// === 3. 测试 API 连接 ===
if (apiKey && isValidFormat) {
  console.log('\n🧪 测试 API 连接...\n');
  
  // 创建 AbortController 用于超时控制
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    console.log('⏰ API 请求超时 (>5 秒)，可能被防火墙/代理拦截');
    console.log('\n可能原因:');
    console.log('  ① 本地网络无法访问 runpod.ai');
    console.log('  ② Firewall/代理阻止了请求');
    console.log('  ③ DNS 解析失败或网络延迟过高\n');
    console.log('解决方案:');
    console.log('  1. 检查网络连接是否正常');
    console.log('  2. 尝试 ping api.runpod.ai');
    console.log('  3. 如果使用代理，确保排除了 *.runpod.ai\n');
    controller.abort();
  }, 5000); // 5 秒超时（比默认 30 秒短得多）
  
  fetch(`https://api.runpod.ai/v2/${endpointId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    signal: controller.signal // 传入 AbortSignal
  })
  .then(async (response) => {
    clearTimeout(timeoutId); // 取消超时计时器
    console.log(`✅ 响应时间：<5 秒\n`);
    console.log(`Status Code: ${response.status}`);
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ API 调用成功!\n');
      console.log('  Pod Status:', data.status);
      console.log('  GPU Model:', data.gpuDisplayName || 'Unknown');
      console.log('  Network Volume:', data.networkVolumeMountPoint || 'None');
      console.log('\n🎉 一切正常！捏脸功能应该可用了。\n');
      
      console.log('下一步:');
      console.log('  1. 重启开发服务器：pnpm dev');
      console.log('  2. 访问捏脸页面：http://localhost:5000/create');
      console.log('  3. 点击"生成立绘"\n');
    } else {
      const errorText = await response.text();
      console.log('❌ API 调用失败!\n');
      
      if (response.status === 401) {
        console.log('  HTTP 401 Unauthorized: invalid api key\n');
        console.log('  可能的原因:\n');
        console.log('    ① Key 已过期或被撤销");
        console.log('    ② Key 格式错误（必须是以 rpa_开头的 RunPod Key）');
        console.log('    ③ 账户欠费或权限不足');
        console.log('    ④ Key 被手动替换为其他服务的 Key\n');
        
        console.log('  解决方案:\n');
        console.log('    1. 登录 https://www.runpod.io/console');
        console.log('    2. Settings → API Keys → Generate New Key');
        console.log('    3. 复制新的 rpa_xxxxxx Key');
        console.log('    4. 更新到 .env.local');
        console.log('    5. 重启开发服务器\n');
      } else if (response.status === 404) {
        console.log('  HTTP 404 Not Found: 端点不存在或未授权\n');
        console.log('  解决方案:');
        console.log('    ① 确认 RUNPOD_ENDPOINT_ID 是正确的 ComfyUI 端点 ID');
        console.log('    ② 该端点必须在你的 RunPod 账户下');
      } else {
        console.log('  Error Body:', errorText.slice(0, 200));
      }
    }
  })
  .catch((error) => {
    if (error.name === 'AbortError') {
      console.log('\n⏰ API 请求已中止（超时）');
    } else {
      console.log('❌ 网络连接失败:', error.message);
    }
    console.log('\n可能原因:');
    console.log('  ① 本地网络无法访问 runpod.ai');
    console.log('  ② Firewall/代理阻止了请求');
    console.log('  ③ DNS 解析失败或网络延迟过高\n');
    
    console.log('解决方案:');
    console.log('  1. 检查网络连接是否正常');
    console.log('  2. 尝试 ping api.runpod.ai');
    console.log('  3. 如果使用代理，确保排除了 *.runpod.ai\n');
    console.log('  4. 临时关闭防火墙测试\n');
  });
} else if (apiKey && !isValidFormat) {
  console.log('\n⚠️  检测到格式问题，跳过 API 测试\n');
  console.log('请首先修正 Key 格式后再运行测试\n');
} else {
  console.log('\n⏸️  未提供有效 API Key，跳过 API 测试\n');
  console.log('请先配置 .env.local 文件中的 RUNPOD_API_KEY\n');
}

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
