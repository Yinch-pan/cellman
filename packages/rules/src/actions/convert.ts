import type {GameAction,GameState,Player} from '../types';
import {integer,pay,requireRule,gainScholar} from '../internal';
import {spendPower} from './power';
export function convert(s:GameState,p:Player,a:Extract<GameAction,{kind:'convert'}>){integer(a.count,1);const n=a.count;
 if(a.from==='power'){const cost={coin:1,tool:3,scholar:5,book:5}[a.to];requireRule(cost,'INVALID_CONVERSION');if(a.to==='book')requireRule(Number.isInteger(a.color)&&a.color!>=0&&a.color!<4,'INVALID_COLOR');spendPower(p,cost*n);if(a.to==='coin')p.resources.coins+=n;if(a.to==='tool')p.resources.tools+=n;if(a.to==='scholar')gainScholar(s,p,n);if(a.to==='book')p.resources.books[a.color!]+=n;return;}
 if(a.from==='scholar'&&a.to==='tool'){pay(p,{scholars:n});p.resources.tools+=n;return;}
 if(a.from==='tool'&&a.to==='coin'){pay(p,{tools:n});p.resources.coins+=n;return;}
 if(a.from==='book'&&a.to==='coin'){requireRule(Number.isInteger(a.color)&&a.color!>=0&&a.color!<4,'INVALID_COLOR');requireRule(p.resources.books[a.color!]>=n,'INSUFFICIENT_RESOURCES');p.resources.books[a.color!]-=n;p.resources.coins+=n;return;}
 requireRule(false,'INVALID_CONVERSION');
}
