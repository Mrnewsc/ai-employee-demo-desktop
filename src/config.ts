export const appConfig = {
  brandName: '数员科技',
  productName: 'AI员工一体机',
  positioning: '招聘一个AI数字员工，24小时为企业找客户。',
  price: 39800,
  warrantyYears: 3,
  geoQuarterKeywords: 500,
  contactName: '________',
  contactPhone: '________',
  logoPath: './assets/logo.png',
  robotPath: './assets/robot.png',
  devicePath: './assets/server.png',
} as const;

export const platformNames = ['小红书', '知乎', '微信公众号', '百家号', '今日头条'] as const;

export const productDeliverables = [
  'AI员工一体机设备',
  '本地化部署',
  '企业专属知识库',
  'AI内容生成系统',
  '多平台发布配置',
  'GEO关键词布局服务',
  '技术支持',
  `${appConfig.warrantyYears}年设备质保`,
];

export const complianceNote = '演示数据，不代表实际运营效果';
export const contractNote = '具体功能及交付范围以双方正式合同为准。';
