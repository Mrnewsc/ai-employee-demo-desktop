import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Activity, ArrowRight, BarChart3, Check, CheckCircle2, Download, FileDown, FileText, Filter, KeyRound, LayoutList, MoreHorizontal, PackageCheck, Pause, Play, Plus, RefreshCw, Save, Send, Settings2, ShieldCheck, Sparkles, Target, Timer, UserRound, X } from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { appConfig, complianceNote, contractNote, platformNames, productDeliverables } from '../config';
import { demoLeads } from '../demo/demoData';
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

export function Leads() {
  const [selected, setSelected] = useState<typeof demoLeads[number] | null>(null);
  const { navigate, notify } = useApp();
  return <>
    <PageHeader eyebrow="LEAD INTELLIGENCE" title="客户线索" description="把分散的阅读、互动与咨询，转化为可持续跟进的销售线索。" actions={<><DemoNote /><button className="btn btn-primary" onClick={() => notify('已刷新线索池')}><RefreshCw size={15} />刷新线索</button></>} />
    <Surface title="线索池" kicker="演示数据，不代表实际运营效果"><div className="table-wrap"><table className="data-table"><thead><tr>{['客户名称', '来源平台', '所在地区', '感兴趣产品', '互动行为', '意向等级', '最近沟通', '跟进状态', '负责人'].map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>{demoLeads.map((lead) => <tr key={lead.name} onClick={() => setSelected(lead)} style={{ cursor: 'pointer' }}><td>{lead.name}</td><td>{lead.source}</td><td>{lead.region}</td><td>{lead.product}</td><td>{lead.action}</td><td className={lead.intent === '高' ? 'intent-high' : 'intent-mid'}>{lead.intent}</td><td>今天 10:24</td><td>{lead.status}</td><td>{lead.owner}</td></tr>)}</tbody></table></div></Surface>
    <AnimatePresence>{selected && <><motion.div className="drawer-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSelected(null)} /><motion.aside className="drawer" initial={{ x: 30, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 30, opacity: 0 }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}><div><div className="eyebrow">LEAD DETAIL</div><h2 style={{ margin: '8px 0 0', fontSize: 22 }}>{selected.name}</h2></div><button className="top-icon" onClick={() => setSelected(null)}><X size={16} /></button></div><div className="chip-row" style={{ marginTop: 16 }}><span className="chip">{selected.intent}意向</span><span className="chip">{selected.product}</span></div><div style={{ marginTop: 24 }}>{[['客户基本信息', selected.region], ['来源内容', `${selected.source} · 行业采购内容`], ['浏览行为', selected.action], ['AI判断', '具备明确设备采购兴趣'], ['跟进建议', '先确认日产量与工件尺寸'], ['报价记录', '暂无正式报价']].map(([label, value]) => <div className="profile-item" key={label}><span>{label}</span><span>{value}</span></div>)}</div><div style={{ display: 'grid', gap: 8, marginTop: 24 }}><button className="btn btn-primary" onClick={() => navigate('reception')}><MessageJump />进入AI接待</button><button className="btn" onClick={() => notify('已生成销售跟进话术')}><FileText size={14} />生成跟进话术</button><button className="btn" onClick={() => notify('报价草稿已创建')}><PackageCheck size={14} />创建报价</button></div></motion.aside></>}</AnimatePresence>
  </>;
}

function MessageJump() { return <ArrowRight size={14} />; }

export function Quotations() {
  const { company, notify } = useApp();
  const [showForm, setShowForm] = useState(false);
  return <>
    <PageHeader eyebrow="QUOTATION DESK" title="报价管理" description="保存客户需求与报价记录，正式报价由人工确认。" actions={<><DemoNote /><button className="btn btn-primary" onClick={() => setShowForm(true)}><Plus size={15} />新建报价</button></>} />
    <Surface title="报价记录" kicker="演示数据，不代表实际运营效果"><div className="table-wrap"><table className="data-table"><thead><tr>{['客户', '需求产品', '产品配置', '数量', '单价', '报价总额', '报价状态', '创建时间', '有效期'].map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody><tr><td>金华某五金制品厂</td><td>AI员工一体机</td><td>标准版 · 本地化部署</td><td>1</td><td>¥{appConfig.price.toLocaleString()}</td><td>¥{appConfig.price.toLocaleString()}</td><td className="intent-mid">待人工确认</td><td>今天 10:30</td><td>30天</td></tr><tr><td>{company.companyName}</td><td>AI员工一体机</td><td>标准版</td><td>1</td><td>¥{appConfig.price.toLocaleString()}</td><td>¥{appConfig.price.toLocaleString()}</td><td>演示草稿</td><td>今天 09:16</td><td>待确认</td></tr></tbody></table></div></Surface>
    {showForm && <motion.div className="drawer-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }}><motion.aside className="drawer" initial={{ x: 30 }} animate={{ x: 0 }}><div style={{ display:'flex', justifyContent:'space-between' }}><div><div className="eyebrow">NEW QUOTE</div><h2 style={{ margin: '8px 0 0', fontSize: 22 }}>创建报价单</h2></div><button className="top-icon" onClick={() => setShowForm(false)}><X size={16} /></button></div><div className="form-grid" style={{ marginTop: 24 }}><div className="field full"><label>客户</label><input className="input" value="金华某五金制品厂" readOnly /></div><div className="field full"><label>需求产品</label><input className="input" value="AI员工一体机 · 标准版" readOnly /></div><div className="field"><label>数量</label><input className="input" value="1" readOnly /></div><div className="field"><label>单价</label><input className="input" value={`¥${appConfig.price.toLocaleString()}`} readOnly /></div></div><div className="surface-subtle" style={{ marginTop: 18, padding: 14 }}><div className="surface-kicker">交付内容</div><div className="tiny-note" style={{ marginTop: 8, lineHeight: 1.9 }}>{productDeliverables.join(' · ')}</div></div><div className="tiny-note" style={{ marginTop: 18 }}>{contractNote}</div><div style={{ display:'flex', gap:8, flexWrap:'wrap', marginTop:22 }}><button className="btn btn-primary" onClick={() => { setShowForm(false); notify('报价单已保存，等待人工确认'); }}><Save size={14} />保存报价</button><button className="btn" onClick={() => notify('已打开打印预览')}><FileDown size={14} />预览报价单</button></div></motion.aside></motion.div>}
  </>;
}

export function FollowUps() {
  const { notify } = useApp();
  const [done, setDone] = useState<string[]>([]);
  return <>
    <PageHeader eyebrow="FOLLOW-UP CENTER" title="跟进中心" description="把销售从提醒与记录中解放出来，专注高价值沟通。" actions={<><DemoNote /><button className="btn btn-primary" onClick={() => notify('已生成今日跟进任务')}><Timer size={15} />生成今日任务</button></>} />
    <div className="metrics-grid" style={{ marginBottom: 18 }}>{[['今日需跟进', '6人'], ['三天未回复', '3人'], ['高意向客户', '2人'], ['等待报价确认', '1人'], ['即将到期报价', '1份'], ['需要人工介入', '2人']].map(([label, value]) => <div className="metric" key={label}><div className="metric-label">{label}</div><div className="metric-value">{value}</div><div className="metric-foot">演示数据</div></div>)}</div>
    <Surface title="跟进任务" kicker="按优先级排列"><div className="table-wrap"><table className="data-table"><thead><tr>{['客户名称', '意向等级', '最近沟通', '建议跟进时间', '跟进原因', '建议话术', '操作'].map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>{[['金华某五金制品厂', '高', '今天 10:24', '今天 14:00', '等待确认工件尺寸', '根据产量补充一版设备配置建议'], ['义乌某机械有限公司', '中', '昨天 16:18', '明天 10:00', '收藏内容后未回复', '发送一条简洁的应用场景说明'], ['佛山某家具制造企业', '中高', '周一 09:12', '今天 16:30', 'AI接待已收集需求', '邀请销售进一步确认交付周期']].map(([name, intent, recent, time, reason, script]) => <tr key={name} style={{ opacity: done.includes(name) ? .48 : 1 }}><td>{name}</td><td className={intent === '高' ? 'intent-high' : 'intent-mid'}>{intent}</td><td>{recent}</td><td>{time}</td><td>{reason}</td><td>{script}</td><td><button className="btn" onClick={() => { setDone((current) => [...current, name]); notify(`${name}已标记为完成`); }}><Check size={13} />已跟进</button></td></tr>)}</tbody></table></div></Surface>
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
  const { notify } = useApp();
  return <>
    <PageHeader eyebrow="SYSTEM SETTINGS" title="系统设置" description="管理本地演示环境、素材路径与系统运行偏好。" actions={<DemoNote />} />
    <div className="split-layout"><Surface title="演示环境" kicker="本地数据存储"><div className="profile-item"><span>运行模式</span><span>本地演示模式</span></div><div className="profile-item"><span>数据存储</span><span>LocalStorage / 本机</span></div><div className="profile-item"><span>第三方平台</span><span>未连接</span></div><div className="profile-item"><span>AI服务</span><span>本地规则组合</span></div><button className="btn btn-primary" style={{ marginTop:18 }} onClick={() => notify('设置已保存')}><Save size={14} />保存设置</button></Surface><Surface title="素材路径" kicker="替换后重新启动应用"><div className="profile-item"><span>Logo</span><span>/public/assets/logo.png</span></div><div className="profile-item"><span>机器人</span><span>/public/assets/robot.png</span></div><div className="profile-item"><span>设备</span><span>/public/assets/server.png</span></div><div className="tiny-note" style={{ marginTop:18 }}>素材采用透明机器人与黑色服务器机箱图片，正式替换时保持文件名即可。</div></Surface></div>
  </>;
}
