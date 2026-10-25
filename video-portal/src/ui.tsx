import React, { useLayoutEffect, useRef, useState } from 'react';
import { AbsoluteFill, Audio, Easing, Img, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { cena } from './tempo';

export const CORES = { castanho: '#8C5E3C', escuro: '#4A2511', creme: '#FAF6F2', bege: '#EADDCE', laranja: '#E67E22' };

// Área visível do portal (em píxeis da página) e a sua escala no vídeo
const VW = 1280, VH = 720, ESCALA = 1.1;
const BARRA = 44;
export const MOLDURA = { x: (1920 - VW * ESCALA) / 2, y: 84, w: VW * ESCALA, h: VH * ESCALA + BARRA };

const suave = Easing.inOut(Easing.cubic);
const prog = (frame: number, de: number, dur: number) =>
    interpolate(frame, [de, de + dur], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: suave });

type Ret = { x: number; y: number; w: number; h: number };
const sel = (alvo: string) => `[data-alvo="${alvo}"]`;

// Posição do elemento na página, somando os offsets até à raiz (não é afetada pelo zoom)
function medir(el: HTMLElement, raiz: HTMLElement): Ret {
    let x = 0, y = 0;
    let e: HTMLElement | null = el;
    while (e && e !== raiz) {
        x += e.offsetLeft; y += e.offsetTop;
        e = e.offsetParent as HTMLElement | null;
    }
    return { x, y, w: el.offsetWidth, h: el.offsetHeight };
}

export type Camara = { f: number; z?: number; alvo?: string; dx?: number; dy?: number; topo?: boolean; dur?: number };
export type PassoCursor = { f: number; alvo: string; clique?: boolean; dx?: number; dy?: number; mover?: number };
export type Destaque = { alvo: string; de: number; ate: number; margem?: number };

type Props = {
    children: React.ReactNode;
    camara?: Camara[];
    cursor?: PassoCursor[];
    destaques?: Destaque[];
    sobre?: React.ReactNode; // camada fixa por cima do portal (notas, avisos)
};

// Janela do browser com o portal lá dentro, câmara com zoom, cursor e destaques
export const Palco: React.FC<Props> = ({ children, camara = [], cursor = [], destaques = [], sobre }) => {
    const frame = useCurrentFrame();
    const raiz = useRef<HTMLDivElement>(null);
    const [medidas, setMedidas] = useState<{ pos: Record<string, Ret>; w: number; h: number }>({ pos: {}, w: VW, h: VH });

    const alvos = [...new Set([
        ...camara.map(c => c.alvo), ...cursor.map(c => c.alvo), ...destaques.map(d => d.alvo)
    ].filter(Boolean) as string[])];

    useLayoutEffect(() => {
        const r = raiz.current;
        if (!r) return;
        const pos: Record<string, Ret> = {};
        alvos.forEach(a => {
            const el = r.querySelector(sel(a)) as HTMLElement | null;
            if (el) pos[a] = medir(el, r);
        });
        const novo = { pos, w: r.offsetWidth, h: Math.max(r.offsetHeight, VH) };
        if (JSON.stringify(novo) !== JSON.stringify(medidas)) setMedidas(novo);
    });

    const { pos, w: W, h: H } = medidas;

    // --- Câmara: centro (cx, cy) e zoom z, a transitar entre posições ---
    const valorCamara = (c: Camara) => {
        const z = c.z ?? 1;
        let cx = VW / 2, cy = VH / 2;
        const p = c.alvo ? pos[c.alvo] : undefined;
        if (p) {
            cx = p.x + p.w / 2 + (c.dx ?? 0);
            cy = (c.topo ? p.y + VH / z / 2 - 20 : p.y + p.h / 2) + (c.dy ?? 0);
        }
        const meiaL = VW / z / 2, meiaA = VH / z / 2;
        cx = W <= meiaL * 2 ? W / 2 : Math.min(Math.max(cx, meiaL), W - meiaL);
        cy = H <= meiaA * 2 ? meiaA : Math.min(Math.max(cy, meiaA), H - meiaA);
        return { cx, cy, z };
    };
    // Cada posição transita a partir da posição final da anterior
    let cam = { cx: VW / 2, cy: VH / 2, z: 1 };
    let anterior = cam;
    for (let i = 0; i < camara.length; i++) {
        const c = camara[i];
        if (frame < c.f) break;
        const alvo = valorCamara(c);
        const de = i === 0 ? alvo : anterior;
        const p = prog(frame, c.f, c.dur ?? 24);
        cam = { cx: de.cx + (alvo.cx - de.cx) * p, cy: de.cy + (alvo.cy - de.cy) * p, z: de.z + (alvo.z - de.z) * p };
        anterior = alvo;
    }

    // --- Cursor ---
    const centro = (p: PassoCursor) => {
        const r = pos[p.alvo];
        return r ? { x: r.x + Math.min(r.w / 2, 60) + (p.dx ?? 0), y: r.y + r.h / 2 + (p.dy ?? 0) } : null;
    };
    let cur: { x: number; y: number } | null = null;
    let opCursor = 0;
    let clique = 0;
    for (let i = 0; i < cursor.length; i++) {
        const p = cursor[i];
        const mover = p.mover ?? 18;
        if (frame < p.f - mover) break;
        const destino = centro(p);
        const origem = i > 0 ? centro(cursor[i - 1]) : null;
        if (!destino) { cur = null; continue; }
        const inicio = origem ?? { x: destino.x + 90, y: destino.y + 70 };
        const k = prog(frame, p.f - mover, mover);
        cur = { x: inicio.x + (destino.x - inicio.x) * k, y: inicio.y + (destino.y - inicio.y) * k };
        opCursor = origem ? 1 : k;
        clique = p.clique ? frame - p.f : -1;
    }

    return (
        <div style={{
            position: 'absolute', left: MOLDURA.x, top: MOLDURA.y, width: MOLDURA.w, height: MOLDURA.h,
            borderRadius: 14, overflow: 'hidden', background: '#fff',
            boxShadow: '0 30px 70px rgba(74,37,17,0.28), 0 0 0 1px rgba(74,37,17,0.12)'
        }}>
            <BarraBrowser />
            <div style={{ position: 'absolute', top: BARRA, left: 0, width: VW, height: VH, transform: `scale(${ESCALA})`, transformOrigin: '0 0', overflow: 'hidden', background: CORES.creme }}>
                <div ref={raiz} style={{
                    position: 'relative', width: VW, transformOrigin: '0 0',
                    transform: `scale(${cam.z}) translate(${VW / cam.z / 2 - cam.cx}px, ${VH / cam.z / 2 - cam.cy}px)`
                }}>
                    {children}
                    {destaques.map((d, i) => {
                        const r = pos[d.alvo];
                        if (!r) return null;
                        const op = interpolate(frame, [d.de, d.de + 8, d.ate - 8, d.ate], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
                        if (op <= 0) return null;
                        const m = d.margem ?? 6;
                        const pulso = 0.5 + 0.5 * Math.sin((frame - d.de) / 5);
                        return (
                            <div key={i} style={{
                                position: 'absolute', left: r.x - m, top: r.y - m, width: r.w + m * 2, height: r.h + m * 2,
                                border: `${3 / cam.z}px solid ${CORES.laranja}`, borderRadius: 8, opacity: op, pointerEvents: 'none',
                                boxShadow: `0 0 ${(10 + 10 * pulso) / cam.z}px rgba(230,126,34,${0.35 + 0.3 * pulso})`
                            }} />
                        );
                    })}
                    {cur && (
                        <div style={{ position: 'absolute', left: cur.x, top: cur.y, transform: `scale(${1 / cam.z})`, transformOrigin: '0 0', opacity: opCursor, zIndex: 50 }}>
                            {clique >= 0 && clique < 14 && (
                                <div style={{
                                    position: 'absolute', left: -22, top: -22, width: 44, height: 44, borderRadius: '50%',
                                    border: `3px solid ${CORES.laranja}`, opacity: 1 - clique / 14, transform: `scale(${0.4 + clique / 10})`
                                }} />
                            )}
                            <svg width="30" height="36" viewBox="0 0 30 36" style={{ transform: `scale(${clique >= 0 && clique < 5 ? 0.85 : 1})`, transformOrigin: '0 0', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.35))' }}>
                                <path d="M2 2 L2 28 L9 21 L14 33 L19 31 L14 19 L24 19 Z" fill="#fff" stroke="#222" strokeWidth="2" strokeLinejoin="round" />
                            </svg>
                        </div>
                    )}
                </div>
                {sobre}
            </div>
        </div>
    );
};

const BarraBrowser: React.FC = () => (
    <div style={{ height: BARRA, background: '#EFE6DC', display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', borderBottom: '1px solid #E0D2C3' }}>
        {['#E0675B', '#E9B44C', '#6DBE6A'].map(c => <div key={c} style={{ width: 13, height: 13, borderRadius: '50%', background: c }} />)}
        <div style={{
            marginLeft: 18, flex: 1, maxWidth: 620, height: 28, borderRadius: 14, background: '#fff', display: 'flex', alignItems: 'center',
            gap: 8, padding: '0 14px', fontFamily: 'Segoe UI, sans-serif', fontSize: 15, color: '#6b5a4c'
        }}>
            <span style={{ fontSize: 13 }}>🔒</span> Bordaveiro · Portal do Cliente
        </div>
    </div>
);

// Nota explicativa por cima do portal (canto inferior direito)
export const Nota: React.FC<{ de: number; ate?: number; titulo: string; texto?: React.ReactNode; icone?: string; cor?: string; posicao?: 'direita' | 'esquerda' }> =
    ({ de, ate = 1e9, titulo, texto, icone = '💡', cor = CORES.castanho, posicao = 'direita' }) => {
        const frame = useCurrentFrame();
        const op = interpolate(frame, [de, de + 10, ate - 10, ate], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        if (op <= 0) return null;
        const desloc = (1 - prog(frame, de, 14)) * 30;
        return (
            <div style={{
                position: 'absolute', bottom: 16, [posicao === 'direita' ? 'right' : 'left']: 16, width: 380, opacity: op,
                transform: `translateY(${desloc}px)`, background: '#fff', borderRadius: 10, borderLeft: `6px solid ${cor}`,
                boxShadow: '0 12px 30px rgba(0,0,0,0.18)', padding: '16px 18px', fontFamily: 'Segoe UI, sans-serif', zIndex: 60
            }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontWeight: 700, fontSize: 20, color: CORES.escuro }}>
                    <span style={{ fontSize: 24 }}>{icone}</span>{titulo}
                </div>
                {texto && <div style={{ marginTop: 8, fontSize: 17, color: '#444', lineHeight: 1.45 }}>{texto}</div>}
            </div>
        );
    };

// Fundo, título, legendas, áudio e transição de cada cena
export const CenaBase: React.FC<{ id: string; children: React.ReactNode; semTitulo?: boolean }> = ({ id, children, semTitulo }) => {
    const frame = useCurrentFrame();
    const c = cena(id);
    const op = interpolate(frame, [0, 12, c.duracao - 12, c.duracao], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    const fala = c.falas.find(f => frame >= f.inicio - 4 && frame < f.inicio + f.dur + 10);

    return (
        <AbsoluteFill style={{ background: 'linear-gradient(160deg, #F7EFE6 0%, #EADBCB 100%)', fontFamily: 'Segoe UI, sans-serif' }}>
            <Img src={staticFile('logo.png')} style={{ position: 'absolute', right: -120, bottom: -160, width: 760, opacity: 0.05, mixBlendMode: 'multiply' }} />
            {c.falas.map(f => (
                <Sequence key={f.id} from={f.inicio} durationInFrames={f.dur + 5}>
                    <Audio src={staticFile(`audio/${f.id}.wav`)} />
                </Sequence>
            ))}
            <AbsoluteFill style={{ opacity: op }}>
                {!semTitulo && (
                    <div style={{ position: 'absolute', top: 22, left: MOLDURA.x, right: MOLDURA.x, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                            <div style={{ background: CORES.castanho, color: '#fff', fontWeight: 700, fontSize: 24, padding: '8px 20px', borderRadius: 30 }}>{c.titulo}</div>
                        </div>
                        <div style={{ color: CORES.escuro, fontSize: 20, opacity: 0.8 }}>Conta de exemplo: <b>TESTE</b></div>
                    </div>
                )}
                {children}
                {fala && <Legenda texto={fala.texto} frame={frame - fala.inicio} />}
            </AbsoluteFill>
        </AbsoluteFill>
    );
};

const Legenda: React.FC<{ texto: string; frame: number }> = ({ texto, frame }) => {
    const op = interpolate(frame, [-4, 4], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    return (
        <div style={{ position: 'absolute', left: 0, right: 0, top: MOLDURA.y + MOLDURA.h + 16, bottom: 14, display: 'flex', justifyContent: 'center', alignItems: 'center', opacity: op }}>
            <div style={{
                maxWidth: 1640, background: 'rgba(74,37,17,0.92)', color: '#fff', fontSize: 30, lineHeight: 1.3,
                padding: '10px 26px', borderRadius: 12, textAlign: 'center', fontWeight: 500
            }}>{texto}</div>
        </div>
    );
};
