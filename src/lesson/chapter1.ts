import type { Chapter } from './types';
import { exteriorSteps } from './steps/exterior';
import { garageSteps } from './steps/garage';
import { controlSteps } from './steps/controls';
import { gearSteps } from './steps/gears';
import { finalSteps } from './steps/final';

export const chapter1: Chapter = {
  no: 1,
  title: '주행 전 확인 사항',
  intro: '운전을 처음 배우는 분을 위한 3D 애니메이션 강의입니다. 차에 타기 전 점검부터 출발 직전 자세 잡기까지, 장면마다 직접 보면서 익혀요.',
  sections: [
    { title: '차 밖에서 점검하기', place: '공원 주차장' },
    { title: '기둥 옆 주차와 출차', place: '아파트 지하 주차장' },
    { title: '탑승 후 기본 조작', place: '운전석' },
    { title: '기어 · 파킹 브레이크 · 오토홀드', place: '운전석' },
    { title: '경고등 · 미러 · 시트 맞추기', place: '운전석' },
  ],
  steps: [...exteriorSteps, ...garageSteps, ...controlSteps, ...gearSteps, ...finalSteps],
};
