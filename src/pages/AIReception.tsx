import { useEffect, useRef, useState } from 'react';
import { Bot, Clock3, MessageSquare, MoreHorizontal, Plus, Send, ShieldCheck, UserRound, UsersRound } from 'lucide-react';
import { motion } from 'framer-motion';
import { demoLeads } from '../demo/demoData';
import { useApp } from '../stores/AppStore';
import { DemoNote, PageHeader, Surface } from '../components/UI';

const questions = ['你们的设备适合五金工厂吗？', '设备价格大概多少？', '能不能按照我们的生产线定制？', '安装调试需要多久？', '有没有相关案例？'];
const demoCustomerName = '金华某五金制品厂（演示客户）';

type ChatMessage = { id: string; from: 'customer' | 'ai'; text: string; streaming?: boolean };
type CustomerProfile = { dailyOutput: string; intent: string; action: string; tags: string[] };

const defaultMessages: ChatMessage[] = [
  { id: 'customer-1', from: 'customer', text: '你们的设备适合五金工厂吗？' },
  { id: 'ai-1', from: 'ai', text: '可以。针对五金工厂，可根据工件尺寸、日产量、喷涂材料和自动化程度匹配对应的设备方案。\n\n为了初步判断配置，请问您目前主要加工什么产品？' },
  { id: 'customer-2', from: 'customer', text: '主要做金属配件，每天大约3000件。' },
  { id: 'ai-2', from: 'ai', text: '了解，已记录您主要生产金属配件，日产量约3000件。\n\n还需要确认工件尺寸、目前使用的喷涂材料，以及是否需要接入现有生产线。我可以先为您登记需求，并安排专业人员进一步沟通。' },
];

const defaultProfile: CustomerProfile = {
  dailyOutput: '约3000件',
  intent: '中高',
  action: '安排销售及技术人员沟通',
  tags: ['五金工厂', '自动喷涂', '设备采购', '需要定制', '建议人工跟进', '日产量已确认'],
};

export function AIReception() {
  const { company, notify, navigate } = useApp();
  const isPreview = window.location.search.includes('preview=');
  const [selected, setSelected] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>(defaultMessages);
  const [profile, setProfile] = useState<CustomerProfile>(defaultProfile);
  const [typing, setTyping] = useState(false);
  const [input, setInput] = useState('');
  const [needsHuman, setNeedsHuman] = useState(false);
  const streamTimer = useRef<number | null>(null);

  useEffect(() => () => {
    if (streamTimer.current) window.clearInterval(streamTimer.current);
  }, []);

  const selectedLead = demoLeads[selected] ?? demoLeads[0];

  const updateProfileFromQuestion = (question: string) => {
    const mentionsOutput = /3000|三千/.test(question);
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
    const mentionsOutput = /3000|三千/.test(question);
    const reply = manualConfirmation
      ? '该问题需要人工确认，建议转交销售或技术人员。AI员工会先记录您的具体需求，再由专业人员确认正式报价、定制范围和交付安排。'
      : mentionsOutput
        ? `了解，已记录您主要生产金属配件，日产量约3000件。\n\n还需要确认工件尺寸、目前使用的喷涂材料，以及是否需要接入现有生产线。我可以先为您登记需求，并安排专业人员进一步沟通。`
        : `了解，我已记录您的问题。结合${company.companyName}的产品资料，可以先围绕工件类型、日产量和现场工艺整理初步方案。\n\n我会先登记需求，复杂的技术判断将转交销售或技术人员确认。`;
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
    setInput('');
    streamReply(cleanQuestion);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    ask(input);
  };

  const clientName = selected === 0 ? demoCustomerName : `${selectedLead.name}（演示客户）`;
  return <>
    <PageHeader eyebrow="AI RECEPTION / 24×7" title="AI智能接待" description="AI回答常见问题、收集需求、提取客户信息，复杂问题转人工。" actions={<><DemoNote /><span className="demo-badge"><ShieldCheck size={13} />知识库已连接</span></>} />
    <div className="three-layout">
      <Surface title="客户会话" kicker="3个演示客户" className="chat-list">
        {demoLeads.map((lead, index) => <button key={lead.name} className={`chat-contact ${selected === index ? 'active' : ''}`} onClick={() => setSelected(index)}><span className="avatar"><UserRound size={15} /></span><span style={{ minWidth: 0 }}><span className="chat-contact-name-line"><strong>{lead.name}</strong><span className="demo-client-tag">演示客户</span></span><span style={{ display: 'block', marginTop: 5, fontSize: 10, color: '#7187a9' }}>{lead.status} · {lead.source}</span></span><MoreHorizontal size={14} style={{ marginLeft: 'auto' }} /></button>)}
        <div className="surface-subtle" style={{ marginTop: 15, padding: 12 }}><div className="surface-kicker">AI接待覆盖</div><div style={{ marginTop: 7, color: '#dce9ff', fontSize: 14 }}>7×24小时在线</div><div className="tiny-note" style={{ marginTop: 5 }}>基于企业知识库回答</div></div>
      </Surface>
      <Surface title="实时对话" kicker={clientName} className="chat-panel">
        <div className="chat-stream">
          {messages.map((message) => <motion.div key={message.id} initial={isPreview ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`chat-message-row ${message.from}`}><span className={`chat-avatar ${message.from}`}><>{message.from === 'ai' ? <Bot size={16} /> : <UserRound size={16} />}</></span><div className={`chat-message ${message.from}`}>{message.from === 'ai' && <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7, color: '#9fd0ff', fontSize: 10 }}><Bot size={13} />AI员工</div>}{message.text || '正在输入…'}{message.streaming && <span className="stream-caret" />}</div></motion.div>)}
          {typing && <motion.div className="typing-row" initial={{ opacity: 0 }} animate={{ opacity: 1 }}><span className="chat-avatar ai"><Bot size={16} /></span><span>AI员工正在输入</span><span className="typing-dots"><motion.i animate={{ opacity: [.25, 1, .25] }} transition={{ duration: .9, repeat: Infinity }} /><motion.i animate={{ opacity: [.25, 1, .25] }} transition={{ duration: .9, repeat: Infinity, delay: .15 }} /><motion.i animate={{ opacity: [.25, 1, .25] }} transition={{ duration: .9, repeat: Infinity, delay: .3 }} /></span></motion.div>}
        </div>
        <div className="surface-subtle quick-questions"><div className="surface-kicker" style={{ marginBottom: 9 }}>快捷提问 · 点击模拟客户发问</div><div className="chip-row">{questions.map((question) => <button className="chip" key={question} onClick={() => ask(question)} disabled={typing}>{question}</button>)}</div></div>
        <form className="chat-input-wrap" onSubmit={handleSubmit}><input className="chat-input" value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); ask(input); } }} placeholder="输入客户问题……" disabled={typing} /><button className="btn btn-primary send-button" type="submit" disabled={typing || !input.trim()}><Send size={15} />发送消息</button></form>
        <div className="chat-actions"><button className={`btn ${needsHuman ? 'btn-primary human-required' : ''}`} onClick={() => notify('已生成销售跟进话术')}><MessageSquare size={14} />生成跟进话术</button><button className="btn" onClick={() => notify('客户已创建到线索池')}><Plus size={14} />创建客户</button>{needsHuman && <button className="btn btn-primary" onClick={() => notify('已转人工，销售及技术人员任务已生成')}><UsersRound size={14} />转人工</button>}</div>
      </Surface>
      <Surface title="客户画像" kicker="AI提取结果">
        {[['客户名称', clientName], ['行业', '五金制造'], ['需求产品', company.products.split(/[、,，]/)[0]], ['日产量', profile.dailyOutput], ['预算', '待确认'], ['意向等级', profile.intent], ['建议动作', profile.action]].map(([label, value]) => <div className="profile-item" key={label}><span>{label}</span><span>{value}</span></div>)}
        <div style={{ marginTop: 19 }}><div className="surface-kicker" style={{ marginBottom: 10 }}>客户标签</div><div className="chip-row">{profile.tags.map((tag) => <span className="chip" key={tag}>{tag}</span>)}</div></div>
        <div className="surface-subtle" style={{ marginTop: 18, padding: 13 }}><div style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#9ac6ff', fontSize: 11 }}><Clock3 size={14} />需要人工确认的内容</div><div className="tiny-note" style={{ marginTop: 8 }}>正式报价、定制方案、交付周期与技术配置由销售及专业人员确认。</div></div>
      </Surface>
    </div>
  </>;
}
