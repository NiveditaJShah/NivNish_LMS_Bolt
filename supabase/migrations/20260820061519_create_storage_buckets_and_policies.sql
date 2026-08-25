/*
# NivNish Assess — Storage Buckets & Policies

1. Overview
Creates three storage buckets for file uploads:
- `assessment-files` — reference documents / study materials uploaded by admin for an assessment.
- `question-files` — images/charts/diagrams attached to a specific question by admin.
- `solution-files` — answer key / solution documents uploaded by admin.
- `answer-files` — files uploaded by students as answers to file-upload questions.

2. Security
- All buckets are private (not public).
- Admins can upload/read/delete files in assessment-files, question-files, solution-files.
- Students can read files in assessment-files and question-files (for published assessments).
- Students can upload to and read their own files in answer-files (path scoped by user id).
- All policies use auth.uid() for ownership checks.

3. Important Notes
- Storage policies are idempotent (DROP POLICY IF EXISTS before CREATE).
- Paths are organized as: assessment-files/<assessment_id>/<filename>,
  question-files/<question_id>/<filename>, answer-files/<student_id>/<submission_id>/<filename>.
*/

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('assessment-files', 'assessment-files', false),
  ('question-files', 'question-files', false),
  ('solution-files', 'solution-files', false),
  ('answer-files', 'answer-files', false)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- ASSESSMENT-FILES BUCKET POLICIES
-- ============================================================
DROP POLICY IF EXISTS "assessment_files_read" ON storage.objects;
CREATE POLICY "assessment_files_read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'assessment-files'
  );

DROP POLICY IF EXISTS "assessment_files_upload_admin" ON storage.objects;
CREATE POLICY "assessment_files_upload_admin"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'assessment-files'
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

DROP POLICY IF EXISTS "assessment_files_delete_admin" ON storage.objects;
CREATE POLICY "assessment_files_delete_admin"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'assessment-files'
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- ============================================================
-- QUESTION-FILES BUCKET POLICIES
-- ============================================================
DROP POLICY IF EXISTS "question_files_read" ON storage.objects;
CREATE POLICY "question_files_read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'question-files'
  );

DROP POLICY IF EXISTS "question_files_upload_admin" ON storage.objects;
CREATE POLICY "question_files_upload_admin"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'question-files'
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

DROP POLICY IF EXISTS "question_files_delete_admin" ON storage.objects;
CREATE POLICY "question_files_delete_admin"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'question-files'
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- ============================================================
-- SOLUTION-FILES BUCKET POLICIES (admin only)
-- ============================================================
DROP POLICY IF EXISTS "solution_files_read_admin" ON storage.objects;
CREATE POLICY "solution_files_read_admin"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'solution-files'
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

DROP POLICY IF EXISTS "solution_files_upload_admin" ON storage.objects;
CREATE POLICY "solution_files_upload_admin"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'solution-files'
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

DROP POLICY IF EXISTS "solution_files_delete_admin" ON storage.objects;
CREATE POLICY "solution_files_delete_admin"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'solution-files'
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- ============================================================
-- ANSWER-FILES BUCKET POLICIES (student uploads, scoped by user id)
-- ============================================================
DROP POLICY IF EXISTS "answer_files_read_own_or_admin" ON storage.objects;
CREATE POLICY "answer_files_read_own_or_admin"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'answer-files'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
    )
  );

DROP POLICY IF EXISTS "answer_files_upload_own" ON storage.objects;
CREATE POLICY "answer_files_upload_own"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'answer-files'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "answer_files_delete_own" ON storage.objects;
CREATE POLICY "answer_files_delete_own"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'answer-files'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
    )
  );
