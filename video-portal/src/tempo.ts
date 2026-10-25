import narracao from './narracao.json';
import duracoes from './duracoes.json';

export const FPS = 30;
const ANTES = 20;  // frames antes da primeira fala de cada cena
const PAUSA = 12;  // frames entre falas
const DEPOIS = 30; // frames depois da última fala

export type Fala = { id: string; texto: string; inicio: number; dur: number };
export type Cena = { cena: string; titulo: string; falas: Fala[]; duracao: number };

const dur = duracoes as Record<string, number>;

// Cada fala começa quando a anterior acaba; sem áudio gerado, estima pela extensão do texto
export const CENAS: Cena[] = narracao.map(c => {
    let t = ANTES;
    const falas = c.falas.map(f => {
        const frames = Math.ceil((dur[f.id] ?? f.texto.length / 14) * FPS);
        const fala = { ...f, inicio: t, dur: frames };
        t += frames + PAUSA;
        return fala;
    });
    return { ...c, falas, duracao: t - PAUSA + DEPOIS };
});

export const DURACAO_TOTAL = CENAS.reduce((s, c) => s + c.duracao, 0);

export const cena = (id: string) => CENAS.find(c => c.cena === id)!;

// t(n, s): frame (relativo à cena) em que começa a fala n (1, 2, ...), mais s segundos
export const tempos = (id: string) => {
    const c = cena(id);
    return (n: number, s = 0) => c.falas[n - 1].inicio + Math.round(s * FPS);
};

// Texto a ser escrito: aparece um carácter a cada `ritmo` frames a partir de `inicio`
export const escrever = (texto: string, frame: number, inicio: number, ritmo = 2) =>
    frame < inicio ? '' : texto.slice(0, Math.floor((frame - inicio) / ritmo) + 1);

export const pontos = (n: number, frame: number, inicio: number, ritmo = 3) =>
    '•'.repeat(escrever('x'.repeat(n), frame, inicio, ritmo).length);
