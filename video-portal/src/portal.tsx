import React from 'react';
import { Img, staticFile } from 'remotion';
import './portal.css';

// Réplica dos ecrãs de ../portal.html, com o mesmo CSS e textos

type Msg = { texto: string; cor: string } | null;

const Campo: React.FC<{ alvo: string; valor?: string; placeholder?: string; foco?: string; className?: string; style?: React.CSSProperties }> =
    ({ alvo, valor = '', placeholder, foco, className = '', style }) => (
        <input data-alvo={alvo} readOnly value={valor} placeholder={placeholder}
            className={`${className} ${foco === alvo ? 'foco' : ''}`} style={style} />
    );

const CampoData: React.FC<{ alvo: string; valor?: string; foco?: string; className?: string }> = ({ alvo, valor, foco, className }) => (
    <div style={{ position: 'relative' }}>
        <Campo alvo={alvo} valor={valor} placeholder="dd/mm/aaaa" foco={foco} className={className} />
        <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-55%)', fontSize: 14, opacity: 0.7 }}>📅</span>
    </div>
);

// --- Ecrã de entrada e recuperação da palavra-passe ---
export type Recuperacao = { passo: 'pedir' | 'codigo' | 'nova'; email?: string; codigo?: string; estado?: Msg; msg?: Msg; nova?: string; nova2?: string };

export const Login: React.FC<{ email?: string; senha?: string; foco?: string; msg?: Msg; rec?: Recuperacao }> = ({ email, senha, foco, msg, rec }) => (
    <div className="ecra-login" style={{ height: 720, position: 'relative', backgroundImage: `url(${staticFile('fundo.jpg')})` }}>
        <div className="login-card" data-alvo="login-card">
            <h2 style={{ color: '#4a2511', marginTop: 0, marginBottom: 5, fontSize: 32, fontFamily: "'Times New Roman', serif", fontStyle: 'italic' }}>Bordaveiro</h2>
            <p className="login-subtitle">Portal do Cliente</p>
            {!rec ? (
                <div>
                    <div className="input-wrapper"><Campo alvo="email" className="login-input" placeholder="Email" valor={email} foco={foco} /></div>
                    <div className="input-wrapper"><Campo alvo="senha" className="login-input" placeholder="Palavra-passe" valor={senha} foco={foco} /></div>
                    <button className="btn-login" data-alvo="entrar">Entrar</button>
                    <p style={{ marginTop: 20, fontSize: 13 }}><span className="link-portal" data-alvo="esqueci">Esqueci-me da palavra-passe</span></p>
                    {msg && <p style={{ color: msg.cor, marginTop: 15, fontSize: 12, fontWeight: 'bold' }}>{msg.texto}</p>}
                </div>
            ) : (
                <div style={{ textAlign: 'left' }}>
                    {rec.passo === 'pedir' && (
                        <div>
                            <p className="rec-texto">Indique o email da sua conta. A Bordaveiro tem de autorizar o pedido antes de poder escolher uma nova palavra-passe.</p>
                            <div className="input-wrapper"><Campo alvo="rec-email" className="login-input" placeholder="Email" valor={rec.email} foco={foco} /></div>
                            <button className="btn-login" data-alvo="pedir-nova">Pedir nova palavra-passe</button>
                            <p style={{ fontSize: 12, marginTop: 12 }}><span className="link-portal">Já tenho um código</span></p>
                        </div>
                    )}
                    {rec.passo === 'codigo' && (
                        <div>
                            <p className="rec-texto">Pedido enviado para {rec.email}. Guarde este código: vai precisar dele se continuar noutro computador. Depois de a Bordaveiro autorizar, volte aqui e clique em "Verificar autorização".</p>
                            <div className="rec-codigo" data-alvo="codigo">{rec.codigo}</div>
                            <p className="rec-estado" data-alvo="rec-estado" style={{ color: rec.estado?.cor }}>{rec.estado?.texto}</p>
                            <button className="btn-login" data-alvo="verificar">Verificar autorização</button>
                        </div>
                    )}
                    {rec.passo === 'nova' && (
                        <div>
                            <p className="rec-texto">Pedido autorizado. Escolha a sua nova palavra-passe (só você a vai saber).</p>
                            <div className="input-wrapper"><Campo alvo="rec-senha" className="login-input" placeholder="Nova palavra-passe (mín. 8 caracteres)" valor={rec.nova} foco={foco} /></div>
                            <div className="input-wrapper"><Campo alvo="rec-senha-2" className="login-input" placeholder="Repetir a nova palavra-passe" valor={rec.nova2} foco={foco} /></div>
                            <button className="btn-login" data-alvo="guardar-nova">Guardar nova palavra-passe</button>
                        </div>
                    )}
                    {rec.msg && <p style={{ fontSize: 12, fontWeight: 'bold', marginTop: 12, color: rec.msg.cor }}>{rec.msg.texto}</p>}
                    <p style={{ fontSize: 13, textAlign: 'center', marginTop: 15 }}><span className="link-portal">← Voltar ao início de sessão</span></p>
                </div>
            )}
        </div>
    </div>
);

// --- Área do cliente ---
export const Pagina: React.FC<{ pagina: 'pedidos' | 'senha'; children: React.ReactNode }> = ({ pagina, children }) => (
    <div className="pagina" style={{ ['--logo' as string]: `url(${staticFile('logo.png')})` }}>
        <div className="container">
            <div className="header-dash">
                <div>
                    <h2 style={{ margin: 0, color: '#4A2511' }}>BORDAVEIRO</h2>
                    <small style={{ color: '#8C5E3C' }}>Portal do Cliente · <span data-alvo="nome-cliente">TESTE</span></small>
                </div>
                <div className="menu-navegacao" data-alvo="menu">
                    <button data-alvo="nav-pedidos" className={`btn-nav ${pagina === 'pedidos' ? 'btn-nav-active' : 'btn-nav-inactive'}`}>Pedidos</button>
                    <button data-alvo="nav-senha" className={`btn-nav ${pagina === 'senha' ? 'btn-nav-active' : 'btn-nav-inactive'}`}>Palavra-passe</button>
                    <button data-alvo="sair" className="btn-nav" style={{ backgroundColor: '#593122', color: 'white' }}>Sair</button>
                </div>
            </div>
            {children}
        </div>
    </div>
);

export const PaginaSenha: React.FC<{ atual?: string; nova?: string; repetir?: string; foco?: string; msg?: Msg }> = ({ atual, nova, repetir, foco, msg }) => (
    <div style={{ maxWidth: 480, margin: '20px auto 0' }}>
        <div className="card" data-alvo="card-senha">
            <h3 style={{ borderBottom: '2px solid #EADDCE', paddingBottom: 12, marginBottom: 15 }}>Alterar Palavra-passe</h3>
            <p style={{ fontSize: 13, color: '#666', marginTop: 0 }} data-alvo="encriptada">A palavra-passe fica guardada de forma encriptada: nem a Bordaveiro a consegue ver.</p>
            <div className="input-group"><label>Palavra-passe atual</label><Campo alvo="senha-atual" valor={atual} foco={foco} /></div>
            <div className="input-group"><label>Nova palavra-passe</label><Campo alvo="senha-nova" valor={nova} foco={foco} placeholder="Pelo menos 8 caracteres" /></div>
            <div className="input-group"><label>Repetir a nova palavra-passe</label><Campo alvo="senha-repetir" valor={repetir} foco={foco} /></div>
            <button className="btn" data-alvo="alterar-senha">Alterar Palavra-passe</button>
            <div data-alvo="msg-senha" style={{ marginTop: 15, fontWeight: 'bold', fontSize: 14, textAlign: 'center', color: msg?.cor, minHeight: 20 }}>{msg?.texto}</div>
        </div>
    </div>
);

export type Item = { nome?: string; descricao?: string; letra?: string; local?: string; qtd?: string };

export const NovoPedido: React.FC<{ itens: Item[]; cor?: string; data?: string; ficheiros?: string[]; foco?: string; msg?: Msg }> =
    ({ itens, cor, data, ficheiros = [], foco, msg }) => (
        <div className="card" data-alvo="novo-pedido">
            <h3 style={{ borderBottom: '2px solid #EADDCE', paddingBottom: 12, marginBottom: 20 }}>Novo Pedido</h3>
            <div className="caixa-produtos" data-alvo="produtos">
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: 10, color: '#4A2511' }}>Produtos</label>
                {itens.map((it, i) => (
                    <div className="item-pedido" data-alvo={`item${i}`} key={i}>
                        <div className="item-linha">
                            <div><small>Nome do produto</small><Campo alvo={`item${i}-nome`} valor={it.nome} foco={foco} placeholder="Ex: Polo com logótipo" /></div>
                            <button className="btn-small item-remover" data-alvo={`item${i}-remover`}>✕</button>
                        </div>
                        <small>Descrição</small><Campo alvo={`item${i}-descricao`} valor={it.descricao} foco={foco} placeholder="Ex: Tamanhos 2 M e 3 L, logótipo no peito" />
                        <div className="item-linha" data-alvo={`item${i}-letra-local`}>
                            <div><small>Letra</small><Campo alvo={`item${i}-letra`} valor={it.letra} foco={foco} placeholder="Ex: Cursiva, Arial" /></div>
                            <div><small>Local do bordado</small><Campo alvo={`item${i}-local`} valor={it.local} foco={foco} placeholder="Ex: Peito esquerdo, costas" /></div>
                        </div>
                        <div className="item-linha">
                            <div style={{ maxWidth: 140 }}><small>Quantidade</small><Campo alvo={`item${i}-qtd`} valor={it.qtd ?? '1'} foco={foco} /></div>
                        </div>
                    </div>
                ))}
                <button className="btn-small" style={{ background: '#A67B5B' }} data-alvo="adicionar">+ Adicionar produto</button>
            </div>
            <div className="input-group">
                <label>Cor da linha</label>
                <Campo alvo="cor" valor={cor} foco={foco} placeholder="Ex: Dourado, azul-marinho" />
            </div>
            <div className="input-group" data-alvo="grupo-data">
                <label>Data pretendida</label>
                <CampoData alvo="data" valor={data} foco={foco} />
                <small style={{ color: '#666' }}>A Bordaveiro confirma se é possível ou indica uma previsão.</small>
            </div>
            <div className="caixa-ficheiros" data-alvo="ficheiros">
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: 10, color: '#4A2511' }}>Ficheiros (opcional)</label>
                <small style={{ color: '#666' }}>PNG, JPEG, PDF, DST ou EMB — até 6 ficheiros, 15 MB cada:</small>
                <div className="campo-ficheiro" style={{ marginTop: 6 }}>
                    <span className="botao" data-alvo="escolher">Escolher ficheiros</span>
                    <span>{ficheiros.length ? `${ficheiros.length} ficheiros` : 'Nenhum ficheiro selecionado'}</span>
                </div>
                {ficheiros.length > 0 && <div style={{ fontSize: 12, color: '#593122', marginTop: 6 }}>{ficheiros.join(' · ')}</div>}
            </div>
            <button className="btn" data-alvo="enviar">Enviar Pedido</button>
            <div data-alvo="msg-pedido" style={{ marginTop: 15, fontWeight: 'bold', fontSize: 14, textAlign: 'center', color: msg?.cor }}>{msg?.texto}</div>
        </div>
    );

export type Pedido = {
    id: number;
    estado: 'aguardar' | 'confirmado' | 'pronto' | 'cancelado';
    itens: { qtd: number; nome: string; descricao?: string; letra?: string; local?: string }[];
    cor?: string; pretendida?: string; entrega?: string; entrada: string;
    imagens?: number; ficheiros?: string[];
};

const ESTADOS = {
    aguardar: { texto: 'A aguardar confirmação', cor: '#E5A83B' },
    confirmado: { texto: 'Confirmado · em produção', cor: '#8C5E3C' },
    pronto: { texto: 'Pronto', cor: '#27ae60' },
    cancelado: { texto: 'Cancelado', cor: '#95a5a6' }
};

const letraLocal = (i: Pedido['itens'][0]) => [i.letra && `Letra: ${i.letra}`, i.local && `Local: ${i.local}`].filter(Boolean).join(' · ');

const PedidoCard: React.FC<{ p: Pedido; confirmar?: boolean }> = ({ p, confirmar }) => {
    const estado = ESTADOS[p.estado];
    const novaData = p.estado === 'confirmado' && p.pretendida && p.entrega && p.entrega !== p.pretendida;
    const podeCancelar = p.estado === 'aguardar' || novaData;
    let entrega: React.ReactNode = null;
    if (p.estado === 'aguardar') entrega = p.pretendida ? `Data pretendida: ${p.pretendida}` : 'Sem data pretendida';
    else if (p.estado !== 'cancelado' && p.entrega) {
        entrega = novaData
            ? <><strong>Previsão de entrega: {p.entrega}</strong> (pedido para {p.pretendida})</>
            : <strong>Entrega confirmada: {p.entrega}</strong>;
    }
    return (
        <div className="portal-pedido" data-alvo={`pedido-${p.id}`} style={{ borderLeftColor: estado.cor, position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                <strong style={{ color: '#4A2511' }}>Pedido nº {p.id}</strong>
                <span className="portal-estado" data-alvo={`estado-${p.id}`} style={{ background: estado.cor }}>{estado.texto}</span>
            </div>
            <ul className="portal-itens">
                {p.itens.map((i, k) => (
                    <li key={k}>{i.qtd} × <strong>{i.nome}</strong>{i.descricao ? ` — ${i.descricao}` : ''}
                        {letraLocal(i) && <><br /><small>{letraLocal(i)}</small></>}</li>
                ))}
            </ul>
            {p.cor && <div><small>Cor da linha:</small> {p.cor}</div>}
            {entrega && <div style={{ marginTop: 4 }}><span data-alvo={`entrega-${p.id}`}>{entrega}</span></div>}
            {podeCancelar && (
                <div className="portal-aviso" data-alvo={`aviso-${p.id}`}>
                    <span>{novaData ? 'A Bordaveiro indicou uma nova data de entrega. Se não lhe convier, pode cancelar o pedido.' : 'Pode cancelar o pedido enquanto aguarda confirmação.'}</span>
                    <button className="btn-small" data-alvo={`cancelar-${p.id}`} style={{ background: '#c0392b' }}>Cancelar pedido</button>
                </div>
            )}
            {!!p.imagens && (
                <div className="thumbs-pedido" style={{ marginTop: 8 }}>
                    {Array.from({ length: p.imagens }, (_, k) => <Img key={k} className="thumb-pedido" src={staticFile('logo.png')} />)}
                </div>
            )}
            {p.ficheiros && <div className="portal-ficheiros">{p.ficheiros.map(f => <span key={f}>{f}</span>)}</div>}
            <small style={{ color: '#999' }}>Data de entrada: {p.entrada}</small>
            {confirmar && <DialogoConfirmar id={p.id} />}
        </div>
    );
};

// Janela de confirmação do browser
const DialogoConfirmar: React.FC<{ id: number }> = ({ id }) => (
    <div style={{
        // Centrado sem transform: o cursor mede as posições pelos offsets, que ignoram transforms
        position: 'absolute', left: 'calc(50% - 200px)', top: 30, width: 400, boxSizing: 'border-box', zIndex: 20, background: '#fff',
        borderRadius: 10, boxShadow: '0 12px 40px rgba(0,0,0,0.35)', padding: '18px 20px', fontSize: 14, color: '#222'
    }} data-alvo="dialogo">
        <div style={{ fontWeight: 600, marginBottom: 10 }}>O portal diz</div>
        <div>Confirma o cancelamento do pedido nº {id}? Esta ação não pode ser desfeita.</div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
            <span data-alvo="ok" style={{ background: '#0b57d0', color: '#fff', borderRadius: 18, padding: '7px 22px', fontWeight: 600 }}>OK</span>
            <span style={{ border: '1px solid #ccc', color: '#0b57d0', borderRadius: 18, padding: '7px 16px', fontWeight: 600 }}>Cancelar</span>
        </div>
    </div>
);

export const MeusPedidos: React.FC<{ pedidos: Pedido[]; de?: string; ate?: string; resumo?: string; foco?: string; confirmar?: number; atualizado?: string }> =
    ({ pedidos, de, ate, resumo, foco, confirmar, atualizado = '10:42' }) => (
        <div className="card" data-alvo="meus-pedidos">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, borderBottom: '1px solid #EADDCE', paddingBottom: 15, marginBottom: 15 }}>
                <h3 style={{ margin: 0 }}>Os Meus Pedidos</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} data-alvo="zona-atualizar">
                    <small style={{ color: '#999' }}>Atualizado às {atualizado}</small>
                    <button className="btn-small" style={{ background: '#A67B5B' }} data-alvo="atualizar">Atualizar</button>
                </div>
            </div>
            <div className="portal-filtro" data-alvo="filtro">
                <div><small>De</small><CampoData alvo="de" valor={de} foco={foco} /></div>
                <div><small>Até</small><CampoData alvo="ate" valor={ate} foco={foco} /></div>
                <button className="btn-small" style={{ background: '#B08D6A' }} data-alvo="limpar">Limpar</button>
                <button className="btn-small" style={{ background: '#27ae60' }} data-alvo="excel">Relatório (Excel)</button>
            </div>
            <small data-alvo="resumo" style={{ display: 'block', color: '#888', marginBottom: 10, minHeight: 4 }}>{resumo}</small>
            <div data-alvo="lista">
                {pedidos.length
                    ? pedidos.map(p => <PedidoCard key={p.id} p={p} confirmar={confirmar === p.id} />)
                    : <p style={{ textAlign: 'center', color: '#888', marginTop: 20 }}>Ainda não fez nenhum pedido.</p>}
            </div>
        </div>
    );

export const PaginaPedidos: React.FC<{ esquerda: React.ReactNode; direita: React.ReactNode }> = ({ esquerda, direita }) => (
    <div className="grid">
        <div>{esquerda}</div>
        <div>{direita}</div>
    </div>
);

// Pedidos de exemplo da conta TESTE
export const P = {
    p131: {
        id: 131, estado: 'aguardar', entrada: '25/10/2026', pretendida: '15/11/2026', cor: 'Dourado', imagens: 1, ficheiros: ['DST · matriz-maria.dst'],
        itens: [
            { qtd: 2, nome: 'Toalha de banho', descricao: 'Bordar o nome Maria', letra: 'Cursiva', local: 'Canto inferior direito' },
            { qtd: 3, nome: 'Babete', descricao: 'Nome Maria com coração', letra: 'Cursiva', local: 'Centro' }
        ]
    } as Pedido,
    p130: {
        id: 130, estado: 'aguardar', entrada: '24/10/2026', pretendida: '10/11/2026', cor: 'Preto',
        itens: [{ qtd: 1, nome: 'Avental', descricao: 'Logótipo da padaria', local: 'Peito' }]
    } as Pedido,
    p129: {
        id: 129, estado: 'confirmado', entrada: '20/10/2026', pretendida: '30/10/2026', entrega: '06/11/2026', cor: 'Branco',
        itens: [{ qtd: 10, nome: 'Polo', descricao: 'Logótipo da empresa', letra: 'Arial', local: 'Peito esquerdo' }]
    } as Pedido,
    p128: {
        id: 128, estado: 'confirmado', entrada: '18/10/2026', pretendida: '05/11/2026', entrega: '05/11/2026', cor: 'Azul-marinho',
        itens: [{ qtd: 4, nome: 'Fronha', descricao: 'Iniciais A e M', letra: 'Script', local: 'Centro' }]
    } as Pedido,
    p124: {
        id: 124, estado: 'pronto', entrada: '08/10/2026', pretendida: '22/10/2026', entrega: '22/10/2026', cor: 'Vermelho',
        itens: [{ qtd: 1, nome: 'Mochila', descricao: 'Nome Tomás', letra: 'Arial', local: 'Bolso da frente' }]
    } as Pedido,
    p121: {
        id: 121, estado: 'cancelado', entrada: '02/10/2026',
        itens: [{ qtd: 2, nome: 'Toalha de rosto', descricao: 'Nome Rita' }]
    } as Pedido
};

export const cancelado = (p: Pedido): Pedido => ({ ...p, estado: 'cancelado' });
