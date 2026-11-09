import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { defaultCompany, defaultContent, defaultContentForm, defaultPublishRecords, defaultRoiInputs, demoLeads } from '../demo/demoData';
import { getSalesContextForCustomer, primaryDemoCustomerId, type DemoFollowupStatus, type DemoLeadStatus, type DemoQuoteStatus, type SalesStage } from '../demo/demoSalesFlow';
import { createInitialDemoSalesRuntime, normalizeDemoSalesRuntime, type DemoFollowupRuntime, type DemoSalesRuntimeState } from '../demo/demoStore';
import type { CompanyProfile, ContentForm, GeneratedContent, PageKey, PublishRecord, RoiInputs } from '../types';
import type { RealQuoteDraftHandoff } from '../real-ai/pipeline';

type SalesNavigationContext = Partial<ReturnType<typeof getSalesContextForCustomer>>;

type AppState = {
  activePage: PageKey;
  company: CompanyProfile;
  contentForm: ContentForm;
  content: GeneratedContent;
  publishRecords: PublishRecord[];
  roiInputs: RoiInputs;
  leads: typeof demoLeads;
  demoMode: boolean;
  demoStep: number;
  message: string;
  currentCustomerId: string;
  currentQuoteId: string;
  currentFollowupId: string;
  demoSales: DemoSalesRuntimeState;
  realQuoteDraft: RealQuoteDraftHandoff | null;
};

type AppContextValue = AppState & {
  navigate: (page: PageKey, context?: SalesNavigationContext) => void;
  setSalesCustomer: (customerId: string) => void;
  updateDemoCustomer: (customerId: string, patch: Partial<{ leadStatus: DemoLeadStatus; salesStage: SalesStage }>) => void;
  updateDemoQuote: (quoteId: string, status: DemoQuoteStatus) => void;
  updateDemoFollowup: (followupId: string, patch: Partial<DemoFollowupRuntime>) => void;
  updateCompany: (patch: Partial<CompanyProfile>) => void;
  updateContentForm: (patch: Partial<ContentForm>) => void;
  setContent: (content: GeneratedContent) => void;
  setPublishRecords: (records: PublishRecord[] | ((current: PublishRecord[]) => PublishRecord[])) => void;
  updateRoi: (patch: Partial<RoiInputs>) => void;
  startDemo: () => void;
  exitDemo: () => void;
  nextDemoStep: () => void;
  previousDemoStep: () => void;
  fillDemo: () => void;
  resetDemo: () => void;
  notify: (message: string) => void;
  setRealQuoteDraft: (draft: RealQuoteDraftHandoff | null) => void;
};

const initialState: AppState = {
  activePage: 'dashboard',
  company: defaultCompany,
  contentForm: defaultContentForm,
  content: defaultContent,
  publishRecords: defaultPublishRecords,
  roiInputs: defaultRoiInputs,
  leads: demoLeads,
  demoMode: false,
  demoStep: 0,
  message: '',
  demoSales: createInitialDemoSalesRuntime(),
  realQuoteDraft: null,
  ...getSalesContextForCustomer(primaryDemoCustomerId),
};

const AppContext = createContext<AppContextValue | null>(null);
const storageKey = 'shuyuan-ai-employee-demo-state';

const demoSteps: PageKey[] = ['dashboard', 'company', 'content', 'publishing', 'geo', 'reception', 'leads', 'quotes', 'roi', 'plan'];

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved) {
        const restored = JSON.parse(saved) as Partial<AppState>;
        const customerId = restored.currentCustomerId ?? primaryDemoCustomerId;
        return {
          ...initialState,
          ...restored,
          ...getSalesContextForCustomer(customerId),
          demoSales: normalizeDemoSalesRuntime(restored.demoSales),
          demoMode: false,
          message: '',
        } as AppState;
      }
    } catch {
      // Ignore malformed local demo data and restore defaults.
    }
    return initialState;
  });

  useEffect(() => {
    const persistable = { ...state, demoMode: false, message: '' };
    window.localStorage.setItem(storageKey, JSON.stringify(persistable));
  }, [state]);

  const value = useMemo<AppContextValue>(() => ({
    ...state,
    navigate: (page, context) => setState((current) => ({ ...current, activePage: page, ...context })),
    setSalesCustomer: (customerId) => setState((current) => ({ ...current, ...getSalesContextForCustomer(customerId) })),
    updateDemoCustomer: (customerId, patch) => setState((current) => ({
      ...current,
      demoSales: {
        ...current.demoSales,
        customers: {
          ...current.demoSales.customers,
          [customerId]: { ...current.demoSales.customers[customerId], ...patch },
        },
      },
    })),
    updateDemoQuote: (quoteId, status) => setState((current) => ({
      ...current,
      demoSales: {
        ...current.demoSales,
        quotes: { ...current.demoSales.quotes, [quoteId]: { status } },
      },
    })),
    updateDemoFollowup: (followupId, patch) => setState((current) => ({
      ...current,
      demoSales: {
        ...current.demoSales,
        followups: {
          ...current.demoSales.followups,
          [followupId]: { ...current.demoSales.followups[followupId], ...patch },
        },
      },
    })),
    updateCompany: (patch) => setState((current) => ({ ...current, company: { ...current.company, ...patch } })),
    updateContentForm: (patch) => setState((current) => ({ ...current, contentForm: { ...current.contentForm, ...patch } })),
    setContent: (content) => setState((current) => ({ ...current, content })),
    setPublishRecords: (records) => setState((current) => ({ ...current, publishRecords: typeof records === 'function' ? records(current.publishRecords) : records })),
    updateRoi: (patch) => setState((current) => ({ ...current, roiInputs: { ...current.roiInputs, ...patch } })),
    setRealQuoteDraft: (realQuoteDraft) => setState((current) => ({ ...current, realQuoteDraft })),
    startDemo: () => setState((current) => ({ ...current, demoMode: true, demoStep: 0, activePage: 'dashboard' })),
    exitDemo: () => setState((current) => ({ ...current, demoMode: false })),
    nextDemoStep: () => setState((current) => {
      const next = Math.min(current.demoStep + 1, demoSteps.length - 1);
      return { ...current, demoStep: next, activePage: demoSteps[next] };
    }),
    previousDemoStep: () => setState((current) => {
      const previous = Math.max(current.demoStep - 1, 0);
      return { ...current, demoStep: previous, activePage: demoSteps[previous] };
    }),
    fillDemo: () => setState((current) => ({ ...current, ...initialState, message: '演示数据已填充，可开始现场演示' })),
    resetDemo: () => setState({ ...initialState, message: '演示数据已重置' }),
    notify: (message) => {
      setState((current) => ({ ...current, message }));
      window.setTimeout(() => setState((current) => current.message === message ? { ...current, message: '' } : current), 2600);
    },
  }), [state]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used within AppProvider');
  return value;
}
