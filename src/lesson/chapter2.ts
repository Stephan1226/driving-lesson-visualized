import type { Chapter } from './types';
import { departSteps } from './steps/depart';
import { exitSteps } from './steps/exit';
import { signalSteps } from './steps/signals';
import { turnSteps } from './steps/turns';
import { rightTurnSteps } from './steps/rightturn';
import { roundaboutSteps } from './steps/roundabout';

export const chapter2: Chapter = {
  no: 2,
  title: '도로 주행 기본',
  intro: '주차장·건물에서 나와 도로에 들어서는 것부터 신호등, 좌회전·유턴, 교차로 우회전, 회전교차로까지. 실제 도로에서 헷갈리기 쉬운 순간을 장면마다 보면서 익혀요.',
  sections: [
    { title: '주차장에서 도로로', place: '공원 주차장 → 앞 도로' },
    { title: '건물·골목에서 나와 차도로', place: '시내 · 건물 출구 · 골목 교차로' },
    { title: '신호등과 정지선', place: '시내 도로 · 교차로' },
    { title: '좌회전과 유턴', place: '시내 교차로' },
    { title: '교차로 우회전', place: '시내 교차로' },
    { title: '회전교차로와 깜빡이', place: '회전교차로 · 교차로' },
  ],
  steps: [...departSteps, ...exitSteps, ...signalSteps, ...turnSteps, ...rightTurnSteps, ...roundaboutSteps],
};
