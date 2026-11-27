-- Secretary desk: two more kinds of Maccabi request – drug approval (to the drug approvals department) and a physician appeal against a decision.
-- Backward compatible: existing rows keep their kind; appeal_of is null for everything except an appeal that names the original request.
-- The kind check was created inline by 20261125120000 (normally named maccabi_commitments_kind_check). Drop every check constraint
-- on this table that tests the kind column, whatever its name, then add one named constraint with the four values.
do $$
declare c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.maccabi_commitments'::regclass
      and con.contype = 'c'
      and exists (
        select 1 from pg_attribute a
        where a.attrelid = con.conrelid and a.attname = 'kind' and a.attnum = any (con.conkey)
      )
  loop
    execute format('alter table public.maccabi_commitments drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.maccabi_commitments
  add constraint maccabi_commitments_kind_check check (kind in ('commitment','imaging','drug_approval','drug_appeal'));

alter table public.maccabi_commitments
  add column if not exists appeal_of uuid references public.maccabi_commitments(id) on delete set null;

create index if not exists maccabi_commitments_appeal_of_idx on public.maccabi_commitments (appeal_of) where appeal_of is not null;
