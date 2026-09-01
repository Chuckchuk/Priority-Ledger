-- Sharing feature: run this once in the Supabase project's SQL editor
-- (Database -> SQL Editor). Not run automatically by anything — this repo
-- has no tracked migrations, schema changes are applied by hand. See the
-- "Sharing" section of CLAUDE.md for the design this implements.
--
-- shared_items is metadata only (who shared what, never the content
-- itself) and has NO anon-readable policy at all — the only way to read
-- a shared item's actual content is through get_shared_item() below,
-- which is deliberately narrow: given an opaque share id, it returns
-- exactly one task/checklist's fields, nothing else from the owner's
-- ledger. This is what keeps a "live" share (always reflects the
-- current task, no separate snapshot to go stale) from also being an
-- open read door into someone's whole ledger_state row.

create table if not exists public.shared_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  item_id text not null,
  revoked boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.shared_items enable row level security;

-- Only the owner (authenticated, matching auth.uid()) can create, list,
-- or revoke their own share records. No policy at all exists for the
-- anon role on this table, so an unauthenticated request can't list or
-- guess its way through shared_items directly, even knowing a row's uuid
-- — anon access only ever goes through the function below.
drop policy if exists "owner manages own shares" on public.shared_items;
create policy "owner manages own shares"
  on public.shared_items
  for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- Given a share id, look up its owner + item_id, then read straight out
-- of that owner's current ledger_state.data (bypassing RLS internally,
-- since this runs as security definer) and return just the one matching
-- task, stripped down to the fields worth sharing. Returns null if the
-- share doesn't exist, is revoked, or the task itself was since deleted
-- — the standalone page / import dialog both treat null as "no longer
-- available" rather than an error.
create or replace function public.get_shared_item(p_share_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_share shared_items%rowtype;
  v_data jsonb;
  v_task jsonb;
  v_cat jsonb;
begin
  select * into v_share from shared_items where id = p_share_id and revoked = false;
  if not found then
    return null;
  end if;

  select data into v_data from ledger_state where user_id = v_share.owner_id;
  if v_data is null then
    return null;
  end if;

  select elem into v_task
  from jsonb_array_elements(coalesce(v_data->'tasks', '[]'::jsonb)) elem
  where elem->>'id' = v_share.item_id
  limit 1;

  if v_task is null then
    return null;
  end if;

  select elem into v_cat
  from jsonb_array_elements(coalesce(v_data->'categories', '[]'::jsonb)) elem
  where elem->>'id' = v_task->>'category'
  limit 1;

  return jsonb_build_object(
    'title', coalesce(v_task->'title', '""'::jsonb),
    'notes', coalesce(v_task->'notes', '""'::jsonb),
    'dueDate', coalesce(v_task->'dueDate', '""'::jsonb),
    'status', coalesce(v_task->'status', '"open"'::jsonb),
    'createdAt', coalesce(v_task->'createdAt', '""'::jsonb),
    'isChecklist', coalesce(v_cat->>'type', '') = 'checklist',
    'subtasks', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'text', coalesce(s->'text', '""'::jsonb),
        'done', coalesce(s->'done', 'false'::jsonb)
      )), '[]'::jsonb)
      from jsonb_array_elements(coalesce(v_task->'subtasks', '[]'::jsonb)) s
    )
  );
end;
$$;

-- Callable by anon (the standalone no-account page) and authenticated
-- (the logged-in import dialog) alike — the function body itself is the
-- only access check that matters.
grant execute on function public.get_shared_item(uuid) to anon, authenticated;
