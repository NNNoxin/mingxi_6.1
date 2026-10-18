# 2026-03-09-运行结果

> source: obsidian://02.科研/ARIS-mNGS/实验记录/2026-03-09-运行结果.md
> vault: /Users/mizi/Documents/Obsidian Vault

---
date: 2026-03-09
tags: ["research/mNGS"]
---
============================================================
  Pilot 实验 - 模型: deepseek-chat
============================================================

[1/5] 加载数据...
  加载了 1200 条记录

[2/5] 选取代表性样本...
  选取了 10 条样本：
    #1 [counterintuitive] FDMS0000002 - mNGS菌种数=103, 标注=P2, 致病菌数=2
    #2 [counterintuitive] FDMS0000003 - mNGS菌种数=56, 标注=P2, 致病菌数=2
    #3 [counterintuitive] FDMS0000004 - mNGS菌种数=71, 标注=P2, 致病菌数=1
    #4 [negative] FDMS0000033 - mNGS菌种数=38, 标注=NEGATIVE, 致病菌数=0
    #5 [negative] FDMS0000108 - mNGS菌种数=4, 标注=NEGATIVE, 致病菌数=0
    #6 [negative] FDMS0000150 - mNGS菌种数=5, 标注=NEGATIVE, 致病菌数=0
    #7 [normal] FDMS0000008 - mNGS菌种数=36, 标注=P2, 致病菌数=2
    #8 [normal] FDMS0000013 - mNGS菌种数=50, 标注=MIXED, 致病菌数=2
    #9 [multi_pathogen] FDMS0000022 - mNGS菌种数=71, 标注=MIXED, 致病菌数=3
    #10 [multi_pathogen] FDMS0000047 - mNGS菌种数=28, 标注=P2, 致病菌数=3

[3/5] 调用 LLM (deepseek-chat)...
  正在处理第 1/10 条，studyID=FDMS0000002 [counterintuitive]... 完成 (14.3s, 2485 tokens)
  正在处理第 2/10 条，studyID=FDMS0000003 [counterintuitive]... 完成 (15.4s, 2464 tokens)
  正在处理第 3/10 条，studyID=FDMS0000004 [counterintuitive]... 完成 (16.8s, 2438 tokens)
  正在处理第 4/10 条，studyID=FDMS0000033 [negative]... 完成 (14.7s, 2118 tokens)
  正在处理第 5/10 条，studyID=FDMS0000108 [negative]... 完成 (12.3s, 1347 tokens)
  正在处理第 6/10 条，studyID=FDMS0000150 [negative]... 完成 (9.1s, 1307 tokens)
  正在处理第 7/10 条，studyID=FDMS0000008 [normal]... 完成 (12.3s, 2109 tokens)
  正在处理第 8/10 条，studyID=FDMS0000013 [normal]... 完成 (11.2s, 2306 tokens)
  正在处理第 9/10 条，studyID=FDMS0000022 [multi_pathogen]... 完成 (13.0s, 2359 tokens)
  正在处理第 10/10 条，studyID=FDMS0000047 [multi_pathogen]... 完成 (13.2s, 1816 tokens)

[4/5] 计算汇总指标...

[5/5] 保存结果...
  → C:\Users\24208\Desktop\LLM_for_diagnosis0606\ori_data\Trae\p1_diagnosis_system\pilot_experiment\pilot_results_detail.json
  → C:\Users\24208\Desktop\LLM_for_diagnosis0606\ori_data\Trae\p1_diagnosis_system\pilot_experiment\pilot_llm_raw_responses.json
  → C:\Users\24208\Desktop\LLM_for_diagnosis0606\ori_data\Trae\p1_diagnosis_system\pilot_experiment\pilot_results_summary.txt

============================================================
  实验完成！结果摘要
============================================================
  Micro Precision: 0.0303
  Micro Recall:    0.0667
  Micro F1:        0.0417
  NEGATIVE 准确率:  0/3
  Reads Bias (医生-LLM排名差): -0.9
  Top-1 Recall: 20.0% | Top-3: 46.7% | Top-5: 60.0% | LLM: 6.7%


## 实验结果

### 整体指标

|指标|值|
|---|---|
|Micro Precision|0.0303 (1/33)|
|Micro Recall|0.0667 (1/15)|
|Micro F1|0.0417|
|NEGATIVE 准确率|0/3 (全部误判为有致病菌)|
|TP=1, FP=32, FN=14||

### Reads Count Bias 分析

|指标|值|
|---|---|
|医生标注致病菌平均 SMRN 排名|5.0（排名1=最高）|
|LLM 判断致病菌平均 SMRN 排名|5.8|
|偏差|-0.9 位|

虽然排名偏差不大，但 LLM 的核心问题不是选排名靠前的菌，而是选了错误的"高致病力"菌种（如铜绿假单胞菌、鲍曼不动杆菌），完全忽略了那些看起来像"定植菌"但实际被医生标注的菌种。

### Top-K 简单策略 vs LLM

|策略|Recall|
|---|---|
|SMRN Top-1|20.0%|
|SMRN Top-3|46.7%|
|SMRN Top-5|60.0%|
|LLM (deepseek-chat)|6.7%|

LLM 的表现甚至远低于简单选 Top-1 的策略，说明 LLM 在 zero-shot 下对 mNGS 致病菌判读存在严重偏差。

### 关键发现

1. 命名不匹配导致 TP 被低估：LLM 输出"近平滑假丝酵母"但标注为"近平滑念珠菌"，"人类β疱疹病毒5型（巨细胞病毒）"vs 标注"人类疱疹病毒5型(CMV)"——实际是同一种菌但精确匹配失败。

2. LLM 有强烈的"教科书偏差"：几乎每条样本都选了铜绿假单胞菌、鲍曼不动杆菌这些"经典致病菌"，即使它们不是医生标注的致病菌。

3. NEGATIVE 全部误判：3条无致病菌的样本，LLM 全部判为有致病菌（FP 爆炸）。

4. 真正的致病菌（如痤疮丙酸杆菌、奥斯陆莫拉菌等定植菌）被 LLM 系统性忽略。

### 输出文件

所有结果保存在 pilot_experiment/ 目录下：

- pilot_results_detail.json — 每条样本的完整评估

- pilot_results_summary.txt — 人类可读汇总报告

- pilot_llm_raw_responses.json — API 原始返回


============================================================
  Pilot 实验 - 模型: gpt-4o
============================================================

[1/5] 加载数据...
  加载了 1200 条记录

[2/5] 选取代表性样本...
  选取了 10 条样本：
    #1 [counterintuitive] FDMS0000002 - mNGS菌种数=103, 标注=P2, 致病菌数=2
    #2 [counterintuitive] FDMS0000003 - mNGS菌种数=56, 标注=P2, 致病菌数=2
    #3 [counterintuitive] FDMS0000004 - mNGS菌种数=71, 标注=P2, 致病菌数=1
    #4 [negative] FDMS0000033 - mNGS菌种数=38, 标注=NEGATIVE, 致病菌数=0
    #5 [negative] FDMS0000108 - mNGS菌种数=4, 标注=NEGATIVE, 致病菌数=0
    #6 [negative] FDMS0000150 - mNGS菌种数=5, 标注=NEGATIVE, 致病菌数=0
    #7 [normal] FDMS0000008 - mNGS菌种数=36, 标注=P2, 致病菌数=2
    #8 [normal] FDMS0000013 - mNGS菌种数=50, 标注=MIXED, 致病菌数=2
    #9 [multi_pathogen] FDMS0000022 - mNGS菌种数=71, 标注=MIXED, 致病菌数=3
    #10 [multi_pathogen] FDMS0000047 - mNGS菌种数=28, 标注=P2, 致病菌数=3

[3/5] 调用 LLM (gpt-4o)...
  正在处理第 1/10 条，studyID=FDMS0000002 [counterintuitive]... 完成 (7.7s, 2726 tokens)
  正在处理第 2/10 条，studyID=FDMS0000003 [counterintuitive]... 完成 (6.6s, 2751 tokens)
  正在处理第 3/10 条，studyID=FDMS0000004 [counterintuitive]... 完成 (9.6s, 2701 tokens)
  正在处理第 4/10 条，studyID=FDMS0000033 [negative]... 完成 (6.6s, 2367 tokens)
  正在处理第 5/10 条，studyID=FDMS0000108 [negative]... 完成 (5.2s, 1531 tokens)
  正在处理第 6/10 条，studyID=FDMS0000150 [negative]... 完成 (4.2s, 1475 tokens)
  正在处理第 7/10 条，studyID=FDMS0000008 [normal]... 完成 (6.5s, 2472 tokens)
  正在处理第 8/10 条，studyID=FDMS0000013 [normal]... 完成 (5.3s, 2569 tokens)
  正在处理第 9/10 条，studyID=FDMS0000022 [multi_pathogen]... 完成 (5.7s, 2564 tokens)
  正在处理第 10/10 条，studyID=FDMS0000047 [multi_pathogen]... 完成 (5.7s, 2022 tokens)

[3b/5] 命名解析（问 LLM 两名称是否同一种病原体）...
    询问第 1 对: 【鲍曼不动杆菌】 vs 【轻型链球菌】 → 否
    询问第 2 对: 【嗜麦芽窄食单胞菌】 vs 【轻型链球菌】 → 否
    询问第 3 对: 【鲍曼不动杆菌】 vs 【近平滑念珠菌】 → 否
    询问第 4 对: 【嗜麦芽窄食单胞菌】 vs 【近平滑念珠菌】 → 否
    询问第 5 对: 【鲍曼不动杆菌】 vs 【奥斯陆莫拉菌】 → 否
    询问第 6 对: 【金黄色葡萄球菌】 vs 【奥斯陆莫拉菌】 → 否
    询问第 7 对: 【铜绿假单胞菌】 vs 【奥斯陆莫拉菌】 → 否
    询问第 8 对: 【鲍曼不动杆菌】 vs 【轻型链球菌】 → 否
    询问第 9 对: 【金黄色葡萄球菌】 vs 【轻型链球菌】 → 否
    询问第 10 对: 【铜绿假单胞菌】 vs 【轻型链球菌】 → 否
    询问第 11 对: 【鲍曼不动杆菌】 vs 【限制性马拉色菌】 → 否
    询问第 12 对: 【嗜麦芽窄食单胞菌】 vs 【限制性马拉色菌】 → 否
    询问第 13 对: 【铜绿假单胞菌】 vs 【限制性马拉色菌】 → 否
    询问第 14 对: 【肺炎克雷伯菌】 vs 【限制性马拉色菌】 → 否
    询问第 15 对: 【鲍曼不动杆菌】 vs 【藤黄微球菌】 → 否
    询问第 16 对: 【嗜麦芽窄食单胞菌】 vs 【藤黄微球菌】 → 否
    询问第 17 对: 【铜绿假单胞菌】 vs 【藤黄微球菌】 → 否
    询问第 18 对: 【鲍曼不动杆菌】 vs 【表皮葡萄球菌】 → 否
    询问第 19 对: 【嗜麦芽窄食单胞菌】 vs 【表皮葡萄球菌】 → 否
    询问第 20 对: 【铜绿假单胞菌】 vs 【表皮葡萄球菌】 → 否
  FDMS0000013: 合并 1 对同义名 [('人类β疱疹病毒5型（巨细胞病毒）', '人类疱疹病毒5型(CMV)')]
    询问第 30 对: 【柠檬酸杆菌】 vs 【人类疱疹病毒5型(CMV)】 → 否
  共询问 36 对名称

[4/5] 计算汇总指标...

[5/5] 保存结果...
  → C:\Users\24208\Desktop\LLM_for_diagnosis0606\ori_data\Trae\p1_diagnosis_system\pilot_experiment\pilot_results_detail.json
  → C:\Users\24208\Desktop\LLM_for_diagnosis0606\ori_data\Trae\p1_diagnosis_system\pilot_experiment\pilot_llm_raw_responses.json
  → C:\Users\24208\Desktop\LLM_for_diagnosis0606\ori_data\Trae\p1_diagnosis_system\pilot_experiment\pilot_results_summary.txt

============================================================
  实验完成！结果摘要
============================================================
  Micro Precision: 0.0455
  Micro Recall:    0.0667
  Micro F1:        0.0541
  NEGATIVE 准确率:  0/3
  Reads Bias (医生-LLM排名差): 0.6
  Top-1 Recall: 20.0% | Top-3: 46.7% | Top-5: 60.0% | LLM: 6.7%


## 1. 已做修改

改用 GPT-4o

- config.py：MODEL_NAME = "gpt-4o"，OPENAI_API_KEY 使用与 DeepSeek 相同的 key，GPT 也走 PROXY_BASE_URL（llmxapi）。

- llm_caller.py：GPT 模型同样使用 PROXY_BASE_URL + trust_env=False，保证能连上。

命名不匹配：用 LLM 判断「两个是否同一种菌」

- llm_caller.py 新增 ask_same_pathogen(name_a, name_b, model_name)：

调用 LLM 问「名称1 与 名称2 在医学/微生物学中是否指同一种病原体？只回答是或否」，解析回答得到 True/False。

- evaluator.py 新增 resolve_naming_mismatches(evaluation, is_same_pathogen_fn)：

对当前样本的 FP 与 FN 做配对，对每对 (fp_name, fn_name) 调用 is_same_pathogen_fn(fp_name, fn_name)；若为 True 则视为同义，把该 FN 并入 TP，并从 FP/FN 中删掉对应项（每个 FN 只匹配一个 FP，每个 FP 只匹配一个 FN），再重算 precision/recall/F1，并记录 resolution_log。

- main.py：在 10 条主任务跑完后，对每条样本的评估结果调用 resolve_naming_mismatches(..., is_same_pathogen)，其中 is_same_pathogen 内部调用 ask_same_pathogen(..., model_name)，并打印前 20 对及每 10 对的询问进度和合并结果。

---

## 2. 运行结果摘要（GPT-4o）

- 整体指标：Micro Precision 0.0455，Micro Recall 0.0667，Micro F1 0.0541；NEGATIVE 准确率 0/3。

- 命名解析：共询问 36 对 (FP, FN) 名称；合并 1 对同义名：

人类β疱疹病毒5型（巨细胞病毒） ↔ 人类疱疹病毒5型(CMV)（FDMS0000013）。

其余 35 对 LLM 均判为「否」，因此未再合并。

- Reads Bias：医生平均 SMRN 排名 5.0，LLM 平均 5.8，偏差 0.6 位。

- Top-K vs LLM：Top-1 Recall 20%，Top-3 46.7%，Top-5 60%；LLM Recall 6.7%。
