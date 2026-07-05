import { describe, it, expect } from 'vitest';
import { detectIntent, getTaskType, routeToModel } from '../llm-router';

describe('detectIntent', () => {
  it('detects image generation intent', () => {
    expect(detectIntent('send me a selfie')).toBe('image_generation');
    expect(detectIntent('show me a picture of you')).toBe('image_generation');
    expect(detectIntent('draw yourself')).toBe('image_generation');
  });

  it('detects complex reasoning intent', () => {
    expect(detectIntent('why is the sky blue?')).toBe('complex_reasoning');
    expect(detectIntent('explain quantum mechanics')).toBe('complex_reasoning');
    expect(detectIntent('solve this equation')).toBe('complex_reasoning');
  });

  it('defaults to chat for casual conversation', () => {
    expect(detectIntent('hi')).toBe('chat');
    expect(detectIntent('how are you today')).toBe('chat');
  });
});

describe('getTaskType', () => {
  it('upgrades to image_generation on affirmative follow-up', () => {
    const result = getTaskType('yes please', {
      recentMessages: ['Can I see a selfie?'],
    });
    expect(result).toBe('image_generation');
  });

  it('keeps chat intent when affirmative but recent not image-related', () => {
    const result = getTaskType('yes please', {
      recentMessages: ['How are you?'],
    });
    expect(result).toBe('chat');
  });
});

describe('routeToModel', () => {
  it('routes chat to configured chat model', () => {
    const decision = routeToModel('chat');
    expect(decision.taskType).toBe('chat');
    expect(decision.modelId).toBeTruthy();
    expect(decision.temperature).toBeGreaterThan(0);
  });

  it('routes emotion_detection to local Llama', () => {
    const decision = routeToModel('emotion_detection');
    expect(decision.modelId).toBe('llama-local');
    expect(decision.useLocalLlama).toBe(true);
    expect(decision.temperature).toBeLessThan(0.5);
  });

  it('routes complex_reasoning with thinking enabled', () => {
    const decision = routeToModel('complex_reasoning', 'premium');
    expect(decision.thinking).toBe('enabled');
    expect(decision.modelId).toBe('deepseek-v3-2-251201');
  });

  it('uses lite model for free users', () => {
    const decision = routeToModel('chat', 'free');
    expect(decision.modelId).toBe('doubao-seed-2-0-lite-260215');
  });

  it('uses pro model for premium users', () => {
    const decision = routeToModel('chat', 'premium');
    expect(decision.modelId).toBe('doubao-seed-2-0-pro-260215');
  });

  it('includes fallback chain', () => {
    const decision = routeToModel('chat');
    expect(decision.fallbackChain).toBeInstanceOf(Array);
    expect(decision.fallbackChain.length).toBeGreaterThan(0);
    expect(decision.fallbackChain[0]).toContain('claude');
  });
});