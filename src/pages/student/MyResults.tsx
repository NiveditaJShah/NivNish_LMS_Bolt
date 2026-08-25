import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, Eye, Clock, Calendar, ClipboardList, BookOpen, FileText } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { PageHeader, Card, Badge, LoadingSpinner, EmptyState } from '@/components/ui';
import { formatDateTime, formatDuration, formatScore, getScorePercentage, getScoreColor } from '@/lib/format';
import type { Assessment, Submission, AssessmentType } from '@/types';

const typeIcon: Record<AssessmentType, typeof BookOpen> = {
  practice: BookOpen,
  assignment: FileText,
  quiz: ClipboardList,
};

export default function MyResults() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [results, setResults] = useState<{ assessment: Assessment; submission: Submission }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!profile) return;

      const { data: subs } = await supabase
        .from('submissions')
        .select('*')
        .eq('student_id', profile.id)
        .neq('status', 'in_progress')
        .order('submitted_at', { ascending: false });

      if (!subs || subs.length === 0) {
        setLoading(false);
        return;
      }

      const assessmentIds = subs.map((s) => (s as Submission).assessment_id);
      const { data: assessments } = await supabase
        .from('assessments')
        .select('*')
        .in('id', assessmentIds);

      const aMap = new Map<string, Assessment>();
      (assessments || []).forEach((a) => aMap.set(a.id, a as Assessment));

      const combined = subs
        .map((s) => {
          const sub = s as Submission;
          const a = aMap.get(sub.assessment_id);
          return a ? { assessment: a, submission: sub } : null;
        })
        .filter((x): x is { assessment: Assessment; submission: Submission } => x !== null);

      setResults(combined);
      setLoading(false);
    }
    load();
  }, [profile]);

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <PageHeader title="My Results" subtitle="Your completed assessments and scores" />

      {results.length === 0 ? (
        <Card className="p-6">
          <EmptyState icon={BarChart3} title="No results yet" subtitle="Complete an assessment to see your scores and feedback here." />
        </Card>
      ) : (
        <div className="space-y-3">
          {results.map(({ assessment, submission }) => {
            const pct = getScorePercentage(submission.score, submission.total_points);
            const Icon = typeIcon[assessment.type];
            return (
              <Card key={submission.id} className="p-5 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4 min-w-0 flex-1">
                    <div className="w-10 h-10 rounded-lg bg-slate-50 flex items-center justify-center shrink-0">
                      <Icon className="w-5 h-5 text-slate-600" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-slate-900 truncate">{assessment.title}</h3>
                      <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-slate-400">
                        <Badge color="slate">{assessment.type}</Badge>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" /> {formatDateTime(submission.submitted_at)}
                        </span>
                        {submission.time_taken_seconds != null && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" /> {formatDuration(submission.time_taken_seconds)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-right">
                      <p className={`text-lg font-bold ${getScoreColor(pct)}`}>{pct}%</p>
                      <p className="text-xs text-slate-400">{formatScore(submission.score, submission.total_points)}</p>
                    </div>
                    {submission.status === 'graded' && <Badge color="emerald">Graded</Badge>}
                    <button
                      onClick={() => navigate(`/app/assessment/${assessment.id}`)}
                      className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {submission.admin_remarks && (
                  <div className="mt-3 ml-14 p-3 rounded-lg bg-indigo-50 border border-indigo-100">
                    <p className="text-xs font-medium text-indigo-600 mb-1">Instructor Remarks</p>
                    <p className="text-sm text-slate-700">{submission.admin_remarks}</p>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
