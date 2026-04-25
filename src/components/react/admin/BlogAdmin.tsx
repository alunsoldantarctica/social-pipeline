import { useState, useEffect } from 'react';
import {
  Search,
  Plus,
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  CheckCircle,
  X,
  Shield,
  Globe,
  GlobeLock,
  ExternalLink,
  Clock,
  CalendarClock,
  XCircle,
  Languages,
} from 'lucide-react';
import { useQuery, useMutation, useAction } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { cn } from '../../../lib/utils';
import { ConvexClientProvider } from '../ConvexClientProvider';
import { SignInButtons } from '../SignInButtons';
import { DataTable, CellRenderers, type Column } from './DataTable';
import { AdminForm, type FormField } from './AdminForm';
import { MarkdownEditor } from './MarkdownEditor';
import { DeleteButton } from './DeleteButton';
import type { Doc } from '../../../../convex/_generated/dataModel';

type BlogPost = Doc<'blogPosts'>;
type ViewMode = 'list' | 'edit' | 'create';

function BlogAdminInner() {
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [showUnpublished, setShowUnpublished] = useState(true);
  const [selectedPost, setSelectedPost] = useState<BlogPost | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Queries
  const currentUser = useQuery(api.users.getCurrentUser);
  const allPosts = useQuery(api.admin.blogPosts.list, {
    includeUnpublished: showUnpublished,
  });
  const searchResults = useQuery(
    api.admin.blogPosts.search,
    searchQuery.length > 0
      ? { query: searchQuery, includeUnpublished: showUnpublished }
      : 'skip'
  );

  // Mutations
  const createPost = useMutation(api.admin.blogPosts.create);
  const updatePost = useMutation(api.admin.blogPosts.update);
  const publishPost = useMutation(api.admin.blogPosts.publish);
  const unpublishPost = useMutation(api.admin.blogPosts.unpublish);
  const destroyPost = useMutation(api.admin.blogPosts.destroy);
  const schedulePublishPost = useMutation(api.admin.blogPosts.schedulePublish);
  const cancelScheduledPublishPost = useMutation(api.admin.blogPosts.cancelScheduledPublish);
  const translatePost = useAction(api.agents.translate.triggerTranslatePost);

  // Translation state — set so concurrent per-post translations each get a spinner
  const [translatingPostIds, setTranslatingPostIds] = useState<Set<string>>(() => new Set());
  const [editLocale, setEditLocale] = useState<'en' | 'es' | 'fr'>('en');
  const isTranslating = (id: string) => translatingPostIds.has(id);
  const markTranslating = (id: string, on: boolean) =>
    setTranslatingPostIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  // Mutations for translations
  const bulkUpsertTranslations = useMutation(api.contentTranslations.bulkUpsert);

  // Fetch translations when editing a non-English locale
  const translationsForLocale = useQuery(
    api.contentTranslations.getForContent,
    selectedPost && editLocale !== 'en'
      ? { contentType: 'blogPosts', contentId: selectedPost._id, locale: editLocale }
      : 'skip'
  );

  // Schedule modal state
  const [scheduleTarget, setScheduleTarget] = useState<BlogPost | null>(null);
  const [scheduleDatetime, setScheduleDatetime] = useState('');

  // Auto-dismiss the schedule panel when the tracked post is no longer schedulable
  // (published, already scheduled, or deleted).
  useEffect(() => {
    if (!scheduleTarget) return;
    const live = (allPosts as BlogPost[] | undefined)?.find((p) => p._id === scheduleTarget._id);
    if (!live || live.isPublished || live.scheduledPublishAt) {
      setScheduleTarget(null);
      setScheduleDatetime('');
    }
  }, [allPosts, scheduleTarget]);

  // Clear messages after timeout
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 8000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Handlers
  const handleEdit = (post: BlogPost) => {
    setSelectedPost(post);
    setViewMode('edit');
  };

  const handleCreate = () => {
    setSelectedPost(null);
    setViewMode('create');
  };

  const handleCancel = () => {
    setSelectedPost(null);
    setViewMode('list');
    setSearchQuery('');
    setEditLocale('en');
    setError(null);
  };

  const handleTogglePublish = async (post: BlogPost) => {
    setIsLoading(true);
    setError(null);

    try {
      if (post.isPublished) {
        await unpublishPost({ id: post._id });
        setSuccess(`"${post.title}" unpublished`);
      } else {
        await publishPost({ id: post._id });
        setSuccess(`"${post.title}" published`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update post status');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (post: BlogPost) => {
    if (!window.confirm(`Are you sure you want to delete "${post.title}"? This cannot be undone.`)) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await destroyPost({ id: post._id });
      setSuccess(`"${post.title}" deleted`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete post');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSchedule = async () => {
    if (!scheduleTarget || !scheduleDatetime) return;
    const scheduledAt = new Date(scheduleDatetime).getTime();
    if (isNaN(scheduledAt) || scheduledAt <= Date.now()) {
      setError('Scheduled time must be in the future');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      await schedulePublishPost({ id: scheduleTarget._id, scheduledPublishAt: scheduledAt });
      setSuccess(`"${scheduleTarget.title}" scheduled for ${new Date(scheduledAt).toLocaleString()}`);
      setScheduleTarget(null);
      setScheduleDatetime('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to schedule post');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelSchedule = async (post: BlogPost) => {
    setIsLoading(true);
    setError(null);
    try {
      await cancelScheduledPublishPost({ id: post._id });
      setSuccess(`Scheduled publish cancelled for "${post.title}"`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel schedule');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFormSubmit = async (formData: Record<string, unknown>) => {
    setIsLoading(true);
    setError(null);

    try {
      if (editLocale !== 'en' && selectedPost) {
        // Save translation overlay
        const translations: Array<{ field: string; value: string }> = [];
        for (const field of ['title', 'excerpt', 'content']) {
          if (formData[field] !== undefined && formData[field] !== '') {
            translations.push({ field, value: formData[field] as string });
          }
        }
        await bulkUpsertTranslations({
          contentType: 'blogPosts',
          contentId: selectedPost._id,
          locale: editLocale,
          translations,
          status: 'published',
          translatedBy: 'manual',
        });
        setSuccess(`${editLocale.toUpperCase()} translation saved for "${selectedPost.title}"`);
      } else if (selectedPost) {
        await updatePost({
          id: selectedPost._id,
          ...formData,
        } as Parameters<typeof updatePost>[0]);
        setSuccess(`"${formData.title}" updated successfully`);
      } else {
        await createPost(formData as Parameters<typeof createPost>[0]);
        setSuccess(`"${formData.title}" created successfully`);
      }
      if (editLocale === 'en') handleCancel();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save post');
    } finally {
      setIsLoading(false);
    }
  };

  // Loading state
  if (currentUser === undefined) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-teal-500 animate-spin" />
      </div>
    );
  }

  // Auth check
  if (!currentUser) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-8 max-w-md w-full">
          <div className="text-center mb-6">
            <Shield className="w-12 h-12 text-teal-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-white">Sign In Required</h2>
          </div>
          <SignInButtons darkMode={true} onSuccess={() => window.location.reload()} />
        </div>
      </div>
    );
  }

  // Per-post translation status for EN/ES/FR — drives the locale-codes column
  const translationStatus = useQuery(api.contentTranslations.getStatusByType, {
    contentType: 'blogPosts',
    locales: ['es', 'fr'],
  }) as Record<string, Record<string, 'completed' | 'translating' | 'missing'>> | undefined;

  const localeState = (postId: string, locale: 'en' | 'es' | 'fr'): 'done' | 'pending' | 'missing' => {
    if (locale === 'en') return 'done';
    if (isTranslating(postId)) return 'pending';
    const s = translationStatus?.[postId]?.[locale];
    if (s === 'completed') return 'done';
    if (s === 'translating') return 'pending';
    return 'missing';
  };

  const handleTranslateLocale = async (post: BlogPost, locale: 'es' | 'fr') => {
    if (isTranslating(post._id)) return;
    markTranslating(post._id, true);
    try {
      await translatePost({ postId: post._id, locales: [locale] });
      setSuccess(`${locale.toUpperCase()} translation queued for "${post.title}" — badge will update when done`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Translation failed');
    } finally {
      markTranslating(post._id, false);
    }
  };

  // Table columns
  const columns: Column<BlogPost>[] = [
    {
      key: 'title',
      label: 'Title',
      sortable: true,
      render: (_, row) => (
        <div className="max-w-xs">
          <p className="text-white font-medium truncate">{row.title}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-slate-500">/blog/{row.slug}</span>
            {row.isPublished && (
              <a
                href={`/blog/${row.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-teal-400 hover:text-teal-300"
              >
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'category',
      label: 'Category',
      sortable: true,
      render: (value) => CellRenderers.status(value, {
        guides: 'bg-blue-900/50 text-blue-400',
        'claims stories': 'bg-purple-900/50 text-purple-400',
        requirements: 'bg-amber-900/50 text-amber-400',
      }),
    },
    {
      key: 'isPublished',
      label: 'Status',
      sortable: true,
      align: 'center',
      render: (_, row) => {
        if (row.isPublished) {
          return (
            <span className="flex items-center gap-1.5 justify-center text-xs text-green-400">
              <Globe className="w-3.5 h-3.5" />
              Published
            </span>
          );
        }
        if (row.scheduledPublishAt) {
          return (
            <span className="flex items-center gap-1.5 justify-center text-xs text-amber-400" title={`Scheduled: ${new Date(row.scheduledPublishAt).toLocaleString()}`}>
              <Clock className="w-3.5 h-3.5" />
              Scheduled
            </span>
          );
        }
        return (
          <span className="flex items-center gap-1.5 justify-center text-xs text-slate-500">
            <GlobeLock className="w-3.5 h-3.5" />
            Draft
          </span>
        );
      },
    },
    {
      key: 'readTimeMinutes',
      label: 'Read Time',
      sortable: true,
      align: 'center',
      render: (value) => <span className="text-slate-400">{value as React.ReactNode} min</span>,
    },
    {
      key: 'publishedAt',
      label: 'Published',
      sortable: true,
      render: (value) => value ? CellRenderers.date(value) : <span className="text-slate-500">-</span>,
    },
    {
      key: '_id',
      label: 'Locales',
      align: 'center',
      render: (_, row) => (
        <div className="flex gap-2 text-xs font-mono uppercase justify-center">
          {(['en', 'es', 'fr'] as const).map((loc) => {
            const state = localeState(row._id, loc);
            const clickable = state === 'missing' && row.isPublished && (loc === 'es' || loc === 'fr');
            const Wrapper: 'button' | 'span' = clickable ? 'button' : 'span';
            return (
              <Wrapper
                key={loc}
                onClick={clickable ? () => handleTranslateLocale(row, loc as 'es' | 'fr') : undefined}
                title={
                  state === 'done'
                    ? 'Translated'
                    : state === 'pending'
                      ? 'Translating…'
                      : clickable
                        ? `Click to translate ${loc.toUpperCase()}`
                        : 'Not translated'
                }
                className={cn(
                  state === 'done' && 'text-emerald-400',
                  state === 'missing' && 'text-red-400',
                  state === 'pending' && 'text-amber-400 animate-pulse',
                  clickable && 'cursor-pointer hover:underline',
                )}
              >
                {loc}
              </Wrapper>
            );
          })}
        </div>
      ),
    },
  ];

  // Form fields
  const formFields: FormField[] = [
    { name: 'title', label: 'Title', type: 'text', required: true, fullWidth: true, group: 'Content' },
    { name: 'slug', label: 'URL Slug', type: 'text', required: true, helpText: 'URL-friendly identifier (e.g., "getting-started-with-polar-insurance")', group: 'Content' },
    {
      name: 'category',
      label: 'Category',
      type: 'select',
      required: true,
      options: [
        { value: 'Guides', label: 'Guides' },
        { value: 'Claims Stories', label: 'Claims Stories' },
        { value: 'Requirements', label: 'Requirements' },
      ],
      group: 'Content',
    },
    { name: 'excerpt', label: 'Excerpt', type: 'textarea', required: true, fullWidth: true, helpText: 'Short summary for listings and SEO', rows: 2, group: 'Content' },
    {
      name: 'content',
      label: 'Content (Markdown)',
      type: 'custom',
      fullWidth: true,
      helpText: 'Full article content in Markdown format',
      group: 'Content',
      renderCustom: ({ value, onChange, disabled }) => (
        <MarkdownEditor
          value={typeof value === 'string' ? value : ''}
          onChange={(next) => onChange(next)}
          disabled={disabled}
        />
      ),
    },
    { name: 'imageUrl', label: 'Featured Image URL', type: 'media-url', required: true, group: 'Media' },
    { name: 'readTimeMinutes', label: 'Read Time (minutes)', type: 'number', required: true, min: 1, group: 'Meta' },
    { name: 'isPublished', label: 'Published', type: 'checkbox', defaultValue: false, group: 'Settings' },
  ];

  const displayPosts = searchQuery && searchResults ? searchResults : allPosts ?? [];

  return (
    <div className="space-y-6">
      {/* Messages */}
      {(error || success) && (
        <div>
          {error && (
            <div className="flex items-center gap-3 p-4 bg-red-900/30 border border-red-800 rounded-lg text-red-300 mb-4">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span>{error}</span>
              <button onClick={() => setError(null)} className="ml-auto">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
          {success && (
            <div className="flex items-center gap-3 p-4 bg-green-900/30 border border-green-800 rounded-lg text-green-300 mb-4">
              <CheckCircle className="w-5 h-5 flex-shrink-0" />
              <span>{success}</span>
              <button onClick={() => setSuccess(null)} className="ml-auto">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* List View */}
      {viewMode === 'list' && (
        <>
          {/* Header & Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-slate-900 border border-slate-800 rounded-lg p-4">
            <h2 className="text-lg font-semibold text-white">
              Blog Posts ({displayPosts.length})
            </h2>

            <div className="flex items-center gap-3">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search posts..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 w-48 sm:w-64"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Toggle unpublished */}
              <button
                onClick={() => setShowUnpublished(!showUnpublished)}
                className={cn(
                  'p-2 rounded-lg border transition-colors',
                  showUnpublished
                    ? 'bg-slate-700 border-slate-600 text-white'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                )}
                title={showUnpublished ? 'Hide drafts' : 'Show drafts'}
              >
                {showUnpublished ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              </button>

              {/* New post */}
              <button
                onClick={handleCreate}
                className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-500 transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">New Post</span>
              </button>
            </div>
          </div>

          {/* Schedule Modal */}
          {scheduleTarget && (
            <div className="bg-slate-900 border border-amber-700 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <CalendarClock className="w-5 h-5 text-amber-400" />
                <h3 className="text-white font-medium">Schedule: {scheduleTarget.title}</h3>
                <button onClick={() => { setScheduleTarget(null); setScheduleDatetime(''); }} className="ml-auto text-slate-400 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="datetime-local"
                  value={scheduleDatetime}
                  onChange={(e) => setScheduleDatetime(e.target.value)}
                  min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
                  className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white flex-1"
                />
                <button
                  onClick={handleSchedule}
                  disabled={isLoading || !scheduleDatetime}
                  className={cn(
                    'px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-lg flex items-center gap-2',
                    (!scheduleDatetime || isLoading) && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarClock className="w-4 h-4" />}
                  Schedule Publish
                </button>
              </div>
            </div>
          )}

          {/* Data Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
            <DataTable
              data={displayPosts}
              columns={columns}
              onEdit={handleEdit}
              onToggleActive={handleTogglePublish}
              onDelete={handleDelete}
              onRowAction={async (row, action) => {
                if (action === 'schedule') setScheduleTarget(row);
                else if (action === 'cancel-schedule') handleCancelSchedule(row);
                else if (action === 'translate') {
                  if (isTranslating(row._id)) return;
                  markTranslating(row._id, true);
                  try {
                    await translatePost({ postId: row._id, locales: ['es', 'fr'] });
                    setSuccess(`Translations queued for "${row.title}" — badges will update when done`);
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Translation failed');
                  } finally {
                    markTranslating(row._id, false);
                  }
                }
              }}
              customActions={[
                { key: 'schedule', icon: <CalendarClock className="w-4 h-4" />, label: 'Schedule Publish', variant: 'default', show: (row: BlogPost) => !row.isPublished && !row.scheduledPublishAt },
                { key: 'cancel-schedule', icon: <XCircle className="w-4 h-4" />, label: 'Cancel Schedule', variant: 'danger', show: (row: BlogPost) => !row.isPublished && !!row.scheduledPublishAt },
                { key: 'translate', icon: <Languages className="w-4 h-4" />, label: 'Translate (ES + FR)', variant: 'default', show: (row: BlogPost) => row.isPublished && !isTranslating(row._id) },
              ]}
              isLoading={allPosts === undefined}
              emptyMessage="No blog posts yet"
              dimInactive={false}
            />
          </div>
        </>
      )}

      {/* Edit/Create Form */}
      {(viewMode === 'edit' || viewMode === 'create') && (() => {
        const isTranslationMode = editLocale !== 'en' && selectedPost;
        const translationFields: FormField[] = [
          { name: 'title', label: 'Title', type: 'text', required: true, fullWidth: true, group: 'Translation' },
          { name: 'excerpt', label: 'Excerpt', type: 'textarea', required: true, fullWidth: true, rows: 2, group: 'Translation' },
          {
            name: 'content',
            label: 'Content (Markdown)',
            type: 'custom',
            fullWidth: true,
            group: 'Translation',
            renderCustom: ({ value, onChange, disabled }) => (
              <MarkdownEditor
                value={typeof value === 'string' ? value : ''}
                onChange={(next) => onChange(next)}
                disabled={disabled}
              />
            ),
          },
        ];

        const translationData = isTranslationMode && translationsForLocale
          ? { title: translationsForLocale.title ?? '', excerpt: translationsForLocale.excerpt ?? '', content: translationsForLocale.content ?? '' }
          : undefined;

        const localeLabel = editLocale === 'es' ? 'Spanish' : editLocale === 'fr' ? 'French' : 'English';

        return (
          <>
            {/* Locale Tab Bar — only show when editing an existing post */}
            {selectedPost && viewMode === 'edit' && (
              <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg p-1">
                {(['en', 'es', 'fr'] as const).map((loc) => (
                  <button
                    key={loc}
                    onClick={() => setEditLocale(loc)}
                    className={cn(
                      'px-4 py-2 rounded-md text-sm font-medium transition-colors',
                      editLocale === loc
                        ? 'bg-teal-600 text-white'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800'
                    )}
                  >
                    {loc === 'en' ? 'English (Source)' : loc === 'es' ? 'Espa\u00f1ol' : 'Fran\u00e7ais'}
                  </button>
                ))}
              </div>
            )}

            {/* Auto-Translate button — shown on non-English tabs */}
            {isTranslationMode && (
              <div className="flex items-center gap-3 bg-slate-900 border border-slate-800 rounded-lg p-4">
                <div className="flex-1">
                  <p className="text-sm text-slate-400">
                    {translationData?.title
                      ? `${localeLabel} translation exists. Re-generate to overwrite.`
                      : `No ${localeLabel} translation yet.`}
                  </p>
                </div>
                <button
                  onClick={async () => {
                    if (isTranslating(selectedPost._id)) return;
                    markTranslating(selectedPost._id, true);
                    try {
                      await translatePost({ postId: selectedPost._id, locales: [editLocale] });
                      setSuccess(`${localeLabel} translation queued for "${selectedPost.title}" — badge will update when done`);
                    } catch (err) {
                      setError(err instanceof Error ? err.message : 'Translation failed');
                    } finally {
                      markTranslating(selectedPost._id, false);
                    }
                  }}
                  disabled={isTranslating(selectedPost._id)}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-500 transition-colors text-sm font-medium',
                    isTranslating(selectedPost._id) && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  {isTranslating(selectedPost._id)
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Translating...</>
                    : <><Languages className="w-4 h-4" /> Auto-Translate</>}
                </button>
              </div>
            )}

            <AdminForm
              key={`${editLocale}-${translationsForLocale ? Object.keys(translationsForLocale).length : 0}`}
              fields={isTranslationMode ? translationFields : formFields}
              initialData={isTranslationMode ? translationData : (selectedPost ?? undefined)}
              onSubmit={handleFormSubmit}
              onCancel={handleCancel}
              isLoading={isLoading}
              title={
                isTranslationMode
                  ? `${localeLabel} Translation: ${selectedPost.title}`
                  : selectedPost ? `Edit: ${selectedPost.title}` : 'New Blog Post'
              }
              subtitle={
                isTranslationMode
                  ? `Edit the ${localeLabel} translation`
                  : selectedPost ? 'Update post content' : 'Create a new blog post'
              }
              submitLabel={
                isTranslationMode
                  ? `Save ${localeLabel} Translation`
                  : selectedPost ? 'Update Post' : 'Create Post'
              }
            />

            {/* Delete Button - Only show when editing source (English) */}
            {selectedPost && viewMode === 'edit' && editLocale === 'en' && (
              <DeleteButton
                itemName={selectedPost.title}
                itemType="post"
                isLoading={isLoading}
                onDelete={async () => {
                  await destroyPost({ id: selectedPost._id });
                  setSuccess(`"${selectedPost.title}" deleted permanently`);
                  handleCancel();
                }}
              />
            )}
          </>
        );
      })()}
    </div>
  );
}

export { BlogAdminInner as BlogAdminContent };

export default function BlogAdmin() {
  return (
    <ConvexClientProvider>
      <BlogAdminInner />
    </ConvexClientProvider>
  );
}
