# Meoini

第一版：查词 → 保存闪卡 → 间隔复习 → CSV 导入导出，支持 PWA 离线打开与复习已保存卡片。

## 技术栈

- React + TypeScript + Vite
- Tailwind CSS v4
- Dexie (IndexedDB)
- React Router
- vite-plugin-pwa

## 本地运行

```bash
npm install
npm run dev
```

构建生产版本（含 Service Worker）：

```bash
npm run build
npm run preview
```

## 功能概览

| 模块 | 说明 |
|------|------|
| `features/dictionary` | 词典接入层；当前为 [Free Dictionary API](https://dictionaryapi.dev/)（英语） |
| `db/database.ts` | 闪卡本地持久化 |
| `features/flashcards/review.ts` | 简单间隔复习算法 |
| `features/import-export/csv.ts` | CSV 往返 |

## 后续

- Supabase 账户与同步
- 多语言离线词库与更多 `DictionaryProvider` 实现
