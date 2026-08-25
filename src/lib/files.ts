import { supabase } from './supabase';

export const ASSESSMENT_FILES_BUCKET = 'assessment-files';
export const QUESTION_FILES_BUCKET = 'question-files';
export const SOLUTION_FILES_BUCKET = 'solution-files';
export const ANSWER_FILES_BUCKET = 'answer-files';

export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export async function uploadFile(
  bucket: string,
  path: string,
  file: File
): Promise<{ path: string; error: string | null }> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(path, file, { upsert: false });

  if (error) return { path: '', error: error.message };
  return { path: data.path, error: null };
}

export async function getPublicUrl(bucket: string, path: string): Promise<string> {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

export async function getSignedUrl(bucket: string, path: string, expiresIn = 3600): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn);

  if (error) return null;
  return data.signedUrl;
}

export async function downloadFile(bucket: string, path: string): Promise<Blob | null> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .download(path);

  if (error) return null;
  return data;
}

export function fileIcon(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return 'image';
  if (['pdf'].includes(ext)) return 'pdf';
  if (['doc', 'docx'].includes(ext)) return 'doc';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'sheet';
  return 'file';
}
