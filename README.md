# 数员科技 AI数字员工

数员科技面向销售拜访场景的 Windows 桌面端高保真演示系统。安装程序名称为“数员科技 AI数字员工”。第一阶段使用 Electron + React + TypeScript + Vite + Tailwind CSS + Framer Motion + Lucide Icons + Recharts，所有数据均为本地演示数据，不连接第三方平台。

## 运行方式

```bash
npm install
npm run dev              # 浏览器预览
npm run electron:dev     # Electron 桌面预览
npm run check            # TypeScript 检查
npm run build            # 生产构建
npm run capture:previews # 生成四张 1440x900 界面预览图
```

Windows 安装包暂未执行；后续可使用 `npm run dist:win`。

## 当前已完成功能

- 深色高端 AI 硬件控制中心外壳，左侧导航、运行状态、演示模式、全屏入口。
- AI工作台：设备与机器人展示、演示指标、AI员工工作流、客户演示入口。
- 企业配置：三套模板、字段保存、企业资料同步到内容、GEO、接待和 ROI 模块。
- AI内容生成：基于企业资料的本地规则组合、逐步生成状态、标题/正文/关键词/标签/发布入口。
- 平台发布：五个平台独立状态变化、格式适配、发布成功与平台收录状态。
- GEO关键词：分类、关键词树、详情、内容匹配与布局计划反馈。
- 客户线索：企业级线索表、客户详情抽屉、转接 AI 接待和创建报价反馈。
- AI智能接待：客户列表、聊天记录、预设问题、模拟流式回复、客户画像与人工转接。
- 报价管理、跟进中心、数据分析、ROI测算、合作方案、系统设置交互原型。
- ROI 使用真实公式实时计算，收益测算默认值全部为 0。
- 一键填充演示数据、重置演示数据、全屏客户演示流程。

## 统一配置

品牌、产品名称、价格、质保年限、GEO关键词数量、联系人、联系电话和素材路径集中在：

`src/config.ts`

软件安装包显示名称由 `package.json` 的 `build.productName` 和 `index.html` 的 `<title>` 控制；产品演示内容名称仍由 `src/config.ts` 的 `productName` 控制。

联系方式暂使用占位符，不会自动编造电话。正式签约口径以双方正式合同为准。

## 替换素材

直接替换以下文件并保持文件名，即可更新界面素材：

- `public/assets/logo.png`：数员科技正式 Logo
- `public/assets/robot.png`：透明背景 AI 机器人
- `public/assets/server.png`：黑色服务器机箱款 AI员工一体机

如果新机器人图片有白色底，请先处理为透明 PNG，避免出现矩形底框。

## 真实接口预留

第一阶段未连接真实平台账号、AI API、CRM、支付、合同或云端数据库。页面中的生成、发布、接待、报价和分析均为本地模拟流程，后续可将 `src/demo` 和 `src/stores/AppStore.tsx` 中的本地动作替换为服务层调用。

## 合规口径

本应用只保存在本地；所有数字标注为演示数据，不代表实际运营效果。GEO内容使用“首个季度500个GEO关键词及关联词布局”口径，不承诺排名、询盘或成交，不使用未经确认的客户案例。
