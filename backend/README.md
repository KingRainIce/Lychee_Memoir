# SZU Memoir API

FastAPI + PostgreSQL（pgvector）+ JWT。参考实现见仓库 [`references/`](../references/README.md)。

## 本地开发（本机 Python）

1. 启动数据库（推荐 Docker）：

   ```bash
   cd .. && docker compose up -d db
   ```

2. 配置环境变量：复制 `.env.example` 为 `.env` 并填写。

3. 安装依赖并启动：

   ```bash
   pip install -r requirements.txt
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```

首次启动会执行 **Alembic** 迁移（`alembic upgrade head`）建表、并 `CREATE EXTENSION vector`，随后写入 **种子数据**（管理员与演示事件/帖子）。**Alembic** 相当于给数据库表结构做改版记录、便于上线升级，与终端用户使用的功能无直接关系。默认管理员见 `INIT_ADMIN_*`。

## 全栈 Docker

在仓库根目录：

```bash
docker compose up --build
```

API：`http://localhost:8000`，文档：`/docs`。

## 主要路由

- `POST /api/auth/register`、`POST /api/auth/login`、`GET /api/auth/me`
- `GET /api/events?campus_id=&as_of_year=&as_of_month=`（累计至所选年-月；兼容 `year_lte`）
- `GET /api/places`（平面图命名地点目录，来自 `annotations.json`：id、label、锚点 nx/ny）
- `GET /api/posts?campus_id=&since=`（`since` ISO8601，可选，用于「登录自然日 0 点至今」）
- `POST /api/posts`（登录，待审核；可选 `place_id` 绑定标注，与 `nx`/`ny` 二选一或优先解析规则见下）
- `POST /api/uploads/image`（登录，multipart，返回可写入帖子的 `image_url`）
- `GET /api/admin/posts/pending`、`PATCH /api/admin/posts/{id}`（管理员）
- `PUT /api/admin/ai-config`（管理员填写硅基流动 Base URL / Key / 模型）
- `POST /api/rag/chat`（可不登录；SlowAPI 按 IP 限流）
- `WS /api/ws/posts?campus_id=`（新帖广播）

前端开发时通过 Vite 将 `/api` 代理到本服务。

## 平面图地点 `place_id`（与标注 JSON 对齐）

- 标注工作台导出的 `frontend/public/annotations.json` 中，每条 `items[]` 的 **`id`** 即为稳定地点 id。
- 创建校史事件（管理员 `POST /api/events`）或校友帖（`POST /api/posts`）时可传可选字段 **`place_id`**（字符串，与上述 `id` 一致）。
- **解析规则**：若 `place_id` 非空且在服务端能读到的标注文件中存在该 id，则使用标注的锚点 **`nx`/`ny`**（与前端 `MapAnnotation` 一致：优先顶层 `nx`/`ny`，否则为 `bbox` 中心），并据此用 `campus_geo.nx_ny_to_lng_lat` 写入 **`lng`/`lat`**；若无法解析，则回退到请求体中的 **`nx`/`ny`**，再否则保留原 **`lng`/`lat`**。
- 服务端查找标注文件的顺序：`ANNOTATIONS_JSON_PATH` 环境变量（若配置）→ `backend/data/annotations.json` → 仓库内 `frontend/public/annotations.json`（本地开发常用后者）。
- **Docker**：`docker compose` 构建时会将 `frontend/public/annotations.json` 复制到镜像内 `/app/data/annotations.json`；部署后若更新标注，请重新构建镜像或挂载同结构 JSON 并设置 `ANNOTATIONS_JSON_PATH`。
- **导入校史/批量数据**：优先填 `place_id` + 业务字段，可省略手填 `nx`/`ny`；需保证标注文件与导入环境一致。仅填 `nx`/`ny` 的旧数据仍兼容。
