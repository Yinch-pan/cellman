import {createGame} from '../../src/state';
import {sampleSetup} from './setup';
export function actionState(){const s=createGame(sampleSetup());s.phase='actions';s.board.buildings={A1:{seat:'p1',kind:'workshop'},B1:{seat:'p2',kind:'guild'},A6:{seat:'p3',kind:'workshop'}};return s;}
