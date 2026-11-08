-- Executar uma vez no SQL Editor do Supabase
alter table pedidos add column if not exists data_faturado date;
-- Pedidos já faturados ficam sem data (podem ser preenchidos no calendário)
