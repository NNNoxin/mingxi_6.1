# 大模型工程经验学习资源地图

> source: obsidian://01.知识库/工程经验/大模型工程经验学习资源.md
> vault: /Users/mizi/Documents/Obsidian Vault

---
date: 2026-04-18
tags: [engineering/gpu, engineering/inference, resource/tool]
type: resource-map
---

# 大模型工程经验学习资源地图

> **目的**：找到"只有跑过代码才知道"的实战经验来源，尤其是本地部署、GPU 推理、量化优化方向

---

## 一、社区资源（最核心）

### r/LocalLLaMA（Reddit）
**链接**：https://www.reddit.com/r/LocalLLaMA/  
**性质**：全球最活跃的本地 LLM 工程师社区  
**为什么有价值**：
- 真实用户的踩坑经验，不是广告软文
- 硬件实测对比（"我用 M3 Pro 跑 Qwen3-30B 速度是..."）
- 量化方案横评，社区投票出的最佳实践
- 新模型发布后 24 小时内就有人实测报告

**代表性信息**：
- DeepSeek R1 发布后社区实测：推理质量接近 GPT-4，但本地可跑
- Apple Silicon 被公认为消费级最佳 LLM 平台（统一内存架构更高效）
- "先跑 8B，够用就别升"——社区共识

---

### 知乎（中文工程圈）
**代表性栏目**：
- [长篇白话解读 vLLM：让大模型推理快得飞起的"黑魔法"](https://zhuanlan.zhihu.com/p/1891089721192599865) — vLLM 原理深度解析
- [vLLM 在大模型推理中的显存分析——以 Qwen3-32B 为例](https://zhuanlan.zhihu.com/p/1947229675689603831) — 实战显存分析
- [大语言模型推理加速：硬件视角的全面解析](https://zhuanlan.zhihu.com/p/1895888543127154854) — 硬件视角系统讲解
- [混合推理 Qwen3: vLLM+量化加速实测](https://zhuanlan.zhihu.com/p/1920424559649203883) — 最新实测数据

**搜索技巧**：知乎搜索 `vLLM 实战`、`大模型推理 显存`、`量化部署`，按"最新"排序

---

### CSDN / 掘金（中文开发者）
- [全网最全！2025 年本地化部署大模型保姆级避坑指南](https://blog.csdn.net/m0_57081622/article/details/147756825) — 含配置/价格/速度/场景
- 搜索关键词：`大模型 本地部署 避坑`、`vLLM 参数配置`

---

## 二、技术博客 / 指南（系统性强）

### 英文综合指南
| 资源 | 特色 | 链接 |
|------|------|------|
| SitePoint 2026 Production Guide | 企业级生产部署全链路 | [链接](https://www.sitepoint.com/the-2026-definitive-guide-to-running-local-llms-in-production/) |
| Hivenet Practical Inference Guide | 生产环境推理优化 | [链接](https://compute.hivenet.com/post/llm-inference-production-guide) |
| Nebius vLLM 实战指南 | vLLM serving 深度实践 | [链接](https://nebius.com/blog/posts/serving-llms-with-vllm-practical-guide) |
| vLLM 官方优化文档 | 参数调优权威参考 | [链接](https://docs.vllm.ai/en/stable/configuration/optimization/) |
| Medium: Running LLM Inference TLDR | 快速上手推理 | [链接](https://deeprnd.medium.com/running-llm-inference-a-tldr-guide-d159bf611297) |

### 硬件选型
| 资源 | 特色 | 链接 |
|------|------|------|
| 知乎：2025 年全球主流大模型本地部署硬件配置指南 | 中文最全硬件方案 | [链接](https://zhuanlan.zhihu.com/p/1939439830078583483) |
| sanj.dev: $1500 Build Guide | 消费级极致性价比方案 | [链接](https://sanj.dev/post/building-affordable-ai-hardware-local-llms) |
| Apple Silicon Optimization Guide | M 系芯片专项优化 | [链接](https://blog.starmorph.com/blog/apple-silicon-llm-inference-optimization-guide) |

---

## 三、官方项目文档 + GitHub（最权威）

| 项目 | 定位 | 链接 |
|------|------|------|
| **vLLM** | 生产级高吞吐推理引擎，PagedAttention 发明者 | [GitHub](https://github.com/vllm-project/vllm) |
| **Ollama** | 本地部署最简方案，适合个人/小团队 | https://ollama.com |
| **llama.cpp** | CPU+GPU 混合推理，GGUF 格式标准制定者 | https://github.com/ggerganov/llama.cpp |
| **SGLang** | 多 GPU 高性能方案，比 vLLM 新 | https://github.com/sgl-project/sglang |

**GitHub Issue 是宝库**：遇到具体问题，直接在这些仓库搜 Issue，比 Google 快

---

## 四、学术论文（理论支撑）

| 论文 | 内容 | 来源 |
|------|------|------|
| vLLM: Efficient Memory Management for LLM Serving with PagedAttention | vLLM 核心原理 | [Berkeley 技术报告](https://www2.eecs.berkeley.edu/Pubs/TechRpts/2025/EECS-2025-192.pdf) |
| Comparative Study of MLX, MLC-LLM, Ollama, llama.cpp | 推理框架横评 | [arXiv 2511.05502](https://arxiv.org/pdf/2511.05502) |

---

## 五、关键工程知识速查

从以上资源提炼的**最高频工程经验**：

### 显存计算公式
```
总显存需求 = 模型参数量 × 精度字节数 + KV Cache + 2~4GB 框架开销

例：14B fp16 = 14B × 2字节 = 28GB + KV Cache(约2-4GB) ≈ 30-32GB
例：14B INT4 = 14B × 0.5字节 = 7GB + KV Cache ≈ 10GB
```

### 量化方案对比

| 精度 | 显存压缩比 | 质量损失 | 推荐场景 |
|------|-----------|----------|----------|
| FP16 | 1× | 无 | 生产环境、精度敏感 |
| INT8 | 0.5× | 极小（<1%） | 平衡推荐 |
| INT4/GPTQ | 0.25× | 小（1-3%） | 显存受限 |
| GGUF Q4_K_M | 0.25× | 小 | llama.cpp/Ollama 首选 |

### 推理框架选型决策树

```
个人/小团队，图省事？
  → Ollama（一行命令，简单直接）

生产环境，需要高并发？
  → vLLM（PagedAttention，最高吞吐量）

多 GPU，追求极致性能？
  → SGLang（比 vLLM 新，部分场景更快）

Apple Silicon？
  → Ollama + Metal 加速 / MLX 框架
```

### 多卡选择原则
→ 详见 [[01.知识库/工程经验/GPU推理部署]]

---

## 六、推荐学习路径

**Week 1：跑通基础**
1. 安装 Ollama，跑通 Qwen2.5-7B
2. 用 `nvidia-smi` 观察显存占用和带宽

**Week 2：理解原理**
1. 读知乎《长篇白话解读 vLLM》
2. 读 r/LocalLLaMA 置顶 FAQ

**Week 3：生产实践**
1. 换用 vLLM，对比 Ollama 吞吐量差异
2. 实测 FP16 vs INT4 量化的速度和质量差异

**持续更新**：
- 关注 r/LocalLLaMA（每天 5 分钟，看 Top Posts）
- 知乎关注标签「大模型推理」「vLLM」

---

## 相关页面

- [[01.知识库/工程经验/GPU推理部署]] - 本地已有：带宽瓶颈 + 多卡决策
- [[02.科研/RAG/纯文本RAG-SOTA总结]] - RAG 架构谱系
