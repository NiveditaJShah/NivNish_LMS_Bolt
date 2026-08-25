export type UserRole = 'admin' | 'student';
export type UserStatus = 'active' | 'deactivated';
export type AssessmentType = 'practice' | 'assignment' | 'quiz';
export type QuestionType = 'mcq' | 'true_false' | 'short_text' | 'file_upload';
export type SubmissionStatus = 'in_progress' | 'submitted' | 'graded';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  status: UserStatus;
  created_at: string;
  updated_at: string;
}

export interface Assessment {
  id: string;
  title: string;
  description: string;
  type: AssessmentType;
  created_by: string;
  time_limit_minutes: number | null;
  due_date: string | null;
  is_published: boolean;
  shuffle_questions: boolean;
  created_at: string;
  updated_at: string;
}

export interface Question {
  id: string;
  assessment_id: string;
  question_text: string;
  question_type: QuestionType;
  options: string[];
  correct_answer: string | null;
  points: number;
  position: number;
  created_at: string;
}

export interface Submission {
  id: string;
  assessment_id: string;
  student_id: string;
  status: SubmissionStatus;
  score: number;
  total_points: number;
  started_at: string;
  submitted_at: string | null;
  time_taken_seconds: number | null;
  admin_remarks: string;
  created_at: string;
  updated_at: string;
}

export interface Answer {
  id: string;
  submission_id: string;
  question_id: string;
  answer_text: string;
  answer_file_path: string | null;
  is_correct: boolean;
  points_awarded: number;
  created_at: string;
  updated_at: string;
}

export interface AssessmentFile {
  id: string;
  assessment_id: string;
  file_name: string;
  file_path: string;
  file_type: string | null;
  file_size: number | null;
  uploaded_by: string;
  created_at: string;
}

export interface QuestionFile {
  id: string;
  question_id: string;
  file_name: string;
  file_path: string;
  file_type: string | null;
  file_size: number | null;
  created_at: string;
}

export interface SolutionFile {
  id: string;
  assessment_id: string;
  file_name: string;
  file_path: string;
  file_type: string | null;
  file_size: number | null;
  uploaded_by: string;
  created_at: string;
}

export interface QuestionWithFiles extends Question {
  question_files?: QuestionFile[];
}

export interface AssessmentWithDetails extends Assessment {
  questions?: Question[];
  assessment_files?: AssessmentFile[];
  solution_files?: SolutionFile[];
  submissions?: Submission[];
}
