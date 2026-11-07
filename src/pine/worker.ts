import { compile, RuntimeSession, type Bar, type PineMarket } from './runtime';
let source = '';
let session:RuntimeSession | undefined;
self.onmessage = (event: MessageEvent<{source:string;bars?:Bar[];inputs?:Record<string,number|string|boolean>;revision?:number;isLive?:boolean;market?:PineMarket}>) => {
  try {
    if (!session || source !== event.data.source) {
      source=event.data.source;
      session=new RuntimeSession(compile(source));
    }
    const {bars,inputs,isLive,market,revision}=event.data;
    const program=session.program;
    const requests=[...program.requests.values()].map(({timeframe,limit})=>({timeframe,limit}));
    const result=bars ? session.run(bars,inputs,isLive,market) : {meta:program.meta,inputs:program.inputs,requests,needsMintick:program.needsMintick};
    self.postMessage({ok:true,revision,result});
  } catch (error) {
    self.postMessage({ok:false,revision:event.data.revision,error:error instanceof Error ? error.message : String(error)});
  }
};
