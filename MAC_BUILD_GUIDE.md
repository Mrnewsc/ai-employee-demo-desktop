# 数员科技 AI数字员工 — Mac 构建指南（MAC_BUILD_GUIDE.md）

> 本源码包从 Windows 机器整理打包，供 Mac 电脑继续开发与构建。
> 原项目：Electron + React + TypeScript + Vite。

## 一、环境要求

- **Node.js**：建议 20 LTS 或更高（与 Windows 开发机保持一致的大版本）
- **npm**：随 Node.js 安装即可
- **Xcode Command Line Tools**（编译原生依赖需要）：

```bash
xcode-select --install
```

## 二、安装依赖（必须在 Mac 上重新执行）

Windows 的 `node_modules` **未包含**在本包内，且 Windows 原生二进制（.exe/.node）无法在 Mac 使用。请在 Mac 上全新安装：

```bash
cd ai-employee-demo-desktop   # 或本源码包解压出的目录
npm install
```

注意事项：

1. `xlsx` 依赖来自 CDN（`https://cdn.sheetjs.com/...`），安装时需要联网；如网络受限，可配置 npm 镜像或先下载 tarball。
2. `@napi-rs/canvas` 是原生模块，npm 会自动下载 macOS 对应预编译二进制（`@napi-rs/canvas-darwin-arm64` / `darwin-x64`）。若自动下载失败，检查网络后重试 `npm install`。
3. `esbuild`、`electron` 等同样是按平台分发的预编译包，`npm install` 会自动拉取 Mac 版本。
4. `electron-builder` 首次打包时会下载 Mac 版 Electron 发行包，需要联网。

## 三、开发运行

```bash
npm run electron:dev
```

该命令会先构建 real-ai 相关 Worker/服务（`build:real-ai-*`），再启动 Vite + Electron 开发模式。

仅跑 Web 界面：`npm run dev`

## 四、类型检查与测试

```bash
npm run check                      # tsc --noEmit
npm run test:real-ai               # 解析/提取测试（tsx --test）
npm run test:real-ai-service       # Electron 主进程服务测试
npm run test:real-ai-catalog       # 产品库测试
npm run test:real-ai-extraction    # DeepSeek 提取测试（不调真实 API）
npm run test:catalog-management    # 企业产品库管理测试
```

## 五、构建与打包（macOS）

```bash
npm run build        # 构建产物到 dist/
npm run dist:mac     # electron-builder --mac dmg zip --universal
```

产出位于 `release/`：

- `.dmg` 安装镜像
- `.zip` 压缩版
- `--universal` 为 Universal 架构，同时支持 **Apple Silicon（M1/M2/M3/M4）** 和 **Intel Mac**

已有 `package.json` → `build.mac` 配置（target: dmg + zip，category: business），无需从零补配置。

### 需要在 Mac 打包前确认/补充的配置（本次未修改代码，仅列出）

1. **asarUnpack 平台二进制**：当前只列了 `@napi-rs/canvas-win32-x64-msvc`。Mac 打包时应把 macOS 平台包也加入 asarUnpack（如 `@napi-rs/canvas-darwin-arm64`、`@napi-rs/canvas-darwin-x64`），否则打包后原生模块可能无法加载。
2. **签名与公证**：当前未配置 Apple Developer 证书（`identity` 未设置），打出来的包未签名，首次启动需在「系统设置 > 隐私与安全性」放行，或右键-打开。
3. **entitlements**：如需公证，需补 `build.mac.entitlements`（Electron 官方模板即可）。
4. 根目录 `chi_sim.traineddata` / `eng.traineddata` 为 OCR 语言数据（跨平台通用，直接可用）；`extraResources` 会把 `chi_sim.traineddata.gz` 从 `node_modules/@tesseract.js-data/chi_sim/` 复制进安装包，Mac 上 npm install 后该路径自动存在。

## 六、Mac 兼容性说明（Windows 打包时已核查）

| 项目 | 状态 |
|---|---|
| package.json 含 mac 打包目标 | ✅ `dist:mac` 脚本 + `build.mac` 配置 |
| electron-builder darwin 支持 | ✅ dmg + zip |
| Apple Silicon / Intel | ✅ `--universal` 通用架构 |
| OCR（tesseract.js + traineddata） | ✅ WASM 实现，跨平台；语言数据已随包 |
| PDF 解析（pdfjs-dist） | ✅ WASM/JS，跨平台 |
| Worker（esbuild 构建的 .mjs） | ✅ 跨平台 |
| 文件读写路径 | ✅ 使用 `app.getPath('userData')` / `temp`，无硬编码盘符 |
| Windows 专属运行时代码 | ✅ 未发现（仅构建脚本 `dist:win`、smoke 脚本引用 win-unpacked 路径，不影响 Mac 构建） |
| 原生依赖 | ⚠️ `@napi-rs/canvas` 需在 Mac 重新 `npm install` 获取 darwin 二进制（自动） |

## 七、常见问题

- **npm install 报 canvas/node-gyp 编译错误**：先确认 `xcode-select --install` 已装；`@napi-rs/canvas` 正常情况下用预编译包，无需本地编译。
- **electron 下载慢**：设置镜像 `export ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/` 后重试。
- **首次打开提示"已损坏"或"无法验证开发者"**：右键 App → 打开；或 `xattr -dr com.apple.quarantine /Applications/数员科技\ AI数字员工.app`。
- **测试/冒烟脚本**（`scripts/**/run-*-smoke*`、`smoke:real-ai:packaged` 等）中部分硬编码引用 Windows 的 `release/win-unpacked` 路径，属 Windows 打包验证用途，Mac 上开发构建不受影响；如需在 Mac 跑打包冒烟，需自行调整为 `release/mac*/` 路径。

## 八、环境变量

- `DEEPSEEK_API_KEY`：AI 结构化提取（REAL-AI-001C）需要。源码从环境变量读取，**本包不含任何真实密钥**。本地开发可在 shell 中 `export DEEPSEEK_API_KEY=...`（不要提交到 git）。
