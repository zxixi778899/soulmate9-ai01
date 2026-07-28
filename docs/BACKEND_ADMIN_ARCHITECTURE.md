# 后台管理架构

后台按业务域划分为七个系统：用户、伴侣、对话、商城、预设、创建、网站与管理。

## 入口

- `/api/admin/control-center`：只读聚合接口，统一返回模块状态与核心数量。
- `src/lib/admin/systems.ts`：后台模块的单一事实源。
- 现有 `/admin/*` 页面继续承担各业务域的详细管理。

## 约束

1. 新后台功能先登记到 `ADMIN_SYSTEMS`，再增加独立页面和 API。
2. API 只负责鉴权、参数解析和响应；复杂业务下沉到 `src/lib/<domain>/`。
3. 管理 API 必须使用 `requireAdmin()`；写操作由统一限流保护。
4. 客户端只通过 `authedFetch()` 访问 BFF，不直接使用 service role。
5. 删除采用归档或停用优先；物理删除只允许 superadmin。
6. 统计查询失败时单模块降级，不应导致整个后台不可用。

## 扩展方式

1. 在 `AdminSystemId` 和 `ADMIN_SYSTEMS` 增加定义。
2. 在控制中心 API 增加独立统计任务。
3. 创建 `/admin/<module>` 与 `/api/admin/<module>`。
4. 为危险写操作增加动作级限流和审计日志。
