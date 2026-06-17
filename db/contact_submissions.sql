create table if not exists contact_submissions (
  id integer primary key autoincrement,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  form_name text not null default 'contact',
  first_name text not null,
  last_name text not null default '',
  email text not null,
  organization text not null default '',
  city text not null default '',
  interest text not null,
  message text not null default '',
  language text not null default 'tr',
  referer text not null default '',
  consent integer not null default 0,
  notification_status text not null default 'pending',
  notification_sent_at text,
  notification_error text not null default '',
  notification_message_id text not null default ''
);

create index if not exists idx_contact_submissions_created_at
  on contact_submissions (created_at desc);
