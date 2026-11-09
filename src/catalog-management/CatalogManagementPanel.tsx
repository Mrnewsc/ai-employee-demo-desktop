import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle,
  Archive,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  FileSpreadsheet,
  History,
  LoaderCircle,
  Package,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react';
import { useApp } from '../stores/AppStore';
import { catalogManagementClient } from './catalog-management-client';
import type {
  CatalogImportPreview,
  CatalogListQuery,
  CatalogProductDetail,
  CatalogProductPage,
  CatalogSummary,
  CatalogVersions,
} from './contracts';
import type { ImportIssue, ProductRecord } from '../real-ai/catalog/contracts';
import type { StagedFileToken } from '../real-ai/types';

const defaultQuery: CatalogListQuery = {
  search: '',
  status: 'all',
  category: '',
  sort: 'updated-desc',
  page: 1,
  pageSize: 20,
};

type ImportStage = 'select' | 'selecting' | 'previewing' | 'preview' | 'confirm' | 'committing' | 'done';
type ImportCompletion = { version: number; productCount: number; importedRows: number; normalRows: number; warningRows: number; updatedAt: string };

function formatDate(value: string | null) {
  if (!value) return '暂无记录';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false });
}

function issueSuggestion(issue: ImportIssue) {
  if (/required|missing|empty/i.test(issue.code)) return '请补充必填内容后重新导入';
  if (/duplicate/i.test(issue.code)) return '请检查重复的产品编号或型号';
  if (/status/i.test(issue.code)) return '状态请填写 active 或 inactive';
  if (/header|column|mapping/i.test(issue.code)) return '请使用标准模板并检查表头名称';
  return '请按问题说明修改原表后重新导入';
}

function friendlyMappingTarget(target: string) {
  if (target === 'productId') return '产品编号';
  if (target === 'productName') return '产品名称';
  if (target === 'model') return '型号';
  if (target === 'category') return '产品分类';
  if (target === 'status') return '状态';
  if (target === 'applications') return '应用场景';
  if (target === 'keywords') return '关键词';
  if (target === 'synonyms') return '同义词';
  if (target === 'description') return '产品说明';
  if (target.startsWith('specification.')) return `规格参数 · ${target.slice('specification.'.length)}`;
  return target;
}

function StatusPill({ status }: { status: ProductRecord['status'] }) {
  return <span className={`catalog-status ${status}`}>{status === 'active' ? '启用' : '停用'}</span>;
}

function LoadingBlock({ text = '正在读取企业产品库…' }: { text?: string }) {
  return <div className="catalog-state"><LoaderCircle className="catalog-spin" /><span>{text}</span></div>;
}

function ErrorBlock({ message, retry }: { message: string; retry: () => void }) {
  return <div className="catalog-state error"><AlertCircle /><strong>读取失败</strong><span>{message}</span><button className="btn" onClick={retry}><RefreshCw />重试</button></div>;
}

export function CatalogManagementPanel() {
  const { notify } = useApp();
  const [summary, setSummary] = useState<CatalogSummary | null>(null);
  const [page, setPage] = useState<CatalogProductPage | null>(null);
  const [query, setQuery] = useState<CatalogListQuery>(defaultQuery);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<CatalogProductDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importStage, setImportStage] = useState<ImportStage>('select');
  const [selectedFile, setSelectedFile] = useState<StagedFileToken | null>(null);
  const [importPreview, setImportPreview] = useState<CatalogImportPreview | null>(null);
  const [importCompletion, setImportCompletion] = useState<ImportCompletion | null>(null);
  const [importError, setImportError] = useState('');
  const [versions, setVersions] = useState<CatalogVersions | null>(null);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [rollbackTarget, setRollbackTarget] = useState<number | null>(null);
  const [rollingBack, setRollingBack] = useState(false);

  const loadCatalog = useCallback(async (nextQuery: CatalogListQuery = query) => {
    setLoading(true);
    setError('');
    try {
      const [nextSummary, nextPage] = await Promise.all([
        catalogManagementClient.getSummary(),
        catalogManagementClient.listProducts(nextQuery),
      ]);
      setSummary(nextSummary);
      setPage(nextPage);
      if (nextPage.page !== nextQuery.page) setQuery((current) => ({ ...current, page: nextPage.page }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '企业产品库读取失败');
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadCatalog(query), query.search ? 220 : 0);
    return () => window.clearTimeout(timeout);
  }, [query, loadCatalog]);

  const updateQuery = <K extends keyof CatalogListQuery>(key: K, value: CatalogListQuery[K]) => {
    setQuery((current) => ({ ...current, [key]: value, page: key === 'page' ? Number(value) : 1 }));
  };

  const openDetail = async (productId: string) => {
    setDetail(null);
    setDetailsExpanded(false);
    setDetailLoading(true);
    try {
      setDetail(await catalogManagementClient.getProductDetail(productId));
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : '产品详情读取失败');
    } finally {
      setDetailLoading(false);
    }
  };

  const resetImport = async () => {
    if (importPreview?.importId && importStage !== 'done') {
      await catalogManagementClient.discardImport(importPreview.importId).catch(() => undefined);
    }
    setSelectedFile(null);
    setImportPreview(null);
    setImportCompletion(null);
    setImportError('');
    setImportStage('select');
  };

  const closeImport = async () => {
    if (importStage === 'committing') {
      notify('产品库正在更新，请稍候');
      return;
    }
    await resetImport();
    setImportOpen(false);
  };

  const chooseImport = async () => {
    setImportError('');
    setImportStage('selecting');
    try {
      const file = await catalogManagementClient.selectImportFile();
      if (!file) {
        setImportStage('select');
        return;
      }
      setSelectedFile(file);
      setImportStage('previewing');
      const preview = await catalogManagementClient.previewImport(file.fileId);
      setImportPreview(preview);
      setImportStage('preview');
    } catch (reason) {
      setImportStage('select');
      setImportError(reason instanceof Error ? reason.message : '文件读取失败，请检查文件格式');
    }
  };

  const commitImport = async () => {
    if (!importPreview || importPreview.failedRows > 0 || importPreview.errors.length > 0) return;
    setImportStage('committing');
    setImportError('');
    try {
      const result = await catalogManagementClient.commitImport(importPreview.importId);
      setImportCompletion({
        version: result.version.currentVersion,
        productCount: result.version.productCount,
        importedRows: result.report.successRows + result.report.warningRows,
        normalRows: result.report.successRows,
        warningRows: result.report.warningRows,
        updatedAt: result.version.updatedAt,
      });
      setImportStage('done');
      await loadCatalog({ ...query, page: 1 });
      notify('企业产品库已更新，匹配引擎将使用新版本');
    } catch (reason) {
      setImportStage('confirm');
      setImportError(reason instanceof Error ? reason.message : '产品库更新失败，原版本保持不变');
    }
  };

  const downloadTemplate = async () => {
    try {
      const result = await catalogManagementClient.saveTemplate();
      if (result.saved) notify(`标准模板已保存：${result.fileName}`);
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : '模板保存失败');
    }
  };

  const openVersions = async () => {
    setVersionsOpen(true);
    setVersionsLoading(true);
    try {
      setVersions(await catalogManagementClient.getVersions());
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : '版本记录读取失败');
    } finally {
      setVersionsLoading(false);
    }
  };

  const rollback = async () => {
    if (!rollbackTarget) return;
    setRollingBack(true);
    try {
      const result = await catalogManagementClient.rollback(rollbackTarget);
      notify(`已基于 V${result.restoredFromVersion} 创建新的审计版本 V${result.version.currentVersion}`);
      setRollbackTarget(null);
      setVersions(await catalogManagementClient.getVersions());
      await loadCatalog({ ...query, page: 1 });
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : '版本回滚失败');
    } finally {
      setRollingBack(false);
    }
  };

  const summaryItems = useMemo(() => [
    ['产品总数', summary?.productCount ?? 0, Package],
    ['启用产品', summary?.activeCount ?? 0, Check],
    ['停用产品', summary?.inactiveCount ?? 0, Archive],
    ['当前版本', summary?.currentVersionLabel ?? '未配置', History],
  ] as const, [summary]);

  if (loading && !summary) return <LoadingBlock />;
  if (error && !summary) return <ErrorBlock message={error} retry={() => void loadCatalog(query)} />;

  return <div className="catalog-workspace">
    <section className="catalog-summary-grid" aria-label="产品库摘要">
      {summaryItems.map(([label, value, Icon]) => <div className="catalog-summary" key={label}>
        <div><span>{label}</span><strong>{value}</strong></div><Icon />
      </div>)}
    </section>

    <section className="surface catalog-main">
      <div className="catalog-toolbar">
        <div className="catalog-toolbar-copy">
          <div className="surface-title">企业产品目录</div>
          <div className="surface-kicker">真实产品库 · 当前匹配引擎使用 {summary?.matchEngineVersionLabel ?? '未配置'}</div>
        </div>
        <div className="catalog-toolbar-actions">
          {summary?.configured && <button className="btn btn-quiet" onClick={downloadTemplate}><Download />下载标准模板</button>}
          <button className={`btn ${summary?.configured ? '' : 'btn-quiet'}`} onClick={openVersions}><History />版本记录</button>
          {summary?.configured && <button className="btn btn-primary" onClick={() => setImportOpen(true)}><Upload />导入产品库</button>}
        </div>
      </div>

      <div className="catalog-status-strip">
        <span><i className={summary?.configured ? 'ready' : ''} />当前状态：<strong>{summary?.configured ? '已配置' : '未配置'}</strong></span>
        <span>最近更新：<strong>{formatDate(summary?.updatedAt ?? null)}</strong></span>
        <span>最近导入：<strong>{summary?.lastImportStatus === 'success' ? '成功' : summary?.lastImportStatus === 'preview-ready' ? '待确认' : summary?.lastImportStatus === 'invalid' ? '校验未通过' : summary?.lastImportStatus === 'rollback-success' ? '回滚成功' : summary?.lastImportStatus === 'failed' ? '失败' : '无记录'}</strong></span>
        <span>匹配引擎：<strong>{summary?.matchEngineVersionLabel ?? '未配置'}</strong></span>
      </div>

      <div className="catalog-filters">
        <label className="catalog-search"><Search /><input value={query.search} onChange={(event) => updateQuery('search', event.target.value)} placeholder="搜索产品名称、型号、关键词" /></label>
        <select className="select" value={query.status} onChange={(event) => updateQuery('status', event.target.value as CatalogListQuery['status'])}>
          <option value="all">全部状态</option><option value="active">启用</option><option value="inactive">停用</option>
        </select>
        <select className="select" value={query.category} onChange={(event) => updateQuery('category', event.target.value)}>
          <option value="">全部分类</option>{page?.categories.map((category) => <option key={category}>{category}</option>)}
        </select>
        <select className="select" value={query.sort} onChange={(event) => updateQuery('sort', event.target.value as CatalogListQuery['sort'])}>
          <option value="updated-desc">最近更新</option><option value="name-asc">产品名称</option><option value="model-asc">型号顺序</option>
        </select>
      </div>

      {loading ? <LoadingBlock text="正在更新产品列表…" /> : page?.items.length ? <>
        <div className="catalog-table" role="table">
          <div className="catalog-table-head" role="row"><span>产品</span><span>分类</span><span>核心规格</span><span>关键词 / 场景</span><span>状态</span><span>更新时间</span></div>
          {page.items.map((product) => <button className="catalog-product-row" role="row" key={product.productId} onClick={() => void openDetail(product.productId)}>
            <span className="catalog-product-name"><strong>{product.productName}</strong><small>{product.model || '型号待补充'}</small></span>
            <span>{product.category || '未分类'}</span>
            <span className="catalog-spec-brief">{Object.entries(product.specifications).slice(0, 2).map(([name, value]) => <small key={name}>{name}：{value}</small>)}{!Object.keys(product.specifications).length && <small>暂无规格</small>}</span>
            <span className="catalog-keywords">{[...product.keywords.slice(0, 1), ...product.applications.slice(0, 1)].map((keyword) => <small key={keyword}>{keyword}</small>)}</span>
            <span><StatusPill status={product.status} /></span>
            <span className="catalog-date">{formatDate(product.updatedAt)}</span>
          </button>)}
        </div>
        <div className="catalog-pagination">
          <span>共 {page.total} 项</span>
          <label>每页<select value={query.pageSize} onChange={(event) => updateQuery('pageSize', Number(event.target.value) as CatalogListQuery['pageSize'])}><option>20</option><option>50</option><option>100</option></select></label>
          <button className="top-icon" disabled={page.page <= 1} onClick={() => updateQuery('page', page.page - 1)}><ChevronLeft /></button>
          <span>{page.page} / {page.totalPages}</span>
          <button className="top-icon" disabled={page.page >= page.totalPages} onClick={() => updateQuery('page', page.page + 1)}><ChevronRight /></button>
        </div>
      </> : <div className="catalog-empty">
        <Package />
        <h3>{summary?.configured ? '没有符合条件的产品' : '尚未配置企业产品库'}</h3>
        <p>{summary?.configured ? '调整关键词或筛选条件后再试。' : '导入企业现有产品资料后，AI即可将客户需求与企业产品进行匹配。'}</p>
        {!summary?.configured && <div><button className="btn btn-primary" onClick={() => setImportOpen(true)}><Upload />导入产品库</button><button className="btn" onClick={downloadTemplate}><Download />下载标准模板</button></div>}
      </div>}
      {error && <div className="catalog-inline-error"><AlertCircle />{error}</div>}
    </section>

    <div className="catalog-compliance"><ShieldCheck />产品库数据仅保存在本机。产品启停状态由正式导入版本管理，当前页面不直接改写单条产品。</div>

    <AnimatePresence>{(detailLoading || detail) && <>
      <motion.div className="drawer-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => { setDetail(null); setDetailLoading(false); }} />
      <motion.aside className="drawer catalog-detail-drawer" initial={{ x: 28, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 28, opacity: 0 }}>
        <div className="catalog-drawer-head"><div><div className="eyebrow">PRODUCT DETAIL</div><h2>产品详情</h2>{detail?.product.productName && <p className="catalog-detail-product-name">{detail.product.productName}</p>}</div><button className="top-icon" onClick={() => { setDetail(null); setDetailLoading(false); }}><X /></button></div>
        {detailLoading ? <LoadingBlock text="正在读取产品详情…" /> : detail && <ProductDetailContent detail={detail} expanded={detailsExpanded} onToggle={() => setDetailsExpanded((value) => !value)} />}
      </motion.aside>
    </>}</AnimatePresence>

    <AnimatePresence>{importOpen && <>
      <motion.div className="drawer-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => void closeImport()} />
      <motion.aside className="drawer catalog-import-drawer" initial={{ x: 34, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 34, opacity: 0 }}>
        <div className="catalog-drawer-head"><div><div className="eyebrow">CATALOG IMPORT</div><h2>导入企业产品库</h2><p>预览、校验并人工确认后才会更新正式版本。</p></div><button className="top-icon" onClick={() => void closeImport()}><X /></button></div>
        <ImportFlow stage={importStage} file={selectedFile} preview={importPreview} completion={importCompletion} currentVersion={summary?.currentVersion ?? null} error={importError} onChoose={chooseImport} onReset={() => void resetImport()} onConfirm={() => setImportStage('confirm')} onCommit={commitImport} onClose={() => void closeImport()} />
      </motion.aside>
    </>}</AnimatePresence>

    <AnimatePresence>{versionsOpen && <>
      <motion.div className="drawer-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setVersionsOpen(false)} />
      <motion.aside className="drawer catalog-version-drawer" initial={{ x: 28, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 28, opacity: 0 }}>
        <div className="catalog-drawer-head"><div><div className="eyebrow">VERSION HISTORY</div><h2>产品库版本记录</h2><p>每次导入或回滚都会生成新的审计版本。</p></div><button className="top-icon" onClick={() => setVersionsOpen(false)}><X /></button></div>
        {versionsLoading ? <LoadingBlock text="正在读取版本记录…" /> : <div className="catalog-version-list">{versions?.items.map((item) => <div className={`catalog-version-row ${item.isCurrent ? 'current' : ''}`} key={item.version}>
          <div className="catalog-version-icon"><History /></div>
          <div><strong>{item.versionLabel}{item.isCurrent ? ' · 当前版本' : item.isPrevious ? ' · 上一版本' : ''}</strong><span>{item.operation === 'rollback' ? `回滚生成 · 来源 V${item.restoredFromVersion}` : item.operation === 'import' ? 'Excel 导入' : '历史版本'}</span><small>{item.detailAvailable ? `${item.productCount ?? 0} 项产品 · ${formatDate(item.createdAt)}` : '历史详情未开放，版本记录真实保留'}</small>{item.sourceFile && <small>来源：{item.sourceFile}</small>}</div>
          {item.canRollback && <button className="btn btn-quiet" onClick={() => setRollbackTarget(item.version)}><RotateCcw />回滚至此</button>}
        </div>)}{!versions?.items.length && <div className="catalog-empty compact"><History /><h3>暂无版本记录</h3></div>}</div>}
        <div className="catalog-version-note">回滚不会覆盖历史版本，而会基于所选版本创建新的审计版本。</div>
      </motion.aside>
    </>}</AnimatePresence>

    <AnimatePresence>{rollbackTarget && <motion.div className="catalog-modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="catalog-modal" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <RotateCcw />
        <h3>确认回滚至 V{rollbackTarget}？</h3>
        <div className="catalog-rollback-versions"><span>目标版本 <strong>V{rollbackTarget}</strong></span><span>当前版本 <strong>{summary?.currentVersionLabel ?? '未配置'}</strong></span></div>
        <p>系统将基于 V{rollbackTarget} 的产品内容创建一个新的审计版本，后续产品匹配将使用新版本。当前版本、历史版本及既有匹配结果的 catalogVersion 均不会被删除或修改。</p>
        <div><button className="btn" disabled={rollingBack} onClick={() => setRollbackTarget(null)}>取消</button><button className="btn btn-primary" disabled={rollingBack} onClick={() => void rollback()}>{rollingBack ? <LoaderCircle className="catalog-spin" /> : <RotateCcw />}确认回滚</button></div>
      </motion.div>
    </motion.div>}</AnimatePresence>
  </div>;
}

function ProductDetailContent({ detail, expanded, onToggle }: { detail: CatalogProductDetail; expanded: boolean; onToggle: () => void }) {
  const product = detail.product;
  return <div className="catalog-detail-content">
    <div className="catalog-detail-lead"><div><span>产品型号</span><strong>{product.model || '待补充'}</strong></div><StatusPill status={product.status} /></div>
    <div className="catalog-detail-grid"><div><span>分类</span><strong>{product.category || '未分类'}</strong></div><div><span>产品库版本</span><strong>V{detail.catalogVersion ?? '-'}</strong></div><div><span>来源工作表</span><strong>{product.source.sheet || '待补充'}</strong></div><div><span>来源行</span><strong>第 {product.sourceRow} 行</strong></div></div>
    <DetailSection title="规格参数"><div className="catalog-spec-list">{Object.entries(product.specifications).map(([name, value]) => <div key={name}><span>{name}</span><strong>{value}</strong></div>)}{!Object.keys(product.specifications).length && <p>暂无规格参数</p>}</div></DetailSection>
    <DetailSection title="应用场景"><TagList values={product.applications} empty="暂无应用场景" /></DetailSection>
    <DetailSection title="关键词"><TagList values={product.keywords} empty="暂无关键词" /></DetailSection>
    <button className="catalog-expand" onClick={onToggle}>更多产品信息<ChevronDown className={expanded ? 'expanded' : ''} /></button>
    {expanded && <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
      <DetailSection title="同义词"><TagList values={product.synonyms} empty="暂无同义词" /></DetailSection>
      <DetailSection title="产品说明 / 备注"><p>{product.description || '暂无产品说明或备注'}</p></DetailSection>
      <DetailSection title="单位规范化结果"><div className="catalog-normalized-specs">{product.specificationDetails.map((specification) => <div key={`${specification.rawName}-${specification.rawValue}`}><span>{specification.rawName}：{specification.rawValue}</span><strong>{specification.baseValue === null ? '保留原值' : `${specification.baseValue} ${specification.baseUnit ?? ''}`}</strong></div>)}{!product.specificationDetails.length && <p>暂无可规范化规格</p>}</div></DetailSection>
      <DetailSection title="技术与来源信息"><div className="catalog-detail-grid"><div><span>产品编号</span><strong>{product.productId}</strong></div><div><span>标准化型号</span><strong>{product.normalizedModel || '待补充'}</strong></div><div><span>记录版本</span><strong>V{product.version}</strong></div><div><span>来源文件</span><strong>{product.source.fileName || '待补充'}</strong></div><div><span>创建时间</span><strong>{formatDate(product.createdAt)}</strong></div><div><span>更新时间</span><strong>{formatDate(product.updatedAt)}</strong></div></div></DetailSection>
    </motion.div>}
    <div className="catalog-readonly-note">当前为只读详情。单条状态与数据变更请通过正式产品库文件重新导入，以保持版本一致性。</div>
  </div>;
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="catalog-detail-section"><h3>{title}</h3>{children}</section>;
}

function TagList({ values, empty }: { values: string[]; empty: string }) {
  return <div className="catalog-tag-list">{values.length ? values.map((value) => <span key={value}>{value}</span>) : <p>{empty}</p>}</div>;
}

function ImportFlow({ stage, file, preview, completion, currentVersion, error, onChoose, onReset, onConfirm, onCommit, onClose }: {
  stage: ImportStage;
  file: StagedFileToken | null;
  preview: CatalogImportPreview | null;
  completion: ImportCompletion | null;
  currentVersion: number | null;
  error: string;
  onChoose: () => void;
  onReset: () => void;
  onConfirm: () => void;
  onCommit: () => void;
  onClose: () => void;
}) {
  const invalid = Boolean(preview && (preview.failedRows > 0 || preview.errors.length > 0));
  const [mappingExpanded, setMappingExpanded] = useState(false);
  useEffect(() => setMappingExpanded(false), [preview?.importId]);
  const importableRows = preview ? preview.successRows + preview.warningRows : 0;
  const unmappedColumns = preview ? new Set([...preview.errors, ...preview.warnings].filter((issue) => /header|column|mapping|unmapped/i.test(issue.code)).map((issue) => issue.column).filter(Boolean)).size : 0;
  const keyMappings = preview ? [
    ...['productName', 'model', 'category', 'status'].map((target) => preview.fieldMappings.find((mapping) => mapping.target === target)).filter(Boolean),
    preview.fieldMappings.find((mapping) => mapping.target.startsWith('specification.')),
  ].filter((mapping): mapping is CatalogImportPreview['fieldMappings'][number] => Boolean(mapping)) : [];
  if (stage === 'done') return <div className="catalog-import-success"><Check /><h3>产品库更新完成</h3><p>正式产品库已生成新版本，后续产品匹配将读取该版本。</p>{completion && <div className="catalog-completion-grid"><div><span>新版本</span><strong>V{completion.version}</strong></div><div><span>本次成功导入</span><strong>{completion.importedRows}</strong></div><div><span>正常数据</span><strong>{completion.normalRows}</strong></div><div><span>其中有提醒</span><strong>{completion.warningRows}</strong></div><small>当前产品库共 {completion.productCount} 项 · {formatDate(completion.updatedAt)}</small></div>}<button className="btn btn-primary" onClick={onClose}>查看产品库</button></div>;
  return <div className="catalog-import-flow">
    <div className="catalog-import-steps"><span className="done">1 选择文件</span><span className={preview ? 'done' : stage === 'previewing' ? 'active' : ''}>2 预览校验</span><span className={stage === 'confirm' || stage === 'committing' ? 'active' : ''}>3 人工确认</span></div>
    {!file && stage === 'select' && <button className="catalog-file-drop" onClick={onChoose}><FileSpreadsheet /><strong>选择 Excel 产品库</strong><span>支持 .xlsx / .xls，文件会先在本机完成预览和校验</span><small>建议先下载并使用标准导入模板</small></button>}
    {stage === 'selecting' && <LoadingBlock text="正在读取所选文件…" />}
    {file && <div className="catalog-selected-file"><FileSpreadsheet /><div><strong>{file.displayName}</strong><span>{(file.size / 1024).toFixed(1)} KB · {file.detectedType.toUpperCase()}</span></div>{stage !== 'previewing' && stage !== 'committing' && <button className="btn btn-quiet" onClick={onReset}>更换文件</button>}</div>}
    {stage === 'previewing' && <div className="catalog-import-processing"><LoaderCircle className="catalog-spin" /><div><strong>正在校验产品资料</strong><span>后台正在读取文件、识别字段并规范化产品数据，不会在界面线程解析 Excel。</span></div></div>}
    {error && <div className="catalog-import-error"><AlertCircle />{error}</div>}
    {preview && stage !== 'previewing' && <>
      <div className="catalog-import-metrics"><div><span>总数据</span><strong>{preview.totalRows}</strong></div><div className="success"><span>可成功导入</span><strong>{importableRows}</strong></div><div><span>正常</span><strong>{preview.successRows}</strong></div><div className="warning"><span>有提醒</span><strong>{preview.warningRows}</strong></div><div className="error"><span>错误</span><strong>{preview.failedRows}</strong></div></div>
      <section className="catalog-import-section catalog-mapping-section"><div className="catalog-section-heading"><div><h3>字段识别</h3><p>已识别 {preview.fieldMappings.length} 项 · 未识别 {unmappedColumns} 项</p></div><button className="btn btn-quiet catalog-mapping-toggle" onClick={() => setMappingExpanded((value) => !value)}>{mappingExpanded ? '收起字段映射' : '查看字段映射'}<ChevronDown className={mappingExpanded ? 'expanded' : ''} /></button></div><div className="catalog-mapping-key">{keyMappings.map((mapping) => <div key={`${mapping.sourceColumn}-${mapping.target}`}><span>{mapping.sourceColumn}</span><ChevronRight /><strong>{friendlyMappingTarget(mapping.target)}</strong></div>)}</div>{mappingExpanded && <motion.div className="catalog-mapping-list full" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>{preview.fieldMappings.map((mapping) => <div key={`${mapping.sourceColumn}-${mapping.target}`}><span>{mapping.sourceColumn}</span><ChevronRight /><strong>{mapping.target}</strong><small>{mapping.confidence === 'exact' ? '精确' : mapping.confidence === 'alias' ? '别名匹配' : '人工映射'}</small></div>)}</motion.div>}</section>
      {(preview.errors.length > 0 || preview.warnings.length > 0) && <section className="catalog-import-section"><h3>校验问题</h3><div className="catalog-issue-table"><div className="catalog-issue-head"><span>位置</span><span>产品 / 字段</span><span>问题</span><span>建议</span></div>{[...preview.errors, ...preview.warnings].slice(0, 100).map((issue, index) => <div className={`catalog-issue-row ${issue.severity}`} key={`${issue.sheet}-${issue.row}-${issue.column}-${index}`}><span>{issue.sheet} · {issue.row}行</span><span>{issue.field || issue.column || '数据行'}</span><span>{issue.message}</span><span>{issueSuggestion(issue)}</span></div>)}</div>{preview.errors.length + preview.warnings.length > 100 && <div className="tiny-note">仅展示前100项问题，请修正源文件后重新导入。</div>}</section>}
      <section className="catalog-import-section"><h3>产品预览</h3><div className="catalog-preview-list">{preview.previewRecords.slice(0, 8).map((product) => <div key={product.productId}><strong>{product.productName}</strong><span>{product.model || '型号待补充'} · {product.category || '未分类'}</span><StatusPill status={product.status} /></div>)}</div>{preview.previewRecords.length > 8 && <div className="tiny-note">另有 {preview.previewRecords.length - 8} 项产品，将在确认后一次性导入。</div>}</section>
      {stage === 'confirm' ? <div className="catalog-confirm-box"><ShieldCheck /><div><strong>确认更新正式产品库</strong><p>准备导入 {preview.successRows + preview.warningRows} 项有效产品，包含 {preview.warningRows} 项警告。当前 {currentVersion ? `V${currentVersion}` : '未配置'}，确认后将创建 {currentVersion ? `V${currentVersion + 1}` : 'V1'}。写入失败时原版本保持不变。</p></div></div> : invalid ? <div className="catalog-validation-block"><AlertCircle /><span>当前文件存在 {preview.failedRows} 行错误，正式导入已锁定。请修改源文件后重新选择。</span></div> : <div className="catalog-validation-pass"><Check /><span>预览校验通过，可进入人工确认。</span></div>}
      <div className="catalog-import-actions"><button className="btn" disabled={stage === 'committing'} onClick={onReset}>取消本次导入</button>{stage === 'confirm' || stage === 'committing' ? <button className="btn btn-primary" disabled={stage === 'committing'} onClick={onCommit}>{stage === 'committing' ? <LoaderCircle className="catalog-spin" /> : <Check />}确认并更新</button> : <button className="btn btn-primary" disabled={invalid} onClick={onConfirm}><ChevronRight />进入确认</button>}</div>
    </>}
  </div>;
}
