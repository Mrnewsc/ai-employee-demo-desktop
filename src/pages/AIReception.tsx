import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight, Bot, Check, CheckCircle2, Clock3, Download, FileImage, FileSpreadsheet,
  FileText, FileType2, FolderOpen, Info, Lightbulb, MessageSquare, MoreHorizontal, Plus, RotateCcw,
  Search, Send, ShieldCheck, UploadCloud, UserRound, UsersRound, X,
} from 'lucide-react';
import { coreDemoSalesCustomers, getDemoSalesCustomer, getSalesContextForCustomer, type DemoSalesCustomer } from '../demo/demoSalesFlow';
import { useApp } from '../stores/AppStore';
import { DemoNote, PageHeader, Surface } from '../components/UI';
import { RealAnalysisWorkspace } from '../real-ai/ui/RealAnalysisWorkspace';
import type { RealQuoteDraftHandoff } from '../real-ai/pipeline';

type ChatMessage = { id: string; from: 'customer' | 'ai'; text: string; streaming?: boolean };
type CustomerProfile = { dailyOutput: string; intent: string; action: string; tags: string[]; budget: string };
type ReceptionMode = 'reception' | 'analysis';
type DemoFileKind = 'pdf' | 'word' | 'excel' | 'image';
type DemoFileStatus = '待分析' | '已识别' | '识别中' | '待确认';
type DemoFile = { id: string; name: string; size: string; kind: DemoFileKind; status: DemoFileStatus };
type MatchStatus = '已找到' | '部分匹配' | '未找到';
type MatchRow = { id: string; customerProduct: string; customerModel: string; ourProduct: string; score: string; status: MatchStatus; note: string; source: string };

const analysisSteps = [
  '接收客户文件',
  'OCR识别（演示）',
  '提取产品信息',
  '匹配企业产品库',
  '查询公开渠道候选（演示）',
  '生成匹配结果',
] as const;

const sendPreviewText = `尊敬的客户：
根据您提供的资料，我们已完成初步产品匹配。
共识别3项产品，其中2项已有对应方案，1项需要进一步确认。
附件为初步匹配结果，请您补充待确认产品的型号、尺寸或铭牌照片。
正式配置、报价和交付周期以人工确认结果为准。`;

function getFileIcon(kind: DemoFileKind) {
  if (kind === 'image') return <FileImage size={17} />;
  if (kind === 'excel') return <FileSpreadsheet size={17} />;
  if (kind === 'word') return <FileType2 size={17} />;
  return <FileText size={17} />;
}

function fileStatus(file: DemoFile, index: number, started: boolean, step: number): DemoFileStatus {
  if (!started) return file.status;
  if (step >= analysisSteps.length) return index === 2 ? '待确认' : '已识别';
  if (step >= 2) return index === 2 && step < 4 ? '识别中' : '已识别';
  return index < 2 ? '识别中' : '待分析';
}

function statusClass(status: MatchStatus) {
  return status === '已找到' ? 'match-found' : status === '部分匹配' ? 'match-partial' : 'match-missing';
}

function analysisFilesFor(customer: DemoSalesCustomer): DemoFile[] {
  return customer.aiReception.files.map((file) => ({ ...file, status: '待分析' }));
}

function AnalysisWorkspace({ customer, notify, openQuote }: { customer: DemoSalesCustomer; notify: (message: string) => void; openQuote: () => void }) {
  const [files, setFiles] = useState<DemoFile[]>(() => analysisFilesFor(customer));
  const [dragging, setDragging] = useState(false);
  const [analysisStarted, setAnalysisStarted] = useState(false);
  const [analysisStep, setAnalysisStep] = useState(0);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [candidateOpen, setCandidateOpen] = useState(false);
  const [sendPreviewOpen, setSendPreviewOpen] = useState(false);
  const analysisTimer = useRef<number | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const analysisComplete = analysisStarted && analysisStep >= analysisSteps.length;
  const matchRows: MatchRow[] = customer.aiReception.matchRows;
  const extractedFields = customer.aiReception.extractedFields;
  const publicCandidates = customer.aiReception.publicCandidates;
  const matchedCount = matchRows.filter((row) => row.status !== '未找到').length;
  const pendingCount = matchRows.filter((row) => row.status === '未找到').length;

  useEffect(() => () => {
    if (analysisTimer.current) window.clearInterval(analysisTimer.current);
  }, []);

  useEffect(() => {
    if (analysisTimer.current) window.clearInterval(analysisTimer.current);
    analysisTimer.current = null;
    setFiles(analysisFilesFor(customer));
    setAnalysisStarted(false);
    setAnalysisStep(0);
    setExpandedRow(null);
    setCandidateOpen(false);
    setSendPreviewOpen(false);
  }, [customer]);

  const addFiles = (incoming: FileList | null) => {
    if (!incoming?.length) return;
    const additions: DemoFile[] = Array.from(incoming).slice(0, 5).map((file, index) => {
      const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
      const kind: DemoFileKind = extension === 'pdf' ? 'pdf' : extension === 'doc' || extension === 'docx' ? 'word' : extension === 'xls' || extension === 'xlsx' ? 'excel' : 'image';
      return { id: `uploaded-${Date.now()}-${index}`, name: file.name, size: `${Math.max(1, Math.round(file.size / 1024))} KB`, kind, status: '待分析' };
    });
    setFiles((current) => [...current, ...additions].slice(0, 8));
    notify('资料已加入本地演示分析队列');
  };

  const startAnalysis = () => {
    if (analysisTimer.current) window.clearInterval(analysisTimer.current);
    setAnalysisStarted(true);
    setAnalysisStep(0);
    setExpandedRow(null);
    setCandidateOpen(false);
    notify('AI资料分析已开始');
    let cursor = 0;
    analysisTimer.current = window.setInterval(() => {
      cursor += 1;
      setAnalysisStep(cursor);
      if (cursor >= analysisSteps.length && analysisTimer.current) {
        window.clearInterval(analysisTimer.current);
        analysisTimer.current = null;
      }
    }, 1000);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    addFiles(event.dataTransfer.files);
  };

  const downloadExcel = () => {
    const rows = [
      ['客户产品名称', '客户型号', '我方对应产品', '匹配度', '是否找到', '备注'],
      ...matchRows.map((row) => [row.customerProduct, row.customerModel, row.ourProduct, row.score, row.status, row.note]),
    ];
    const table = `<table>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')}</table>`;
    const blob = new Blob([`<html><meta charset="utf-8"><body>${table}</body></html>`], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${customer.name}-产品匹配结果-演示数据.xls`;
    link.click();
    URL.revokeObjectURL(url);
    notify('产品匹配结果已导出为Excel演示文件');
  };

  const visibleFields = analysisStep >= 3 ? extractedFields : analysisStep >= 2 ? extractedFields.slice(0, 2) : [];
  const auditLines = !analysisStarted
    ? ['等待接收客户文件', '识别结果会在分析过程中逐项展示', '最终结果需要销售人工确认']
    : analysisStep < 2
      ? ['已接收客户资料，正在建立文件索引', '正在检查PDF、Word、Excel和图片内容', '暂未进入产品字段提取']
      : analysisStep < 4
        ? ['已从客户资料中识别出产品名称和客户型号', '正在提取规格、产能与应用场景', '下一步将使用企业产品库进行匹配']
        : analysisComplete
          ? [`已完成${matchRows.length}个产品条目的初步匹配`, `已找到${matchedCount}项对应方案，${pendingCount}项需要补充资料`, '正式配置、报价与交付周期需人工确认']
          : ['已完成产品字段提取，正在比对企业产品库', '发现1个条目缺少完整规格', '正在整理公开渠道候选信息'];

  return <div className="analysis-workspace">
    <div className="analysis-layout">
      <Surface title="客户资料" kicker={`${files.length}个文件 · 演示数据`} className="analysis-files-panel">
        <div className={`analysis-dropzone ${dragging ? 'dragging' : ''}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={handleDrop} onClick={() => fileInput.current?.click()} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter') fileInput.current?.click(); }}>
          <input ref={fileInput} type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,image/*" onChange={(event) => addFiles(event.target.files)} />
          <UploadCloud size={22} />
          <strong>{dragging ? '松开后加入分析' : '拖入客户资料'}</strong>
          <span>支持 PDF、Word、Excel、图片</span>
          <small>文件仅用于本地演示</small>
        </div>
        <div className="analysis-file-list">
          {files.map((file, index) => {
            const status = fileStatus(file, index, analysisStarted, analysisStep);
            return <div className="analysis-file-item" key={file.id}>
              <span className={`analysis-file-icon ${file.kind}`}>{getFileIcon(file.kind)}</span>
              <span className="analysis-file-copy"><strong>{file.name}</strong><small>{file.size}</small></span>
              <span className={`analysis-file-status ${status === '已识别' ? 'success' : status === '识别中' ? 'running' : status === '待确认' ? 'attention' : ''}`}><i />{status}</span>
            </div>;
          })}
        </div>
        <div className="analysis-client-context">
          <div className="surface-kicker">当前客户</div>
          <strong>{customer.name}</strong>
          <div><span>行业</span><span>{customer.industry}</span></div>
          <div><span>需求方向</span><span>{customer.demandProduct}</span></div>
          <div><span>意向等级</span><span className="intent-mid">{customer.aiReception.profile.intent}</span></div>
        </div>
      </Surface>

      <Surface className="analysis-process-panel">
        <div className="analysis-process-header">
          <div className="ai-analysis-identity"><span className="ai-analysis-avatar"><Bot size={19} /></span><div><div className="surface-title">AI分析过程</div><div className="surface-kicker">可审计的资料识别与产品匹配</div></div></div>
          <span className={`analysis-live-status ${analysisComplete ? 'complete' : analysisStarted ? 'running' : ''}`}><i />{analysisComplete ? '分析完成' : analysisStarted ? '分析中' : '等待开始'}</span>
        </div>
        <div className="analysis-process-body">
          <div className="analysis-step-list">
            {analysisSteps.map((step, index) => {
              const done = analysisStarted && analysisStep > index;
              const running = analysisStarted && analysisStep === index && !analysisComplete;
              return <div className={`analysis-step ${done ? 'done' : running ? 'running' : ''}`} key={step}>
                <span className="analysis-step-marker">{done ? <Check size={12} /> : index + 1}</span>
                <span><strong>{step}</strong><small>{done ? '已完成' : running ? '正在处理' : '等待处理'}</small></span>
              </div>;
            })}
          </div>
          <div className="analysis-current-result">
            <div className="analysis-current-kicker">{!analysisStarted ? '开始后显示实时结果' : analysisComplete ? '匹配结果已生成' : `正在处理 · ${analysisSteps[Math.min(analysisStep, analysisSteps.length - 1)]}`}</div>
            {!analysisStarted && <div className="analysis-start-state"><FolderOpen size={25} /><strong>准备分析客户资料</strong><span>点击下方按钮，按顺序演示六个处理步骤。</span></div>}
            {analysisStarted && <>
              {analysisComplete && <div className="analysis-complete-state"><CheckCircle2 size={17} /><div><strong>客户资料分析完成，已生成初步产品匹配结果。</strong><span>{matchRows.length}项产品已识别 · {matchedCount}项已匹配 · {pendingCount}项待确认</span></div></div>}
              <div className="analysis-field-list">
                {visibleFields.map(([label, value]) => <motion.div className="analysis-field" key={label} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}><span>{label}</span><strong>{value}</strong></motion.div>)}
                {!analysisComplete && analysisStep === 2 && <div className="analysis-field pending"><span>关键规格</span><strong>正在识别…</strong></div>}
              </div>
              <div className="analysis-audit-box"><div className="analysis-section-title"><Search size={14} />AI工作判断</div>{auditLines.map((line) => <div className="analysis-audit-line" key={line}><CheckCircle2 size={13} />{line}</div>)}</div>
            </>}
          </div>
        </div>
        <div className="analysis-advice"><div className="analysis-section-title"><Lightbulb size={14} />AI建议</div><strong>{analysisComplete ? customer.aiReception.analysisAdvice : '完成资料分析后，AI会根据匹配差异给出销售下一步建议。'}</strong><span>{analysisComplete ? customer.aiReception.analysisNote : '建议关注可审计判断依据，不直接将结果视为正式方案。'}</span>{analysisComplete && <button className="btn btn-quiet" onClick={() => notify('已生成客户确认话术')}>生成确认话术<ArrowRight size={14} /></button>}</div>
        <button className="analysis-start-button btn btn-primary" onClick={startAnalysis} disabled={analysisStarted && !analysisComplete}><>{analysisStarted && !analysisComplete ? <RotateCcw size={15} /> : analysisComplete ? <RotateCcw size={15} /> : <Search size={15} />}</>{analysisStarted && !analysisComplete ? '分析中…' : analysisComplete ? '重新分析' : '开始分析'}</button>
      </Surface>

      <Surface title="产品匹配结果" kicker={analysisComplete ? '初步匹配 · 等待销售确认' : '分析完成后生成结果'} className="analysis-results-panel">
        <div className="analysis-summary"><div><strong>{analysisComplete ? matchRows.length : '—'}</strong><span>已识别</span></div><div><strong>{analysisComplete ? matchedCount : '—'}</strong><span>已匹配</span></div><div><strong>{analysisComplete ? pendingCount : '—'}</strong><span>待确认</span></div></div>
        {!analysisComplete ? <div className="analysis-results-empty"><FileText size={24} /><strong>等待匹配结果</strong><span>完成六个分析步骤后，这里会生成产品匹配结果表。</span></div> : <>
          <div className="analysis-result-note"><Info size={13} />匹配度为演示判断，不等同于正式技术方案或报价。</div>
          <div className="analysis-match-table">
            <div className="analysis-match-head"><span>客户产品</span><span>客户型号</span><span>我方对应产品</span><span>匹配度</span><span>匹配状态</span></div>
            {matchRows.map((row) => <div className={`analysis-match-block ${expandedRow === row.id ? 'expanded' : ''}`} key={row.id}>
              <div className="analysis-match-row" role="button" tabIndex={0} onClick={() => { setCandidateOpen(false); setExpandedRow((current) => current === row.id ? null : row.id); }} onKeyDown={(event) => { if (event.key === 'Enter') { setCandidateOpen(false); setExpandedRow((current) => current === row.id ? null : row.id); } }}>
                <span><strong>{row.customerProduct}</strong></span><span>{row.customerModel}</span><span>{row.ourProduct}</span><span className={`match-score ${statusClass(row.status)}`}>{row.score}</span><span className={`match-status ${statusClass(row.status)}`}><i />{row.status}</span>
              </div>
              {expandedRow === row.id && <div className="analysis-match-detail"><div><span>备注</span><strong>{row.note}</strong></div><div><span>识别来源</span><strong>{row.source}</strong></div>{row.status === '未找到' && <button className="btn" onClick={(event) => { event.stopPropagation(); setCandidateOpen(true); notify('已展开公开渠道候选演示结果'); }}>{candidateOpen ? '已展开候选结果' : '查看公开渠道候选'}<ArrowRight size={14} /></button>}</div>}
              {expandedRow === row.id && row.status === '未找到' && candidateOpen && <div className="analysis-candidates">{publicCandidates.map((candidate) => <div className="analysis-candidate" key={candidate.title}><span className="analysis-candidate-image"><FileImage size={17} /><small>{candidate.image}</small></span><span><strong>{candidate.title}</strong><small>{candidate.platform} · {candidate.feature}</small></span><button className="top-icon" title="查看候选链接" onClick={(event) => { event.stopPropagation(); notify('公开渠道链接为演示占位，需人工核验'); }}><ArrowRight size={14} /></button></div>)}<div className="analysis-public-note">公开渠道候选信息，仅供人工核验，不代表我方产品、价格或供货承诺。</div></div>}
            </div>)}
          </div>
        </>}
      </Surface>
    </div>

    <div className="analysis-action-bar"><div className="analysis-action-status"><span className="pulse-dot" />{analysisComplete ? `${matchRows.length}项已识别 · ${matchedCount}项已匹配 · ${pendingCount}项待确认` : '等待完成资料分析'}<small>演示数据</small></div><div className="analysis-action-buttons"><button className="btn btn-primary" disabled={!analysisComplete} onClick={downloadExcel}><Download size={15} />导出匹配结果</button><button className="btn" disabled={!analysisComplete} onClick={() => setSendPreviewOpen(true)}><Send size={15} />发送客户</button><button className="btn" disabled={!analysisComplete} onClick={openQuote}><FileText size={14} />生成报价草案</button><button className="btn btn-quiet" onClick={() => notify('已创建人工确认任务')}><UsersRound size={14} />请求人工确认</button><button className="btn btn-quiet" onClick={() => fileInput.current?.click()}><Plus size={14} />继续上传资料</button></div></div>

    <AnimatePresence>{sendPreviewOpen && <><motion.div className="drawer-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSendPreviewOpen(false)} /><motion.aside className="drawer analysis-send-drawer" initial={{ x: 30, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 30, opacity: 0 }}><div className="analysis-drawer-header"><div><div className="eyebrow">CUSTOMER PREVIEW</div><h2>发送客户预览</h2><div className="surface-kicker">发送前由销售确认，不执行真实发送</div></div><button className="top-icon" onClick={() => setSendPreviewOpen(false)}><X size={16} /></button></div><div className="analysis-send-summary"><span>收件客户</span><strong>{customer.name}</strong><span>匹配摘要</span><strong>已识别{matchRows.length}项 · 已匹配{matchedCount}项 · 待确认{pendingCount}项</strong></div><div className="analysis-message-preview">{sendPreviewText}</div><div className="analysis-public-note">演示预览，不会发送至微信、邮件或其他第三方平台。</div><div className="analysis-drawer-actions"><button className="btn" onClick={() => setSendPreviewOpen(false)}>取消</button><button className="btn btn-primary" onClick={() => { setSendPreviewOpen(false); notify('客户说明已生成，等待人工发送'); }}><Send size={14} />确认预览</button></div></motion.aside></>}</AnimatePresence>
  </div>;
}

export function AIReception() {
  const { demoSales, notify, navigate, currentCustomerId, setSalesCustomer, setRealQuoteDraft, updateDemoCustomer, updateDemoQuote } = useApp();
  const isPreview = window.location.search.includes('preview=');
  const [mode, setMode] = useState<ReceptionMode>(() => new URLSearchParams(window.location.search).get('preview') === 'real-analysis' ? 'analysis' : 'reception');
  const selectedCustomer = getDemoSalesCustomer(currentCustomerId);
  const selected = coreDemoSalesCustomers.findIndex((customer) => customer.customerId === selectedCustomer.customerId);
  const [messages, setMessages] = useState<ChatMessage[]>(() => selectedCustomer.aiReception.messages);
  const [profile, setProfile] = useState<CustomerProfile>(() => selectedCustomer.aiReception.profile);
  const [typing, setTyping] = useState(false);
  const [input, setInput] = useState('');
  const [needsHuman, setNeedsHuman] = useState(false);
  const streamTimer = useRef<number | null>(null);

  useEffect(() => () => {
    if (streamTimer.current) window.clearInterval(streamTimer.current);
  }, []);

  useEffect(() => {
    if (streamTimer.current) window.clearInterval(streamTimer.current);
    streamTimer.current = null;
    setMessages(selectedCustomer.aiReception.messages);
    setProfile(selectedCustomer.aiReception.profile);
    setTyping(false);
    setInput('');
    setNeedsHuman(false);
  }, [selectedCustomer]);

  useEffect(() => {
    window.requestAnimationFrame(() => document.querySelector('.page-content')?.scrollTo({ top: 0, behavior: 'auto' }));
  }, [mode]);

  const updateProfileFromQuestion = (question: string) => {
    const mentionsOutput = selectedCustomer.customerId === 'customer-jinhua-001' && /3000|三千/.test(question);
    setProfile((current) => mentionsOutput ? {
      ...current,
      dailyOutput: '约3000件',
      intent: '中高',
      action: '安排销售及技术人员沟通',
      tags: Array.from(new Set([...current.tags, '日产量已确认'])),
    } : {
      ...current,
      tags: Array.from(new Set([...current.tags, '新问题已记录'])),
    });
  };

  const streamReply = (question: string) => {
    const manualConfirmation = /价格|报价|多少钱|定制|交付|安装|调试|多久|周期|案例/.test(question);
    const mentionsOutput = selectedCustomer.customerId === 'customer-jinhua-001' && /3000|三千/.test(question);
    const reply = manualConfirmation
      ? '该问题需要人工确认，建议转交销售或技术人员。AI员工会先记录您的具体需求，再由专业人员确认正式报价、定制范围和交付安排。'
      : mentionsOutput
        ? '了解，已记录您主要生产金属配件，日产量约3000件。\n\n还需要确认工件尺寸、目前使用的喷涂材料和现场产线条件。我可以先为您登记需求，并安排专业人员进一步沟通。'
        : `${selectedCustomer.aiReception.defaultReply}\n\n我会先登记需求，复杂的技术判断将转交销售或技术人员确认。`;
    setNeedsHuman((current) => current || manualConfirmation);
    updateProfileFromQuestion(question);
    setTyping(true);
    const id = `ai-${Date.now()}`;
    setMessages((current) => [...current, { id, from: 'ai', text: '', streaming: true }]);
    let cursor = 0;
    streamTimer.current = window.setInterval(() => {
      cursor += 1;
      setMessages((current) => current.map((message) => message.id === id ? { ...message, text: reply.slice(0, cursor), streaming: cursor < reply.length } : message));
      if (cursor >= reply.length) {
        if (streamTimer.current) window.clearInterval(streamTimer.current);
        streamTimer.current = null;
        setTyping(false);
      }
    }, 24);
  };

  const ask = (question: string) => {
    const cleanQuestion = question.trim();
    if (!cleanQuestion || typing) return;
    setMessages((current) => [...current, { id: `customer-${Date.now()}`, from: 'customer', text: cleanQuestion }]);
    const currentRuntime = demoSales.customers[selectedCustomer.customerId];
    if (currentRuntime && ['客户发现', 'AI接待'].includes(currentRuntime.salesStage)) {
      updateDemoCustomer(selectedCustomer.customerId, { leadStatus: '需求确认中', salesStage: 'AI接待' });
    }
    setInput('');
    streamReply(cleanQuestion);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    ask(input);
  };

  const clientName = `${selectedCustomer.name}（演示客户）`;
  const openQuote = () => {
    updateDemoQuote(selectedCustomer.quoteId, '待人工确认');
    updateDemoCustomer(selectedCustomer.customerId, { leadStatus: '报价处理中', salesStage: '报价' });
    notify(`已带入${selectedCustomer.name}和${selectedCustomer.quoteProduct}`);
    navigate('quotes', getSalesContextForCustomer(selectedCustomer.customerId));
  };
  const openRealQuote = (handoff: RealQuoteDraftHandoff) => {
    const quoteDraft = { ...handoff, quoteId: selectedCustomer.quoteId };
    setRealQuoteDraft(quoteDraft);
    updateDemoQuote(selectedCustomer.quoteId, '草稿');
    updateDemoCustomer(selectedCustomer.customerId, { leadStatus: '报价处理中', salesStage: '报价' });
    notify(`已将${quoteDraft.items.length}项人工确认产品带入报价草案，价格待销售填写`);
    navigate('quotes', getSalesContextForCustomer(selectedCustomer.customerId));
  };
  return <>
    <PageHeader eyebrow="AI RECEPTION / 24×7" title="AI智能接待" description={mode === 'reception' ? 'AI回答常见问题、收集需求、提取客户信息，复杂问题转人工。' : '接收客户资料，自动识别产品并匹配企业方案。'} actions={<>{mode === 'reception' && <DemoNote />}<span className="demo-badge"><ShieldCheck size={13} />{mode === 'analysis' ? '真实资料分析' : '知识库已连接'}</span></>} />
    <div className="reception-mode-switch" role="tablist" aria-label="AI智能接待模式">
      <button className={mode === 'reception' ? 'active' : ''} role="tab" aria-selected={mode === 'reception'} onClick={() => setMode('reception')}><MessageSquare size={15} />智能接待</button>
      <button className={mode === 'analysis' ? 'active' : ''} role="tab" aria-selected={mode === 'analysis'} onClick={() => setMode('analysis')}><Search size={15} />资料分析与产品匹配</button>
    </div>
    {mode === 'analysis' ? <RealAnalysisWorkspace customer={selectedCustomer} notify={notify} onQuoteDraft={openRealQuote} onOpenCompany={() => navigate('company')} /> : <div className="three-layout">
      <Surface title="客户会话" kicker="3个演示客户" className="chat-list">
        {coreDemoSalesCustomers.map((customer, index) => <button key={customer.customerId} className={`chat-contact ${selected === index ? 'active' : ''}`} onClick={() => setSalesCustomer(customer.customerId)}><span className="avatar"><UserRound size={15} /></span><span style={{ minWidth: 0 }}><span className="chat-contact-name-line"><strong>{customer.name}</strong><span className="demo-client-tag">演示客户</span></span><span style={{ display: 'block', marginTop: 5, fontSize: 10, color: '#7187a9' }}>{demoSales.customers[customer.customerId]?.leadStatus ?? '待联系'} · {customer.lead.source}</span></span><MoreHorizontal size={14} style={{ marginLeft: 'auto' }} /></button>)}
        <div className="surface-subtle" style={{ marginTop: 15, padding: 12 }}><div className="surface-kicker">AI接待覆盖</div><div style={{ marginTop: 7, color: '#dce9ff', fontSize: 14 }}>7×24小时在线</div><div className="tiny-note" style={{ marginTop: 5 }}>基于企业知识库回答</div></div>
      </Surface>
      <Surface title="实时对话" kicker={clientName} className="chat-panel">
        <div className="chat-stream">
          {messages.map((message) => <motion.div key={message.id} initial={isPreview ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`chat-message-row ${message.from}`}><span className={`chat-avatar ${message.from}`}>{message.from === 'ai' ? <Bot size={16} /> : <UserRound size={16} />}</span><div className={`chat-message ${message.from}`}>{message.from === 'ai' && <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7, color: '#9fd0ff', fontSize: 10 }}><Bot size={13} />AI员工</div>}{message.text || '正在输入…'}{message.streaming && <span className="stream-caret" />}</div></motion.div>)}
          {typing && <motion.div className="typing-row" initial={{ opacity: 0 }} animate={{ opacity: 1 }}><span className="chat-avatar ai"><Bot size={16} /></span><span>AI员工正在输入</span><span className="typing-dots"><motion.i animate={{ opacity: [.25, 1, .25] }} transition={{ duration: .9, repeat: Infinity }} /><motion.i animate={{ opacity: [.25, 1, .25] }} transition={{ duration: .9, repeat: Infinity, delay: .15 }} /><motion.i animate={{ opacity: [.25, 1, .25] }} transition={{ duration: .9, repeat: Infinity, delay: .3 }} /></span></motion.div>}
        </div>
        <div className="surface-subtle quick-questions"><div className="surface-kicker" style={{ marginBottom: 9 }}>快捷提问 · 点击模拟客户发问</div><div className="chip-row">{selectedCustomer.aiReception.quickQuestions.map((question) => <button className="chip" key={question} onClick={() => ask(question)} disabled={typing}>{question}</button>)}</div></div>
        <form className="chat-input-wrap" onSubmit={handleSubmit}><input className="chat-input" value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); ask(input); } }} placeholder="输入客户问题……" disabled={typing} /><button className="btn btn-primary send-button" type="submit" disabled={typing || !input.trim()}><Send size={15} />发送消息</button></form>
        <div className="chat-actions"><button className={`btn ${needsHuman ? 'btn-primary human-required' : ''}`} onClick={() => notify('已生成销售跟进话术')}><MessageSquare size={14} />生成跟进话术</button><button className="btn" onClick={() => notify('客户已创建到线索池')}><Plus size={14} />创建客户</button>{needsHuman && <button className="btn btn-primary" onClick={() => notify('已转人工，销售及技术人员任务已生成')}><UsersRound size={14} />转人工</button>}</div>
      </Surface>
      <Surface title="客户画像" kicker="AI提取结果">
        {[['客户名称', clientName], ['行业', selectedCustomer.industry], ['地区', selectedCustomer.region], ['需求产品', selectedCustomer.demandProduct], ['产品型号', selectedCustomer.model], ['日产量', profile.dailyOutput], ['预算', profile.budget], ['意向等级', profile.intent], ['建议动作', profile.action]].map(([label, value]) => <div className="profile-item" key={label}><span>{label}</span><span>{value}</span></div>)}
        <div style={{ marginTop: 19 }}><div className="surface-kicker" style={{ marginBottom: 10 }}>客户标签</div><div className="chip-row">{profile.tags.map((tag) => <span className="chip" key={tag}>{tag}</span>)}</div></div>
        <div className="surface-subtle" style={{ marginTop: 18, padding: 13 }}><div style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#9ac6ff', fontSize: 11 }}><Clock3 size={14} />需要人工确认的内容</div><div className="tiny-note" style={{ marginTop: 8 }}>正式报价、定制方案、交付周期与技术配置由销售及专业人员确认。</div></div>
      </Surface>
    </div>}
  </>;
}
