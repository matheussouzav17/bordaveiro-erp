-- Executar uma vez no SQL Editor do Supabase
alter table pedidos add column if not exists em_producao boolean not null default false;
