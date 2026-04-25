import { BarChart2, Globe, GitBranch, FileText, Users } from 'lucide-react';
import { createTabbedAdminPage } from '../createAdminPage';
import { AnalyticsOverviewTab } from '../analytics/AnalyticsOverviewTab';
import { AnalyticsTrafficTab } from '../analytics/AnalyticsTrafficTab';
import { AnalyticsFunnelTab } from '../analytics/AnalyticsFunnelTab';
import { AnalyticsBlogTab } from '../analytics/AnalyticsBlogTab';
import { AnalyticsVisitorsTab } from '../analytics/AnalyticsVisitorsTab';

export default createTabbedAdminPage({
  title: 'Analytics',
  subtitle: 'Page views, traffic sources & content performance',
  currentPath: '/admin/analytics',
  tabs: [
    { value: 'overview', label: 'Overview', icon: <BarChart2 className="w-4 h-4" />, component: AnalyticsOverviewTab },
    { value: 'traffic', label: 'Traffic Sources', icon: <Globe className="w-4 h-4" />, component: AnalyticsTrafficTab },
    { value: 'funnel', label: 'Funnel & Navigation', icon: <GitBranch className="w-4 h-4" />, component: AnalyticsFunnelTab },
    { value: 'blog', label: 'Blog Performance', icon: <FileText className="w-4 h-4" />, component: AnalyticsBlogTab },
    { value: 'visitors', label: 'Visitors', icon: <Users className="w-4 h-4" />, component: AnalyticsVisitorsTab },
  ],
});
