import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BarChart3, Bell, Bot, Building2, Calculator, ChevronLeft, ChevronRight, CircleHelp,
  ClipboardList, FileText, Gauge, KeyRound, LayoutDashboard, Maximize2, MessageSquare,
  Network, PanelLeftClose, Play, Quote, RotateCcw, Settings, Sparkles, Users, X,
} from 'lucide-react';
import { appConfig } from '../config';
import type { PageKey } from '../types';
import { useApp } from '../stores/AppStore';
import { DemoNote } from './UI';

const navGroups: { title: string; items: { key: PageKey; label: string; icon: typeof LayoutDashboard }[] }[] = [
  { title: '工作空间', items: [
    { key: 'dashboard', label: 'AI工作台', icon: LayoutDashboard },
    { key: 'company', label: '企业配置', icon: Building2 },
    { key: 'content', label: 'AI内容生成', icon: Sparkles },
    { key: 'publishing', label: '平台发布', icon: Network },
    { key: 'geo', label: 'GEO关键词', icon: KeyRound },
  ] },
  { title: '客户与销售', items: [
    { key: 'leads', label: '客户线索', icon: Users },
    { key: 'reception', label: 'AI智能接待', icon: MessageSquare },
    { key: 'quotes', label: '报价管理', icon: Quote },
    { key: 'followups', label: '跟进中心', icon: Bell },
  ] },
  { title: '经营决策', items: [
    { key: 'analytics', label: '数据分析', icon: BarChart3 },
    { key: 'roi', label: 'ROI测算', icon: Calculator },
    { key: 'plan', label: '合作方案', icon: ClipboardList },
  ] },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { activePage, navigate, company, demoMode, demoStep, startDemo, exitDemo, nextDemoStep, previousDemoStep, fillDemo, resetDemo, message, notify } = useApp();
  const [clock, setClock] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const isPreview = window.location.search.includes('preview=');

  useEffect(() => {
    const update = () => setClock(new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date()));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (demoMode) {
      document.documentElement.requestFullscreen?.().catch(() => undefined);
    }
  }, [demoMode]);

  const sidebarClass = sidebarCollapsed ? 'sidebar collapsed' : 'sidebar';
  const pageTitle = useMemo(() => navGroups.flatMap((group) => group.items).find((item) => item.key === activePage)?.label ?? 'AI工作台', [activePage]);

  const handleExitDemo = () => {
    exitDemo();
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => undefined);
  };

  return <div className="app-shell">
    <aside className={sidebarClass}>
      <div className="brand-lockup">
        <img src={appConfig.logoPath} alt={appConfig.brandName} />
        {!sidebarCollapsed && <div className="brand-product">AI员工一体机</div>}
      </div>
      <div className="nav-scroll">
        {navGroups.map((group) => <div key={group.title}>
          {!sidebarCollapsed && <div className="nav-label">{group.title}</div>}
          {group.items.map(({ key, label, icon: Icon }) => <button key={key} className={`nav-item ${activePage === key ? 'active' : ''}`} onClick={() => navigate(key)} title={label}>
            <Icon /><span>{label}</span>
          </button>)}
        </div>)}
        {!sidebarCollapsed && <div className="nav-label" style={{ marginTop: 18 }}>系统</div>}
        <button className={`nav-item ${activePage === 'settings' ? 'active' : ''}`} onClick={() => navigate('settings')} title="系统设置"><Settings /><span>系统设置</span></button>
      </div>
      <div className="sidebar-actions">
        <button className="side-action" onClick={startDemo} title="进入演示模式"><Play /><span>进入演示模式</span></button>
        <button className="side-action" onClick={fillDemo} title="一键填充数据"><Gauge /><span>一键填充数据</span></button>
        <button className="side-action" onClick={resetDemo} title="重置演示数据"><RotateCcw /><span>重置演示数据</span></button>
        <button className="side-action" onClick={() => setSidebarCollapsed((v) => !v)} title={sidebarCollapsed ? '展开导航' : '收起导航'}><PanelLeftClose /><span>{sidebarCollapsed ? '展开导航' : '收起导航'}</span></button>
      </div>
    </aside>

    <div className="main-shell">
      <header className="topbar">
        <div className="topbar-left">
          <div>
            <div className="context-label">当前企业</div>
            <div className="context-company">{company.companyName}</div>
          </div>
          <div className="runtime"><span className="pulse-dot" />AI员工运行中</div>
        </div>
        <div className="topbar-right">
          <span className="demo-badge"><Bot size={13} />演示模式</span>
          <span className="clock">{clock}</span>
          <button className="top-icon" title="全屏演示" onClick={() => document.documentElement.requestFullscreen?.().catch(() => undefined)}><Maximize2 size={16} /></button>
          <button className="top-icon" title="系统帮助" onClick={() => notify(`当前页面：${pageTitle}`)}><CircleHelp size={16} /></button>
        </div>
      </header>
      <main className="page-content"><div className="page-inner"><AnimatePresence mode="wait"><motion.div key={activePage} initial={isPreview ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={isPreview ? undefined : { opacity: 0, y: -5 }} transition={{ duration: .24 }}>{children}</motion.div></AnimatePresence></div></main>
    </div>

    {demoMode && <div className="demo-controls">
      <button className="btn btn-quiet" onClick={previousDemoStep} disabled={demoStep === 0}><ChevronLeft size={15} />上一步</button>
      <div className="demo-progress">客户演示 · {demoStep + 1} / 10</div>
      <button className="btn btn-primary" onClick={demoStep === 9 ? handleExitDemo : nextDemoStep}>{demoStep === 9 ? '结束演示' : '下一步'}{demoStep !== 9 && <ChevronRight size={15} />}</button>
      <button className="btn btn-quiet" onClick={handleExitDemo}><X size={15} />退出</button>
    </div>}
    {message && <div className="toast"><Bell size={14} />{message}</div>}
  </div>;
}
