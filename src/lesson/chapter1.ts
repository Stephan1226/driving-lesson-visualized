import type { SectionInfo } from '../ui/Overlay';
import type { Step } from './types';
import { exteriorSteps } from './steps/exterior';
import { garageSteps } from './steps/garage';
import { controlSteps } from './steps/controls';
import { gearSteps } from './steps/gears';
import { finalSteps } from './steps/final';

export const SECTIONS: SectionInfo[] = [
  { title: '차 밖에서 점검하기', place: '공원 주차장' },
  { title: '기둥 옆 주차와 출차', place: '아파트 지하 주차장' },
  { title: '탑승 후 기본 조작', place: '운전석' },
  { title: '기어 · 파킹 브레이크 · 오토홀드', place: '운전석' },
  { title: '경고등 · 미러 · 시트 맞추기', place: '운전석' },
];

export const STEPS: Step[] = [...exteriorSteps, ...garageSteps, ...controlSteps, ...gearSteps, ...finalSteps];
