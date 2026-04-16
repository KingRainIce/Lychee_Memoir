# SZU Memoir / 深大记忆

深圳大学校园记忆与校友帖子项目：前端地图与记忆流、后端 API、Docker 编排。

## 结构

- `frontend/` — React + Vite 前端
- `backend/` — 后端服务
- `docker-compose.yml` — 本地编排
- `docs/` — 文档

## 本地开发

详见各子目录说明；前端需 `npm install` 后 `npm run dev`。

## 生产部署（阿里云 ECS）

- 部署文档：[`docs/阿里云ECS部署指南.md`](docs/阿里云ECS部署指南.md)
- Nginx 模板：[`deploy/nginx/szu-memoir.conf`](deploy/nginx/szu-memoir.conf)
- 生产环境变量示例：[`/.env.production.example`](.env.production.example)

## 许可证

按仓库约定。
