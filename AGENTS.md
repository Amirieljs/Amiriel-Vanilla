# @amiriel/vanilla

无框架的 Amiriel 编辑器与渲染器，含 Custom Elements。文档模型从 `@amiriel/core` 重导出。不要在本仓库复制类型、主题或 `normalizeDocument`。

## 源码

| 文件 | 职责 |
| --- | --- |
| `src/AmirielBodyEditor.ts` | `createAmirielEditor`、`defineAmirielElements`、编辑器元素 |
| `src/AmirielBodyRenderer.ts` | `createAmirielBodyRenderer`、`renderAmirielBody` |
| `src/AmirielMediaLightbox.ts` | 灯箱 |
| `src/AmirielMediaVideo.ts` | 视频 |
| `src/dom.ts` | DOM 辅助 |
| `src/style.css` | 样式，构建时由 `scripts/copy-style.mjs` 复制 |
| `src/index.ts` | 公共出口，并 `export * from "@amiriel/core"` |

不包含上传实现、账号、存储、路由和数据库。媒体选择交给宿主。

行为与 `@amiriel/vue` 的编辑器对齐：分页、主题、纸张、文本块和媒体摆放使用 core 的规则。不要为 Vanilla 发明第二套坐标或主题 id。

## 规则与验证

- 说明用简体中文。不启动长期进程。没有明确要求时不改版本、不发布、不推 tag。
- Core 升级走 `.github/workflows/sync-core.yml`。只改本包走 `release.yml`。
- 官网不直接依赖本包。

```bash
pnpm install && pnpm typecheck && pnpm build
```
