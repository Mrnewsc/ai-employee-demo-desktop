import { useState } from 'react';
import { Save, Check, Building2, Package } from 'lucide-react';
import { companyTemplates } from '../demo/demoData';
import { useApp } from '../stores/AppStore';
import { DemoNote, PageHeader, Surface } from '../components/UI';
import type { CompanyProfile } from '../types';
import { CatalogManagementPanel } from '../catalog-management/CatalogManagementPanel';

const fields: { key: keyof CompanyProfile; label: string; type?: string; full?: boolean }[] = [
  { key: 'companyName', label: '企业名称' },
  { key: 'industry', label: '所属行业' },
  { key: 'products', label: '主营产品' },
  { key: 'targetCustomers', label: '目标客户', full: true },
  { key: 'regions', label: '主要销售地区' },
  { key: 'sellingPoints', label: '产品卖点' },
  { key: 'operationPeople', label: '现有运营人数', type: 'number' },
  { key: 'monthlyWage', label: '现有人均工资', type: 'number' },
  { key: 'promotion', label: '当前推广方式' },
  { key: 'contact', label: '联系方式' },
  { key: 'strengths', label: '企业优势', full: true },
  { key: 'faq', label: '客户常见问题', full: true },
];

export function CompanyConfig() {
  const { company, updateCompany, notify } = useApp();
  const preview = new URLSearchParams(window.location.search).get('preview');
  const [section, setSection] = useState<'profile' | 'catalog'>(preview === 'product-catalog' ? 'catalog' : 'profile');
  return <>
    <PageHeader eyebrow={section === 'catalog' ? 'PRODUCT CATALOG' : 'COMPANY PROFILE'} title={section === 'catalog' ? '企业产品库' : '企业配置'} description={section === 'catalog' ? '管理企业真实产品资料，为AI产品匹配提供统一、可追溯的数据基础。' : '让AI先理解企业，再围绕真实产品与客户开展演示。'} actions={section === 'profile' ? <DemoNote /> : undefined} />
    <div className="company-config-tabs" role="tablist">
      <button role="tab" aria-selected={section === 'profile'} className={section === 'profile' ? 'active' : ''} onClick={() => setSection('profile')}><Building2 />企业基础信息</button>
      <button role="tab" aria-selected={section === 'catalog'} className={section === 'catalog' ? 'active' : ''} onClick={() => setSection('catalog')}><Package />企业产品库</button>
    </div>
    {section === 'catalog' ? <CatalogManagementPanel /> : <>
    <Surface title="选择演示模板" kicker="点击模板自动填充，可继续修改">
      <div className="template-row">{Object.entries(companyTemplates).map(([name, template]) => <button key={name} className={`template ${company.companyName === template.companyName ? 'active' : ''}`} onClick={() => updateCompany(template)}><Building2 size={13} style={{ verticalAlign: 'middle', marginRight: 5 }} />{name}</button>)}</div>
      <div className="form-grid">
        {fields.map(({ key, label, type, full }) => <div className={`field ${full ? 'full' : ''}`} key={key}>
          <label>{label}</label>
          {key === 'strengths' || key === 'faq' ? <textarea className="textarea" value={String(company[key])} onChange={(event) => updateCompany({ [key]: event.target.value } as Partial<CompanyProfile>)} /> : <input className="input" type={type ?? 'text'} value={String(company[key])} onChange={(event) => updateCompany({ [key]: type === 'number' ? Number(event.target.value) : event.target.value } as Partial<CompanyProfile>)} />}
        </div>)}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, gap: 12, flexWrap: 'wrap' }}>
        <div className="tiny-note">保存后，内容生成、GEO、AI接待与ROI测算会自动使用当前企业信息。</div>
        <button className="btn btn-primary" onClick={() => notify('企业资料已保存，其他模块已同步')}><Save size={15} />保存企业配置</button>
      </div>
    </Surface>
    <div className="surface-subtle" style={{ marginTop: 18, padding: 16, display: 'flex', alignItems: 'center', gap: 9, color: '#95a8c5', fontSize: 12 }}><Check size={15} color="#6ed9b3" />企业专属知识库已准备，当前信息仅保存在本地演示环境。</div>
    </>}
  </>;
}
