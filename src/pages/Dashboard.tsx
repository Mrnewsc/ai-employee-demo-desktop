import { motion } from 'framer-motion';
import { ArrowRight, Bot, CheckCircle2, CircleDot, FileText, MessageCircle, Network, Play, Plus, Radio, Settings2, Users } from 'lucide-react';
import { appConfig, complianceNote } from '../config';
import { useApp } from '../stores/AppStore';
import { DemoNote, PageHeader, Surface } from '../components/UI';

const metrics = [
  ['今日生成内容', '36', '较昨日持续运行', FileText],
  ['今日发布内容', '25', '多平台覆盖', Network],
  ['新增客户线索', '8', '待销售确认', Users],
  ['待跟进客户', '12', '需要及时处理', Radio],
  ['AI接待次数', '23', '知识库响应', MessageCircle],
  ['GEO关键词进度', '286 / 500', '首个季度布局', CircleDot],
] as const;

const flow = [
  ['企业知识库', Bot], ['AI内容生成', FileText], ['多平台发布', Network], ['客户产生互动', Users], ['AI接待', MessageCircle], ['销售跟进', Radio], ['成交', CheckCircle2],
] as const;

export function Dashboard() {
  const { navigate, startDemo, notify } = useApp();
  return <>
    <PageHeader eyebrow="AI EMPLOYEE / CONTROL CENTER" title="您好，欢迎使用AI员工一体机" description="让AI接管重复运营工作，让销售专注客户与成交。" actions={<><DemoNote /><button className="btn btn-primary" onClick={startDemo}><Play size={15} />开始客户演示</button></>} />
    <div className="dashboard-grid">
      <motion.section className="surface hero-device" initial={{ opacity: 0, scale: .985 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: .45 }}>
        <div className="hero-device-copy">
          <div className="eyebrow">LOCAL AI INFRASTRUCTURE</div>
          <h2>一台设备，启动企业AI获客引擎</h2>
          <p>本地化部署、专属知识库与统一工作台，让重复运营工作持续自动运行。</p>
        </div>
        <div className="device-stage">
          <div className="device-light" />
          <img className="device-image" src={appConfig.devicePath} alt="黑色AI员工一体机设备" />
          <img className="robot-image" src={appConfig.robotPath} alt="AI员工机器人" />
        </div>
        <div className="device-status"><span className="pulse-dot" />AI员工在线 · 本地系统运行正常</div>
      </motion.section>
      <section>
        <div className="metrics-grid">
          {metrics.map(([label, value, foot, Icon], index) => <motion.div key={label} className="metric" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * .05, duration: .3 }}>
            <Icon size={16} color="#6fb7ff" />
            <div className="metric-label" style={{ marginTop: 13 }}>{label}</div>
            <div className="metric-value">{value}</div>
            <div className="metric-foot">{foot}</div>
          </motion.div>)}
        </div>
        <div className="surface workflow">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}><div className="surface-title">AI员工工作流</div><DemoNote /></div>
          <div className="workflow-line">{flow.map(([name, Icon], index) => <div className="workflow-node" key={name}>
            <div><div className="workflow-icon"><Icon size={16} /></div><div className="workflow-name">{name}</div><small>{index < 6 ? '运行中' : '目标状态'}</small></div>
            {index < flow.length - 1 && <div className="workflow-connector" />}
          </div>)}</div>
        </div>
      </section>
    </div>
    <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
      <button className="btn btn-primary" onClick={startDemo}><Play size={15} />开始客户演示</button>
      <button className="btn" onClick={() => navigate('company')}><Settings2 size={15} />配置当前企业</button>
      <button className="btn" onClick={() => notify('今日任务：内容生成、平台发布、客户跟进')}><Plus size={15} />查看今日任务</button>
    </div>
    <div className="tiny-note" style={{ marginTop: 14 }}>{complianceNote}。当前展示为本地功能演示，不代表实际运营效果。</div>
  </>;
}

