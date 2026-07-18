# SoulMate Qwen3.5 9B NSFW GGUF Worker

OpenAI-compatible llama.cpp server for the Pro NSFW route.

- Model: `lukey03/Qwen3.5-9B-abliterated-GGUF`
- Quantization: `Q4_K_M` (~5.6 GB)
- Runtime: llama.cpp `b9445`, CUDA 12.8
- Served model: `soulmate-qwen35-9b-nsfw`
- HTTP port: `8000`
- Recommended GPU: 24 GB Ampere/Ada

The model is baked into the image so cold starts do not depend on Hugging Face downloads. The endpoint must use RunPod load-balancing/direct HTTP mode and expose container port `8000/http`.

Smoke-test the following before restoring production rollout:

1. `/health` returns success.
2. `/v1/models` contains `soulmate-qwen35-9b-nsfw`.
3. Chinese input returns Chinese-only natural language.
4. English input returns English-only natural language.
5. A multi-turn adult-roleplay regression preserves character facts and contains no garbled text.
