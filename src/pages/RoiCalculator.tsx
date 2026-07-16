import { useMemo } from 'react';
import { ArrowRight, Calculator, FileDown, Save, TrendingDown } from 'lucide-react';
import { useApp } from '../stores/AppStore';
import { DemoNote, PageHeader, Surface } from '../components/UI';
import type { RoiInputs } from '../types';

const numberFields: { key: keyof RoiInputs; label: string; suffix?: string; percent?: boolean }[] = [
  { key: 'years', label: '测算周期', suffix: '年' },
  { key: 'staff', label: '现有内容或运营人员', suffix: '人' },
  { key: 'reducibleStaff', label: '预计可减少重复岗位', suffix: '人' },
  { key: 'wage', label: '人均月工资', suffix: '元' },
  { key: 'socialRate', label: '社保福利附加比例', suffix: '%', percent: true },
  { key: 'recruitmentAnnual', label: '每年招聘培训成本', suffix: '元/年' },
  { key: 'outsourcingMonthly', label: '每月内容外包费用', suffix: '元/月' },
  { key: 'toolsMonthly', label: '每月软件及运营工具费用', suffix: '元/月' },
  { key: 'supportAnnual', label: '每年临时加班及支持费用', suffix: '元/年' },
  { key: 'aiPrice', label: 'AI员工一体机标准价', suffix: '元' },
  { key: 'customDev', label: '定制开发费用', suffix: '元' },
  { key: 'extraServiceAnnual', label: '每年额外服务费用', suffix: '元/年' },
  { key: 'outsourcingReduction', label: '外包费用预计降低比例', suffix: '%', percent: true },
  { key: 'toolsReduction', label: '工具费用预计降低比例', suffix: '%', percent: true },
  { key: 'recruitmentReduction', label: '招聘及临时成本预计降低比例', suffix: '%', percent: true },
];

const money = (value: number) => new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 }).format(Math.max(0, value));

export function RoiCalculator() {
  const { roiInputs, updateRoi, notify, navigate } = useApp();
  const result = useMemo(() => {
    const social = 1 + roiInputs.socialRate / 100;
    const traditionalAnnual = roiInputs.staff * roiInputs.wage * social * 12 + roiInputs.recruitmentAnnual + roiInputs.outsourcingMonthly * 12 + roiInputs.toolsMonthly * 12 + roiInputs.supportAnnual;
    const remainingStaff = Math.max(0, roiInputs.staff - roiInputs.reducibleStaff);
    const aiAnnual = remainingStaff * roiInputs.wage * social * 12 + roiInputs.recruitmentAnnual * (1 - roiInputs.recruitmentReduction / 100) + roiInputs.outsourcingMonthly * 12 * (1 - roiInputs.outsourcingReduction / 100) + roiInputs.toolsMonthly * 12 * (1 - roiInputs.toolsReduction / 100) + roiInputs.supportAnnual * (1 - roiInputs.recruitmentReduction / 100) + roiInputs.extraServiceAnnual;
    const directInvestment = roiInputs.aiPrice + roiInputs.customDev;
    const traditionalTotal = traditionalAnnual * roiInputs.years;
    const aiTotal = aiAnnual * roiInputs.years + directInvestment;
    const savings = traditionalTotal - aiTotal;
    const monthlySaving = (traditionalAnnual - aiAnnual) / 12;
    return { traditionalAnnual, aiAnnual, directInvestment, traditionalTotal, aiTotal, savings, reductionRate: traditionalTotal ? savings / traditionalTotal : 0, paybackMonths: monthlySaving > 0 ? directInvestment / monthlySaving : 0, aiMonthlyCost: roiInputs.years ? aiTotal / roiInputs.years / 12 : 0 };
  }, [roiInputs]);

  const setValue = (key: keyof RoiInputs, value: string) => updateRoi({ [key]: Number(value) || 0 });
  return <>
    <PageHeader eyebrow="ROI SCENARIO MODEL" title="ROI测算" description="基于客户自行填写的经营成本，实时计算AI协同模式的投入与节省。" actions={<><DemoNote text="本地计算" /><button className="btn" onClick={() => notify('ROI测算已保存到本地')}><Save size={15} />保存本次测算</button></>} />
    <div className="roi-layout">
      <Surface title="测算输入" kicker="所有输入均可现场调整">
        <div className="roi-form">{numberFields.map(({ key, label, suffix, percent }) => <div className="field" key={key}><label>{label}</label><div style={{ position: 'relative' }}><input className="input" type="number" min={0} value={roiInputs[key]} onChange={(e) => setValue(key, e.target.value)} style={{ paddingRight: 55 }} />{suffix && <span style={{ position: 'absolute', right: 11, top: 11, color: '#6e82a2', fontSize: 11 }}>{suffix}</span>}</div></div>)}</div>
        <div className="surface-subtle" style={{ marginTop: 17, padding: 13 }}><div className="surface-kicker" style={{ marginBottom: 8 }}>选填收益测算</div><div className="roi-form">{([['monthlyInquiries', '每月新增有效询盘', '条'], ['conversionRate', '询盘转订单率', '%'], ['grossProfit', '平均单笔订单毛利润', '元']] as const).map(([key, label, suffix]) => <div className="field" key={key}><label>{label}</label><div style={{ position: 'relative' }}><input className="input" type="number" min={0} value={roiInputs[key]} onChange={(e) => setValue(key, e.target.value)} style={{ paddingRight: 38 }} /> <span style={{ position:'absolute', right:10, top:11, color:'#6e82a2', fontSize:10 }}>{suffix}</span></div></div>)}</div></div>
      </Surface>
      <div>
        <Surface title="测算结果" kicker="实时计算，不构成询盘、成交或收益承诺">
          <div className="roi-result-grid">
            <Result label="传统模式总成本" value={`¥ ${money(result.traditionalTotal)}`} />
            <Result label="AI协同总成本" value={`¥ ${money(result.aiTotal)}`} />
            <Result label="预计净节省" value={`¥ ${money(result.savings)}`} highlight />
            <Result label="成本降低比例" value={`${(result.reductionRate * 100).toFixed(1)}%`} highlight />
            <Result label="成本节省回本周期" value={result.paybackMonths ? `${result.paybackMonths.toFixed(1)}个月` : '暂无法计算'} />
            <Result label="AI等效月成本" value={`¥ ${money(result.aiMonthlyCost)}`} />
          </div>
          <div className="surface-subtle" style={{ marginTop: 16, padding: 14, display: 'flex', gap: 10, alignItems: 'flex-start' }}><TrendingDown size={17} color="#76b7ff" /><div><div style={{ color: '#cbdaf0', fontSize: 12 }}>年度成本模型</div><div className="tiny-note" style={{ marginTop: 5 }}>传统模式 ¥{money(result.traditionalAnnual)} / 年 · AI协同 ¥{money(result.aiAnnual)} / 年 · AI直接投入 ¥{money(result.directInvestment)}</div></div></div>
          <div className="tiny-note" style={{ marginTop: 16 }}>本测算基于客户自行填写的经营成本，不构成询盘、成交或收益承诺。测算结果会随输入变化。</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 20 }}><button className="btn" onClick={() => notify('ROI报告已生成，可在本地打印为PDF')}><FileDown size={14} />导出ROI报告</button><button className="btn" onClick={() => notify('老板展示页已准备')}><Calculator size={14} />生成老板展示页</button><button className="btn btn-primary" onClick={() => navigate('plan')}>进入合作方案<ArrowRight size={14} /></button></div>
        </Surface>
      </div>
    </div>
  </>;
}

function Result({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return <div className={`roi-result ${highlight ? 'highlight' : ''}`}><div className="label">{label}</div><div className="number">{value}</div></div>;
}

