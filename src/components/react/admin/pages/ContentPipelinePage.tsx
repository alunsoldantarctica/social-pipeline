import { createSimpleAdminPage } from '../createAdminPage';
import { ContentPipelineAdminContent } from '../ContentPipelineAdmin';

export default createSimpleAdminPage({
  title: 'Content Pipeline',
  subtitle: 'AI-assisted article workflows',
  currentPath: '/admin/content-pipeline',
  component: ContentPipelineAdminContent,
});
