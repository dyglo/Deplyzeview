import { compile, RuntimeSession, type Bar } from './runtime';
let source = '';
let session:RuntimeSession | undefined;
self.onmessage = (event: MessageEvent<{source:string;bars?:Bar[];inputs?:Record<string,number|string|boolean>;revision?:number;isLive?:boolean}>) => {
  try {
    if (!session || source !== event.data.source) {
      source=event.data.source;
      session=new RuntimeSession(compile(source));
    }
    self.postMessage({ok:true,revision:event.data.revision,result:event.data.bars ? session.run(event.data.bars,event.data.inputs,event.data.isLive) : {meta:session.program.meta,inputs:session.program.inputs}});
  } catch (error) {
    self.postMessage({ok:false,revision:event.data.revision,error:error instanceof Error ? error.message : String(error)});
  }
};
