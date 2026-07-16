import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, Clipboard, FilePlus2, RefreshCw, Send, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { defaultContent } from '../demo/demoData';
import { platformNames } from '../config';
import { useApp } from '../stores/AppStore';
import { DemoNote, PageHeader, Surface } from '../components/UI';

const contentTypes = ['产品介绍', '采购指南', '客户痛点', '行业知识', '产品对比', '常见问题', '应用场景', '解决方案'];
const tones = ['专业可信', '简洁有力', '顾问式沟通', '技术说明'];

export function ContentGenerator() {
  const { company, contentForm, updateContentForm, content, setContent, navigate, notify } = useApp();
  const [generating, setGenerating] = useState(false);
  const [step, setStep] = useState(-1);
  const steps = ['正在分析企业资料', '正在匹配目标客户', '正在生成文章结构', '正在优化GEO关键词', '内容生成完成'];

  const generated = useMemo(() => {
    const product = company.products.split(/[、,，]/)[0] || company.products;
    const region = contentForm.region || company.regions.split(/[、,，]/)[0] || '本地';
    const audience = company.targetCustomers.split(/[、,，]/)[0] || company.targetCustomers;
    return {
      title: `${region}${product}采购指南：${audience}如何选择稳定方案`,
      summary: `围绕${company.companyName}的${product}，从客户关心的配置、产能与服务展开说明。`,
      body: `对于${audience}来说，选择${product}时，建议先梳理工件尺寸、日产量、现场空间与工艺要求。\n\n${company.companyName}围绕${company.sellingPoints || '稳定运行与定制服务'}，提供从需求沟通到安装调试的协同支持。实际配置仍需结合现场资料进一步确认。\n\n如果您正在评估${product}，可以留下产品类型与产能需求，销售人员将基于企业资料整理初步沟通方向。`,
      keywords: [product, `${region}${product}厂家`, `${audience}采购`, ...contentForm.keywords.split(/[,，]/).filter(Boolean).slice(0, 2)],
      cta: `欢迎留下您的工件类型与日产量，获取${product}初步选型建议。`,
      tags: [company.industry, contentForm.contentType, region],
    };
  }, [company, contentForm]);

  useEffect(() => {
    if (!generating) return;
    const timer = window.setInterval(() => setStep((current) => {
      if (current >= steps.length - 1) {
        window.clearInterval(timer);
        setGenerating(false);
        setContent(generated);
        return steps.length - 1;
      }
      return current + 1;
    }), 520);
    return () => window.clearInterval(timer);
  }, [generating, generated, setContent, steps.length]);

  const startGenerate = () => { setStep(0); setGenerating(true); };
  return <>
    <PageHeader eyebrow="AI CONTENT ENGINE" title="AI内容生成" description="把企业资料转成面向真实客户的专业内容，再进入发布中心。" actions={<><DemoNote /><button className="btn btn-primary" onClick={startGenerate}><Sparkles size={15} />生成获客内容</button></>} />
    <div className="split-layout">
      <Surface title="内容任务" kicker="本地规则引擎演示">
        <div className="form-grid">
          <div className="field full"><label>企业</label><input className="input" value={company.companyName} readOnly /></div>
          <div className="field"><label>产品</label><input className="input" value={company.products} readOnly /></div>
          <div className="field"><label>目标客户</label><input className="input" value={company.targetCustomers} readOnly /></div>
          <div className="field"><label>内容类型</label><select className="select" value={contentForm.contentType} onChange={(e) => updateContentForm({ contentType: e.target.value })}>{contentTypes.map((item) => <option key={item}>{item}</option>)}</select></div>
          <div className="field"><label>发布平台</label><select className="select" value={contentForm.platform} onChange={(e) => updateContentForm({ platform: e.target.value })}>{platformNames.map((item) => <option key={item}>{item}</option>)}</select></div>
          <div className="field"><label>内容语气</label><select className="select" value={contentForm.tone} onChange={(e) => updateContentForm({ tone: e.target.value })}>{tones.map((item) => <option key={item}>{item}</option>)}</select></div>
          <div className="field"><label>地区</label><input className="input" value={contentForm.region} onChange={(e) => updateContentForm({ region: e.target.value })} /></div>
          <div className="field full"><label>关键词</label><input className="input" value={contentForm.keywords} onChange={(e) => updateContentForm({ keywords: e.target.value })} /></div>
        </div>
        <div className="progress-steps">{steps.map((item, index) => <div className={`progress-step ${step >= index ? 'done' : ''}`} key={item}><span className="step-dot" />{item}{step === index && generating && <motion.span animate={{ opacity: [.4, 1, .4] }} transition={{ duration: 1, repeat: Infinity }}>...</motion.span>}{step > index && <Check size={13} color="#6ed9b3" />}</div>)}</div>
      </Surface>
      <Surface title="生成结果" kicker={`${contentForm.platform} · ${contentForm.tone}`} className="content-output">
        <motion.div key={content.title} initial={{ opacity: .3 }} animate={{ opacity: 1 }} transition={{ duration: .35 }}>
          <h2 className="content-title">{content.title}</h2>
          <div className="content-summary">{content.summary}</div>
          <div className="content-body" style={{ marginTop: 18 }}>{content.body}</div>
          <div style={{ marginTop: 20 }}><div className="surface-kicker" style={{ marginBottom: 9 }}>核心关键词</div><div className="chip-row">{content.keywords.map((item) => <span className="chip" key={item}>{item}</span>)}</div></div>
          <div style={{ marginTop: 18 }}><div className="surface-kicker" style={{ marginBottom: 9 }}>咨询引导语</div><div className="muted" style={{ fontSize: 12, lineHeight: 1.7 }}>{content.cta}</div></div>
          <div style={{ marginTop: 18 }}><div className="surface-kicker" style={{ marginBottom: 9 }}>平台标签</div><div className="chip-row">{content.tags.map((item) => <span className="chip" key={item}>#{item}</span>)}</div></div>
        </motion.div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 23 }}>
          <button className="btn" onClick={startGenerate}><RefreshCw size={14} />重新生成</button>
          <button className="btn" onClick={() => { navigator.clipboard?.writeText(`${content.title}\n\n${content.body}`); notify('内容已复制到剪贴板'); }}><Clipboard size={14} />复制内容</button>
          <button className="btn" onClick={() => notify('草稿已保存到本地演示数据')}><FilePlus2 size={14} />保存草稿</button>
          <button className="btn btn-primary" onClick={() => navigate('publishing')}><Send size={14} />进入发布中心<ArrowRight size={14} /></button>
        </div>
        <div className="tiny-note" style={{ marginTop: 14 }}>当前内容基于企业配置与本地规则组合生成，正式交付后可替换为真实AI服务。</div>
      </Surface>
    </div>
  </>;
}

