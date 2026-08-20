create extension if not exists pg_trgm with schema extensions;

insert into public.permissions (code, description)
values
  ('volunteer_registry.read', 'Consultar el registro institucional de voluntarios'),
  ('volunteer_registry.create', 'Registrar voluntarios institucionales'),
  ('volunteer_registry.update', 'Actualizar voluntarios institucionales'),
  ('volunteer_registry.import', 'Importar voluntarios institucionales'),
  ('volunteer_registry.export', 'Exportar voluntarios institucionales')
on conflict (code) do update
set description = excluded.description,
    updated_at = statement_timestamp(),
    archived_at = null;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles as role
cross join public.permissions as permission
where role.code = 'administrator'
  and role.archived_at is null
  and permission.code in (
    'volunteer_registry.read',
    'volunteer_registry.create',
    'volunteer_registry.update',
    'volunteer_registry.import',
    'volunteer_registry.export'
  )
on conflict do nothing;

create table public.volunteers (
  id uuid primary key default extensions.gen_random_uuid(),
  full_name text not null,
  email text null,
  phone text null,
  phone_match_key text generated always as (
    regexp_replace(phone, '[^0-9]', '', 'g')
  ) stored,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint volunteers_full_name_valid check (
    char_length(full_name) between 1 and 100
    and full_name = regexp_replace(btrim(full_name), '[[:space:]]+', ' ', 'g')
  ),
  constraint volunteers_email_valid check (
    email is null
    or (
      email = lower(btrim(email))
      and char_length(email) between 3 and 254
      and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    )
  ),
  constraint volunteers_phone_valid check (
    phone is null
    or (
      phone = regexp_replace(btrim(phone), '[[:space:]]+', ' ', 'g')
      and char_length(phone) between 3 and 40
      and phone ~ '^[+0-9 ()./\-]+$'
      and phone ~ '[0-9]'
    )
  ),
  constraint volunteers_timestamps_valid check (updated_at >= created_at)
);

create index volunteers_created_at_id_idx
  on public.volunteers (created_at desc, id);

create index volunteers_name_id_idx
  on public.volunteers (lower(full_name), id);

create index volunteers_email_match_idx
  on public.volunteers (email)
  where email is not null;

create index volunteers_phone_match_idx
  on public.volunteers (phone_match_key)
  where phone_match_key is not null;

create index volunteers_name_search_idx
  on public.volunteers using gin (lower(full_name) extensions.gin_trgm_ops);

create index volunteers_email_search_idx
  on public.volunteers using gin (email extensions.gin_trgm_ops)
  where email is not null;

create index volunteers_phone_search_idx
  on public.volunteers using gin (phone extensions.gin_trgm_ops)
  where phone is not null;

create index volunteers_phone_key_search_idx
  on public.volunteers using gin (phone_match_key extensions.gin_trgm_ops)
  where phone_match_key is not null;

alter table public.volunteers enable row level security;

revoke all on table public.volunteers from public, anon, authenticated;

create trigger volunteers_20_set_updated_at
before update on public.volunteers
for each row execute function public.set_updated_at();

create or replace function public.audit_metadata_is_safe(candidate jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(candidate) = 'object'
    and not exists (
      select 1
      from jsonb_object_keys(candidate) as key_name
      where key_name not in (
        'reason_code',
        'provider_error_code',
        'requested_count',
        'inserted_count',
        'duplicate_count'
      )
    )
    and (
      not candidate ? 'reason_code'
      or candidate ->> 'reason_code' ~ '^[a-z][a-z0-9_.]{0,63}$'
    )
    and (
      not candidate ? 'provider_error_code'
      or candidate ->> 'provider_error_code' ~ '^[a-z][a-z0-9_]{0,63}$'
    )
    and (
      not candidate ? 'requested_count'
      or (
        jsonb_typeof(candidate -> 'requested_count') = 'number'
        and candidate ->> 'requested_count' ~ '^[0-9]+$'
        and (candidate ->> 'requested_count')::integer between 0 and 1000
      )
    )
    and (
      not candidate ? 'inserted_count'
      or (
        jsonb_typeof(candidate -> 'inserted_count') = 'number'
        and candidate ->> 'inserted_count' ~ '^[0-9]+$'
        and (candidate ->> 'inserted_count')::integer between 0 and 1000
      )
    )
    and (
      not candidate ? 'duplicate_count'
      or (
        jsonb_typeof(candidate -> 'duplicate_count') = 'number'
        and candidate ->> 'duplicate_count' ~ '^[0-9]+$'
        and (candidate ->> 'duplicate_count')::integer between 0 and 1000
      )
    );
$$;

revoke all on function public.audit_metadata_is_safe(jsonb) from public;
revoke all on function public.audit_metadata_is_safe(jsonb) from anon;
revoke all on function public.audit_metadata_is_safe(jsonb) from authenticated;

create function public.volunteer_duplicate_matches(
  canonical_email text,
  canonical_phone_key text,
  excluded_volunteer_id uuid default null
)
returns table (
  volunteer_id uuid,
  full_name text,
  matched_fields text[]
)
language sql
stable
set search_path = ''
as $$
  select
    volunteer.id,
    volunteer.full_name,
    array_remove(
      array[
        case when canonical_email is not null
          and volunteer.email = canonical_email then 'email' end,
        case when canonical_phone_key is not null
          and volunteer.phone_match_key = canonical_phone_key then 'phone' end
      ],
      null
    )
  from public.volunteers as volunteer
  where volunteer.id is distinct from excluded_volunteer_id
    and (
      (canonical_email is not null and volunteer.email = canonical_email)
      or (
        canonical_phone_key is not null
        and volunteer.phone_match_key = canonical_phone_key
      )
    )
  order by volunteer.created_at, volunteer.id;
$$;

revoke all on function public.volunteer_duplicate_matches(text, text, uuid)
  from public, anon, authenticated;

create function public.find_volunteer_duplicates(
  requested_email text,
  requested_phone text,
  requested_exclude_id uuid default null
)
returns table (
  volunteer_id uuid,
  full_name text,
  matched_fields text[]
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  canonical_email text := nullif(lower(btrim(coalesce(requested_email, ''))), '');
  canonical_phone text := nullif(
    regexp_replace(btrim(coalesce(requested_phone, '')), '[[:space:]]+', ' ', 'g'),
    ''
  );
  canonical_phone_key text;
begin
  if actor_id is null
    or not public.user_has_permission(actor_id, 'volunteer_registry.read')
  then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  canonical_phone_key := nullif(
    regexp_replace(coalesce(canonical_phone, ''), '[^0-9]', '', 'g'),
    ''
  );

  return query
  select duplicate.*
  from public.volunteer_duplicate_matches(
    canonical_email,
    canonical_phone_key,
    requested_exclude_id
  ) as duplicate;
end;
$$;

revoke all on function public.find_volunteer_duplicates(text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.find_volunteer_duplicates(text, text, uuid)
  to authenticated;

create function public.preview_volunteer_import_duplicates(requested_rows jsonb)
returns table (
  requested_row_number integer,
  volunteer_id uuid,
  full_name text,
  matched_fields text[]
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
begin
  if actor_id is null
    or not public.user_has_permission(actor_id, 'volunteer_registry.import')
  then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if requested_rows is null
    or jsonb_typeof(requested_rows) is distinct from 'array'
  then
    raise exception 'invalid_import_payload' using errcode = '22023';
  end if;
  if jsonb_array_length(requested_rows) not between 1 and 1000 then
    raise exception 'invalid_import_payload' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(requested_rows) as element(value)
    where jsonb_typeof(element.value) is distinct from 'object'
  ) then
    raise exception 'invalid_import_payload' using errcode = '22023';
  end if;
  if exists (
      select 1
      from jsonb_array_elements(requested_rows) as element(value)
      where exists (
          select 1
          from jsonb_object_keys(element.value) as key_name
          where key_name not in ('rowNumber', 'email', 'phone')
        )
        or not (element.value ? 'rowNumber')
        or not case
          when jsonb_typeof(element.value -> 'rowNumber') = 'number'
            and element.value ->> 'rowNumber' ~ '^[0-9]+$'
          then (element.value ->> 'rowNumber')::numeric between 2 and 1001
          else false
        end
        or (
          element.value ? 'email'
          and jsonb_typeof(element.value -> 'email') not in ('string', 'null')
        )
        or (
          element.value ? 'phone'
          and jsonb_typeof(element.value -> 'phone') not in ('string', 'null')
        )
  ) then
    raise exception 'invalid_import_payload' using errcode = '22023';
  end if;

  return query
  select
    (element.value ->> 'rowNumber')::integer,
    duplicate.volunteer_id,
    duplicate.full_name,
    duplicate.matched_fields
  from jsonb_array_elements(requested_rows) as element(value)
  cross join lateral public.volunteer_duplicate_matches(
    nullif(lower(btrim(coalesce(element.value ->> 'email', ''))), ''),
    nullif(
      regexp_replace(
        coalesce(element.value ->> 'phone', ''),
        '[^0-9]',
        '',
        'g'
      ),
      ''
    ),
    null
  ) as duplicate
  order by requested_row_number, duplicate.volunteer_id;
end;
$$;

revoke all on function public.preview_volunteer_import_duplicates(jsonb)
  from public, anon, authenticated;
grant execute on function public.preview_volunteer_import_duplicates(jsonb)
  to authenticated;

create function public.list_volunteers(
  requested_search text default '',
  requested_sort text default 'newest',
  requested_limit integer default 25,
  requested_offset integer default 0
)
returns table (
  volunteer_id uuid,
  full_name text,
  email text,
  phone text,
  created_at timestamptz,
  updated_at timestamptz,
  total_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  canonical_search text := lower(btrim(coalesce(requested_search, '')));
  canonical_phone_search text := regexp_replace(
    btrim(coalesce(requested_search, '')),
    '[^0-9]',
    '',
    'g'
  );
  escaped_search text;
begin
  if actor_id is null
    or not public.user_has_permission(actor_id, 'volunteer_registry.read')
  then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if requested_limit is null
    or requested_limit not between 1 and 100
    or requested_offset is null
    or requested_offset < 0
    or char_length(canonical_search) > 100
    or requested_sort is null
    or requested_sort not in ('name_asc', 'name_desc', 'newest', 'oldest')
  then
    raise exception 'invalid_volunteer_query' using errcode = '22023';
  end if;

  escaped_search := replace(
    replace(replace(canonical_search, '\', '\\'), '%', '\%'),
    '_',
    '\_'
  );

  return query
  select
    volunteer.id,
    volunteer.full_name,
    volunteer.email,
    volunteer.phone,
    volunteer.created_at,
    volunteer.updated_at,
    count(*) over ()
  from public.volunteers as volunteer
  where canonical_search = ''
    or lower(volunteer.full_name) like '%' || escaped_search || '%' escape '\'
    or volunteer.email like '%' || escaped_search || '%' escape '\'
    or volunteer.phone like '%' || escaped_search || '%' escape '\'
    or (
      canonical_phone_search <> ''
      and volunteer.phone_match_key like '%' || canonical_phone_search || '%'
    )
  order by
    case when requested_sort = 'name_asc' then lower(volunteer.full_name) end asc,
    case when requested_sort = 'name_desc' then lower(volunteer.full_name) end desc,
    case when requested_sort = 'newest' then volunteer.created_at end desc,
    case when requested_sort = 'oldest' then volunteer.created_at end asc,
    volunteer.id
  limit requested_limit
  offset requested_offset;
end;
$$;

revoke all on function public.list_volunteers(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.list_volunteers(text, text, integer, integer)
  to authenticated;

create function public.get_volunteer_detail(requested_volunteer_id uuid)
returns table (
  id uuid,
  full_name text,
  email text,
  phone text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
begin
  if actor_id is null
    or not public.user_has_permission(actor_id, 'volunteer_registry.read')
  then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  return query
  select
    volunteer.id,
    volunteer.full_name,
    volunteer.email,
    volunteer.phone,
    volunteer.created_at,
    volunteer.updated_at
  from public.volunteers as volunteer
  where volunteer.id = requested_volunteer_id;

  if not found then
    raise exception 'volunteer_not_found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.get_volunteer_detail(uuid)
  from public, anon, authenticated;
grant execute on function public.get_volunteer_detail(uuid) to authenticated;

create function public.audit_volunteer_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  fields_changed text[];
begin
  if tg_op = 'INSERT' then
    if current_setting('app.volunteer_write_origin', true) <> 'import' then
      insert into public.audit_logs (
        actor_user_id,
        action,
        entity_type,
        entity_id,
        changed_fields,
        metadata
      )
      values (
        (select auth.uid()),
        'volunteer.created',
        'volunteer',
        new.id,
        array['full_name', 'email', 'phone'],
        '{}'::jsonb
      );
    end if;
    return new;
  end if;

  fields_changed := array_remove(
    array[
      case when new.full_name is distinct from old.full_name then 'full_name' end,
      case when new.email is distinct from old.email then 'email' end,
      case when new.phone is distinct from old.phone then 'phone' end
    ],
    null
  );
  if cardinality(fields_changed) > 0 then
    insert into public.audit_logs (
      actor_user_id,
      action,
      entity_type,
      entity_id,
      changed_fields,
      metadata
    )
    values (
      (select auth.uid()),
      'volunteer.updated',
      'volunteer',
      new.id,
      fields_changed,
      '{}'::jsonb
    );
  end if;
  return new;
end;
$$;

revoke all on function public.audit_volunteer_change()
  from public, anon, authenticated;

create trigger volunteers_30_audit_change
after insert or update on public.volunteers
for each row execute function public.audit_volunteer_change();

create function public.create_volunteer(
  requested_full_name text,
  requested_email text,
  requested_phone text,
  accept_potential_duplicate boolean default false
)
returns table (
  id uuid,
  full_name text,
  email text,
  phone text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  canonical_full_name text := regexp_replace(
    btrim(coalesce(requested_full_name, '')),
    '[[:space:]]+',
    ' ',
    'g'
  );
  canonical_email text := nullif(lower(btrim(coalesce(requested_email, ''))), '');
  canonical_phone text := nullif(
    regexp_replace(btrim(coalesce(requested_phone, '')), '[[:space:]]+', ' ', 'g'),
    ''
  );
  canonical_phone_key text;
begin
  if actor_id is null
    or not public.user_has_permission(actor_id, 'volunteer_registry.create')
  then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  canonical_phone_key := nullif(
    regexp_replace(coalesce(canonical_phone, ''), '[^0-9]', '', 'g'),
    ''
  );
  perform pg_catalog.pg_advisory_xact_lock(202608160003);

  if not coalesce(accept_potential_duplicate, false) and exists (
    select 1
    from public.volunteer_duplicate_matches(
      canonical_email,
      canonical_phone_key,
      null
    )
  ) then
    raise exception 'duplicate_confirmation_required' using errcode = '23505';
  end if;

  perform pg_catalog.set_config('app.volunteer_write_origin', 'manual', true);
  return query
  with inserted as (
    insert into public.volunteers (full_name, email, phone)
    values (canonical_full_name, canonical_email, canonical_phone)
    returning
      volunteers.id,
      volunteers.full_name,
      volunteers.email,
      volunteers.phone,
      volunteers.created_at,
      volunteers.updated_at
  )
  select inserted.* from inserted;
end;
$$;

revoke all on function public.create_volunteer(text, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.create_volunteer(text, text, text, boolean)
  to authenticated;

create function public.update_volunteer(
  requested_volunteer_id uuid,
  requested_full_name text,
  requested_email text,
  requested_phone text,
  accept_potential_duplicate boolean default false
)
returns table (
  id uuid,
  full_name text,
  email text,
  phone text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  canonical_full_name text := regexp_replace(
    btrim(coalesce(requested_full_name, '')),
    '[[:space:]]+',
    ' ',
    'g'
  );
  canonical_email text := nullif(lower(btrim(coalesce(requested_email, ''))), '');
  canonical_phone text := nullif(
    regexp_replace(btrim(coalesce(requested_phone, '')), '[[:space:]]+', ' ', 'g'),
    ''
  );
  canonical_phone_key text;
begin
  if actor_id is null
    or not public.user_has_permission(actor_id, 'volunteer_registry.update')
  then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  canonical_phone_key := nullif(
    regexp_replace(coalesce(canonical_phone, ''), '[^0-9]', '', 'g'),
    ''
  );
  perform pg_catalog.pg_advisory_xact_lock(202608160003);

  if not exists (
    select 1
    from public.volunteers as existing_volunteer
    where existing_volunteer.id = requested_volunteer_id
  ) then
    raise exception 'volunteer_not_found' using errcode = 'P0002';
  end if;
  if not coalesce(accept_potential_duplicate, false) and exists (
    select 1
    from public.volunteer_duplicate_matches(
      canonical_email,
      canonical_phone_key,
      requested_volunteer_id
    )
  ) then
    raise exception 'duplicate_confirmation_required' using errcode = '23505';
  end if;

  perform pg_catalog.set_config('app.volunteer_write_origin', 'manual', true);
  return query
  with updated as (
    update public.volunteers as volunteer
    set full_name = canonical_full_name,
        email = canonical_email,
        phone = canonical_phone
    where volunteer.id = requested_volunteer_id
    returning
      volunteer.id,
      volunteer.full_name,
      volunteer.email,
      volunteer.phone,
      volunteer.created_at,
      volunteer.updated_at
  )
  select updated.* from updated;
end;
$$;

revoke all on function public.update_volunteer(uuid, text, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.update_volunteer(uuid, text, text, text, boolean)
  to authenticated;

create function public.import_volunteers(requested_rows jsonb)
returns table (batch_id uuid, inserted_count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  row_count integer;
  duplicate_count integer := 0;
  new_batch_id uuid := extensions.gen_random_uuid();
  requested_row jsonb;
  canonical_full_name text;
  canonical_email text;
  canonical_phone text;
  canonical_phone_key text;
  accept_duplicate boolean;
begin
  if actor_id is null
    or not public.user_has_permission(actor_id, 'volunteer_registry.import')
  then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if requested_rows is null
    or jsonb_typeof(requested_rows) is distinct from 'array'
  then
    raise exception 'invalid_import_payload' using errcode = '22023';
  end if;
  row_count := jsonb_array_length(requested_rows);
  if row_count not between 1 and 1000 then
    raise exception 'invalid_import_size' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(requested_rows) as element(value)
    where jsonb_typeof(element.value) is distinct from 'object'
  ) then
    raise exception 'invalid_import_payload' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(requested_rows) as element(value)
    where exists (
        select 1
        from jsonb_object_keys(element.value) as key_name
        where key_name not in (
          'fullName', 'email', 'phone', 'acceptPotentialDuplicate'
        )
      )
      or not (element.value ? 'fullName')
      or jsonb_typeof(element.value -> 'fullName') is distinct from 'string'
      or (
        element.value ? 'email'
        and jsonb_typeof(element.value -> 'email') not in ('string', 'null')
      )
      or (
        element.value ? 'phone'
        and jsonb_typeof(element.value -> 'phone') not in ('string', 'null')
      )
      or not (element.value ? 'acceptPotentialDuplicate')
      or jsonb_typeof(element.value -> 'acceptPotentialDuplicate')
        is distinct from 'boolean'
  ) then
    raise exception 'invalid_import_payload' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(202608160003);
  perform pg_catalog.set_config('app.volunteer_write_origin', 'import', true);

  for requested_row in
    select element.value
    from jsonb_array_elements(requested_rows) with ordinality as element(value, position)
    order by element.position
  loop
    canonical_full_name := regexp_replace(
      btrim(coalesce(requested_row ->> 'fullName', '')),
      '[[:space:]]+',
      ' ',
      'g'
    );
    canonical_email := nullif(
      lower(btrim(coalesce(requested_row ->> 'email', ''))),
      ''
    );
    canonical_phone := nullif(
      regexp_replace(
        btrim(coalesce(requested_row ->> 'phone', '')),
        '[[:space:]]+',
        ' ',
        'g'
      ),
      ''
    );
    canonical_phone_key := nullif(
      regexp_replace(coalesce(canonical_phone, ''), '[^0-9]', '', 'g'),
      ''
    );
    accept_duplicate := coalesce(
      (requested_row ->> 'acceptPotentialDuplicate')::boolean,
      false
    );

    if char_length(canonical_full_name) not between 1 and 100
      or (
        canonical_email is not null
        and (
          char_length(canonical_email) not between 3 and 254
          or canonical_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
        )
      )
      or (
        canonical_phone is not null
        and (
          char_length(canonical_phone) not between 3 and 40
          or canonical_phone !~ '^[+0-9 ()./\-]+$'
          or canonical_phone !~ '[0-9]'
        )
      )
    then
      raise exception 'invalid_import_row' using errcode = '22023';
    end if;

    if exists (
      select 1
      from public.volunteer_duplicate_matches(
        canonical_email,
        canonical_phone_key,
        null
      )
    ) then
      duplicate_count := duplicate_count + 1;
      if not coalesce(accept_duplicate, false) then
        raise exception 'duplicate_confirmation_required' using errcode = '23505';
      end if;
    end if;

    insert into public.volunteers (full_name, email, phone)
    values (canonical_full_name, canonical_email, canonical_phone);
  end loop;

  insert into public.audit_logs (
    actor_user_id,
    action,
    entity_type,
    entity_id,
    changed_fields,
    correlation_id,
    metadata
  )
  values (
    actor_id,
    'volunteer.imported',
    'volunteer_import',
    new_batch_id,
    array['volunteers'],
    new_batch_id,
    jsonb_build_object(
      'requested_count', row_count,
      'inserted_count', row_count,
      'duplicate_count', duplicate_count
    )
  );

  return query select new_batch_id, row_count;
end;
$$;

revoke all on function public.import_volunteers(jsonb)
  from public, anon, authenticated;
grant execute on function public.import_volunteers(jsonb) to authenticated;

create function public.export_volunteers(
  requested_search text default '',
  requested_sort text default 'newest',
  requested_limit integer default 1000,
  requested_offset integer default 0
)
returns table (
  volunteer_id uuid,
  full_name text,
  email text,
  phone text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  canonical_search text := lower(btrim(coalesce(requested_search, '')));
  canonical_phone_search text := regexp_replace(
    btrim(coalesce(requested_search, '')),
    '[^0-9]',
    '',
    'g'
  );
  escaped_search text;
begin
  if actor_id is null
    or not public.user_has_permission(actor_id, 'volunteer_registry.export')
  then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if requested_limit is null
    or requested_limit not between 1 and 1000
    or requested_offset is null
    or requested_offset < 0
    or char_length(canonical_search) > 100
    or requested_sort is null
    or requested_sort not in ('name_asc', 'name_desc', 'newest', 'oldest')
  then
    raise exception 'invalid_volunteer_query' using errcode = '22023';
  end if;
  escaped_search := replace(
    replace(replace(canonical_search, '\', '\\'), '%', '\%'),
    '_',
    '\_'
  );

  return query
  select
    volunteer.id,
    volunteer.full_name,
    volunteer.email,
    volunteer.phone,
    volunteer.created_at,
    volunteer.updated_at
  from public.volunteers as volunteer
  where canonical_search = ''
    or lower(volunteer.full_name) like '%' || escaped_search || '%' escape '\'
    or volunteer.email like '%' || escaped_search || '%' escape '\'
    or volunteer.phone like '%' || escaped_search || '%' escape '\'
    or (
      canonical_phone_search <> ''
      and volunteer.phone_match_key like '%' || canonical_phone_search || '%'
    )
  order by
    case when requested_sort = 'name_asc' then lower(volunteer.full_name) end asc,
    case when requested_sort = 'name_desc' then lower(volunteer.full_name) end desc,
    case when requested_sort = 'newest' then volunteer.created_at end desc,
    case when requested_sort = 'oldest' then volunteer.created_at end asc,
    volunteer.id
  limit requested_limit
  offset requested_offset;
end;
$$;

revoke all on function public.export_volunteers(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.export_volunteers(text, text, integer, integer)
  to authenticated;
