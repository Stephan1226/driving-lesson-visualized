import type { Chapter } from './types';
import { departSteps } from './steps/depart';

export const chapter2: Chapter = {
  no: 2,
  title: '주차장을 나와 도로로',
  intro: '주행 전 확인을 마친 그 차로 이제 실제로 움직여 봅니다. 공원 주차장을 빠져나와 도로에 들어서기까지, 장면마다 직접 보면서 익혀요.',
  sections: [{ title: '주차장에서 도로로', place: '공원 주차장 → 앞 도로' }],
  steps: [...departSteps],
};
