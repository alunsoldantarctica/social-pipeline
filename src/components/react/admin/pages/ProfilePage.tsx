import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { AdminShell } from '../AdminShell';
import { AdminScrollArea } from '../AdminScrollArea';
import { cn } from '../../../../lib/utils';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  User,
  Shield,
  Mail,
  Clock,
  Camera,
  Save,
  Loader2,
  Check,
} from 'lucide-react';

export function ProfileContent() {
  const currentUser = useQuery(api.users.getCurrentUser, {});
  const profile = useQuery(api.admin.adminProfiles.getMyProfile, {});
  const upsertProfile = useMutation(api.admin.adminProfiles.upsertProfile);
  const generateUploadUrl = useMutation(api.admin.adminProfiles.generateUploadUrl);

  const [displayName, setDisplayName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [StarterKit],
    content: '',
    editorProps: {
      attributes: {
        class: 'prose prose-invert prose-sm max-w-none min-h-[100px] p-3 focus:outline-none',
      },
    },
  });

  // Populate from profile once loaded
  useEffect(() => {
    if (profile && editor) {
      setDisplayName(profile.displayName || '');
      if (profile.emailSignature) {
        editor.commands.setContent(profile.emailSignature);
      }
    }
  }, [profile?._id]);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type and size
    if (!file.type.startsWith('image/')) return;
    if (file.size > 5 * 1024 * 1024) return; // 5MB limit

    setIsUploadingAvatar(true);
    try {
      const uploadUrl = await generateUploadUrl({});
      const result = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      const { storageId } = await result.json();

      await upsertProfile({
        displayName: displayName.trim() || profile?.displayName || 'Admin',
        emailSignature: editor?.getHTML(),
        avatarStorageId: storageId,
      });
    } finally {
      setIsUploadingAvatar(false);
      // Reset file input
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSave = async () => {
    if (!editor) return;
    setIsSaving(true);
    setSaved(false);
    try {
      await upsertProfile({
        displayName: displayName.trim() || 'Admin',
        emailSignature: editor.getHTML(),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setIsSaving(false);
    }
  };

  if (currentUser === undefined) {
    return <div className="text-slate-400">Loading...</div>;
  }

  if (currentUser === null) {
    return <div className="text-slate-400">Not signed in.</div>;
  }

  // Resolve avatar: admin profile avatar > auth provider image > initials
  const avatarUrl = profile?.avatarUrl || currentUser.image;

  // Reset error state when URL changes (e.g. after uploading a new avatar)
  useEffect(() => {
    setAvatarError(false);
  }, [avatarUrl]);

  return (
    <div className="max-w-2xl space-y-6">
      {/* Profile Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-6">
        {/* Avatar + Name */}
        <div className="flex items-center gap-4 mb-6">
          <div className="relative group">
            {avatarUrl && !avatarError ? (
              <img
                src={avatarUrl}
                alt={currentUser.name || 'User'}
                className="w-16 h-16 rounded-full object-cover"
                onError={() => setAvatarError(true)}
              />
            ) : (
              <div className="w-16 h-16 bg-teal-600/20 rounded-full flex items-center justify-center">
                <span className="text-teal-400 text-2xl font-medium">
                  {currentUser.name?.[0] || currentUser.email?.[0] || 'U'}
                </span>
              </div>
            )}
            {/* Overlay button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploadingAvatar}
              className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
            >
              {isUploadingAvatar ? (
                <Loader2 className="w-5 h-5 text-white animate-spin" />
              ) : (
                <Camera className="w-5 h-5 text-white" />
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarChange}
              className="hidden"
            />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-white">
              {currentUser.name || 'User'}
            </h2>
            <span className="inline-flex items-center gap-1.5 mt-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-teal-600/20 text-teal-400">
              <Shield className="w-3 h-3" />
              Admin
            </span>
          </div>
        </div>

        {/* Details */}
        <div className="space-y-4">
          {currentUser.email && (
            <div className="flex items-center gap-3 text-sm">
              <Mail className="w-4 h-4 text-slate-500" />
              <span className="text-slate-400">Email</span>
              <span className="text-white ml-auto">{currentUser.email}</span>
            </div>
          )}
          {currentUser.name && (
            <div className="flex items-center gap-3 text-sm">
              <User className="w-4 h-4 text-slate-500" />
              <span className="text-slate-400">Name</span>
              <span className="text-white ml-auto">{currentUser.name}</span>
            </div>
          )}
          <div className="flex items-center gap-3 text-sm">
            <Clock className="w-4 h-4 text-slate-500" />
            <span className="text-slate-400">Account created</span>
            <span className="text-white ml-auto">
              {new Date(currentUser._creationTime).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </span>
          </div>
        </div>
      </div>

      {/* Email Signature */}
      {profile !== undefined && (
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-1">Email Signature</h3>
          <p className="text-sm text-slate-400 mb-4">
            Your signature is auto-appended to outreach emails sent from the admin dashboard.
          </p>

          <div className="space-y-4">
            {/* Display name */}
            <div>
              <label className="block text-sm text-slate-400 mb-1">Display Name</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-teal-600"
              />
            </div>

            {/* Signature editor */}
            <div>
              <label className="block text-sm text-slate-400 mb-1">Signature</label>
              <div className="border border-slate-700 rounded-lg overflow-hidden bg-slate-800">
                {editor && (
                  <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-slate-700 bg-slate-800/80">
                    <button
                      onClick={() => editor.chain().focus().toggleBold().run()}
                      className={cn(
                        'px-2 py-1 rounded text-xs font-bold transition-colors',
                        editor.isActive('bold') ? 'bg-teal-600/20 text-teal-400' : 'text-slate-400 hover:text-white hover:bg-slate-700',
                      )}
                    >
                      B
                    </button>
                    <button
                      onClick={() => editor.chain().focus().toggleItalic().run()}
                      className={cn(
                        'px-2 py-1 rounded text-xs italic transition-colors',
                        editor.isActive('italic') ? 'bg-teal-600/20 text-teal-400' : 'text-slate-400 hover:text-white hover:bg-slate-700',
                      )}
                    >
                      I
                    </button>
                  </div>
                )}
                <EditorContent editor={editor} />
              </div>
            </div>

            {/* Save */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {isSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                {isSaving ? 'Saving...' : 'Save'}
              </button>
              {saved && (
                <span className="flex items-center gap-1 text-sm text-green-400">
                  <Check className="w-4 h-4" />
                  Saved
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProfilePage() {
  return (
    <AdminShell title="Profile" subtitle="Your account details" currentPath="/admin/profile">
      <AdminScrollArea>
        <ProfileContent />
      </AdminScrollArea>
    </AdminShell>
  );
}
