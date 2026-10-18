# 跳出框架的创新方向探索

> source: obsidian://02.科研/ARIS-mNGS/系统设计/research_ideas/05_跳出框架的创新方向探索.md
> vault: /Users/mizi/Documents/Obsidian Vault

# 跳出框架的创新方向探索

> 日期：2026-04-19 15:35 | 主题：不从当前问题出发，从其他领域找能解决我们问题的方法

## 当前困境

PPR/Contrastive/Bayesian 三种"给 LLM 更多统计分析"的方法全部失败。
根因：KG 数据质量（小样本）不足以产生可靠的外部信号。
给 LLM 加噪声不如让它自己推理。

**需要换思路：不是"如何让 LLM 更好地读 KG"，而是"有什么方法能本质上改变 KG 与 LLM 的交互方式"。**

---

## 一、从知识图谱领域的方法出发

### 1.1 Graph Embedding → KG 信息压缩为向量

**方法**：不把 KG 文本化（"疾病关联：败血症"），而是把 KG 图结构编码为向量，注入 LLM。

```
传统: KG → 文本 → LLM prompt (token 粒度)
创新: KG → Graph Embedding → LLM hidden state (向量粒度)

具体:
  1. 用 TransE/RotatE 在 KG-01/03/05 上训练物种 embedding
  2. 每个物种得到一个 d 维向量，编码了它在图中的全部关系
  3. 作为 soft prompt 注入 LLM（类似 P-Tuning）
```

**优势**：不占 token 预算，不受文本化信息损失。
**问题**：需要 LLM 微调（当前用 vLLM 推理，不训练）。
**论文**：KG-enhanced P-Tuning for Clinical LLM (NeurIPS/ICLR)

### 1.2 Knowledge Graph Completion → 补全缺失关系

**方法**：KG-01 只有 10% 物种有疾病关联。不是检索策略的问题，是知识不完整。用 LLM 自身来补全 KG。

```
已知: 鲍曼不动杆菌 → CAUSES_DISEASE → 败血症 (KG-01)
缺失: CMV → ??? → ??? (KG-01 中无任何疾病关联)

补全:
  Prompt: "根据医学知识，CMV（巨细胞病毒）在新生儿中可能导致哪些疾病？"
  LLM: "CMV 可导致先天性 CMV 感染、肝炎、脑炎、视网膜炎..."
  → 生成新的 CAUSES_DISEASE 边 → 扩充 KG-01
  → 用已有的 489 条边做验证
```

**优势**：直接解决 KG 覆盖率 10% 的根本问题。
**论文**：LLM-driven KG Completion for Low-coverage Clinical Knowledge (KDD/WWW)

### 1.3 Subgraph Retrieval → 检索子图而非三元组

**方法**：当前检索是逐条查询（"该菌有什么疾病关联"）。改为检索整个子图（"该菌在图中的局部结构"）。

```
当前: query("鲍曼", KG-01) → [败血症, 肺炎, 院内感染]（三元组列表）

子图检索: 
  鲍曼 → 败血症 → HAS_PHENOTYPE → 发热, 白细胞升高
       → 肺炎 → HAS_PHENOTYPE → 咳嗽, 呼吸困难
       → BELONGS_TO → 不动杆菌属 → GENUS_CAUSES → 院内感染
  
  整个局部子图一起给 LLM，而非扁平的列表
```

**优势**：保留了图的结构信息（层级、传递性）。
**论文**：G-Retriever (ACL 2024) 已做了类似的事情。

---

## 二、从推荐系统/协同过滤出发

### 2.1 Collaborative Filtering on Case-KG

**核心洞察**：KG-03 本质上是一个 User-Item 矩阵！

```
     鲍曼  CMV  大肠  近平滑  ...
CRP↑  12:3  8:0  15:2  0:18  ...
发热   8:2  5:0  10:1  0:6   ...
早产   5:3  3:0   4:1  0:19  ...

行 = 条件（类似"用户"）
列 = 物种（类似"物品"）
值 = P1:P2 计数（类似"评分"）
```

**可以用推荐系统的方法**：
- 矩阵分解：找到条件和物种的低维表示
- 处理稀疏性：很多 (条件, 物种) 组合没有数据 → 类似冷启动问题
- 预测缺失值：对于没有直接统计数据的 (条件, 物种) 组合，用矩阵分解预测 P1 率

```
M ≈ U × V^T
U: 条件 embedding (70 × d)
V: 物种 embedding (103 × d)

对新的 (条件, 物种) 组合: predicted_p1_rate = U[condition] · V[species]
```

**优势**：解决小样本问题！即使某个 (CRP↑, CMV) 组合只有 0 例数据，也能通过矩阵分解推断。
**论文**：Clinical Collaborative Filtering for Pathogen Diagnosis (RecSys/KDD)

### 2.2 Item-to-Item 相似度 → 物种推荐

```
如果历史上"在有 CRP↑+发热 的病例中，大肠埃希菌经常是 P1"
且"大肠埃希菌和肺炎克雷伯菌在 Case-KG 中的条件分布很相似"
→ 那么肺炎克雷伯菌也可能是 P1

这是 Item-based Collaborative Filtering 的逻辑
```

---

## 三、从因果推理出发

### 3.1 Causal Graph → 区分致病 vs 共存

**核心问题**：mNGS 检出一个菌，不代表它是致病菌。可能是：
- 真正的致病菌（因果关系：菌 → 疾病）
- 共存的定植菌（相关但非因果：菌 ↔ 疾病 ← 共同原因）

```
因果图:
  鲍曼不动杆菌 → 败血症 (因果：菌导致病)
  表皮葡萄球菌 ↔ 败血症 ← 住院 (混杂：住院导致两者同时出现)

区分方法:
  do-calculus: P(败血症 | do(remove 鲍曼)) ≠ P(败血症)  → 因果
              P(败血症 | do(remove 表皮)) = P(败血症)  → 非因果
```

**在 KG-03 中做因果发现**：
- 如果一个物种在某个条件下 P1 率远高于 P2 → 可能是因果
- 如果 P1 率和 P2 率接近 → 可能只是共存

**论文**：Causal Discovery on Clinical Knowledge Graphs (CLeaR/UAI)

### 3.2 Instrumental Variable → 用 mNGS ratio 作为工具变量

```
ratio 高 → 更可能真正存在（不只是污染）
ratio 高 + KG 疾病关联 → 更可能是致病菌

ratio 可以作为"菌是否真正存在"的工具变量
用 2SLS (Two-Stage Least Squares) 估计"菌的存在"对"疾病"的因果效应
```

---

## 四、从信息论出发

### 4.1 Mutual Information Maximization

**目标**：找到最有信息量的 KG 证据子集。

```
当前: 把所有查到的 KG 证据都放进 prompt
问题: 有些证据是冗余的（KG-01 和 KG-05 说同一件事），有些是噪声的

创新: 选择 KG 证据子集 S，使得:
  max_S I(Y; S | X)  s.t. |S| ≤ k
  
  Y = 诊断结果 (P1/P2/negative)
  X = mNGS 信号 + 临床信息
  S = 选出的 KG 证据子集
  k = token 预算

即：在有限 token 预算下，选择对诊断最有信息量的 KG 证据
```

**这是 Feature Selection 的 KG 版本。**

### 4.2 Information Bottleneck

```
KG 原始信息 (G) → 压缩 (T) → 诊断 (Y)

目标: min I(G; T) - β · I(T; Y)

找到 KG 信息的最小充分统计量 T：
  保留对诊断有用的信息 (I(T;Y) 高)
  丢弃与诊断无关的冗余 (I(G;T) 低)
```

---

## 五、从对比学习出发

### 5.1 Contrastive Learning on (Patient, Pathogen) Pairs

**方法**：训练一个编码器，把"患者特征"和"物种特征"映射到同一空间。

```
正样本: (患者特征, GT P1 物种) → 近
负样本: (患者特征, non-P1 物种) → 远

编码器:
  patient_encoder(mNGS + clinical + lab) → v_patient
  species_encoder(KG features) → v_species
  
  score = cosine(v_patient, v_species)
  
loss = -log(exp(sim(p, s+)) / Σ exp(sim(p, s-)))
```

**优势**：不需要 LLM 推理，直接算相似度排序。可以作为 LLM 的前置排序器。
**论文**：类似 CLIP 的思路，但用在临床诊断上。

### 5.2 用对比学习替代 PPR

PPR 失败是因为分数不可靠。对比学习的分数是**训练出来的**，不是手工公式算的。

```
训练: 1000 例训练集 → 学习 patient-species 相似度函数
推理: 新患者 → 计算与每个物种的相似度 → 排序
→ 排序结果作为候选优先级给 LLM
```

---

## 六、推荐方向（综合实操和论文价值）

| 方向 | 创新度 | 实操性 | 能否解决当前问题 | 论文目标 |
|------|--------|--------|----------------|---------|
| **KG Completion (1.2)** | ★★★★ | 高（用 LLM 补 KG） | ✅ 直接解决 10% 覆盖率 | KDD/WWW |
| **Collaborative Filtering (2.1)** | ★★★★★ | 中（矩阵分解） | ✅ 解决小样本条件 P1 率 | RecSys/KDD |
| **Information Bottleneck (4.2)** | ★★★★★ | 中高 | ✅ 最优 KG 证据选择 | NeurIPS/ICML |
| **Contrastive Patient-Species (5.1)** | ★★★★ | 中（需训练） | ✅ 替代手工排序 | ACL/EMNLP |
| Causal Graph (3.1) | ★★★★★ | 低 | ⚠️ 需要更多数据 | UAI/CLeaR |
| Graph Embedding (1.1) | ★★★ | 低（需微调） | ⚠️ 当前无法微调 | ICLR |
