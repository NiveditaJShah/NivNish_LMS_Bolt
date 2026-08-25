import { useEffect, useState, useCallback } from 'react';
import { BarChart3, Eye, Download, Save, X, Clock, Calendar, FileText, Search, ArrowLeft, CheckCircle2, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { PageHeader, Card, Badge, LoadingSpinner, EmptyState, Button, Modal } from '@/components/ui';
import { formatDateTime, formatDuration, formatDate, getScorePercentage, getScoreColor } from '@/lib/format';
import { getSignedUrl, ANSWER_FILES_BUCKET, formatFileSize } from '@/lib/files';
import type { Assessment, Question, Submission, Answer, Profile } from '@/types';

interface SubmissionWithDetails extends Submission {
  student?: Profile;
  assessment?: Assessment;
}

export default function ResultsMonitoring() {
  const [submissions, setSubmissions] = useState<SubmissionWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterAssessment, setFilterAssessment] = useState<string>('all');
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [viewing, setViewing] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data: subs } = await supabase
      .from('submissions')
      .select('*')
      .neq('status', 'in_progress')
      .order('submitted_at', { ascending: false });

    if (!subs || subs.length === 0) {
      setLoading(false);
      return;
    }

    const studentIds = [...new Set(subs.map((s) => (s as Submission).student_id))];
    const assessmentIds = [...new Set(subs.map((s) => (s as Submission).assessment_id))];

    const [studentsRes, assessmentsRes] = await Promise.all([
      supabase.from('profiles').select('*').in('id', studentIds),
      supabase.from('assessments').select('*').in('id', assessmentIds),
    ]);

    const studentMap = new Map<string, Profile>();
    (studentsRes.data || []).forEach((s) => studentMap.set(s.id, s as Profile));
    const aMap = new Map<string, Assessment>();
    (assessmentsRes.data || []).forEach((a) => aMap.set(a.id, a as Assessment));
    setAssessments(Array.from(aMap.values()));

    const combined = subs.map((s) => {
      const sub = s as Submission;
      return { ...sub, student: studentMap.get(sub.student_id), assessment: aMap.get(sub.assessment_id) };
    });

    setSubmissions(combined);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = submissions.filter((s) => {
    const matchesSearch = !search ||
      s.student?.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      s.student?.email?.toLowerCase().includes(search.toLowerCase()) ||
      s.assessment?.title?.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filterAssessment === 'all' || s.assessment_id === filterAssessment;
    return matchesSearch && matchesFilter;
  });

  if (loading) return <LoadingSpinner />;

  if (viewing) {
    return <SubmissionDetail submissionId={viewing} onBack={() => { setViewing(null); load(); }} />;
  }

  return (
    <div>
      <PageHeader title="Results Monitoring" subtitle="Review submissions, override grades, and add remarks" />

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <Card className="p-3 flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by student or assessment..."
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition text-sm"
            />
          </div>
        </Card>
        <Card className="p-3">
          <select
            value={filterAssessment}
            onChange={(e) => setFilterAssessment(e.target.value)}
            className="px-4 py-2 rounded-lg border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition text-sm bg-white"
          >
            <option value="all">All Assessments</option>
            {assessments.map((a) => (
              <option key={a.id} value={a.id}>{a.title}</option>
            ))}
          </select>
        </Card>
      </div>

      {filtered.length === 0 ? (
        <Card className="p-6">
          <EmptyState icon={BarChart3} title="No submissions found" subtitle="Student submissions will appear here once they complete assessments." />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">Student</th>
                  <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3 hidden md:table-cell">Assessment</th>
                  <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">Score</th>
                  <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3 hidden lg:table-cell">Submitted</th>
                  <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3 hidden sm:table-cell">Time</th>
                  <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">Status</th>
                  <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((s) => {
                  const pct = getScorePercentage(s.score, s.total_points);
                  return (
                    <tr key={s.id} className="hover:bg-slate-50/50 transition cursor-pointer" onClick={() => setViewing(s.id)}>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                            <span className="text-xs font-semibold text-slate-600">
                              {s.student?.full_name?.[0]?.toUpperCase() || s.student?.email?.[0]?.toUpperCase() || '?'}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-900 truncate">{s.student?.full_name || 'Unknown'}</p>
                            <p className="text-xs text-slate-400 truncate md:hidden">{s.assessment?.title}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 hidden md:table-cell">
                        <span className="text-sm text-slate-600">{s.assessment?.title || 'Unknown'}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`text-sm font-semibold ${getScoreColor(pct)}`}>
                          {s.score}/{s.total_points} ({pct}%)
                        </span>
                      </td>
                      <td className="px-6 py-4 hidden lg:table-cell">
                        <span className="text-sm text-slate-500">{formatDateTime(s.submitted_at)}</span>
                      </td>
                      <td className="px-6 py-4 hidden sm:table-cell">
                        <span className="text-sm text-slate-500">{formatDuration(s.time_taken_seconds)}</span>
                      </td>
                      <td className="px-6 py-4">
                        {s.status === 'graded' ? <Badge color="emerald">Graded</Badge> : <Badge color="amber">Submitted</Badge>}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button className="p-2 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition inline-flex">
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

// ============================================================
// SUBMISSION DETAIL (Grade Override)
// ============================================================
function SubmissionDetail({ submissionId, onBack }: { submissionId: string; onBack: () => void }) {
  const [submission, setSubmission] = useState<SubmissionWithDetails | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [remarks, setRemarks] = useState('');
  const [scoreEdits, setScoreEdits] = useState<Record<string, number>>({});
  const [correctEdits, setCorrectEdits] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    const { data: sub } = await supabase
      .from('submissions')
      .select('*')
      .eq('id', submissionId)
      .maybeSingle();

    if (!sub) {
      setLoading(false);
      return;
    }

    const subData = sub as Submission;

    const [studentRes, assessmentRes, answersRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', subData.student_id).maybeSingle(),
      supabase.from('assessments').select('*').eq('id', subData.assessment_id).maybeSingle(),
      supabase.from('answers').select('*').eq('submission_id', submissionId),
    ]);

    const { data: qData } = await supabase
      .from('questions')
      .select('*')
      .eq('assessment_id', subData.assessment_id)
      .order('position', { ascending: true });

    const combined: SubmissionWithDetails = {
      ...subData,
      student: studentRes.data as Profile,
      assessment: assessmentRes.data as Assessment,
    };

    setSubmission(combined);
    setQuestions((qData || []) as Question[]);
    setAnswers((answersRes.data || []) as Answer[]);
    setRemarks(subData.admin_remarks || '');

    const sEdits: Record<string, number> = {};
    const cEdits: Record<string, boolean> = {};
    (answersRes.data || []).forEach((a) => {
      const ans = a as Answer;
      sEdits[ans.question_id] = ans.points_awarded;
      cEdits[ans.question_id] = ans.is_correct;
    });
    setScoreEdits(sEdits);
    setCorrectEdits(cEdits);

    setLoading(false);
  }, [submissionId]);

  useEffect(() => {
    load();
  }, [load]);

  const downloadFile = async (path: string, name: string) => {
    const url = await getSignedUrl(ANSWER_FILES_BUCKET, path);
    if (url) {
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.target = '_blank';
      a.click();
    }
  };

  const handleSave = async () => {
    if (!submission) return;
    setSaving(true);

    let totalScore = 0;
    for (const ans of answers) {
      const newScore = scoreEdits[ans.question_id] ?? ans.points_awarded;
      const newCorrect = correctEdits[ans.question_id] ?? ans.is_correct;
      totalScore += newScore;
      await supabase
        .from('answers')
        .update({ points_awarded: newScore, is_correct: newCorrect })
        .eq('id', ans.id);
    }

    await supabase
      .from('submissions')
      .update({
        score: totalScore,
        admin_remarks: remarks,
        status: 'graded',
      })
      .eq('id', submissionId);

    setSaving(false);
    onBack();
  };

  if (loading) return <LoadingSpinner size={32} />;

  if (!submission) {
    return (
      <div>
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 mb-4">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <Card className="p-8 text-center">
          <AlertCircle className="w-8 h-8 text-slate-400 mx-auto mb-2" />
          <p className="text-slate-500">Submission not found</p>
        </Card>
      </div>
    );
  }

  const totalPoints = questions.reduce((sum, q) => sum + q.points, 0);
  const currentScore = Object.values(scoreEdits).reduce((sum, s) => sum + s, 0);
  const pct = totalPoints > 0 ? Math.round((currentScore / totalPoints) * 100) : 0;

  return (
    <div className="max-w-3xl">
      <button onClick={onBack} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to Results
      </button>

      {/* Summary */}
      <Card className="p-6 mb-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">{submission.assessment?.title}</h1>
            <p className="text-sm text-slate-500 mt-1">{submission.student?.full_name} • {submission.student?.email}</p>
          </div>
          {submission.status === 'graded' ? <Badge color="emerald">Graded</Badge> : <Badge color="amber">Submitted</Badge>}
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center p-3 rounded-lg bg-slate-50">
            <p className="text-xs text-slate-400 mb-1">Current Score</p>
            <p className={`text-xl font-bold ${getScoreColor(pct)}`}>{currentScore}/{totalPoints}</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-slate-50">
            <p className="text-xs text-slate-400 mb-1">Submitted</p>
            <p className="text-sm font-medium text-slate-700">{formatDateTime(submission.submitted_at)}</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-slate-50">
            <p className="text-xs text-slate-400 mb-1">Time Taken</p>
            <p className="text-sm font-medium text-slate-700">{formatDuration(submission.time_taken_seconds)}</p>
          </div>
        </div>
      </Card>

      {/* Answers */}
      <h2 className="text-lg font-semibold text-slate-900 mb-4">Answers & Grading</h2>
      <div className="space-y-4 mb-6">
        {questions.map((q, idx) => {
          const ans = answers.find((a) => a.question_id === q.id);
          if (!ans) return (
            <Card key={q.id} className="p-5">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-xs font-semibold text-slate-600">{idx + 1}</span>
                <Badge color="slate">{q.question_type.replace('_', ' ')}</Badge>
              </div>
              <p className="text-slate-900 font-medium ml-9">{q.question_text}</p>
              <p className="text-sm text-rose-500 ml-9 mt-2">No answer provided</p>
            </Card>
          );

          const isAutoGraded = q.question_type === 'mcq' || q.question_type === 'true_false' || (q.question_type === 'short_text' && q.correct_answer);
          const awarded = scoreEdits[q.id] ?? ans.points_awarded;
          const isCorrect = correctEdits[q.id] ?? ans.is_correct;

          return (
            <Card key={q.id} className="p-5">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-xs font-semibold text-slate-600">{idx + 1}</span>
                <Badge color="slate">{q.question_type.replace('_', ' ')}</Badge>
                <span className="text-xs text-slate-400">{q.points} pt</span>
              </div>
              <p className="text-slate-900 font-medium ml-9 mb-3">{q.question_text}</p>

              <div className="ml-9 space-y-3">
                <div className="p-3 rounded-lg bg-slate-50">
                  <p className="text-xs text-slate-400 mb-1">Student Answer</p>
                  {ans.answer_text ? (
                    <p className="text-sm text-slate-700">{ans.answer_text}</p>
                  ) : ans.answer_file_path ? (
                    <button
                      onClick={() => downloadFile(ans.answer_file_path!, ans.answer_file_path!.split('/').pop() || 'answer')}
                      className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-700"
                    >
                      <Download className="w-4 h-4" /> {ans.answer_file_path.split('/').pop()}
                    </button>
                  ) : (
                    <p className="text-sm text-slate-400">No answer</p>
                  )}
                </div>

                {q.correct_answer && (
                  <div className="p-3 rounded-lg bg-emerald-50">
                    <p className="text-xs text-emerald-600 mb-1">Correct Answer</p>
                    <p className="text-sm text-slate-700">{q.correct_answer}</p>
                  </div>
                )}

                {/* Grade Override */}
                <div className="flex items-center gap-4 p-3 rounded-lg border border-slate-200">
                  <div>
                    <p className="text-xs text-slate-400 mb-1">Points Awarded</p>
                    <input
                      type="number"
                      min={0}
                      max={q.points}
                      step={0.5}
                      value={awarded}
                      onChange={(e) => setScoreEdits({ ...scoreEdits, [q.id]: parseFloat(e.target.value) || 0 })}
                      className="w-20 px-2 py-1.5 rounded border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition text-sm"
                    />
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 mb-1">Correct?</p>
                    <button
                      onClick={() => setCorrectEdits({ ...correctEdits, [q.id]: !isCorrect })}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                        isCorrect ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {isCorrect ? 'Correct' : 'Incorrect'}
                    </button>
                  </div>
                  {isAutoGraded && (
                    <span className="text-xs text-slate-400 ml-auto">Auto-graded (override available)</span>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Remarks */}
      <Card className="p-5 mb-6">
        <label className="block text-sm font-medium text-slate-700 mb-1.5">Instructor Remarks</label>
        <textarea
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          rows={3}
          className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition resize-none"
          placeholder="Add feedback for the student..."
        />
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Button variant="secondary" onClick={onBack}>Cancel</Button>
        <Button onClick={handleSave} disabled={saving}>
          <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Grades & Remarks'}
        </Button>
      </div>
    </div>
  );
}
