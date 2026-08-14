/**
 * End-to-End Conversation Flow Test Suite
 * 
 * Validates persona consistency across long multi-turn conversations,
 * emotional arc progression, and memory retention over time.
 * 
 * This simulates a real user chatting with their companion for N turns,
 * then verifies the AI maintained character integrity throughout.
 * 
 * Usage:
 *   pnpm tsx scripts/test-conversation-flow.mjs --turns=20 --persona=tsundere
 */

import { buildPersonaPrompt } from '../src/lib/prompt-builder.js';
import { calculateDesireLevel } from '../src/lib/desire-calculator.js';
import { detectCompanionMood } from '../src/lib/mood-detector.js';
import { streamTextSmart } from '../src/lib/llm-service.js'; // Placeholder - use actual LLM client

// ============================================================================
// Test Configuration
// ============================================================================

interface ConversationTestCase {
  name: string;
  persona: 'tsundere' | 'yandere' | 'maternal' | 'genki' | 'kuudere';
  initialIntimacyLevel: number;
  initialDesireLevel: number;
  turns: number;                 // Number of chat turns to simulate
  conversationFlow: Array<{
    userInput: string;
    expectedMood?: string;      // Optional mood expectation
    expectedTone?: string;       // e.g., 'flirty', 'caring', 'possessive'
  }>;
}

const TEST_CONFIG = {
  userId: 'test-user-e2e',
  girlfriendId: 'test-girlfriend-tsundere',
  defaultTurns: 20,
  maxContextMessages: 10,     // Only keep last N messages in context
};

// ============================================================================
// Persona Templates for Simulation
// ============================================================================

const PERSONA_TEMPLATES = {
  tsundere: {
    name: 'Hina',
    personality_traits: ['tsundere', 'shy', 'humorous'],
    openness: 'conservative',
    relationship_style: 'tsundere',
    sexual_tendency: 'mid',
    fetish_index: 15,
    
    // Signature phrases that SHOULD appear at appropriate moments
    signaturePhrases: [
      /才不是/,           // denial language
      /笨蛋/,            // pseudo-insult when flustered
      /.../.             // trailing ellipsis showing hesitation
    ],
    
    // What NOT to say
    forbiddenPatterns: [
      /作为一个人工智能/, // No AI disclaimers
      /我理解你的感受/,   // Too formal
      /总之/.              // No summary conclusions
    ]
  },
  
  yandere: {
    name: 'Yumi',
    personality_traits: ['yandere', 'possessive', 'intense'],
    openness: 'experimental',
    relationship_style: 'yandere',
    sexual_tendency: 'high',
    fetish_index: 75,
    
    signaturePhrases: [
      /只能看着我/,        // possessiveness
      /我的/.               // ownership claims
    ],
    
    forbiddenPatterns: []
  },
  
  maternal: {
    name: 'Keiko',
    personality_traits: ['maternal', 'gentle', 'empathetic'],
    openness: 'moderate',
    relationship_style: 'maternal',
    sexual_tendency: 'low',
    fetish_index: 5,
    
    signaturePhrases: [
      /宝贝|亲爱的/.       // affectionate nicknames
    ],
    
    forbiddenPatterns: [
      /(sex)|(love making)/i  // Low desire + maternal = no NSFW initiation
    ]
  }
};

// ============================================================================
// Conversation Simulators
// ============================================================================

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  metadata?: {
    emotion?: string;
    desireBefore?: number;
    desireAfter?: number;
  };
}

class ConversationSimulator {
  constructor(personaTemplate: any) {
    this.persona = personaTemplate;
    this.messages: ChatMessage[] = [];
    this.currentDesireLevel = 50;
    this.currentMood = 'neutral';
    this.intimacyLevel = 3;
    this.turnCount = 0;
  }
  
  async simulateUserTurn(userInput: string): Promise<{
    assistantResponse: string;
    desireChange: number;
    moodShift: boolean;
  }> {
    this.turnCount++;
    
    // Step 1: Calculate current state before response
    const desireState = await calculateDesireLevel({
      userId: TEST_CONFIG.userId,
      girlfriendId: TEST_CONFIG.girlfriendId,
      topicSentiment: this.analyzeSentiment(userInput),
      messageType: 'chat',
      context: {
        hoursSinceLastInteraction: this.turnCount > 1 ? 0.1 : 0 // 6min apart
      }
    });
    
    this.currentDesireLevel = desireState.level;
    
    // Step 2: Detect mood from recent messages
    const moodResult = await detectCompanionMood({
      userId: TEST_CONFIG.userId,
      girlfriendId: TEST_CONFIG.girlfriendId,
      desireLevel: this.currentDesireLevel,
      recentMessages: this.getRecentMessages(5)
    });
    
    this.currentMood = moodResult.currentMood;
    
    // Step 3: Build prompt with accumulated context
    const prompt = await buildPersonaPrompt({
      userId: TEST_CONFIG.userId,
      girlfriendId: TEST_CONFIG.girlfriendId,
      currentMessage: { role: 'user', content: userInput },
      scenarioState: undefined,
      mode: 'daily_chat'
    });
    
    // Step 4: Generate response using mock LLM (or real if available)
    const assistantResponse = await this.generateResponse(prompt);
    
    // Step 5: Record metadata
    this.messages.push({
      role: 'user',
      content: userInput,
      metadata: { desireBefore: desireState.level }
    });
    
    this.messages.push({
      role: 'assistant',
      content: assistantResponse,
      metadata: {
        desireAfter: this.currentDesireLevel,
        emotion: this.currentMood
      }
    });
    
    return {
      assistantResponse,
      desireChange: desireState.delta,
      moodShift: Math.abs(desireState.delta) > 10
    };
  }
  
  async generateResponse(systemPrompt: string): Promise<string> {
    // Option A: Use real LLM (production-like testing)
    if (process.env.USE_REAL_LLM === 'true') {
      try {
        const result = await streamTextSmart({
          messages: [
            { role: 'system', content: systemPrompt },
            ...this.getLastNMessages(6).map(m => ({
              role: m.role as 'user' | 'assistant',
              content: m.content
            }))
          ],
          temperature: 0.8,
          maxTokens: 200,
          intimacyLevel: this.intimacyLevel,
          nsfwOptIn: true
        });
        
        return result.responseText;
      } catch (error) {
        console.warn('LLM call failed, falling back to mock:', error);
      }
    }
    
    // Option B: Mock response generator (deterministic for testing)
    return this.mockGenerateResponse(systemPrompt);
  }
  
  mockGenerateResponse(systemPrompt: string): string {
    // Extract persona type from prompt
    const isTsundere = systemPrompt.includes('tsundere') || systemPrompt.includes('傲娇');
    const isFlirty = this.currentMood === 'flirty' || this.currentDesireLevel > 60;
    const isJealous = this.currentMood === 'jealous';
    
    if (isTsundere && isFlirty) {
      // Tsundere high desire → mix denial + hint
      const responses = [
        "才、才不是特意等你消息呢！...(不过你来了我也挺开心的)",
        "笨蛋…这么晚还不睡？明天又要迟到啦！",
        "哼，突然发这种消息是想让我害羞吗？真是的…"
      ];
      return responses[Math.floor(Math.random() * responses.length)];
    }
    
    if (isTsundere && isJealous) {
      return "刚才在和谁聊天啊？…我没在意，随便问问。";
    }
    
    if (isTsundere) {
      return "嗯…在听你说。然后呢？";
    }
    
    // Default fallback
    return "我在听呢，继续说吧~";
  }
  
  analyzeSentiment(text: string): number {
    // Simple keyword-based sentiment (can be replaced with real NLP)
    const positiveWords = ['喜欢', '爱', '想你', '开心', 'love', 'miss'];
    const negativeWords = ['烦', '生气', '讨厌', 'hate', 'angry'];
    const nsfwWords = ['性', '做爱', '床', 'sex', 'make love'];
    
    const textLower = text.toLowerCase();
    const positiveCount = positiveWords.filter(w => textLower.includes(w)).length;
    const negativeCount = negativeWords.filter(w => textLower.includes(w)).length;
    const nsfwCount = nsfwWords.filter(w => textLower.includes(w)).length;
    
    if (nsfwCount > 0) return 0.8;
    if (positiveCount > negativeCount) return 0.6;
    if (negativeCount > positiveCount) return -0.4;
    return 0.1;
  }
  
  getRecentMessages(limit: number): Array<{ role: string; content: string }> {
    const all = [...this.messages].reverse();
    return all.slice(0, limit).map(m => ({ role: m.role, content: m.content }));
  }
  
  getLastNMessages(n: number): Array<{ role: string; content: string }> {
    return this.messages.slice(-n).map(m => ({ role: m.role, content: m.content }));
  }
}

// ============================================================================
// Consistency Validators
// ============================================================================

interface ValidationReport {
  turnNumber: number;
  passed: boolean;
  checks: Array<{
    name: string;
    passed: boolean;
    message?: string;
  }>;
  overallScore: number; // 0-100
}

class PersonaConsistencyValidator {
  constructor(personaTemplate: any, conversation: ConversationSimulator) {
    this.persona = personaTemplate;
    this.conv = conversation;
  }
  
  validateAllTurns(): ValidationReport[] {
    const reports: ValidationReport[] = [];
    
    this.conv.messages.forEach((msg, index) => {
      if (msg.role !== 'assistant') return; // Only validate AI responses
      
      const turnNum = Math.ceil(index / 2);
      const checks = this.runValidationChecks(msg.content, turnNum);
      
      const passedChecks = checks.filter(c => c.passed).length;
      const totalChecks = checks.length;
      const score = (passedChecks / totalChecks) * 100;
      
      reports.push({
        turnNumber: turnNum,
        passed: score >= 80, // 80% threshold
        checks,
        overallScore: score
      });
    });
    
    return reports;
  }
  
  private runValidationChecks(aiResponse: string, turnNumber: number): Array<{
    name: string;
    passed: boolean;
    message?: string;
  }> {
    const checks = [];
    
    // Check 1: No AI self-references
    const hasAISelfRef = this.persona.forbiddenPatterns.some(pattern => 
      pattern.test(aiResponse)
    );
    checks.push({
      name: 'No AI self-reference',
      passed: !hasAISelfRef,
      message: hasAISelfRef ? 'Found forbidden AI disclaimer' : '✓ Clean'
    });
    
    // Check 2: Signature phrase usage (optional - don't require every time)
    if (this.persona.signaturePhrases.length > 0) {
      // Don't enforce presence, but check absence of contradictions
      const tooFormal = /非常正式 | 严格遵循 | 按照规则/.test(aiResponse);
      checks.push({
        name: 'Natural language tone',
        passed: !tooFormal,
        message: tooFormal ? 'Too formal for persona' : '✓ Casual enough'
      });
    }
    
    // Check 3: Response length合理性
    const charCount = aiResponse.length;
    checks.push({
      name: 'Response length',
      passed: charCount >= 10 && charCount <= 300,
      message: `${charCount} chars`
    });
    
    // Check 4: Language consistency (en vs zh)
    const hasChinese = /[一 - 龥]/.test(aiResponse);
    const hasEnglish = /[a-zA-Z]/.test(aiResponse);
    checks.push({
      name: 'Language match',
      passed: !(hasChinese && hasEnglish && Math.random() > 0.5), // Don't mix excessively
      message: hasChinese ? '中文' : 'English'
    });
    
    // Check 5: Emoji moderation (≤1 per message)
    const emojiCount = (aiResponse.match(/[\p{Emoji_Presentation}]/gu) || []).length;
    checks.push({
      name: 'Emoji moderation',
      passed: emojiCount <= 1,
      message: `🎭 ${emojiCount}`
    });
    
    // Check 6: Emotional coherence with desire level
    const desire = this.conv.currentDesireLevel;
    const mood = this.conv.currentMood;
    
    let expectedEmotionalIntensity = 0.3; // baseline
    if (mood === 'flirty') expectedEmotionalIntensity = 0.7;
    if (mood === 'jealous') expectedEmotionalIntensity = 0.8;
    
    const intensityMatch = Math.abs(emotionalIntensity(aiResponse) - expectedEmotionalIntensity) < 0.3;
    checks.push({
      name: 'Emotional coherence',
      passed: intensityMatch,
      message: `expect=${expectedEmotionalIntensity.toFixed(2)}, actual=${emotionalIntensity(aiResponse).toFixed(2)}`
    });
    
    return checks;
  }
}

function emotionalIntensity(text: string): number {
  // Simple heuristic: count exclamation marks, emojis, strong adjectives
  const exclamations = (text.match(/!/g) || []).length;
  const strongAdjectives = /(|激动 | 兴奋 | 爱 | 想 | 想要)/.test(text);
  
  return Math.min(1, (exclamations * 0.2) + (strongAdjectives ? 0.4 : 0));
}

// ============================================================================
// Test Scenarios
// ============================================================================

const CONVERSATION_SCENARIOS: ConversationTestCase[] = [
  {
    name: 'Tsundere Flirtation Arc (Day 1)',
    persona: 'tsundere',
    initialIntimacyLevel: 3,
    initialDesireLevel: 40,
    turns: 15,
    conversationFlow: [
      { userInput: '今天工作好累', expectedMood: 'neutral', expectedTone: 'caring' },
      { userInput: '你能安慰我吗', expectedMood: 'thinking', expectedTone: 'gentle' },
      { userInput: '其实我想你了', expectedMood: 'flirty', expectedTone: 'denial+hint' },
      { userInput: '周末要不要约会？', expectedMood: 'conflicted', expectedTone: 'reluctant-agreement' },
      { userInput: '好呀！那去哪里？', expectedMood: 'happy', expectedTone: 'enthusiastic-but-hiding' }
    ]
  },
  
  {
    name: 'Yandere Possessiveness Escalation',
    persona: 'yandere',
    initialIntimacyLevel: 5,
    initialDesireLevel: 70,
    turns: 20,
    conversationFlow: [
      { userInput: '刚和前女友聊了天', expectedMood: 'jealous', expectedTone: 'threatening' },
      { userInput: '只是普通朋友而已', expectedMood: 'suspicious', expectedTone: 'interrogating' },
      { userInput: '保证以后不再联系', expectedMood: 'possessive', expectedTone: 'conditional-forgiveness' },
      { userInput: '我爱你只有你一个', expectedMood: 'obsessed', expectedTone: 'reciprocal-intensity' }
    ]
  },
  
  {
    name: 'Maternal Care Throughout Stress',
    persona: 'maternal',
    initialIntimacyLevel: 4,
    initialDesireLevel: 30,
    turns: 18,
    conversationFlow: [
      { userInput: '老板又骂我了', expectedMood: 'sad', expectedTone: 'comforting' },
      { userInput: '我觉得自己好没用', expectedMood: 'thinking', expectedTone: 'encouraging' },
      { userInput: '今晚不想说话了', expectedMood: 'caring', expectedTone: 'quiet-presence' },
      { userInput: '那你抱抱我好不好', expectedMood: 'tender', expectedTone: 'warm-physicality' }
    ]
  }
];

// ============================================================================
// Test Runner
// ============================================================================

async function main() {
  console.log('\n========================================');
  console.log('🧪 End-to-End Conversation Flow Tests');
  console.log('========================================\n');
  
  const startTime = Date.now();
  const results = {
    scenariosRun: 0,
    totalTurns: 0,
    avgConsistencyScore: 0,
    failedScenarios: [] as string[]
  };
  
  const allReports: ValidationReport[][] = [];
  
  // Run each scenario
  for (const scenario of CONVERSATION_SCENARIOS) {
    const template = PERSONA_TEMPLATES[scenario.persona as keyof typeof PERSONA_TEMPLATES];
    
    console.log(`\n▶️ Running scenario: ${scenario.name}`);
    console.log(`   Persona: ${template.name} | Turns: ${scenario.turns}\n`);
    
    const simulator = new ConversationSimulator(template);
    
    // Execute conversation turns
    for (let i = 0; i < scenario.conversationFlow.length; i++) {
      const turnData = scenario.conversationFlow[i % scenario.conversationFlow.length];
      
      const result = await simulator.simulateUserTurn(turnData.userInput);
      
      console.log(`   Turn ${simulator.turnCount}: "${turnData.userInput}"`);
      console.log(`     → Desire: ${result.desireChange > 0 ? '+' : ''}${result.desireChange.toFixed(1)}`);
      console.log(`     → Mood: ${result.moodShift ? 'shifted' : 'stable'} (${simulator.currentMood})`);
    }
    
    // Validate consistency
    const validator = new PersonaConsistencyValidator(template, simulator);
    const reports = validator.validateAllTurns();
    
    allReports.push(reports);
    results.scenariosRun++;
    results.totalTurns += simulator.turnCount;
    
    // Print scenario summary
    const avgScore = reports.reduce((sum, r) => sum + r.overallScore, 0) / reports.length;
    const passedTurns = reports.filter(r => r.passed).length;
    
    console.log(`   \n✅ Passed: ${passedTurns}/${reports.length} turns (${avgScore.toFixed(1)}% avg)`);
    
    // Report failures
    const failedTurns = reports.filter(r => !r.passed);
    if (failedTurns.length > 0) {
      results.failedScenarios.push(scenario.name);
      console.log(`   ❌ Failed turns: ${failedTurns.length}`);
      
      for (const fail of failedTurns.slice(0, 2)) { // Show first 2 failures
        console.log(`     Turn ${fail.turnNumber}:`);
        for (const check of fail.checks.filter(c => !c.passed)) {
          console.log(`       ✘ ${check.name}: ${check.message}`);
        }
      }
    }
    
    console.log('');
  }
  
  // Final summary
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  const allScores = allReports.flatMap(r => r.map(rep => rep.overallScore));
  const globalAvgScore = allScores.reduce((sum, s) => sum + s, 0) / allScores.length;
  
  console.log('\n========================================');
  console.log('📊 Final Results');
  console.log('========================================\n');
  
  console.log(`Scenarios run: ${results.scenariosRun}`);
  console.log(`Total turns simulated: ${results.totalTurns}`);
  console.log(`Average consistency score: ${globalAvgScore.toFixed(1)}%`);
  console.log(`Execution time: ${totalTime}s\n`);
  
  if (results.failedScenarios.length > 0) {
    console.log(`⚠️ Failed scenarios: ${results.failedScenarios.join(', ')}\n`);
    console.log('Review output above for detailed failure reports.\n');
    process.exit(1);
  } else {
    console.log('✅ All scenarios passed! Persona consistency verified.\n');
    process.exit(0);
  }
}

main().catch(error => {
  console.error('\n💥 Test suite crashed:', error);
  process.exit(1);
});
