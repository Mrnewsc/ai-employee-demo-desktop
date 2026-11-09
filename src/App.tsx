import { useEffect } from 'react';
import { AppShell } from './components/AppShell';
import { useApp } from './stores/AppStore';
import { Dashboard } from './pages/Dashboard';
import { CompanyConfig } from './pages/CompanyConfig';
import { ContentGenerator } from './pages/ContentGenerator';
import { PublishingCenter } from './pages/PublishingCenter';
import { GeoKeywords } from './pages/GeoKeywords';
import { Leads } from './pages/Leads';
import { AIReception } from './pages/AIReception';
import { Quotations } from './pages/Quotations';
import { FollowUps } from './pages/FollowUps';
import { Analytics } from './pages/Analytics';
import { RoiCalculator } from './pages/RoiCalculator';
import { CooperationPlan } from './pages/CooperationPlan';
import { Settings } from './pages/Settings';

export default function App() {
  const { activePage, navigate } = useApp();
  const preview = new URLSearchParams(window.location.search).get('preview');
  const previewPage = preview === 'dashboard' ? 'dashboard' : preview === 'content-generator' ? 'content' : preview === 'ai-reception' || preview === 'real-analysis' ? 'reception' : preview === 'roi-calculator' ? 'roi' : preview === 'product-catalog' ? 'company' : null;
  useEffect(() => { if (previewPage && activePage !== previewPage) navigate(previewPage); }, [previewPage, activePage, navigate]);
  const page = previewPage ?? activePage;
  const content = page === 'dashboard' ? <Dashboard />
    : page === 'company' ? <CompanyConfig />
      : page === 'content' ? <ContentGenerator />
        : page === 'publishing' ? <PublishingCenter />
          : page === 'geo' ? <GeoKeywords />
            : page === 'leads' ? <Leads />
              : page === 'reception' ? <AIReception />
                : page === 'quotes' ? <Quotations />
                  : page === 'followups' ? <FollowUps />
                    : page === 'analytics' ? <Analytics />
                      : page === 'roi' ? <RoiCalculator />
                        : page === 'plan' ? <CooperationPlan />
                          : <Settings />;
  return <AppShell>{content}</AppShell>;
}
