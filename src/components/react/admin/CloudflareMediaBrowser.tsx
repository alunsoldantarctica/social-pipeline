/**
 * CloudflareMediaBrowser
 *
 * Image picker backed by Cloudflare Images.
 * Supports direct-upload (drag-and-drop + file picker) and gallery browsing.
 *
 * Usage:
 *   <CloudflareMediaBrowser
 *     onSelect={(url) => setImageUrl(url)}
 *     onClose={() => setOpen(false)}
 *   />
 *
 * Required Convex actions: api.admin.media.getDirectUploadUrl, api.admin.media.list
 * Required env var in wrangler.toml [vars]: CLOUDFLARE_IMAGES_HASH
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { useQuery, useAction, useMutation } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { Search, X, Loader2, Upload, Check, ImageOff, AlertCircle } from 'lucide-react';
import { cn } from '../../../lib/utils';

// Set this to your Cloudflare Images account hash.
// From: Cloudflare Dashboard → Images → Overview → "Account Hash"
// Also set CLOUDFLARE_IMAGES_HASH in wrangler.toml [vars].
const IMAGES_HASH = (typeof window !== 'undefined' && (window as any).__IMAGES_HASH__)
  || import.meta.env?.PUBLIC_CLOUDFLARE_IMAGES_HASH
  || 'YOUR_IMAGES_HASH';

function cfImageUrl(imageId: string, variant = 'public') {
  return `https://imagedelivery.net/${IMAGES_HASH}/${imageId}/${variant}`;
}

interface MediaRecord {
  _id: string;
  cloudflareImageId: string;
  filename?: string;
  altText?: string;
  tags?: string[];
  createdAt: number;
}

interface CloudflareMediaBrowserProps {
  onSelect: (url: string) => void;
  onClose: () => void;
}

export function CloudflareMediaBrowser({ onSelect, onClose }: CloudflareMediaBrowserProps) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<MediaRecord | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  const mediaRecords = useQuery(api.admin.media.list) ?? [];
  const getDirectUploadUrl = useAction(api.admin.media.getDirectUploadUrl);
  const recordUpload = useMutation(api.admin.media.recordUpload);

  const filtered = search
    ? mediaRecords.filter((m: MediaRecord) =>
        m.filename?.toLowerCase().includes(search.toLowerCase()) ||
        m.altText?.toLowerCase().includes(search.toLowerCase()) ||
        m.tags?.some((t: string) => t.toLowerCase().includes(search.toLowerCase()))
      )
    : mediaRecords;

  // Close on backdrop click
  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === backdropRef.current) onClose();
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  async function uploadFile(file: File) {
    if (!file.type.startsWith('image/')) {
      setUploadError('Only image files are supported');
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const { uploadUrl, id } = await getDirectUploadUrl({});
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(uploadUrl, { method: 'POST', body: formData });
      if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
      await recordUpload({ cloudflareImageId: id, filename: file.name });
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    uploadFile(files[0]);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }

  function handleSelect() {
    if (!selected) return;
    onSelect(cfImageUrl(selected.cloudflareImageId));
  }

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="font-semibold text-gray-900">Media Library</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Upload zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={cn(
            "mx-5 mt-4 rounded-lg border-2 border-dashed p-4 text-center cursor-pointer transition-colors",
            dragOver ? "border-blue-400 bg-blue-50" : "border-gray-200 hover:border-gray-300",
          )}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          {uploading ? (
            <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              Uploading…
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
              <Upload className="w-4 h-4" />
              Drag & drop or click to upload
            </div>
          )}
        </div>

        {uploadError && (
          <div className="mx-5 mt-2 flex items-center gap-2 text-sm text-red-600">
            <AlertCircle className="w-4 h-4" />
            {uploadError}
          </div>
        )}

        {/* Search */}
        <div className="px-5 pt-3 pb-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by filename, alt text, or tag…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Gallery */}
        <div className="flex-1 overflow-y-auto px-5 pb-4">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-gray-400 gap-2">
              <ImageOff className="w-8 h-8" />
              <p className="text-sm">{search ? 'No matches found' : 'No images uploaded yet'}</p>
            </div>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
              {filtered.map((item: MediaRecord) => {
                const url = cfImageUrl(item.cloudflareImageId, 'thumbnail');
                const isSelected = selected?._id === item._id;
                return (
                  <button
                    key={item._id}
                    onClick={() => setSelected(isSelected ? null : item)}
                    className={cn(
                      "relative aspect-square rounded-lg overflow-hidden border-2 transition-all",
                      isSelected ? "border-blue-500 ring-2 ring-blue-300" : "border-transparent hover:border-gray-300",
                    )}
                  >
                    <img
                      src={url}
                      alt={item.altText ?? item.filename ?? ''}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    {isSelected && (
                      <div className="absolute inset-0 bg-blue-500/20 flex items-center justify-center">
                        <Check className="w-5 h-5 text-white drop-shadow" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t bg-gray-50">
          <span className="text-xs text-gray-500">
            {selected ? selected.filename ?? selected.cloudflareImageId : `${filtered.length} image${filtered.length !== 1 ? 's' : ''}`}
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900"
            >
              Cancel
            </button>
            <button
              onClick={handleSelect}
              disabled={!selected}
              className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Use image
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
