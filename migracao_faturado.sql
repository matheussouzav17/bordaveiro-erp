-- Executar uma vez no SQL Editor do Supabase
alter table pedidos add column if not exists faturado boolean not null default false;
