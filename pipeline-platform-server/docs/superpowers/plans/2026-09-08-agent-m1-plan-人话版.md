# AImyhome-agent 开发计划(人话版)

> 面试作品:把熊仔的博客升级成 AI Agent。
> 同一目录下的 `2026-09-08-agent-m1-plan.md` 是施工图纸(1894 行,执行细节);
> 这份是进度板,给人和面试官看,每次完成任务就更新勾选。

## 这项目是干嘛的

访客在博客问「熊仔做过什么」,Agent 回答,并附上出处。
底层四件事:简历切片 → 存成向量 → 搜索 → 大模型生成回答。

## 搭法:四步走

1. 备料:简历整理成 profile.md
2. 入库:切片 + embedding,存进 pgvector
3. 回答:检索 + 大模型
4. 上线:打通博客,部署腾讯云

## 任务清单

- [x] **Task 1 环境**:Python + uv + 服务器 Docker + pgvector + SSH 隧道
- [x] **Task 2 骨架**:FastAPI + /health,测试跑通
- [x] **Task 3 知识源**:profile.md(新版简历已同步)
- [x] **Task 4 切片**:Markdown 两段式切片 + embedding 双写(豆包/智谱)
- [x] **Task 5 入库检索**:真库灌入 18 块,检索 + 自动降级(阈值 0.25)
- [x] **Task 5.5 混合检索**:向量 + 关键词(pg_trgm),治缩写词搜不到(标定集 13/13)
- [ ] **Task 6 大脑**:LangGraph 工具调用循环
- [ ] **Task 7 接口**:SSE 流式输出,博客转发
- [ ] **Task 8 前端**:回答里显示来源
- [ ] **Task 9 上线**:部署腾讯云

## 当前进度

- Task 5 已提交(`2915e7c`,aimyhome-agent 仓库);Task 5.5 混合检索已完成(待提交)
- 下一步:**Task 6 LangGraph 工具调用循环**

## 技术栈一句话

Python + FastAPI(接口)+ LangGraph(编排)+ pgvector(向量检索)+ 豆包/智谱(大模型与 embedding)

## 已知遗留

- 智谱欠费,降级表 chunks_zhipu 为空 —— 充值后重灌即可
- 「最近在哪家公司」这类时间问题,留给 Task 6 的 Agent 推理解决
