import {
  allDemoSalesCustomers,
  demoFollowupTasks,
  demoQuoteRecords,
  type DemoFollowupStatus,
  type DemoLeadStatus,
  type DemoQuoteStatus,
  type SalesStage,
} from './demoSalesFlow';

export type DemoCustomerRuntime = {
  leadStatus: DemoLeadStatus;
  salesStage: SalesStage;
};

export type DemoQuoteRuntime = {
  status: DemoQuoteStatus;
};

export type DemoFollowupRuntime = {
  status: DemoFollowupStatus;
  suggestedTime: string;
};

export type DemoSalesRuntimeState = {
  customers: Record<string, DemoCustomerRuntime>;
  quotes: Record<string, DemoQuoteRuntime>;
  followups: Record<string, DemoFollowupRuntime>;
};

const initialCustomerState: Record<string, DemoCustomerRuntime> = {
  'customer-jinhua-001': { leadStatus: '今日跟进', salesStage: '跟进' },
  'customer-yiwu-002': { leadStatus: '报价处理中', salesStage: '报价' },
  'customer-foshan-003': { leadStatus: '待报价', salesStage: '需求确认' },
  'customer-jiaxing-004': { leadStatus: '等待客户', salesStage: '跟进' },
  'customer-ningbo-005': { leadStatus: '需求确认中', salesStage: '需求确认' },
};

export function createInitialDemoSalesRuntime(): DemoSalesRuntimeState {
  return {
    customers: Object.fromEntries(allDemoSalesCustomers.map((customer) => [
      customer.customerId,
      initialCustomerState[customer.customerId] ?? { leadStatus: '待联系', salesStage: '客户发现' },
    ])),
    quotes: Object.fromEntries(demoQuoteRecords.map((quote) => [quote.id, { status: quote.status }])),
    followups: Object.fromEntries(demoFollowupTasks.map((task) => [task.id, {
      status: task.status,
      suggestedTime: task.suggestedTime,
    }])),
  };
}

export function normalizeDemoSalesRuntime(restored?: DemoSalesRuntimeState): DemoSalesRuntimeState {
  const initial = createInitialDemoSalesRuntime();
  if (!restored) return initial;

  return {
    customers: Object.fromEntries(Object.entries(initial.customers).map(([id, value]) => [
      id,
      { ...value, ...restored.customers?.[id] },
    ])),
    quotes: Object.fromEntries(Object.entries(initial.quotes).map(([id, value]) => [
      id,
      { ...value, ...restored.quotes?.[id] },
    ])),
    followups: Object.fromEntries(Object.entries(initial.followups).map(([id, value]) => [
      id,
      { ...value, ...restored.followups?.[id] },
    ])),
  };
}
