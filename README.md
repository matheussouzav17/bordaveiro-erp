# Bordaveiro ERP

Sistema de gestão de pedidos, stock e clientes da **Bordaveiro**, empresa de bordados.
Tem duas partes:

- **Painel da equipa** (`/`): pedidos, orçamentos, stock, estatísticas e gestão de utilizadores.
- **Portal do Cliente** (`/portal`): os clientes fazem pedidos, acompanham o estado e enviam sugestões.

Funciona no browser e pode ser instalado no telemóvel como app (PWA).

## Funcionalidades

### Painel da equipa
- **Pedidos** com vários produtos por pedido (cor, género, tamanhos, quantidade e preço).
- **IVA por produto**: acrescentar 23%, preço já com IVA (o sistema retira o IVA) ou sem IVA.
- **Orçamentos** que passam a pedido com um clique.
- **PDF do orçamento/pedido** com logótipo, imagens do bordado, totais, dados de pagamento e prazo de entrega em dias.
- **Ficheiros** de cada pedido: imagens PNG e matrizes de bordado DST.
- **Registo rápido DP** para pedidos de parceiros (sem IVA).
- **Aba Portal** com os pedidos feitos pelos clientes, para confirmar a data de entrega e o valor.
- **Avisos com som** quando um cliente faz ou cancela um pedido no portal.
- **Stock**: fardas, linhas de bordar e roupa de bebé.
- **Estatísticas** e exportação de relatórios para Excel.
- **Sugestões e reclamações** da equipa e dos clientes, com chat interno.
- **Utilizadores** com três perfis: administrador, funcionário e cliente.
- Envio de mensagens aos clientes por **WhatsApp**.

### Portal do Cliente
- Novo pedido com produtos, imagens, PDF e matrizes de bordado (PNG, JPG, PDF, DST, EMB).
- Acompanhamento do estado de cada pedido, com aviso e som quando o estado muda.
- Cancelamento enquanto o pedido aguarda confirmação ou quando a Bordaveiro propõe outra data.
- Recuperação da palavra-passe, autorizada pelo administrador.
- Sugestões e reclamações (o administrador pode desativar por cliente).

## Tecnologias

| Parte | Tecnologia |
|---|---|
| Servidor | Node.js, Express 5 |
| Base de dados e ficheiros | Supabase (PostgreSQL + Storage) |
| Autenticação | JWT (sessão de 12 h) e bcrypt |
| Segurança | limite de tentativas de login (express-rate-limit) |
| Uploads | Multer (até 15 MB por ficheiro) |
| Frontend | HTML, CSS e JavaScript sem framework |
| PDF e Excel | jsPDF, jsPDF-AutoTable, SheetJS |

## Estrutura

```
├── index.js       # servidor Express e API
├── auth.js        # tokens JWT e permissões por perfil
├── index.html     # painel da equipa
├── script.js      # lógica do painel
├── calculos.js    # cálculos de IVA, descontos e valores (testados com `npm test`)
├── testes/        # testes automáticos
├── portal.html    # portal do cliente
├── portal.js      # lógica do portal
├── chat.js        # chat de sugestões (painel e portal)
├── style.css      # estilos partilhados
├── sw.js          # service worker (PWA)
├── manifest.json  # dados da app instalável
├── migracoes/     # SQL a correr uma vez no Supabase, pela ordem dos números
└── video-portal/  # vídeo tutorial do portal (Remotion)
```

## Como correr localmente

1. Instale o [Node.js](https://nodejs.org/) 18 ou superior.
2. Instale as dependências:

   ```bash
   npm install
   ```

3. Crie um ficheiro `.env` na raiz:

   ```env
   SUPABASE_URL=https://o-seu-projeto.supabase.co
   SUPABASE_KEY=chave-do-supabase
   JWT_SECRET=um-segredo-longo-e-aleatorio
   PORT=3000
   ```

4. Inicie o servidor:

   ```bash
   node index.js
   ```

5. Abra `http://localhost:3000` (painel) ou `http://localhost:3000/portal` (portal do cliente).

### Supabase

O projeto precisa de:

- **Tabelas:** `pedidos`, `clientes`, `estoque`, `utilizadores`, `feedback`, `recuperacoes_senha`.
- **Buckets de Storage:** `imagens` (PNG/JPG) e `matrizes` (DST, EMB e PDF).

## Estados de um pedido

| Estado | Significado |
|---|---|
| `Orçamento` | Orçamento ainda não aceite (não aparece no portal) |
| `Pedido Cliente` | Feito no portal, aguarda confirmação da Bordaveiro |
| `Pendente` | Confirmado, em produção |
| `Concluído` | Pronto para entrega |
| `Cancelado` | Cancelado pelo cliente no portal |

## Segurança

- O ficheiro `.env` não vai para o GitHub (está no `.gitignore`).
- O servidor só serve os ficheiros do site. O código do servidor, `package.json` e `node_modules` não ficam acessíveis.
- As rotas da API verificam o perfil de quem as chama (administrador, equipa ou cliente).
- Cada cliente só vê os seus próprios pedidos.

## Vídeo tutorial

A pasta [`video-portal`](video-portal) tem um vídeo em Remotion que ensina a usar o portal. As instruções estão no README dessa pasta.
