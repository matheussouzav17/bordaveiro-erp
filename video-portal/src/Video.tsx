import React from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import { CENAS } from './tempo';
import { Alterar, Cancelar, Entrar, Estados, FazerPedido, Fim, Filtro, Intro, NovaData, Recuperar, Senha } from './cenas';

const COMPONENTES: Record<string, React.FC> = {
    intro: Intro, login: Entrar, senha: Senha, pedido: FazerPedido, estados: Estados, cancelar: Cancelar,
    novadata: NovaData, alterar: Alterar, filtro: Filtro, recuperar: Recuperar, fim: Fim
};

export const TutorialPortal: React.FC = () => {
    let inicio = 0;
    return (
        <AbsoluteFill style={{ background: '#F7EFE6' }}>
            {CENAS.map(c => {
                const Cena = COMPONENTES[c.cena];
                const de = inicio;
                inicio += c.duracao;
                return (
                    <Sequence key={c.cena} from={de} durationInFrames={c.duracao} name={c.titulo}>
                        <Cena />
                    </Sequence>
                );
            })}
        </AbsoluteFill>
    );
};
