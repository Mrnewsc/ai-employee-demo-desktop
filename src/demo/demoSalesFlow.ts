export type SalesStage = '客户发现' | 'AI接待' | '需求确认' | '报价' | '跟进' | '成交';
export type DemoLeadStatus = '待联系' | '需求确认中' | '待报价' | '报价处理中' | '报价已发送' | '今日跟进' | '等待客户' | '需求确认完成';
export type DemoChatMessage = { id: string; from: 'customer' | 'ai'; text: string };
export type DemoFileKind = 'pdf' | 'word' | 'excel' | 'image';
export type DemoMatchStatus = '已找到' | '部分匹配' | '未找到';
export type DemoTimelineEventId =
  | 'content-view'
  | 'customer-inquiry'
  | 'ai-reception-complete'
  | 'lead-created'
  | 'product-matched'
  | 'quote-created'
  | 'quote-review'
  | 'quote-confirmed'
  | 'quote-sent'
  | 'followup-suggested';

export type DemoTimelineEvent = {
  id: DemoTimelineEventId;
  time: string;
  label: string;
};

export type DemoAnalysisFile = {
  id: string;
  name: string;
  size: string;
  kind: DemoFileKind;
};

export type DemoMatchRow = {
  id: string;
  customerProduct: string;
  customerModel: string;
  ourProduct: string;
  score: string;
  status: DemoMatchStatus;
  note: string;
  source: string;
};

export type DemoPublicCandidate = {
  image: string;
  title: string;
  platform: string;
  feature: string;
};

export type DemoSalesCustomer = {
  customerId: string;
  name: string;
  industry: string;
  region: string;
  productId: string;
  demandProduct: string;
  model: string;
  quoteProduct: string;
  confirmedNeeds: string[];
  pendingNeeds: string[];
  currentStage: SalesStage;
  recentAction: string;
  recentActionTime: string;
  quoteId: string;
  followupId: string;
  standalone: boolean;
  timeline: DemoTimelineEvent[];
  lead: {
    source: string;
    intent: string;
    status: string;
    owner: string;
    priority: 'A' | 'B' | 'C' | 'D';
    size: string;
    website: string;
    needSummary: string;
    budget: string;
    aiReason: string;
    next: string;
    script: string;
  };
  aiReception: {
    messages: DemoChatMessage[];
    quickQuestions: string[];
    defaultReply: string;
    profile: {
      dailyOutput: string;
      intent: string;
      action: string;
      tags: string[];
      budget: string;
    };
    files: DemoAnalysisFile[];
    extractedFields: Array<[string, string]>;
    matchRows: DemoMatchRow[];
    publicCandidates: DemoPublicCandidate[];
    analysisAdvice: string;
    analysisNote: string;
  };
};

export type DemoQuoteStatus = '草稿' | '待人工确认' | '已确认待发送' | '已发送' | '待跟进' | '已失效';

export type DemoQuoteRecord = {
  id: string;
  number: string;
  customerId: string;
  productId: string;
  status: DemoQuoteStatus;
  amount: number;
  valid: string;
  action: string;
  createdEventId: DemoTimelineEventId;
  actionEventId: DemoTimelineEventId;
  productName: string;
  model: string;
  configuration: string;
  quantity: number;
  delivery: string;
  payment: string;
  service: string;
  notes: string;
};

export type DemoFollowupStatus = '今日待跟进' | '即将到期' | '已跟进' | '等待客户' | '需要人工介入' | '延后处理';
export type DemoFollowupChannel = '微信' | '电话' | '短信';

export type DemoFollowupTask = {
  id: string;
  customerId: string;
  priority: 'A' | 'B' | 'C' | 'D';
  priorityLabel: string;
  status: DemoFollowupStatus;
  currentState: string;
  stage: SalesStage;
  reason: string;
  suggestedTime: string;
  channel: string;
  duration: string;
  recentEventId: DemoTimelineEventId;
  rankReasons: string[];
  goal: string;
  avoid: string;
  next: string;
  scripts: Record<DemoFollowupChannel, string>;
};

const commonFiles = (prefix: string): DemoAnalysisFile[] => [
  { id: `${prefix}-catalog`, name: '产品目录.pdf', size: '4.8 MB', kind: 'pdf' },
  { id: `${prefix}-specs`, name: '设备参数表.xlsx', size: '820 KB', kind: 'excel' },
  { id: `${prefix}-photo`, name: '客户现场照片.jpg', size: '2.1 MB', kind: 'image' },
  { id: `${prefix}-request`, name: '采购需求.docx', size: '96 KB', kind: 'word' },
];

const jinhuaCustomer: DemoSalesCustomer = {
  customerId: 'customer-jinhua-001',
  name: '金华某五金制品厂',
  industry: '五金制造',
  region: '浙江金华',
  productId: 'product-spray-sp3000',
  demandProduct: '自动喷涂设备',
  model: 'SP-3000',
  quoteProduct: '自动喷涂设备标准方案',
  confirmedNeeds: ['五金/金属配件喷涂', '日产约3000件'],
  pendingNeeds: ['工件尺寸', '喷涂材料', '现场产线条件'],
  currentStage: '跟进',
  recentAction: '报价已发送，等待销售跟进',
  recentActionTime: '今天 11:40',
  quoteId: 'quote-jinhua-001',
  followupId: 'follow-jinhua-001',
  standalone: false,
  timeline: [
    { id: 'content-view', time: '今天 09:12', label: '客户查看自动喷涂设备相关内容' },
    { id: 'customer-inquiry', time: '今天 09:25', label: '客户主动咨询日产量与适用场景' },
    { id: 'ai-reception-complete', time: '今天 10:03', label: 'AI完成基础需求收集' },
    { id: 'lead-created', time: '今天 10:20', label: '销售收到新客户线索' },
    { id: 'product-matched', time: '今天 10:35', label: 'AI完成产品初步匹配' },
    { id: 'quote-created', time: '今天 10:50', label: '创建报价草案 Q-2026-001' },
    { id: 'quote-review', time: '今天 11:10', label: '报价进入待人工确认' },
    { id: 'quote-confirmed', time: '今天 11:30', label: '销售人工确认报价' },
    { id: 'quote-sent', time: '今天 11:40', label: '报价已发送（演示状态）' },
    { id: 'followup-suggested', time: '今天 14:00', label: '建议销售跟进' },
  ],
  lead: {
    source: '知乎', intent: '高', status: '待报价', owner: '销售一组', priority: 'A', size: '待补充', website: '待补充',
    needSummary: '五金/金属配件喷涂，日产约3000件', budget: '待确认',
    aiReason: '客户已主动咨询日产量并完成基础需求收集，建议优先推进报价后的参数确认。',
    next: '进入AI智能接待，核对产品匹配与待确认需求。',
    script: '您好，已记录您主要做五金/金属配件喷涂，日产约3000件。接下来想确认工件尺寸、喷涂材料和现场产线条件，以便进一步核对方案。',
  },
  aiReception: {
    messages: [
      { id: 'jinhua-customer-1', from: 'customer', text: '你们的设备适合五金工厂吗？' },
      { id: 'jinhua-ai-1', from: 'ai', text: '可以。针对五金工厂，可根据工件尺寸、日产量、喷涂材料和自动化程度匹配对应的设备方案。\n\n为了初步判断配置，请问您目前主要加工什么产品？' },
      { id: 'jinhua-customer-2', from: 'customer', text: '主要做金属配件，每天大约3000件。' },
      { id: 'jinhua-ai-2', from: 'ai', text: '了解，已记录您主要生产金属配件，日产量约3000件。\n\n还需要确认工件尺寸、喷涂材料和现场产线条件。我可以先为您登记需求，并安排专业人员进一步沟通。' },
    ],
    quickQuestions: ['你们的设备适合五金工厂吗？', 'SP-3000适合每天3000件吗？', '能否接入现有产线？', '喷涂材料需要提供哪些信息？', '工件尺寸如何确认？'],
    defaultReply: '结合当前资料，可以先按自动喷涂设备 SP-3000 标准方案进行初步匹配。工件尺寸、喷涂材料和现场产线条件仍需人工确认。',
    profile: { dailyOutput: '约3000件', intent: '中高', action: '安排销售及技术人员沟通', tags: ['五金制造', '自动喷涂设备', 'SP-3000', '日产量已确认', '建议人工跟进'], budget: '待确认' },
    files: commonFiles('jinhua'),
    extractedFields: [['产品名称', '自动喷涂设备'], ['客户型号', 'SP-3000'], ['产能要求', '约3000件 / 天'], ['工艺场景', '五金/金属配件喷涂'], ['关键规格', '工件尺寸、喷涂材料、现场产线条件待确认']],
    matchRows: [
      { id: 'jinhua-spray', customerProduct: '自动喷涂设备', customerModel: 'SP-3000', ourProduct: '自动喷涂设备标准方案', score: '高', status: '已找到', note: '产能接近，三项现场参数待确认', source: '产品目录.pdf · 第2页' },
      { id: 'jinhua-line', customerProduct: '自动化输送线', customerModel: 'AL-120', ourProduct: '自动化生产线', score: '中', status: '部分匹配', note: '需要确认线体长度与接入方式', source: '设备参数表.xlsx · 第4行' },
      { id: 'jinhua-cleaning', customerProduct: '工件清洗设备', customerModel: '待识别', ourProduct: '暂无直接匹配', score: '—', status: '未找到', note: '建议补充铭牌或规格照片', source: '客户现场照片.jpg' },
    ],
    publicCandidates: [
      { image: '候选图', title: '金属工件自动清洗设备参考', platform: '1688公开平台', feature: '外观与清洗工艺相似' },
      { image: '候选图', title: '工厂用零件清洗生产线', platform: '公开渠道候选', feature: '应用场景相似，型号待核验' },
    ],
    analysisAdvice: '建议先确认工件尺寸、喷涂材料和现场产线条件，再推进自动喷涂设备标准方案。',
    analysisNote: '当前有1项产品需要补充型号、尺寸或铭牌照片。',
  },
};

const yiwuCustomer: DemoSalesCustomer = {
  customerId: 'customer-yiwu-002',
  name: '义乌某机械有限公司',
  industry: '机械设备/自动化',
  region: '浙江义乌',
  productId: 'product-line-al2600',
  demandProduct: '自动化生产线',
  model: 'AL-2600',
  quoteProduct: '自动化生产线基础方案',
  confirmedNeeds: ['机械部件装配场景', '需要结合现有车间布局'],
  pendingNeeds: ['目标产能', '产线长度', '交付地区/现场条件'],
  currentStage: '报价',
  recentAction: '报价草案等待人工确认',
  recentActionTime: '今天 10:30',
  quoteId: 'quote-yiwu-002',
  followupId: 'follow-yiwu-002',
  standalone: false,
  timeline: [
    { id: 'content-view', time: '今天 09:05', label: '客户查看自动化生产线采购内容' },
    { id: 'customer-inquiry', time: '今天 09:18', label: '客户咨询现有车间改造适配' },
    { id: 'ai-reception-complete', time: '今天 09:42', label: 'AI完成基础需求收集' },
    { id: 'lead-created', time: '今天 09:50', label: '销售收到新客户线索' },
    { id: 'product-matched', time: '今天 10:05', label: 'AI匹配 AL-2600 基础方案' },
    { id: 'quote-created', time: '今天 10:20', label: '创建报价草案 Q-2026-002' },
    { id: 'quote-review', time: '今天 10:30', label: '报价进入待人工确认' },
    { id: 'quote-confirmed', time: '待完成', label: '等待销售人工确认' },
    { id: 'quote-sent', time: '待完成', label: '报价尚未发送' },
    { id: 'followup-suggested', time: '今天 15:30', label: '建议补充产线条件' },
  ],
  lead: {
    source: '小红书', intent: '中高', status: '待跟进', owner: '销售一组', priority: 'B', size: '待补充', website: '待补充',
    needSummary: '自动化生产线选型，需要结合现有车间布局', budget: '待确认',
    aiReason: '客户已明确自动化生产线方向，建议确认目标产能、产线长度和交付地区/现场条件。',
    next: '进入AI智能接待，补充产线条件后完成人工报价确认。',
    script: '您好，已记录您关注自动化生产线。想进一步确认目标产能、产线长度和交付地区/现场条件，以便核对 AL-2600 基础方案。',
  },
  aiReception: {
    messages: [
      { id: 'yiwu-customer-1', from: 'customer', text: '我们想做一条自动化生产线，能根据现有车间调整吗？' },
      { id: 'yiwu-ai-1', from: 'ai', text: '可以先根据现有车间布局整理基础方案。为了判断 AL-2600 是否适合，需要确认目标产能、产线长度和现场条件。' },
      { id: 'yiwu-customer-2', from: 'customer', text: '主要用于机械部件装配，车间在义乌，目标产能还在测算。' },
      { id: 'yiwu-ai-2', from: 'ai', text: '了解，已记录机械部件装配场景和义乌现场。目标产能、产线长度及具体现场条件仍需确认，我可以先整理为待办并转交销售和技术人员。' },
    ],
    quickQuestions: ['AL-2600适合机械部件装配吗？', '产线长度需要怎么测量？', '目标产能需要提供哪些数据？', '能否结合现有车间布局？', '交付地区会影响哪些配置？'],
    defaultReply: '结合当前资料，可以先按自动化生产线 AL-2600 基础方案整理。目标产能、产线长度和交付地区/现场条件需要销售与技术人员确认。',
    profile: { dailyOutput: '目标产能待确认', intent: '中高', action: '确认产能、产线长度和现场条件', tags: ['机械设备/自动化', '自动化生产线', 'AL-2600', '车间改造', '建议技术沟通'], budget: '待确认' },
    files: commonFiles('yiwu'),
    extractedFields: [['产品名称', '自动化生产线'], ['客户型号', 'AL-2600'], ['产能要求', '目标产能待确认'], ['应用场景', '机械部件装配'], ['关键规格', '产线长度、交付地区/现场条件待确认']],
    matchRows: [
      { id: 'yiwu-line', customerProduct: '自动化生产线', customerModel: 'AL-2600', ourProduct: '自动化生产线基础方案', score: '高', status: '已找到', note: '应用场景匹配，目标产能和线体长度待确认', source: '采购需求.docx · 第1页' },
      { id: 'yiwu-conveyor', customerProduct: '输送模块', customerModel: 'TR-120', ourProduct: '标准输送模块', score: '中', status: '部分匹配', note: '需要结合现有车间接口确认', source: '设备参数表.xlsx · 第3行' },
      { id: 'yiwu-safety', customerProduct: '安全围栏模块', customerModel: '待识别', ourProduct: '暂无直接匹配', score: '—', status: '未找到', note: '建议补充现场尺寸照片', source: '客户现场照片.jpg' },
    ],
    publicCandidates: [
      { image: '候选图', title: '装配线安全围栏模块参考', platform: '1688公开平台', feature: '应用场景相似，尺寸待核验' },
      { image: '候选图', title: '工业生产线防护组件', platform: '公开渠道候选', feature: '结构相似，接口待确认' },
    ],
    analysisAdvice: '建议先确认目标产能、产线长度和交付地区/现场条件，再完成人工报价确认。',
    analysisNote: '当前有1项安全围栏模块需要补充现场尺寸照片。',
  },
};

const foshanCustomer: DemoSalesCustomer = {
  customerId: 'customer-foshan-003',
  name: '佛山某家具制造企业',
  industry: '家具制造',
  region: '广东佛山',
  productId: 'product-furniture-fp980',
  demandProduct: '家具配件喷涂方案',
  model: 'FP-980',
  quoteProduct: '家具配件喷涂方案',
  confirmedNeeds: ['家具金属配件喷涂', '关注产线适配与交付安排'],
  pendingNeeds: ['工件尺寸', '喷涂工艺', '交付周期'],
  currentStage: '需求确认',
  recentAction: 'AI完成基础接待，等待补充需求',
  recentActionTime: '今天 09:20',
  quoteId: 'quote-foshan-003',
  followupId: 'follow-foshan-003',
  standalone: false,
  timeline: [
    { id: 'content-view', time: '今天 08:44', label: '客户查看家具配件喷涂内容' },
    { id: 'customer-inquiry', time: '今天 09:02', label: '客户咨询喷涂工艺与交付安排' },
    { id: 'ai-reception-complete', time: '今天 09:12', label: 'AI完成基础需求收集' },
    { id: 'lead-created', time: '今天 09:20', label: '销售收到新客户线索' },
    { id: 'product-matched', time: '今天 09:26', label: 'AI匹配家具配件喷涂方案' },
    { id: 'quote-created', time: '今天 09:30', label: '创建报价草案 Q-2026-003' },
    { id: 'quote-review', time: '待完成', label: '等待需求补充后进入人工确认' },
    { id: 'quote-confirmed', time: '待完成', label: '报价尚未人工确认' },
    { id: 'quote-sent', time: '待完成', label: '报价尚未发送' },
    { id: 'followup-suggested', time: '今天 16:30', label: '建议补充喷涂工艺与交付需求' },
  ],
  lead: {
    source: '今日头条', intent: '中高', status: 'AI接待中', owner: '待分配', priority: 'B', size: '待补充', website: '待补充',
    needSummary: '家具配件喷涂，关注产线适配与交付安排', budget: '待确认',
    aiReason: 'AI已收集家具配件喷涂基础需求，建议补充工件尺寸、喷涂工艺和交付周期。',
    next: '进入AI智能接待，补充技术确认问题后继续报价草案。',
    script: '您好，已记录您关注家具配件喷涂方案。想再确认工件尺寸、喷涂工艺和期望交付周期，以便进一步核对方案。',
  },
  aiReception: {
    messages: [
      { id: 'foshan-customer-1', from: 'customer', text: '我们主要做家具金属配件，需要一套喷涂方案。' },
      { id: 'foshan-ai-1', from: 'ai', text: '可以先按家具配件喷涂场景整理方案。为了判断 FP-980 的适配范围，需要确认工件尺寸、喷涂工艺和期望交付周期。' },
      { id: 'foshan-customer-2', from: 'customer', text: '目前最关注能否适配现有产线，交付时间也需要进一步确认。' },
      { id: 'foshan-ai-2', from: 'ai', text: '了解，已记录产线适配和交付安排为重点。工件尺寸、喷涂工艺和交付周期仍需补充，我可以先整理需求并安排销售与技术人员沟通。' },
    ],
    quickQuestions: ['FP-980适合家具金属配件吗？', '工件尺寸需要如何提供？', '喷涂工艺需要确认哪些参数？', '能否适配现有产线？', '交付周期如何确认？'],
    defaultReply: '结合当前资料，可以先按家具配件喷涂方案 FP-980 整理。工件尺寸、喷涂工艺和交付周期需要销售与技术人员确认。',
    profile: { dailyOutput: '产量待确认', intent: '中高', action: '补充喷涂工艺并安排技术沟通', tags: ['家具制造', '家具配件喷涂', 'FP-980', '产线适配', '交付待确认'], budget: '待确认' },
    files: commonFiles('foshan'),
    extractedFields: [['产品名称', '家具配件喷涂方案'], ['客户型号', 'FP-980'], ['产能要求', '产量待确认'], ['工艺场景', '家具金属配件喷涂'], ['关键规格', '工件尺寸、喷涂工艺、交付周期待确认']],
    matchRows: [
      { id: 'foshan-spray', customerProduct: '家具配件喷涂方案', customerModel: 'FP-980', ourProduct: '家具配件喷涂方案', score: '高', status: '已找到', note: '场景匹配，喷涂工艺与尺寸待确认', source: '采购需求.docx · 第1页' },
      { id: 'foshan-fixture', customerProduct: '工件夹具模块', customerModel: 'FJ-80', ourProduct: '标准夹具模块', score: '中', status: '部分匹配', note: '需要结合工件尺寸确认', source: '设备参数表.xlsx · 第5行' },
      { id: 'foshan-drying', customerProduct: '辅助烘干模块', customerModel: '待识别', ourProduct: '暂无直接匹配', score: '—', status: '未找到', note: '建议补充工艺温度和现场照片', source: '客户现场照片.jpg' },
    ],
    publicCandidates: [
      { image: '候选图', title: '家具五金喷涂辅助烘干模块参考', platform: '1688公开平台', feature: '应用场景相似，温度范围待核验' },
      { image: '候选图', title: '小型工件烘干设备', platform: '公开渠道候选', feature: '结构相似，工艺参数待确认' },
    ],
    analysisAdvice: '建议先确认工件尺寸、喷涂工艺和交付周期，再推进家具配件喷涂方案。',
    analysisNote: '当前有1项辅助烘干模块需要补充工艺温度和现场照片。',
  },
};

const standaloneCustomer = (
  customerId: string,
  name: string,
  industry: string,
  region: string,
  demandProduct: string,
  model: string,
  quoteProduct: string,
  quoteId: string,
  quoteNumber: string,
  followupId: string,
  pendingNeeds: string[],
  currentStage: SalesStage,
): DemoSalesCustomer => ({
  customerId, name, industry, region, productId: `product-${customerId}`, demandProduct, model, quoteProduct,
  confirmedNeeds: [`已确认${demandProduct}方向`], pendingNeeds, currentStage,
  recentAction: currentStage === '跟进' ? '报价已发送，等待客户反馈' : '技术问题等待人工确认',
  recentActionTime: currentStage === '跟进' ? '今天 11:40' : '今天 11:05',
  quoteId, followupId, standalone: true,
  timeline: [
    { id: 'content-view', time: '独立记录', label: '前置线索未纳入核心演示链路' },
    { id: 'customer-inquiry', time: '独立记录', label: '客户咨询记录（演示数据）' },
    { id: 'ai-reception-complete', time: '独立记录', label: 'AI基础接待（演示数据）' },
    { id: 'lead-created', time: '独立记录', label: '独立演示记录' },
    { id: 'product-matched', time: '独立记录', label: '产品初步匹配（演示数据）' },
    { id: 'quote-created', time: currentStage === '跟进' ? '昨天 14:10' : '上周五 14:08', label: `创建${quoteNumber}` },
    { id: 'quote-review', time: '独立记录', label: '人工确认状态未纳入核心链路' },
    { id: 'quote-confirmed', time: '独立记录', label: '独立演示状态' },
    { id: 'quote-sent', time: currentStage === '跟进' ? '昨天 16:20' : '未发送', label: currentStage === '跟进' ? '报价已发送（演示状态）' : '报价未发送' },
    { id: 'followup-suggested', time: currentStage === '跟进' ? '明天 10:00' : '今天 17:00', label: currentStage === '跟进' ? '建议等待客户反馈' : '建议人工介入' },
  ],
  lead: { source: '独立记录', intent: '待确认', status: '独立演示记录', owner: '待分配', priority: 'C', size: '待补充', website: '待补充', needSummary: `${demandProduct}，需求待补充`, budget: '待确认', aiReason: '该客户为独立演示记录，不代表完整销售链路。', next: '由销售人工确认下一步。', script: '请结合当前演示记录进一步确认客户需求。' },
  aiReception: {
    messages: [], quickQuestions: [], defaultReply: '',
    profile: { dailyOutput: '待确认', intent: '待确认', action: '人工确认', tags: ['独立演示记录'], budget: '待确认' },
    files: [], extractedFields: [], matchRows: [], publicCandidates: [], analysisAdvice: '', analysisNote: '',
  },
});

const jiaxingCustomer = standaloneCustomer('customer-jiaxing-004', '嘉兴某金属制品企业', '金属制品', '浙江嘉兴', '金属配件喷涂', 'MP-146', '金属配件喷涂方案', 'quote-jiaxing-004', 'Q-2026-004', 'follow-jiaxing-004', ['工件尺寸', '现有设备接口', '付款方式'], '跟进');
const ningboCustomer = standaloneCustomer('customer-ningbo-005', '宁波某装备企业', '装备制造', '浙江宁波', '自动化设备配套', 'AU-198', '自动化设备配套方案', 'quote-ningbo-005', 'Q-2026-005', 'follow-ningbo-005', ['设备接口', '现场空间', '技术可行性'], '需求确认');

export const coreDemoSalesCustomers = [jinhuaCustomer, yiwuCustomer, foshanCustomer];
export const allDemoSalesCustomers = [...coreDemoSalesCustomers, jiaxingCustomer, ningboCustomer];

export const demoQuoteRecords: DemoQuoteRecord[] = [
  { id: 'quote-jinhua-001', number: 'Q-2026-001', customerId: jinhuaCustomer.customerId, productId: jinhuaCustomer.productId, status: '已发送', amount: 128000, valid: '30天', action: '报价已发送 · 演示状态', createdEventId: 'quote-created', actionEventId: 'quote-sent', productName: jinhuaCustomer.quoteProduct, model: jinhuaCustomer.model, configuration: '标准喷涂主机 + 输送模块 + 基础控制系统（仅演示配置）', quantity: 1, delivery: '待人工确认', payment: '待人工确认', service: '三年设备质保，具体以正式合同为准', notes: '正式配置、价格和交期以双方确认结果为准。' },
  { id: 'quote-yiwu-002', number: 'Q-2026-002', customerId: yiwuCustomer.customerId, productId: yiwuCustomer.productId, status: '待人工确认', amount: 268000, valid: '30天', action: 'AI检查完成', createdEventId: 'quote-created', actionEventId: 'quote-review', productName: yiwuCustomer.quoteProduct, model: yiwuCustomer.model, configuration: '基础产线模块 + 输送模块 + 控制系统（仅演示配置）', quantity: 1, delivery: '待人工确认', payment: '待人工确认', service: '具体质保与服务以正式合同为准', notes: '正式配置、价格和交期以双方确认结果为准。' },
  { id: 'quote-foshan-003', number: 'Q-2026-003', customerId: foshanCustomer.customerId, productId: foshanCustomer.productId, status: '草稿', amount: 98000, valid: '30天', action: '等待销售编辑', createdEventId: 'quote-created', actionEventId: 'quote-created', productName: foshanCustomer.quoteProduct, model: foshanCustomer.model, configuration: '喷涂主机 + 基础夹具模块（仅演示配置）', quantity: 1, delivery: '待人工确认', payment: '待人工确认', service: '具体质保与服务以正式合同为准', notes: '正式配置、价格和交期以双方确认结果为准。' },
  { id: 'quote-jiaxing-004', number: 'Q-2026-004', customerId: jiaxingCustomer.customerId, productId: jiaxingCustomer.productId, status: '已发送', amount: 146000, valid: '2天', action: '已发送 · 等待客户回复', createdEventId: 'quote-created', actionEventId: 'quote-sent', productName: jiaxingCustomer.quoteProduct, model: jiaxingCustomer.model, configuration: '基础配置（仅演示配置）', quantity: 1, delivery: '待人工确认', payment: '待人工确认', service: '具体质保与服务以正式合同为准', notes: '独立演示记录。' },
  { id: 'quote-ningbo-005', number: 'Q-2026-005', customerId: ningboCustomer.customerId, productId: ningboCustomer.productId, status: '已失效', amount: 198000, valid: '已失效', action: '超过报价有效期', createdEventId: 'quote-created', actionEventId: 'quote-created', productName: ningboCustomer.quoteProduct, model: ningboCustomer.model, configuration: '基础配置（仅演示配置）', quantity: 1, delivery: '待人工确认', payment: '待人工确认', service: '具体质保与服务以正式合同为准', notes: '独立演示记录。' },
];

export const demoFollowupTasks: DemoFollowupTask[] = [
  { id: 'follow-jinhua-001', customerId: jinhuaCustomer.customerId, priority: 'A', priorityLabel: '高优先', status: '今日待跟进', currentState: '报价已发送', stage: '跟进', reason: '报价已发送，工件尺寸、喷涂材料和现场产线条件仍待确认，建议今天完成技术信息补充。', suggestedTime: '今天 14:00', channel: '微信 + 电话', duration: '2分钟', recentEventId: 'quote-sent', rankReasons: ['今天11:40已发送报价', '三项现场参数仍待确认', '今天14:00进入建议跟进时间'], goal: '确认工件尺寸、喷涂材料和现场产线条件。', avoid: '不要直接催促下单，也不要在现场参数未确认前承诺正式配置。', next: '客户确认参数后，返回报价管理核对正式配置与交期。', scripts: { 微信: '您好，今天给您发的自动喷涂设备方案您应该收到了。这边还想确认工件尺寸、喷涂材料和现场产线条件，确认后可以把 SP-3000 的配置核得更准确。', 电话: '您好，我是跟进自动喷涂设备 SP-3000 方案的。想占用您几分钟确认工件尺寸、喷涂材料和现场产线条件，避免后续配置与现场需求有偏差。', 短信: '您好，关于自动喷涂设备 SP-3000 方案，还需确认工件尺寸、喷涂材料和现场产线条件，方便时回复即可。' } },
  { id: 'follow-yiwu-002', customerId: yiwuCustomer.customerId, priority: 'B', priorityLabel: '中高优先', status: '今日待跟进', currentState: '报价待人工确认', stage: '报价', reason: '自动化生产线报价草案已生成，目标产能、产线长度和交付地区/现场条件仍待补充。', suggestedTime: '今天 15:30', channel: '电话', duration: '5分钟', recentEventId: 'quote-review', rankReasons: ['AL-2600基础方案已生成', '三项产线条件待补充', '报价尚未发送'], goal: '补充目标产能、产线长度和交付地区/现场条件。', avoid: '不要把未确认的产线配置表述为正式方案，也不要暗示报价已经发送。', next: '信息补充后由销售完成人工报价确认。', scripts: { 微信: '您好，自动化生产线 AL-2600 基础方案已经整理出来。正式确认前还需要目标产能、产线长度和交付地区/现场条件，方便时请补充一下。', 电话: '您好，想跟您确认自动化生产线的目标产能、产线长度和交付地区/现场条件，这些信息会直接影响 AL-2600 方案的人工确认。', 短信: '您好，AL-2600 基础方案还需确认目标产能、产线长度和交付地区/现场条件，方便时回复即可。' } },
  { id: 'follow-foshan-003', customerId: foshanCustomer.customerId, priority: 'B', priorityLabel: '中高优先', status: '今日待跟进', currentState: '需求待确认', stage: '需求确认', reason: 'AI已收集家具配件喷涂需求，工件尺寸、喷涂工艺和交付周期仍待补充。', suggestedTime: '今天 16:30', channel: '微信', duration: '2分钟', recentEventId: 'lead-created', rankReasons: ['AI已完成基础接待', '家具配件喷涂方向明确', '三项关键信息待补充'], goal: '补充工件尺寸、喷涂工艺和交付周期。', avoid: '不要重复询问已确认的家具金属配件应用场景。', next: '需求补充后，继续完善 FP-980 报价草案。', scripts: { 微信: '您好，前面已记录您关注家具配件喷涂方案。为了继续完善 FP-980 草案，想再确认工件尺寸、喷涂工艺和期望交付周期。', 电话: '您好，想进一步确认家具配件喷涂的工件尺寸、喷涂工艺和交付周期，确认后再继续完善 FP-980 草案。', 短信: '您好，家具配件喷涂方案还需确认工件尺寸、喷涂工艺和交付周期，方便时回复即可。' } },
  { id: 'follow-jiaxing-004', customerId: jiaxingCustomer.customerId, priority: 'C', priorityLabel: '培育', status: '等待客户', currentState: '报价已发送', stage: '跟进', reason: '报价已经发送，当前没有新的客户反馈，建议等待后再做低频触达。', suggestedTime: '明天 10:00', channel: '微信', duration: '2分钟', recentEventId: 'quote-sent', rankReasons: ['报价已发送', '当前没有新的客户反馈', '独立演示记录'], goal: '等待客户反馈，不重复发送相同内容。', avoid: '今天不建议再次主动催问报价结果。', next: '客户回复后再确认参数，必要时返回报价管理调整方案。', scripts: { 微信: '您好，前面给您的金属配件喷涂方案可以先结合现场情况看看，有补充信息时随时回复即可。', 电话: '您好，想确认一下前面发送的方案是否需要补充现场信息，如果仍在内部评估，我这边可以先等您反馈。', 短信: '您好，金属配件喷涂方案已发您参考，有补充信息时随时回复即可。' } },
  { id: 'follow-ningbo-005', customerId: ningboCustomer.customerId, priority: 'B', priorityLabel: '中高优先', status: '需要人工介入', currentState: '技术问题待确认', stage: '需求确认', reason: '客户提出需要技术判断的设备接口问题，建议销售和技术人员共同确认。', suggestedTime: '今天 17:00', channel: '电话', duration: '8分钟', recentEventId: 'customer-inquiry', rankReasons: ['客户提出专业技术问题', '需要人工判断', '独立演示记录'], goal: '整理现场接口资料并安排技术人员沟通。', avoid: '不要由AI直接承诺技术可行性或交付周期。', next: '技术确认后，再回到报价管理更新方案。', scripts: { 微信: '您好，您提到的设备接口需要结合现场条件进一步确认，我先整理信息后安排销售和技术人员沟通。', 电话: '您好，关于设备接口的问题需要结合现场条件判断，我先确认基础信息，再安排技术人员进一步沟通。', 短信: '您好，设备接口问题需要销售和技术人员结合现场条件确认，我这边先整理信息。' } },
];

const customerMap = new Map(allDemoSalesCustomers.map((customer) => [customer.customerId, customer]));
const quoteMap = new Map(demoQuoteRecords.map((quote) => [quote.id, quote]));
const followupMap = new Map(demoFollowupTasks.map((task) => [task.id, task]));

export const primaryDemoCustomerId = jinhuaCustomer.customerId;

export function getDemoSalesCustomer(customerId: string | undefined) {
  return customerMap.get(customerId ?? '') ?? jinhuaCustomer;
}

export function getDemoQuote(quoteId: string | undefined) {
  return quoteMap.get(quoteId ?? '') ?? quoteMap.get(jinhuaCustomer.quoteId)!;
}

export function getDemoFollowup(followupId: string | undefined) {
  return followupMap.get(followupId ?? '') ?? followupMap.get(jinhuaCustomer.followupId)!;
}

export function getTimelineEvent(customer: DemoSalesCustomer, eventId: DemoTimelineEventId) {
  return customer.timeline.find((event) => event.id === eventId)
    ?? customer.timeline.find((event) => event.id === 'content-view')
    ?? { id: 'content-view', time: '待确认', label: '暂无演示记录' };
}

export function getSalesContextForCustomer(customerId: string) {
  const customer = getDemoSalesCustomer(customerId);
  return { currentCustomerId: customer.customerId, currentQuoteId: customer.quoteId, currentFollowupId: customer.followupId };
}
