# 小天裁 缝纫管家

专为缝纫爱好者设计的缝纫素材与作品管理系统。

## 功能
- 图片上传与手动录入
- 布料档案管理
- 成衣作品关联
- 底部标签导航（布料/成衣/纸样/尺码/备份）
- 顶部“? 使用说明”弹窗引导
- 各界面支持两种视图切换（网格/列表、表格/卡片、并排/上下）
- 网格/列表视图切换与筛选
- 数据导入导出（JSON）

## 技术栈
- Python + Streamlit（原版本）
- JavaScript + HTML + CSS（新增前端版本）
- SQLite（Python 版本）
- LocalStorage（JavaScript 版本）

## 运行方式

### 1) 原 Python 版本
```bash
pip install -r requirements.txt
streamlit run app/main.py
```

### 2) 新 JavaScript 网页版本
直接用浏览器打开：

```text
web/index.html
```

> 说明：JS 版本为纯前端实现，不会删除或覆盖原 Python 文件，数据默认保存在浏览器本地存储中。
