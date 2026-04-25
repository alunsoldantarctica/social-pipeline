import { Zap, PenLine, User } from 'lucide-react';
import { createTabbedAdminPage } from '../createAdminPage';
import { SettingsAdminContent } from '../SettingsAdmin';
import FormCopyAdmin from '../FormCopyAdmin';
import { ProfileContent } from './ProfilePage';

export default createTabbedAdminPage({
  title: 'Settings',
  subtitle: 'Auto-quoting, notifications, form copy & profile',
  currentPath: '/admin/settings',
  tabs: [
    { value: 'general', label: 'General', icon: <Zap className="w-4 h-4" />, component: SettingsAdminContent },
    { value: 'form-copy', label: 'Form Copy', icon: <PenLine className="w-4 h-4" />, component: FormCopyAdmin },
    { value: 'profile', label: 'Profile', icon: <User className="w-4 h-4" />, component: ProfileContent },
  ],
});
