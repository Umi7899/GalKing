# 修复数据库 Schema 后的重启步骤

## 问题
Sessions 表 schema 已更新，但旧数据库仍在使用。需要清除旧数据库。

## 解决方案

### 方法 1：在 Expo Go 中清除数据（推荐）
1. 在 Expo Go app 中，**摇动手机**打开开发菜单
2. 点击 **"Reload"** 重新加载（如果不行继续下一步）
3. 长按 app 图标 → **清除数据/存储** → 重新扫码打开

### 方法 2：在代码中强制删除旧数据库
在 `src/db/database.ts` 的 `initDatabase` 函数开头临时添加：
```typescript
export async function initDatabase(): Promise<void> {
    // 临时：强制删除旧数据库
    if (db) {
        await db.closeAsync();
        db = null;
    }
    try {
        await SQLite.deleteDatabaseAsync(DB_NAME);
        console.log('[DB] Old database deleted');
    } catch (e) {
        console.log('[DB] No old database to delete');
    }
    
    // 原有代码继续...
    if (!db) {
        db = await SQLite.openDatabaseAsync(DB_NAME);
    }
    // ...
}
```

然后重新加载 app，数据会重新导入。

### 方法 3：命令行重启（如果上面都不行）
```bash
# 停止当前服务器 (Ctrl+C)
# 清除缓存
npx expo start -c
```

## 验证
重启后应该看到：
```
LOG  [DB] Starting dataset import: galking-biaori-v1
LOG  [DB] Imported 24 lessons
...
```
并且不再有 `no such column: status` 错误。
