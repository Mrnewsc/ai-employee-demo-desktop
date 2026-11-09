# REAL-AI-001A 真实文件解析技术验证报告

> 文档状态：待产品经理技术验收  
> 验证日期：2026-08-07  
> 验证环境：Windows 11、Node.js v24.15.0、Electron 43.1.1  
> 验证性质：独立技术验证，不是正式功能开发  
> 数据来源：全部为项目生成的脱敏测试样本，未使用真实客户资料

## 1. 验证结论

本轮技术验证通过。

四类文件均已完成真实读取：

- PDF：4个合法样本。
- DOCX：3个合法样本。
- XLS/XLSX：4个合法样本。
- JPG/JPEG/PNG：4个合法样本。
- 异常文件：7个样本。

结果：

- 15个合法样本全部输出统一的 ParsedDocument。
- 7个异常样本全部返回明确错误码。
- 原生PDF和扫描PDF能够区分。
- 简单PDF表格能够生成表格候选。
- DOCX正文、标题、列表、表格和嵌入图片能够读取。
- Excel多Sheet、双行表头、合并单元格、XLS旧格式能够读取。
- 中文、英文、数字和型号能够通过OCR提取。
- 所有成功样本均保留来源位置。
- npm run check、npm run build、自动测试全部通过。
- 未修改或接入现有AI智能接待页面。

建议继续当前技术选型，并进入 REAL-AI-001B。

进入001B前必须接受以下边界：

1. OCR不是型号的最终事实来源，必须保留原图、置信度和人工确认。
2. PDF表格仅完成简单坐标表格验证，复杂表格不能承诺准确结构。
3. PDF渲染、OCR和大型Excel必须迁入Worker或Electron Utility Process。
4. 当前超时只能拒绝等待，不能真正终止底层解析任务。
5. Electron打包后的Worker、WASM、中文语言文件和原生Canvas尚未验证。

## 2. 本轮修改范围

新增：

- src/real-ai/types
- src/real-ai/parsers
- src/real-ai/fixtures
- src/real-ai/tests
- scripts/real-ai
- 本验证报告

修改：

- package.json：增加解析依赖和独立验证命令。
- package-lock.json：锁定依赖。
- .gitignore：忽略Tesseract运行时生成的 traineddata 缓存。

未修改：

- AIReception.tsx
- TASK-001至TASK-005业务页面
- Electron主进程和Preload
- 数据库
- API
- DeepSeek/OpenAI
- 产品库
- 产品匹配
- 现有销售链路

## 3. V1数据契约

已在 src/real-ai/types 冻结以下V1契约：

1. ParsedDocument
2. DocumentBlock
3. ParsedTable
4. ParsedImage
5. SourceLocation
6. ParseWarning
7. ExtractedProduct
8. ProductRecord
9. ProductMatchResult

全部契约使用：

```text
schemaVersion: "1.0"
```

底层契约未包含页面布局、按钮、颜色、展示状态等UI字段。

本轮实际使用：

- ParsedDocument
- DocumentBlock
- ParsedTable
- ParsedImage
- SourceLocation
- ParseWarning

## 4. 安装依赖

### 4.1 生产解析依赖

| 包名 | 版本 | 用途 | 是否建议进入生产依赖 | Electron Builder风险 | 替代方案 |
|---|---:|---|---|---|---|
| pdfjs-dist | 6.2.108 | PDF文字、页面、坐标、渲染 | 是 | Worker、标准字体、CMap、WASM路径需验证 | MuPDF、服务端PDF解析 |
| mammoth | 1.12.0 | DOCX正文、语义HTML、表格、图片 | 是 | 纯JS风险较低；HTML不得直接注入页面 | 直接解析OOXML、服务端Office解析 |
| xlsx | 0.20.3 | XLS/XLSX、Sheet、单元格、合并区域 | 是 | 纯JS；ESM下文件读写接口需显式处理 | ExcelJS（不适合旧XLS）、服务端转换 |
| tesseract.js | 7.0.0 | 图片和扫描PDF的中文OCR | 是 | Worker、WASM、traineddata路径风险高 | 原生Tesseract、云OCR |
| @napi-rs/canvas | 1.0.3 | PDF页面渲染、图片解码 | 是 | 原生.node文件、平台和架构打包风险高 | canvas、Sharp、服务端渲染 |
| file-type | 22.0.1 | Magic Bytes和真实文件类型识别 | 是 | 纯ESM，Node/Electron版本需保持兼容 | 自定义签名检测 |
| parse5 | 8.0.1 | 安全解析Mammoth HTML为内部结构 | 是 | 纯JS风险低 | htmlparser2 |

### 4.2 仅用于验证和样本生成

| 包名 | 版本 | 用途 | 生产依赖 |
|---|---:|---|---|
| tsx | 4.23.10 | 执行TypeScript测试和CLI | 否 |
| pdfkit | 0.19.1 | 生成脱敏PDF夹具 | 否 |
| docx | 9.7.1 | 生成脱敏DOCX夹具 | 否 |
| @types/node | 26.1.2 | Node类型 | 否 |
| @types/pdfkit | 0.17.6 | PDFKit类型 | 否 |

### 4.3 OCR语言缓存

Tesseract首次运行会在当前工作目录生成：

- chi_sim.traineddata
- 初期组合语言验证曾生成eng.traineddata

这些是开发缓存，已通过 .gitignore 排除。

正式版本不能依赖当前目录缓存。001B或正式打包阶段必须：

- 明确语言文件的安装位置。
- 明确离线运行策略。
- 配置Worker路径。
- 配置WASM路径。
- 配置traineddata路径。
- 在Windows、Intel Mac和Apple Silicon分别验证。

## 5. 四种文件解析方案

## 5.1 PDF

使用：

- pdfjs-dist读取原生文字、页数和文字坐标。
- PDF操作列表判断页面图片。
- @napi-rs/canvas将扫描页渲染为PNG。
- tesseract.js对渲染页执行OCR。

输出：

- 原始文字。
- 按页DocumentBlock。
- PDF页码。
- 文字bbox。
- 图片操作和扫描页渲染信息。
- 简单表格候选。
- native / scanned / blank页面模式。

扫描页判断：

- 原生文字少于5个有效字符。
- 页面包含图片操作。
- OCR开启。

PDF表格：

- 根据文字Y坐标聚合行。
- 根据X坐标判断列对齐。
- 至少2行、每行至少3列时生成候选。
- 所有坐标推断表格均添加 table_structure_low_confidence。

## 5.2 DOCX

使用：

- Mammoth将DOCX转换为语义HTML片段。
- parse5解析HTML结构。
- 结果转换为内部DocumentBlock和ParsedTable。
- Mammoth图片转换器读取嵌入图片Buffer。

输出：

- 标题。
- 正文段落。
- 列表项。
- 表格行列。
- 嵌入图片元数据。
- paragraph / table / row / cell / image来源索引。

没有输出Word页码，因为DOCX页码受Word排版环境影响。

Mammoth HTML没有注入React页面。

## 5.3 Excel

使用：

- SheetJS读取XLS和XLSX。
- 遍历SheetNames。
- 按 !ref 读取每个单元格。
- 保留 !merges 合并区域。
- 使用前10行启发式判断表头。

输出：

- Sheet名称和数量。
- Sheet有效range。
- 单元格地址。
- 行号和列号。
- 值和显示值。
- 公式文本。
- 合并单元格range。
- 表头行数候选。

设置：

- 不读取VBA。
- 不执行宏。
- 不主动计算公式。
- 有公式但无缓存值时输出warning。

## 5.4 图片

使用：

- @napi-rs/canvas读取图片尺寸。
- Tesseract.js使用chi_sim模型执行OCR。
- chi_sim样本中可同时识别中文、英文和数字。
- 输出OCR行、bbox和置信度。

本轮未做：

- 产品图片语义理解。
- 看图判断产品。
- 图片找同款。
- Vision模型。

## 6. 脱敏测试样本

### PDF

| 样本 | 覆盖能力 |
|---|---|
| native-text | 原生中文、英文、型号、页码、bbox |
| simple-table | 简单四列表格、型号和规格 |
| scanned | 无文字层扫描PDF、页面渲染、中文OCR |
| multipage-mixed | 多页、中英文混合、跨页来源 |
| password-pdf | 密码保护错误 |

### DOCX

| 样本 | 覆盖能力 |
|---|---|
| structured-content | 标题、正文、列表、表格、中文 |
| embedded-image | 标题、正文、嵌入PNG |
| mixed-language | 中英文混合、技术参数表 |

### Excel

| 样本 | 覆盖能力 |
|---|---|
| normal-products | 普通产品表头、型号、规格、数量、材质、备注 |
| multi-sheet | 3个Sheet及不同结构 |
| merged-headers | 两行表头和3组合并单元格 |
| legacy-products | 旧版XLS/CFB容器 |

### 图片

| 样本 | 覆盖能力 |
|---|---|
| product-list | 中文产品清单、SP-3000、数量、材质 |
| nameplate | 英文铭牌、数字、型号、电压和序列号 |
| package-label | 中英混排、CV-1200、数量和批次 |
| low-quality | 低对比JPEG、0/O、1/I、5/S易混字符 |

### 错误样本

- 空PDF。
- 损坏PDF。
- 损坏DOCX。
- 损坏XLSX。
- PNG伪装成PDF。
- 不支持的.doc。
- 密码保护PDF。
- 通过低阈值参数验证FILE_TOO_LARGE。
- 通过超时工具验证PARSE_TIMEOUT。

## 7. 测试结果表

说明：

- “成功”表示合法样本已生成ParsedDocument。
- “按预期拒绝”表示异常样本返回了预期错误码。
- 大小为近似KB。
- 耗时为当前开发机单次验证，不代表生产SLA。

| 文件 | 格式 | 大小 | 解析成功 | 文字 | 表格 | 图片 | 来源定位 | 耗时 | warning/error |
|---|---|---:|---|---|---:|---:|---|---:|---|
| docx/embedded-image | DOCX | 68.1KB | 成功 | 是 | 0 | 1 | 是 | 79ms | - |
| docx/mixed-language | DOCX | 8.7KB | 成功 | 是 | 1 | 0 | 是 | 47ms | - |
| docx/structured-content | DOCX | 8.7KB | 成功 | 是 | 1 | 0 | 是 | 16ms | - |
| excel/legacy-products | XLS | 3.5KB | 成功 | 是 | 1 | 0 | 是 | 11ms | - |
| excel/merged-headers | XLSX | 16.3KB | 成功 | 是 | 1 | 0 | 是 | 16ms | - |
| excel/multi-sheet | XLSX | 17.8KB | 成功 | 是 | 3 | 0 | 是 | 9ms | - |
| excel/normal-products | XLSX | 16.1KB | 成功 | 是 | 1 | 0 | 是 | 8ms | - |
| images/low-quality | JPG | 5.5KB | 成功 | 是 | 0 | 1 | 是 | 512ms | ocr_character_ambiguity |
| images/nameplate | JPG | 59.9KB | 成功 | 是 | 0 | 1 | 是 | 731ms | ocr_character_ambiguity |
| images/package-label | JPEG | 62.2KB | 成功 | 是 | 0 | 1 | 是 | 805ms | ocr_character_ambiguity |
| images/product-list | PNG | 67.7KB | 成功 | 是 | 0 | 1 | 是 | 688ms | ocr_character_ambiguity |
| pdf/multipage-mixed | PDF | 9.9KB | 成功 | 是 | 0 | 0 | 是 | 48ms | - |
| pdf/native-text | PDF | 9.5KB | 成功 | 是 | 0 | 0 | 是 | 17ms | - |
| pdf/scanned | PDF | 47.7KB | 成功 | 是 | 0 | 2 | 是 | 878ms | ocr_character_ambiguity, source_location_approximate |
| pdf/simple-table | PDF | 8.9KB | 成功 | 是 | 1 | 0 | 是 | 20ms | table_structure_low_confidence |
| errors/corrupted-docx | DOCX | 0.02KB | 按预期拒绝 | 否 | 0 | 0 | 否 | 3ms | FILE_CORRUPTED |
| errors/corrupted-excel | XLSX | 0.02KB | 按预期拒绝 | 否 | 0 | 0 | 否 | 3ms | FILE_CORRUPTED |
| errors/corrupted-pdf | PDF | 0.03KB | 按预期拒绝 | 否 | 0 | 0 | 否 | 389ms | FILE_CORRUPTED |
| errors/empty-file | PDF | 0KB | 按预期拒绝 | 否 | 0 | 0 | 否 | 1ms | FILE_EMPTY |
| errors/password-pdf | PDF | 5.3KB | 按预期拒绝 | 否 | 0 | 0 | 否 | 11ms | PDF_PASSWORD_REQUIRED |
| errors/type-mismatch | PDF/PNG | 67.7KB | 按预期拒绝 | 否 | 0 | 0 | 否 | 5ms | FILE_TYPE_MISMATCH |
| errors/unsupported-doc | DOC | 0.02KB | 按预期拒绝 | 否 | 0 | 0 | 否 | 2ms | UNSUPPORTED_FILE_TYPE |

机器可读结果：

```text
src/real-ai/tests/results/real-ai-001a-validation.json
```

## 8. 稳定读取字段

### PDF

较稳定：

- 页数。
- 原生文字。
- 中英文混合文字。
- 页码。
- 文字坐标。
- 页面是否存在图片。
- 原生文字页和扫描页区分。

### DOCX

较稳定：

- 标题。
- 普通段落。
- 列表项。
- 简单表格。
- 嵌入图片数量、MIME、大小和Hash。
- 段落和表格索引。

### Excel

较稳定：

- Sheet名称。
- Sheet数量。
- 有效range。
- 单元格地址。
- 值。
- 公式文本。
- 合并区域。
- 普通表头。
- 当前样本中的双行表头。
- XLS和XLSX。

### 图片OCR

较稳定：

- 清晰印刷体中文正文。
- 英文正文。
- 数字。
- 数量和单位。
- OCR行和bbox。
- 图片尺寸。

## 9. 不稳定字段与真实边界

### PDF表格

实际效果：

- 简单、列对齐、行距稳定的四列表格能够正确恢复。
- 结果已标记 table_structure_low_confidence。

不稳定：

- 无边框且列距不固定。
- 合并单元格。
- 跨页表格。
- 多栏页面。
- 旋转页面。
- 一格多行文字。
- 图片型表格。

结论：

当前方案适合作为“表格候选”，不能作为复杂PDF表格的最终结构。

### 中文OCR

实际效果：

- 扫描PDF中的SP-3000被正确识别。
- 产品清单PNG中的SP-3000被识别为9P-3000。
- 英文铭牌出现AUTOMATIC→AUTIOMAIIC。
- VOLTAGE→VOLTIAGE。
- SERIAL中的S/5、O/0、I/1存在混淆。
- 低质量铭牌中SOI5-1I0O被识别为SOI5-110O。

结论：

- 中文和常规正文可用。
- 型号不得直接自动确认。
- 必须保留原图、OCR文本、bbox和置信度。
- 001B之后仍需型号字符归一与人工核验。

### DOCX

不稳定：

- 浮动文本框。
- 嵌套表格。
- 页眉页脚。
- 批注和修订。
- 复杂样式映射。
- 视觉页码。

结论：

正文、列表、简单表格和图片可继续使用Mammoth；不能伪造Word页码。

### Excel

不稳定：

- 任意位置表头。
- 三行以上复杂表头。
- 隐藏行列。
- 公式无缓存值。
- 一个单元格包含多个产品。
- 单位和数字混写。
- 宏文件。

结论：

Sheet、单元格和值的读取稳定；“哪一行是产品”和“哪几行是表头”仍需001B/001C规则与人工校正。

## 10. 开发环境性能

### 10.1 解析耗时

当前小样本：

- 原生PDF：17至48ms。
- 简单PDF表格：20ms。
- DOCX：16至79ms。
- Excel：8至16ms。
- 图片OCR：512至805ms。
- 扫描PDF渲染加OCR：878ms。

### 10.2 事件循环

实测最大事件循环延迟：

- 普通DOCX/图片OCR：约0至23ms。
- 扫描PDF：约100ms。

当前样本较小，没有出现CLI无响应，但这不能代表大型客户文件。

必须在001B迁入Worker或Utility Process：

- PDF页面解析。
- PDF页面渲染。
- OCR。
- 大型Excel遍历。
- Office压缩包解析。
- 文件Hash和大文件读取。

### 10.3 内存

当前记录的是同一Node进程的RSS前后差值，只能作为粗略观察，受垃圾回收影响，不能当作精确峰值。

观察：

- 普通Excel约增加1MB以内。
- OCR单图约增加4至65MB。
- 扫描PDF约增加102MB。
- 损坏PDF索引过程曾增加约128MB。

结论：

- OCR和PDF必须放入可回收的独立进程。
- 001B应增加任务级内存限制、页数限制和子进程退出回收。

## 11. 错误处理结果

已验证：

| 场景 | 错误码 |
|---|---|
| 不支持的.doc | UNSUPPORTED_FILE_TYPE |
| 超过配置大小 | FILE_TOO_LARGE |
| 空文件 | FILE_EMPTY |
| 文件不存在 | FILE_NOT_FOUND（代码路径已实现） |
| 扩展名与真实类型不一致 | FILE_TYPE_MISMATCH |
| 损坏PDF/DOCX/XLSX | FILE_CORRUPTED |
| 密码PDF | PDF_PASSWORD_REQUIRED |
| OCR异常 | OCR_FAILED（代码路径已实现） |
| 超时 | PARSE_TIMEOUT |
| 其他解析器异常 | PARSER_FAILED |

限制：

- 当前PARSE_TIMEOUT使用Promise超时。
- 超时后底层解析任务可能继续执行。
- 真正取消必须在001B通过Worker/Utility Process终止任务。

## 12. Electron打包风险

本轮没有修改Electron配置，也没有打包验证，风险如下。

### PDF.js

- Node验证使用pdfjs-dist legacy ESM入口。
- 正式打包需验证pdf.worker.mjs。
- 需验证标准字体、CMap和WASM资源。
- 当前损坏PDF会输出“Indexing all PDF objects”警告，需在服务层收敛日志。

### Tesseract.js

- Worker脚本必须可定位。
- WASM核心必须可定位。
- chi_sim.traineddata必须离线可读取。
- 默认将语言文件缓存到工作目录，不适合正式软件。
- 组合加载chi_sim+eng在当前Windows验证中出现无效语言资源噪声。
- 本轮改用chi_sim，实测仍能识别英文和数字。

### @napi-rs/canvas

- 包含平台相关原生二进制。
- electron-builder可能需要asarUnpack。
- Windows x64、macOS x64、macOS arm64需分别验证。
- Universal Mac是否能正确合并需要单独验证。

### SheetJS

- ESM构建中writeFile没有自动绑定Node fs。
- 样本生成已改为XLSX.write生成Buffer，再由Node写入。
- 正式服务层也应使用显式Buffer读写。

### 当前打包配置

当前electron-builder只面向现有应用文件。

由于REAL-AI-001A尚未接入Electron入口，解析依赖和资源并未完成安装包验证。

001B必须明确：

- 哪些JS服务进入安装包。
- 哪些资源进入resources。
- 哪些原生文件asarUnpack。
- Worker和语言文件的生产路径。

## 13. 已发现Bug与处理

| 问题 | 状态 | 处理 |
|---|---|---|
| PDF.js 6.x文档代理没有预期destroy方法 | 已修复 | 改为销毁loadingTask |
| SheetJS ESM writeFile无法直接落盘 | 已修复 | 改为内存Buffer加Node写入 |
| file-type将旧XLS识别为CFB | 已修复 | 在.xls扩展名边界内映射CFB |
| Tesseract组合语言产生无效资源噪声 | 已规避 | 使用chi_sim单模型 |
| Mammoth不识别Title样式 | 已修复 | 增加受控styleMap |
| OCR将SP-3000识别成9P-3000 | 未修复 | 真实能力边界，留给归一化和人工确认 |
| 英文铭牌字母混淆 | 未修复 | 保留warning和来源 |
| PDF复杂表格结构不稳定 | 未修复 | 标记低置信度 |
| Promise超时不能真正停止解析 | 未修复 | 001B迁入可终止Worker |
| PDF/OCR内存无法按任务回收 | 未修复 | 001B迁入Utility Process |

## 14. 留给REAL-AI-001B的问题

1. FileParser注册与任务服务正式放入Electron主进程。
2. 设计最小化Preload API和IPC Schema。
3. 验证IPC发送方。
4. 将PDF、OCR、Excel、DOCX解析迁入Worker或Utility Process。
5. 实现真正取消和超时终止。
6. 实现任务队列和并发限制。
7. 实现文件暂存、随机目录和自动清理。
8. 增加ZIP炸弹、解压大小和压缩比限制。
9. 增加更严格的Office内部结构验证。
10. 为ParsedDocument增加运行时Schema校验。
11. 统一结构化错误和进度事件。
12. 解决Tesseract Worker、WASM、traineddata生产路径。
13. 验证PDF.js Worker和字体资源路径。
14. 验证@napi-rs/canvas在electron-builder中的asarUnpack。
15. 使用大文件、50页扫描PDF和大型工作簿压测。
16. 增加旋转、倾斜和图像预处理，但仍不做图片语义识别。
17. 正式UI接入继续留到REAL-AI-001F。

## 15. 技术选型建议

### 建议保留

- PDF.js：保留。
- Mammoth：保留。
- SheetJS：保留。
- file-type：保留。
- parse5：保留。
- Tesseract.js：保留作为第一阶段本地OCR验证方案。
- @napi-rs/canvas：暂时保留，001B必须完成打包验证。

### 暂不替换原因

- 当前四类文件已形成统一ParsedDocument。
- 所有合法样本通过。
- 错误样本能够分类。
- 技术边界已清楚。
- 当前问题主要集中在进程隔离、打包资源和复杂输入，不需要现在更换整套解析库。

### 后续重新评估条件

出现以下情况时重新评估：

- PDF复杂表格准确率无法满足业务。
- 中文铭牌OCR人工复核成本过高。
- @napi-rs/canvas无法稳定跨平台打包。
- 本地OCR性能无法接受。
- 客户要求完全离线且安装包体积受限。

## 16. 验证命令

```bash
npm run fixtures:real-ai
npm run test:real-ai
npm run validate:real-ai
npm run check
npm run build
```

最终执行结果：

- npm run test:real-ai：7项通过，0项失败。
- npm run check：通过。
- npm run build：通过。
- Vite存在原项目已有的大Chunk提示，不影响本轮构建成功。

## 17. 最终验收判断

REAL-AI-001A满足完成条件：

1. 四类文件真实读取成功。
2. 能输出统一ParsedDocument。
3. 已确认各格式真实能力边界。
4. 错误能明确识别。
5. 已建立每类至少3个样本和expected.json。
6. 未接入或破坏现有产品页面。
7. 已为REAL-AI-001B提供进程、资源、错误和打包结论。

本轮到此停止，不开始REAL-AI-001B。
