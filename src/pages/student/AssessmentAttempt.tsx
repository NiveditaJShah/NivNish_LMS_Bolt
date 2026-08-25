import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Clock, Upload, FileText, AlertCircle, CheckCircle2, X, ArrowLeft, Download, Image as ImageIcon } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { LoadingSpinner, Button, Card, Badge } from '@/components/ui';
import { formatTimer, formatDateTime, formatDuration, getScoreColor } from '@/lib/format';
import { uploadFile, getSignedUrl, ANSWER_FILES_BUCKET, formatFileSize, sanitizeFileName } from '@/lib/files';
import type { Assessment, Question, QuestionFile, Submission, Answer, AssessmentFile, QuestionType } from '@/types';

interface QuestionWithFiles extends Question {
  question_files?: QuestionFile[];
}

export default function AssessmentAttempt() {
  const { assessmentId } = useParams<{ assessmentId: string }>();
  const { profile } = useAuth();
  const navigate = useNavigate();

  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [questions, setQuestions] = useState<QuestionWithFiles[]>([]);
  const [assessmentFiles, setAssessmentFiles] = useState<AssessmentFile[]>([]);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [view, setView] = useState<'attempt' | 'results'>('attempt');
  const [uploadingQuestion, setUploadingQuestion] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const submittedRef = useRef(false);

  const loadAssessment = useCallback(async () => {
    if (!assessmentId || !profile) return;

    const { data: aData, error: aError } = await supabase
      .from('assessments')
      .select('*')
      .eq('id', assessmentId)
      .maybeSingle();

    if (aError || !aData) {
      setError('Assessment not found');
      setLoading(false);
      return;
    }
    setAssessment(aData as Assessment);

    const [qResult, afResult] = await Promise.all([
      supabase
        .from('questions')
        .select('*')
        .eq('assessment_id', assessmentId)
        .order('position', { ascending: true }),
      supabase
        .from('assessment_files')
        .select('*')
        .eq('assessment_id', assessmentId),
    ]);

    const qData = qResult.data || [];
    const questionIds = qData.map((q) => q.id);

    let questionFilesMap: Record<string, QuestionFile[]> = {};
    if (questionIds.length > 0) {
      const { data: qfData } = await supabase
        .from('question_files')
        .select('*')
        .in('question_id', questionIds);
      (qfData || []).forEach((qf) => {
        if (!questionFilesMap[qf.question_id]) questionFilesMap[qf.question_id] = [];
        questionFilesMap[qf.question_id].push(qf as QuestionFile);
      });
    }

    const questionsWithFiles = qData.map((q) => ({
      ...q,
      question_files: questionFilesMap[q.id] || [],
    })) as QuestionWithFiles[];

    setQuestions(questionsWithFiles);
    setAssessmentFiles(afResult.data || []);

    // Check for existing submission
    const { data: existingSub } = await supabase
      .from('submissions')
      .select('*')
      .eq('assessment_id', assessmentId)
      .eq('student_id', profile.id)
      .maybeSingle();

    if (existingSub && (existingSub as Submission).status !== 'in_progress') {
      // Already submitted — show results
      setSubmission(existingSub as Submission);
      await loadAnswers(existingSub.id);
      setView('results');
      setLoading(false);
      return;
    }

    let currentSubmission = existingSub as Submission | null;

    if (!currentSubmission) {
      // Create new submission
      const { data: newSub, error: subError } = await supabase
        .from('submissions')
        .insert({
          assessment_id: assessmentId,
          student_id: profile.id,
          status: 'in_progress',
          total_points: questionsWithFiles.reduce((sum, q) => sum + q.points, 0),
        })
        .select()
        .single();

      if (subError || !newSub) {
        setError('Failed to start assessment');
        setLoading(false);
        return;
      }
      currentSubmission = newSub as Submission;
    }

    setSubmission(currentSubmission);
    await loadAnswers(currentSubmission.id);

    if (aData.time_limit_minutes) {
      const startTime = new Date(currentSubmission.started_at).getTime();
      const endTime = startTime + aData.time_limit_minutes * 60 * 1000;
      const remaining = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
      setTimeLeft(remaining);
    }

    setLoading(false);
  }, [assessmentId, profile]);

  const loadAnswers = async (subId: string) => {
    const { data: aData } = await supabase
      .from('answers')
      .select('*')
      .eq('submission_id', subId);

    const answerMap: Record<string, Answer> = {};
    (aData || []).forEach((a) => {
      answerMap[a.question_id] = a as Answer;
    });
    setAnswers(answerMap);
  };

  const submitAssessment = useCallback(async () => {
    if (!submission || !assessment || submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);

    // Calculate score for auto-gradable questions
    let totalScore = 0;
    const totalPoints = questions.reduce((sum, q) => sum + q.points, 0);

    for (const q of questions) {
      const ans = answers[q.id];
      if (!ans) continue;

      let isCorrect = false;
      let pointsAwarded = 0;

      if (q.question_type === 'mcq' || q.question_type === 'true_false') {
        if (q.correct_answer && ans.answer_text === q.correct_answer) {
          isCorrect = true;
          pointsAwarded = q.points;
        }
      } else if (q.question_type === 'short_text') {
        if (q.correct_answer && ans.answer_text.trim().toLowerCase() === q.correct_answer.trim().toLowerCase()) {
          isCorrect = true;
          pointsAwarded = q.points;
        }
      }
      // file_upload and short_text without correct_answer: admin grades manually

      totalScore += pointsAwarded;

      await supabase
        .from('answers')
        .update({ is_correct: isCorrect, points_awarded: pointsAwarded })
        .eq('id', ans.id);
    }

    const timeTaken = submission.started_at
      ? Math.floor((Date.now() - new Date(submission.started_at).getTime()) / 1000)
      : null;

    const { data: updatedSub } = await supabase
      .from('submissions')
      .update({
        status: 'submitted',
        score: totalScore,
        total_points: totalPoints,
        submitted_at: new Date().toISOString(),
        time_taken_seconds: timeTaken,
      })
      .eq('id', submission.id)
      .select()
      .single();

    if (updatedSub) {
      setSubmission(updatedSub as Submission);
      await loadAnswers(submission.id);
    }
    setView('results');
    setSubmitting(false);
    if (timerRef.current) clearInterval(timerRef.current);
  }, [submission, assessment, answers, questions]);

  // Timer effect
  useEffect(() => {
    if (timeLeft === null || view !== 'attempt') return;

    if (timeLeft <= 0) {
      submitAssessment();
      return;
    }

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev === null) return null;
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          submitAssessment();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [timeLeft === null, view]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadAssessment();
  }, [loadAssessment]);

  const saveAnswer = async (questionId: string, answerText: string, filePath?: string | null) => {
    if (!submission || submittedRef.current) return;

    const existing = answers[questionId];
    if (existing) {
      const updates: Record<string, unknown> = { answer_text: answerText };
      if (filePath !== undefined) updates.answer_file_path = filePath;
      const { data } = await supabase
        .from('answers')
        .update(updates)
        .eq('id', existing.id)
        .select()
        .single();
      if (data) {
        setAnswers((prev) => ({ ...prev, [questionId]: data as Answer }));
      }
    } else {
      const { data } = await supabase
        .from('answers')
        .insert({
          submission_id: submission.id,
          question_id: questionId,
          answer_text: answerText,
          answer_file_path: filePath || null,
        })
        .select()
        .single();
      if (data) {
        setAnswers((prev) => ({ ...prev, [questionId]: data as Answer }));
      }
    }
  };

  const handleFileUpload = async (questionId: string, file: File) => {
    if (!submission || !profile) return;
    setUploadingQuestion(questionId);
    const safeName = sanitizeFileName(file.name);
    const filePath = `${profile.id}/${submission.id}/${Date.now()}_${safeName}`;

    const { path, error: uploadError } = await uploadFile(ANSWER_FILES_BUCKET, filePath, file);

    if (uploadError) {
      setError(uploadError);
      setUploadingQuestion(null);
      return;
    }

    await saveAnswer(questionId, answers[questionId]?.answer_text || '', path);
    setUploadingQuestion(null);
  };

  const downloadFile = async (bucket: string, path: string, fileName: string) => {
    const url = await getSignedUrl(bucket, path);
    if (url) {
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.target = '_blank';
      a.click();
    }
  };

  if (loading) return <LoadingSpinner size={32} />;

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <Card className="p-8 text-center max-w-sm">
          <AlertCircle className="w-10 h-10 text-rose-500 mx-auto mb-3" />
          <p className="text-slate-700 font-medium mb-4">{error}</p>
          <Button onClick={() => navigate('/app')}>Back to Dashboard</Button>
        </Card>
      </div>
    );
  }

  // Results view
  if (view === 'results' && submission) {
    const pct = submission.total_points > 0 ? Math.round((submission.score / submission.total_points) * 100) : 0;
    const hasManualGrading = questions.some((q) => q.question_type === 'file_upload' || (q.question_type === 'short_text' && !q.correct_answer));

    return (
      <div className="max-w-3xl mx-auto">
        <button onClick={() => navigate('/app')} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 mb-6">
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </button>

        <Card className="p-8 mb-6">
          <div className="text-center mb-6">
            <div className={`w-16 h-16 rounded-full mx-auto mb-3 flex items-center justify-center ${pct >= 80 ? 'bg-emerald-100' : pct >= 60 ? 'bg-amber-100' : 'bg-rose-100'}`}>
              <CheckCircle2 className={`w-8 h-8 ${pct >= 80 ? 'text-emerald-600' : pct >= 60 ? 'text-amber-600' : 'text-rose-600'}`} />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">{assessment?.title}</h1>
            <p className="text-slate-500 mt-1">Submission Complete</p>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="text-center p-4 rounded-lg bg-slate-50">
              <p className="text-xs text-slate-400 mb-1">Score</p>
              <p className={`text-2xl font-bold ${getScoreColor(pct)}`}>{pct}%</p>
            </div>
            <div className="text-center p-4 rounded-lg bg-slate-50">
              <p className="text-xs text-slate-400 mb-1">Points</p>
              <p className="text-2xl font-bold text-slate-900">{submission.score}<span className="text-base text-slate-400">/{submission.total_points}</span></p>
            </div>
            <div className="text-center p-4 rounded-lg bg-slate-50">
              <p className="text-xs text-slate-400 mb-1">Time</p>
              <p className="text-2xl font-bold text-slate-900">{formatDuration(submission.time_taken_seconds)}</p>
            </div>
          </div>

          {hasManualGrading && submission.status !== 'graded' && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-sm">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>Some questions require manual grading by your instructor. Your score may change after review.</span>
            </div>
          )}

          {submission.admin_remarks && (
            <div className="mt-4 p-4 rounded-lg bg-indigo-50 border border-indigo-100">
              <p className="text-xs font-medium text-indigo-600 mb-1">Instructor Remarks</p>
              <p className="text-sm text-slate-700">{submission.admin_remarks}</p>
            </div>
          )}

          <div className="mt-4 text-xs text-slate-400 text-center">
            Submitted on {formatDateTime(submission.submitted_at)}
          </div>
        </Card>

        <h2 className="text-lg font-semibold text-slate-900 mb-4">Question Review</h2>
        <div className="space-y-4">
          {questions.map((q, idx) => {
            const ans = answers[q.id];
            const isAutoGraded = q.question_type === 'mcq' || q.question_type === 'true_false' || (q.question_type === 'short_text' && q.correct_answer);
            return (
              <Card key={q.id} className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-xs font-semibold text-slate-600">{idx + 1}</span>
                    <Badge color="slate">{q.question_type.replace('_', ' ')}</Badge>
                  </div>
                  {isAutoGraded && ans ? (
                    ans.is_correct ? (
                      <Badge color="emerald">Correct</Badge>
                    ) : (
                      <Badge color="rose">Incorrect</Badge>
                    )
                  ) : (
                    <Badge color="amber">Pending Review</Badge>
                  )}
                </div>
                <p className="text-slate-900 font-medium mb-3">{q.question_text}</p>
                {q.question_files && q.question_files.length > 0 && (
                  <div className="mb-3 space-y-1">
                    {q.question_files.map((qf) => (
                      <button
                        key={qf.id}
                        onClick={() => downloadFile('question-files', qf.file_path, qf.file_name)}
                        className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-700"
                      >
                        <ImageIcon className="w-4 h-4" /> {qf.file_name}
                      </button>
                    ))}
                  </div>
                )}
                <div className="mt-3 p-3 rounded-lg bg-slate-50">
                  <p className="text-xs text-slate-400 mb-1">Your Answer</p>
                  <p className="text-sm text-slate-700">{ans?.answer_text || (ans?.answer_file_path ? 'File uploaded' : 'No answer provided')}</p>
                  {ans?.answer_file_path && (
                    <button
                      onClick={() => downloadFile(ANSWER_FILES_BUCKET, ans.answer_file_path!, ans.answer_file_path!.split('/').pop() || 'answer')}
                      className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-700 mt-2"
                    >
                      <Download className="w-4 h-4" /> Download your file
                    </button>
                  )}
                </div>
                {isAutoGraded && q.correct_answer && (
                  <div className="mt-2 p-3 rounded-lg bg-emerald-50">
                    <p className="text-xs text-emerald-600 mb-1">Correct Answer</p>
                    <p className="text-sm text-slate-700">{q.correct_answer}</p>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </div>
    );
  }

  // Attempt view
  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => navigate('/app')} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="w-4 h-4" /> Exit
        </button>
        {timeLeft !== null && (
          <div className={`flex items-center gap-2 px-4 py-2 rounded-lg font-mono font-semibold text-sm ${
            timeLeft < 60 ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-700'
          }`}>
            <Clock className="w-4 h-4" />
            {formatTimer(timeLeft)}
          </div>
        )}
      </div>

      <Card className="p-6 mb-6">
        <h1 className="text-2xl font-bold text-slate-900 mb-1">{assessment?.title}</h1>
        {assessment?.description && <p className="text-slate-500 text-sm mb-3">{assessment.description}</p>}
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
          <span>{questions.length} questions</span>
          {assessment?.time_limit_minutes && <span>• {assessment.time_limit_minutes} min limit</span>}
          {assessment?.due_date && <span>• Due {formatDateTime(assessment.due_date)}</span>}
        </div>
        {assessmentFiles.length > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <p className="text-xs font-medium text-slate-500 mb-2">Reference Materials</p>
            <div className="space-y-1">
              {assessmentFiles.map((af) => (
                <button
                  key={af.id}
                  onClick={() => downloadFile('assessment-files', af.file_path, af.file_name)}
                  className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-700"
                >
                  <FileText className="w-4 h-4" /> {af.file_name} ({formatFileSize(af.file_size)})
                </button>
              ))}
            </div>
          </div>
        )}
      </Card>

      <div className="space-y-4">
        {questions.map((q, idx) => {
          const ans = answers[q.id];
          return (
            <Card key={q.id} className="p-5">
              <div className="flex items-start gap-3 mb-3">
                <span className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-semibold text-indigo-700 shrink-0">{idx + 1}</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge color="slate">{q.question_type.replace('_', ' ')}</Badge>
                    <span className="text-xs text-slate-400">{q.points} {q.points === 1 ? 'point' : 'points'}</span>
                  </div>
                  <p className="text-slate-900 font-medium">{q.question_text}</p>
                </div>
              </div>

              {q.question_files && q.question_files.length > 0 && (
                <div className="mb-3 ml-10 space-y-1">
                  {q.question_files.map((qf) => (
                    <button
                      key={qf.id}
                      onClick={() => downloadFile('question-files', qf.file_path, qf.file_name)}
                      className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-700"
                    >
                      <ImageIcon className="w-4 h-4" /> View: {qf.file_name}
                    </button>
                  ))}
                </div>
              )}

              <div className="ml-10">
                <QuestionInput
                  question={q}
                  answer={ans}
                  onAnswer={(text) => saveAnswer(q.id, text)}
                  onFileUpload={(file) => handleFileUpload(q.id, file)}
                  uploading={uploadingQuestion === q.id}
                />
              </div>
            </Card>
          );
        })}
      </div>

      <div className="mt-6 flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {Object.keys(answers).length} of {questions.length} answered
        </p>
        <Button onClick={submitAssessment} disabled={submitting} size="lg">
          {submitting ? 'Submitting...' : 'Submit Assessment'}
        </Button>
      </div>
    </div>
  );
}

function QuestionInput({
  question,
  answer,
  onAnswer,
  onFileUpload,
  uploading,
}: {
  question: Question;
  answer?: Answer;
  onAnswer: (text: string) => void;
  onFileUpload: (file: File) => void;
  uploading: boolean;
}) {
  if (question.question_type === 'mcq') {
    return (
      <div className="space-y-2">
        {question.options.map((opt, i) => (
          <label
            key={i}
            className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition ${
              answer?.answer_text === opt
                ? 'border-indigo-500 bg-indigo-50'
                : 'border-slate-200 hover:border-slate-300'
            }`}
          >
            <input
              type="radio"
              name={`q-${question.id}`}
              checked={answer?.answer_text === opt}
              onChange={() => onAnswer(opt)}
              className="w-4 h-4 text-indigo-600"
            />
            <span className="text-sm text-slate-700">{opt}</span>
          </label>
        ))}
      </div>
    );
  }

  if (question.question_type === 'true_false') {
    return (
      <div className="flex gap-3">
        {['True', 'False'].map((opt) => (
          <label
            key={opt}
            className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border cursor-pointer transition ${
              answer?.answer_text === opt
                ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                : 'border-slate-200 text-slate-600 hover:border-slate-300'
            }`}
          >
            <input
              type="radio"
              name={`q-${question.id}`}
              checked={answer?.answer_text === opt}
              onChange={() => onAnswer(opt)}
              className="w-4 h-4 text-indigo-600"
            />
            <span className="text-sm font-medium">{opt}</span>
          </label>
        ))}
      </div>
    );
  }

  if (question.question_type === 'short_text') {
    return (
      <input
        type="text"
        value={answer?.answer_text || ''}
        onChange={(e) => onAnswer(e.target.value)}
        placeholder="Type your answer..."
        className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition text-slate-900 placeholder-slate-400"
      />
    );
  }

  if (question.question_type === 'file_upload') {
    return (
      <div>
        <label className="block">
          <div className={`flex flex-col items-center justify-center gap-2 p-6 rounded-lg border-2 border-dashed cursor-pointer transition ${
            answer?.answer_file_path ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'
          }`}>
            {uploading ? (
              <>
                <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-slate-500">Uploading...</span>
              </>
            ) : answer?.answer_file_path ? (
              <>
                <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                <span className="text-sm text-slate-700 font-medium">{answer.answer_file_path.split('/').pop()}</span>
                <span className="text-xs text-slate-400">Click to replace</span>
              </>
            ) : (
              <>
                <Upload className="w-6 h-6 text-slate-400" />
                <span className="text-sm text-slate-500">Click to upload your answer file</span>
                <span className="text-xs text-slate-400">PDF, DOCX, images, etc.</span>
              </>
            )}
            <input
              type="file"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFileUpload(f);
              }}
            />
          </div>
        </label>
      </div>
    );
  }

  return null;
}
