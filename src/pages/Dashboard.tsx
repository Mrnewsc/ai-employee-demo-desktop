import { motion } from 'framer-motion';
import { ArrowRight, Bot, CheckCircle2, CircleDot, FileText, Lightbulb, MessageCircle, Network, Plus, Radio, Settings2, Users } from 'lucide-react';
import { appConfig, complianceNote } from '../config';
import { useApp } from '../stores/AppStore';
import { DemoNote, PageHeader, Surface } from '../components/UI';

const flow = [
  ['企业知识库', Bot], ['AI内容生成', FileText], ['多平台发布', Network], ['客户产生互动', Users], ['AI接待', MessageCircle], ['销售跟进', Radio], ['成交', CheckCircle2],
] as const;

const timeline = [
  ['09:10', '完成行业内容生产', '36条内容已生成，围绕目标客户持续覆盖'],
  ['11:20', '完成多平台发布', '25条内容进入5个平台的发布流程'],
  ['13:40', '发现客户互动', '新增8条客户线索，等待销售确认'],
  ['14:00', '完成AI接待整理', '23次AI接待，12位客户需要跟进'],
] as const;

export function Dashboard() {
  const { company, navigate, notify } = useApp();
  const product = company.products.split(/[、,，]/)[0] || '企业产品';
  return <>
    <PageHeader eyebrow="AI EMPLOYEE / CONTROL CENTER" title="欢迎回来，刘总" description="您的AI数字员工已开始今天的工作。" actions={<span className="dashboard-top-note"><DemoNote /></span>} />
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
        <Surface className="dashboard-brief">
          <div className="dashboard-brief-header">
            <div className="ai-employee-identity">
              <div className="ai-employee-avatar" aria-label="AI员工固定头像"><Bot size={20} /></div>
              <div><div className="surface-title">AI员工日报</div><div className="surface-kicker">{company.companyName} · 今日运行摘要</div></div>
            </div>
          </div>
          <div className="dashboard-report">
            <div className="dashboard-report-title">今天，AI员工已围绕{product}持续工作。</div>
            <p>已完成内容生产、平台分发和客户接待，当前有一批客户等待销售推进。</p>
          </div>
          <div className="dashboard-signal-grid">
            {([
              ['新增客户线索', '8', '待销售确认', Users],
              ['待跟进客户', '12', '需要及时处理', Radio],
              ['今日报价', '2', '等待人工确认', FileText],
            ] as const).map(([label, value, foot, Icon], index) => <motion.div key={label} className="dashboard-signal" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * .06, duration: .3 }}>
              <Icon size={15} color="#6fb7ff" />
              <div><div className="metric-label">{label}</div><div className="dashboard-signal-value">{value}</div><div className="metric-foot">{foot}</div></div>
            </motion.div>)}
          </div>
          <div className="dashboard-report-footer"><span><FileText size={13} />36条内容生成</span><span><Network size={13} />25条内容发布</span><span><CircleDot size={13} />GEO 286 / 500</span><span><MessageCircle size={13} />AI接待23次</span></div>
          <div className="dashboard-suggestions">
            <div className="dashboard-section-label"><Lightbulb size={15} />AI今日建议</div>
            <div className="suggestion-row"><span className="suggestion-index">01</span><div><strong>优先处理新增线索</strong><p>建议先联系高意向客户，确认{product}的工件尺寸与日产量。</p></div><ArrowRight size={14} /></div>
            <div className="suggestion-row"><span className="suggestion-index">02</span><div><strong>补齐客户跟进信息</strong><p>今日待跟进12位客户，重点记录需求、预算与下一步动作。</p></div><ArrowRight size={14} /></div>
          </div>
        </Surface>
        <div className="surface workflow">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}><div className="surface-title">AI员工工作流</div></div>
          <div className="workflow-line">{flow.map(([name, Icon], index) => <div className="workflow-node" key={name}>
            <div><div className="workflow-icon"><Icon size={16} /></div><div className="workflow-name">{name}</div><small>{index < 6 ? '运行中' : '目标状态'}</small></div>
            {index < flow.length - 1 && <div className="workflow-connector" />}
          </div>)}</div>
        </div>
      </section>
    </div>
    <Surface className="work-timeline" title="AI员工工作时间轴" kicker="老板每天打开，就知道AI今天干了什么">
      <div className="timeline dashboard-timeline">
        {timeline.map(([time, title, detail], index) => <motion.div className="timeline-item" key={time} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * .07, duration: .3 }}>
          <span className="timeline-dot" />
          <div className="timeline-time">{time}</div>
          <div className="timeline-copy"><strong>{title}</strong><span>{detail}</span></div>
        </motion.div>)}
      </div>
    </Surface>
    <div className="dashboard-actions">
      <button className="btn" onClick={() => navigate('company')}><Settings2 size={15} />配置当前企业</button>
      <button className="btn" onClick={() => notify('今日任务：内容生成、平台发布、客户跟进')}><Plus size={15} />查看今日任务</button>
    </div>
    <div className="tiny-note" style={{ marginTop: 14 }}>{complianceNote}。</div>
  </>;
}
