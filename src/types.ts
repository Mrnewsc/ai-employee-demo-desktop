export type PageKey =
  | 'dashboard'
  | 'company'
  | 'content'
  | 'publishing'
  | 'geo'
  | 'leads'
  | 'reception'
  | 'quotes'
  | 'followups'
  | 'analytics'
  | 'roi'
  | 'plan'
  | 'settings';

export type CompanyProfile = {
  companyName: string;
  industry: string;
  products: string;
  targetCustomers: string;
  regions: string;
  strengths: string;
  sellingPoints: string;
  operationPeople: number;
  monthlyWage: number;
  promotion: string;
  faq: string;
  contact: string;
};

export type ContentForm = {
  contentType: string;
  platform: string;
  tone: string;
  keywords: string;
  region: string;
};

export type GeneratedContent = {
  title: string;
  summary: string;
  body: string;
  keywords: string[];
  cta: string;
  tags: string[];
};

export type PublishStatus = '待发布' | '适配中' | '发布成功' | '等待收录';

export type PublishRecord = {
  platform: string;
  status: PublishStatus;
  detail: string;
  published: number;
};

export type RoiInputs = {
  years: number;
  staff: number;
  reducibleStaff: number;
  wage: number;
  socialRate: number;
  recruitmentAnnual: number;
  outsourcingMonthly: number;
  toolsMonthly: number;
  supportAnnual: number;
  aiPrice: number;
  customDev: number;
  extraServiceAnnual: number;
  outsourcingReduction: number;
  toolsReduction: number;
  recruitmentReduction: number;
  monthlyInquiries: number;
  conversionRate: number;
  grossProfit: number;
};

export type RoiResult = {
  traditionalAnnual: number;
  aiAnnual: number;
  directInvestment: number;
  traditionalTotal: number;
  aiTotal: number;
  savings: number;
  reductionRate: number;
  paybackMonths: number;
  aiMonthlyCost: number;
};

