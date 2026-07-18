# SoulMate Qwen3 30B NSFW Worker

RunPod load-balancing worker for the Unlimited adult-roleplay route.

The image exposes an OpenAI-compatible API on port 80. Nginx maps RunPod's
required `/ping` probe to vLLM's `/health`; `/v1/*` requests and SSE streams are
passed through unchanged.

Pinned runtime configuration:

- vLLM image: `vllm/vllm-openai:v0.10.2`
- model/tokenizer: `TheHighKage/Qwen3-30B-A3B-abliterated-erotic`
- revision: `b207f2bc7564af696607f4b24e1f728b07af5392`
- served model: `soulmate-qwen3-30b-roleplay`
- context: 8192 tokens
- maximum sequences: 16
- GPU memory utilization: 0.90

Recommended RunPod endpoint settings:

- Type: Load Balancer
- GPU: `AMPERE_80`
- Active workers: 0
- Maximum workers: 1
- Idle timeout: 5 seconds
- Container port: 80

Build for `linux/amd64` and push the immutable commit tag to a private registry.
Do not bake Hugging Face or RunPod credentials into the image.
