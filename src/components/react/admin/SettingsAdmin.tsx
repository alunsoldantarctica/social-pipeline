/**
 * Settings Admin
 *
 * Manages AI model configurations for the content pipeline:
 * - Agent configs (research, outline, draft, embedding)
 * - Available models list
 */

import { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';
import { ConvexClientProvider } from '../ConvexClientProvider';
import { OfflinePdfManager } from './settings/OfflinePdfManager';
import { cn } from '../../../lib/utils';
import {
  Plus,
  Trash2,
  Edit3,
  Loader2,
  Bot,
  Cpu,
  X,
  Check,
  Bell,
  Zap,
  DollarSign,
} from 'lucide-react';

type Provider = 'google' | 'workers-ai' | 'openrouter';
type Category = 'chat' | 'embedding' | 'all';

interface AgentConfig {
  _id: Id<'agentConfigs'> | null;
  key: string;
  provider: Provider;
  model: string;
  description?: string;
  isActive: boolean;
}

interface AvailableModel {
  _id: Id<'availableModels'>;
  provider: Provider;
  modelId: string;
  displayName: string;
  description: string;
  gatewayEndpoint: string;
  category: Category;
  inputCostPerMillionTokens?: number;
  outputCostPerMillionTokens?: number;
  isRecommended: boolean;
  isActive: boolean;
  order: number;
}

const PROVIDER_LABELS: Record<Provider, string> = {
  google: 'Google',
  openrouter: 'OpenRouter',
  'workers-ai': 'Workers AI',
};

const AGENT_LABELS: Record<string, { title: string; description: string }> = {
  research: { title: 'Research Agent', description: 'Web-connected research for article topics' },
  outline: { title: 'Outline Agent', description: 'Creates article structure and sections' },
  draft: { title: 'Draft Agent', description: 'Writes the full article content' },
  embedding: { title: 'Embedding Model', description: 'Vector embeddings for semantic search' },
};

// ===== AGENT CONFIG CARD =====

function AgentConfigCard({
  config,
  models,
  onSave,
}: {
  config: AgentConfig;
  models: AvailableModel[];
  onSave: (key: string, provider: Provider, model: string) => Promise<void>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<Provider>(config.provider);
  const [selectedModel, setSelectedModel] = useState(config.model);
  const [isSaving, setIsSaving] = useState(false);

  const label = AGENT_LABELS[config.key] || { title: config.key, description: '' };

  // Filter models by category (embedding agents can only use embedding models)
  const isEmbedding = config.key === 'embedding';
  const filteredModels = models.filter(m =>
    isEmbedding ? m.category === 'embedding' : m.category === 'chat'
  );

  // Group models by provider
  const modelsByProvider = filteredModels.reduce((acc, m) => {
    if (!acc[m.provider]) acc[m.provider] = [];
    acc[m.provider].push(m);
    return acc;
  }, {} as Record<Provider, AvailableModel[]>);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(config.key, selectedProvider, selectedModel);
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setSelectedProvider(config.provider);
    setSelectedModel(config.model);
    setIsEditing(false);
  };

  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-teal-600/20 rounded-lg flex items-center justify-center">
            {isEmbedding ? (
              <Cpu className="w-5 h-5 text-teal-400" />
            ) : (
              <Bot className="w-5 h-5 text-teal-400" />
            )}
          </div>
          <div>
            <h3 className="font-medium text-white">{label.title}</h3>
            <p className="text-sm text-slate-400">{label.description}</p>
          </div>
        </div>

        {!isEditing && (
          <button
            onClick={() => setIsEditing(true)}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
          >
            <Edit3 className="w-4 h-4" />
          </button>
        )}
      </div>

      {isEditing ? (
        <div className="mt-4 space-y-3">
          <div>
            <label className="block text-sm text-slate-400 mb-1">Provider</label>
            <select
              value={selectedProvider}
              onChange={(e) => {
                const newProvider = e.target.value as Provider;
                setSelectedProvider(newProvider);
                // Reset model when provider changes
                const firstModel = modelsByProvider[newProvider]?.[0];
                setSelectedModel(firstModel?.modelId || '');
              }}
              className="admin-select w-full bg-slate-900"
            >
              {Object.entries(modelsByProvider).map(([provider]) => (
                <option key={provider} value={provider}>
                  {PROVIDER_LABELS[provider as Provider]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">Model</label>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="admin-select w-full bg-slate-900"
            >
              {(modelsByProvider[selectedProvider] || []).map((m) => (
                <option key={m.modelId} value={m.modelId}>
                  {m.displayName} {m.isRecommended && '(Recommended)'}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-3 py-1.5 bg-teal-600 hover:bg-teal-500 text-white rounded-lg text-sm flex items-center gap-2 disabled:opacity-50"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Save
            </button>
            <button
              onClick={handleCancel}
              className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-2">
          <span className="px-2 py-1 bg-slate-700 rounded text-xs text-slate-300">
            {PROVIDER_LABELS[config.provider]}
          </span>
          <span className="text-sm text-slate-300 font-mono">{config.model}</span>
        </div>
      )}
    </div>
  );
}

// ===== ADD MODEL MODAL =====

function AddModelModal({
  isOpen,
  onClose,
  onAdd,
}: {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (data: {
    provider: Provider;
    modelId: string;
    displayName: string;
    description: string;
    gatewayEndpoint: string;
    category: Category;
    inputCostPerMillionTokens?: number;
    outputCostPerMillionTokens?: number;
    isRecommended: boolean;
  }) => Promise<void>;
}) {
  const [provider, setProvider] = useState<Provider>('google');
  const [modelId, setModelId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<Category>('chat');
  const [inputCost, setInputCost] = useState('');
  const [outputCost, setOutputCost] = useState('');
  const [isRecommended, setIsRecommended] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const gatewayEndpoints: Record<Provider, string> = {
    google: 'google-ai-studio',
    openrouter: 'openrouter',
    'workers-ai': 'workers-ai',
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modelId || !displayName) return;

    setIsSubmitting(true);
    try {
      await onAdd({
        provider,
        modelId,
        displayName,
        description,
        gatewayEndpoint: gatewayEndpoints[provider],
        category,
        inputCostPerMillionTokens: inputCost ? Number(inputCost) : undefined,
        outputCostPerMillionTokens: outputCost ? Number(outputCost) : undefined,
        isRecommended,
      });
      // Reset form
      setModelId('');
      setDisplayName('');
      setDescription('');
      setInputCost('');
      setOutputCost('');
      setIsRecommended(false);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <h2 className="text-lg font-semibold text-white">Add Model</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Provider</label>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value as Provider)}
                className="admin-select w-full"
              >
                {Object.entries(PROVIDER_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as Category)}
                className="admin-select w-full"
              >
                <option value="chat">Chat</option>
                <option value="embedding">Embedding</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">Model ID</label>
            <input
              type="text"
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              placeholder="e.g., gemini-2.0-flash or @cf/baai/bge-base-en-v1.5"
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">Display Name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g., Gemini 2.0 Flash"
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of the model"
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Input $/1M</label>
              <input
                type="number"
                min="0"
                step="0.0001"
                value={inputCost}
                onChange={(e) => setInputCost(e.target.value)}
                placeholder="0.30"
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Output $/1M</label>
              <input
                type="number"
                min="0"
                step="0.0001"
                value={outputCost}
                onChange={(e) => setOutputCost(e.target.value)}
                placeholder="2.50"
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isRecommended}
              onChange={(e) => setIsRecommended(e.target.checked)}
              className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-teal-600"
            />
            <span className="text-sm text-slate-300">Mark as recommended</span>
          </label>

          <div className="flex items-center gap-2 pt-2">
            <button
              type="submit"
              disabled={isSubmitting || !modelId || !displayName}
              className="flex-1 px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-lg flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Add Model
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ===== NOTIFICATION PREFERENCES =====

const NOTIFICATION_CATEGORIES = [
  {
    category: 'content_review',
    label: 'Content Reviews',
    description: 'Research, outline, or draft ready for review',
  },
  {
    category: 'quote',
    label: 'Quote Requests',
    description: 'Customer submits a new quote request',
  },
  {
    category: 'payment',
    label: 'Payment Alerts',
    description: 'Customer authorizes or completes payment',
  },
  {
    category: 'contact',
    label: 'Contact Submissions',
    description: 'Someone submits the contact form',
  },
  {
    category: 'email_received',
    label: 'Inbound Emails',
    description: 'Customer sends an email to your address',
  },
  {
    category: 'whatsapp',
    label: 'WhatsApp Messages',
    description: 'Inbound WhatsApp messages from customers',
  },
] as const;

type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number]['category'];

function ToggleSwitch({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={() => onChange(!enabled)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors duration-200',
        enabled ? 'bg-teal-600' : 'bg-slate-600',
      )}
    >
      <span
        className={cn(
          'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 mt-0.5',
          enabled ? 'translate-x-[22px]' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}

function AutoQuoteSection() {
  const settings = useQuery(api.siteSettings.getAutoQuoteSettings, {});
  const updateSettings = useMutation(api.siteSettings.updateAutoQuoteSettings);
  const [bufferInput, setBufferInput] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  const bufferPercent = settings?.autoQuoteBufferPercent ?? 10;
  const isEnabled = settings?.autoQuoteEnabled ?? false;

  const handleToggle = async (value: boolean) => {
    setIsSaving(true);
    try {
      await updateSettings({ autoQuoteEnabled: value });
    } finally {
      setIsSaving(false);
    }
  };

  const handleBufferSave = async () => {
    const val = parseFloat(bufferInput);
    if (isNaN(val) || val < 0 || val > 50) return;
    setIsSaving(true);
    try {
      await updateSettings({ autoQuoteBufferPercent: val });
      setBufferInput('');
    } finally {
      setIsSaving(false);
    }
  };

  if (settings === undefined) {
    return (
      <section className="mb-8">
        <h2 className="text-xl font-semibold text-white mb-4">Auto-Quoting</h2>
        <div className="flex items-center gap-2 py-4">
          <Loader2 className="w-5 h-5 text-teal-500 animate-spin" />
          <span className="text-slate-400">Loading settings...</span>
        </div>
      </section>
    );
  }

  return (
    <section className="mb-8">
      <div className="flex items-center gap-2 mb-2">
        <Zap className="w-5 h-5 text-teal-400" />
        <h2 className="text-xl font-semibold text-white">Auto-Quoting</h2>
      </div>
      <p className="text-slate-400 mb-4">
        When enabled, guests see instant pricing and can pre-authorize their card. The pre-auth amount is the estimated premium plus the buffer percentage below.
      </p>

      <div className="space-y-1 max-w-xl">
        {/* Enable/disable toggle */}
        <div className="flex items-center justify-between gap-4 py-3 px-4 bg-slate-800/50 border border-slate-700 rounded-lg">
          <div>
            <p className="text-sm font-medium text-white">Auto-Quoting Enabled</p>
            <p className="text-xs text-slate-400">Global kill switch — disable to revert all quotes to manual review</p>
          </div>
          <ToggleSwitch enabled={isEnabled} onChange={handleToggle} />
        </div>

        {/* Buffer percentage */}
        <div className="flex items-center justify-between gap-4 py-3 px-4 bg-slate-800/50 border border-slate-700 rounded-lg">
          <div>
            <p className="text-sm font-medium text-white">Pre-Auth Buffer</p>
            <p className="text-xs text-slate-400">
              Currently <span className="text-teal-400 font-mono font-semibold">{bufferPercent}%</span> above estimated premium (medium confidence uses {Math.round(bufferPercent * 1.5)}%)
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={50}
              step={1}
              placeholder={String(bufferPercent)}
              value={bufferInput}
              onChange={(e) => setBufferInput(e.target.value)}
              className="w-20 px-2 py-1.5 bg-slate-700 border border-slate-600 rounded text-white text-sm text-right font-mono focus:border-teal-500 focus:outline-none"
            />
            <span className="text-slate-400 text-sm">%</span>
            <button
              onClick={handleBufferSave}
              disabled={!bufferInput || isSaving}
              className="px-3 py-1.5 bg-teal-600 hover:bg-teal-500 disabled:bg-slate-600 disabled:text-slate-400 text-white text-sm font-medium rounded transition-colors"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function PricingSettingsSection() {
  const settings = useQuery(api.siteSettings.getPricingSettings, {});
  const updateSettings = useMutation(api.siteSettings.updatePricingSettings);
  const [thresholdInput, setThresholdInput] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  const minPremium = settings?.minPlanPremium ?? 0;

  const handleSave = async () => {
    const val = parseFloat(thresholdInput);
    if (isNaN(val) || val < 0) return;
    setIsSaving(true);
    try {
      await updateSettings({ minPlanPremium: val });
      setThresholdInput('');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = async () => {
    setIsSaving(true);
    try {
      await updateSettings({ minPlanPremium: 0 });
      setThresholdInput('');
    } finally {
      setIsSaving(false);
    }
  };

  if (settings === undefined) {
    return (
      <section className="mb-8">
        <h2 className="text-xl font-semibold text-white mb-4">Pricing Display</h2>
        <div className="flex items-center gap-2 py-4">
          <Loader2 className="w-5 h-5 text-teal-500 animate-spin" />
          <span className="text-slate-400">Loading settings...</span>
        </div>
      </section>
    );
  }

  return (
    <section className="mb-8">
      <div className="flex items-center gap-2 mb-2">
        <DollarSign className="w-5 h-5 text-teal-400" />
        <h2 className="text-xl font-semibold text-white">Pricing Display</h2>
      </div>
      <p className="text-slate-400 mb-4">
        Control which plans are shown to customers based on pricing.
      </p>

      <div className="space-y-1 max-w-xl">
        <div className="flex items-center justify-between gap-4 py-3 px-4 bg-slate-800/50 border border-slate-700 rounded-lg">
          <div>
            <p className="text-sm font-medium text-white">Minimum Plan Premium</p>
            <p className="text-xs text-slate-400">
              {minPremium > 0
                ? <>Plans with estimated premium below <span className="text-teal-400 font-mono font-semibold">${minPremium}</span> per traveler are hidden from customers</>
                : 'No minimum — all priced plans are shown'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-400 text-sm">$</span>
            <input
              type="number"
              min={0}
              step={5}
              placeholder={minPremium > 0 ? String(minPremium) : '0'}
              value={thresholdInput}
              onChange={(e) => setThresholdInput(e.target.value)}
              className="w-20 px-2 py-1.5 bg-slate-700 border border-slate-600 rounded text-white text-sm text-right font-mono focus:border-teal-500 focus:outline-none"
            />
            <button
              onClick={handleSave}
              disabled={!thresholdInput || isSaving}
              className="px-3 py-1.5 bg-teal-600 hover:bg-teal-500 disabled:bg-slate-600 disabled:text-slate-400 text-white text-sm font-medium rounded transition-colors"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
            </button>
            {minPremium > 0 && (
              <button
                onClick={handleClear}
                disabled={isSaving}
                className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-300 text-sm font-medium rounded transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function NotificationPreferencesSection() {
  const profile = useQuery(api.admin.adminProfiles.getMyProfile, {});
  const updatePreferences = useMutation(api.admin.adminProfiles.updateNotificationPreferences);

  const prefs = profile?.notificationPreferences;

  const isEnabled = (category: NotificationCategory, channel: 'push' | 'email'): boolean => {
    if (!prefs) return true;
    const key = `${category}_${channel}`;
    return (prefs as Record<string, boolean | undefined>)[key] !== false;
  };

  const handleToggle = async (category: NotificationCategory, channel: 'push' | 'email', value: boolean) => {
    const current = prefs ?? {};
    const key = `${category}_${channel}`;
    await updatePreferences({
      notificationPreferences: { ...current, [key]: value },
    });
  };

  if (profile === undefined) {
    return (
      <section className="mb-8">
        <h2 className="text-xl font-semibold text-white mb-4">Notification Preferences</h2>
        <div className="flex items-center gap-2 py-4">
          <Loader2 className="w-5 h-5 text-teal-500 animate-spin" />
          <span className="text-slate-400">Loading preferences...</span>
        </div>
      </section>
    );
  }

  return (
    <section className="mb-8">
      <div className="flex items-center gap-2 mb-2">
        <Bell className="w-5 h-5 text-teal-400" />
        <h2 className="text-xl font-semibold text-white">Notification Preferences</h2>
      </div>
      <p className="text-slate-400 mb-4">
        Control how you're notified for each event type.
      </p>

      <div className="max-w-xl">
        {/* Column headers */}
        <div className="flex items-center justify-end gap-6 px-4 pb-2">
          <span className="text-xs font-medium text-slate-500 w-11 text-center" title="Browser notifications + notification bell">Push</span>
          <span className="text-xs font-medium text-slate-500 w-11 text-center">Email</span>
        </div>

        <div className="space-y-1">
          {NOTIFICATION_CATEGORIES.map((cat) => (
            <div
              key={cat.category}
              className="flex items-center justify-between gap-4 py-3 px-4 bg-slate-800/50 border border-slate-700 rounded-lg"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-white">{cat.label}</p>
                <p className="text-xs text-slate-400">{cat.description}</p>
              </div>
              <div className="flex items-center gap-6 shrink-0">
                <ToggleSwitch
                  enabled={isEnabled(cat.category, 'push')}
                  onChange={(v) => handleToggle(cat.category, 'push', v)}
                />
                <ToggleSwitch
                  enabled={isEnabled(cat.category, 'email')}
                  onChange={(v) => handleToggle(cat.category, 'email', v)}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ===== MAIN COMPONENT =====

function SettingsAdminInner() {
  const [showAddModel, setShowAddModel] = useState(false);

  // Queries
  const agentConfigs = useQuery(api.agents.config.list);
  const availableModels = useQuery(api.agents.config.listAvailableModels, {});

  // Mutations
  const updateConfig = useMutation(api.agents.config.update);
  const addModel = useMutation(api.agents.config.addModel);
  const deleteModel = useMutation(api.agents.config.deleteModel);

  const handleSaveConfig = async (key: string, provider: Provider, model: string) => {
    await updateConfig({ key, provider, model });
  };

  const handleAddModel = async (data: {
    provider: Provider;
    modelId: string;
    displayName: string;
    description: string;
    gatewayEndpoint: string;
    category: Category;
    inputCostPerMillionTokens?: number;
    outputCostPerMillionTokens?: number;
    isRecommended: boolean;
  }) => {
    await addModel(data);
  };

  const handleDeleteModel = async (id: Id<'availableModels'>) => {
    if (confirm('Are you sure you want to delete this model?')) {
      await deleteModel({ id });
    }
  };

  const isLoading = agentConfigs === undefined || availableModels === undefined;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-teal-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Auto-Quoting */}
      <AutoQuoteSection />

      {/* Pricing Display */}
      <PricingSettingsSection />

      {/* Notification Preferences */}
      <NotificationPreferencesSection />

      {/* Offline PDFs */}
      <OfflinePdfManager />

      {/* Agent Configs */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold text-white mb-4">Agent Configurations</h2>
        <p className="text-slate-400 mb-4">
          Configure which AI models power each stage of the content pipeline.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {(agentConfigs as AgentConfig[] | undefined)?.map((config: AgentConfig) => (
            <AgentConfigCard
              key={config.key}
              config={config as AgentConfig}
              models={(availableModels || []) as AvailableModel[]}
              onSave={handleSaveConfig}
            />
          ))}
        </div>
      </section>

      {/* Available Models */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold text-white">Available Models</h2>
            <p className="text-slate-400">Models available for agent configurations.</p>
          </div>
          <button
            onClick={() => setShowAddModel(true)}
            className="px-3 py-1.5 bg-teal-600 hover:bg-teal-500 text-white rounded-lg text-sm flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Model
          </button>
        </div>

        <div className="bg-slate-800/50 border border-slate-700 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left px-4 py-3 text-sm font-medium text-slate-400">Model</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-slate-400">Provider</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-slate-400">Type</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-slate-400">Cost</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-slate-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(availableModels as AvailableModel[] | undefined)?.map((model: AvailableModel) => (
                <tr key={model._id} className="border-b border-slate-700/50 last:border-0">
                  <td className="px-4 py-3">
                    <div>
                      <span className="text-white">{model.displayName}</span>
                      {model.isRecommended && (
                        <span className="ml-2 px-1.5 py-0.5 bg-teal-600/20 text-teal-400 text-xs rounded">
                          Recommended
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-slate-500 font-mono">{model.modelId}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-slate-300">{PROVIDER_LABELS[model.provider as Provider]}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn(
                      'px-2 py-0.5 rounded text-xs',
                      model.category === 'embedding'
                        ? 'bg-purple-600/20 text-purple-400'
                        : 'bg-blue-600/20 text-blue-400'
                    )}>
                      {model.category}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-300">
                    {model.inputCostPerMillionTokens != null || model.outputCostPerMillionTokens != null ? (
                      <span className="font-mono text-xs">
                        ${model.inputCostPerMillionTokens ?? 0}/${model.outputCostPerMillionTokens ?? 0}
                      </span>
                    ) : (
                      <span className="text-slate-500">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleDeleteModel(model._id)}
                      className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded transition-colors"
                      title="Delete model"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {availableModels?.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                    No models configured. Add a model to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Add Model Modal */}
      <AddModelModal
        isOpen={showAddModel}
        onClose={() => setShowAddModel(false)}
        onAdd={handleAddModel}
      />
    </div>
  );
}

export { SettingsAdminInner as SettingsAdminContent };

export default function SettingsAdmin() {
  return (
    <ConvexClientProvider>
      <SettingsAdminInner />
    </ConvexClientProvider>
  );
}
