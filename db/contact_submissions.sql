create table if not exists contact_submissions (
  id integer primary key autoincrement,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  first_name text not null,
  last_name text not null default '',
  email text not null,
  city text not null default '',
  interest text not null,
  message text not null default '',
  language text not null default 'tr'
);

create index if not exists idx_contact_submissions_created_at
  on contact_submissions (created_at desc);
