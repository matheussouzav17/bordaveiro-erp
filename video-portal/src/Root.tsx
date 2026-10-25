import React from 'react';
import { Composition } from 'remotion';
import { TutorialPortal } from './Video';
import { DURACAO_TOTAL, FPS } from './tempo';

export const Root: React.FC = () => (
    <Composition id="TutorialPortal" component={TutorialPortal} durationInFrames={DURACAO_TOTAL} fps={FPS} width={1920} height={1080} />
);
