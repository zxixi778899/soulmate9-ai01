// 根据提示词动态生成最佳尺寸的函数
export function detectCompositionFromPrompt(prompt: string): {
  width: number;
  height: number;
  aspectRatio: string;
  compositionType: 'headshot' | 'portrait' | 'fullbody' | 'scene';
  additionalPrompts: string[];
} {
  const lowerPrompt = prompt.toLowerCase();
  
  // 检测全身照关键词
  const fullBodyKeywords = [
    'full body', 'entire body', 'from head to toe', 'standing pose',
    'knees up', 'lower body', 'waist up', 'full length', 'complete outfit'
  ];
  
  // 检测半身照关键词
  const portraitKeywords = [
    'portrait', 'head and shoulders', 'upper body', 'bust', 'close-up',
    'face focus', 'shoulder', 'elegant pose', 'sitting'
  ];
  
  // 检测特写关键词
  const closeupKeywords = [
    'close-up', 'extreme close-up', 'face only', 'macro', 'detail shot',
    'tight shot', 'headshot', 'selfie'
  ];
  
  // 检测横版/场景关键词
  const landscapeKeywords = [
    'wide angle', 'landscape', 'panorama', 'cinematic', 'background',
    'scenery', 'environment', 'outdoor', 'indoor scene'
  ];
  
  const matchCount = { fullBody: 0, portrait: 0, closeup: 0, landscape: 0 };
  
  fullBodyKeywords.forEach(kw => { if (lowerPrompt.includes(kw)) matchCount.fullBody++; });
  portraitKeywords.forEach(kw => { if (lowerPrompt.includes(kw)) matchCount.portrait++; });
  closeupKeywords.forEach(kw => { if (lowerPrompt.includes(kw)) matchCount.closeup++; });
  landscapeKeywords.forEach(kw => { if (lowerPrompt.includes(kw)) matchCount.landscape++; });
  
  // 决定构图类型
  let compositionType: 'headshot' | 'portrait' | 'fullbody' | 'scene' = 'portrait'; // default
  
  if (matchCount.fullBody > 0 && matchCount.portrait === 0) {
    compositionType = 'fullbody';
  } else if (matchCount.closeup > matchCount.portrait * 2) {
    compositionType = 'headshot';
  } else if (matchCount.landscape > matchCount.portrait && matchCount.landscape > matchCount.fullBody) {
    compositionType = 'scene';
  }
  
  // 根据构图类型推荐尺寸
  let width = 1024;
  let height = 1280; // default 3:4
  let aspectRatio = '3:4';
  
  switch (compositionType) {
    case 'headshot':
      width = 512;
      height = 768;  // 2:3 竖版特写
      aspectRatio = '2:3';
      break;
      
    case 'fullbody':
      if (prompt.includes('horizontal') || prompt.includes('wide')) {
        width = 1280;
        height = 768;  // 16:9 横版全身
        aspectRatio = '16:9';
      } else {
        width = 768;
        height = 1024; // 3:4 全身
        aspectRatio = '3:4';
      }
      break;
      
    case 'scene':
      width = 1280;
      height = 720;  // 16:9 电影宽屏
      aspectRatio = '16:9';
      break;
      
    case 'portrait':
    default:
      // 默认 3:4 经典肖像
      width = 1024;
      height = 1280;
      aspectRatio = '3:4';
  }
  
  // 根据提示词补充额外关键词
  const additionalPrompts: string[] = [];
  
  if (compositionType === 'fullbody') {
    additionalPrompts.push(
      'full body shot',
      'standing pose',
      'complete outfit visible',
      'detailed clothing',
      'floor or ground visible'
    );
  } else if (compositionType === 'headshot') {
    additionalPrompts.push(
      'professional headshot',
      'sharp focus on face',
      'bokeh background',
      'studio lighting',
      'high quality portrait'
    );
  } else if (compositionType === 'scene') {
    additionalPrompts.push(
      'atmospheric lighting',
      'depth of field',
      'cinematic composition',
      'environment detail',
      'wide angle view'
    );
  }
  
  return {
    width,
    height,
    aspectRatio,
    compositionType,
    additionalPrompts
  };
}
