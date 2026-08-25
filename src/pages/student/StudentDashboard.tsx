import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, Clock, Calendar, BookOpen, FileText, CheckCircle2, Play, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { PageHeader, Card, Badge, LoadingSpinner, EmptyState } from '@/components/ui';
import { formatDate } from '@/lib/format';
import type { Assessment, Submission, AssessmentType } from '@/types';

interface AssessmentWithMeta extends Assessment {
  question_count?: number;
  submission?: Submission;
}

const typeConfig: Record<AssessmentType, { icon: typeof BookOpen; color: 'indigo' | 'emerald' | 'amber'; label: string }> = {
  practice: { icon: BookOpen, color: 'emerald', label: 'Practice' },
  assignment: { icon: FileText, color: 'amber', label: 'Assignment' },
  quiz: { icon: ClipboardList, color: 'indigo', label: 'Quiz' },
};

export default function StudentDashboard() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [assessments, setAssessments] = useState<AssessmentWithMeta[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      if (!profile) return;

      const { data: assessmentsData, error: aError } = await supabase
        .from('assessments')
        .select('*')
        .eq('is_published', true)
        .order('created_at', { ascending: false });

      if (aError || !assessmentsData) {
        setLoading(false);
        return;
      }

      const assessmentIds = assessmentsData.map((a) => a.id);

      const [questionsResult, submissionsResult] = await Promise.all([
        supabase
          .from('questions')
          .select('assessment_id')
          .in('assessment_id', assessmentIds),
        supabase
          .from('submissions')
          .select('*')
          .eq('student_id', profile.id)
          .in('assessment_id', assessmentIds),
      ]);

      const questionCounts = new Map<string, number>();
      (questionsResult.data || []).forEach((q) => {
        questionCounts.set(q.assessment_id, (questionCounts.get(q.assessment_id) || 0) + 1);
      });

      const submissionMap = new Map<string, Submission>();
      (submissionsResult.data || []).forEach((s) => {
        submissionMap.set(s.assessment_id, s as Submission);
      });

      const combined = assessmentsData.map((a) => ({
        ...a,
        question_count: questionCounts.get(a.id) || 0,
        submission: submissionMap.get(a.id),
      })) as AssessmentWithMeta[];

      setAssessments(combined);
      setLoading(false);
    }

    loadData();
  }, [profile]);

  if (loading) return <LoadingSpinner />;

  const available = assessments.filter((a) => !a.submission || a.submission.status === 'in_progress');
  const completed = assessments.filter((a) => a.submission && a.submission.status !== 'in_progress');

  return (
    <div>
      <PageHeader title={`Welcome, ${profile?.full_name || 'Student'}`} subtitle="Your assigned assessments and quizzes" />

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Available</h2>
        {available.length === 0 ? (
          <Card className="p-6">
            <EmptyState icon={ClipboardList} title="No assessments available" subtitle="New assessments will appear here once your instructor publishes them." />
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {available.map((a) => {
              const config = typeConfig[a.type];
              const Icon = config.icon;
              const isInProgress = a.submission?.status === 'in_progress';
              return (
                <Card key={a.id} className="p-5 hover:shadow-lg hover:shadow-slate-200/50 transition-shadow">
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-10 h-10 rounded-lg bg-slate-50 flex items-center justify-center">
                      <Icon className="w-5 h-5 text-slate-600" />
                    </div>
                    <Badge color={config.color}>{config.label}</Badge>
                  </div>
                  <h3 className="font-semibold text-slate-900 mb-1 line-clamp-2">{a.title}</h3>
                  {a.description && <p className="text-sm text-slate-500 mb-3 line-clamp-2">{a.description}</p>}
                  <div className="flex items-center gap-4 text-xs text-slate-400 mb-4">
                    <span className="flex items-center gap-1">
                      <FileText className="w-3.5 h-3.5" />
                      {a.question_count} questions
                    </span>
                    {a.time_limit_minutes && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {a.time_limit_minutes} min
                      </span>
                    )}
                    {a.due_date && (
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        {formatDate(a.due_date)}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => navigate(`/app/assessment/${a.id}`)}
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition"
                  >
                    <Play className="w-4 h-4" />
                    {isInProgress ? 'Resume' : 'Start'}
                  </button>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Completed</h2>
        {completed.length === 0 ? (
          <Card className="p-6">
            <EmptyState icon={CheckCircle2} title="No completed assessments yet" subtitle="Your completed quizzes and assignments will appear here." />
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {completed.map((a) => {
              const config = typeConfig[a.type];
              const Icon = config.icon;
              const sub = a.submission!;
              const pct = sub.total_points > 0 ? Math.round((sub.score / sub.total_points) * 100) : 0;
              return (
                <Card key={a.id} className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-10 h-10 rounded-lg bg-slate-50 flex items-center justify-center">
                      <Icon className="w-5 h-5 text-slate-600" />
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge color={config.color}>{config.label}</Badge>
                      {sub.status === 'graded' && <Badge color="emerald">Graded</Badge>}
                    </div>
                  </div>
                  <h3 className="font-semibold text-slate-900 mb-1 line-clamp-2">{a.title}</h3>
                  <div className="flex items-center justify-between mt-4">
                    <div>
                      <p className="text-sm text-slate-400">Score</p>
                      <p className={`text-lg font-bold ${pct >= 80 ? 'text-emerald-600' : pct >= 60 ? 'text-amber-600' : 'text-rose-600'}`}>
                        {sub.score} / {sub.total_points}
                      </p>
                    </div>
                    <button
                      onClick={() => navigate(`/app/assessment/${a.id}`)}
                      className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 transition"
                    >
                      View Results
                    </button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
