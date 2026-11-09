# REAL-AI-001 客户资料真实解析与产品匹配技术方案

> 文档状态：技术评估稿  
> 评估日期：2026-08-07  
> 适用项目：AI员工一体机销售演示系统  
> 本轮范围：只做项目检查与技术方案设计，不开发、不安装依赖、不接入API  
> 冻结范围：TASK-001 至 TASK-005、CORE-FLOW-003  
> 暂缓范围：TASK-006、公开平台搜索与图片搜同款（REAL-AI-002）

## 1. 目标与结论

REAL-AI-001 的目标，是将当前“资料分析与产品匹配”的前端演示流程，逐步升级为以下真实业务链：

客户上传 PDF / Word / Excel / 图片

→ 系统读取并解析文件

→ 提取文字、表格、图片和来源位置

→ AI输出结构化产品信息

→ 与企业本地产品库分层匹配

→ 生成带匹配依据的产品匹配结果表

→ 销售人工确认

→ 导出Excel或进入报价

### 核心结论

1. 当前项目适合继续采用 Electron + React，但文件解析、OCR、AI调用和产品匹配不应直接写进 React 页面。
2. 文件处理应放在 Electron 主进程或独立 Utility Process / Worker 中，通过最小化 IPC 接口向渲染进程提供能力。
3. PDF、DOCX、XLS/XLSX、图片应各有解析适配器，但统一输出 ParsedDocument，页面只消费统一结果。
4. AI仅负责结构化提取与疑难语义判断；型号、名称、规格和场景匹配应优先使用可解释的确定性规则。
5. 第一阶段产品库使用“版本化本地JSON + Excel导入”最容易落地；运行时不建议直接把Excel当数据库。
6. DeepSeek可作为第一阶段中文文本结构化提取模型，但当前项目没有相关代码；图片理解不能直接依赖当前文本模型。
7. 最先应做的不是接AI或改页面，而是建立文件样本集、统一数据契约和真实解析验证。

## 2. 当前项目技术结构

### 2.1 React前端

- 入口：src/main.tsx
- 页面装配：src/App.tsx
- 全局状态：src/stores/AppStore.tsx
- AI智能接待页面：src/pages/AIReception.tsx
- 共享演示业务链：src/demo/demoSalesFlow.ts
- 演示状态存储：src/demo/demoStore.ts
- 页面切换方式：App内部基于 activePage 切换，当前未使用路由库。
- 数据持久化方式：React Context、LocalStorage和本地演示数据。

判断：

- 当前前端适合继续展示分析进度、匹配结果和人工确认状态。
- 不适合在页面组件中直接进行大型PDF解析、OCR、文件系统访问和模型密钥管理。
- REAL-AI-001F 接入时应保持现有页面视觉和模式切换，只替换演示数据的来源。

### 2.2 Electron结构

- 主进程：electron/main.cjs
- 预加载：electron/preload.cjs
- BrowserWindow当前设置：
  - contextIsolation: true
  - nodeIntegration: false
- preload当前仅暴露：
  - desktop.isElectron
- 主进程当前使用Node fs的场景仅为预览截图输出。
- 当前没有：
  - ipcMain / ipcRenderer业务通道
  - 文件解析服务
  - OCR Worker
  - AI请求服务
  - 产品库仓储

判断：

- 主进程具备Node文件能力，技术基础可用。
- 现有安全基线正确，不应为了读取文件而打开 nodeIntegration。
- 后续应通过 contextBridge 暴露窄接口，不向前端暴露原始 ipcRenderer、fs或任意路径读取能力。

Electron官方建议保持上下文隔离、禁用不必要的Node集成、启用沙箱并验证IPC来源，参考：[Electron Security](https://www.electronjs.org/docs/latest/tutorial/security)、[IPC](https://www.electronjs.org/docs/latest/tutorial/ipc)、[Process Model](https://www.electronjs.org/docs/latest/tutorial/process-model)。

### 2.3 当前文件上传实现

AIReception.tsx 当前支持拖拽和 input 选择：

- .pdf
- .doc / .docx
- .xls / .xlsx
- image/*

但当前逻辑只读取：

- 文件名
- 扩展名
- 文件大小

当前没有读取文件字节，也没有：

- File.arrayBuffer
- FileReader
- MIME与文件签名验证
- PDF文字提取
- Word正文/表格/图片提取
- Excel Sheet/行列提取
- OCR
- 临时文件管理

“开始分析”的六步流程由定时器模拟，产品字段、匹配结果和公开渠道候选均来自本地演示数据。

### 2.4 当前AI与服务能力

项目中未发现：

- DeepSeek代码
- OpenAI代码
- fetch / axios业务请求
- AI Provider抽象
- src/services服务层
- 后端服务
- API代理
- 数据库
- JSON Schema运行时校验

因此不存在可直接复用的DeepSeek调用能力。可以复用的是：

- 现有六步进度UI
- 现有产品匹配结果UI
- 现有共享客户上下文
- 现有演示状态结构

### 2.5 当前依赖

运行依赖主要为：

- React
- Framer Motion
- Lucide React
- Recharts

开发和桌面依赖主要为：

- Electron
- Electron Builder
- Vite
- TypeScript
- Tailwind CSS

当前没有PDF、DOCX、Excel、OCR、图像预处理、Schema校验、数据库或AI SDK依赖。

### 2.6 当前能力缺口

| 能力 | 当前状态 | REAL-AI-001目标 |
|---|---|---|
| 文件选择与拖拽 | 已有 | 保留 |
| 文件内容读取 | 无 | Electron安全读取 |
| 多格式解析 | 无 | 统一解析层 |
| OCR | 无 | 图片及扫描PDF |
| AI结构化提取 | 无 | JSON Schema输出 |
| 企业产品库 | 无真实库 | 本地JSON + Excel导入 |
| 匹配引擎 | 演示常量 | 可解释的分层匹配 |
| 结果人工确认 | UI已有雏形 | 接真实结果 |
| 导出 | HTML伪装为.xls | 后续生成真实.xlsx |
| 进入报价 | 演示跳转 | 后续传递已确认结果 |

## 3. 推荐总体架构

~~~mermaid
flowchart LR
    UI["React AI智能接待 UI"] --> Client["FileAnalysisClient"]
    Client --> Bridge["Preload 最小化安全接口"]
    Bridge --> IPC["主进程 IPC Controller"]
    IPC --> Ingest["FileIngestionService"]
    Ingest --> Worker["Utility Process / Worker"]
    Worker --> Parser["FileParser Registry"]
    Parser --> PDF["PDF Adapter"]
    Parser --> DOCX["DOCX Adapter"]
    Parser --> XLS["Excel Adapter"]
    Parser --> IMG["Image/OCR Adapter"]
    PDF --> Parsed["ParsedDocument"]
    DOCX --> Parsed
    XLS --> Parsed
    IMG --> Parsed
    Parsed --> Extract["ProductExtractionService"]
    Extract --> AI["DeepSeek Provider"]
    Extract --> Products["ExtractedProduct[]"]
    Products --> Match["MatchEngine"]
    Repo["ProductRepository"] --> Match
    Match --> Result["ProductMatchResult[]"]
    Result --> UI
~~~

### 3.1 进程职责

#### React渲染进程

只负责：

- 文件选择与拖拽
- 展示上传、解析、提取、匹配进度
- 展示错误和人工确认项
- 展示匹配结果
- 导出/进入报价的操作入口

不负责：

- 直接访问任意本地路径
- 保存API密钥
- 运行大文件解析或OCR
- 直接调用模型供应商

#### Preload

仅暴露按任务设计的窄接口，例如：

- selectAnalysisFiles()
- startFileAnalysis(fileTokens)
- cancelAnalysis(jobId)
- getAnalysisStatus(jobId)
- exportMatchResult(resultId)

不得暴露：

- 原始 ipcRenderer
- fs
- shell任意调用
- 任意路径读写

#### Electron主进程

负责：

- 验证IPC发送方和参数
- 创建分析任务
- 文件类型、大小、文件签名校验
- 临时文件生命周期
- 调度解析Worker
- AI Provider调用
- 产品库访问
- 结果导出
- 错误映射和审计日志

#### Utility Process / Worker

负责CPU和内存较重的工作：

- PDF页面解析与渲染
- OCR
- Office压缩包解析
- 大型Excel遍历
- 文本分块

这样可避免阻塞Electron主进程和React界面。

### 3.2 文件输入不直接使用任意路径

从UI看，输入仍然是浏览器 File；进入主进程后应转换为受控文件描述符：

~~~ts
type FileSourceDescriptor = {
  fileId: string;
  displayName: string;
  size: number;
  declaredMimeType: string;
  detectedType: SupportedFileType;
  stagedPath: string;
  sha256: string;
};
~~~

建议流程：

1. 用户通过受控选择器或拖拽选择文件。
2. Preload使用Electron提供的安全能力取得文件来源。
3. 主进程完成复制、校验和随机任务目录暂存。
4. React只持有 fileId 和显示信息，不持有真实磁盘路径。
5. 后续所有操作通过 fileId 进行。

Electron的 webUtils.getPathForFile 可在Preload中取得File对应路径，但不应把完整路径返回给渲染进程，参考：[webUtils](https://www.electronjs.org/docs/latest/api/web-utils)。

## 4. 统一文件解析层

### 4.1 接口设计

页面不应分别调用PDF、Word、Excel解析器。建议在主进程/Worker内部定义：

~~~ts
interface FileParser {
  supports(file: FileSourceDescriptor): boolean;
  parse(
    file: FileSourceDescriptor,
    context: ParseContext
  ): Promise<ParsedDocument>;
}
~~~

统一输出：

~~~ts
type ParsedDocument = {
  schemaVersion: "1.0";
  fileId: string;
  fileName: string;
  fileType: "pdf" | "docx" | "xlsx" | "xls" | "image";
  mimeType: string;
  size: number;
  sha256: string;
  rawText: string;
  blocks: DocumentBlock[];
  tables: ParsedTable[];
  images: ParsedImage[];
  metadata: Record<string, string | number | boolean | null>;
  warnings: ParseWarning[];
};
~~~

来源位置必须使用可区分结构：

~~~ts
type SourceLocation =
  | { kind: "pdf"; page: number; bbox?: [number, number, number, number] }
  | { kind: "docx"; paragraph?: number; table?: number; row?: number; cell?: number }
  | { kind: "sheet"; sheet: string; cell?: string; range?: string; row?: number }
  | { kind: "image"; imageId: string; bbox?: [number, number, number, number] };
~~~

### 4.2 为什么适合当前Electron项目

- Node生态中四类文件均有成熟解析组件。
- 主进程可进行受控文件访问。
- Utility Process / Worker可隔离高耗时任务。
- React页面只接收结构化结果，不需要知道底层文件格式。
- 后续替换解析库、OCR引擎或AI模型时，不需要改页面。
- 同一数据契约可用于本地解析、云端解析和测试夹具。

## 5. 四类文件真实解析方案

## 5.1 PDF

### 原生文字PDF

推荐使用PDF.js：

1. 加载文档。
2. 按页读取。
3. 使用文本内容接口提取文字项及坐标。
4. 根据坐标恢复行、段落和阅读顺序。
5. 保存页码与坐标，供结果回溯。

PDF.js同时支持浏览器与Node示例，并可逐页加载和渲染，参考：[PDF.js Examples](https://mozilla.github.io/pdf.js/examples/)。

### 表格读取

PDF通常不保存“表格”语义，只保存分散文本及绘图命令，因此不能仅依赖字符串换行。

第一阶段建议：

- 基于文字坐标做行列聚类。
- 检测列间距、重复表头和网格线。
- 保留原始文字项及bbox。
- 输出低置信度表格时进入人工确认。

复杂表格是PDF解析中最容易出错的部分，应建立真实样本集验证：

- 无边框表格
- 跨页表格
- 合并单元格
- 竖排或旋转页面
- 一页多栏

### 扫描PDF

判断方式：

- 页面提取文字为空或文字密度低。
- 页面存在大面积图片。
- 字符数量与页面面积明显不匹配。

处理流程：

PDF.js逐页渲染为图片

→ 图像预处理

→ OCR

→ 按bbox恢复段落和表格候选

Tesseract.js官方说明其不直接支持PDF，需先将PDF页面渲染为图片再识别，参考：[Tesseract.js FAQ](https://github.com/naptha/tesseract.js/blob/master/docs/faq.md)。

### 混合PDF

不应对整份PDF统一选择“原生文字”或“OCR”。应按页判断：

- 有可靠文字层：直接提取。
- 无文字层：页面OCR。
- 文字层损坏或乱码：OCR兜底。

### PDF风险

- 加密或需要密码。
- 字体映射导致乱码。
- 文字顺序与视觉顺序不一致。
- 超大页、超多页导致内存压力。
- 表格边界不明确。
- OCR页码和原文坐标对齐困难。

## 5.2 Word（.docx）

推荐第一阶段使用Mammoth作为语义提取器：

- 正文和标题
- 列表
- 表格
- 图片
- 原始文本

Mammoth支持表格和图片，但不追求Word版式的完全还原；其官方文档也明确提示输出不做安全净化，因此不可信文档必须隔离解析，HTML若需要展示必须先净化，参考：[Mammoth README](https://github.com/mwilliamson/mammoth.js/)。

### 推荐实现

1. 读取docx压缩包。
2. Mammoth提取语义HTML或原始文本。
3. 将HTML转换成内部DocumentBlock，不直接注入页面。
4. 提取表格行列。
5. 将嵌入图片输出到任务临时目录，并记录关系ID。
6. 对图片按需OCR。
7. 来源位置使用段落索引、表格/行/单元格索引，不承诺Word页码。

### 必要补充

如果Mammoth不能满足精确来源定位、合并单元格或复杂图片关系，可对Office Open XML做补充解析，而不是第一阶段直接自行重写完整DOCX解析器。

### Word风险

- DOCX没有稳定的“页码”概念，页数受Word排版环境影响。
- 浮动文本框、页眉页脚、批注可能影响阅读顺序。
- 合并表格和嵌套表格。
- 外部链接或外部资源。
- 压缩炸弹和超大图片。
- 旧版.doc不在本轮支持范围，应明确提示用户转换为.docx。

## 5.3 Excel（.xlsx / .xls）

推荐使用SheetJS Community Edition读取工作簿。

基础流程：

1. 读取ArrayBuffer。
2. XLSX.read生成工作簿。
3. 遍历 workbook.SheetNames。
4. 获取每个工作表。
5. 使用 sheet_to_json({ header: 1 })提取二维数组。
6. 同时保留工作表名、单元格地址、有效范围和合并单元格。
7. 识别表头、产品数据行和备注区域。

SheetJS官方说明 XLSX.read 可读取文件数据，SheetNames包含工作表顺序，sheet_to_json 配合 header: 1 可得到二维数组；合并单元格信息需要结合 !merges 处理，参考：[SheetJS Import Tutorial](https://docs.sheetjs.com/docs/getting-started/examples/import/)。

### 产品行识别

不能假设第一行就是表头。建议：

1. 扫描前若干行寻找“名称、品名、型号、规格、数量、材质、工艺”等候选字段。
2. 支持两行或多行表头。
3. 处理合并单元格引起的空值。
4. 根据列类型和非空比例判断数据区。
5. 保留原始单元格地址，便于人工追溯。

### 公式和宏

- 不执行宏。
- 不主动计算不可信公式。
- 优先使用文件缓存值。
- 同时把公式文本作为元数据保留。
- 若只有公式没有缓存结果，标记“需要Excel重新计算或人工确认”。

### Excel风险

- 多Sheet且格式不同。
- 多行表头和合并单元格。
- 隐藏行列。
- 一个单元格中混合多个规格。
- 日期和数字的自动类型转换。
- 公式缓存为空。
- 单位不统一。
- .xls旧格式兼容性。

## 5.4 图片（jpg / jpeg / png）

第一阶段图片能力应分成两类：

### OCR文字识别

用于：

- 产品清单截图
- 铭牌
- 参数表
- 包装标签
- 扫描件

推荐流程：

1. 校正EXIF方向。
2. 限制最大像素和分辨率。
3. 旋转检测。
4. 灰度、对比度、二值化和降噪。
5. OCR输出文字、词级bbox和置信度。
6. 针对铭牌做键值对和行列恢复。

Tesseract.js可在Node中识别图片并提供中文语言模型，但需要正确打包Worker和语言数据，参考：[Tesseract.js](https://github.com/naptha/tesseract.js/)。

### 产品图片理解

“看图判断产品类别、型号或相似产品”不是普通OCR能力。

本阶段建议：

- OCR可读铭牌和文字。
- 对无文字纯产品图，只记录图片与来源。
- 预留 VisionProvider 接口。
- 强制进入人工确认。
- 真正多模态识别放入后续独立评估。

当前DeepSeek官方模型为文本模型，图片和文档内容输入未受支持，因此不能把图片理解直接交给DeepSeek；可参考其官方Anthropic兼容说明中的内容类型支持表：[DeepSeek Anthropic API](https://api-docs.deepseek.com/guides/anthropic_api)。

### 图片风险

- 反光、倾斜、低分辨率和运动模糊。
- 中文、英文、数字混排。
- 型号中0/O、1/I、5/S混淆。
- 铭牌表格没有明显边界。
- OCR高置信度不等于业务字段正确。

## 6. AI结构化产品提取层

### 6.1 统一结构

~~~ts
type ExtractedProduct = {
  id: string;
  productName: string | null;
  model: string | null;
  specifications: Record<string, string>;
  quantity: {
    value: number | null;
    unit: string | null;
    raw: string | null;
  };
  material: string | null;
  process: string | null;
  application: string | null;
  notes: string[];
  sourceFile: string;
  sourceLocations: SourceLocation[];
  evidence: Array<{
    field: string;
    text: string;
    location: SourceLocation;
  }>;
  confidence: number;
  fieldConfidence: Record<string, number>;
  needsHumanReview: boolean;
};
~~~

AI响应应包含：

~~~ts
type ProductExtractionResult = {
  schemaVersion: "1.0";
  products: ExtractedProduct[];
  unresolvedFragments: Array<{
    text: string;
    location: SourceLocation;
    reason: string;
  }>;
  warnings: string[];
};
~~~

### 6.2 提取流程

1. 按页、章节、表格或Sheet进行分块。
2. 每块保留来源ID和位置。
3. 将文字与表格转成明确的JSON输入。
4. 要求模型只输出指定JSON。
5. 运行时Schema校验。
6. 无效JSON或空响应时进行一次受控修复重试。
7. 按型号、名称和来源合并重复产品。
8. 合并时保留全部证据，不覆盖冲突值。
9. 低置信度或字段冲突进入人工确认。

禁止：

- 从自由文本中用正则猜测模型最终答案。
- 丢弃来源位置。
- 用AI补齐文件中没有的型号、数量或规格。
- 把AI置信度解释为技术可行性或正式匹配结论。

### 6.3 DeepSeek可行性

当前项目没有DeepSeek代码，需要新增Provider接口后再接入。

DeepSeek适合作为第一阶段：

- 中文产品资料结构化提取。
- 表头映射和字段归一。
- 非标准描述转成候选字段。
- 对确定性匹配的Top-K候选做语义复核。

DeepSeek官方API兼容OpenAI格式，并支持JSON Output。官方要求设置 response_format 为 json_object、在提示中明确要求JSON并给出示例，同时提醒可能出现空内容或截断，参考：[DeepSeek First API Call](https://api-docs.deepseek.com/)、[DeepSeek JSON Output](https://api-docs.deepseek.com/guides/json_mode/)。

截至本评估日期，官方模型列表为 deepseek-v4-flash 和 deepseek-v4-pro。实现时模型名必须放在配置中，并通过 /models 或官方文档确认，不能写死到业务页面。

### 6.4 Provider接口

~~~ts
interface ProductExtractionProvider {
  extract(
    input: ExtractionInput,
    options: ExtractionOptions
  ): Promise<ProductExtractionResult>;
}
~~~

建议实现：

- DeepSeekProductExtractionProvider
- MockProductExtractionProvider
- 后续可增加其他供应商，不影响页面和匹配引擎。

### 6.5 API密钥与数据边界

API密钥不得放在：

- React源码
- Vite环境变量并打包进前端
- LocalStorage
- preload暴露对象
- 演示数据文件

正式交付推荐：

Electron主进程

→ 数员科技受控服务端代理

→ DeepSeek

服务端负责密钥、租户、限流、审计和供应商切换。

仅用于内部技术验证时，可暂时从主进程环境变量或本机安全配置读取，但桌面客户端无法真正隐藏长期供应商密钥，因此不能作为正式生产方案。

客户文件发送到云端前必须：

- 明确告知数据处理方式。
- 支持关闭云端AI。
- 只发送必要文本片段，不默认上传原文件。
- 对日志脱敏。
- 定义保留和删除策略。

## 7. 企业产品库方案

### 7.1 第一阶段数据模型

~~~ts
type ProductRecord = {
  productId: string;
  productName: string;
  model: string;
  category: string;
  specifications: Record<string, string>;
  applications: string[];
  keywords: string[];
  synonyms: string[];
  description: string;
  status: "active" | "inactive";
  version: number;
  updatedAt: string;
};
~~~

### 7.2 推荐落地方式

运行时：

- 版本化本地JSON。
- 存放在 app.getPath("userData") 下。
- 安装包内只放初始模板，不直接修改resources中的文件。

导入：

- 提供标准Excel模板。
- Excel导入后校验字段。
- 归一化后写入本地JSON。
- 生成导入报告：成功、警告、失败行。

不建议：

- 每次匹配都直接读取Excel。
- 让用户自由定义所有列而没有映射步骤。
- 将产品数据写入前端源码或演示数据文件。

### 7.3 归一化索引

导入时生成：

- 产品名标准化值。
- 型号标准化值。
- 同义词倒排索引。
- 关键词索引。
- 规格字段与单位标准化值。
- 应用场景词集合。

标准化规则至少包括：

- Unicode NFKC。
- 全半角统一。
- 大小写统一。
- 空格和常见标点归一。
- 型号中的连字符统一。
- 数值与单位拆分。
- mm/cm/m、kg/g等单位换算。

### 7.4 升级SQLite路径

先定义仓储接口：

~~~ts
interface ProductRepository {
  list(): Promise<ProductRecord[]>;
  getById(productId: string): Promise<ProductRecord | null>;
  findByNormalizedModel(model: string): Promise<ProductRecord[]>;
  searchCandidates(query: ProductCandidateQuery): Promise<ProductRecord[]>;
  import(records: ProductRecord[]): Promise<ImportReport>;
}
~~~

第一阶段：

- JsonProductRepository

后续：

- SqliteProductRepository

只要接口稳定，UI、提取层和匹配引擎无需因迁移SQLite而重写。

适合迁移SQLite的信号：

- 产品数量达到数千至数万。
- 需要频繁增量编辑。
- 需要版本回滚和多条件检索。
- 需要审计、事务和关联附件。

## 8. 分层匹配算法

### 8.1 原则

- AI不是唯一匹配器。
- 所有结果必须有可展示的匹配依据。
- 明确冲突比模糊相似度更重要。
- “未找到”是有效结果，不强行给候选。
- 正式结果始终由销售或技术人员确认。

### 8.2 匹配流程

#### 第0层：输入标准化与质量门槛

- 型号、名称、单位、规格归一。
- 过滤空字段。
- 标记OCR疑似字符。
- 识别硬冲突字段。
- 信息不足时直接标记人工确认。

#### 第一层：型号精确匹配

- 标准化型号完全一致。
- 检查关键规格是否存在硬冲突。
- 无冲突时输出exact候选。

匹配依据示例：

- 型号SP-3000一致。
- 产品类别一致。
- 未发现关键规格冲突。

#### 第二层：产品名称与同义词

- 产品标准名。
- 企业自定义同义词。
- 分词与关键词重合。
- 型号缺失时提高名称权重。

#### 第三层：规格参数

- 字段名映射。
- 数值、单位和允许范围。
- 必选规格和可选规格分开。
- 记录匹配项和冲突项。

匹配依据示例：

- 3项规格中2项一致。
- 产能区间满足。
- 工作宽度存在冲突。

#### 第四层：应用场景

- 行业。
- 工件。
- 工艺。
- 产能。
- 产线接入方式。

场景匹配只能作为加分项，不能覆盖型号或关键规格冲突。

#### 第五层：AI语义判断

仅用于：

- 同义描述不规则。
- 产品名称模糊。
- Top-K候选难以区分。
- 解释候选差异。

AI不得：

- 生成产品库中不存在的产品。
- 绕过硬规格冲突。
- 直接输出正式技术可行性结论。

### 8.3 状态输出

~~~ts
type MatchLevel = "exact" | "high" | "medium" | "low" | "none";

type ProductMatchResult = {
  extractedProductId: string;
  level: MatchLevel;
  candidateProductId: string | null;
  score: number | null;
  matchedRules: string[];
  conflictingRules: string[];
  evidence: MatchEvidence[];
  needsHumanReview: boolean;
  reviewReason: string[];
};
~~~

### 8.4 初始评分建议

以下仅为可调试起点，不是业务承诺：

| 维度 | 建议权重 |
|---|---:|
| 型号 | 45% |
| 名称/同义词 | 25% |
| 规格 | 20% |
| 应用场景 | 10% |

初始等级可暂定：

- exact：型号精确且无硬冲突。
- high：综合分≥0.82且无硬冲突。
- medium：0.60至0.82。
- low：0.35至0.60。
- none：低于0.35或存在不可接受的硬冲突。

阈值必须通过企业真实样本集校准，不能直接作为正式生产标准。

### 8.5 结果表

最终给UI和Excel的核心字段：

- 客户产品名称
- 客户型号
- 我方对应产品
- 我方型号
- 匹配等级
- 是否找到
- 匹配依据
- 冲突项
- 来源文件
- 来源位置
- 是否需要人工确认
- 人工确认结果

## 9. 安全与可靠性边界

### 9.1 文件限制

建议第一阶段采用可配置初始限制：

- 单文件不超过25MB。
- 单批不超过10个文件。
- 单批总量不超过100MB。
- 扫描PDF最多OCR 50页。
- 图片限制总像素，超限先安全缩放。

这些值是工程起点，需通过真实文件压测后调整。

### 9.2 文件类型验证

同时检查：

- 扩展名。
- 浏览器声明MIME。
- Magic Bytes / 文件签名。
- Office压缩包内部必要结构。

不得只信任扩展名。

### 9.3 恶意与损坏文件

- DOCX/XLSX压缩炸弹限制解压大小、文件数和压缩比。
- 不执行宏。
- 禁止外部实体和外部资源自动加载。
- HTML输出必须净化，不直接使用 dangerouslySetInnerHTML。
- 解析任务设置超时、内存预算和取消机制。
- 损坏、加密、密码保护文件返回明确错误。

### 9.4 Electron安全

- 保持 nodeIntegration: false。
- 保持 contextIsolation: true。
- 建议显式开启 sandbox。
- 验证每个IPC发送方。
- 限制IPC通道和参数Schema。
- 不向renderer返回完整文件路径。
- 禁止任意URL导航和新窗口。
- 增加严格CSP。
- 解析器在Worker/Utility Process中运行。

### 9.5 临时文件

- 每个任务使用随机目录。
- 存放在系统临时目录或userData/cache。
- 目录只保存任务必要内容。
- 成功、失败、取消都在finally清理。
- 应用启动时清理过期任务目录。
- 崩溃恢复后继续清理。
- 日志不记录客户全文和完整路径。

### 9.6 AI请求

- API密钥只在主进程或服务端。
- 设置连接与响应超时。
- 支持用户取消。
- 对429、5xx做有限次数指数退避。
- 每个任务使用幂等ID，避免重复收费。
- 大文件分块并控制令牌预算。
- 空响应、截断、无效JSON均作为显式错误。
- Schema失败最多自动修复一次，随后转人工。
- 不把模型输出直接当正式技术结论。

### 9.7 本地与云端数据模式

建议产品层面区分：

- 本地解析：文件字节、OCR、表格读取在本机完成。
- 云端AI提取：只发送必要文本和结构化表格片段。
- 全本地模式：不调用云端AI，保留规则提取和人工录入。

界面必须让用户知道当前数据是否离开本机。

## 10. 开发任务拆分

## REAL-AI-001A 真实PDF / Word / Excel / 图片读取

### 目标

验证四类文件在Electron环境中的真实读取能力，形成可重复的解析样本和技术选型结论。

### 修改范围

- 新增独立解析实验目录或测试目录。
- 不接入现有AI智能接待页面。
- 不修改冻结页面业务行为。

### 技术方案

- PDF.js：原生文字、页面坐标、页面渲染。
- Mammoth：DOCX正文、表格和图片。
- SheetJS：XLS/XLSX的Sheet和单元格。
- Tesseract.js：图片及扫描PDF页面OCR。
- 建立标准测试夹具及预期结果。

### 风险

- 打包后的Worker、WASM和语言文件路径。
- PDF表格恢复质量。
- 中文OCR准确率。
- Office复杂布局。

### 验收标准

- 每类至少5个代表文件。
- 文字、表格、图片、来源位置均有输出。
- 损坏和超限文件能返回明确错误。
- 解析不阻塞主界面。
- 输出结果有快照测试或黄金样本对比。

### 预计依赖

- PDF.js
- Mammoth
- SheetJS
- Tesseract.js
- 图像预处理库（选型时确认）

## REAL-AI-001B 统一文件解析层

### 目标

建立FileParser注册机制、ParsedDocument契约、IPC任务模型和Worker隔离。

### 修改范围

- Electron主进程。
- Preload窄接口。
- parser/service/types目录。
- 测试。

### 技术方案

- FileParser接口和格式适配器。
- FileIngestionService。
- 任务ID、进度、取消和错误码。
- Utility Process / Worker执行。
- 文件签名、大小和压缩包安全校验。

### 风险

- IPC暴露过宽。
- Worker崩溃没有回收。
- 临时目录泄漏。
- 解析结果过大导致IPC复制成本。

### 验收标准

- 页面层只调用统一接口。
- 四类文件输出相同ParsedDocument结构。
- 支持进度、取消、超时和错误分类。
- renderer不获取任意路径和Node能力。
- 崩溃或取消后临时文件可清理。

### 预计依赖

- REAL-AI-001A结果。
- 运行时Schema校验库。
- 文件签名检测方案。

## REAL-AI-001C AI结构化产品提取

### 目标

将ParsedDocument转成有来源证据的ExtractedProduct数组。

### 修改范围

- AI Provider接口。
- DeepSeek Provider。
- 分块、合并、校验和重试服务。
- 测试夹具。
- 不接UI。

### 技术方案

- DeepSeek JSON Output。
- 版本化JSON Schema。
- 页/表/Sheet分块。
- 字段级证据和置信度。
- 无效JSON一次修复重试。
- Mock Provider用于离线测试。

### 风险

- 空响应、截断和无效JSON。
- 模型补写不存在字段。
- 分块后重复或漏产品。
- 客户数据发送边界。
- 桌面端密钥泄漏。

### 验收标准

- 输出100%通过Schema或进入明确失败状态。
- 每个非空关键字段可追溯来源。
- 不存在的信息输出null，不编造。
- API失败可重试、取消并转人工。
- 离线Mock可完成自动测试。

### 预计依赖

- REAL-AI-001B。
- DeepSeek账号及后端代理方案。
- Schema校验库。

## REAL-AI-001D 本地企业产品库

### 目标

建立可导入、可校验、可版本化的企业产品库。

### 修改范围

- ProductRepository接口。
- JSON仓储。
- Excel导入器。
- 产品标准化与索引。
- 不修改数据库。

### 技术方案

- 标准Excel模板导入。
- 转换为版本化本地JSON。
- 存放userData。
- 生成导入报告。
- 支持备份与回滚上一版本。

### 风险

- 用户Excel列名不一致。
- 重复产品ID或型号。
- 单位混乱。
- 导入失败导致旧库被覆盖。

### 验收标准

- 合法模板可完整导入。
- 错误行有准确位置和原因。
- 导入失败不破坏当前有效版本。
- 型号、同义词和规格索引可查询。
- 产品库可离线使用。

### 预计依赖

- SheetJS。
- Schema校验库。
- REAL-AI-001A的Excel经验。

## REAL-AI-001E 产品匹配引擎

### 目标

实现型号、名称、规格、场景和AI语义的分层可解释匹配。

### 修改范围

- MatchEngine。
- 标准化与单位换算。
- 匹配证据与冲突输出。
- 基准样本和测试。
- 不接UI。

### 技术方案

- 确定性候选召回。
- 分层打分。
- 硬冲突规则。
- AI仅做Top-K复核。
- 输出exact/high/medium/low/none。

### 风险

- 型号字符混淆。
- 单位换算错误。
- 规格字段同名异义。
- 阈值未校准。
- AI覆盖规则结论。

### 验收标准

- 每个结果包含匹配与冲突依据。
- 精确型号无冲突时稳定命中。
- 硬冲突不会被语义相似度覆盖。
- 未找到结果不会强行推荐产品。
- 使用黄金样本统计准确率和人工复核率。

### 预计依赖

- REAL-AI-001C。
- REAL-AI-001D。
- 单位换算和文本标准化方案。

## REAL-AI-001F 接入现有AI智能接待UI

### 目标

保持现有高保真页面和六步流程，用真实解析、提取和匹配任务替换演示定时器。

### 修改范围

- 仅AI智能接待的资料分析模式。
- 前端analysis client。
- 结果导出与报价交接。
- 不改其他冻结模块业务设计。

### 技术方案

- 对接任务进度事件。
- 支持取消、重试、错误和人工确认。
- 显示真实来源位置和匹配依据。
- 导出真实XLSX。
- 仅将人工确认后的匹配结果传入报价。

### 风险

- 大结果造成页面卡顿。
- UI状态与后台任务不同步。
- 页面关闭后任务残留。
- 导出内容与屏幕结果不一致。
- 未确认结果误入报价。

### 验收标准

- 真实文件可完成端到端流程。
- 六步状态来自真实任务而非固定计时器。
- 页面刷新或切换后不白屏。
- 失败可重试，取消可生效。
- 人工确认前不能作为正式报价输入。
- 1366×768和1440×900可正常操作。

### 预计依赖

- REAL-AI-001B至001E全部通过。
- 真实XLSX导出能力。

## 11. 推荐实施顺序

推荐从 REAL-AI-001A 开始，但在写解析代码前先完成两件事：

1. 冻结 ParsedDocument、ExtractedProduct、ProductRecord 和 ProductMatchResult 的V1数据契约。
2. 建立真实脱敏样本集和黄金答案。

推荐顺序：

REAL-AI-001A 文件解析验证

→ REAL-AI-001B 统一解析与安全IPC

→ REAL-AI-001D 本地产品库

→ REAL-AI-001C AI结构化提取

→ REAL-AI-001E 匹配引擎

→ REAL-AI-001F UI接入

将产品库放在AI提取之前完成，有利于尽早建立字段标准、同义词和规格单位，减少模型输出与产品库无法对齐的问题。

## 12. 最容易出Bug的地方

### P0

1. Electron IPC接收任意路径，造成越权读取或路径穿越。
2. API密钥打包进renderer或桌面安装包。
3. 大文件、压缩炸弹或OCR阻塞导致应用白屏。
4. AI无效JSON、空响应或截断未被Schema拦截。
5. 模型补写文件中不存在的型号、数量和规格。
6. 未经人工确认的匹配结果直接进入正式报价。
7. 临时客户文件在失败或崩溃后长期残留。

### P1

1. PDF文本阅读顺序错误。
2. PDF复杂表格行列错位。
3. 扫描PDF漏触发OCR或整份重复OCR。
4. DOCX合并表格、图片和文本框顺序错误。
5. Excel多行表头、合并单元格、隐藏行列和公式值处理错误。
6. 型号中的0/O、1/I、连字符和空格归一错误。
7. 规格单位换算或范围比较错误。
8. 分块合并时产品重复、字段互相覆盖或证据丢失。
9. 打包后PDF Worker、OCR WASM和中文语言文件路径失效。

### P2

1. OCR进度与真实处理进度不一致。
2. 错误提示不能告诉用户具体文件和页码。
3. 导出的Excel与页面排序或人工修改结果不一致。
4. 产品库导入警告不清楚。
5. 应用重启后任务状态或缓存清理不完整。

## 13. 验收总标准

REAL-AI-001全部完成时，应满足：

- PDF、DOCX、XLS/XLSX、JPG/JPEG/PNG可真实读取。
- 原生PDF和扫描PDF有不同处理路径。
- 所有解析器输出统一ParsedDocument。
- 产品字段通过结构化JSON输出并运行时校验。
- 每个关键字段可追溯到文件、页/Sheet/单元格或图片区域。
- 企业产品库可由标准Excel导入并离线查询。
- 匹配先走确定性规则，AI只做补充判断。
- 匹配结果包含依据、冲突和人工确认状态。
- 公开平台搜索不在本阶段出现。
- API密钥不进入renderer或前端包。
- 解析、OCR、AI请求均支持失败、超时、取消和重试。
- 客户文件有明确的本地暂存、云端发送和清理策略。
- 只有人工确认后的结果可导出为正式工作材料或进入报价流程。

## 14. 本轮评估结论

当前项目可以演进到真实解析与匹配，不需要推翻现有React页面或Electron架构，但需要新增清晰的主进程服务边界。

最稳妥的技术路线是：

- Electron主进程负责安全和任务编排。
- Utility Process / Worker负责重解析与OCR。
- FileParser统一四类文件。
- DeepSeek负责有Schema约束的中文结构化提取。
- 本地JSON产品库负责第一阶段数据落地。
- 分层规则引擎负责主要匹配。
- AI只做语义补充。
- 销售人工确认作为正式输出前的硬门槛。

本轮未修改任何业务页面、Electron配置、依赖、数据库或接口。
