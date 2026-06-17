alter table contact_submissions add column form_name text not null default 'contact';
alter table contact_submissions add column organization text not null default '';
alter table contact_submissions add column referer text not null default '';
alter table contact_submissions add column consent integer not null default 0;
alter table contact_submissions add column notification_status text not null default 'pending';
alter table contact_submissions add column notification_sent_at text;
alter table contact_submissions add column notification_error text not null default '';
alter table contact_submissions add column notification_message_id text not null default '';
