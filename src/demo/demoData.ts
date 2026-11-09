import type { CompanyProfile, ContentForm, GeneratedContent, PublishRecord, RoiInputs } from '../types';
import { appConfig, platformNames } from '../config';
import { coreDemoSalesCustomers, getTimelineEvent } from './demoSalesFlow';

export const defaultCompany: CompanyProfile = {
  companyName: '浙江某智能装备有限公司',
  industry: '机械设备制造',
  products: '自动喷涂设备、自动化生产线',
  targetCustomers: '五金工厂、金属制品厂、家具生产企业',
  regions: '浙江、江苏、广东',
  strengths: '十五年设备制造经验\n支持定制化生产线\n提供安装调试服务\n设备运行稳定',
  sellingPoints: '稳定运行、支持定制、安装调试一体化',
  operationPeople: 1,
  monthlyWage: 6000,
  promotion: '展会、搜索、老客户转介绍',
  faq: '适用行业、设备配置、交付周期、安装调试、初步报价',
  contact: '________',
};

export const companyTemplates: Record<string, CompanyProfile> = {
  机械设备企业: defaultCompany,
  制造业企业: {
    ...defaultCompany,
    companyName: '某制造业科技有限公司',
    industry: '智能制造',
    products: '自动化产线、视觉检测设备',
    targetCustomers: '电子工厂、汽车零部件企业',
    regions: '华东、华南',
    sellingPoints: '交付稳定、模块化设计、支持产线升级',
  },
  外贸企业: {
    ...defaultCompany,
    companyName: '某工业设备出口有限公司',
    industry: '工业设备外贸',
    products: '自动喷涂设备、表面处理设备',
    targetCustomers: '海外经销商、海外工厂、工程承包商',
    regions: '东南亚、欧洲、北美',
    promotion: '官网、展会、海外内容营销',
    sellingPoints: '支持海外交付、英文资料、远程服务协同',
  },
};

export const defaultContentForm: ContentForm = {
  contentType: '产品介绍',
  platform: '知乎',
  tone: '专业可信',
  keywords: '自动喷涂设备, 工厂自动化',
  region: '浙江',
};

export const defaultContent: GeneratedContent = {
  title: '浙江工厂如何选择自动喷涂设备？从产线需求出发',
  summary: '围绕制造企业采购关注的稳定性、产能与服务，梳理自动喷涂设备的选型思路。',
  body: '对于需要提升喷涂一致性和生产效率的制造企业，设备选型需要同时关注工件尺寸、日产量、喷涂材料与现场空间。\n\n自动喷涂设备可以将重复性工序交给稳定的自动化流程，并通过参数配置适配不同产品。建议采购前先梳理产线节拍、工艺要求和售后支持范围，再结合实际工况沟通方案。\n\n如果您正在评估自动化改造，可以先提交产品类型与产能需求，我们会根据资料整理初步沟通方向。',
  keywords: ['自动喷涂设备', '浙江设备厂家', '工厂自动化'],
  cta: '欢迎留下您的工件类型与日产量，获取初步选型建议。',
  tags: ['机械设备', '采购指南', '浙江制造'],
};

export const defaultPublishRecords: PublishRecord[] = platformNames.map((platform, index) => ({
  platform,
  status: index === 0 ? '发布成功' : '待发布',
  detail: index === 0 ? '等待平台收录' : '等待配置',
  published: index === 0 ? 4 : 0,
}));

export const defaultRoiInputs: RoiInputs = {
  years: 3,
  staff: 1,
  reducibleStaff: 1,
  wage: 6000,
  socialRate: 20,
  recruitmentAnnual: 5000,
  outsourcingMonthly: 3000,
  toolsMonthly: 800,
  supportAnnual: 5000,
  aiPrice: appConfig.price,
  customDev: 0,
  extraServiceAnnual: 0,
  outsourcingReduction: 80,
  toolsReduction: 50,
  recruitmentReduction: 70,
  monthlyInquiries: 0,
  conversionRate: 0,
  grossProfit: 0,
};

export const demoLeads = coreDemoSalesCustomers.map((customer) => ({
  customerId: customer.customerId,
  name: customer.name,
  source: customer.lead.source,
  region: customer.region,
  product: customer.demandProduct,
  action: getTimelineEvent(customer, 'lead-created').label,
  intent: customer.lead.intent,
  status: customer.lead.status,
  owner: customer.lead.owner,
}));
