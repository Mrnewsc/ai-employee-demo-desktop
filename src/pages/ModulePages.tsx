import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Activity, AlertTriangle, ArrowRight, BarChart3, CalendarDays, Check, CheckCircle2, Clock3, Copy, Download, FileDown, FileText, Filter, Gauge, KeyRound, LayoutList, MessageCircle, MessageSquare, MoreHorizontal, PackageCheck, Pause, Phone, Play, Plus, RotateCcw, Save, Send, Settings2, ShieldCheck, Sparkles, Target, Timer, UserRound, X } from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { appConfig, contractNote, platformNames, productDeliverables } from '../config';
import {
  coreDemoSalesCustomers,
  demoFollowupTasks,
  demoQuoteRecords,
  getDemoSalesCustomer,
  getSalesContextForCustomer,
  getTimelineEvent,
  primaryDemoCustomerId,
  type DemoFollowupChannel,
  type DemoFollowupStatus,
  type DemoQuoteStatus,
  type SalesStage,
} from '../demo/demoSalesFlow';
import { useApp } from '../stores/AppStore';
import { DemoNote, PageHeader, StatusDot, Surface } from '../components/UI';

export function PublishingCenter() {
  const { publishRecords, setPublishRecords, content, notify } = useApp();
  const [running, setRunning] = useState(false);
  const publish = () => {
    setRunning(true);
    setPublishRecords(publishRecords.map((item) => ({ ...item, status: '适配中', detail: '内容格式适配中' })));
    publishRecords.forEach((item, index) => window.setTimeout(() => setPublishRecords((current) => current.map((record, recordIndex) => recordIndex === index ? { ...record, status: '发布成功', detail: index === 0 ? '等待平台收录' : '内容上传完成', published: record.published + 1 } : record)), 700 + index * 380));
    window.setTimeout(() => { setRunning(false); notify('五个平台发布流程演示完成'); }, 2700);
  };
  return <>
    <PageHeader eyebrow="DISTRIBUTION CONTROL" title="平台发布" description="一次配置，多平台持续运营。每个平台独立适配、发布和记录状态。" actions={<><DemoNote /><button className="btn btn-primary" onClick={publish} disabled={running}><Send size={15} />{running ? '正在发布...' : '一键发布'}</button></>} />
    <Surface title={content.title} kicker="当前待发布内容"><div className="surface-subtle" style={{ padding: 14, color: '#b7c5da', fontSize: 12, lineHeight: 1.7 }}>{content.summary}</div><div className="platform-grid" style={{ marginTop: 18 }}>{publishRecords.map((record) => <PlatformCard key={record.platform} {...record} />)}</div><div className="tiny-note" style={{ marginTop: 18 }}>当前为功能演示模式，正式交付后根据客户账号及平台规则进行配置。</div></Surface>
  </>;
}

function PlatformCard({ platform, status, detail, published }: { platform: string; status: string; detail: string; published: number }) {
  const running = status === '适配中';
  const success = status === '发布成功';
  return <motion.div className="platform-card" animate={{ borderColor: success ? 'rgba(93,204,164,.38)' : running ? 'rgba(90,158,255,.42)' : 'rgba(153,180,228,.12)' }}><div className="platform-mark">{platform.slice(0, 2)}</div><h3>{platform}</h3><div className={`platform-state ${success ? 'state-success' : running ? 'state-running' : 'state-waiting'}`}>{detail}</div><div className="state-row"><StatusDot active={success} />{status}</div><div className="tiny-note" style={{ marginTop: 17 }}>今日发布 {published} 条</div></motion.div>;
}

export function GeoKeywords() {
  const { company, notify } = useApp();
  const product = company.products.split(/[、,，]/)[0] || company.products;
  const region = company.regions.split(/[、,，]/)[0] || '本地';
  const keywords = useMemo(() => [
    [product, '核心产品词'], [`${product}厂家`, '厂家型关键词'], [`${region}${product}厂家`, '地区关键词'], [`${company.targetCustomers.split(/[、,，]/)[0]}${product}`, '长尾采购词'], [`${product}怎么选`, '问题型关键词'], [`${product}采购注意事项`, '问题型关键词'], [`${product}和人工对比`, '对比型关键词'], [`${product}价格`, '价格型关键词'], [`${product}应用场景`, '应用场景词'],
  ], [company, product, region]);
  const [selected, setSelected] = useState(2);
  return <>
    <PageHeader eyebrow="GEO DISCOVERY LAYER" title="让企业进入AI搜索和AI问答场景" description="围绕客户真实问题建立内容入口，提升企业信息覆盖机会。" actions={<><DemoNote text="不承诺排名与询盘" /><button className="btn btn-primary" onClick={() => notify('已生成一组新的关联关键词')}><Sparkles size={15} />生成更多关键词</button></>} />
    <div className="surface" style={{ padding: 20, marginBottom: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}><div><div className="eyebrow">QUARTERLY LAYOUT</div><div style={{ marginTop: 8, color: '#f1f6ff', fontSize: 22 }}>首个季度{appConfig.geoQuarterKeywords}个GEO关键词及关联词布局</div><div className="tiny-note" style={{ marginTop: 6 }}>关键词展示情况受平台收录、行业竞争、内容质量及算法规则等因素影响。</div></div><div style={{ textAlign: 'right' }}><div className="price-number" style={{ fontSize: 38, margin: 0 }}>286 <small>/ {appConfig.geoQuarterKeywords}</small></div><div className="tiny-note">当前进度 · 演示数据</div></div></div>
    <div className="geo-grid"><Surface title="关键词树" kicker="按意图分组"><div className="tree">{['核心产品词', '长尾采购词', '地区关键词', '问题型关键词', '对比型关键词', '厂家型关键词', '价格型关键词', '应用场景词'].map((item, index) => <button className={`tree-item ${index === 0 ? 'active' : ''}`} key={item}>{item}<span>{index + 3}</span></button>)}</div></Surface><Surface title="关键词列表" kicker={`${company.companyName} · 演示数据`}><div className="keyword-list">{keywords.map(([keyword, type], index) => <button className={`keyword-row ${selected === index ? 'active' : ''}`} key={keyword} onClick={() => setSelected(index)}><span>{keyword}</span><span className="keyword-type">{type}</span><span className="status-pill">已匹配</span></button>)}</div><div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}><button className="btn" onClick={() => notify('已生成对应内容任务')}><FileText size={14} />生成对应内容</button><button className="btn" onClick={() => notify('关键词已加入布局计划')}><Plus size={14} />加入布局计划</button><button className="btn" onClick={() => notify('关键词列表已准备导出')}><Download size={14} />导出关键词列表</button></div></Surface><Surface title="关键词详情" kicker="AI内容匹配建议"><div className="eyebrow" style={{ letterSpacing: '.03em', textTransform: 'none' }}>{keywords[selected]?.[0]}</div>{[['对应内容', '采购指南 · 自动喷涂设备选型'], ['客户搜索意图', '寻找供应商与配置建议'], ['建议回答结构', '工况 → 配置 → 交付 → 服务'], ['目标客户', company.targetCustomers.split(/[、,，]/)[0]], ['推荐发布平台', platformNames.slice(0, 3).join('、')]].map(([label, value]) => <div className="profile-item" key={label}><span>{label}</span><span>{value}</span></div>)}</Surface></div>
  </>;
}


const leadDetails = coreDemoSalesCustomers.map((customer) => {
  const leadEvent = getTimelineEvent(customer, 'lead-created');
  return {
  customerId: customer.customerId,
  name: customer.name,
  source: customer.lead.source,
  region: customer.region,
  product: customer.demandProduct,
  action: leadEvent.label,
  intent: customer.lead.intent,
  status: customer.lead.status,
  owner: customer.lead.owner,
  priority: customer.lead.priority,
  recent: `${leadEvent.label} · ${leadEvent.time}`,
  lastContact: leadEvent.time,
  aiReason: customer.lead.aiReason,
  industry: customer.industry,
  size: customer.lead.size,
  website: customer.lead.website,
  need: customer.lead.needSummary,
  budget: customer.lead.budget,
  stage: customer.lead.status === '待报价' ? '需求已初步确认' : customer.lead.status,
  confirmed: customer.confirmedNeeds.join('；'),
  pending: customer.pendingNeeds.join('、'),
  next: customer.lead.next,
  script: customer.lead.script,
  quoteId: customer.quoteId,
  followupId: customer.followupId,
  timeline: customer.timeline.slice(0, 4).map((event) => [event.time, event.label] as const),
  };
});

export function Leads() {
  const { demoSales, navigate, notify, currentCustomerId, setSalesCustomer, updateDemoCustomer, updateDemoFollowup, updateDemoQuote } = useApp();
  const initialCustomerId = leadDetails.some((lead) => lead.customerId === currentCustomerId) ? currentCustomerId : primaryDemoCustomerId;
  const [selectedId, setSelectedId] = useState(initialCustomerId);
  const [filter, setFilter] = useState('全部');
  const [sortBy, setSortBy] = useState('AI推荐优先');
  const [aiOnly, setAiOnly] = useState(false);
  const runtimeLeads = useMemo(() => leadDetails.map((lead) => {
    const runtime = demoSales.customers[lead.customerId];
    return { ...lead, status: runtime?.leadStatus ?? '待联系', stage: runtime?.salesStage ?? '客户发现' };
  }), [demoSales.customers]);
  const selected = runtimeLeads.find((lead) => lead.customerId === selectedId) ?? runtimeLeads.find((lead) => lead.customerId === primaryDemoCustomerId)!;
  const priorityOrder: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 };

  useEffect(() => {
    if (leadDetails.some((lead) => lead.customerId === currentCustomerId)) setSelectedId(currentCustomerId);
  }, [currentCustomerId]);
  const visibleLeads = useMemo(() => {
    const filtered = runtimeLeads.filter((lead) => {
      if (aiOnly && !['A', 'B'].includes(lead.priority)) return false;
      if (filter === '高意向') return ['高', '中高'].includes(lead.intent);
      if (filter === '待联系') return ['待联系', '需求确认中', '待报价'].includes(lead.status);
      if (filter === '已接待') return ['需求确认中', '待报价'].includes(lead.status);
      if (filter === '已报价') return ['报价处理中', '报价已发送', '今日跟进', '等待客户'].includes(lead.status);
      if (filter === '培育中') return ['C', 'D'].includes(lead.priority);
      return true;
    });
    return [...filtered].sort((a, b) => {
      if (sortBy === '最近互动') return a.lastContact < b.lastContact ? 1 : -1;
      if (sortBy === '最近新增') return a.priority === 'A' ? -1 : 1;
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }, [aiOnly, filter, runtimeLeads, sortBy]);

  const selectFilter = (value: string) => {
    setFilter(value);
    setAiOnly(false);
  };

  const showRecommendations = () => {
    setAiOnly(true);
    setFilter('全部');
    setSortBy('AI推荐优先');
    setSelectedId(primaryDemoCustomerId);
    setSalesCustomer(primaryDemoCustomerId);
  };

  const selectLead = (customerId: string) => {
    setSelectedId(customerId);
    setSalesCustomer(customerId);
  };

  const openReception = () => {
    notify('已带入当前演示客户上下文');
    navigate('reception', getSalesContextForCustomer(selected.customerId));
  };

  const addFollowup = () => {
    updateDemoFollowup(selected.followupId, { status: '今日待跟进' });
    updateDemoCustomer(selected.customerId, { leadStatus: '今日跟进', salesStage: '跟进' });
    notify(`${selected.name}已加入今日跟进`);
  };

  const createQuote = () => {
    updateDemoQuote(selected.quoteId, '草稿');
    updateDemoCustomer(selected.customerId, { leadStatus: '报价处理中', salesStage: '报价' });
    notify(`已带入${selected.name}和${selected.product}，打开报价管理`);
    navigate('quotes', getSalesContextForCustomer(selected.customerId));
  };

  return <>
    <PageHeader eyebrow="LEAD INTELLIGENCE" title="客户线索" description="AI持续识别客户行为，帮助销售优先处理最值得跟进的机会。" actions={<DemoNote />} />
    <div className="lead-summary-grid">
      {[['今日新增线索', '8', '今日新增 · 演示数据'], ['高意向客户', '2', '建议优先处理 · 演示数据'], ['今日建议联系', '3', 'AI已完成优先级判断 · 演示数据'], ['待销售处理', '6', '等待进一步处理 · 演示数据']].map(([label, value, foot]) => <div className="lead-summary-item" key={label}><span>{label}</span><strong>{value}</strong><small>{foot}</small></div>)}
    </div>
    <Surface className="lead-recommendation-panel">
      <div className="lead-recommendation-header"><div><div className="lead-section-title"><Sparkles size={16} />AI今日推荐</div><div className="surface-kicker">今天建议优先联系3家客户 · 演示数据</div></div><button className={`btn ${aiOnly ? 'btn-quiet' : 'btn-primary'}`} onClick={() => aiOnly ? setAiOnly(false) : showRecommendations()}>{aiOnly ? '查看全部线索' : '查看全部推荐'}<ArrowRight size={14} /></button></div>
      <div className="lead-recommendation-list">{runtimeLeads.map((lead) => <button className={`lead-recommendation ${selected.customerId === lead.customerId ? 'active' : ''}`} key={lead.customerId} onClick={() => selectLead(lead.customerId)}><span className={`lead-priority priority-${lead.priority.toLowerCase()}`}>{lead.priority} / {lead.intent}意向</span><span className="lead-recommendation-copy"><strong>{lead.name} <em>演示客户</em></strong><small>{lead.region} · {lead.product}</small><span>AI推荐：{lead.aiReason}</span></span><ArrowRight size={15} /></button>)}</div>
    </Surface>
    <div className="leads-workbench-layout">
      <Surface className="lead-list-panel">
        <div className="lead-list-header"><div><div className="surface-title">客户线索列表</div><div className="surface-kicker">按AI推荐优先级排列 · 演示数据</div></div><div className="lead-list-count">{visibleLeads.length} 条</div></div>
        <div className="lead-filter-row"><div className="lead-filters">{['全部', '高意向', '待联系', '已接待', '已报价', '培育中'].map((item) => <button className={filter === item && !aiOnly ? 'active' : ''} key={item} onClick={() => selectFilter(item)}>{item}</button>)}</div><select className="select lead-sort" value={sortBy} onChange={(event) => setSortBy(event.target.value)} aria-label="线索排序"><option>AI推荐优先</option><option>最近互动</option><option>意向等级</option><option>最近新增</option></select></div>
        {aiOnly && <div className="lead-ai-only-note"><Sparkles size={13} />当前仅显示AI推荐优先客户</div>}
        <div className="lead-action-list">{visibleLeads.map((lead) => <button className={`lead-action-item ${selected.customerId === lead.customerId ? 'active' : ''}`} key={lead.customerId} onClick={() => selectLead(lead.customerId)}><div className="lead-action-top"><span className={`lead-priority priority-${lead.priority.toLowerCase()}`}>{lead.priority}</span><strong>{lead.name}</strong><span className={`lead-intent ${lead.priority === 'A' ? 'high' : 'mid'}`}>{lead.intent}意向</span></div><div className="lead-action-meta">{lead.region} · {lead.product}</div><div className="lead-action-behavior"><span>最近行为：</span>{lead.recent}</div><div className="lead-action-reason"><Sparkles size={12} /><span>AI建议：{lead.aiReason}</span></div><div className="lead-action-bottom"><span className={`lead-status status-${lead.status === '今日跟进' ? 'active' : ['待报价', '报价处理中'].includes(lead.status) ? 'attention' : 'waiting'}`}><i />{lead.status}</span><span>{lead.source}</span></div></button>)}</div>
        {!visibleLeads.length && <div className="lead-empty-state"><Target size={22} /><strong>当前筛选下暂无线索</strong><span>可以切换筛选条件查看全部客户。</span></div>}
      </Surface>
      <Surface className="lead-detail-panel">
        <div className="lead-detail-header"><div><div className="eyebrow">AI PRIORITY / LEAD DETAIL</div><h2>{selected.name}</h2><span className="demo-client-tag">演示客户</span></div><div className={`lead-priority lead-detail-priority priority-${selected.priority.toLowerCase()}`}>{selected.priority} / {selected.intent}意向</div></div>
        <div className="lead-detail-scroll">
          <div className="lead-detail-section"><div className="lead-detail-section-title">企业信息</div><div className="lead-detail-grid">{[['企业名称', selected.name], ['行业', selected.industry], ['地区', selected.region], ['主营产品', selected.product], ['企业规模', selected.size], ['官网', selected.website]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value || '待补充'}</strong></div>)}</div></div>
          <div className="lead-detail-section"><div className="lead-detail-section-title">客户需求</div><div className="lead-detail-grid"><div><span>关注产品</span><strong>{selected.product}</strong></div><div><span>当前需求</span><strong>{selected.need}</strong></div><div><span>预算</span><strong>{selected.budget}</strong></div><div><span>当前阶段</span><strong>{selected.stage}</strong></div><div className="wide"><span>已确认信息</span><strong>{selected.confirmed}</strong></div><div className="wide"><span>待确认信息</span><strong>{selected.pending}</strong></div></div></div>
          <div className="lead-detail-section"><div className="lead-detail-section-title">行为轨迹 <small>演示数据</small></div><div className="lead-behavior-timeline">{selected.timeline.map(([time, event]) => <div className="lead-timeline-item" key={`${time}-${event}`}><span className="lead-timeline-dot" /><time>{time}</time><strong>{event}</strong></div>)}</div></div>
          <div className="lead-detail-section lead-ai-judgment"><div className="lead-detail-section-title"><Sparkles size={14} />AI判断</div><div className="lead-judgment-highlight"><span>推荐原因</span><strong>{selected.aiReason}</strong></div><div className="lead-judgment-row"><span>意向等级</span><strong>{selected.intent}</strong></div><div className="lead-judgment-row"><span>关键待确认问题</span><strong>{selected.pending}</strong></div><div className="lead-judgment-row"><span>下一步建议</span><strong>{selected.next}</strong></div></div>
          <div className="lead-detail-section lead-script"><div className="lead-detail-section-title">销售建议话术</div><p>{selected.script}</p><button className="btn btn-quiet" onClick={() => notify('销售建议话术已复制到本地演示剪贴板')}><FileText size={13} />复制话术</button></div>
        </div>
        <div className="lead-detail-actions"><button className="btn btn-primary" onClick={openReception}><ArrowRight size={14} />进入AI智能接待</button><button className="btn" onClick={addFollowup}><Clock3 size={14} />{selected.status === '今日跟进' ? '已加入今日跟进' : '加入今日跟进'}</button><button className="btn" onClick={createQuote}><PackageCheck size={14} />创建报价</button></div>
      </Surface>
    </div>
  </>;
}

type QuoteStatus = DemoQuoteStatus;

type QuoteRecord = {
  id: string;
  number: string;
  customerId: string;
  customer: string;
  status: QuoteStatus;
  product: string;
  amount: number;
  valid: string;
  action: string;
  createdTime: string;
  actionTime: string;
  industry: string;
  region: string;
  demand: string;
  demandProduct: string;
  confirmedNeeds: string[];
  pending: string[];
  model: string;
  configuration: string;
  quantity: number;
  delivery: string;
  payment: string;
  service: string;
  notes: string;
  standalone: boolean;
};

type QuoteDraft = {
  productName: string;
  model: string;
  configuration: string;
  quantity: number;
  unitPrice: number;
  validPeriod: string;
  delivery: string;
  payment: string;
  service: string;
  notes: string;
  explanation: string;
};

const quoteRecords: QuoteRecord[] = demoQuoteRecords.map((quote) => {
  const customer = getDemoSalesCustomer(quote.customerId);
  return {
    id: quote.id,
    number: quote.number,
    customerId: customer.customerId,
    customer: customer.name,
    status: quote.status,
    product: quote.productName,
    amount: quote.amount,
    valid: quote.valid,
    action: quote.action,
    createdTime: getTimelineEvent(customer, quote.createdEventId).time,
    actionTime: getTimelineEvent(customer, quote.actionEventId).time,
    industry: customer.industry,
    region: customer.region,
    demand: customer.lead.needSummary,
    demandProduct: customer.demandProduct,
    confirmedNeeds: customer.confirmedNeeds,
    pending: customer.pendingNeeds,
    model: quote.model,
    configuration: quote.configuration,
    quantity: quote.quantity,
    delivery: quote.delivery,
    payment: quote.payment,
    service: quote.service,
    notes: quote.notes,
    standalone: customer.standalone,
  };
});

const quoteDraftFor = (quote: QuoteRecord): QuoteDraft => ({
  productName: quote.product,
  model: quote.model,
  configuration: quote.configuration,
  quantity: quote.quantity,
  unitPrice: quote.amount,
  validPeriod: quote.valid,
  delivery: quote.delivery,
  payment: quote.payment,
  service: quote.service,
  notes: quote.notes,
  explanation: `根据您目前提供的信息，我们已初步匹配${quote.product}。\n\n当前已确认：${quote.confirmedNeeds.join('；')}。\n\n正式设备规格仍需确认${quote.pending.join('、')}。\n\n最终配置、价格和交期以双方确认结果为准。`,
});

const quoteStatusClass = (status: QuoteStatus) => ({
  草稿: 'draft',
  待人工确认: 'review',
  已确认待发送: 'confirmed',
  已发送: 'sent',
  待跟进: 'followup',
  已失效: 'expired',
}[status]);

const quoteNextAction = (status: QuoteStatus) => ({
  草稿: '下一步：完善产品方案与报价条件',
  待人工确认: '下一步：确认配置与报价条件',
  已确认待发送: '下一步：查看发送预览',
  已发送: '下一步：等待回复并跟进',
  待跟进: '下一步：联系客户确认反馈',
  已失效: '下一步：如需继续，复制为新草稿',
}[status]);

const quoteActionFor = (quote: QuoteRecord, status: QuoteStatus) => {
  const customer = getDemoSalesCustomer(quote.customerId);
  const actionByStatus: Record<QuoteStatus, { label: string; event: Parameters<typeof getTimelineEvent>[1] }> = {
    草稿: { label: '报价草案已创建', event: 'quote-created' },
    待人工确认: { label: 'AI检查完成，等待人工确认', event: 'quote-review' },
    已确认待发送: { label: '销售已完成人工确认', event: 'quote-confirmed' },
    已发送: { label: '报价已发送 · 演示状态', event: 'quote-sent' },
    待跟进: { label: '已加入销售跟进', event: 'followup-suggested' },
    已失效: { label: '超过报价有效期', event: 'quote-created' },
  };
  const action = actionByStatus[status];
  const eventTime = getTimelineEvent(customer, action.event).time;
  return { label: action.label, time: ['待完成', '未发送'].includes(eventTime) ? '本次演示' : eventTime };
};

export function Quotations() {
  const { demoSales, navigate, notify, currentQuoteId, realQuoteDraft, setSalesCustomer, updateDemoCustomer, updateDemoFollowup, updateDemoQuote } = useApp();
  const primaryQuoteId = getDemoSalesCustomer(primaryDemoCustomerId).quoteId;
  const initialQuote = quoteRecords.find((quote) => quote.id === currentQuoteId) ?? quoteRecords.find((quote) => quote.id === primaryQuoteId)!;
  const [selectedId, setSelectedId] = useState(initialQuote.id);
  const [filter, setFilter] = useState('全部');
  const [sortBy, setSortBy] = useState('待处理优先');
  const [draft, setDraft] = useState<QuoteDraft>(() => quoteDraftFor(initialQuote));
  const [draftDirty, setDraftDirty] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const detailScrollRef = useRef<HTMLDivElement>(null);
  const appliedAnalysisJobRef = useRef<string | null>(null);

  const selected = quoteRecords.find((quote) => quote.id === selectedId) ?? quoteRecords.find((quote) => quote.id === primaryQuoteId)!;
  const selectedStatus = demoSales.quotes[selected.id]?.status ?? selected.status;
  const total = Math.max(0, Number(draft.quantity) || 0) * Math.max(0, Number(draft.unitPrice) || 0);
  const isConfirmed = selectedStatus === '已确认待发送';
  const canSend = isConfirmed;
  const isSent = selectedStatus === '已发送' || selectedStatus === '待跟进';
  const statusPriority: Record<QuoteStatus, number> = { 待人工确认: 0, 草稿: 1, 已确认待发送: 2, 待跟进: 3, 已发送: 4, 已失效: 5 };

  useEffect(() => {
    detailScrollRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [selectedId]);

  useEffect(() => {
    const contextualQuote = quoteRecords.find((quote) => quote.id === currentQuoteId);
    if (!contextualQuote || contextualQuote.id === selectedId) return;
    setSelectedId(contextualQuote.id);
    setDraft(quoteDraftFor(contextualQuote));
    setDraftDirty(false);
    setConfirmOpen(false);
    setPreviewOpen(false);
  }, [currentQuoteId, selectedId]);

  useEffect(() => {
    if (!realQuoteDraft || realQuoteDraft.quoteId !== selected.id || appliedAnalysisJobRef.current === realQuoteDraft.sourceAnalysisJobId) return;
    const quantity = realQuoteDraft.items.reduce((sum, item) => sum + (item.quantity ?? 1), 0);
    setDraft((current) => ({
      ...current,
      productName: realQuoteDraft.items.map((item) => item.productName).join('、'),
      model: realQuoteDraft.items.map((item) => item.model).join('、'),
      configuration: realQuoteDraft.items.map((item) => `${item.productName}：${item.configuration || '配置待销售补充'}`).join('；'),
      quantity: Math.max(1, quantity),
      unitPrice: 0,
      notes: `来源：真实资料分析任务 ${realQuoteDraft.sourceAnalysisJobId}。产品已人工确认，正式价格、交期与技术条件待销售填写。`,
    }));
    setDraftDirty(true);
    appliedAnalysisJobRef.current = realQuoteDraft.sourceAnalysisJobId;
    notify(`已带入${realQuoteDraft.items.length}项人工确认产品，报价金额保持待填写`);
  }, [notify, realQuoteDraft, selected.id]);

  const visibleQuotes = useMemo(() => {
    const filtered = quoteRecords.filter((quote) => {
      const status = demoSales.quotes[quote.id]?.status ?? quote.status;
      if (filter === '全部') return true;
      return status === filter;
    });
    return [...filtered].sort((a, b) => {
      const aStatus = demoSales.quotes[a.id]?.status ?? a.status;
      const bStatus = demoSales.quotes[b.id]?.status ?? b.status;
      if (sortBy === '最近新增') return a.createdTime < b.createdTime ? 1 : -1;
      if (sortBy === '有效期优先') return a.valid > b.valid ? 1 : -1;
      return statusPriority[aStatus] - statusPriority[bStatus];
    });
  }, [demoSales.quotes, filter, sortBy]);

  const updateDraft = <K extends keyof QuoteDraft>(key: K, value: QuoteDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setDraftDirty(true);
    if (selectedStatus === '已确认待发送') {
      updateDemoQuote(selectedId, '待人工确认');
      updateDemoCustomer(selected.customerId, { leadStatus: '报价处理中', salesStage: '报价' });
    }
  };

  const selectQuote = (quote: QuoteRecord) => {
    setSelectedId(quote.id);
    setSalesCustomer(quote.customerId);
    setDraft(quoteDraftFor(quote));
    setDraftDirty(false);
    setConfirmOpen(false);
    setPreviewOpen(false);
  };

  const setSelectedStatus = (status: QuoteStatus) => {
    updateDemoQuote(selected.id, status);
  };

  const saveDraft = () => {
    setDraftDirty(false);
    notify('报价草案已保存到本地演示状态');
  };

  const requestConfirm = () => {
    if (selectedStatus === '已确认待发送') {
      notify('当前报价已经完成人工确认');
      return;
    }
    if (['已发送', '待跟进', '已失效'].includes(selectedStatus)) {
      notify(`当前报价状态为“${selectedStatus}”，暂不重复确认`);
      return;
    }
    setConfirmOpen(true);
  };

  const confirmQuote = () => {
    setSelectedStatus('已确认待发送');
    updateDemoCustomer(selected.customerId, { leadStatus: '报价处理中', salesStage: '报价' });
    setDraftDirty(false);
    setConfirmOpen(false);
    notify('报价已确认，发送客户前仍需查看预览');
  };

  const openSendPreview = () => {
    if (!canSend) {
      notify('请先完成人工确认');
      return;
    }
    setPreviewOpen(true);
  };

  const confirmSend = () => {
    setSelectedStatus('已发送');
    updateDemoCustomer(selected.customerId, { leadStatus: '报价已发送', salesStage: '报价' });
    setPreviewOpen(false);
    notify('已完成发送预览确认，仅更新本地演示状态');
  };

  const addFollowup = () => {
    if (selectedStatus === '已发送' || selectedStatus === '待跟进') {
      setSelectedStatus('待跟进');
      updateDemoFollowup(getDemoSalesCustomer(selected.customerId).followupId, { status: '今日待跟进' });
      updateDemoCustomer(selected.customerId, { leadStatus: '今日跟进', salesStage: '跟进' });
    } else {
      updateDemoFollowup(getDemoSalesCustomer(selected.customerId).followupId, { status: '今日待跟进' });
      updateDemoCustomer(selected.customerId, { leadStatus: '报价处理中', salesStage: '报价' });
    }
    notify(selectedStatus === '已发送' ? '已加入报价发送后的跟进任务' : '已打开需求补充或报价确认跟进任务');
    window.setTimeout(() => navigate('followups', getSalesContextForCustomer(selected.customerId)), 350);
  };

  const createQuote = () => {
    const newQuote = quoteRecords.find((quote) => quote.id === 'quote-foshan-003') ?? quoteRecords.find((quote) => quote.id === primaryQuoteId)!;
    updateDemoQuote(newQuote.id, '草稿');
    updateDemoCustomer(newQuote.customerId, { leadStatus: '报价处理中', salesStage: '报价' });
    selectQuote(newQuote);
    setDraftDirty(true);
    notify('已创建本地演示报价草案');
  };

  return <>
    <PageHeader eyebrow="QUOTATION DESK" title="报价管理" description="根据客户需求和产品方案，快速生成并管理报价草案。" actions={<><DemoNote /><button className="btn btn-primary" onClick={createQuote}><Plus size={15} />新建报价草案</button></>} />
    <div className="quote-summary-grid">
      {[['待确认报价', '2', '需要销售确认 · 演示数据'], ['今日新增报价', '3', '今日创建 · 演示数据'], ['等待客户回复', '1', '已发送待反馈 · 演示数据'], ['即将到期报价', '1', '请确认有效期 · 演示数据']].map(([label, value, foot]) => <div className="quote-summary-item" key={label}><span>{label}</span><strong>{value}</strong><small>{foot}</small></div>)}
    </div>
    <div className="quote-workbench">
      <Surface className="quote-list-panel">
        <div className="quote-list-header"><div><div className="surface-title">报价草案</div><div className="surface-kicker">待处理优先 · 演示数据</div></div><div className="quote-list-count">{visibleQuotes.length} 份</div></div>
        <div className="quote-filter-row"><div className="quote-filters">{['全部', '草稿', '待人工确认', '已发送', '待跟进', '已失效'].map((item) => <button className={filter === item ? 'active' : ''} key={item} onClick={() => setFilter(item)}>{item}</button>)}</div><select className="select quote-sort" value={sortBy} onChange={(event) => setSortBy(event.target.value)} aria-label="报价排序"><option>待处理优先</option><option>最近新增</option><option>有效期优先</option></select></div>
        <div className="quote-list-scroll">{visibleQuotes.map((quote) => { const status = demoSales.quotes[quote.id]?.status ?? quote.status; const itemAmount = quote.id === selected.id ? total : quote.amount; const itemAction = quoteActionFor(quote, status); return <button className={`quote-list-item ${selected.id === quote.id ? 'active' : ''}`} key={quote.id} onClick={() => selectQuote(quote)}><div className="quote-item-top"><span className={`quote-status quote-status-${quoteStatusClass(status)}`}>{status}</span><span className="quote-item-action">{itemAction.label}</span></div><div className="quote-customer"><strong>{quote.customer}</strong><em>{quote.standalone ? '独立演示记录' : '演示客户'}</em></div><div className="quote-item-meta">{quote.number} · {quote.demandProduct}</div><div className="quote-item-total"><strong>¥{itemAmount.toLocaleString()}<em>演示数据</em></strong><span>有效期 {quote.valid}</span></div><div className="quote-item-foot">最近动作：{itemAction.label}<span>{itemAction.time}</span></div><div className="quote-item-next-action">{quoteNextAction(status)}</div></button>; })}</div>
        {!visibleQuotes.length && <div className="quote-empty-state"><FileText size={23} /><strong>当前筛选下暂无报价</strong><span>可以切换筛选条件查看全部报价草案。</span></div>}
      </Surface>
      <Surface className="quote-detail-panel">
        <div className="quote-detail-header"><div><div className="eyebrow">AI-ASSISTED QUOTE / {selected.number}</div><h2>{selected.customer}<em>{selected.standalone ? '独立演示记录' : '演示客户'}</em></h2><div className="quote-detail-meta">{selected.industry} · {selected.region} · {selected.demand}</div></div><div className="quote-detail-total"><span className={`quote-status quote-status-${quoteStatusClass(selectedStatus)}`}>{selectedStatus}</span><strong>¥{total.toLocaleString()}</strong><small>报价总额 · 演示数据</small></div></div>
        <div className="quote-detail-scroll" ref={detailScrollRef}>
          <div className="quote-detail-section quote-client-section"><div className="quote-section-title">客户信息</div><div className="quote-info-grid"><div><span>客户名称</span><strong>{selected.customer}</strong></div><div><span>行业</span><strong>{selected.industry}</strong></div><div><span>地区</span><strong>{selected.region}</strong></div><div><span>当前需求</span><strong>{selected.demand}</strong></div></div></div>
          <div className="quote-detail-section quote-demand-section"><div className="quote-section-title"><Sparkles size={14} />需求摘要 <small>AI整理 · 演示数据</small></div><div className="quote-demand-columns"><div className="quote-confirmed-box"><span className="quote-state-label confirmed">已确认</span><div><b>需求产品</b><strong>{selected.demandProduct}</strong></div><div><b>产品型号</b><strong>{selected.model}</strong></div>{selected.confirmedNeeds.map((item, index) => <div key={item}><b>已确认信息 {index + 1}</b><strong>{item}</strong></div>)}</div><div className="quote-pending-box"><span className="quote-state-label pending">待确认</span><ul>{selected.pending.map((item) => <li key={item}>{item}</li>)}</ul></div></div></div>
          <div className="quote-detail-section quote-product-section"><div className="quote-section-title">产品方案 <small>可编辑草案 · 金额为演示数据</small></div><div className="quote-product-grid"><label>产品名称<input className="input" value={draft.productName} onChange={(event) => updateDraft('productName', event.target.value)} /></label><label>产品型号<input className="input" value={draft.model} onChange={(event) => updateDraft('model', event.target.value)} /></label><label className="quote-field-wide">配置说明<input className="input" value={draft.configuration} onChange={(event) => updateDraft('configuration', event.target.value)} /></label><label>数量（套）<input className="input" type="number" min="1" value={draft.quantity} onChange={(event) => updateDraft('quantity', Number(event.target.value))} /></label><label>演示单价<input className="input" type="number" min="0" value={draft.unitPrice} onChange={(event) => updateDraft('unitPrice', Number(event.target.value))} /></label></div><div className="quote-subtotal-row"><span>小计 · 演示数据</span><strong>¥{total.toLocaleString()}</strong></div>{draftDirty && <div className="quote-unsaved-note"><Activity size={13} />未保存修改</div>}</div>
          <div className="quote-detail-section quote-ai-check"><div className="quote-section-title"><ShieldCheck size={14} />AI报价检查 <small>只检查完整性与一致性</small></div><div className="quote-check-count">{selected.pending.length}项待人工确认</div><div className="quote-check-list"><div className="quote-check-item attention"><span>注意</span><p>客户{selected.pending[0]}仍未确认。</p></div><div className="quote-check-item attention"><span>注意</span><p>当前报价交付周期仍为待人工确认。</p></div><div className="quote-check-item suggestion"><span>建议</span><p>继续确认{selected.pending.slice(1).join('和')}。</p></div><div className="quote-check-item passed"><span>通过</span><p>产品数量与小计基础校验正常。</p></div></div></div>
          <div className="quote-detail-section quote-conditions-section"><div className="quote-section-title">报价条件 <small>销售人工确认</small></div><div className="quote-condition-grid"><label>有效期<input className="input" value={draft.validPeriod} onChange={(event) => updateDraft('validPeriod', event.target.value)} /></label><label>交付周期<input className="input" value={draft.delivery} onChange={(event) => updateDraft('delivery', event.target.value)} /></label><label>付款方式<input className="input" value={draft.payment} onChange={(event) => updateDraft('payment', event.target.value)} /></label><label>质保/服务<input className="input" value={draft.service} onChange={(event) => updateDraft('service', event.target.value)} /></label><label className="quote-field-wide">备注<textarea className="textarea" value={draft.notes} onChange={(event) => updateDraft('notes', event.target.value)} /></label></div></div>
          <div className="quote-detail-section quote-explanation-section"><div className="quote-section-title">客户方案说明草案 <small>AI生成草案 · 发送前请人工确认</small></div><textarea className="textarea quote-explanation" value={draft.explanation} onChange={(event) => updateDraft('explanation', event.target.value)} /></div>
        </div>
        <div className="quote-detail-actions"><div className={`quote-send-hint ${canSend || isSent ? 'ready' : ''}`}>{isSent ? '报价已发送（演示状态），可以进入后续跟进。' : canSend ? '已完成人工确认，可以查看发送预览。' : draftDirty ? '当前内容已修改，请重新确认后再发送。' : '请先完成人工确认，再进行发送预览。'}</div><div className="quote-action-buttons"><button className="btn btn-primary" onClick={requestConfirm} disabled={['已发送', '待跟进', '已失效'].includes(selectedStatus)}><CheckCircle2 size={14} />{isSent ? '报价已确认' : isConfirmed ? '已确认报价' : '确认报价'}</button><button className="btn" onClick={openSendPreview} disabled={!canSend}><Send size={14} />{isSent ? '已发送' : '发送客户'}</button><button className="btn" onClick={addFollowup} disabled={selectedStatus === '已失效'}><Timer size={14} />{selectedStatus === '待跟进' ? '已加入跟进' : '加入跟进'}</button><button className="btn btn-quiet" onClick={saveDraft}><Save size={14} />保存草稿</button></div></div>
      </Surface>
    </div>
    {confirmOpen && <motion.div className="quote-modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }}><motion.div className="quote-modal" initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }}><div className="quote-modal-head"><div><div className="eyebrow">MANUAL REVIEW</div><h3>确认报价</h3></div><button className="top-icon" onClick={() => setConfirmOpen(false)}><X size={16} /></button></div><div className="quote-modal-warning"><ShieldCheck size={18} /><div><strong>当前仍有{selected.pending.length}项待确认内容</strong><p>{selected.pending.join('、')}仍需人工核验。确认后状态将变为“已确认待发送”，不会自动发送客户。</p></div></div><div className="quote-modal-actions"><button className="btn" onClick={() => setConfirmOpen(false)}>返回修改</button><button className="btn btn-primary" onClick={confirmQuote}><CheckCircle2 size={14} />确认已人工核验</button></div></motion.div></motion.div>}
    {previewOpen && <motion.div className="quote-modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }}><motion.aside className="quote-preview-panel" initial={{ x: 24, opacity: 0 }} animate={{ x: 0, opacity: 1 }}><div className="quote-modal-head"><div><div className="eyebrow">SEND PREVIEW</div><h3>发送预览</h3></div><button className="top-icon" onClick={() => setPreviewOpen(false)}><X size={16} /></button></div><div className="quote-preview-note">仅打开本地演示预览，不会连接微信、邮件或其他第三方平台。</div><div className="quote-preview-body"><div className="quote-preview-row"><span>客户</span><strong>{selected.customer}（演示客户）</strong></div><div className="quote-preview-row"><span>产品方案</span><strong>{draft.productName} · {draft.model}</strong></div><div className="quote-preview-row"><span>报价总额</span><strong>¥{total.toLocaleString()} · 演示数据</strong></div><div className="quote-preview-row"><span>报价条件</span><strong>有效期{draft.validPeriod} · 交付{draft.delivery} · {draft.payment}</strong></div><div className="quote-preview-copy"><span>客户方案说明</span><p>{draft.explanation}</p></div><div className="quote-preview-warning">待确认提醒：正式配置、价格和交期以双方确认结果为准。</div></div><div className="quote-modal-actions"><button className="btn" onClick={() => setPreviewOpen(false)}>返回修改</button><button className="btn btn-primary" onClick={confirmSend}><Send size={14} />确认发送</button></div></motion.aside></motion.div>}
  </>;
}


type FollowTaskStatus = DemoFollowupStatus;
type FollowChannel = DemoFollowupChannel;

type FollowTask = {
  id: string;
  customerId: string;
  customer: string;
  priority: 'A' | 'B' | 'C' | 'D';
  priorityLabel: string;
  status: FollowTaskStatus;
  currentState: string;
  stage: SalesStage;
  industry: string;
  region: string;
  product: string;
  need: string;
  reason: string;
  suggestedTime: string;
  channel: string;
  duration: string;
  recent: string;
  confirmed: string;
  pending: string;
  rankReasons: string[];
  goal: string;
  avoid: string;
  next: string;
  scripts: Record<FollowChannel, string>;
  timeline: Array<[string, string]>;
  quoteId: string;
  standalone: boolean;
};

type FollowupRecord = {
  outcome: string;
  feedback: string;
  nextStep: string;
  nextTime: string;
};


const followTasks: FollowTask[] = demoFollowupTasks.map((task) => {
  const customer = getDemoSalesCustomer(task.customerId);
  const recentEvent = getTimelineEvent(customer, task.recentEventId);
  return {
    id: task.id,
    customerId: customer.customerId,
    customer: customer.name,
    priority: task.priority,
    priorityLabel: task.priorityLabel,
    status: task.status,
    currentState: task.currentState,
    stage: task.stage,
    industry: customer.industry,
    region: customer.region,
    product: customer.demandProduct,
    need: customer.lead.needSummary,
    reason: task.reason,
    suggestedTime: task.suggestedTime,
    channel: task.channel,
    duration: task.duration,
    recent: `${recentEvent.time} · ${recentEvent.label}`,
    confirmed: customer.confirmedNeeds.join('；'),
    pending: customer.pendingNeeds.join('、'),
    rankReasons: task.rankReasons,
    goal: task.goal,
    avoid: task.avoid,
    next: task.next,
    scripts: task.scripts,
    timeline: customer.timeline.filter((event) => event.time !== '待完成').map((event) => [event.time, event.label]),
    quoteId: customer.quoteId,
    standalone: customer.standalone,
  };
});

const followStages: SalesStage[] = ['客户发现', 'AI接待', '需求确认', '报价', '跟进', '成交'];

function emptyFollowupRecord(): FollowupRecord {
  return { outcome: '', feedback: '', nextStep: '', nextTime: '' };
}

export function FollowUps() {
  const { demoSales, navigate, notify, currentFollowupId, setSalesCustomer, updateDemoCustomer, updateDemoFollowup, updateDemoQuote } = useApp();
  const primaryFollowupId = getDemoSalesCustomer(primaryDemoCustomerId).followupId;
  const initialTask = followTasks.find((task) => task.id === currentFollowupId) ?? followTasks.find((task) => task.id === primaryFollowupId)!;
  const [selectedId, setSelectedId] = useState(initialTask.id);
  const [records, setRecords] = useState<Record<string, FollowupRecord>>({});
  const [filter, setFilter] = useState('全部');
  const [sortBy, setSortBy] = useState('AI推荐优先');
  const [aiOnly, setAiOnly] = useState(false);
  const [channel, setChannel] = useState<FollowChannel>('微信');
  const [recordOpen, setRecordOpen] = useState(false);
  const [deferOpen, setDeferOpen] = useState(false);
  const detailScrollRef = useRef<HTMLDivElement>(null);

  const selected = followTasks.find((task) => task.id === selectedId) ?? followTasks.find((task) => task.id === primaryFollowupId)!;
  const selectedStatus = demoSales.followups[selected.id]?.status ?? selected.status;
  const selectedTime = demoSales.followups[selected.id]?.suggestedTime ?? selected.suggestedTime;
  const selectedStage = demoSales.customers[selected.customerId]?.salesStage ?? selected.stage;
  const selectedLeadStatus = demoSales.customers[selected.customerId]?.leadStatus ?? selected.currentState;
  const currentRecord = records[selected.id] ?? emptyFollowupRecord();
  const priorityOrder: Record<FollowTask['priority'], number> = { A: 0, B: 1, C: 2, D: 3 };

  useEffect(() => {
    detailScrollRef.current?.scrollTo({ top: 0, behavior: 'auto' });
    setRecordOpen(false);
    setDeferOpen(false);
    setChannel('微信');
  }, [selectedId]);

  useEffect(() => {
    if (followTasks.some((task) => task.id === currentFollowupId)) setSelectedId(currentFollowupId);
  }, [currentFollowupId]);

  const visibleTasks = useMemo(() => {
    const filtered = followTasks.filter((task) => {
      const status = demoSales.followups[task.id]?.status ?? task.status;
      const leadStatus = demoSales.customers[task.customerId]?.leadStatus ?? task.currentState;
      if (aiOnly && !['A', 'B'].includes(task.priority)) return false;
      if (filter === '全部') return true;
      if (filter === '今日待跟进') return status === '今日待跟进';
      if (filter === '报价待回复') return ['报价已发送', '今日跟进', '等待客户'].includes(leadStatus);
      if (filter === '需求待确认') return ['需求确认中', '待报价'].includes(leadStatus) || task.currentState.includes('技术');
      if (filter === '等待客户') return status === '等待客户';
      if (filter === '已跟进') return status === '已跟进';
      return true;
    });
    return [...filtered].sort((a, b) => {
      const aStatus = demoSales.followups[a.id]?.status ?? a.status;
      const bStatus = demoSales.followups[b.id]?.status ?? b.status;
      if (sortBy === '建议跟进时间') return (demoSales.followups[a.id]?.suggestedTime ?? a.suggestedTime).localeCompare(demoSales.followups[b.id]?.suggestedTime ?? b.suggestedTime);
      if (sortBy === '最近沟通') return a.recent < b.recent ? 1 : -1;
      if (sortBy === '优先级') return priorityOrder[a.priority] - priorityOrder[b.priority];
      if (aStatus === '今日待跟进' && bStatus !== '今日待跟进') return -1;
      if (bStatus === '今日待跟进' && aStatus !== '今日待跟进') return 1;
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }, [aiOnly, demoSales.customers, demoSales.followups, filter, sortBy]);

  const selectTask = (task: FollowTask) => {
    setSelectedId(task.id);
    setSalesCustomer(task.customerId);
  };

  const updateRecord = (key: keyof FollowupRecord, value: string) => {
    setRecords((current) => ({ ...current, [selected.id]: { ...(current[selected.id] ?? emptyFollowupRecord()), [key]: value } }));
  };

  const copyScript = async () => {
    try {
      await navigator.clipboard?.writeText(selected.scripts[channel]);
    } catch {
      // Clipboard access can be unavailable in a local desktop preview.
    }
    notify(`${channel}话术已复制到本地演示剪贴板`);
  };

  const openRecord = () => setRecordOpen(true);

  const confirmRecord = () => {
    const nextStatus: FollowTaskStatus = currentRecord.outcome === '客户未回复' || currentRecord.nextStep === '等待客户回复' ? '等待客户' : currentRecord.outcome === '需要修改方案' ? '需要人工介入' : '已跟进';
    updateDemoFollowup(selected.id, { status: nextStatus });
    if (currentRecord.outcome === '客户未回复' || currentRecord.outcome === '等待客户内部确认' || currentRecord.nextStep === '等待客户回复') {
      updateDemoCustomer(selected.customerId, { leadStatus: '等待客户', salesStage: '跟进' });
    } else if (currentRecord.outcome === '需要修改方案') {
      updateDemoCustomer(selected.customerId, { leadStatus: '报价处理中', salesStage: '报价' });
      updateDemoQuote(selected.quoteId, '待人工确认');
    } else {
      updateDemoCustomer(selected.customerId, { leadStatus: '需求确认完成', salesStage: '需求确认' });
    }
    setRecordOpen(false);
    notify(`${selected.customer}已记录本次跟进，状态更新为${nextStatus}`);
  };

  const deferFollowup = (time: string) => {
    updateDemoFollowup(selected.id, { status: '延后处理', suggestedTime: time });
    setDeferOpen(false);
    notify(`已将${selected.customer}延后至${time}跟进`);
  };

  const openReception = () => {
    if (selected.standalone) {
      notify('该客户为独立演示记录，不包含前置AI接待链路');
      return;
    }
    notify('已带入当前演示客户上下文');
    navigate('reception', getSalesContextForCustomer(selected.customerId));
  };

  const openQuote = () => {
    notify('已准备打开当前演示报价');
    navigate('quotes', getSalesContextForCustomer(selected.customerId));
  };

  const reminder = selectedStatus === '等待客户' ? '当前建议等待客户回复。今天不建议再次主动联系。' : `今天建议联系。当前还有${selected.pending.split('、').length}项信息待确认。如果继续等待，任务可能持续停滞。`;

  return <>
    <PageHeader eyebrow="FOLLOW-UP CENTER" title="跟进中心" description="AI根据客户状态和销售进度，整理今天最值得处理的跟进任务。" actions={<><DemoNote /><button className="btn btn-primary" onClick={() => notify('已生成今日跟进任务，当前为本地演示数据')}><Timer size={15} />生成今日任务</button></>} />
    <div className="follow-summary-grid">{[['今日必须跟进', '6', 'AI已完成优先级判断 · 演示数据'], ['报价待回复', '2', '已发送等待反馈 · 演示数据'], ['需求待确认', '3', '需要补充关键信息 · 演示数据'], ['超时未处理', '1', '超过建议处理时间 · 演示数据']].map(([label, value, foot]) => <div className="follow-summary-item" key={label}><span>{label}</span><strong>{value}</strong><small>{foot}</small></div>)}</div>
    <Surface className="follow-recommendation-panel">
      <div className="follow-recommendation-header"><div><div className="follow-section-title"><Sparkles size={15} />AI今日跟进</div><div className="surface-kicker">建议优先处理3家客户 · 演示数据</div></div><button className={`btn ${aiOnly ? 'btn-quiet' : 'btn-primary'}`} onClick={() => { setAiOnly(!aiOnly); setFilter('全部'); }}>{aiOnly ? '查看全部任务' : '查看全部'}<ArrowRight size={14} /></button></div>
      <div className="follow-recommendation-list">{followTasks.slice(0, 3).map((task) => <button className={`follow-recommendation-card ${selected.id === task.id ? 'active' : ''}`} key={task.id} onClick={() => selectTask(task)}><div className="follow-recommendation-top"><span className={`follow-priority priority-${task.priority.toLowerCase()}`}>{task.priority} / {task.priorityLabel}</span><span className="follow-task-status">{demoSales.customers[task.customerId]?.leadStatus ?? task.currentState}</span></div>{task.customerId === primaryDemoCustomerId && <span className="follow-top-priority">今日最高优先</span>}<strong>{task.customer}<em>{task.standalone ? '独立演示记录' : '演示客户'}</em></strong><small>{task.reason}</small><div className="follow-recommendation-meta"><span>建议 {demoSales.followups[task.id]?.suggestedTime ?? task.suggestedTime}</span><span>{task.channel}</span></div><div className="follow-recommendation-advice"><Sparkles size={12} /><span>AI建议：{task.goal}</span></div></button>)}</div>
    </Surface>
    <div className="follow-workbench">
      <Surface className="follow-list-panel">
        <div className="follow-list-header"><div><div className="surface-title">跟进任务</div><div className="surface-kicker">按AI推荐优先级排列 · 演示数据</div></div><div className="follow-list-count">{visibleTasks.length} 项</div></div>
        <div className="follow-filter-row"><div className="follow-filters">{['全部', '今日待跟进', '报价待回复', '需求待确认', '等待客户', '已跟进'].map((item) => <button className={filter === item && !aiOnly ? 'active' : ''} key={item} onClick={() => { setFilter(item); setAiOnly(false); }}>{item}</button>)}</div><select className="select follow-sort" value={sortBy} onChange={(event) => setSortBy(event.target.value)} aria-label="跟进任务排序"><option>AI推荐优先</option><option>建议跟进时间</option><option>最近沟通</option><option>优先级</option></select></div>
        {aiOnly && <div className="follow-ai-only-note"><Sparkles size={13} />当前为AI推荐优先视图</div>}
        <div className="follow-task-list">{visibleTasks.map((task) => { const status = demoSales.followups[task.id]?.status ?? task.status; return <button className={`follow-task-item ${selected.id === task.id ? 'active' : ''}`} key={task.id} onClick={() => selectTask(task)}><div className="follow-task-top"><span className={`follow-priority priority-${task.priority.toLowerCase()}`}>{task.priority}</span><strong>{task.customer}</strong>{task.standalone && <span className="demo-client-tag">独立演示记录</span>}<span className={`follow-task-state state-${status === '已跟进' ? 'done' : status === '等待客户' ? 'waiting' : status === '需要人工介入' ? 'attention' : 'today'}`}>{status}</span></div><div className="follow-task-meta">{demoSales.customers[task.customerId]?.leadStatus ?? task.currentState} · {task.product}</div><div className="follow-task-reason">{task.reason}</div><div className="follow-task-foot"><span>建议 {demoSales.followups[task.id]?.suggestedTime ?? task.suggestedTime}</span><span>最近沟通 {task.recent}</span></div></button>; })}</div>
        {!visibleTasks.length && <div className="follow-empty-state"><Timer size={22} /><strong>当前筛选下暂无任务</strong><span>可以切换筛选条件查看其他跟进任务。</span></div>}
      </Surface>
      <Surface className="follow-detail-panel">
        <div className="follow-detail-header"><div><div className="eyebrow">AI FOLLOW-UP / {selected.id}</div><h2>{selected.customer}<em>{selected.standalone ? '独立演示记录' : '演示客户'}</em></h2><div className="follow-detail-meta">{selected.industry} · {selected.region} · 当前阶段 {selectedStage} · 建议 {selectedTime}</div></div><div className={`follow-priority follow-detail-priority priority-${selected.priority.toLowerCase()}`}>{selectedStatus}</div></div>
        <div className="follow-detail-scroll" ref={detailScrollRef}>
          <div className="follow-detail-section follow-why-section"><div className="follow-section-title">为什么现在跟</div><p>{selected.reason}</p></div>
          <div className="follow-stage-bar"><div className="follow-section-title">销售阶段 <small>当前：{selectedStage}</small></div><div className="follow-stage-track">{followStages.map((stage, index) => <div className={`follow-stage ${stage === selectedStage ? 'current' : ''} ${index < followStages.indexOf(selectedStage) ? 'done' : ''}`} key={stage}><span>{stage}</span></div>)}</div></div>
          <div className="follow-detail-section"><div className="follow-section-title">客户当前状态 <small>演示数据</small></div><div className="follow-state-grid"><div><span>行业</span><strong>{selected.industry}</strong></div><div><span>地区</span><strong>{selected.region}</strong></div><div><span>关注产品</span><strong>{selected.product}</strong></div><div><span>当前需求</span><strong>{selected.need}</strong></div><div><span>已确认信息</span><strong>{selected.confirmed}</strong></div><div><span>待确认问题</span><strong>{selected.pending}</strong></div><div><span>当前状态</span><strong>{selectedLeadStatus}</strong></div><div><span>最近动作</span><strong>{selected.recent}</strong></div></div></div>
          <div className="follow-detail-section follow-strategy"><div className="follow-section-title"><Sparkles size={14} />AI跟进策略 <small>最终动作由销售决定</small></div><div className="follow-strategy-list"><div><span>本次跟进目标</span><strong>{selected.goal}</strong></div><div><span>不建议做什么</span><strong>{selected.avoid}</strong></div><div><span>客户回复后的下一步</span><strong>{selected.next}</strong></div></div></div>
          <div className="follow-priority-callout"><div className="follow-priority-callout-head"><strong>{selected.priority === 'A' ? '★★★★★ 今日最高优先' : 'AI推荐依据'}</strong><span>{selected.priority === 'A' ? '为什么排第一' : selected.priorityLabel}</span></div><div className="follow-rank-reasons">{selected.rankReasons.map((reason) => <span key={reason}><Check size={12} />{reason}</span>)}</div></div>
          <div className="follow-ai-reminder"><div className="follow-section-title"><AlertTriangle size={14} />AI提醒</div><p>{reminder}</p></div>
          <div className="follow-detail-section"><div className="follow-section-title">行为 / 沟通轨迹 <small>演示数据</small></div><div className="follow-timeline">{selected.timeline.map(([time, event]) => <div className="follow-timeline-item" key={`${time}-${event}`}><span className="follow-timeline-dot" /><time>{time}</time><strong>{event}</strong></div>)}</div></div>
          <div className="follow-detail-section follow-script-section"><div className="follow-section-title">AI建议话术 <small>AI生成建议 · 发送前请销售确认</small></div><div className="follow-channel-tabs">{(['微信', '电话', '短信'] as FollowChannel[]).map((item) => <button className={channel === item ? 'active' : ''} key={item} onClick={() => setChannel(item)}>{item === '微信' ? <MessageCircle size={13} /> : item === '电话' ? <Phone size={13} /> : <MessageSquare size={13} />}{item}</button>)}</div><div className="follow-script-box"><p>{selected.scripts[channel]}</p><div className="follow-script-foot"><span>建议方式：{channel} · 预计耗时：{channel === '电话' ? selected.duration : '2分钟'}</span><button className="btn btn-quiet" onClick={copyScript}><Copy size={13} />复制话术</button></div></div></div>
          <div className="follow-detail-section follow-record-section"><div className="follow-section-title"><FileText size={14} />本次跟进记录 <small>仅保存本地演示状态</small></div>{!recordOpen ? <div className="follow-record-collapsed"><span>记录本次沟通结果，生成下一步建议。</span><button className="btn" onClick={openRecord}>开始填写记录</button></div> : <div className="follow-record-form"><label>本次结果<select className="select" value={currentRecord.outcome} onChange={(event) => updateRecord('outcome', event.target.value)}><option value="">请选择</option><option>客户未回复</option><option>已确认需求</option><option>需要修改方案</option><option>等待客户内部确认</option><option>其他</option></select></label><label>客户反馈<textarea className="textarea" value={currentRecord.feedback} onChange={(event) => updateRecord('feedback', event.target.value)} placeholder="填写客户反馈，不自动生成内容" /></label><label>下一步<select className="select" value={currentRecord.nextStep} onChange={(event) => updateRecord('nextStep', event.target.value)}><option value="">请选择</option><option>明天继续联系</option><option>3天后跟进</option><option>等待客户回复</option><option>返回报价管理</option><option>返回AI智能接待</option></select></label><label>下次跟进时间<input className="input" value={currentRecord.nextTime} onChange={(event) => updateRecord('nextTime', event.target.value)} placeholder="例如：明天14:00" /></label><button className="btn btn-primary" onClick={confirmRecord}><Check size={14} />保存本次记录</button></div>}</div>
        </div>
        <div className="follow-detail-actions"><button className="btn btn-primary" onClick={openRecord} disabled={selectedStatus === '已跟进'}><CheckCircle2 size={14} />{selectedStatus === '已跟进' ? '已记录' : '记录已跟进'}</button><button className="btn" onClick={() => setDeferOpen(!deferOpen)}><Clock3 size={14} />延后跟进</button><button className="btn" onClick={openReception}><ArrowRight size={14} />进入AI智能接待</button><button className="btn btn-quiet" onClick={openQuote}><FileText size={14} />查看报价</button></div>
        {deferOpen && <div className="follow-defer-menu"><div className="follow-section-title">选择演示跟进时间</div>{['今天下午', '明天', '3天后', '自定义日期'].map((time) => <button key={time} onClick={() => deferFollowup(time)}><CalendarDays size={13} />{time}</button>)}</div>}
      </Surface>
    </div>
  </>;
}

export function Analytics() {
  const [range, setRange] = useState('近7天');
  const data = [{ day: '周一', content: 28, leads: 4, consult: 12 }, { day: '周二', content: 32, leads: 5, consult: 14 }, { day: '周三', content: 24, leads: 3, consult: 10 }, { day: '周四', content: 38, leads: 6, consult: 18 }, { day: '周五', content: 36, leads: 8, consult: 23 }, { day: '周六', content: 31, leads: 5, consult: 17 }, { day: '周日', content: 42, leads: 7, consult: 25 }];
  return <>
    <PageHeader eyebrow="OPERATING SIGNALS" title="数据分析" description="从内容发布到客户咨询，再到跟进状态，查看完整获客过程。" actions={<><DemoNote /><div className="template-row" style={{ margin:0 }}>{['今日', '近7天', '近30天', '本季度'].map((item) => <button className={`template ${range === item ? 'active' : ''}`} key={item} onClick={() => setRange(item)}>{item}</button>)}</div></>} />
    <div className="metrics-grid" style={{ marginBottom:18 }}>{[['发布内容', '1,286'], ['平台覆盖', '5'], ['新增客户线索', '126'], ['本月咨询', '32'], ['待跟进客户', '18'], ['跟进完成率', '78%']].map(([label, value]) => <div className="metric" key={label}><div className="metric-label">{label}</div><div className="metric-value" style={{ fontSize: 24 }}>{value}</div><div className="metric-foot">演示数据</div></div>)}</div>
    <div className="split-layout"><Surface title="内容生产与线索趋势" kicker={`${range} · 演示数据`}><div className="chart-box"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data}><defs><linearGradient id="contentFill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#4c9aff" stopOpacity={.3} /><stop offset="95%" stopColor="#4c9aff" stopOpacity={0} /></linearGradient></defs><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="day" /><YAxis /><Tooltip contentStyle={{ background:'#0b1730', border:'1px solid rgba(153,180,228,.2)', borderRadius:10, color:'#fff' }} /><Area type="monotone" dataKey="content" stroke="#65a9ff" fill="url(#contentFill)" strokeWidth={2} name="内容发布" /><Line type="monotone" dataKey="leads" stroke="#6bd8b1" strokeWidth={2} name="客户线索" /></AreaChart></ResponsiveContainer></div></Surface><Surface title="客户咨询数量" kicker="演示数据"><div className="chart-box"><ResponsiveContainer width="100%" height="100%"><BarChart data={data}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="day" /><YAxis /><Tooltip contentStyle={{ background:'#0b1730', border:'1px solid rgba(153,180,228,.2)', borderRadius:10, color:'#fff' }} /><Bar dataKey="consult" fill="#387ef5" radius={[5,5,0,0]} name="咨询数量" /></BarChart></ResponsiveContainer></div><div className="tiny-note">数据仅用于演示工作台的查看方式，不代表真实客户成果。</div></Surface></div>
  </>;
}

export function CooperationPlan() {
  const { notify } = useApp();
  return <>
    <PageHeader eyebrow="COOPERATION PROPOSAL" title="合作方案" description="一次部署，建立企业AI获客基础设施。" actions={<><DemoNote /><button className="btn btn-primary" onClick={() => notify('客户方案已生成，可继续调整')}><FileText size={15} />生成客户方案</button></>} />
    <div className="plan-hero"><Surface className="plan-price"><div className="eyebrow">AI EMPLOYEE / STANDARD</div><h2>{appConfig.productName}</h2><div className="price-number">¥{appConfig.price.toLocaleString()}<small>永久使用</small></div><div className="tiny-note">包含设备、系统部署、企业知识库配置及相关服务。</div><div className="deliverables" style={{ marginTop: 26 }}>{productDeliverables.map((item) => <div className="deliverable" key={item}><CheckCircle2 size={15} />{item}</div>)}</div><div className="surface-subtle" style={{ marginTop: 26, padding: 13, color:'#9fc6ff', fontSize:11 }}>首个季度{appConfig.geoQuarterKeywords}个GEO关键词及关联词布局</div><div className="tiny-note" style={{ marginTop: 14 }}>{contractNote}</div></Surface><Surface title="合作流程" kicker="从需求沟通到持续优化"><div className="timeline">{['需求沟通', '方案确认', '签约付款', '系统部署', '内容配置', '上线运营', '持续优化'].map((item, index) => <div className="timeline-item" key={item}><span className="timeline-dot" /><div className="timeline-copy"><strong>{item}</strong><span>{index < 2 ? '现场演示确认业务方向' : index === 6 ? '根据运营数据持续优化' : '由项目团队协同推进'}</span></div></div>)}</div></Surface></div>
    <div style={{ display:'flex', gap:9, flexWrap:'wrap', marginTop:18 }}><button className="btn btn-primary" onClick={() => notify('方案已准备，可导出为本地文件')}><FileDown size={14} />导出客户方案</button><button className="btn" onClick={() => notify('ROI报告已附加到方案')}><BarChart3 size={14} />导出ROI报告</button><button className="btn" onClick={() => notify('合同预览为演示占位')}><FileText size={14} />查看合同</button><button className="btn" onClick={() => notify('部署预约已记录到本地')}><Timer size={14} />预约部署</button></div>
  </>;
}

export function Settings() {
  const { notify, startDemo, fillDemo, resetDemo } = useApp();
  const [developerMode, setDeveloperMode] = useState(() => window.localStorage.getItem('shuyuan-ai-developer-mode') === 'true');
  const toggleDeveloperMode = (enabled: boolean) => {
    setDeveloperMode(enabled);
    window.localStorage.setItem('shuyuan-ai-developer-mode', String(enabled));
    window.dispatchEvent(new Event('developer-mode-change'));
    notify(enabled ? '开发模式已开启' : '开发模式已关闭');
  };
  return <>
    <PageHeader eyebrow="SYSTEM SETTINGS" title="系统设置" description="管理本地演示环境、素材路径与系统运行偏好。" actions={<DemoNote />} />
    <div className="split-layout"><Surface title="演示环境" kicker="本地数据存储"><div className="profile-item"><span>运行模式</span><span>本地演示模式</span></div><div className="profile-item"><span>数据存储</span><span>LocalStorage / 本机</span></div><div className="profile-item"><span>第三方平台</span><span>未连接</span></div><div className="profile-item"><span>AI服务</span><span>本地规则组合</span></div><button className="btn btn-primary" style={{ marginTop:18 }} onClick={() => notify('设置已保存')}><Save size={14} />保存设置</button></Surface><Surface title="素材路径" kicker="替换后重新启动应用"><div className="profile-item"><span>Logo</span><span>/public/assets/logo.png</span></div><div className="profile-item"><span>机器人</span><span>/public/assets/robot.png</span></div><div className="profile-item"><span>设备</span><span>/public/assets/server.png</span></div><div className="tiny-note" style={{ marginTop:18 }}>素材采用透明机器人与黑色服务器机箱图片，正式替换时保持文件名即可。</div></Surface></div>
    <Surface className="developer-tools-panel" title="开发与演示工具" kicker={developerMode ? '开发模式已开启' : '默认隐藏，正式运行不显示'}>
      <div className="developer-mode-row"><div><strong>开发模式</strong><span>开启后显示本地演示和数据准备工具。</span></div><label className="developer-toggle"><input type="checkbox" checked={developerMode} onChange={(event) => toggleDeveloperMode(event.target.checked)} /><span /></label></div>
      {developerMode && <div className="developer-tool-actions"><button className="btn" onClick={startDemo}><Play size={14} />进入演示模式</button><button className="btn" onClick={fillDemo}><Gauge size={14} />一键填充数据</button><button className="btn" onClick={resetDemo}><RotateCcw size={14} />重置演示数据</button><div className="tiny-note">这些工具仅用于内部演示准备，关闭开发模式后将从左侧导航和顶部状态中隐藏。</div></div>}
    </Surface>
  </>;
}
