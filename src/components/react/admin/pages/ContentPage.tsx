import { FileText, Sparkles, HelpCircle, Layers, ShieldCheck, Cpu } from 'lucide-react';
import { createTabbedAdminPage } from '../createAdminPage';
import { BlogAdminContent } from '../BlogAdmin';
import { ContentPipelineAdminContent } from '../ContentPipelineAdmin';
import { FaqAdminContent } from '../FaqAdmin';
import { PodsAdminContent } from '../PodsAdmin';
import { EditorialRulesAdminContent } from '../EditorialRulesAdmin';
import { ModelCatalogAdminContent } from '../ModelCatalogAdmin';

export default createTabbedAdminPage({
  title: 'Content',
  subtitle: 'Blog posts, content pods, AI pipeline, models, rules & FAQ',
  currentPath: '/admin/content',
  tabs: [
    { value: 'blog', label: 'Blog', icon: <FileText className="w-4 h-4" />, component: BlogAdminContent },
    { value: 'pods', label: 'Pods', icon: <Layers className="w-4 h-4" />, component: PodsAdminContent },
    { value: 'pipeline', label: 'Pipeline', icon: <Sparkles className="w-4 h-4" />, component: ContentPipelineAdminContent },
    { value: 'models', label: 'Models', icon: <Cpu className="w-4 h-4" />, component: ModelCatalogAdminContent },
    { value: 'rules', label: 'Rules', icon: <ShieldCheck className="w-4 h-4" />, component: EditorialRulesAdminContent },
    { value: 'faq', label: 'FAQ', icon: <HelpCircle className="w-4 h-4" />, component: FaqAdminContent },
  ],
});
