-- Run once in this project's Supabase SQL Editor. Existing unrelated tables are untouched.
begin;
create table if not exists public.refraction_teachers (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.refraction_teachers enable row level security;
revoke all on public.refraction_teachers from anon, authenticated;
grant select on public.refraction_teachers to authenticated;
drop policy if exists refraction_teacher_self on public.refraction_teachers;
create policy refraction_teacher_self on public.refraction_teachers
  for select to authenticated using (user_id = (select auth.uid()));

create table if not exists public.refraction_reports (
  id uuid primary key,
  created_at timestamptz not null default now(),
  student_name text not null check (char_length(btrim(student_name)) between 2 and 120),
  student_class text not null check (char_length(btrim(student_class)) between 1 and 40),
  results jsonb not null check (jsonb_typeof(results) = 'array' and jsonb_array_length(results) = 2),
  conclusion text not null check (char_length(btrim(conclusion)) between 1 and 10000)
);
create index if not exists refraction_reports_class_created_idx
  on public.refraction_reports(student_class, created_at desc);
alter table public.refraction_reports enable row level security;
revoke all on public.refraction_reports from anon, authenticated;
grant select on public.refraction_reports to authenticated;
drop policy if exists refraction_teacher_read on public.refraction_reports;
create policy refraction_teacher_read on public.refraction_reports
  for select to authenticated using (
    exists (select 1 from public.refraction_teachers where user_id = (select auth.uid()))
  );

-- Public submission is write-only. Validate and recompute measurements on the server.
create or replace function public.submit_refraction_report(report jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  report_id uuid;
  row_data jsonb;
  cleaned_results jsonb := '[]'::jsonb;
  angle_value numeric;
  previous_angle numeric;
  radius_value numeric;
  ad_value numeric;
  cb_value numeric;
  n_value numeric;
  e_value numeric;
begin
  if report is null or jsonb_typeof(report) <> 'object'
    or octet_length(report::text) > 24000
    or jsonb_typeof(report->'student_name') is distinct from 'string'
    or jsonb_typeof(report->'student_class') is distinct from 'string'
    or jsonb_typeof(report->'conclusion') is distinct from 'string'
    or jsonb_typeof(report->'results') is distinct from 'array' then
    raise exception 'Invalid report' using errcode = '22023';
  end if;
  if jsonb_array_length(report->'results') <> 2 then
    raise exception 'Two experiments are required' using errcode = '22023';
  end if;
  report_id := (report->>'id')::uuid;
  if report_id is null then raise exception 'Report ID required'; end if;
  for row_data in select value from jsonb_array_elements(report->'results') loop
    if jsonb_typeof(row_data->'angle') is distinct from 'number'
      or jsonb_typeof(row_data->'radius') is distinct from 'number'
      or jsonb_typeof(row_data->'ad') is distinct from 'number'
      or jsonb_typeof(row_data->'cb') is distinct from 'number' then
      raise exception 'Invalid measurements' using errcode = '22023';
    end if;
    angle_value := (row_data->>'angle')::numeric;
    radius_value := (row_data->>'radius')::numeric;
    ad_value := (row_data->>'ad')::numeric;
    cb_value := (row_data->>'cb')::numeric;
    if angle_value not between 20 and 70 or angle_value <> trunc(angle_value)
      or radius_value not between 50 and 100 or radius_value <> trunc(radius_value)
      or angle_value = previous_angle
      or ad_value <> round((radius_value * sin(radians(angle_value::double precision)))::numeric)
      or cb_value <> round((radius_value * sin(radians(angle_value::double precision)) / 1.5)::numeric)
      or cb_value <= 0 then
      raise exception 'Measurements do not match the experiment' using errcode = '22023';
    end if;
    n_value := ad_value / cb_value;
    e_value := 1 / ad_value + 1 / cb_value;
    cleaned_results := cleaned_results || jsonb_build_array(jsonb_build_object(
      'angle', angle_value, 'radius', radius_value, 'ad', ad_value, 'cb', cb_value,
      'n', n_value, 'e', e_value, 'dn', n_value * e_value
    ));
    previous_angle := angle_value;
  end loop;
  insert into public.refraction_reports(id, student_name, student_class, results, conclusion)
    values (report_id, btrim(report->>'student_name'), btrim(report->>'student_class'), cleaned_results, btrim(report->>'conclusion'))
    on conflict (id) do nothing;
  return report_id;
end;
$$;
revoke all on function public.submit_refraction_report(jsonb) from public;
grant execute on function public.submit_refraction_report(jsonb) to anon, authenticated;
commit;

-- After creating your teacher user in Authentication > Users, authorize its UUID:
-- insert into public.refraction_teachers(user_id) values ('YOUR-AUTH-USER-UUID') on conflict do nothing;
