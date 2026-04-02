# 参考仓库（浅克隆）

本目录用于 **复用成熟实现**，与业务代码分离。

| 目录 | 来源 | 建议复用范围 |
|------|------|----------------|
| `full-stack-fastapi-template/` | [fastapi/full-stack-fastapi-template](https://github.com/fastapi/full-stack-fastapi-template) | Docker/CORS、JWT 与密码哈希、SQLModel/Alembic 分层、安全中间件等模式 |
| `chatbot-rag-pgvector-ref/` | [wanadzhar913/chatbot-fastapi-rag-langchain-unstructured-pgvector](https://github.com/wanadzhar913/chatbot-fastapi-rag-langchain-unstructured-pgvector) | LangChain + pgvector 的 ingestion / 检索思路；本项目 `backend/` 采用更轻的 OpenAI SDK + 原生 SQL 向量检索，避免整仓依赖 |

实际业务实现见仓库根目录 [`backend/`](../backend/) 与 [`frontend/`](../frontend/)。

克隆命令（若未包含在副本中）：

```bash
git clone --depth 1 https://github.com/fastapi/full-stack-fastapi-template.git references/full-stack-fastapi-template
git clone --depth 1 https://github.com/wanadzhar913/chatbot-fastapi-rag-langchain-unstructured-pgvector.git references/chatbot-rag-pgvector-ref
```
