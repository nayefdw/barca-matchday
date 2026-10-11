import {DurableObject} from 'cloudflare:workers';
import worker from './index.js';
import {SchedulerCore} from './scheduler-core.js';
export class MatchScheduler extends DurableObject{
 constructor(ctx,env){super(ctx,env);this.scheduler=new SchedulerCore(ctx,env);}
 fetch(request){return this.scheduler.fetch(request);}
 alarm(){return this.scheduler.alarm();}
}
export default worker;
