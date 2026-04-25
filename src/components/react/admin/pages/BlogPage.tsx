import { createSimpleAdminPage } from '../createAdminPage';
import { BlogAdminContent } from '../BlogAdmin';

export default createSimpleAdminPage({
  title: 'Blog Posts',
  subtitle: 'Manage blog content and publications',
  currentPath: '/admin/blog',
  component: BlogAdminContent,
});
