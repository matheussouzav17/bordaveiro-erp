import React from 'react';
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { CenaBase, CORES, Nota, Palco } from './ui';
import { Item, Login, MeusPedidos, NovoPedido, P, Pagina, PaginaPedidos, PaginaSenha, Pedido, cancelado } from './portal';
import { escrever, pontos, tempos } from './tempo';

const VERDE = 'green';
const EMAIL = 'teste@exemplo.pt';
const entre = (f: number, a: number, b: number) => f >= a && f < b;
const aparecer = (f: number, de: number, dur = 12) =>
    interpolate(f, [de, de + dur], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

const LISTA_INICIAL = [P.p130, P.p129, P.p128, P.p124, P.p121];
const LISTA = [P.p131, P.p130, P.p129, P.p128, P.p124, P.p121];
const LISTA_CANCELADOS = [P.p131, cancelado(P.p130), cancelado(P.p129), P.p128, P.p124, P.p121];

const Pedidos: React.FC<{ pedidos: Pedido[]; itens?: Item[]; confirmar?: number; extra?: Partial<React.ComponentProps<typeof MeusPedidos>> }> =
    ({ pedidos, itens = [{}], confirmar, extra }) => (
        <Pagina pagina="pedidos">
            <PaginaPedidos esquerda={<NovoPedido itens={itens} />} direita={<MeusPedidos pedidos={pedidos} confirmar={confirmar} {...extra} />} />
        </Pagina>
    );

// ---------------------------------------------------------------------------
export const Intro: React.FC = () => {
    const f = useCurrentFrame();
    const t = tempos('intro');
    const temas = ['Entrar no portal', 'Alterar a palavra-passe', 'Fazer um pedido', 'Acompanhar os pedidos',
        'Cancelar e alterar pedidos', 'Filtrar e descarregar relatório', 'Recuperar a palavra-passe'];
    return (
        <CenaBase id="intro" semTitulo>
            <AbsoluteFill style={{ alignItems: 'center', paddingTop: 70 }}>
                <Img src={staticFile('logo.png')} style={{ width: 300, mixBlendMode: 'multiply', opacity: aparecer(f, 0, 20), transform: `scale(${0.9 + 0.1 * aparecer(f, 0, 20)})` }} />
                <div style={{ opacity: aparecer(f, t(1, 0.3)), textAlign: 'center', marginTop: -10 }}>
                    <div style={{ fontSize: 72, fontWeight: 700, color: CORES.escuro }}>Portal do Cliente</div>
                    <div style={{ fontSize: 32, color: CORES.castanho, marginTop: 4 }}>Guia passo a passo</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 40px', marginTop: 40 }}>
                    {temas.map((tema, i) => (
                        <div key={tema} style={{
                            opacity: aparecer(f, t(2, 0.6 + i * 1.2)), transform: `translateX(${(1 - aparecer(f, t(2, 0.6 + i * 1.2))) * -30}px)`,
                            display: 'flex', alignItems: 'center', gap: 14, fontSize: 28, color: CORES.escuro
                        }}>
                            <span style={{ width: 40, height: 40, borderRadius: '50%', background: CORES.castanho, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700 }}>{i + 1}</span>
                            {tema}
                        </div>
                    ))}
                </div>
                <div style={{ opacity: aparecer(f, t(3)), marginTop: 36, background: '#fff', borderRadius: 30, padding: '10px 28px', fontSize: 26, color: CORES.escuro, boxShadow: '0 6px 18px rgba(0,0,0,0.08)' }}>
                    Conta de exemplo: <b>TESTE</b>
                </div>
            </AbsoluteFill>
        </CenaBase>
    );
};

// ---------------------------------------------------------------------------
export const Entrar: React.FC = () => {
    const f = useCurrentFrame();
    const t = tempos('login');
    const entrou = f >= t(3, 1.0);
    const foco = entre(f, t(2, 0.6), t(2, 2.5)) ? 'email' : entre(f, t(2, 2.5), t(3, 0.9)) ? 'senha' : undefined;
    return (
        <CenaBase id="login">
            <Palco
                camara={[
                    { f: 0, z: 1 },
                    { f: t(2), alvo: 'login-card', z: 1.4 },
                    { f: t(3, 1.0), z: 1, dur: 1 },
                    { f: t(4, 0.3), alvo: 'nome-cliente', z: 1.8, dx: 200 },
                    { f: t(4, 4.0), alvo: 'menu', z: 1.8 }
                ]}
                cursor={[
                    { f: t(2, 0.6), alvo: 'email', clique: true },
                    { f: t(2, 2.5), alvo: 'senha', clique: true },
                    { f: t(3, 0.8), alvo: 'entrar', clique: true }
                ]}
                destaques={[
                    { alvo: 'login-card', de: t(1, 1), ate: t(1, 4) },
                    { alvo: 'nome-cliente', de: t(4, 0.8), ate: t(4, 3.9) },
                    { alvo: 'menu', de: t(4, 4.3), ate: t(4, 8.7) }
                ]}>
                {entrou
                    ? <Pedidos pedidos={LISTA_INICIAL} />
                    : <Login email={escrever(EMAIL, f, t(2, 0.8))} senha={pontos(9, f, t(2, 2.7))} foco={foco} />}
            </Palco>
        </CenaBase>
    );
};

// ---------------------------------------------------------------------------
export const Senha: React.FC = () => {
    const f = useCurrentFrame();
    const t = tempos('senha');
    const naPagina = f >= t(1, 4.8);
    const feito = f >= t(4, 1.2);
    const foco = feito ? undefined
        : entre(f, t(2, 0.3), t(3, 0.3)) ? 'senha-atual'
        : entre(f, t(3, 0.3), t(3, 3.8)) ? 'senha-nova'
        : f >= t(3, 3.8) ? 'senha-repetir' : undefined;
    return (
        <CenaBase id="senha">
            <Palco
                camara={[
                    { f: 0, z: 1 },
                    { f: t(1, 1), alvo: 'menu', z: 1.6 },
                    { f: t(1, 5), alvo: 'card-senha', z: 1.45 }
                ]}
                cursor={[
                    { f: t(1, 4.5), alvo: 'nav-senha', clique: true, mover: 30 },
                    { f: t(2, 0.3), alvo: 'senha-atual', clique: true },
                    { f: t(3, 0.3), alvo: 'senha-nova', clique: true },
                    { f: t(3, 3.8), alvo: 'senha-repetir', clique: true },
                    { f: t(4, 0.6), alvo: 'alterar-senha', clique: true }
                ]}
                destaques={[
                    { alvo: 'nav-senha', de: t(1, 2), ate: t(1, 4.6) },
                    { alvo: 'msg-senha', de: t(4, 1.4), ate: t(4, 9) },
                    { alvo: 'encriptada', de: t(5), ate: t(5, 6) }
                ]}>
                {naPagina ? (
                    <Pagina pagina="senha">
                        <PaginaSenha foco={foco}
                            atual={feito ? '' : pontos(10, f, t(2, 0.8))}
                            nova={feito ? '' : pontos(11, f, t(3, 0.7))}
                            repetir={feito ? '' : pontos(11, f, t(3, 4.2))}
                            msg={feito ? { texto: 'Palavra-passe alterada. Use a nova no próximo início de sessão.', cor: VERDE } : null} />
                    </Pagina>
                ) : <Pedidos pedidos={LISTA_INICIAL} />}
            </Palco>
        </CenaBase>
    );
};

// ---------------------------------------------------------------------------
export const FazerPedido: React.FC = () => {
    const f = useCurrentFrame();
    const t = tempos('pedido');
    const naPagina = f >= t(1, 1.9);
    const enviado = f >= t(8, 1.2);

    const item0: Item = {
        nome: escrever('Toalha de banho', f, t(2, 0.6)),
        descricao: escrever('Bordar o nome Maria', f, t(2, 3.8)),
        letra: escrever('Cursiva', f, t(3, 0.7)),
        local: escrever('Canto inferior direito', f, t(3, 2.9)),
        qtd: f >= t(4, 0.7) ? '2' : '1'
    };
    const item1: Item = {
        nome: escrever('Babete', f, t(5, 3.6), 1),
        descricao: escrever('Nome Maria com coração', f, t(5, 4.3), 1),
        letra: escrever('Cursiva', f, t(5, 5.4), 1),
        local: escrever('Centro', f, t(5, 6.0), 1),
        qtd: f >= t(5, 6.7) ? '3' : '1'
    };
    const itens = enviado ? [{}] : f >= t(5, 3.0) ? [item0, item1] : [item0];

    const passosFoco: [number, string][] = [
        [t(2, 0.3), 'item0-nome'], [t(2, 3.5), 'item0-descricao'], [t(3, 0.4), 'item0-letra'], [t(3, 2.6), 'item0-local'],
        [t(4, 0.3), 'item0-qtd'], [t(5, 2.6), ''], [t(5, 3.4), 'item1-nome'], [t(5, 4.1), 'item1-descricao'], [t(5, 5.2), 'item1-letra'],
        [t(5, 5.8), 'item1-local'], [t(5, 6.4), 'item1-qtd'], [t(5, 7.2), ''], [t(6, 0.5), 'cor'], [t(6, 3.0), 'data'], [t(6, 5.0), '']
    ];
    const foco = passosFoco.filter(([de]) => f >= de).pop()?.[1] || undefined;

    return (
        <CenaBase id="pedido">
            <Palco
                camara={[
                    { f: 0, z: 1 },
                    { f: t(1, 0.2), alvo: 'menu', z: 1.6 },
                    { f: t(1, 2.2), z: 1 },
                    { f: t(1, 5), alvo: 'novo-pedido', z: 1.45, topo: true },
                    { f: t(2), alvo: 'item0', z: 1.8 },
                    { f: t(5, 3.2), alvo: 'item1', z: 1.7 },
                    { f: t(5, 7.6), alvo: 'item1-remover', z: 1.9 },
                    { f: t(6), alvo: 'cor', z: 1.6, dy: 50 },
                    { f: t(7), alvo: 'ficheiros', z: 1.8 },
                    { f: t(8), alvo: 'enviar', z: 1.6 },
                    { f: t(8, 5.5), z: 1, dur: 30 }
                ]}
                cursor={[
                    { f: t(1, 1.6), alvo: 'nav-pedidos', clique: true, mover: 26 },
                    { f: t(2, 0.3), alvo: 'item0-nome', clique: true, mover: 26 },
                    { f: t(2, 3.5), alvo: 'item0-descricao', clique: true },
                    { f: t(3, 0.4), alvo: 'item0-letra', clique: true },
                    { f: t(3, 2.6), alvo: 'item0-local', clique: true },
                    { f: t(4, 0.3), alvo: 'item0-qtd', clique: true },
                    { f: t(5, 2.8), alvo: 'adicionar', clique: true, mover: 24 },
                    { f: t(5, 3.4), alvo: 'item1-nome', clique: true, mover: 10 },
                    { f: t(5, 4.1), alvo: 'item1-descricao', clique: true, mover: 10 },
                    { f: t(5, 5.2), alvo: 'item1-letra', clique: true, mover: 10 },
                    { f: t(5, 5.8), alvo: 'item1-local', clique: true, mover: 10 },
                    { f: t(5, 6.4), alvo: 'item1-qtd', clique: true, mover: 10 },
                    { f: t(5, 8.0), alvo: 'item1-remover', mover: 16 },
                    { f: t(6, 0.5), alvo: 'cor', clique: true, mover: 24 },
                    { f: t(6, 3.0), alvo: 'data', clique: true },
                    { f: t(7, 9.5), alvo: 'escolher', clique: true, mover: 24 },
                    { f: t(8, 0.6), alvo: 'enviar', clique: true }
                ]}
                destaques={[
                    { alvo: 'item0-letra-local', de: t(3, 0.1), ate: t(3, 8.5) },
                    { alvo: 'adicionar', de: t(5, 0.5), ate: t(5, 2.9) },
                    { alvo: 'item1-remover', de: t(5, 8.0), ate: t(5, 11.6) },
                    { alvo: 'grupo-data', de: t(6, 5.2), ate: t(6, 10.4) },
                    { alvo: 'ficheiros', de: t(7, 0.3), ate: t(7, 9.3) },
                    { alvo: 'msg-pedido', de: t(8, 1.4), ate: t(8, 5.4) },
                    { alvo: 'pedido-131', de: t(8, 6.5), ate: t(8, 11.3) }
                ]}>
                {naPagina ? (
                    <Pagina pagina="pedidos">
                        <PaginaPedidos
                            esquerda={<NovoPedido itens={itens} foco={enviado ? undefined : foco}
                                cor={enviado ? '' : escrever('Dourado', f, t(6, 0.8))}
                                data={enviado ? '' : escrever('15/11/2026', f, t(6, 3.3))}
                                ficheiros={!enviado && f >= t(7, 10.2) ? ['desenho-maria.png', 'matriz-maria.dst'] : []}
                                msg={enviado ? { texto: 'Pedido nº 131 enviado. A Bordaveiro vai confirmar a data em breve.', cor: VERDE } : null} />}
                            direita={<MeusPedidos pedidos={enviado ? LISTA : LISTA_INICIAL} />} />
                    </Pagina>
                ) : (
                    <Pagina pagina="senha"><PaginaSenha msg={{ texto: 'Palavra-passe alterada. Use a nova no próximo início de sessão.', cor: VERDE }} /></Pagina>
                )}
            </Palco>
        </CenaBase>
    );
};

// ---------------------------------------------------------------------------
export const Estados: React.FC = () => {
    const t = tempos('estados');
    return (
        <CenaBase id="estados">
            <Palco
                camara={[
                    { f: 0, z: 1 },
                    { f: t(1, 1), alvo: 'meus-pedidos', z: 1.3, topo: true },
                    { f: t(2), alvo: 'pedido-131', z: 1.6 },
                    { f: t(3), alvo: 'pedido-128', z: 1.6 },
                    { f: t(4), alvo: 'pedido-124', z: 1.6 },
                    { f: t(5), alvo: 'pedido-121', z: 1.6 },
                    { f: t(6), alvo: 'zona-atualizar', z: 1.9 }
                ]}
                cursor={[{ f: t(6, 4.6), alvo: 'atualizar', clique: true, mover: 24 }]}
                destaques={[
                    { alvo: 'estado-131', de: t(2, 0.2), ate: t(3) },
                    { alvo: 'estado-128', de: t(3, 0.2), ate: t(4) },
                    { alvo: 'estado-124', de: t(4, 0.2), ate: t(5) },
                    { alvo: 'estado-121', de: t(5, 0.2), ate: t(6) },
                    { alvo: 'zona-atualizar', de: t(6, 0.3), ate: t(6, 8) }
                ]}>
                <Pedidos pedidos={LISTA} extra={{ atualizado: useCurrentFrame() >= t(6, 4.8) ? '10:45' : '10:42' }} />
            </Palco>
        </CenaBase>
    );
};

// ---------------------------------------------------------------------------
export const Cancelar: React.FC = () => {
    const f = useCurrentFrame();
    const t = tempos('cancelar');
    const feito = f >= t(2, 4.5);
    const lista = feito ? [P.p131, cancelado(P.p130), P.p129, P.p128, P.p124, P.p121] : LISTA;
    return (
        <CenaBase id="cancelar">
            <Palco
                camara={[{ f: 0, z: 1 }, { f: t(1, 0.5), alvo: 'pedido-130', z: 1.7 }]}
                cursor={[
                    { f: t(2, 0.8), alvo: 'cancelar-130', clique: true, mover: 26 },
                    { f: t(2, 1.7), alvo: 'ok', mover: 14 },
                    { f: t(2, 4.3), alvo: 'ok', clique: true, mover: 1 }
                ]}
                destaques={[
                    { alvo: 'aviso-130', de: t(1, 3), ate: t(2, 0.6) },
                    { alvo: 'estado-130', de: t(3), ate: t(3, 4) }
                ]}>
                <Pedidos pedidos={lista} confirmar={entre(f, t(2, 1.0), t(2, 4.5)) ? 130 : undefined} />
            </Palco>
        </CenaBase>
    );
};

// ---------------------------------------------------------------------------
export const NovaData: React.FC = () => {
    const f = useCurrentFrame();
    const t = tempos('novadata');
    const feito = f >= t(5, 3.6);
    const lista = [P.p131, cancelado(P.p130), feito ? cancelado(P.p129) : P.p129, P.p128, P.p124, P.p121];
    return (
        <CenaBase id="novadata">
            <Palco
                camara={[{ f: 0, z: 1 }, { f: t(1, 0.5), alvo: 'pedido-129', z: 1.7 }]}
                cursor={[
                    { f: t(5, 0.8), alvo: 'cancelar-129', clique: true, mover: 26 },
                    { f: t(5, 1.7), alvo: 'ok', mover: 14 },
                    { f: t(5, 3.4), alvo: 'ok', clique: true, mover: 1 }
                ]}
                destaques={[
                    { alvo: 'entrega-129', de: t(2), ate: t(3) },
                    { alvo: 'aviso-129', de: t(3), ate: t(4) },
                    { alvo: 'estado-129', de: t(5, 3.8), ate: t(5, 7) }
                ]}
                sobre={<>
                    <Nota de={t(4)} ate={t(5)} icone="✅" cor="#27ae60" titulo="A nova data serve?" texto="Não precisa de fazer nada. O pedido segue normalmente para produção." />
                    <Nota de={t(5)} icone="✖️" cor="#c0392b" titulo="A nova data não serve?" texto="Clique em Cancelar pedido e confirme com OK." />
                </>}>
                <Pedidos pedidos={lista} confirmar={entre(f, t(5, 1.0), t(5, 3.6)) ? 129 : undefined} />
            </Palco>
        </CenaBase>
    );
};

// ---------------------------------------------------------------------------
export const Alterar: React.FC = () => {
    const t = tempos('alterar');
    return (
        <CenaBase id="alterar">
            <Palco
                camara={[{ f: 0, z: 1 }, { f: t(1, 0.5), alvo: 'pedido-131', z: 1.45 }, { f: t(3), alvo: 'pedido-128', z: 1.7 }]}
                destaques={[
                    { alvo: 'aviso-131', de: t(2, 0.3), ate: t(3) },
                    { alvo: 'estado-128', de: t(3, 0.5), ate: t(3, 6.8) }
                ]}
                sobre={<>
                    <Nota de={t(1, 1)} ate={t(2)} icone="✏️" titulo="Não é possível editar" texto="Depois de enviado, um pedido não pode ser editado no portal." />
                    <Nota de={t(2)} ate={t(3)} icone="🔁" titulo="Ainda a aguardar confirmação?" texto={<>1. Cancele o pedido.<br />2. Faça um pedido novo com as informações corretas.</>} />
                    <Nota de={t(3)} icone="📞" titulo="Pedido já confirmado?" texto="Contacte diretamente a Bordaveiro, que faz a alteração por si." />
                </>}>
                <Pedidos pedidos={LISTA_CANCELADOS} />
            </Palco>
        </CenaBase>
    );
};

// ---------------------------------------------------------------------------
export const Filtro: React.FC = () => {
    const f = useCurrentFrame();
    const t = tempos('filtro');
    const filtrado = entre(f, t(2), t(2, 6.8));
    const limpo = f >= t(2, 6.8);
    const de = limpo ? '' : escrever('15/10/2026', f, t(1, 2.8));
    const ate = limpo ? '' : escrever('31/10/2026', f, t(1, 5.3));
    const foco = limpo ? undefined : entre(f, t(1, 2.5), t(1, 5.0)) ? 'de' : entre(f, t(1, 5.0), t(2)) ? 'ate' : undefined;
    const pedidos = filtrado ? LISTA_CANCELADOS.filter(p => [131, 130, 129, 128].includes(p.id)) : LISTA_CANCELADOS;
    return (
        <CenaBase id="filtro">
            <Palco
                camara={[{ f: 0, z: 1 }, { f: t(1, 0.3), alvo: 'filtro', z: 1.8, dy: 60 }]}
                cursor={[
                    { f: t(1, 2.5), alvo: 'de', clique: true, mover: 24 },
                    { f: t(1, 5.0), alvo: 'ate', clique: true },
                    { f: t(2, 6.5), alvo: 'limpar', clique: true, mover: 24 },
                    { f: t(3, 2.0), alvo: 'excel', clique: true, mover: 24 }
                ]}
                destaques={[
                    { alvo: 'resumo', de: t(2, 0.2), ate: t(2, 5.5) },
                    { alvo: 'excel', de: t(3, 0.2), ate: t(3, 8.5) }
                ]}
                sobre={<Nota de={t(3, 2.4)} icone="📥" cor="#27ae60" titulo="Relatório descarregado"
                    texto="Bordaveiro_Pedidos_Aprovados.xlsx — abre no Excel com os pedidos aprovados e as respetivas datas." />}>
                <Pedidos pedidos={pedidos} extra={{ de, ate, foco, resumo: filtrado ? '4 pedido(s) no período, 1 aprovado(s).' : '' }} />
            </Palco>
        </CenaBase>
    );
};

// ---------------------------------------------------------------------------
export const Recuperar: React.FC = () => {
    const f = useCurrentFrame();
    const t = tempos('recuperar');
    const fim = f >= t(4, 4.6);
    let ecra: React.ReactNode;
    if (fim) {
        ecra = <Login email={EMAIL} msg={{ texto: 'Palavra-passe alterada. Já pode entrar com a nova palavra-passe.', cor: VERDE }} />;
    } else if (f >= t(3, 7.0)) {
        const foco = f >= t(4, 2.2) ? 'rec-senha-2' : f >= t(4, 0.3) ? 'rec-senha' : undefined;
        ecra = <Login foco={foco} rec={{ passo: 'nova', nova: pontos(10, f, t(4, 0.6)), nova2: pontos(10, f, t(4, 2.5)) }} />;
    } else if (f >= t(2, 2.7)) {
        ecra = <Login rec={{
            passo: 'codigo', email: EMAIL, codigo: 'K7QM-4PZ2',
            msg: f < t(3, 1.3) ? { texto: 'Pedido enviado à Bordaveiro.', cor: VERDE } : null,
            estado: f >= t(3, 1.3) ? { texto: 'A aguardar autorização da Bordaveiro.', cor: '#E5A83B' } : null
        }} />;
    } else if (f >= t(1, 3.8)) {
        ecra = <Login foco={f >= t(2, 0.3) ? 'rec-email' : undefined} rec={{ passo: 'pedir', email: escrever(EMAIL, f, t(2, 0.6)) }} />;
    } else {
        ecra = <Login />;
    }
    return (
        <CenaBase id="recuperar">
            <Palco
                camara={[{ f: 0, z: 1 }, { f: t(1, 0.3), alvo: 'login-card', z: 1.4 }]}
                cursor={[
                    { f: t(1, 3.5), alvo: 'esqueci', clique: true, mover: 24 },
                    { f: t(2, 0.3), alvo: 'rec-email', clique: true, mover: 24 },
                    { f: t(2, 2.4), alvo: 'pedir-nova', clique: true },
                    { f: t(3, 1.0), alvo: 'verificar', clique: true, mover: 24 },
                    { f: t(3, 6.6), alvo: 'verificar', clique: true, mover: 6 },
                    { f: t(4, 0.3), alvo: 'rec-senha', clique: true, mover: 20 },
                    { f: t(4, 2.2), alvo: 'rec-senha-2', clique: true },
                    { f: t(4, 4.3), alvo: 'guardar-nova', clique: true }
                ]}
                destaques={[
                    { alvo: 'esqueci', de: t(1, 1), ate: t(1, 3.6) },
                    { alvo: 'codigo', de: t(2, 3.2), ate: t(3) },
                    { alvo: 'rec-estado', de: t(3, 1.5), ate: t(3, 6.4) }
                ]}
                sobre={<Nota de={t(3, 2.2)} ate={t(3, 7.6)} icone="🔐" titulo="A Bordaveiro autoriza o pedido"
                    texto='Depois da autorização, volte a esta página e clique em "Verificar autorização".' />}>
                {ecra}
            </Palco>
        </CenaBase>
    );
};

// ---------------------------------------------------------------------------
export const Fim: React.FC = () => {
    const f = useCurrentFrame();
    const t = tempos('fim');
    const saiu = f >= t(1, 5.8);
    const op = aparecer(f, t(2, 0), 18);
    return (
        <CenaBase id="fim">
            <Palco
                camara={[{ f: 0, z: 1 }, { f: t(1, 0.5), alvo: 'menu', z: 1.8 }, { f: t(1, 5.8), z: 1, dur: 1 }]}
                cursor={[{ f: t(1, 5.5), alvo: 'sair', clique: true, mover: 30 }]}
                destaques={[{ alvo: 'sair', de: t(1, 1.2), ate: t(1, 5.6) }]}>
                {saiu ? <Login /> : <Pedidos pedidos={LISTA_CANCELADOS} />}
            </Palco>
            <AbsoluteFill style={{ opacity: op, background: 'linear-gradient(160deg, #F7EFE6 0%, #EADBCB 100%)', alignItems: 'center', justifyContent: 'center' }}>
                <Img src={staticFile('logo.png')} style={{ width: 340, mixBlendMode: 'multiply' }} />
                <div style={{ fontSize: 76, fontWeight: 700, color: CORES.escuro, marginTop: -10 }}>Obrigado!</div>
                <div style={{ fontSize: 32, color: CORES.castanho, marginTop: 10 }}>Dúvidas? Contacte a Bordaveiro.</div>
            </AbsoluteFill>
        </CenaBase>
    );
};
