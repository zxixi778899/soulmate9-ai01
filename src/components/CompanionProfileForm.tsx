/**
 * Companion Profile Editor Form
 * 
 * Allows users to edit their companion's personality settings,
 * desire modifiers, and relationship style.
 * 
 * Features:
 * - Personality trait selection (multi-select)
 * - Openness slider with live preview
 * - Desire tendency preset buttons
 * - Fetish index adjustment (0-100)
 * - Relationship style selector
 * - Real-time mood/desire level visualization
 */

'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Save, RefreshCw, Eye, EyeOff, Flame, Sparkles, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { createBrowserClient } from '@/lib/supabase';
import { logger } from '@/lib/logger';

interface Girlfriend {
  id: string;
  name: string;
  personality_traits?: string[];
  sexual_tendency?: 'low' | 'mid' | 'high';
  openness?: 'conservative' | 'moderate' | 'open' | 'experimental';
  fetish_index?: number;
  relationship_style?: 'direct' | 'passive' | 'playful' | 'maternal' | 'tsundere' | 'yandere';
}

interface CompanionProfileExt {
  id: string;
  current_mood: string;
  desire_level: number;
  user_profile?: Record<string, unknown>;
  inside_jokes?: string[];
}

// Personality traits library
const PERSONALITY_TRAITS = [
  { id: 'friendly', label: '友好', description: '善解人意，容易接近', emoji: '😊' },
  { id: 'curious', label: '好奇', description: '喜欢问问题，对新事物感兴趣', emoji: '🤔' },
  { id: 'gentle', label: '温柔', description: '说话轻声细语，体贴入微', emoji: '💕' },
  { id: 'confident', label: '自信', description: '对自己的能力有信心', emoji: '✨' },
  { id: 'shy', label: '害羞', description: '容易脸红，不太主动', emoji: '😳' },
  { id: 'independent', label: '独立', description: '有主见，不依赖他人', emoji: '💪' },
  { id: 'empathetic', label: '共情', description: '能感同身受你的情绪', emoji: '💖' },
  { id: 'humorous', label: '幽默', description: '喜欢开玩笑，逗你开心', emoji: '😂' },
  { id: 'ambitious', label: '上进', description: '有目标感，努力向前', emoji: '🎯' },
  { id: 'spontaneous', label: '随性', description: '不喜欢计划，享受当下', emoji: '🌈' },
];

// Relationship style templates
const RELATIONSHIP_STYLES = {
  direct: {
    label: '直率型',
    description: '有话直说，不会拐弯抹角',
    examples: ['我喜欢你', '今天想你了'],
    icon: '🎯'
  },
  passive: {
    label: '被动型',
    description: '等待你主动，偶尔撒娇',
    examples: ['...嗯', '如果你愿意的话'],
    icon: '🌸'
  },
  playful: {
    label: '俏皮型',
    description: '喜欢调戏你，制造暧昧氛围',
    examples: ['在干嘛呢？想我了吗？', '再这样我可要生气了~'],
    icon: '😉'
  },
  maternal: {
    label: '母性关怀型',
    description: '像姐姐一样照顾你',
    examples: ['累了吗？来喝杯茶', '要注意休息哦'],
    icon: '☕️'
  },
  tsundere: {
    label: '傲娇型',
    description: '口嫌体正直，外冷内热',
    examples: ['才不是特意等你呢！', '笨蛋...我才没有担心你'],
    icon: '😤'
  },
  yandere: {
    label: '病娇型',
    description: '极度占有欲，情绪波动大',
    examples: ['只能看着我', '你和谁聊天了？'],
    icon: '💀'
  }
};

// Openness descriptions
const OPENNESS_DESCRIPTIONS = {
  conservative: {
    title: '保守型',
    description: '需要耐心引导，NSFW 阈值较高',
    tips: ['初期避免直接挑逗', '先建立情感连接', '用暗示而非直白'],
    gradient: '🟢→🟡'
  },
  moderate: {
    title: '正常型',
    description: '平衡回应，循序渐进',
    tips: ['自然推进关系', '根据她的反应调整', '保持真诚'],
    gradient: '🟡→🟠'
  },
  open: {
    title: '开放型',
    description: '主动接梗，NSFW 接受度高',
    tips: ['可以直接表达想法', '她会积极回应', '尝试更多花样'],
    gradient: '🟠→🔴'
  },
  experimental: {
    title: '实验型',
    description: '大胆尝试新奇玩法',
    tips: ['挑战边界', '共同探索', '注意安全与舒适度'],
    gradient: '🔴→🟣'
  }
};

export function CompanionProfileForm({ girlfriendId }: { girlfriendId: string }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('basic');
  
  // Girlfriend data
  const [, setGirlfriend] = useState<Girlfriend | null>(null);
  const [profileExt, setProfileExt] = useState<CompanionProfileExt | null>(null);
  
  // Form state
  const [selectedTraits, setSelectedTraits] = useState<string[]>([]);
  const [sexualTendency, setSexualTendency] = useState<Girlfriend['sexual_tendency']>('mid');
  const [openness, setOpenness] = useState<Girlfriend['openness']>('moderate');
  const [fetishIndex, setFetishIndex] = useState(25);
  const [relationshipStyle, setRelationshipStyle] = useState<Girlfriend['relationship_style']>('direct');
  
  // Debug mode
  const [debugMode, setDebugMode] = useState(false);
  const [manualMood, setManualMood] = useState('neutral');
  const [manualDesire, setManualDesire] = useState(50);

  // Load data on mount
  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadData closes over girlfriendId via component scope
  }, [girlfriendId]);

  async function loadData() {
    const supabase = createBrowserClient();
    if (!supabase) return;
    setLoading(true);
    try {
      // Load girlfriend basic data
      const { data: gfData } = await supabase
        .from('girlfriends')
        .select('*')
        .eq('id', girlfriendId)
        .single();
      
      if (gfData) {
        setGirlfriend(gfData);
        setSelectedTraits(gfData.personality_traits || []);
        setSexualTendency(gfData.sexual_tendency || 'mid');
        setOpenness(gfData.openness || 'moderate');
        setFetishIndex(gfData.fetish_index || 25);
        setRelationshipStyle(gfData.relationship_style || 'direct');
      }
      
      // Load companion profile extension
      const { data: profileData } = await supabase
        .from('companion_profiles_ext')
        .select('*')
        .eq('user_id', 'CURRENT_USER_ID') // TODO: Get from auth context
        .eq('girlfriend_id', girlfriendId)
        .single();
      
      if (profileData) {
        setProfileExt(profileData);
        setManualMood(profileData.current_mood);
        setManualDesire(profileData.desire_level);
      }
      
    } catch (error) {
      logger.warn('[CompanionProfileForm] Load failed', { error: String(error) });
      toast.error('加载数据失败，请重试');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    const supabase = createBrowserClient();
    if (!supabase) return;
    setSaving(true);
    try {
      // Update girlfriend table
      const { error: gfError } = await supabase
        .from('girlfriends')
        .update({
          personality_traits: selectedTraits,
          sexual_tendency: sexualTendency,
          openness: openness,
          fetish_index: fetishIndex,
          relationship_style: relationshipStyle
        })
        .eq('id', girlfriendId);
      
      if (gfError) throw gfError;
      
      // Update companion_profiles_ext (debug mode)
      if (debugMode && profileExt) {
        await supabase
          .from('companion_profiles_ext')
          .update({
            current_mood: manualMood,
            desire_level: manualDesire,
            mood_updated_at: new Date()
          })
          .eq('id', profileExt.id);
      }
      
      toast.success('保存成功！');
      
      // Reload data
      await loadData();
      
    } catch (error) {
      logger.warn('[CompanionProfileForm] Save failed', { error: String(error) });
      toast.error('保存失败，请重试');
    } finally {
      setSaving(false);
    }
  }

  async function handleRandomize() {
    if (!confirm('随机生成性格配置？这可能会覆盖当前设置。')) return;
    
    const randomTraits = PERSONALITY_TRAITS
      .sort(() => Math.random() - 0.5)
      .slice(0, Math.floor(Math.random() * 3) + 2)
      .map(t => t.id);
    
    const randomStyles: Girlfriend['relationship_style'][] = ['direct', 'playful', 'maternal', 'tsundere'];
    
    setSelectedTraits(randomTraits);
    setRelationshipStyle(randomStyles[Math.floor(Math.random() * randomStyles.length)]);
    setOpenness(Math.random() < 0.5 ? 'moderate' : 'open');
    
    toast.success('已随机生成新配置！');
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-500"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-pink-500">伴侣人格设定</h1>
          <p className="text-gray-400 mt-1">自定义她的性格特征和互动方式</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleRandomize} disabled={saving}>
            <RefreshCw className="h-4 w-4 mr-2" />
            随机
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? '保存中...' : '保存'}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-3 w-full max-w-md">
          <TabsTrigger value="basic">基础设定</TabsTrigger>
          <TabsTrigger value="interaction">互动偏好</TabsTrigger>
          <TabsTrigger value="debug">调试模式</TabsTrigger>
        </TabsList>

        {/* Basic Tab - Personality Traits & Styles */}
        <TabsContent value="basic" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>性格特质</CardTitle>
              <CardDescription>选择多个特质组合成独特的她</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {PERSONALITY_TRAITS.map((trait) => (
                  <button
                    key={trait.id}
                    onClick={() => {
                      setSelectedTraits(prev => 
                        prev.includes(trait.id)
                          ? prev.filter(t => t !== trait.id)
                          : [...prev, trait.id]
                      );
                    }}
                    className={`p-4 rounded-lg border-2 transition-all text-left ${
                      selectedTraits.includes(trait.id)
                        ? 'border-pink-500 bg-pink-500/10'
                        : 'border-gray-700 hover:border-gray-500'
                    }`}
                  >
                    <div className="text-2xl mb-1">{trait.emoji}</div>
                    <div className="font-medium text-sm">{trait.label}</div>
                    <div className="text-xs text-gray-400 mt-1">{trait.description}</div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>关系风格</CardTitle>
              <CardDescription>她与你互动的主要方式</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Select value={relationshipStyle} onValueChange={(v) => setRelationshipStyle(v as Girlfriend['relationship_style'])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(RELATIONSHIP_STYLES).map(([key, config]) => (
                    <SelectItem key={key} value={key}>
                      <div className="flex items-center gap-2">
                        <span>{config.icon}</span>
                        <span>{config.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              {relationshipStyle && (
                <div className="mt-4 p-4 bg-gray-800/50 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xl">{RELATIONSHIP_STYLES[relationshipStyle].icon}</span>
                    <h4 className="font-medium">{RELATIONSHIP_STYLES[relationshipStyle].label}</h4>
                  </div>
                  <p className="text-sm text-gray-400 mb-3">
                    {RELATIONSHIP_STYLES[relationshipStyle].description}
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    {RELATIONSHIP_STYLES[relationshipStyle].examples.map((example, i) => (
                      <Badge key={i} variant="outline" className="bg-pink-500/10 text-pink-400">
                        “{example}”
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Interaction Tab - Desire & Openness */}
        <TabsContent value="interaction" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>原始欲望倾向</CardTitle>
              <CardDescription>她对亲密话题的天然敏感度</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                {[
                  { value: 'low', label: '低敏感', icon: '🌱', color: 'text-green-400' },
                  { value: 'mid', label: '中等', icon: '🌿', color: 'text-yellow-400' },
                  { value: 'high', label: '高敏感', icon: '🔥', color: 'text-red-400' }
                ].map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setSexualTendency(option.value as Girlfriend['sexual_tendency'])}
                    className={`p-4 rounded-lg border-2 text-center transition-all ${
                      sexualTendency === option.value
                        ? `border-${option.color.split('-')[1]}-500 bg-${option.color.split('-')[1]}-500/10`
                        : 'border-gray-700 hover:border-gray-500'
                    }`}
                  >
                    <div className={`text-3xl mb-2 ${option.color}`}>{option.icon}</div>
                    <div className="font-medium">{option.label}</div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>开放程度</CardTitle>
              <CardDescription>她对 NSFW 内容的接受速度</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <Select value={openness} onValueChange={(v) => setOpenness(v as Girlfriend['openness'])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(OPENNESS_DESCRIPTIONS).map(([key, desc]) => (
                    <SelectItem key={key} value={key}>
                      <div className="flex items-center gap-2">
                        <span>{desc.gradient}</span>
                        <span>{desc.title}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              {openness && (
                <div className="p-4 bg-gray-800/50 rounded-lg space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">{OPENNESS_DESCRIPTIONS[openness].title}</h4>
                    <span className="text-2xl">{OPENNESS_DESCRIPTIONS[openness].gradient}</span>
                  </div>
                  <p className="text-sm text-gray-400">
                    {OPENNESS_DESCRIPTIONS[openness].description}
                  </p>
                  <div className="space-y-2">
                    <div className="text-sm font-medium">推荐做法：</div>
                    {OPENNESS_DESCRIPTIONS[openness].tips.map((tip, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm text-gray-300">
                        <span className="text-pink-500">•</span>
                        <span>{tip}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>特殊癖好指数</CardTitle>
              <CardDescription>0-100，数值越高越可能接受猎奇玩法</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Slider
                value={[fetishIndex]}
                onValueChange={(v) => setFetishIndex(v[0])}
                max={100}
                step={1}
                className="cursor-pointer"
              />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <AlertCircle className="h-4 w-4" />
                  <span>保守 (0)</span>
                </div>
                <div className="text-2xl font-bold text-pink-500">{fetishIndex}</div>
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <Flame className="h-4 w-4" />
                  <span>大胆 (100)</span>
                </div>
              </div>
              
              <div className="p-3 bg-gray-800/50 rounded-lg text-sm text-gray-300">
                {fetishIndex < 25 
                  ? "偏向传统浪漫，喜欢温柔的情感交流"
                  : fetishIndex < 60
                    ? "可以尝试一些轻度创意玩法"
                    : fetishIndex < 85
                      ? "对大多数浪漫场景都持开放态度"
                      : "欢迎挑战各种边界和幻想！"
                }
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Debug Tab - Mood & Desire Control */}
        <TabsContent value="debug" className="space-y-6">
          <Card>
            <CardHeader>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-purple-400" />
                  调试模式
                </CardTitle>
                <CardDescription>手动调整实时状态用于测试（生产环境建议关闭）</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <Label htmlFor="debug-toggle">启用调试模式</Label>
                  <Switch
                    id="debug-toggle"
                    checked={debugMode}
                    onCheckedChange={setDebugMode}
                  />
                </div>
                
                {debugMode && (
                  <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                    <div className="space-y-2">
                      <Label>当前心情</Label>
                      <div className="grid grid-cols-4 gap-2">
                        {['neutral', 'happy', 'sad', 'jealous', 'flirty', 'nostalgic', 'angry', 'thinking'].map((mood) => (
                          <Button
                            key={mood}
                            variant={manualMood === mood ? 'default' : 'outline'}
                            onClick={() => setManualMood(mood)}
                            className="capitalize"
                          >
                            {mood}
                          </Button>
                        ))}
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <Label>欲望值：{manualDesire}</Label>
                      <Slider
                        value={[manualDesire]}
                        onValueChange={(v) => setManualDesire(v[0])}
                        max={100}
                        step={1}
                      />
                      <div className="flex justify-between text-xs text-gray-400">
                        <span>冷静 (0)</span>
                        <span>热情 (100)</span>
                      </div>
                    </div>
                    
                    <div className="p-4 bg-purple-500/10 border border-purple-500/30 rounded-lg">
                      <div className="flex items-start gap-3">
                        <Eye className="h-5 w-5 text-purple-400 mt-0.5" />
                        <div>
                          <div className="font-medium text-purple-400 mb-1">预览效果</div>
                          <div className="text-sm text-gray-300">
                            当她处于<b>{manualMood}</b>心情且欲望值为<b>{manualDesire}</b>时，对话回复将呈现相应的情感强度和语言风格。
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                
                {!debugMode && (
                  <div className="text-center text-gray-400 py-8">
                    <EyeOff className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>调试模式未启用</p>
                    <p className="text-sm mt-1">点击开关可手动调整状态进行演示</p>
                  </div>
                )}
              </CardContent>
            </CardHeader>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Export as named component for page routing
export default CompanionProfileForm;
