import { useEffect, useState, useCallback } from 'react';
import { Plus, Trash2, Edit3, Eye, EyeOff, Clock, Calendar, FileText, Upload, X, Save, AlertCircle, Image as ImageIcon, Download, BookOpen, CheckSquare } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { PageHeader, Card, Badge, LoadingSpinner, EmptyState, Button, Modal } from '@/components/ui';
import { formatDate, formatDateTime } from '@/lib/format';
import { uploadFile, getSignedUrl, ASSESSMENT_FILES_BUCKET, QUESTION_FILES_BUCKET, SOLUTION_FILES_BUCKET, formatFileSize, sanitizeFileName } from '@/lib/files';
import type { Assessment, Question, AssessmentType, QuestionType, AssessmentFile, QuestionFile, SolutionFile } from '@/types';

interface EditingQuestion extends Partial<Question> {
  question_files?: QuestionFile[];
}

export default function AssessmentBuilder() {
  const { profile } = useAuth();
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState<AssessmentType>('quiz');

  const loadAssessments = useCallback(async () => {
    const { data } = await supabase
      .from('assessments')
      .select('*')
      .order('created_at', { ascending: false });
    setAssessments((data || []) as Assessment[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadAssessments();
  }, [loadAssessments]);

  const createAssessment = async () => {
    if (!profile || !newTitle.trim()) return;
    const { data, error } = await supabase
      .from('assessments')
      .insert({
        title: newTitle.trim(),
        type: newType,
        created_by: profile.id,
        is_published: false,
      })
      .select()
      .single();

    if (error) return;
    setShowCreate(false);
    setNewTitle('');
    setEditing((data as Assessment).id);
    await loadAssessments();
  };

  const togglePublish = async (a: Assessment) => {
    await supabase
      .from('assessments')
      .update({ is_published: !a.is_published })
      .eq('id', a.id);
    setAssessments((prev) => prev.map((x) => x.id === a.id ? { ...x, is_published: !x.is_published } : x));
  };

  const deleteAssessment = async (a: Assessment) => {
    await supabase.from('assessments').delete().eq('id', a.id);
    setAssessments((prev) => prev.filter((x) => x.id !== a.id));
  };

  if (loading) return <LoadingSpinner />;

  if (editing) {
    return <AssessmentEditor assessmentId={editing} onBack={() => { setEditing(null); loadAssessments(); }} />;
  }

  const typeConfig: Record<AssessmentType, { color: 'emerald' | 'amber' | 'indigo'; label: string }> = {
    practice: { color: 'emerald', label: 'Practice' },
    assignment: { color: 'amber', label: 'Assignment' },
    quiz: { color: 'indigo', label: 'Quiz' },
  };

  return (
    <div>
      <PageHeader title="Assessment Builder" subtitle="Create and manage quizzes, assignments, and practice sets">
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4" /> New Assessment
        </Button>
      </PageHeader>

      {assessments.length === 0 ? (
        <Card className="p-6">
          <EmptyState icon={FileText} title="No assessments yet" subtitle="Create your first quiz, assignment, or practice set to get started." />
        </Card>
      ) : (
        <div className="space-y-3">
          {assessments.map((a) => {
            const config = typeConfig[a.type];
            return (
              <Card key={a.id} className="p-5 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4 min-w-0 flex-1">
                    <div className="w-10 h-10 rounded-lg bg-slate-50 flex items-center justify-center shrink-0">
                      <FileText className="w-5 h-5 text-slate-600" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-slate-900 truncate">{a.title}</h3>
                      <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-slate-400">
                        <Badge color={config.color}>{config.label}</Badge>
                        {a.is_published ? <Badge color="emerald">Published</Badge> : <Badge color="slate">Draft</Badge>}
                        {a.time_limit_minutes && <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {a.time_limit_minutes} min</span>}
                        {a.due_date && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {formatDate(a.due_date)}</span>}
                        <span>Created {formatDate(a.created_at)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => setEditing(a.id)}
                      className="p-2 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition"
                      title="Edit"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => togglePublish(a)}
                      className={`p-2 rounded-lg transition ${a.is_published ? 'text-emerald-600 hover:bg-emerald-50' : 'text-slate-400 hover:bg-slate-50'}`}
                      title={a.is_published ? 'Unpublish' : 'Publish'}
                    >
                      {a.is_published ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => deleteAssessment(a)}
                      className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Assessment">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Title</label>
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition"
              placeholder="e.g. Midterm Exam — Chapter 5"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Type</label>
            <div className="grid grid-cols-3 gap-3">
              {(['practice', 'assignment', 'quiz'] as AssessmentType[]).map((t) => {
                const cfg = typeConfig[t];
                return (
                  <button
                    key={t}
                    onClick={() => setNewType(t)}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition ${
                      newType === t ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    {t === 'practice' && <BookOpen className="w-5 h-5" />}
                    {t === 'assignment' && <FileText className="w-5 h-5" />}
                    {t === 'quiz' && <CheckSquare className="w-5 h-5" />}
                    <span className="text-sm font-medium">{cfg.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={createAssessment} disabled={!newTitle.trim()}>
              <Plus className="w-4 h-4" /> Create
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ============================================================
// ASSESSMENT EDITOR
// ============================================================
function AssessmentEditor({ assessmentId, onBack }: { assessmentId: string; onBack: () => void }) {
  const { profile } = useAuth();
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [assessmentFiles, setAssessmentFiles] = useState<AssessmentFile[]>([]);
  const [solutionFiles, setSolutionFiles] = useState<SolutionFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<EditingQuestion | null>(null);
  const [showQuestionModal, setShowQuestionModal] = useState(false);
  const [tab, setTab] = useState<'questions' | 'settings' | 'files'>('questions');

  const loadData = useCallback(async () => {
    const [aRes, qRes, afRes, sfRes] = await Promise.all([
      supabase.from('assessments').select('*').eq('id', assessmentId).maybeSingle(),
      supabase.from('questions').select('*').eq('assessment_id', assessmentId).order('position', { ascending: true }),
      supabase.from('assessment_files').select('*').eq('assessment_id', assessmentId),
      supabase.from('solution_files').select('*').eq('assessment_id', assessmentId),
    ]);

    setAssessment(aRes.data as Assessment);
    setQuestions((qRes.data || []) as Question[]);
    setAssessmentFiles((afRes.data || []) as AssessmentFile[]);
    setSolutionFiles((sfRes.data || []) as SolutionFile[]);
    setLoading(false);
  }, [assessmentId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const saveSettings = async (updates: Partial<Assessment>) => {
    setSaving(true);
    await supabase.from('assessments').update(updates).eq('id', assessmentId);
    setAssessment((prev) => prev ? { ...prev, ...updates } : null);
    setSaving(false);
  };

  const handleUploadAssessmentFile = async (file: File) => {
    if (!profile) return;
    setUploading(true);
    const safeName = sanitizeFileName(file.name);
    const filePath = `${assessmentId}/${Date.now()}_${safeName}`;
    const { path, error } = await uploadFile(ASSESSMENT_FILES_BUCKET, filePath, file);
    if (!error && path) {
      await supabase.from('assessment_files').insert({
        assessment_id: assessmentId,
        file_name: file.name,
        file_path: path,
        file_type: file.type,
        file_size: file.size,
        uploaded_by: profile.id,
      });
      await loadData();
    }
    setUploading(false);
  };

  const handleUploadSolutionFile = async (file: File) => {
    if (!profile) return;
    setUploading(true);
    const safeName = sanitizeFileName(file.name);
    const filePath = `${assessmentId}/${Date.now()}_${safeName}`;
    const { path, error } = await uploadFile(SOLUTION_FILES_BUCKET, filePath, file);
    if (!error && path) {
      await supabase.from('solution_files').insert({
        assessment_id: assessmentId,
        file_name: file.name,
        file_path: path,
        file_type: file.type,
        file_size: file.size,
        uploaded_by: profile.id,
      });
      await loadData();
    }
    setUploading(false);
  };

  const deleteAssessmentFile = async (f: AssessmentFile) => {
    await supabase.storage.from(ASSESSMENT_FILES_BUCKET).remove([f.file_path]);
    await supabase.from('assessment_files').delete().eq('id', f.id);
    setAssessmentFiles((prev) => prev.filter((x) => x.id !== f.id));
  };

  const deleteSolutionFile = async (f: SolutionFile) => {
    await supabase.storage.from(SOLUTION_FILES_BUCKET).remove([f.file_path]);
    await supabase.from('solution_files').delete().eq('id', f.id);
    setSolutionFiles((prev) => prev.filter((x) => x.id !== f.id));
  };

  const downloadFile = async (bucket: string, path: string, name: string) => {
    const url = await getSignedUrl(bucket, path);
    if (url) {
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.target = '_blank';
      a.click();
    }
  };

  const saveQuestion = async () => {
    if (!editingQuestion || !editingQuestion.question_text?.trim()) return;
    setSaving(true);

    const questionData = {
      assessment_id: assessmentId,
      question_text: editingQuestion.question_text,
      question_type: editingQuestion.question_type || 'mcq',
      options: editingQuestion.options || [],
      correct_answer: editingQuestion.correct_answer || null,
      points: editingQuestion.points || 1,
      position: editingQuestion.position ?? questions.length,
    };

    if (editingQuestion.id) {
      await supabase.from('questions').update(questionData).eq('id', editingQuestion.id);
    } else {
      const { data } = await supabase.from('questions').insert(questionData).select().single();
      if (data) editingQuestion.id = (data as Question).id;
    }

    await loadData();
    setEditingQuestion(null);
    setShowQuestionModal(false);
    setSaving(false);
  };

  const deleteQuestion = async (q: Question) => {
    await supabase.from('questions').delete().eq('id', q.id);
    setQuestions((prev) => prev.filter((x) => x.id !== q.id));
  };

  const startNewQuestion = () => {
    setEditingQuestion({
      question_text: '',
      question_type: 'mcq',
      options: ['', '', '', ''],
      correct_answer: '',
      points: 1,
      position: questions.length,
    });
    setShowQuestionModal(true);
  };

  const startEditQuestion = (q: Question) => {
    setEditingQuestion({ ...q, options: q.options || [] });
    setShowQuestionModal(true);
  };

  if (loading) return <LoadingSpinner size={32} />;

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 mb-4">
        <X className="w-4 h-4" /> Back to Assessments
      </button>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">{assessment?.title}</h1>
        <div className="flex items-center gap-2 mt-1">
          <Badge color="slate">{assessment?.type}</Badge>
          {assessment?.is_published ? <Badge color="emerald">Published</Badge> : <Badge color="amber">Draft</Badge>}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-slate-200">
        {([
          { key: 'questions', label: 'Questions' },
          { key: 'settings', label: 'Settings' },
          { key: 'files', label: 'Files & Solutions' },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition ${
              tab === t.key
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Questions Tab */}
      {tab === 'questions' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-slate-500">{questions.length} question{questions.length !== 1 ? 's' : ''}</p>
            <Button onClick={startNewQuestion}>
              <Plus className="w-4 h-4" /> Add Question
            </Button>
          </div>

          {questions.length === 0 ? (
            <Card className="p-6">
              <EmptyState icon={FileText} title="No questions yet" subtitle="Add your first question to this assessment." />
            </Card>
          ) : (
            <div className="space-y-3">
              {questions.map((q, idx) => (
                <Card key={q.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-xs font-semibold text-slate-600">{idx + 1}</span>
                        <Badge color="slate">{q.question_type.replace('_', ' ')}</Badge>
                        <span className="text-xs text-slate-400">{q.points} pt</span>
                      </div>
                      <p className="text-sm text-slate-900 font-medium ml-8">{q.question_text}</p>
                      {q.question_type === 'mcq' && q.options && (
                        <ul className="ml-8 mt-2 space-y-1">
                          {q.options.map((opt, i) => (
                            <li key={i} className={`text-xs flex items-center gap-1.5 ${opt === q.correct_answer ? 'text-emerald-600 font-medium' : 'text-slate-500'}`}>
                              {opt === q.correct_answer && <CheckSquare className="w-3 h-3" />}
                              {opt}
                            </li>
                          ))}
                        </ul>
                      )}
                      {q.question_type === 'true_false' && q.correct_answer && (
                        <p className="ml-8 mt-1 text-xs text-emerald-600 font-medium">Answer: {q.correct_answer}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => startEditQuestion(q)} className="p-2 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition">
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button onClick={() => deleteQuestion(q)} className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Settings Tab */}
      {tab === 'settings' && assessment && (
        <div className="max-w-2xl space-y-5">
          <Card className="p-5">
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Title</label>
            <input
              type="text"
              value={assessment.title}
              onChange={(e) => setAssessment({ ...assessment, title: e.target.value })}
              onBlur={(e) => saveSettings({ title: e.target.value })}
              className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition"
            />
          </Card>
          <Card className="p-5">
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Description</label>
            <textarea
              value={assessment.description || ''}
              onChange={(e) => setAssessment({ ...assessment, description: e.target.value })}
              onBlur={(e) => saveSettings({ description: e.target.value })}
              rows={3}
              className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition resize-none"
              placeholder="Instructions or description for students..."
            />
          </Card>
          <Card className="p-5">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Time Limit (minutes)</label>
                <input
                  type="number"
                  value={assessment.time_limit_minutes || ''}
                  onChange={(e) => setAssessment({ ...assessment, time_limit_minutes: e.target.value ? parseInt(e.target.value) : null })}
                  onBlur={(e) => saveSettings({ time_limit_minutes: e.target.value ? parseInt(e.target.value) : null })}
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition"
                  placeholder="No limit"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Due Date</label>
                <input
                  type="datetime-local"
                  value={assessment.due_date ? new Date(assessment.due_date).toISOString().slice(0, 16) : ''}
                  onChange={(e) => setAssessment({ ...assessment, due_date: e.target.value ? new Date(e.target.value).toISOString() : null })}
                  onBlur={(e) => saveSettings({ due_date: e.target.value ? new Date(e.target.value).toISOString() : null })}
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition"
                />
              </div>
            </div>
          </Card>
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-700">Published</p>
                <p className="text-xs text-slate-400 mt-0.5">Make this assessment visible to students</p>
              </div>
              <button
                onClick={() => saveSettings({ is_published: !assessment.is_published })}
                className={`relative w-11 h-6 rounded-full transition ${assessment.is_published ? 'bg-emerald-500' : 'bg-slate-300'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${assessment.is_published ? 'translate-x-5' : ''}`} />
              </button>
            </div>
          </Card>
          {saving && <p className="text-sm text-slate-400 text-center">Saving...</p>}
        </div>
      )}

      {/* Files Tab */}
      {tab === 'files' && (
        <div className="max-w-2xl space-y-6">
          {/* Reference Materials */}
          <Card className="p-5">
            <h3 className="font-semibold text-slate-900 mb-1">Reference Materials</h3>
            <p className="text-sm text-slate-400 mb-4">Upload study guides, reference documents, or instructions visible to students.</p>
            <label className="block">
              <div className="flex flex-col items-center justify-center gap-2 p-6 rounded-lg border-2 border-dashed border-slate-200 hover:border-indigo-300 hover:bg-slate-50 cursor-pointer transition">
                {uploading ? (
                  <><div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /><span className="text-sm text-slate-500">Uploading...</span></>
                ) : (
                  <><Upload className="w-6 h-6 text-slate-400" /><span className="text-sm text-slate-500">Click to upload reference files</span><span className="text-xs text-slate-400">PDF, DOCX, images, etc.</span></>
                )}
                <input type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadAssessmentFile(f); }} />
              </div>
            </label>
            {assessmentFiles.length > 0 && (
              <div className="mt-4 space-y-2">
                {assessmentFiles.map((f) => (
                  <div key={f.id} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-slate-50">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-700 truncate">{f.file_name}</p>
                        <p className="text-xs text-slate-400">{formatFileSize(f.file_size)} • {formatDate(f.created_at)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => downloadFile(ASSESSMENT_FILES_BUCKET, f.file_path, f.file_name)} className="p-2 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition">
                        <Download className="w-4 h-4" />
                      </button>
                      <button onClick={() => deleteAssessmentFile(f)} className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Solution Files */}
          <Card className="p-5">
            <h3 className="font-semibold text-slate-900 mb-1">Solution / Answer Key Files</h3>
            <p className="text-sm text-slate-400 mb-4">Upload answer keys or solution documents for grading reference. These are only visible to admins.</p>
            <label className="block">
              <div className="flex flex-col items-center justify-center gap-2 p-6 rounded-lg border-2 border-dashed border-slate-200 hover:border-emerald-300 hover:bg-slate-50 cursor-pointer transition">
                {uploading ? (
                  <><div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" /><span className="text-sm text-slate-500">Uploading...</span></>
                ) : (
                  <><Upload className="w-6 h-6 text-slate-400" /><span className="text-sm text-slate-500">Click to upload solution files</span><span className="text-xs text-slate-400">Admin-only access</span></>
                )}
                <input type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadSolutionFile(f); }} />
              </div>
            </label>
            {solutionFiles.length > 0 && (
              <div className="mt-4 space-y-2">
                {solutionFiles.map((f) => (
                  <div key={f.id} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-slate-50">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-700 truncate">{f.file_name}</p>
                        <p className="text-xs text-slate-400">{formatFileSize(f.file_size)} • {formatDate(f.created_at)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => downloadFile(SOLUTION_FILES_BUCKET, f.file_path, f.file_name)} className="p-2 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition">
                        <Download className="w-4 h-4" />
                      </button>
                      <button onClick={() => deleteSolutionFile(f)} className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Question Editor Modal */}
      {showQuestionModal && editingQuestion && (
        <QuestionEditorModal
          question={editingQuestion}
          onChange={setEditingQuestion}
          onSave={saveQuestion}
          onClose={() => { setShowQuestionModal(false); setEditingQuestion(null); }}
          saving={saving}
        />
      )}
    </div>
  );
}

// ============================================================
// QUESTION EDITOR MODAL
// ============================================================
function QuestionEditorModal({
  question,
  onChange,
  onSave,
  onClose,
  saving,
}: {
  question: EditingQuestion;
  onChange: (q: EditingQuestion) => void;
  onSave: () => void;
  onClose: () => void;
  saving: boolean;
}) {
  const [uploadingQFile, setUploadingQFile] = useState(false);
  const [questionFiles, setQuestionFiles] = useState<QuestionFile[]>(question.question_files || []);

  useEffect(() => {
    setQuestionFiles(question.question_files || []);
  }, [question.question_files]);

  const handleUploadQuestionFile = async (file: File) => {
    if (!question.id) return;
    setUploadingQFile(true);
    const safeName = sanitizeFileName(file.name);
    const filePath = `${question.id}/${Date.now()}_${safeName}`;
    const { path, error } = await uploadFile(QUESTION_FILES_BUCKET, filePath, file);
    if (!error && path) {
      const { data } = await supabase.from('question_files').insert({
        question_id: question.id,
        file_name: file.name,
        file_path: path,
        file_type: file.type,
        file_size: file.size,
      }).select().single();
      if (data) {
        setQuestionFiles((prev) => [...prev, data as QuestionFile]);
      }
    }
    setUploadingQFile(false);
  };

  const deleteQuestionFile = async (f: QuestionFile) => {
    await supabase.storage.from(QUESTION_FILES_BUCKET).remove([f.file_path]);
    await supabase.from('question_files').delete().eq('id', f.id);
    setQuestionFiles((prev) => prev.filter((x) => x.id !== f.id));
  };

  const questionTypes: { value: QuestionType; label: string }[] = [
    { value: 'mcq', label: 'Multiple Choice' },
    { value: 'true_false', label: 'True / False' },
    { value: 'short_text', label: 'Short Text' },
    { value: 'file_upload', label: 'File Upload' },
  ];

  return (
    <Modal open={true} onClose={onClose} title={question.id ? 'Edit Question' : 'New Question'} maxWidth="max-w-2xl">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Question Text</label>
          <textarea
            value={question.question_text || ''}
            onChange={(e) => onChange({ ...question, question_text: e.target.value })}
            rows={3}
            className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition resize-none"
            placeholder="Enter your question..."
            autoFocus
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Question Type</label>
            <select
              value={question.question_type || 'mcq'}
              onChange={(e) => {
                const newType = e.target.value as QuestionType;
                const updates: EditingQuestion = { ...question, question_type: newType };
                if (newType === 'true_false') {
                  updates.options = ['True', 'False'];
                  updates.correct_answer = updates.correct_answer || 'True';
                } else if (newType === 'mcq') {
                  updates.options = updates.options?.length === 4 ? updates.options : ['', '', '', ''];
                } else {
                  updates.options = [];
                  updates.correct_answer = '';
                }
                onChange(updates);
              }}
              className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition bg-white"
            >
              {questionTypes.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Points</label>
            <input
              type="number"
              min={1}
              value={question.points || 1}
              onChange={(e) => onChange({ ...question, points: parseInt(e.target.value) || 1 })}
              className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition"
            />
          </div>
        </div>

        {/* MCQ Options */}
        {question.question_type === 'mcq' && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Options (select the correct one)</label>
            <div className="space-y-2">
              {(question.options || []).map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <button
                    onClick={() => onChange({ ...question, correct_answer: opt })}
                    className={`w-5 h-5 rounded-full border-2 shrink-0 transition ${
                      question.correct_answer === opt ? 'border-emerald-500 bg-emerald-500' : 'border-slate-300'
                    }`}
                  />
                  <input
                    type="text"
                    value={opt}
                    onChange={(e) => {
                      const newOptions = [...(question.options || [])];
                      newOptions[i] = e.target.value;
                      if (question.correct_answer === opt) {
                        onChange({ ...question, options: newOptions, correct_answer: e.target.value });
                      } else {
                        onChange({ ...question, options: newOptions });
                      }
                    }}
                    className="flex-1 px-3 py-2 rounded-lg border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition text-sm"
                    placeholder={`Option ${i + 1}`}
                  />
                  {(question.options || []).length > 2 && (
                    <button
                      onClick={() => {
                        const newOptions = (question.options || []).filter((_, idx) => idx !== i);
                        onChange({ ...question, options: newOptions, correct_answer: question.correct_answer === opt ? '' : question.correct_answer });
                      }}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
              {(question.options || []).length < 6 && (
                <button
                  onClick={() => onChange({ ...question, options: [...(question.options || []), ''] })}
                  className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
                >
                  + Add option
                </button>
              )}
            </div>
          </div>
        )}

        {/* True/False */}
        {question.question_type === 'true_false' && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Correct Answer</label>
            <div className="flex gap-3">
              {['True', 'False'].map((opt) => (
                <button
                  key={opt}
                  onClick={() => onChange({ ...question, correct_answer: opt })}
                  className={`flex-1 py-2.5 rounded-lg border-2 font-medium transition ${
                    question.correct_answer === opt ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Short Text */}
        {question.question_type === 'short_text' && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Correct Answer (optional — leave blank for manual grading)</label>
            <input
              type="text"
              value={question.correct_answer || ''}
              onChange={(e) => onChange({ ...question, correct_answer: e.target.value })}
              className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition"
              placeholder="Exact match answer..."
            />
            <p className="text-xs text-slate-400 mt-1">If provided, answers will be auto-graded (case-insensitive). Leave blank for manual grading.</p>
          </div>
        )}

        {/* File Upload */}
        {question.question_type === 'file_upload' && (
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
            <p className="text-sm text-amber-700">Students will upload a file as their answer. These are always graded manually.</p>
          </div>
        )}

        {/* Question File Attachments */}
        {question.id && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Question Attachments (images, charts, diagrams)</label>
            <label className="block">
              <div className="flex flex-col items-center justify-center gap-2 p-4 rounded-lg border-2 border-dashed border-slate-200 hover:border-indigo-300 hover:bg-slate-50 cursor-pointer transition">
                {uploadingQFile ? (
                  <><div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /><span className="text-sm text-slate-500">Uploading...</span></>
                ) : (
                  <><ImageIcon className="w-5 h-5 text-slate-400" /><span className="text-sm text-slate-500">Attach an image or file to this question</span></>
                )}
                <input type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadQuestionFile(f); }} />
              </div>
            </label>
            {questionFiles.length > 0 && (
              <div className="mt-2 space-y-1">
                {questionFiles.map((f) => (
                  <div key={f.id} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-50">
                    <div className="flex items-center gap-2 min-w-0">
                      <ImageIcon className="w-4 h-4 text-slate-400 shrink-0" />
                      <span className="text-sm text-slate-700 truncate">{f.file_name}</span>
                    </div>
                    <button onClick={() => deleteQuestionFile(f)} className="p-1 rounded text-slate-400 hover:text-rose-600">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {!question.id && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-sm">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>Save the question first to attach files to it.</span>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={onSave} disabled={saving || !question.question_text?.trim()}>
            <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Question'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
