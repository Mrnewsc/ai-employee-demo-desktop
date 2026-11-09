import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle, Bot, Check, CheckCircle2, ChevronDown, CircleStop, Download,
  ExternalLink, FileImage, FileSpreadsheet, FileText, FileType2, FolderOpen,
  Info, Lightbulb, LoaderCircle, Plus, RefreshCw, Search, Send, ShieldCheck,
  UploadCloud, X,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Surface } from '../../components/UI';
import type { DemoSalesCustomer } from '../../demo/demoSalesFlow';
import type { StagedFileToken, SourceLocation } from '../types';
import type { ProductMatchResult } from '../matching';
import type { ConfirmedMatchResult, RealAnalysisSnapshot, RealQuoteDraftHandoff } from '../pipeline';
import { realFileAnalysisClient } from '../clients/real-file-analysis-client';

type Props = {
  customer: DemoSalesCustomer;
  notify: (message: string) => void;
  onQuoteDraft: (handoff: RealQuoteDraftHandoff) => void;
  onOpenCompany: () => void;
};

const steps = [
  ['接收客户文件', ['queued', 'staging']],
  ['读取与解析', ['parsing', 'ocr']],
  ['提取产品信息', ['extracting']],
  ['查询企业产品库', ['matching', 'catalog-required']],
  ['产品匹配', ['matching']],
  ['生成人工确认结果', ['completed']],
] as const;

const terminalStatuses = new Set(['completed', 'failed', 'cancelled', 'catalog-required']);

const errorCopy: Record<string, string> = {
  PDF_PASSWORD_REQUIRED: '文件需要密码，请解除密码后重新上传。',
  FILE_CORRUPTED: '文件可能损坏，请重新导出后上传。',
  FILE_SIGNATURE_MISMATCH: '文件扩展名与真实格式不一致，请检查后重新上传。',
  OCR_FAILED: '图片文字识别失败，请上传更清晰的图片。',
  AI_NOT_CONFIGURED: 'AI分析服务尚未配置，请联系系统管理员。',
  AI_TIMEOUT: 'AI分析超时，可以重试或拆分文件后重新分析。',
  AI_REQUEST_FAILED: 'AI分析服务请求失败，请稍后重试。',
  AI_EMPTY_RESPONSE: 'AI分析服务未返回有效内容，请稍后重试。',
  AI_OUTPUT_TRUNCATED: '文件内容较复杂，请重试或拆分文件。',
  AI_RATE_LIMITED: 'AI分析服务当前繁忙，请稍后重试。',
  AI_INVALID_JSON: 'AI返回内容格式异常，请重试。',
  AI_SCHEMA_INVALID: 'AI提取结果未通过结构校验，请重试。',
  AI_EXTRACTION_FAILED: 'AI产品信息提取失败，请检查诊断后重试。',
  CATALOG_NOT_CONFIGURED: '尚未配置企业产品库，无法进行产品匹配。',
  REUPLOAD_REQUIRED: '原文件无法继续复用，请重新上传后再分析。',
  JOB_CANCELLED: '分析任务已取消。',
};

const levelCopy = {
  exact: '精确匹配',
  high: '高匹配',
  medium: '部分匹配',
  low: '低匹配',
  none: '未找到',
} as const;

function formatBytes(size: number) {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function fileIcon(type: StagedFileToken['detectedType']) {
  if (type === 'image') return <FileImage size={17} />;
  if (type === 'xlsx' || type === 'xls') return <FileSpreadsheet size={17} />;
  if (type === 'docx') return <FileType2 size={17} />;
  return <FileText size={17} />;
}

function locationText(source: SourceLocation) {
  if (source.kind === 'pdf') return `PDF 第${source.page}页`;
  if (source.kind === 'sheet') return `${source.sheet}${source.cell ? ` · ${source.cell}` : source.range ? ` · ${source.range}` : ''}`;
  if (source.kind === 'docx') {
    if (source.table !== undefined) return `Word 表格${source.table + 1}${source.row !== undefined ? ` · 第${source.row + 1}行` : ''}`;
    return `Word 第${(source.paragraph ?? 0) + 1}段`;
  }
  return `图片 ${source.imageId}`;
}

function evidenceKey(item: { evidenceId: string; sourceFile: string; source: SourceLocation }) {
  return `${item.evidenceId}:${item.sourceFile}:${JSON.stringify(item.source)}`;
}

function fileStatus(snapshot: RealAnalysisSnapshot | null, fileId: string) {
  const status = snapshot?.files.find((file) => file.fileId === fileId)?.status;
  if (status === 'parsed') return ['解析完成', 'success'];
  if (status === 'reading') return ['正在读取', 'running'];
  if (status === 'ocr') return ['OCR处理中', 'running'];
  if (status === 'failed') return ['失败', 'attention'];
  return ['待处理', ''];
}

function stepState(snapshot: RealAnalysisSnapshot | null, index: number) {
  if (!snapshot) return '';
  if (snapshot.status === 'failed' || snapshot.status === 'cancelled') return index === Math.max(0, steps.findIndex(([, statuses]) => statuses.includes(snapshot.status as never))) ? 'running' : '';
  const active = steps.findIndex(([, statuses]) => statuses.includes(snapshot.status as never));
  if (snapshot.status === 'completed') return 'done';
  if (snapshot.status === 'catalog-required') return index < 3 ? 'done' : index === 3 ? 'running' : '';
  if (active < 0) return '';
  return index < active ? 'done' : index === active ? 'running' : '';
}

function primaryResult(snapshot: RealAnalysisSnapshot, productId: string) {
  return snapshot.matchGroups.find((group) => group.extractedProductId === productId)?.results[0] ?? null;
}

function candidateStatus(result: ProductMatchResult | null) {
  if (!result || result.level === 'none') return '未找到';
  return result.level === 'exact' || result.level === 'high' ? '有候选' : '候选待确认';
}

export function RealAnalysisWorkspace({ customer, notify, onQuoteDraft, onOpenCompany }: Props) {
  const [files, setFiles] = useState<StagedFileToken[]>([]);
  const [snapshot, setSnapshot] = useState<RealAnalysisSnapshot | null>(null);
  const [confirmations, setConfirmations] = useState<Record<string, ConfirmedMatchResult>>({});
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [evidenceProduct, setEvidenceProduct] = useState<string | null>(null);
  const [sendPreview, setSendPreview] = useState(false);
  const [technicalOpen, setTechnicalOpen] = useState(false);
  const mounted = useRef(true);

  useEffect(() => () => { mounted.current = false; }, []);

  useEffect(() => {
    setFiles([]);
    setSnapshot(null);
    setConfirmations({});
    setExpanded(null);
    setEvidenceProduct(null);
    realFileAnalysisClient.resume(customer.customerId).then((resumed) => {
      if (!mounted.current || !resumed || resumed.customerId !== customer.customerId) return;
      setSnapshot(resumed);
      setFiles(resumed.files.map((file) => ({
        schemaVersion: '1.0', fileId: file.fileId, displayName: file.fileName, size: file.size,
        declaredMimeType: '', detectedType: file.fileType, sha256: '', createdAt: resumed.startedAt ?? new Date().toISOString(),
      })));
      setConfirmations(realFileAnalysisClient.getConfirmations(resumed.jobId));
    }).catch(() => undefined);
  }, [customer.customerId]);

  useEffect(() => realFileAnalysisClient.onProgress((next) => {
    if (next.customerId !== customer.customerId) return;
    setSnapshot(next);
    setConfirmations(realFileAnalysisClient.getConfirmations(next.jobId));
  }), [customer.customerId]);

  const addTokens = (tokens: StagedFileToken[]) => {
    setFiles((current) => {
      const byId = new Map([...current, ...tokens].map((file) => [file.fileId, file]));
      return [...byId.values()].slice(0, 10);
    });
    if (tokens.length) notify(`已安全接收${tokens.length}个客户文件`);
  };

  const selectFiles = async () => {
    try { addTokens(await realFileAnalysisClient.selectFiles()); }
    catch (error) { notify(error instanceof Error ? error.message : '文件选择失败'); }
  };

  const dropFiles = async (incoming: FileList) => {
    try { addTokens(await realFileAnalysisClient.stageFiles(incoming)); }
    catch (error) { notify(error instanceof Error ? error.message : '文件暂存失败'); }
  };

  const start = async () => {
    if (!files.length || busy) return;
    setBusy(true);
    setConfirmations({});
    try {
      const next = await realFileAnalysisClient.startAnalysis(customer.customerId, files.map((file) => file.fileId));
      setSnapshot(next);
    } catch (error) {
      notify(error instanceof Error ? error.message : '无法启动资料分析');
    } finally { setBusy(false); }
  };

  const cancel = async () => {
    if (!snapshot || terminalStatuses.has(snapshot.status) || busy) return;
    setBusy(true);
    try { setSnapshot(await realFileAnalysisClient.cancel(snapshot.jobId)); }
    finally { setBusy(false); }
  };

  const retry = async () => {
    if (!snapshot || busy) return;
    setBusy(true);
    setConfirmations({});
    try { setSnapshot(await realFileAnalysisClient.retry(snapshot.jobId)); }
    catch (error) { notify(error instanceof Error ? error.message : '当前任务无法重试，请重新上传'); }
    finally { setBusy(false); }
  };

  const decide = (productId: string, decision: ConfirmedMatchResult['decision'], productCandidateId: string | null, note = '') => {
    if (!snapshot) return;
    try {
      const result = realFileAnalysisClient.confirmMatch(snapshot.jobId, productId, decision, productCandidateId, snapshot, note);
      setConfirmations((current) => ({ ...current, [productId]: result }));
      notify(decision === 'not-found' ? '已标记为未找到，等待人工处理' : decision === 'pending' ? '已保留为暂不确认' : '已记录人工确认结果');
    } catch (error) { notify(error instanceof Error ? error.message : '无法保存确认结果'); }
  };

  const products = snapshot?.extractedProducts ?? [];
  const unresolvedCount = products.filter((product) => (confirmations[product.id]?.decision ?? 'pending') === 'pending').length;
  const confirmedCount = products.filter((product) => ['accepted', 'changed'].includes(confirmations[product.id]?.decision ?? '')).length;
  const noneCount = products.filter((product) => primaryResult(snapshot!, product.id)?.level === 'none').length;
  const exactCount = products.filter((product) => primaryResult(snapshot!, product.id)?.level === 'exact').length;
  const candidateCount = products.filter((product) => ['high', 'medium', 'low'].includes(primaryResult(snapshot!, product.id)?.level ?? '')).length;
  const isRunning = snapshot ? !terminalStatuses.has(snapshot.status) : false;
  const isMatchReady = snapshot?.status === 'completed';
  const quoteReady = Boolean(isMatchReady && products.length && unresolvedCount === 0 && confirmedCount > 0);

  const warningLines = useMemo(() => {
    if (!snapshot) return [];
    const lines = snapshot.extractionWarnings.slice(0, 3).map((warning) => warning.message);
    if (snapshot.status === 'catalog-required') lines.unshift('已完成产品提取，匹配正在等待企业产品库。');
    return [...new Set(lines)].slice(0, 3);
  }, [snapshot]);

  const evidenceItems = evidenceProduct ? products.find((product) => product.id === evidenceProduct)?.evidence ?? [] : [];

  const createQuote = () => {
    if (!snapshot) return;
    try { onQuoteDraft(realFileAnalysisClient.createQuoteDraft(snapshot)); }
    catch (error) { notify(error instanceof Error ? error.message : '无法生成报价草案'); }
  };

  const exportXlsx = () => {
    if (!snapshot || unresolvedCount) return notify(`还有${unresolvedCount}个产品需要人工确认`);
    const rows = products.map((product) => {
      const confirmation = confirmations[product.id];
      const selected = snapshot.matchGroups.find((group) => group.extractedProductId === product.id)?.results.find((result) => result.candidateProductId === confirmation?.selectedProductId);
      return {
        客户产品名称: product.productName ?? '', 客户型号: product.model ?? '',
        客户规格: Object.entries(product.specifications).map(([key, value]) => `${key}:${value}`).join('；'),
        我方确认产品: selected?.candidateProductSnapshot?.productName ?? '', 我方型号: selected?.candidateProductSnapshot?.model ?? '',
        匹配状态: selected ? levelCopy[selected.level] : '未找到',
        匹配依据: selected?.matchedRules.map((rule) => rule.description).join('；') ?? '',
        冲突: selected?.conflictingRules.map((rule) => rule.description).join('；') ?? '',
        人工确认结果: confirmation?.decision ?? 'pending', 来源文件: product.sourceFile,
      };
    });
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows), '产品匹配结果');
    XLSX.writeFile(book, `${customer.name}-产品匹配结果.xlsx`);
    notify('已导出真实XLSX匹配结果');
  };

  const startLabel = isRunning ? snapshot?.progress.message : snapshot?.status === 'completed' ? '重新开始分析' : '开始真实分析';

  return <div className="analysis-workspace real-analysis-workspace">
    <div className="analysis-layout">
      <Surface title="客户资料" kicker={`${files.length}个文件 · 本地安全暂存`} className="analysis-files-panel">
        <div className={`analysis-dropzone ${dragging ? 'dragging' : ''}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); void dropFiles(event.dataTransfer.files); }} onClick={() => void selectFiles()} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter') void selectFiles(); }}>
          <UploadCloud size={22} /><strong>{dragging ? '松开后安全暂存' : '拖入客户资料'}</strong><span>PDF、DOCX、XLS、XLSX、JPG、PNG</span><small>界面不显示本地真实路径</small>
        </div>
        <div className="analysis-file-list">
          {!files.length && <div className="analysis-mini-empty">尚未选择文件</div>}
          {files.map((file) => { const [label, className] = fileStatus(snapshot, file.fileId); return <div className="analysis-file-item" key={file.fileId}><span className={`analysis-file-icon ${file.detectedType}`}>{fileIcon(file.detectedType)}</span><span className="analysis-file-copy"><strong title={file.displayName}>{file.displayName}</strong><small>{formatBytes(file.size)} · {file.detectedType.toUpperCase()}</small></span><span className={`analysis-file-status ${className}`}><i />{label}</span></div>; })}
        </div>
        <div className="analysis-client-context"><div className="surface-kicker">当前客户上下文</div><strong>{customer.name}</strong><div><span>行业</span><span>{customer.industry}</span></div><div><span>需求方向</span><span>{customer.demandProduct}</span></div><div><span>客户ID</span><span>{customer.customerId}</span></div></div>
      </Surface>

      <Surface className="analysis-process-panel">
        <div className="analysis-process-header"><div className="ai-analysis-identity"><span className="ai-analysis-avatar"><Bot size={19} /></span><div><div className="surface-title">AI分析过程</div><div className="surface-kicker">真实解析 · 可取消 · 可追溯</div></div></div><span className={`analysis-live-status ${snapshot?.status === 'completed' ? 'complete' : isRunning ? 'running' : ''}`}><i />{snapshot?.progress.message ?? '等待文件'}</span></div>
        <div className="analysis-process-body"><div className="analysis-step-list">{steps.map(([label], index) => { const state = stepState(snapshot, index); return <div className={`analysis-step ${state}`} key={label}><span className="analysis-step-marker">{state === 'done' ? <Check size={12} /> : index + 1}</span><span><strong>{label}</strong><small>{state === 'done' ? '已完成' : state === 'running' ? '正在处理' : '等待处理'}</small></span></div>; })}</div>
          <div className="analysis-current-result"><div className="analysis-current-kicker">{snapshot?.progress.message ?? '上传客户资料后开始真实分析'}</div>
            {!snapshot && <div className="analysis-start-state"><FolderOpen size={25} /><strong>准备分析客户资料</strong><span>系统将真实读取文件、提取产品并查询企业产品库。</span></div>}
            {snapshot && <>
              {snapshot.status === 'completed' && <div className="analysis-complete-state"><CheckCircle2 size={17} /><div><strong>客户资料分析完成，已生成产品匹配候选。</strong><span>{products.length}项已识别 · {exactCount}项精确匹配 · {unresolvedCount}项待人工确认</span></div></div>}
              {snapshot.status === 'catalog-required' && <div className="analysis-catalog-required"><AlertTriangle size={17} /><div><strong>企业产品库尚未准备好</strong><span>已识别{products.length}个客户产品，产品匹配暂停。</span><button className="btn btn-quiet" onClick={onOpenCompany}>前往企业配置<ExternalLink size={13} /></button></div></div>}
              {snapshot.error && <div className="analysis-error-box"><AlertTriangle size={17} /><div><strong>{errorCopy[snapshot.error.code] ?? '资料分析未完成，请检查文件后重试。'}</strong><span>错误代码：{snapshot.error.code}</span><button className="link-button" onClick={() => setTechnicalOpen((value) => !value)}>查看技术详情</button>{technicalOpen && <code>{snapshot.error.technicalDetail ?? snapshot.error.message}</code>}</div></div>}
              {products[0] && <div className="analysis-field-list"><div className="analysis-field"><span>产品名称</span><strong>{products[0].productName ?? '—'}</strong></div><div className="analysis-field"><span>客户型号</span><strong>{products[0].model ?? '—'}</strong></div><div className="analysis-field"><span>数量</span><strong>{products[0].quantity.raw ?? '—'}</strong></div><div className="analysis-field"><span>工艺 / 应用</span><strong>{[products[0].process, products[0].application].filter(Boolean).join(' · ') || '—'}</strong></div></div>}
              <div className="analysis-audit-box"><div className="analysis-section-title"><Search size={14} />当前判断</div>{warningLines.length ? warningLines.map((line) => <div className="analysis-audit-line" key={line}><AlertTriangle size={13} />{line}</div>) : <div className="analysis-audit-line"><ShieldCheck size={13} />{isRunning ? '任务按真实处理状态推进，不使用固定计时器。' : '等待人工核验匹配候选与原始依据。'}</div>}</div>
            </>}
          </div>
        </div>
        <div className="analysis-advice"><div className="analysis-section-title"><Lightbulb size={14} />AI建议</div><strong>{unresolvedCount ? `请人工核验${unresolvedCount}个产品后再生成报价草案。` : isMatchReady ? '匹配结果已完成核验，可以生成报价草案。' : '请等待真实解析与匹配完成。'}</strong><span>AI只提供候选与依据，不自动确认产品、价格或技术可行性。</span></div>
        <div className="analysis-run-actions"><button className="analysis-start-button btn btn-primary" onClick={() => void start()} disabled={!files.length || isRunning || busy}>{isRunning ? <LoaderCircle className="spin" size={15} /> : <Search size={15} />}{startLabel}</button>{isRunning && <button className="btn btn-quiet" onClick={() => void cancel()} disabled={busy}><CircleStop size={14} />取消分析</button>}{snapshot && ['failed', 'cancelled', 'catalog-required'].includes(snapshot.status) && <button className="btn" onClick={() => void retry()} disabled={busy}><RefreshCw size={14} />重试</button>}</div>
      </Surface>

      <Surface title="产品匹配结果" kicker={isMatchReady ? '真实候选 · 等待人工确认' : '完成匹配后生成结果'} className="analysis-results-panel">
        <div className="analysis-summary analysis-summary-five"><div><strong>{products.length || '—'}</strong><span>识别产品</span></div><div><strong>{isMatchReady ? exactCount : '—'}</strong><span>精确匹配</span></div><div><strong>{isMatchReady ? candidateCount : '—'}</strong><span>有候选</span></div><div><strong>{isMatchReady ? noneCount : '—'}</strong><span>未找到</span></div><div><strong>{isMatchReady ? unresolvedCount : '—'}</strong><span>待确认</span></div></div>
        {!products.length ? <div className="analysis-results-empty"><FileText size={24} /><strong>等待真实分析结果</strong><span>提取成功后，这里会显示客户产品和企业产品库候选。</span></div> : <div className="real-match-list">
          {products.map((product) => {
            const group = snapshot?.matchGroups.find((entry) => entry.extractedProductId === product.id);
            const result = group?.results[0] ?? null;
            const decision = confirmations[product.id]?.decision ?? 'pending';
            const selectedId = confirmations[product.id]?.selectedProductId ?? result?.candidateProductId ?? null;
            const ocrUncertain = snapshot?.extractionWarnings.some((warning) => warning.productId === product.id && warning.code === 'OCR_MODEL_UNCERTAIN');
            return <div className={`real-match-card level-${result?.level ?? 'none'} ${expanded === product.id ? 'expanded' : ''}`} key={product.id}>
              <button className="real-match-main" onClick={() => setExpanded((current) => current === product.id ? null : product.id)}><span><strong>{product.productName ?? '未识别产品名称'}</strong><small>客户型号：{product.model ?? '—'}{ocrUncertain ? ' · 型号识别存在不确定性' : ''}</small></span><span><strong>{result?.candidateProductSnapshot?.productName ?? '企业产品库未找到对应产品'}</strong><small>企业型号：{result?.candidateProductSnapshot?.model ?? '—'}</small></span><span className={`match-level level-${result?.level ?? 'none'}`}>{result ? levelCopy[result.level] : '等待匹配'}</span><span className="match-candidate-state">{candidateStatus(result)}</span><span className={`manual-decision decision-${decision}`}>{decision === 'accepted' ? '已确认' : decision === 'changed' ? '人工更换' : decision === 'not-found' ? '已标记未找到' : '待人工确认'}</span><ChevronDown size={15} /></button>
              {expanded === product.id && <div className="real-match-detail"><div className="real-match-evidence-summary"><div><span>主要匹配依据</span><p>{result?.matchedRules.map((rule) => rule.description).join('；') || '暂无可靠匹配依据'}</p></div><div><span>主要冲突 / 需确认原因</span><p>{result?.conflictingRules.map((rule) => rule.description).join('；') || result?.reviewReasons.join('；') || '无明显冲突'}</p></div></div>
                <div className="real-match-detail-actions"><button className="btn btn-quiet" onClick={() => setEvidenceProduct(product.id)}><Search size={13} />查看原始依据</button>{result?.candidateProductId && <button className="btn" onClick={() => decide(product.id, 'accepted', result.candidateProductId, '人工确认首选候选')}><CheckCircle2 size={13} />确认匹配</button>}<button className="btn btn-quiet" onClick={() => decide(product.id, 'not-found', null, '人工标记未找到')}>标记未找到</button><button className="btn btn-quiet" onClick={() => decide(product.id, 'pending', null)}>暂不确认</button></div>
                {(group?.results.length ?? 0) > 1 && <div className="real-alternatives"><span>其他候选产品</span>{group!.results.slice(1).filter((item) => item.candidateProductSnapshot).map((candidate) => <button className={selectedId === candidate.candidateProductId ? 'selected' : ''} key={candidate.matchId} onClick={() => decide(product.id, 'changed', candidate.candidateProductId, '人工选择其他候选')}><strong>{candidate.candidateProductSnapshot!.productName} · {candidate.candidateProductSnapshot!.model}</strong><small>{levelCopy[candidate.level]} · {candidate.matchedRules.slice(0, 2).map((rule) => rule.description).join('；') || '请人工核验'}</small></button>)}</div>}
              </div>}
            </div>;
          })}
        </div>}
      </Surface>
    </div>

    <div className="analysis-action-bar"><div className="analysis-action-status"><span className="pulse-dot" />{snapshot ? `${products.length}项识别 · ${confirmedCount}项确认 · ${unresolvedCount}项待确认` : '等待上传真实客户资料'}<small>结果需人工核验</small></div><div className="analysis-action-buttons"><button className="btn" disabled={!isMatchReady || unresolvedCount > 0} onClick={exportXlsx}><Download size={15} />导出匹配结果</button><button className="btn" disabled={!quoteReady} onClick={() => setSendPreview(true)}><Send size={15} />发送预览</button><button className="btn btn-primary" disabled={!quoteReady} title={unresolvedCount ? `还有${unresolvedCount}个产品需要人工确认` : ''} onClick={createQuote}><FileText size={14} />生成报价草案</button><button className="btn btn-quiet" onClick={() => void selectFiles()}><Plus size={14} />继续上传资料</button></div></div>

    <AnimatePresence>{evidenceProduct && <><motion.div className="drawer-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setEvidenceProduct(null)} /><motion.aside className="drawer analysis-evidence-drawer" initial={{ x: 30, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 30, opacity: 0 }}><div className="analysis-drawer-header"><div><div className="eyebrow">SOURCE EVIDENCE</div><h2>原始识别依据</h2><div className="surface-kicker">可追溯到客户原文件位置</div></div><button className="top-icon" onClick={() => setEvidenceProduct(null)}><X size={16} /></button></div><div className="evidence-list">{evidenceItems.map((item) => <div className="evidence-item" key={evidenceKey(item)}><span>{item.sourceFile}</span><strong>{locationText(item.source)}</strong><p>{item.text}</p>{item.confidence !== null && item.confidence < 0.75 && <small>低置信度识别 · 需要人工核验</small>}</div>)}</div><button className="link-button" onClick={() => setTechnicalOpen((value) => !value)}>{technicalOpen ? '隐藏技术位置详情' : '显示技术位置详情'}</button>{technicalOpen && <pre>{JSON.stringify(evidenceItems.map((item) => ({ evidenceId: item.evidenceId, sourceFile: item.sourceFile, source: item.source, confidence: item.confidence })), null, 2)}</pre>}</motion.aside></>}</AnimatePresence>

    <AnimatePresence>{sendPreview && <><motion.div className="drawer-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSendPreview(false)} /><motion.aside className="drawer analysis-send-drawer" initial={{ x: 30, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 30, opacity: 0 }}><div className="analysis-drawer-header"><div><div className="eyebrow">CUSTOMER PREVIEW</div><h2>发送客户预览</h2><div className="surface-kicker">只包含人工确认后的匹配结果</div></div><button className="top-icon" onClick={() => setSendPreview(false)}><X size={16} /></button></div><div className="analysis-message-preview">尊敬的客户：{`\n`}根据您提供的资料，我们已完成人工核验后的初步产品匹配。{`\n`}本次共有{confirmedCount}项产品进入匹配结果。正式配置、报价和交付周期以人工确认结果为准。</div><div className="analysis-public-note">本功能仅生成预览，不会连接微信、邮件或其他第三方平台。</div><div className="analysis-drawer-actions"><button className="btn" onClick={() => setSendPreview(false)}>返回</button><button className="btn btn-primary" onClick={() => { setSendPreview(false); notify('发送预览已确认，未执行真实发送'); }}><Send size={14} />确认预览</button></div></motion.aside></>}</AnimatePresence>
  </div>;
}
