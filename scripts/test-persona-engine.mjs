/**
 * Persona Engine Test Suite
 * 
 * Automated testing for personality-driven response generation,
 * mood detection, desire calculation, and proactive message scheduling.
 * 
 * Usage:
 *   pnpm tsx scripts/test-persona-engine.mjs
 */

import { expect } from 'vitest';
import { buildPersonaPrompt } from '../src/lib/prompt-builder.js';
import { calculateDesireLevel, getDesireLanguageGradient } from '../src/lib/desire-calculator.js';
import { detectCompanionMood } from '../src/lib/mood-detector.js';
import { scheduleProactiveMessage, runSchedulerBatch } from '../src/lib/proactive-message-queue.js';

// ============================================================================
// Test Configuration
// ============================================================================

const TEST_USER_ID = 'test-user-123';
const TEST_GIRLFRIEND_ID = 'test-girlfriend-456';

interface TestCase {
  name: string;
  input: any;
  assertions: Array<{
    path: string;
    expected: string | RegExp | ((value: any) => boolean);
    description: string;
  }>;
}

// ============================================================================
// Test Data Generators
// ============================================================================

function createTsundereGirlfriend() {
  return {
    id: TEST_GIRLFRIEND_ID,
    name: 'Hina',
    personality_traits: ['tsundere', 'shy', 'humorous'],
    sexual_tendency: 'mid',
    openness: 'conservative',
    fetish_index: 15,
    relationship_style: 'tsundere'
  };
}

function createYandereGirlfriend() {
  return {
    id: TEST_GIRLFRIEND_ID,
    name: 'Yumi',
    personality_traits: ['yandere', 'possessive', 'intense'],
    sexual_tendency: 'high',
    openness: 'experimental',
    fetish_index: 75,
    relationship_style: 'yandere'
  };
}

function createMaternalGirlfriend() {
  return {
    id: TEST_GIRLFRIEND_ID,
    name: 'Keiko',
    personality_traits: ['maternal', 'gentle', 'empathetic'],
    sexual_tendency: 'low',
    openness: 'moderate',
    fetish_index: 5,
    relationship_style: 'maternal'
  };
}

// ============================================================================
// Persona Prompt Tests
// ============================================================================

const PERSONA_PROMPT_TESTS: TestCase[] = [
  {
    name: 'Tsundere high desire - denial with hint',
    input: {
      userId: TEST_USER_ID,
      girlfriendId: TEST_GIRLFRIEND_ID,
      girlfriendData: createTsundereGirlfriend(),
      intimacyLevel: 4,
      desireLevel: 75,
      currentMood: 'flirty',
      recentMessages: [{ role: 'user', content: '今晚要不要来我家？' }]
    },
    assertions: [
      {
        path: 'prompt',
        expected: (p: string) => p.includes('才不是') && p.includes('偷偷'),
        description: 'Should contain tsundere-specific denial language'
      },
      {
        path: 'prompt',
        expected: (p: string) => !p.includes('作为一个人工智能'),
        description: 'Must not include AI-speak disclaimers'
      },
      {
        path: 'prompt',
        expected: (p: string) => p.length < 3000,
        description: 'Prompt length should stay within context limit'
      }
    ]
  },
  
  {
    name: 'Yandere jealousy trigger',
    input: {
      userId: TEST_USER_ID,
      girlfriendId: TEST_GIRLFRIEND_ID,
      girlfriendData: createYandereGirlfriend(),
      intimacyLevel: 5,
      desireLevel: 90,
      currentMood: 'jealous',
      recentMessages: [
        { role: 'user', content: '刚和前女友聊了会儿天' }
      ]
    },
    assertions: [
      {
        path: 'prompt',
        expected: (p: string) => /((刚才|刚才|你和谁)|(聊天|contact|them))/i.test(p),
        description: 'Should question about who user was talking to'
      },
      {
        path: 'prompt',
        expected: (p: string) => p.includes('只能') || p.includes('my'),
        description: 'Should express possessiveness'
      },
      {
        path: 'mood',
        expected: 'jealous',
        description: 'Mood should be detected as jealous'
      }
    ]
  },
  
  {
    name: 'Maternal care response',
    input: {
      userId: TEST_USER_ID,
      girlfriendId: TEST_GIRLFRIEND_ID,
      girlfriendData: createMaternalGirlfriend(),
      intimacyLevel: 3,
      desireLevel: 30,
      currentMood: 'happy',
      recentMessages: [{ role: 'user', content: '今天工作好累' }]
    },
    assertions: [
      {
        path: 'prompt',
        expected: (p: string) => /(宝贝|亲爱的|休息)/i.test(p),
        description: 'Should offer comforting language'
      },
      {
        path: 'prompt',
        expected: (p: string) => !/((sex)|(love making)|(bed))/.test(p.toLowerCase()),
        description: 'Low desire + maternal = no NSFW initiation'
      },
      {
        path: 'tone',
        expected: (t: string) => t.includes('care') || t.includes('nurturing'),
        description: 'Tone should reflect nurturing style'
      }
    ]
  },
  
  {
    name: 'Memory flashback integration',
    input: {
      userId: TEST_USER_ID,
      girlfriendId: TEST_GIRLFRIEND_ID,
      memories: [
        {
          event_type: 'first_date',
          summary: '第一次在海边约会看日落',
          date: '2026-07-15',
          importance: 0.9
        }
      ],
      girlfriendData: createMaternalGirlfriend(),
      desireLevel: 50
    },
    assertions: [
      {
        path: 'prompt',
        expected: (p: string) => /((海边)|(sunset)|(beach))/.test(p),
        description: 'Should reference past shared memory'
      },
      {
        path: 'memories_injected',
        expected: (count: number) => count === 1,
        description: 'Exactly one memory should be recalled'
      }
    ]
  }
];

// ============================================================================
// Desire Calculator Tests
// ============================================================================

const DESIRE_CALCULATOR_TESTS: TestCase[] = [
  {
    name: 'High NSFW topic increases desire',
    input: {
      userId: TEST_USER_ID,
      girlfriendId: TEST_GIRLFRIEND_ID,
      topicSentiment: 0.85,
      openness: 'open'
    },
    assertions: [
      {
        path: 'delta',
        expected: (d: number) => d > 20,
        description: 'NSFW topic should cause significant increase'
      },
      {
        path: 'trend',
        expected: 'up',
        description: 'Trend must be upward after positive sentiment'
      },
      {
        path: 'factors.topic_impact',
        expected: (impact: number) => impact > 15,
        description: 'Topic impact should be major driver'
      }
    ]
  },
  
  {
    name: 'Conservative partner resists flirty advances',
    input: {
      userId: TEST_USER_ID,
      girlfriendId: TEST_GIRLFRIEND_ID,
      topicSentiment: 0.6,
      openness: 'conservative'
    },
    assertions: [
      {
        path: 'delta',
        expected: (d: number) => d < 10,
        description: 'Conservative modifier reduces gain by half'
      },
      {
        path: 'factors.openness_modifier',
        expected: 0.5,
        description: 'Correct conservative multiplier applied'
      }
    ]
  },
  
  {
    name: 'Natural decay over time',
    input: {
      userId: TEST_USER_ID,
      girlfriendId: TEST_GIRLFRIEND_ID,
      topicSentiment: 0.0,
      hoursSinceLastInteraction: 24
    },
    assertions: [
      {
        path: 'delta',
        expected: (d: number) => d < -8 && d > -12,
        description: '~10 point daily decay expected'
      },
      {
        path: 'trend',
        expected: 'down',
        description: 'No interaction leads to downward trend'
      }
    ]
  },
  
  {
    name: 'Gift sending boosts desire regardless of topic',
    input: {
      userId: TEST_USER_ID,
      girlfriendId: TEST_GIRLFRIEND_ID,
      messageType: 'gift',
      topicSentiment: -0.2 // slightly negative topic
    },
    assertions: [
      {
        path: 'delta',
        expected: (d: number) => d > 5,
        description: 'Gift overrides negative sentiment partially'
      },
      {
        path: 'message_modifer',
        expected: (m: number) => m === 8,
        description: 'Fixed gift bonus applied'
      }
    ]
  }
];

// ============================================================================
// Mood Detector Tests
// ============================================================================

const MOOD_DETECTOR_TESTS: TestCase[] = [
  {
    name: 'Jealousy keyword detection',
    input: {
      userId: TEST_USER_ID,
      girlfriendId: TEST_GIRLFRIEND_ID,
      desireLevel: 60,
      recentMessages: [
        { role: 'user', content: '为什么刚才在和那个女生聊天？' }
      ]
    },
    assertions: [
      {
        path: 'currentMood',
        expected: 'jealous',
        description: 'Keyword "女生" triggers jealousy detection'
      },
      {
        path: 'confidence',
        expected: (c: number) => c > 0.8,
        description: 'Strong signal should yield high confidence'
      },
      {
        path: 'reason',
        expected: (r: string) => r.includes('jealousy'),
        description: 'Reason field explains trigger source'
      }
    ]
  },
  
  {
    name: 'Nostalgia from past references',
    input: {
      userId: TEST_USER_ID,
      girlfriendId: TEST_GIRLFRIEND_ID,
      desireLevel: 70,
      recentMessages: [
        { role: 'user', content: '还记得我们去年这个时候吗？' }
      ]
    },
    assertions: [
      {
        path: 'currentMood',
        expected: 'nostalgic',
        description: '"记得"/"remember" triggers nostalgia'
      },
      {
        path: 'confidence',
        expected: (c: number) => c > 0.75,
        description: 'Clear nostalgic intent detected'
      }
    ]
  },
  
  {
    name: 'Default prediction from desire + personality',
    input: {
      userId: TEST_USER_ID,
      girlfriendId: TEST_GIRLFRIEND_ID,
      desireLevel: 85,
      personalityTypes: ['playful'],
      recentMessages: [] // No triggers, rely on prediction
    },
    assertions: [
      {
        path: 'currentMood',
        expected: (m: string) => m === 'flirty' || m === 'happy',
        description: 'High desire → playful/flirty state'
      },
      {
        path: 'confidence',
        expected: (c: number) => c < 0.8,
        description: 'Predictive model has lower confidence'
      }
    ]
  }
];

// ============================================================================
// Proactive Message Tests
// ============================================================================

const PROACTIVE_MESSAGE_TESTS: TestCase[] = [
  {
    name: 'Daily limit enforcement',
    input: {
      userId: TEST_USER_ID,
      girlfriendId: TEST_GIRLFRIEND_ID,
      templateId: 'morning_greeting',
      triggerType: 'schedule',
      existingCountToday: 1 // Already sent once today
    },
    assertions: [
      {
        path: 'status',
        expected: 'CANCELLED:DAILY_LIMIT',
        description: 'Second message rejected due to daily cap'
      }
    ]
  },
  
  {
    name: 'Intimacy threshold gate',
    input: {
      userId: TEST_USER_ID,
      girlfriendId: TEST_GIRLFRIEND_ID,
      templateId: 'missing_you_high',
      intimacyScore: 150 // Below minimum requirement
    },
    assertions: [
      {
        path: 'status',
        expected: 'CANCELLED:LOW_INTIMACY',
        description: 'Lv.2+ required for advanced missing templates'
      }
    ]
  },
  
  {
    name: 'Time window validation',
    input: {
      templateId: 'goodnight_message',
      scheduledAt: new Date('2026-08-14T03:00:00Z'), // Outside 22:00-23:30
      config: { timeRanges: ['22:00-23:30'] }
    },
    assertions: [
      {
        path: 'rescheduled',
        expected: (rs: boolean) => rs === true,
        description: 'Out-of-window messages auto-reschedule'
      }
    ]
  },
  
  {
    name: 'Parameter injection correctness',
    input: {
      templateId: 'missing_you_high',
      params: { hours: 48, days: 2 },
      baseTemplate: "You've been gone {hours} hours! 😤",
      expectedOutput: "You've been gone 48 hours! 😤"
    },
    assertions: [
      {
        path: 'injectedText',
        expected: (text: string) => text === "You've been gone 48 hours! 😤",
        description: 'Parameters replaced correctly'
      }
    ]
  }
];

// ============================================================================
// Execution Engine
// ============================================================================

async function runTestCase(test: TestCase, mode: string): Promise<any> {
  const results = {
    testName: test.name,
    passed: 0,
    failed: 0,
    assertions: [] as Array<{
      description: string;
      status: '✓' | '✗';
      actual?: any;
      expected?: any;
    }>,
    output: null
  };

  try {
    let output: any;
    
    // Route to correct test module
    switch (mode) {
      case 'persona':
        output = await testPersonaModule(test.input);
        break;
      case 'desire':
        output = await testDesireModule(test.input);
        break;
      case 'mood':
        output = await testMoodModule(test.input);
        break;
      case 'proactive':
        output = await testProactiveModule(test.input);
        break;
      default:
        throw new Error(`Unknown test mode: ${mode}`);
    }
    
    results.output = output;
    
    // Run all assertions
    for (const assertion of test.assertions) {
      const actual = getValueByPath(output, assertion.path);
      const expected = assertion.expected;
      
      let passed = false;
      
      if (typeof expected === 'string' || typeof expected === 'number') {
        passed = actual === expected;
      } else if (expected instanceof RegExp) {
        passed = expected.test(actual);
      } else if (typeof expected === 'function') {
        passed = expected(actual);
      }
      
      results.assertions.push({
        description: assertion.description,
        status: passed ? '✓' : '✗',
        actual: passed ? undefined : actual,
        expected: passed ? undefined : expected
      });
      
      if (passed) results.passed++;
      else results.failed++;
    }
    
  } catch (error) {
    results.error = error instanceof Error ? error.message : String(error);
    results.failed = test.assertions.length;
  }
  
  return results;
}

function getValueByPath(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

async function testPersonaModule(input: any): Promise<any> {
  const prompt = await buildPersonaPrompt({
    userId: input.userId,
    girlfriendId: input.girlfriendId,
    currentMessage: { role: 'user', content: 'test' },
    scenarioState: undefined
  });
  
  return {
    prompt,
    layers: extractPromptLayers(prompt),
    timestamp: new Date().toISOString()
  };
}

async function testDesireModule(input: any): Promise<any> {
  return await calculateDesireLevel({
    userId: input.userId,
    girlfriendId: input.girlfriendId,
    topicSentiment: input.topicSentiment,
    messageType: input.messageType,
    context: {
      hoursSinceLastInteraction: input.hoursSinceLastInteraction
    }
  });
}

async function testMoodModule(input: any): Promise<any> {
  return await detectCompanionMood({
    userId: input.userId,
    girlfriendId: input.girlfriendId,
    desireLevel: input.desireLevel,
    recentMessages: input.recentMessages || []
  });
}

async function testProactiveModule(input: any): Promise<any> {
  const result = await scheduleProactiveMessage({
    userId: input.userId,
    girlfriendId: input.girlfriendId,
    templateId: input.templateId,
    triggerType: input.triggerType,
    params: input.params
  });
  
  return {
    queueId: result,
    status: result.startsWith('CANCELLED') ? result : 'scheduled'
  };
}

function extractPromptLayers(prompt: string): Record<string, string> {
  const sections = {
    base_persona: '',
    relationship_context: '',
    dynamic_state: '',
    memory_flashbacks: '',
    speaking_constraints: ''
  };
  
  // Simple regex-based section extraction
  const layer1Match = prompt.match(/=== BASE PERSONA ===([\s\S]*?)(?=== RELATIONSHIP)/);
  const layer2Match = prompt.match(/=== RELATIONSHIP CONTEXT ===([\s\S]*?)(?=== DYNAMIC)/);
  const layer3Match = prompt.match(/=== DYNAMIC STATE ===([\s\S]*?)(?=== MEMORY)/);
  const layer4Match = prompt.match(/=== MEMORY FLASHBACKS ===([\s\S]*?)(?=== SPEAKING)/);
  const layer5Match = prompt.match(/=== SPEAKING CONSTRAINTS ===([\s\S]*)$/);
  
  if (layer1Match) sections.base_persona = layer1Match[1].trim();
  if (layer2Match) sections.relationship_context = layer2Match[1].trim();
  if (layer3Match) sections.dynamic_state = layer3Match[1].trim();
  if (layer4Match) sections.memory_flashbacks = layer4Match[1].trim();
  if (layer5Match) sections.speaking_constraints = layer5Match[1].trim();
  
  return sections;
}

// ============================================================================
// Test Runner CLI
// ============================================================================

async function main() {
  console.log('\n========================================');
  console.log('🧪 Persona Engine Test Suite v1.0');
  console.log('========================================\n');
  
  const totalStart = Date.now();
  const results = {
    persona: { passed: 0, failed: 0, cases: [] },
    desire: { passed: 0, failed: 0, cases: [] },
    mood: { passed: 0, failed: 0, cases: [] },
    proactive: { passed: 0, failed: 0, cases: [] }
  };
  
  // Run all test suites in parallel
  await Promise.all([
    runTestSuite('persona', PERSONA_PROMPT_TESTS, results.persona),
    runTestSuite('desire', DESIRE_CALCULATOR_TESTS, results.desire),
    runTestSuite('mood', MOOD_DETECTOR_TESTS, results.mood),
    runTestSuite('proactive', PROACTIVE_MESSAGE_TESTS, results.proactive)
  ]);
  
  const totalEnd = Date.now();
  const totalTime = ((totalEnd - totalStart) / 1000).toFixed(1);
  
  // Summary report
  const totalPassed = Object.values(results).reduce((sum, r) => sum + r.passed, 0);
  const totalFailed = Object.values(results).reduce((sum, r) => sum + r.failed, 0);
  
  console.log('\n========================================');
  console.log('📊 Test Results Summary');
  console.log('========================================\n');
  
  printSectionResults('persona', 'Persona Prompt Injection');
  printSectionResults('desire', 'Desire Level Calculator');
  printSectionResults('mood', 'Mood Detection Engine');
  printSectionResults('proactive', 'Proactive Message Queue');
  
  console.log('\n─────────────────────────────────────────');
  console.log(`Total: ${totalPassed} passed, ${totalFailed} failed (${totalFailed > 0 ? '❌' : '✅'})`);
  console.log(`Time: ${totalTime}s\n`);
  
  if (totalFailed > 0) {
    console.log('❌ Some tests failed. Review output above for details.\n');
    process.exit(1);
  } else {
    console.log('✅ All tests passed! Persona engine is ready for deployment.\n');
    process.exit(0);
  }
}

async function runTestSuite(mode: string, tests: TestCase[], results: any) {
  console.log(`\n▶️ Running ${mode.toUpperCase()} tests...\n`);
  
  for (const test of tests) {
    const startTime = Date.now();
    const result = await runTestCase(test, mode);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    results.cases.push({
      ...result,
      duration
    });
    
    // Console output per test
    console.log(`  ${result.status === '✓' ? '✅' : '❌'} ${test.name} (${duration}s)`);
    
    results.passed += result.passed;
    results.failed += result.failed;
    
    // Print failures
    if (result.failed > 0) {
      for (const assertion of result.assertions) {
        if (assertion.status === '✗') {
          console.log(`     ✘ ${assertion.description}`);
          console.log(`       Expected: ${JSON.stringify(assertion.expected)}`);
          console.log(`       Actual:   ${JSON.stringify(assertion.actual)}\n`);
        }
      }
    }
  }
}

function printSectionResults(section: string, label: string) {
  const data = results[section];
  const pct = data.passed + data.failed > 0 
    ? ((data.passed / (data.passed + data.failed)) * 100).toFixed(1) 
    : 100;
  
  console.log(`${label}:`);
  console.log(`  ✅ Passed: ${data.passed}`);
  console.log(`  ❌ Failed: ${data.failed}`);
  console.log(`  📈 Pass Rate: ${pct}%`);
  console.log('');
}

// Run the test suite
main().catch(error => {
  console.error('\n💥 Test suite crashed:', error);
  process.exit(1);
});
