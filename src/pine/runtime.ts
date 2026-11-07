import { tokenize, type Token } from './lexer.ts';

export type PineDrawing = { __pineDrawing:true; kind:'line'|'box'|'label'; id:string; deleted:boolean; fields:Map<string,Value> };
export type PineTableCell = {text?:string;textColor?:string;bgColor?:string;hAlign:'left'|'center'|'right';vAlign:'top'|'center'|'bottom';textSize:string|number;fontFamily:'default'|'monospace';tooltip?:string;bold:boolean;italic:boolean;width?:number;height?:number};
export type PineTable = {__pineTable:true;id:string;deleted:boolean;position:string;columns:number;rows:number;bgColor?:string;frameColor?:string;frameWidth:number;borderColor?:string;borderWidth:number;cells:Array<Array<PineTableCell|null>>;merges:never[];overlay?:boolean};
export type Value = number | boolean | string | null | Map<string, Value> | Value[] | PineDrawing | PineTable;
type Field = {name:string; type:string; annotation:string; initial?:Expr};
type PineFunction = {params:Array<{name:string;type:string;annotation?:string;immutable:boolean;defaultValue?:Expr}>; body:Statement[]; checkedBody:boolean};
export type Bar = { time: number; open: number; high: number; low: number; close: number; volume?: number };
type Expr = { token: Token; op: string; value?: Value; args: Expr[]; names?: (string | undefined)[]; constant?: Value; type?: string; id: number; inputKey?:string; branches?: SwitchBranch[]; checkedBody?: Statement[]; series?: boolean; integer?: boolean; color?: boolean; annotation?:string };
type SwitchBranch = { token: Token; test?: Expr; body: Statement[] };
type Statement = { token: Token; kind: 'declare' | 'assign' | 'expression' | 'if' | 'for-range' | 'for-each' | 'while' | 'break' | 'continue'; name?: string; persistent?: boolean; immutable?: boolean; annotation?: string; expr: Expr; yes?: Statement[]; no?: Statement[]; loopNames?: string[]; end?: Expr; step?: Expr; body?: Statement[] };
export type Plot = { kind: string; expr: Expr; args?:Expr[]; title: string; color: string; width: number; shape: string; location: string; dataWindowOnly?:boolean };
export interface Program {
  statements: Statement[];
  meta: { title: string; shorttitle?: string; overlay: boolean };
  plots: Plot[];
  records: Map<string, Field[]>;
  functions: Map<string,PineFunction>;
  historyNames: Set<string>;
  requests: Map<number,SecurityRequest>;
  needsMintick:boolean;
  drawingLimits: Partial<Record<string, number>>;
  inputs:Array<{key:string;title:string;type:'bool'|'int'|'float'|'string';defval:number|string|boolean;min?:number;max?:number;step?:number;options?:string[];group?:string;inline?:string;tooltip?:string}>;
}
type SecurityRequest = { timeframe:string; lookahead:boolean; gaps:boolean; limit:number; expression:Expr; globals?:Statement[] };
export type PineMarket = { symbol:string; timeframe:string; mintick?:number; background?:string; standard?:boolean; series?:Record<string,Bar[]>; seriesErrors?:Record<string,string> };
export type DrawModel = Record<string,unknown> & {id:string};
export type TableModel = {id:string;paneId:string;position:string;columns:number;rows:number;bgColor?:string;frameColor?:string;frameWidth:number;borderColor?:string;borderWidth:number;cells:Array<Array<PineTableCell|null>>;merges:never[];overlay?:boolean};
export class ScriptError extends Error {
  readonly stage:'compile'|'runtime';
  readonly line:number;
  readonly column:number;
  constructor(message: string, token: Token, stage:'compile'|'runtime'='compile') {
    super(`Pine v5 ${stage} error (line ${token.start.line}, column ${token.start.column}): ${message}`);
    this.name='ScriptError';this.stage=stage;this.line=token.start.line;this.column=token.start.column;
  }
}
class LoopControl { readonly kind:'break'|'continue'; constructor(kind:'break'|'continue'){this.kind=kind;} }
const colors: Record<string, string> = { aqua:'#00BCD4', black:'#363A45', blue:'#2196F3', fuchsia:'#E040FB', gray:'#787B86', green:'#4CAF50', lime:'#00E676', maroon:'#880E4F', navy:'#311B92', olive:'#808000', orange:'#FF9800', purple:'#9C27B0', red:'#F23645', silver:'#B2B5BE', teal:'#089981', white:'#FFFFFF', yellow:'#FDD835' };
const constants: Record<string, Value> = { true:true, false:false, na:null, 'shape.triangleup':'triangleUp', 'shape.triangledown':'triangleDown', 'location.abovebar':'aboveBar', 'location.belowbar':'belowBar', 'size.tiny':'tiny','size.small':'small','size.normal':'normal','xloc.bar_time':'bar_time','xloc.bar_index':'bar_index','extend.right':'right','extend.left':'left','extend.both':'both','extend.none':'none','line.style_dashed':'dashed','line.style_solid':'solid','label.style_label_up':'label_up','label.style_label_down':'label_down','label.style_label_left':'label_left','label.style_label_right':'label_right','position.top_left':'top_left','position.top_center':'top_center','position.top_right':'top_right','position.middle_left':'middle_left','position.middle_center':'middle_center','position.middle_right':'middle_right','position.bottom_left':'bottom_left','position.bottom_center':'bottom_center','position.bottom_right':'bottom_right','text.align_left':'left','text.align_center':'center','text.align_right':'right','text.align_top':'top','text.align_bottom':'bottom', ...Object.fromEntries(Object.entries(colors).map(([k,v]) => ['color.'+k,v])) };
const signatures: Record<string, string[]> = {
  input:['defval','title','tooltip','inline','group'], 'input.bool':['defval','title','tooltip','inline','group'], 'input.int':['defval','title','minval','maxval','step','tooltip','inline','group'], 'input.float':['defval','title','minval','maxval','step','tooltip','inline','group'], 'input.string':['defval','title','options','tooltip','inline','group'], 'color.new':['color','transp'], color:['value'],
  'table.new':['position','columns','rows','bgcolor','frame_color','frame_width','border_color','border_width','force_overlay'],'table.cell':['table_id','column','row','text','width','height','text_color','bgcolor','text_halign','text_valign','text_size','tooltip','text_font_family','text_formatting'],'table.clear':['table_id','start_column','start_row','end_column','end_row'],'table.delete':['table_id'],
  'chart.point.new':['time','index','price'], 'box.new':['left','top','right','bottom','border_color','border_width','border_style','extend','xloc','bgcolor','text','text_color','text_size','text_halign','text_valign'], 'line.new':['x1','y1','x2','y2','xloc','extend','color','style','width'], 'label.new':['x','y','text','xloc','yloc','color','style','textcolor','size','textalign','tooltip'],
  indicator:['title','shorttitle','overlay','max_labels_count','max_lines_count','max_boxes_count','max_bars_back'], plot:['series','title','color','linewidth','display'], hline:['price','title','color'], plotcandle:['open','high','low','close','title','color','wickcolor','editable','show_last','bordercolor'], alertcondition:['condition','title','message'],
  'request.security':['symbol','timeframe','expression','gaps','lookahead','calc_bars_count'],
  'runtime.error':['message'], alert:['message','freq'], 'str.tostring':['value','format'], 'str.length':['string'],
  'timeframe.in_seconds':['timeframe'], 'color.r':['color'], 'color.g':['color'], 'color.b':['color'],
  plotshape:['series','title','style','location','color'], 'ta.sma':['source','length'], 'ta.ema':['source','length'],
  'ta.rsi':['source','length'], 'ta.stdev':['source','length','biased'], 'ta.atr':['length'], 'ta.highest':['source','length'], 'ta.lowest':['source','length'], 'ta.change':['source'], 'ta.cum':['source'], 'ta.crossover':['source1','source2'], 'ta.crossunder':['source1','source2'], 'ta.tr':['handle_na'], na:['x'], nz:['source','replacement']
};
const precedence: Record<string, number> = { or:1, and:2, '==':3, '!=':3, '<':4, '>':4, '<=':4, '>=':4, '+':5, '-':5, '*':6, '/':6, '%':6 };
const assignments=[':=','+=','-=','*=','/=','%='];
const scalarAnnotations=['float','int','bool','string','color','line','label','box','table'];
const arrayMethodPattern=/^(.*)\.(push|unshift|pop|shift|get|set|size|remove|clear|indexof|max|min|slice|includes|copy|join|concat|sort|sort_indices|percentile_nearest_rank)$/;
Object.assign(constants,{
  'line.style_dotted':'dotted','order.ascending':'ascending','order.descending':'descending',
  'barmerge.lookahead_off':'lookahead_off','barmerge.lookahead_on':'lookahead_on',
  'barmerge.gaps_off':'gaps_off','barmerge.gaps_on':'gaps_on','format.mintick':'mintick',
  'display.all':'all','display.data_window':'data_window',
  'alert.freq_all':'all','alert.freq_once_per_bar':'once_per_bar','alert.freq_once_per_bar_close':'once_per_bar_close',
});
const mathFunctions = new Map<string, (...values:number[])=>number>([
  ['math.abs',Math.abs], ['math.max',Math.max], ['math.min',Math.min],
  ['math.avg',(...values)=>values.reduce((sum,value)=>sum+value,0)/values.length],
  ['math.round',Math.round], ['math.log',Math.log], ['math.log10',Math.log10], ['math.sqrt',Math.sqrt],
  ['math.floor',Math.floor], ['math.ceil',Math.ceil], ['math.pow',Math.pow], ['math.exp',Math.exp], ['math.sign',Math.sign],
]);
export function compile(source: string): Program {
  const tokens = tokenize(source);
  const fail = (message: string, token = tokens[position]) : never => { throw new ScriptError(message, token); };
  const versionDirectives=source.match(/^\s*\/\/@version\s*=\s*\d+\s*$/gm)??[];
  if(versionDirectives.length>1)throw new ScriptError('Pine source must contain only one version directive.',tokens[0]);
  const versionMatch=/^\s*\/\/@version\s*=\s*(\d+)\s*$/m.exec(source);
  if(!versionMatch)throw new ScriptError('This editor requires an explicit //@version=5 directive. TradingView treats an omitted version as v1; that is a version-support limitation, not a Pine syntax error.',tokens[0]);
  if(versionMatch[1]!=='5')throw new ScriptError(`This editor supports Pine v5 only; the script declares v${versionMatch[1]}. The declared version is not itself invalid Pine.`,tokens[0]);
  let position = 0, nextId = 0, depth = 0;
  const peek = () => tokens[position];
  const take = () => tokens[position++];
  const accept = (value: string) => (peek().kind==='identifier'||peek().kind==='operator') && peek().value === value && !!take();
  const expect = (value: string) => { if (!accept(value)) fail('Expected '+value); };
  function expression(min = 0): Expr {
    if (++depth > 128) fail('Expression nesting exceeds 128.');
    const token = take();
    let node!: Expr;
    if (token.kind === 'number' || token.kind === 'string' || token.kind === 'color') node = { token, op:'literal', value:token.kind === 'number' ? Number(token.value) : token.value, args:[], id:nextId++ };
    else if (['-', '+', 'not'].includes(token.value)) node = {token, op:'unary:'+token.value, args:[expression(7)], id:nextId++};
    else if (token.value === '(') { node = expression(); expect(')'); }
    else if (token.kind === 'identifier') {
      let name = token.value;
      while (accept('.')) { if (peek().kind !== 'identifier') fail('Expected namespace member.'); name += '.'+take().value; }
      let annotation:string|undefined;
      if (name === 'array.new' && peek().value==='<') annotation=readArrayType();
      node = { token, op:'name', value:name, args:[], id:nextId++ };
      if (accept('(')) {
        const args: Expr[] = [], names: (string | undefined)[] = [];
        if (!accept(')')) {
          do {
            let argumentName: string | undefined;
            if (peek().kind === 'identifier' && tokens[position+1]?.value === '=') { argumentName = take().value; take(); }
            names.push(argumentName); args.push(expression());
          } while (accept(','));
          expect(')');
        }
        node = {token, op:'call', value:name, args, names, annotation, id:nextId++};
      }
    } else if (token.value === '[') {
      const args: Expr[] = [];
      if (!accept(']')) {
        do { args.push(expression()); } while (accept(','));
        expect(']');
      }
      node = {token, op:'array-literal', args, id:nextId++};
    }
    else fail('Expected expression.', token);
    if (accept('[')) {
      node = {token, op:'history', args:[node, expression()], id:nextId++}; expect(']');
    }
    while (precedence[peek().value] !== undefined && precedence[peek().value] >= min) {
      const operator = take();
      node = { token:operator, op:operator.value, args:[node, expression(precedence[operator.value]+1)], id:nextId++ };
    }
    if (min === 0 && accept('?')) { const yes = expression(); expect(':'); node = {token, op:'ternary', args:[node, yes, expression()], id:nextId++}; }
    depth--;
    return node;
  }
  const records = new Map<string, Field[]>();
  const functions = new Map<string,PineFunction>();
  function readArrayType():string {
    expect('<');
    const element=take();
    if (!scalarAnnotations.includes(element.value)&&!records.has(element.value)) fail('Unsupported array element type.',element);
    expect('>');
    return 'array<'+element.value+'>';
  }
  function readAnnotation():string|undefined {
    if (peek().value==='array'&&tokens[position+1]?.value==='<') { take();return readArrayType(); }
    if ((scalarAnnotations.includes(peek().value)||records.has(peek().value))&&tokens[position+1]?.kind==='identifier') return take().value;
  }
  const isFunctionHeader = () => {
    if (peek().kind!=='identifier' || tokens[position+1]?.value!=='(') return false;
    let depth=0;
    for(let i=position+1;i<tokens.length;i++) {
      if(tokens[i].value==='(') depth++;
      else if(tokens[i].value===')' && --depth===0) return tokens[i+1]?.value==='=>';
    }
    return false;
  };
  let qualifiedSyntax = 0;
  function statementValue(): Expr {
    if (peek().value !== 'switch' || peek().kind !== 'identifier') return expression();
    const token = take();
    qualifiedSyntax++;
    const key = peek().kind === 'newline' ? undefined : expression();
    readIndentedBlock('switch');
    const branches: SwitchBranch[] = [];
    while (peek().kind !== 'dedent' && peek().kind !== 'eof') {
      if (peek().kind === 'newline') { take(); continue; }
      const branchToken = peek();
      if (branches.length && !branches[branches.length-1].test) fail('The default switch branch must be last.',branchToken);
      const test = peek().kind === 'operator' && peek().value === '=>' ? undefined : expression();
      expect('=>');
      let body: Statement[];
      if (peek().kind==='newline') {
        readIndentedBlock('switch branch');
        body=block(true);
      } else {
        body=[simpleStatement()];
      }
      branches.push({token:branchToken,test,body});
    }
    if (!branches.length || peek().kind !== 'dedent') fail('Expected a complete switch block.',token);
    take();
    return {token,op:'switch',args:key ? [key] : [],branches,id:nextId++};
  }
  function readIndentedBlock(context:string) {
    if (peek().kind !== 'newline') fail('Expected newline after '+context+'.');
    while (peek().kind === 'newline') take();
    if (peek().kind !== 'indent') fail('Expected indented '+context+' block.');
    take();
  }
  function block(nested = false): Statement[] {
    const statements: Statement[] = [];
    while (peek().kind !== 'eof' && peek().kind !== 'dedent') {
      if (peek().kind === 'newline') { take(); continue; }
      const token = peek();
      if(!nested&&['strategy','library'].includes(token.value)&&tokens[position+1]?.value==='(')fail('DeplyzeView currently executes indicator() scripts only. Pine strategies and libraries require features this editor does not provide; this is an editor capability limit, not a Pine syntax error.',token);
      if(token.value==='varip')fail('Pine v5 varip is valid, but this editor does not replay realtime ticks or implement intrabar rollback persistence. This is an editor execution-model limitation, not a Pine syntax error.',token);
      if(['import','export'].includes(token.value))fail(`Pine v5 supports "${token.value}", but this editor subset does not implement it yet. This is an editor capability limit, not a Pine syntax error.`,token);
      if (!nested && isFunctionHeader()) {
        const name=take().value; take();
        if(functions.has(name)) fail('Duplicate function '+name,token);
        const params:PineFunction['params']=[];
        if(!accept(')')) {
          do {
            const immutable=!!accept('const');
            const annotation=readAnnotation();
            if(immutable&&!annotation) fail('A const parameter requires an explicit type.');
            if(peek().kind!=='identifier') fail('Expected a Pine function parameter name.');
            const param=take().value;
            const defaultValue=accept('=') ? expression() : undefined;
            params.push({name:param,type:annotation ? scalarType(annotation) : 'any',annotation,immutable,defaultValue});
          } while(accept(','));
          expect(')');
        }
        expect('=>');
        const syntaxBeforeBody=qualifiedSyntax;
        let body:Statement[];
        if(peek().kind==='newline') {
          take(); while(peek().kind==='newline')take();
          if(take().kind!=='indent')fail('Expected indented function body.');
          body=block(true);
        } else {
          const expr=statementValue();
          body=[{token,kind:'expression',expr}];
        }
        functions.set(name,{params,body,checkedBody:qualifiedSyntax!==syntaxBeforeBody||params.some(param=>param.immutable)});
        continue;
      }
      if (accept('type')) {
        if (nested || peek().kind !== 'identifier') fail('Expected a top-level record name.');
        const name = take().value;
        if (records.has(name)) fail('Duplicate record type '+name);
        readIndentedBlock('record');
        const fields: Field[] = [];
        while (peek().kind !== 'dedent' && peek().kind !== 'eof') {
          if (peek().kind === 'newline') { take(); continue; }
          const fieldType = peek();
          const annotation=readAnnotation();
          if (!annotation || peek().kind !== 'identifier') fail('Expected a typed record field.',fieldType);
          const field = take();
          if (fields.some(item=>item.name===field.value)) fail('Duplicate record field.',field);
          const initial = accept('=') ? expression() : undefined;
          if (peek().kind !== 'newline') fail('Expected newline after record field.');
          fields.push({name:field.value,type:scalarType(annotation!),annotation:annotation!,initial});
        }
        if (peek().kind !== 'dedent') fail('Unclosed record declaration.');
        take(); records.set(name,fields); continue;
      }
      if (accept('if')) {
        const expr = expression();
        if (take().kind !== 'newline') fail('Expected newline after if.');
        while (peek().kind === 'newline') take();
        if (take().kind !== 'indent') fail('Expected indented block.');
        const yes = block(true);
        let no: Statement[] = [];
        if (accept('else')) {
          if (accept('if')) {
            const elseToken=tokens[position-1], condition=expression();
            if(take().kind!=='newline')fail('Expected newline after else if.');
            while(peek().kind==='newline')take();
            if(take().kind!=='indent')fail('Expected indented else-if block.');
            const branch=block(true);
            let fallback:Statement[]=[];
            if(accept('else')) {
              if(take().kind!=='newline')fail('Expected newline after else.');
              while(peek().kind==='newline')take();
              if(take().kind!=='indent')fail('Expected indented else block.');
              fallback=block(true);
            }
            no=[{token:elseToken,kind:'if',expr:condition,yes:branch,no:fallback}];
          } else {
            if (take().kind !== 'newline') fail('Expected newline after else.');
            while (peek().kind === 'newline') take();
            if (take().kind !== 'indent') fail('Expected indented else block.');
            no = block(true);
          }
        }
        statements.push({token, kind:'if', expr, yes, no}); continue;
      }
      if (accept('for')) {
        const loopNames:string[]=[];
        let kind:'for-range'|'for-each';
        let expr:Expr, end:Expr|undefined, step:Expr|undefined;
        if (accept('[')) {
          if (peek().kind!=='identifier') fail('Expected loop index name.');
          loopNames.push(take().value); expect(',');
          if (peek().kind!=='identifier') fail('Expected loop value name.');
          loopNames.push(take().value); expect(']'); expect('in');
          expr=expression(); kind='for-each';
        } else {
          if (peek().kind!=='identifier') fail('Expected loop variable name.');
          loopNames.push(take().value); expect('='); expr=expression(); expect('to'); end=expression();
          if (accept('by')) step=expression();
          kind='for-range';
        }
        if (take().kind!=='newline') fail('Expected newline after for loop.');
        while (peek().kind==='newline') take();
        if (take().kind!=='indent') fail('Expected indented loop body.');
        const body=block(true);
        statements.push({token,kind,expr,end,step,loopNames,body}); continue;
      }
      if(accept('while')) {
        const expr=expression();if(take().kind!=='newline')fail('Expected newline after while condition.');
        while(peek().kind==='newline')take();if(take().kind!=='indent')fail('Expected indented while body.');
        statements.push({token,kind:'while',expr,body:block(true)});continue;
      }
      statements.push(simpleStatement());
    }
    if (nested) { if (peek().kind !== 'dedent') fail('Unclosed block.'); take(); }
    return statements;
  }
  function simpleStatement(): Statement {
      const token=peek();
      if(accept('break')||accept('continue')) {
        if(peek().kind!=='newline')fail('Expected newline after '+token.value+'.');
        const expr:Expr={token,op:'literal',value:null,args:[],id:nextId++};
        return {token,kind:token.value as 'break'|'continue',expr};
      }
      const persistent = !!accept('var');
      const immutable = !!accept('const');
      if (immutable) qualifiedSyntax++;
      const annotation=readAnnotation();
      if (immutable && !annotation) fail('A const declaration requires an explicit type.',token);
      let statement:Statement;
      const assignmentValue=(name:string,operator:string):Expr=>{
        const right=statementValue();
        if(operator==='='||operator===':=')return right;
        const left:Expr={token,op:'name',value:name,args:[],id:nextId++};
        return {token,op:operator[0],args:[left,right],id:nextId++};
      };
      if (!immutable && peek().kind === 'identifier' && tokens[position+1]?.value === '.' && tokens[position+2]?.kind === 'identifier' && assignments.includes(tokens[position+3]?.value)) {
        const owner=take().value; take(); const field=take().value; const operator=take().value;
        const name=owner+'.'+field;
        statement={token,kind:'assign',name,expr:assignmentValue(name,operator)};
      } else if (peek().kind === 'identifier' && ['=',...assignments].includes(tokens[position+1]?.value)) {
        const name = take().value, operator = take().value;
        if (immutable && operator !== '=') fail('A const declaration requires =.',token);
        statement={token, kind:operator === '=' ? 'declare' : 'assign', name, persistent, immutable, annotation, expr:assignmentValue(name,operator)};
      } else {
        if (persistent || annotation) fail('Expected variable declaration.');
        statement={token, kind:'expression', expr:statementValue()};
      }
      if (tokens[position-1].kind!=='dedent' && peek().kind !== 'newline' && peek().kind !== 'eof') fail('Unsupported syntax or missing line break.');
      return statement;
  }
  function scalarType(type:string) { return type==='int' || type==='float' ? 'number' : type==='bool' ? 'boolean' : type==='color' ? 'string' : type; }
  const statements = block();
  if (peek().kind !== 'eof') fail('Unexpected indentation.');
  type SymbolEntry = {type:string;constant?:Value;series?:boolean;integer?:boolean;intDeclared?:boolean;color?:boolean;immutable?:boolean};
  type Conditional = boolean | 'stable-switch';
  const globalSymbols = new Map<string, SymbolEntry>();
  let symbols = globalSymbols;
  for (const name of ['open','high','low','close','volume']) symbols.set(name, {type:'number',series:true,integer:false});
  for (const name of ['time','bar_index','last_bar_time','last_bar_index']) symbols.set(name, {type:'number',series:true,integer:true});
  for (const name of ['barstate.isfirst','barstate.islast','barstate.islastconfirmedhistory','barstate.isconfirmed']) symbols.set(name,{type:'boolean',series:true});
  symbols.set('ta.tr',{type:'number',series:true});
  symbols.set('time_close',{type:'number',series:true,integer:true});
  symbols.set('syminfo.mintick',{type:'number'});
  for(const name of ['syminfo.tickerid','timeframe.period','chart.bg_color'])symbols.set(name,{type:'string',color:name==='chart.bg_color'});
  symbols.set('chart.is_standard',{type:'boolean'});
  const program: Program = {statements, plots:[], records, functions, historyNames:new Set(), requests:new Map(),needsMintick:false, meta:{title:'', overlay:false}, drawingLimits:{},inputs:[]};
  let declaration = false;
  let checkedCalls = 0;
  const activeFunctions = new Set<string>();
  const isSeries=(node:Expr):boolean=>{
    if(node.series!==undefined)return node.series;
    if(node.op==='literal')return false;
    if(node.op==='name') {
      const name=String(node.value);
      return symbols.get(name)?.series??(name.includes('.')&&!Object.prototype.hasOwnProperty.call(constants,name));
    }
    if(node.op==='history')return true;
    if(node.op==='call') {
      const name=String(node.value);
      if(name.startsWith('input'))return false;
      if(mathFunctions.has(name)||['int','float','color','color.new','na','nz'].includes(name))return node.args.some(isSeries);
      return true;
    }
    return node.args.some(isSeries);
  };
  const isInteger=(node:Expr):boolean=>{
    if(node.integer!==undefined)return node.integer;
    if(node.op==='literal')return node.value===null||(node.token.kind==='number'&&/^\d+$/.test(node.token.value));
    if(node.op==='name') {
      const value=String(node.value);
      if(Object.prototype.hasOwnProperty.call(constants,value))return typeof constants[value]==='number'&&Number.isInteger(constants[value]);
      return symbols.get(value)?.integer??false;
    }
    if(node.op==='history')return isInteger(node.args[0]);
    if(node.op==='ternary')return isInteger(node.args[1])&&isInteger(node.args[2]);
    if(node.op==='unary:+'||node.op==='unary:-')return isInteger(node.args[0]);
    if(['+','-','*','%'].includes(node.op))return node.args.every(isInteger);
    if(node.op==='call') {
      if(['math.round','math.floor','math.ceil'].includes(String(node.value)))return true;
      if(node.value==='nz')return isInteger(node.args[0])&&(!node.args[1]||isInteger(node.args[1]));
      if(node.value==='ta.change')return isInteger(node.args[0]);
      if(['math.max','math.min'].includes(String(node.value)))return node.args.every(isInteger);
      if(node.value==='input.int')return true;
      if(node.value==='input')return typeof node.args[0]?.constant==='number'&&Number.isInteger(Number(node.args[0].constant));
      return false;
    }
    return false;
  };
  function check(node: Expr, conditional:Conditional = false, loopDepth=0, valueUsed=true): string {
    const error = (message: string): never => fail(message, node.token);
    if (node.op === 'switch') {
      const key = node.args[0];
      const keyType = key && check(key,conditional);
      if (keyType && !['number','boolean','string'].includes(keyType)) error('Switch key must be a scalar value.');
      let varying = conditional === true || !!(key && (isSeries(key)||referencesAssigned(key)));
      for (const branch of node.branches!) {
        if (!branch.test) continue;
        const testType = check(branch.test,varying ? true : 'stable-switch');
        if (key ? (testType !== keyType || !!branch.test.color !== !!key.color) && !isUntypedNa(branch.test) && !isUntypedNa(key)
          : testType !== 'boolean' && testType !== 'number') {
          fail(key ? 'Switch case type must match the key type.' : 'Switch condition must be Boolean or numeric in Pine v5.',branch.test.token);
        }
        varying ||= isSeries(branch.test)||referencesAssigned(branch.test);
      }
      const results: Expr[] = [];
      for (const branch of node.branches!) {
        const outer = symbols;
        symbols = new Map(outer);
        try {
          const result = validate(branch.body,varying ? true : 'stable-switch',loopDepth,true,true);
          if (valueUsed) {
            if (!result || result.type==='void') fail('A switch branch must return a value.',branch.token);
            results.push(result!);
          }
        } finally {
          symbols = outer;
        }
      }
      if (!valueUsed) return node.type='void';
      const result = results.find(value=>!isUntypedNa(value)) ?? results[0];
      if (results.some(value=>!isUntypedNa(value) && (value.type!==result.type || !!value.color!==!!result.color))) error('Switch branches must return compatible types.');
      node.color=result.color;
      node.integer=result.type==='number'&&results.every(value=>isUntypedNa(value)||value.integer);
      node.series=varying||results.some(value=>value.series);
      if (node.args.every(arg=>arg.constant!==undefined) && node.branches!.every((branch,index)=>
        (!branch.test || branch.test.constant!==undefined) &&
        results[index].constant!==undefined &&
        branch.body.every(item=>item.expr.constant!==undefined && (item.kind==='declare'||item.kind==='expression'))
      )) {
        const index=node.branches!.findIndex(branch=>!branch.test||switchMatches(key?.constant,branch.test.constant!,key?.color));
        node.constant=index===-1 ? null : results[index].constant;
      }
      return node.type=result.type!;
    }
    if (node.op === 'literal') {
      node.constant = node.value!;
      node.color = node.token.kind === 'color';
      return node.type = typeof node.value;
    }
    if (node.op === 'name') {
      const name = String(node.value);
      if(name==='syminfo.mintick')program.needsMintick=true;
      if (Object.prototype.hasOwnProperty.call(constants, name)) { node.constant = constants[name]; node.color=name.startsWith('color.'); return node.type = node.constant === null ? 'number' : typeof node.constant; }
      const [owner, field] = name.split('.');
      if (field) {
        const member = records.get(symbols.get(owner)?.type ?? '')?.find(item=>item.name===field);
        if (member && name === owner+'.'+field) {
          node.integer=member.annotation==='int';node.color=member.annotation==='color';
          return node.type=member.type;
        }
      }
      const entry = symbols.get(name);
      if (!entry) {
        if(/^(?:ta|math|request|strategy|map|matrix|str|timeframe|syminfo|ticker|array|line|label|box|table)\./.test(name))error(`Pine namespace member "${name}" is not implemented by this editor subset. Check the v5 spelling or use a supported feature; the source may still be valid Pine.`);
        error(`Undeclared identifier "${name}". Declare it before use, or verify its spelling.`);
      }
      if (entry!.constant !== undefined) node.constant = entry!.constant;
      node.color=entry!.color;
      return node.type = entry!.type;
    }
    if (node.op === 'call') {
      const name = String(node.value);
      const arrayMethod = arrayMethodPattern.exec(name);
      if (name === 'array.new') {
        node.args.forEach(arg=>check(arg,conditional));
        return node.type=node.annotation??'array';
      }
      if(name.endsWith('.copy')) {
        const type=symbols.get(name.slice(0,-5))?.type;
        if(type&&records.has(type)&&!node.args.length)return node.type=type;
      }
      if(arrayMethod&&!['math','ta','color','table'].includes(arrayMethod[1])) {
        const receiver=arrayMethod[1]==='array' ? node.args[0] : undefined;
        node.args.forEach(arg=>check(arg,conditional));
        const arrayType=receiver?.type ?? symbols.get(arrayMethod[1])?.type;
        if(!arrayType?.startsWith('array<'))error('Array method receiver must be an array.');
        const element=arrayType!.slice(6,-1), method=arrayMethod[2];
        if(['get','pop','shift','remove','max','min'].includes(method)) {
          node.integer=element==='int';
          return node.type=scalarType(element);
        }
        if(['size','indexof'].includes(method)) {node.integer=true;return node.type='number';}
        if(method==='percentile_nearest_rank') return node.type='number';
        if(method==='includes')return node.type='boolean';
        if(method==='join')return node.type='string';
        if(method==='sort_indices')return node.type='array<int>';
        if(['copy','slice','concat'].includes(method))return node.type=arrayType!;
        return node.type='void';
      }
      const fn=functions.get(name);
      if(fn) {
        if(node.args.length>fn.params.length || node.args.length<fn.params.filter(param=>!param.defaultValue).length) error('Incorrect function argument count.');
        node.args.forEach((arg,i)=>{ const got=check(arg,conditional);if(fn.params[i].type!=='any'&&got!==fn.params[i].type)fail('Function argument type mismatch: expected '+fn.params[i].type+', received '+got+'.',arg.token); });
        {
          if(activeFunctions.has(name)) error('Recursive functions are unsupported.');
          if(activeFunctions.size>=128||++checkedCalls>10000)error('Function type checking exceeds the editor limit.');
          const outer=symbols;
          const params=fn.params.map((param,i)=>{
            const arg=node.args[i] ?? (param.defaultValue && structuredClone(param.defaultValue));
            if(arg && !node.args[i]) check(arg,conditional);
            if(param.immutable&&arg?.constant===undefined)error('A const parameter requires a compile-time constant argument.');
            if(param.annotation==='int'&&fn.checkedBody&&arg&&!isInteger(arg)&&!isUntypedNa(arg))fail('An int parameter requires an integer argument.',arg.token);
            return {
              type:param.type==='any' ? arg?.type ?? 'number' : param.type,
              series:!arg||isSeries(arg),
              integer:param.annotation==='int'||(param.annotation!=='float'&&!!arg&&isInteger(arg)),
              color:param.annotation==='color'||arg?.color,
              immutable:param.immutable,
              constant:param.immutable||param.type==='any' ? arg?.constant : undefined,
            };
          });
          symbols=new Map(globalSymbols);
          activeFunctions.add(name);
          try {
            fn.params.forEach((param,i)=>symbols.set(param.name,params[i]));
            node.checkedBody=structuredClone(fn.body);
            const result=validate(node.checkedBody,conditional || 'stable-switch',0,true,true);
            node.color=result?.color;
            node.integer=result?.integer;
            node.series=result?.series;
            if(node.checkedBody.every(item=>item.expr.constant!==undefined&&(item.kind==='declare'||item.kind==='expression')))node.constant=result?.constant;
            return node.type=result?.type ?? 'void';
          } finally {
            symbols=outer;
            activeFunctions.delete(name);
          }
        }
      }
      const math = mathFunctions.get(name);
      if(math) {
        node.args.forEach(arg=>{if(check(arg,conditional)!=='number')fail('Math functions require numeric arguments.',arg.token);});
        if(!node.args.length)error('Math functions require arguments.');
        if(node.args.every(arg=>arg.constant!==undefined))node.constant=evaluateMath(math,node.args.map(arg=>arg.constant!));
        return node.type='number';
      }
      if(name==='int'||name==='float') {
        const arg=node.args[0];
        if(node.args.length!==1||check(arg,conditional)!=='number')error(name+'() expects one numeric argument.');
        node.integer=name==='int';
        if(arg.constant!==undefined)node.constant=castNumber(name,arg.constant);
        return node.type='number';
      }
      const recordName = name.endsWith('.new') ? name.slice(0,-4) : '';
      const fields = records.get(recordName);
      if (fields) {
        const argumentsByField: Expr[] = [];
        let named = false;
        node.args.forEach((arg,index)=>{
          const key = node.names![index];
          if (key) named = true;
          const fieldIndex = key ? fields.findIndex(field=>field.name===key) : index;
          if ((!key && named) || fieldIndex < 0 || fieldIndex >= fields.length || argumentsByField[fieldIndex]) fail('Invalid constructor argument.',arg.token);
          if (check(arg,conditional)!==fields[fieldIndex].type && arg.constant!==null) fail('Constructor argument type mismatch.',arg.token);
          argumentsByField[fieldIndex]=arg;
        });
        node.args=argumentsByField;
        return node.type=recordName;
      }
      const drawingMethod=/^(.*)\.(delete|set_[a-z_]+)$/.exec(name);
      if(drawingMethod) {
        node.args.forEach(arg=>check(arg,conditional));
        const owner=drawingMethod[1];
        const receiver=['line','box','label'].includes(owner)&&drawingMethod[2]==='delete'?node.args[0]?.type:symbols.get(owner)?.type;
        if(!receiver||!['line','box','label'].includes(receiver)) error('Drawing method receiver must be a drawing object.');
        return node.type='void';
      }
      const signature = Object.prototype.hasOwnProperty.call(signatures,name) ? signatures[name] : undefined;
      if (!signature) throw new ScriptError(`Pine function "${name}" is not implemented by this editor subset. The script may be valid Pine; this message identifies a DeplyzeView capability limit, not a Pine syntax error.`,node.token);
      const ordered: Expr[] = [];
      let named = false;
      node.args.forEach((arg,i) => {
        const key = node.names![i];
        if (key) named = true; else if (named) error('Positional arguments must precede named arguments.');
        const index = key ? signature.indexOf(key) : i;
        if (index < 0 || index >= signature.length || ordered[index]) error('Unknown, duplicate or excessive argument.');
        ordered[index] = arg;
      });
      node.args = ordered;
      node.names = signature.slice();
      if (name === 'input.string') {
        const defaultValue = ordered[0];
        if (conditional || !defaultValue || check(defaultValue) !== 'string' || typeof defaultValue.constant !== 'string') {
          error('input.string requires a top-level constant string default.');
        }
        ordered.forEach((arg, index) => {
          if (index === 2) {
            if (arg.op !== 'array-literal' || !arg.args.length || arg.args.some(option => check(option) !== 'string' || typeof option.constant !== 'string')) {
              fail('Expected a nonempty list of constant string options.', arg.token);
            }
            if (!arg.args.some(option => option.constant === defaultValue.constant)) fail('Default must appear in options.', arg.token);
          } else if (index !== 0 && (check(arg) !== 'string' || typeof arg.constant !== 'string')) {
            fail('Expected a constant string for '+signature[index]+'.',arg.token);
          }
        });
        node.inputKey='';
        return node.type = 'string';
      }
      if (['input','input.bool','input.int','input.float'].includes(name)) {
        ordered.forEach(arg=>check(arg,conditional));
        const def=ordered[0];
        const expected=name==='input.int'||name==='input.float'?'number':name==='input.bool'?'boolean':def?.type;
        if(conditional||!def||!['number','boolean'].includes(String(expected))||def.constant===undefined) error('Inputs require a top-level constant default.');
        if(name==='input.int'&&(!Number.isInteger(def.constant)||typeof def.constant!=='number')) error('input.int default must be an integer.');
        if(ordered[1]&&(check(ordered[1])!=='string'||typeof ordered[1].constant!=='string')) error('Input title must be constant string.');
        node.inputKey='';
        return node.type=String(expected);
      }
      if(name==='color.new') {
        const base=ordered[0],transp=ordered[1];
        if(!base||check(base,conditional)!=='string'||!transp||check(transp,conditional)!=='number')error('color.new expects a color and transparency.');
        if(typeof base.constant==='string'&&typeof transp.constant==='number')node.constant=withTransparency(base.constant,transp.constant);
        node.color=true;
        return node.type='string';
      }
      if(name==='color') {
        const value=ordered[0];
        if(!value)error('color() requires a value.');
        check(value,conditional);
        if(value.constant===null)node.constant=null;
        else if(typeof value.constant==='string')node.constant=value.constant;
        else error('color() requires a color or na.');
        node.color=true;
        return node.type='string';
      }
      if(['line.new','box.new','label.new','chart.point.new'].includes(name)) {
        ordered.forEach(arg=>check(arg,conditional));
        return node.type=name==='line.new'?'line':name==='box.new'?'box':name==='label.new'?'label':'point';
      }
      if(name==='table.new') {
        ordered.forEach(arg=>check(arg,conditional));
        if(ordered[0]?.type!=='string'||ordered[1]?.type!=='number'||ordered[2]?.type!=='number')error('table.new requires a position, column count, and row count.');
        for(const i of [1,2,4,7])if(ordered[i]&&ordered[i].type!=='number')fail('Table dimensions and widths must be numeric.',ordered[i].token);
        return node.type='table';
      }
      if(name==='table.cell'||name==='table.clear'||name==='table.delete') {
        ordered.forEach(arg=>check(arg,conditional));
        if(ordered[0]?.type!=='table')error('Table operation requires a table handle.');
        if(name==='table.cell'&&(ordered[1]?.type!=='number'||ordered[2]?.type!=='number'||(ordered[3]&&ordered[3].type!=='string')))error('table.cell requires numeric coordinates and string text.');
        return node.type='void';
      }
      ordered.forEach((arg,index) => check(arg,name==='request.security'&&index===2?'stable-switch':conditional));
      const requireArg = (i:number, type:string, constant = false) => {
        const arg = ordered[i];
        if (!arg || arg.type !== type || (constant && arg.constant === undefined)) error('Expected '+(constant ? 'constant ' : '')+type+' argument '+signature[i]);
        return arg;
      };
      if(name==='request.security') {
        const symbol=requireArg(0,'string');
        // Secondary data is currently limited to the chart symbol.
        if(symbol.op!=='name'||symbol.value!=='syminfo.tickerid')error('request.security currently requires syminfo.tickerid.');
        const timeframe=requireArg(1,'string',true).constant;
        if(typeof timeframe!=='string'||!timeframeSeconds(timeframe))error('Unsupported request.security timeframe.');
        if(!ordered[2]||ordered[2].type==='void')error('request.security requires a value expression.');
        const gaps=ordered[3]&&requireArg(3,'string',true).constant;
        const lookahead=ordered[4]&&requireArg(4,'string',true).constant;
        const limit=ordered[5] ? requireArg(5,'number',true).constant : 10000;
        if(typeof limit!=='number'||!Number.isInteger(limit)||limit<1||limit>10000)error('calc_bars_count must be an integer from 1 to 10000.');
        program.requests.set(node.id,{timeframe:timeframe as string,expression:ordered[2],gaps:gaps==='gaps_on',lookahead:lookahead==='lookahead_on',limit:limit as number});
        node.integer=isInteger(ordered[2]);node.color=ordered[2].color;
        return node.type=ordered[2].type!;
      }
      if(name==='timeframe.in_seconds') {
        if(ordered[0])requireArg(0,'string');
        node.integer=true;
        return node.type='number';
      }
      if(['color.r','color.g','color.b'].includes(name)) {requireArg(0,'string');return node.type='number';}
      if(name==='str.length') {requireArg(0,'string');node.integer=true;return node.type='number';}
      if(name==='str.tostring') {if(!ordered[0])error('str.tostring requires a value.');return node.type='string';}
      if(name==='alert'||name==='runtime.error') {requireArg(0,'string');if(ordered[1])requireArg(1,'string');return node.type='void';}
      if (name === 'indicator') {
        if (conditional || declaration) error('Exactly one top-level indicator declaration is supported.');
        declaration = true;
        program.meta.title = String(requireArg(0,'string',true).constant);
        if (ordered[1]) program.meta.shorttitle = String(requireArg(1,'string',true).constant);
        if (ordered[2]) program.meta.overlay = Boolean(requireArg(2,'boolean',true).constant);
        for (let index = 3; index < signature.length; index++) {
          if (!ordered[index]) continue;
          const limit = requireArg(index,'number',true).constant;
          const maximum=signature[index]==='max_bars_back'?5000:500;
          if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > maximum) {
            throw new ScriptError(signature[index]+' must be an integer from 1 to '+maximum+'.', ordered[index].token);
          }
          program.drawingLimits[signature[index]] = limit;
        }
        return node.type = 'void';
      }
      if(name==='plotcandle') {
        if(conditional||!declaration)error('Plots must be top-level after indicator().');
        for(let i=0;i<4;i++)if(!ordered[i]||ordered[i].type!=='number')error('plotcandle OHLC arguments must be numeric.');
        if(program.plots.length>=16)error('At most 16 outputs are supported.');
        const title=ordered[4]&&typeof ordered[4].constant==='string'?String(ordered[4].constant):'Candles';
        const color=typeof ordered[5]?.constant==='string'?String(ordered[5].constant):'#2196F3';
        program.plots.push({kind:name,expr:node,args:ordered,title,color,width:1,shape:'',location:''});
        return node.type='void';
      }
      if(name==='alertcondition') {
        if(conditional||!declaration)error('alertcondition must be top-level after indicator().');
        if(ordered[0]?.type!=='boolean')error('alertcondition requires a boolean condition.');
        for(const i of [1,2])if(ordered[i]&&typeof ordered[i].constant!=='string')error('Alert title and message must be constant strings.');
        return node.type='void';
      }
      if (['plot','hline','plotshape'].includes(name)) {
        if (conditional || !declaration) error('Plots must be top-level after indicator().');
        requireArg(0,name === 'plotshape' ? 'boolean' : 'number',name === 'hline');
        if (program.plots.length >= 16) error('At most 16 outputs are supported.');
        const title = ordered[1] ? String(requireArg(1,'string',true).constant) : name;
        const colorIndex = name === 'plotshape' ? 4 : 2;
        const color = ordered[colorIndex] ? String(requireArg(colorIndex,'string',true).constant) : '#2196F3';
        if (!/^#[\da-f]{6}([\da-f]{2})?$/i.test(color)) error('Expected a supported constant color.');
        const width = name === 'plot' && ordered[3] ? Number(requireArg(3,'number',true).constant) : 1;
        if (!Number.isInteger(width) || width < 1 || width > 10) error('Line width must be an integer from 1 to 10.');
        const shape = name === 'plotshape' && ordered[2] ? String(requireArg(2,'string',true).constant) : 'triangleUp';
        const location = name === 'plotshape' && ordered[3] ? String(requireArg(3,'string',true).constant) : 'aboveBar';
        if (name === 'plotshape' && (!program.meta.overlay || !['triangleUp','triangleDown'].includes(shape) || !['aboveBar','belowBar'].includes(location))) error('Shapes require overlay=true and supported triangle style/location.');
        const display=name==='plot'&&ordered[4] ? requireArg(4,'string',true).constant : 'all';
        if(display!=='all'&&display!=='data_window')error('Unsupported plot display mode.');
        program.plots.push({kind:name,expr:ordered[0],title,color,width,shape,location,dataWindowOnly:display==='data_window'});
        return node.type = 'void';
      }
      if(name==='ta.tr') {
        if(ordered[0]&&ordered[0].type!=='boolean')fail('ta.tr(handle_na) expects a Boolean argument.',ordered[0].token);
        return node.type='number';
      }
      if (name.startsWith('ta.')) {
        if (conditional === true) error('Stateful TA calls must execute unconditionally.');
        if(['ta.highest','ta.lowest'].includes(name)&&node.args.length===1) {
          const length=check(node.args[0],conditional);
          if(length!=='number'||!isInteger(node.args[0]))error('Length must be an integer value.');
          return node.type='number';
        }
        if(name==='ta.stdev') {
          requireArg(0,'number');
          const lengthArg=requireArg(1,'number');
          const length=lengthArg.constant;
          if(!isInteger(ordered[1]))fail('TA length must be an int; this expression is not statically an integer.',ordered[1].token);
          if(['ta.ema','ta.rsi','ta.atr'].includes(name)&&isSeries(ordered[1]))fail(name+' requires a simple int length; a series int changes from bar to bar.',ordered[1].token);
          if(length!==undefined&&(typeof length!=='number'||!Number.isInteger(length)||length<1||length>5000))error('Length must be an integer from 1 to 5000.');
          if(ordered[2]&&ordered[2].type!=='boolean')error('ta.stdev biased argument must be Boolean.');
          return node.type='number';
        }
        for (let i=0;i<signature.length;i++) requireArg(i,'number');
        if (['ta.sma','ta.ema','ta.rsi','ta.atr','ta.highest','ta.lowest'].includes(name)) {
          const lengthArg=requireArg(signature.length-1,'number');
          const length=lengthArg.constant;
          if(!isInteger(ordered[signature.length-1]))fail('TA length must be an int; this expression is not statically an integer.',ordered[signature.length-1].token);
          if(['ta.ema','ta.rsi','ta.atr'].includes(name)&&isSeries(ordered[signature.length-1]))fail(name+' requires a simple int length; a series int changes from bar to bar.',ordered[signature.length-1].token);
          if (length!==undefined&&(typeof length !== 'number' || !Number.isInteger(length) || length < 1 || length > 5000)) error('Length must be an integer from 1 to 5000.');
        }
        return node.type = name.includes('cross') ? 'boolean' : 'number';
      }
      if(name==='na') {if(!ordered[0])error('na requires a value.');return node.type='boolean';}
      requireArg(0,'number');
      if (ordered[1]) requireArg(1,'number');
      return node.type = name === 'na' ? 'boolean' : 'number';
    }
    if (node.op === 'array-literal') error('Array literals are supported only as input options.');
    const types = node.args.map(arg => check(arg,conditional));
    if (node.op === 'history') {
      const offset = node.args[1].constant;
      if(types[1]!=='number'||(offset!==undefined&&(typeof offset!=='number'||!Number.isInteger(offset)||offset<0||offset>5000))) error('History offset must be an integer from 0 to 5000.');
      if(node.args[0].op==='name')program.historyNames.add(String(node.args[0].value));
      node.color=node.args[0].color;
      return node.type = types[0];
    }
    if (node.op === 'ternary') {
      if (types[0] !== 'boolean' || (types[1] !== types[2]&&!node.args.slice(1).some(isUntypedNa))) error('Conditional requires Boolean condition and matching branch types.');
      if (node.args.every(arg=>arg.constant!==undefined)) node.constant=node.args[node.args[0].constant ? 1 : 2].constant;
      node.color=node.args[1].color&&node.args[2].color;
      return node.type = isUntypedNa(node.args[1]) ? types[2] : types[1];
    }
    if (['==','!='].includes(node.op)) {
      if(types[0] !== types[1] || types[0] === 'void') error('Equality requires matching scalar types.');
      if(node.args.every(arg=>arg.constant!==undefined)) node.constant=operation(node.op,node.args.map(arg=>arg.constant!));
      return node.type='boolean';
    }
    if(node.op==='+' && types.every(type=>type==='string')) {
      node.type='string';
      if(node.args.every(arg=>arg.constant!==undefined)) node.constant=String(node.args[0].constant)+String(node.args[1].constant);
      return node.type;
    }
    const bool = ['and','or','unary:not'].includes(node.op);
    if (types.some(type => type !== (bool ? 'boolean' : 'number'))) error('Invalid operand type.');
    node.type = bool || ['==','!=','<','>','<=','>='].includes(node.op) ? 'boolean' : 'number';
    if (node.args.every(arg => arg.constant !== undefined)) {
      node.constant=operation(node.op,node.args.map(arg=>arg.constant!));
      if(node.op==='/'&&node.args.every(isInteger)) {
        node.integer=true;
        if(typeof node.constant==='number')node.constant=Math.trunc(node.constant);
      }
    }
    return node.type;
  }
  const isUntypedNa=(node:Expr)=>node.op==='name'&&node.value==='na';
  function validateScope(list:Statement[],conditional:Conditional,loopDepth:number,bindings?:Map<string,SymbolEntry>) {
    const outer=symbols;
    symbols=new Map(outer);
    if(bindings)for(const [name,entry] of bindings)symbols.set(name,entry);
    try {validate(list,conditional,loopDepth,false,true);}
    finally {symbols=outer;}
  }
  function validate(list: Statement[], conditional:Conditional = false, loopDepth=0, allowTail=false, localScope=false): Expr|undefined {
    const locals = new Set<string>();
    for (const [index,statement] of list.entries()) {
      const tail=allowTail&&index===list.length-1&&statement.kind==='expression';
      const type=check(statement.expr,conditional,loopDepth,tail||statement.kind!=='expression');
      if (tail) {
        statement.expr.series=isSeries(statement.expr);
        statement.expr.integer=isInteger(statement.expr);
        return statement.expr;
      }
      if(statement.kind==='break'||statement.kind==='continue') {
        if(loopDepth===0)fail(`${statement.kind} can only be used inside a loop.`,statement.token);
      } else if (statement.kind === 'for-range' || statement.kind === 'for-each') {
        const firstType=type;
        if (statement.kind==='for-range') {
          if (firstType!=='number' || !statement.end || check(statement.end,conditional)!=='number' || (statement.step && check(statement.step,conditional)!=='number')) fail('Numeric for-loop bounds and step must be numbers.',statement.token);
        } else if (!firstType.startsWith('array<')) fail('For-in loop requires an array.',statement.token);
        const bindings=new Map(statement.loopNames!.map((name,i)=>[name,{type:statement.kind==='for-range'||i===0?'number':scalarType(firstType.slice(6,-1)),series:true,integer:i===0||firstType==='array<int>'}]));
        validateScope(statement.body!,true,loopDepth+1,bindings);
      } else if(statement.kind==='while') {
        if(type!=='boolean')fail('Pine while condition must be Boolean.',statement.token);
        validateScope(statement.body!,true,loopDepth+1);
      } else if (statement.kind === 'if') {
        if (type !== 'boolean') fail('If requires a Boolean condition.', statement.token);
        validateScope(statement.yes!,true,loopDepth); validateScope(statement.no!,true,loopDepth);
      } else if (statement.kind === 'declare') {
        const name = statement.name!;
        if ((localScope ? locals.has(name) : symbols.has(name)) || Object.prototype.hasOwnProperty.call(constants,name)) fail('Duplicate or reserved variable '+name,statement.token);
        const expected = statement.annotation ? scalarType(statement.annotation) : type;
        if (type === 'void' || (type !== expected && !(type==='array'&&expected.startsWith('array<')) && statement.expr.constant !== null)) fail('Invalid declaration type. Expected '+expected+', received '+type+'.',statement.token);
        if(statement.annotation==='int'&&!isInteger(statement.expr)&&statement.expr.constant!==null)fail('Pine int declaration requires an integer expression.',statement.expr.token);
        if(statement.immutable) {
          if(['int','float','bool','string','color'].includes(statement.annotation!)&&statement.expr.constant===undefined) fail('A const declaration requires a compile-time constant initializer.',statement.expr.token);
          if(!isUntypedNa(statement.expr)&&type==='string'&&!!statement.expr.color!==(statement.annotation==='color')) fail('Invalid const declaration type.',statement.expr.token);
        }
        symbols.set(name,{type:statement.annotation ? scalarType(statement.annotation) : type,constant:statement.persistent&&!statement.immutable ? undefined : statement.expr.constant,series:isSeries(statement.expr),integer:statement.annotation==='int'?true:statement.annotation==='float'?false:isInteger(statement.expr),intDeclared:statement.annotation==='int',immutable:statement.immutable,color:statement.annotation==='color'||statement.expr.color}); locals.add(name);
        if(statement.expr.op==='call'&&String(statement.expr.value).startsWith('input')) {
          const call=statement.expr,args=call.args,kind=String(call.value);
          const get=(key:string)=>args[call.names?.indexOf(key)??-1];
          const scalar=(key:string)=>{const value=get(key)?.constant;return typeof value==='string'?value:typeof value==='number'||typeof value==='boolean'?value:undefined;};
          const title=scalar('title'),group=scalar('group'),inline=scalar('inline'),tooltip=scalar('tooltip');
          const def=args[0]?.constant;
          if(typeof def==='number'||typeof def==='string'||typeof def==='boolean') {
            const schema:Program['inputs'][number]={key:name,title:typeof title==='string'&&title?title:name,type:kind==='input.string'?'string':kind==='input.bool'||typeof def==='boolean'?'bool':kind==='input.int'?'int':'float',defval:def};
            const min=scalar('minval'),max=scalar('maxval'),step=scalar('step');
            if(typeof min==='number')schema.min=min;if(typeof max==='number')schema.max=max;if(typeof step==='number')schema.step=step;
            if(typeof group==='string')schema.group=group;if(typeof inline==='string')schema.inline=inline;if(typeof tooltip==='string')schema.tooltip=tooltip;
            const options=get('options');if(options?.op==='array-literal')schema.options=options.args.map(option=>String(option.constant));
            program.inputs.push(schema);call.inputKey=name;
          }
        }
      } else if (statement.kind === 'assign') {
        const [owner,field] = statement.name!.split('.');
        if (field) {
          const member = records.get(symbols.get(owner)?.type ?? '')?.find(item=>item.name===field);
          if (!member || (member.type!==type && statement.expr.constant!==null)) fail('Invalid record field reassignment.',statement.token);
          continue;
        }
        const entry = symbols.get(statement.name!);
        if(entry?.immutable)fail('Cannot reassign const variable '+statement.name+'.',statement.token);
        if (!entry || ['open','high','low','close','volume','time','bar_index'].includes(statement.name!) || (entry.type !== type&&!isUntypedNa(statement.expr))) fail('Invalid reassignment.',statement.token);
        entry!.constant = undefined;
        entry!.series=entry!.series||conditional===true||isSeries(statement.expr);
        if(entry!.intDeclared&&!isInteger(statement.expr))fail('Cannot assign a non-integer value to an int variable.',statement.token);
        entry!.integer=isInteger(statement.expr);
      } else if (statement.expr.op !== 'switch' && statement.expr.op !== 'call') fail('Expected declaration, assignment or supported method call.',statement.token);
    }
  }
  const assigned = new Set<string>();
  const collect = (list:Statement[]) => {
    for (const item of list) {
      if(item.kind === 'assign') assigned.add(item.name!);
      if(item.yes) collect(item.yes);
      if(item.no) collect(item.no);
      if(item.body) collect(item.body);
      for(const branch of item.expr.branches??[]) collect(branch.body);
    }
  };
  collect(statements);
  const referencesAssigned = (node:Expr):boolean => node.op === 'name' && assigned.has(String(node.value)) || node.args.some(referencesAssigned);
  for (const fields of records.values()) for (const field of fields) {
    if (field.initial && check(field.initial)!==field.type && field.initial.constant!==null) fail('Record field default type mismatch.',field.initial.token);
  }
  validate(statements);
  if(program.requests.size) {
    const declarations=new Map(statements.filter(item=>item.kind==='declare').map(item=>[item.name!,item]));
    for(const request of program.requests.values()) {
      const needed=new Set<Statement>();
      const include=(name:string,locals:Set<string>)=>{
        const item=declarations.get(name.split('.')[0]);
        if(!item||locals.has(item.name!)||needed.has(item))return;
        needed.add(item);visit(item.expr,new Set());
      };
      function visit(node:Expr,locals:Set<string>) {
        if(node.op==='name'||node.op==='call')include(String(node.value),locals);
        if(node.op==='call'&&node.value==='request.security')fail('Nested request.security expressions are unsupported.',node.token);
        node.args.forEach(arg=>visit(arg,locals));
        const fn=node.op==='call'&&functions.get(String(node.value));
        if(fn&&node.checkedBody)visitBlock(node.checkedBody,new Set(fn.params.map(param=>param.name)));
        for(const branch of node.branches??[]) {
          if(branch.test)visit(branch.test,locals);
          visitBlock(branch.body,new Set(locals));
        }
      }
      function visitBlock(list:Statement[],locals:Set<string>) {
        for(const item of list) {
          visit(item.expr,locals);
          if(item.end)visit(item.end,locals);
          if(item.step)visit(item.step,locals);
          if(item.kind==='declare')locals.add(item.name!);
          if(item.yes)visitBlock(item.yes,new Set(locals));
          if(item.no)visitBlock(item.no,new Set(locals));
          if(item.body)visitBlock(item.body,new Set([...locals,...(item.loopNames??[])]));
        }
      }
      visit(request.expression,new Set());
      request.globals=statements.filter(item=>needed.has(item));
    }
  }
  const audit = (node:Expr, persistent=false) => {
    if (node.op === 'call' && String(node.value).startsWith('ta.')) {
      if (persistent) fail('TA calls cannot be placed in a var initializer.',node.token);
      const length=node.args[node.args.length-1];
      if (length && !String(node.value).includes('cross') && referencesAssigned(length)) fail('TA lengths cannot reference reassigned variables.',node.token);
    }
    node.args.forEach(arg=>audit(arg,persistent));
    for (const branch of node.branches??[]) {
      if(branch.test) audit(branch.test,persistent);
      auditStatements(branch.body,persistent);
    }
  };
  const auditStatements = (list:Statement[],persistent=false) => {
    for(const item of list) {
      audit(item.expr,persistent||!!item.persistent);
      if(item.yes) auditStatements(item.yes,persistent);
      if(item.no) auditStatements(item.no,persistent);
      if(item.body) auditStatements(item.body,persistent);
    }
  };
  auditStatements(statements);
  if (!declaration) fail('Missing indicator() declaration.',tokens[0]);
  if (!program.plots.length) fail('At least one plot is required.',tokens[0]);
  return program;
}
function operation(op:string, values:Value[]): Value {
  const [a,b] = values;
  if (op === 'unary:not') return !a;
  if (op === 'and') return Boolean(a && b);
  if (op === 'or') return Boolean(a || b);
  if (a === null || (values.length > 1 && b === null)) return null;
  if(op==='+' && typeof a==='string' && typeof b==='string') return a+b;
  const x = Number(a), y = Number(b);
  switch (op) {
    case 'unary:-': return -x; case 'unary:+': return x;
    case '+': return x+y; case '-': return x-y; case '*': return x*y;
    case '/': return y === 0 ? null : x/y; case '%': return y === 0 ? null : x%y;
    case '>': return x>y; case '<': return x<y; case '>=': return x>=y; case '<=': return x<=y;
    case '==': return a===b; case '!=': return a!==b;
    default: throw new Error('Unsupported operator '+op);
  }
}
function switchMatches(key:Value|undefined,test:Value,color=false):boolean {
  if(color&&typeof key==='string'&&typeof test==='string') {
    const normalize=(value:string)=>value.toLowerCase().padEnd(9,'f');
    return normalize(key)===normalize(test);
  }
  return key===undefined ? Boolean(test) : operation('==',[key,test])===true;
}
function evaluateMath(math:(...values:number[])=>number,values:Value[]):Value {
  return values.some(value=>value===null) ? null : math(...values.map(Number));
}
function castNumber(type:string,value:Value):Value {
  return value===null ? null : type==='int' ? Math.trunc(Number(value)) : Number(value);
}
export function timeframeSeconds(timeframe:string):number {
  const match=/^(\d+)?([SDWM])?$/.exec(timeframe);
  if(!match||!match[0])return 0;
  return Number(match[1]??1)*({S:1,D:86400,W:604800,M:2592000}[match[2] as 'S'|'D'|'W'|'M']??60);
}
function withTransparency(color:string,transparency:number):string {
  const alpha=Math.round(255*(100-Math.max(0,Math.min(100,transparency)))/100).toString(16).padStart(2,'0');
  return color.length===9 ? color.slice(0,7)+alpha : color+alpha;
}
export type PineAlert = {id:string;message:string;time:number;barIndex:number;freq:string};
export interface Output { meta: Program['meta']; inputs:Program['inputs']; inputValues:Record<string,number|string|boolean>; plots: Array<Omit<Plot,'expr'|'args'> & {points:{time:number;value:Value}[];candleBars?:Bar[];barColors?:Array<{color?:string;wickColor?:string;borderColor?:string}|null>}>; lines:DrawModel[]; boxes:DrawModel[]; labels:DrawModel[]; tables:TableModel[]; alerts:PineAlert[] }
interface ExecutionState {
  variables: Map<string,Value>; history: Map<string,Value[]>; calls: Map<string,Value[][]>; drawings:Map<string,PineDrawing>; tables:Map<string,PineTable>; output:Output; index:number;
}
export class RuntimeSession {
  private previous:Bar[] = [];
  private checkpoint:ExecutionState | undefined;
  readonly program:Program;
  private inputValues:Record<string,number|string|boolean>={};
  private previousLive=false;
  private marketKey='';
  private readonly sourceCache=new Map<number,SourceSamples>();
  constructor(program:Program) {this.program=program;}
  run(bars:Bar[],inputValues:Record<string,number|string|boolean>={},isLive=false,market?:PineMarket):Output {
    // A secondary backfill or correction can change the entire merged series.
    const marketKey=market ? JSON.stringify([market.symbol,market.timeframe,market.mintick,market.background,market.standard]) : '';
    if(JSON.stringify(this.inputValues)!==JSON.stringify(inputValues)||this.previousLive!==isLive||this.marketKey!==marketKey){
      this.checkpoint=undefined;this.inputValues={...inputValues};this.sourceCache.clear();this.marketKey=marketKey;
    }
    if(this.program.requests.size&&market) {
      this.previousLive=isLive;
      return evaluate(this.program,bars,undefined,undefined,inputValues,isLive,market,undefined,this.sourceCache);
    }
    const prefix = this.previous.length-1;
    const samePrefix = prefix >= 0 && bars.length >= this.previous.length && this.previous.slice(0,prefix).every((bar,i)=> ['time','open','high','low','close','volume'].every(key=>bar[key as keyof Bar]===bars[i][key as keyof Bar]));
    const resume = samePrefix && this.checkpoint ? structuredClone(this.checkpoint) : undefined;
    const result = evaluate(this.program,bars,resume,state=>{this.checkpoint=structuredClone(state);},this.inputValues,isLive,market);
    this.previous=bars.map(bar=>({...bar}));
    this.previousLive=isLive;
    return result;
  }
}
type SourceSamples = {bars:Bar[];values:Value[]};
export function evaluate(program:Program, bars:Bar[], resume?:ExecutionState, checkpoint?:(state:ExecutionState)=>void,inputValues:Record<string,number|string|boolean>={},isLive=false,market?:PineMarket,capture?:{expr:Expr;values:Value[]},sourceCache?:Map<number,SourceSamples>): Output {
  const runtimeToken:Token={kind:'eof',value:'',start:{offset:0,line:1,column:1},end:{offset:0,line:1,column:1}};
  const runtimeError=(message:string,token:Token=runtimeToken)=>new ScriptError(message,token,'runtime');
  if (bars.length > 10000) throw runtimeError('History exceeds DeplyzeView’s 10,000-bar execution limit.');
  const variables = resume?.variables ?? new Map<string,Value>();
  const history = resume?.history ?? new Map<string,Value[]>();
  const calls = resume?.calls ?? new Map<string,Value[][]>();
  const drawingRegistry=resume?.drawings ?? new Map<string,PineDrawing>();
  const tableRegistry=resume?.tables ?? new Map<string,PineTable>();
  const callStack:string[]=[];
  const scopeStack:Array<{key:string;bindings:Map<string,string>;functionScope?:boolean}>=[];
  const duration=market ? timeframeSeconds(market.timeframe)*1000 : 0;
  const requestValues=new Map<number,Value[]>();
  function requestSeries(id:number,token:Token):Value[] {
    const existing=requestValues.get(id);
    if(existing)return existing;
    const request=program.requests.get(id)!;
    if(!market||!duration)throw runtimeError('request.security requires chart market data.',token);
    const interval=timeframeSeconds(request.timeframe)*1000;
    const input=market.series?.[request.timeframe]??(interval===duration ? bars : undefined);
    if(!input?.length)throw runtimeError('No '+request.timeframe+' candle history is available for '+market.symbol+'.'+(market.seriesErrors?.[request.timeframe]?' '+market.seriesErrors[request.timeframe]:''),token);
    const horizon=bars[bars.length-1].time+(isLive?0:duration);
    const source=input.filter(bar=>bar.time<horizon || (isLive&&bar.time===horizon)).slice(-request.limit);
    const confirmed=source.filter(bar=>bar.time+interval<=horizon);
    const higherLookahead=interval>duration&&request.lookahead;
    const offset=higherLookahead&&request.expression.op==='history'?request.expression.args[1].constant:undefined;
    if(higherLookahead&&(typeof offset!=='number'||offset<1||!Number.isInteger(offset))) {
      throw runtimeError('Higher-timeframe lookahead_on requires a fixed positive history offset.',token);
    }
    const expr=higherLookahead ? request.expression.args[0] : request.expression;
    const cached=sourceCache?.get(id);
    let values:Value[];
    if(cached&&cached.bars.length===confirmed.length&&confirmed.every((bar,i)=>{
      const previous=cached.bars[i];
      return bar.time===previous.time&&bar.open===previous.open&&bar.high===previous.high&&bar.low===previous.low&&bar.close===previous.close&&bar.volume===previous.volume;
    })) {
      values=cached.values;
    } else {
      values=[];
      evaluate({...program,statements:request.globals??[],plots:[]},confirmed,undefined,undefined,inputValues,false,{...market,timeframe:request.timeframe},{expr,values});
      sourceCache?.set(id,{bars:confirmed.map(bar=>({...bar})),values});
    }
    let cursor=-1,previous=-1;
    const merged=bars.map((bar,index)=>{
      const cutoff=bar.time+(higherLookahead||isLive&&index===bars.length-1?0:duration);
      if(higherLookahead) {
        while(cursor+1<confirmed.length&&confirmed[cursor+1].time+interval<=cutoff)cursor++;
        const sample=cursor-(offset as number)+1;
        const value=request.gaps&&cursor===previous ? null : values[sample]??null;
        previous=cursor;
        return value;
      }
      if(request.lookahead&&interval<duration) {
        while(cursor+1<confirmed.length&&confirmed[cursor+1].time<bar.time)cursor++;
        const sample=cursor+1;
        return confirmed[sample]&&confirmed[sample].time+interval<=cutoff ? values[sample]??null : null;
      }
      while(cursor+1<confirmed.length&&confirmed[cursor+1].time+interval<=cutoff)cursor++;
      const value=request.gaps&&cursor===previous ? null : values[cursor]??null;
      previous=cursor;
      return value;
    });
    requestValues.set(id,merged);
    return merged;
  }
  const resolve=(name:string)=>{
    for(let i=scopeStack.length-1;i>=0;i--){
      const frame=scopeStack[i], key=frame.bindings.get(name);
      if(key)return key;
      if(frame.functionScope)break;
    }
    return name;
  };
  for(const name of program.historyNames)if(!history.has(name))history.set(name,[]);
  const define=(name:string)=>{
    const frame=scopeStack[scopeStack.length-1];
    if(!frame)return name;
    let key=frame.bindings.get(name);
    if(!key){
      key=frame.key+'::'+name;
      frame.bindings.set(name,key);
      if(program.historyNames.has(name)&&!history.has(key))history.set(key,[]);
    }
    return key;
  };
  const output: Output = resume?.output ?? {meta:program.meta,inputs:program.inputs,inputValues:Object.fromEntries(program.inputs.map(input=>[input.key,inputValues[input.key]??input.defval])), plots:program.plots.map(({expr,args,...plot}) => ({...plot,points:[],...(plot.kind==='plotcandle'?{candleBars:[],barColors:[]}:{})})),lines:[],boxes:[],labels:[],tables:[],alerts:[]};
  let operations = 0;
  for (let index=resume?.index ?? 0; index<bars.length; index++) {
    if (index === bars.length-1) checkpoint?.({variables,history,calls,drawings:drawingRegistry,tables:tableRegistry,output,index});
    if ((history.size+calls.size*4+program.plots.length)*bars.length > 2_000_000) throw runtimeError('DeplyzeView series-memory limit exceeded. Reduce history or script size.');
    const bar = bars[index], cache = new Map<string,Value>();
    let drawSequence=0,alertSequence=0;
    const plotValues = new Map<number,Value>();
    const candleValues = new Map<number,Value[]>();
    if (!Number.isFinite(bar.time) || (index && bar.time <= bars[index-1].time)) throw runtimeError('Chart bars must have strictly increasing finite timestamps.');
    for (const name of ['open','high','low','close','volume'] as const) variables.set(name, Number.isFinite(bar[name]) ? bar[name]! : null);
    variables.set('time',bar.time);
    variables.set('time_close',duration ? bar.time+duration : null);
    variables.set('timeframe.period',market?.timeframe??'');
    variables.set('syminfo.tickerid',market?.symbol??'');
    variables.set('syminfo.mintick',market?.mintick??null);
    variables.set('chart.bg_color',market?.background??'#101114');
    variables.set('chart.is_standard',market?.standard??true);
    variables.set('bar_index',index);
    variables.set('last_bar_time',bars[bars.length-1]?.time ?? bar.time);
    variables.set('last_bar_index',bars.length-1);
    variables.set('barstate.isfirst',index===0);
    variables.set('barstate.islast',index===bars.length-1);
    variables.set('barstate.islastconfirmedhistory',index===bars.length-(isLive?2:1));
    variables.set('barstate.isconfirmed',!isLive||index<bars.length-1);
    variables.set('ta.tr',index===0?null:Math.max(bar.high-bar.low,Math.abs(bar.high-bars[index-1].close),Math.abs(bar.low-bars[index-1].close)));
    function run(node:Expr): Value {
      if (++operations > 20_000_000) throw runtimeError('DeplyzeView execution operation limit exceeded.',node.token);
      const cacheKey=`${callStack[callStack.length-1]??''}:${node.id}`;
      if (cache.has(cacheKey)) return cache.get(cacheKey)!;
      if (node.op === 'literal') return node.value!;
      if (node.op === 'name' && String(node.value).includes('.') && !Object.prototype.hasOwnProperty.call(constants,String(node.value))) {
        const fullName=String(node.value);
        if(fullName==='syminfo.mintick'&&!(typeof market?.mintick==='number'&&Number.isFinite(market.mintick)&&market.mintick>0)) {
          throw runtimeError('Minimum price tick is unavailable for '+(market?.symbol??'this chart')+'.',node.token);
        }
        if(variables.has(resolve(fullName)))return variables.get(resolve(fullName))??null;
        const [owner,field] = String(node.value).split('.');
        const record = variables.get(resolve(owner));
        return record instanceof Map ? record.get(field) ?? null : null;
      }
      if (node.op === 'name') return Object.prototype.hasOwnProperty.call(constants,String(node.value)) ? constants[String(node.value)] : variables.get(resolve(String(node.value))) ?? null;
      if (node.op === 'history') {
        const offsetValue=node.args[1].constant ?? run(node.args[1]);
        const offset=Number(offsetValue);
        if(!Number.isInteger(offset)||offset<0||offset>5000)throw runtimeError('History offset must be an integer from 0 to 5000.',node.token);
        const source=node.args[0];
        if(source.op!=='name') {
          const key=cacheKey+':history';
          let values=history.get(key);
          if(!values)history.set(key,values=[]);
          if(!(index in values))values[index]=run(source);
          return values[index-offset]??null;
        }
        const sourceName=String(source.value);
        if(['open','high','low','close','volume','time','bar_index'].includes(sourceName)) {
          if(sourceName==='bar_index')return index-offset>=0?index-offset:null;
          const sourceBar=bars[index-offset];
          return sourceBar?(sourceName==='time'?sourceBar.time:sourceBar[sourceName as keyof Bar] as Value):null;
        }
        return offset === 0 ? run(node.args[0]) : history.get(resolve(String(node.args[0].value)))?.[index-offset] ?? null;
      }
      if (node.op === 'ternary') return run(node.args[0]) ? run(node.args[1]) : run(node.args[2]);
      if (node.op==='/' && node.integer && node.constant!==undefined) return node.constant;
      if (node.op === 'switch') {
        const key = node.args[0] ? run(node.args[0]) : undefined;
        for (const [index,branch] of node.branches!.entries()) {
          if (branch.test && !switchMatches(key,run(branch.test),node.args[0]?.color)) continue;
          const parent=scopeStack[scopeStack.length-1]?.key ?? '';
          scopeStack.push({key:`${parent}:switch:${node.id}:${index}`,bindings:new Map()});
          try {
            return statements(branch.body) ?? null;
          } finally {
            scopeStack.pop();
          }
        }
        return null;
      }
      if (node.op !== 'call') return operation(node.op,node.args.map(run));
      const name = String(node.value);
      if(name==='request.security') {
        const value=requestSeries(node.id,node.token)[index]??null;
        return value&&typeof value==='object'?structuredClone(value):value;
      }
      if (name === 'input.string' || name === 'input' || name === 'input.bool' || name === 'input.int' || name === 'input.float') return inputValues[node.inputKey??''] ?? node.args[0].constant!;
      const fn=program.functions.get(name);
      if(fn) {
        const args=node.args.map(run);
        const frame={key:`${callStack[callStack.length-1]??''}>${node.id}:${name}`,bindings:new Map<string,string>(),functionScope:true};
        scopeStack.push(frame);callStack.push(frame.key);
        fn.params.forEach((param,i)=>variables.set(define(param.name),args[i] ?? (param.defaultValue?run(param.defaultValue):null)));
        try {
          return statements(node.checkedBody??fn.body) ?? null;
        } finally {
          callStack.pop();scopeStack.pop();
        }
      }
      const args = node.args.map(run);
      const math=mathFunctions.get(name);
      if(math)return evaluateMath(math,args);
      if(name==='int'||name==='float')return castNumber(name,args[0]);
      if(name==='timeframe.in_seconds')return timeframeSeconds(String(args[0]??market?.timeframe??''))||null;
      if(['color.r','color.g','color.b'].includes(name)) {
        const start=1+2*['color.r','color.g','color.b'].indexOf(name);
        return typeof args[0]==='string'?parseInt(args[0].slice(start,start+2),16):null;
      }
      if(name==='str.length')return args[0]===null?null:String(args[0]).length;
      if(name==='str.tostring') {
        const tick=market?.mintick;
        if(args[1]==='mintick'&&typeof args[0]==='number'&&tick&&tick>0) {
          const decimals=Math.max(0,(String(tick).split('.')[1]?.length??0)+Number(String(tick).split('e-')[1]??0));
          return (Math.round(args[0]/tick)*tick).toFixed(decimals);
        }
        return args[0]===null?'NaN':String(args[0]);
      }
      if(name==='runtime.error')throw runtimeError(String(args[0]),node.token);
      if(name==='alert') {
        const freq=String(args[1]??'once_per_bar');
        if(!isLive||index!==bars.length-1||freq!=='once_per_bar_close') {
          const time=bar.time+(freq==='once_per_bar_close'?duration:0);
          if(freq==='all'||output.alerts[output.alerts.length-1]?.barIndex!==index)output.alerts.push({id:`${node.id}:${time}:${alertSequence++}`,message:String(args[0]),time,barIndex:index,freq});
        }
        return null;
      }
      if(name==='ta.tr')return index===0?(args[0]===true?bar.high-bar.low:null):Math.max(bar.high-bar.low,Math.abs(bar.high-bars[index-1].close),Math.abs(bar.low-bars[index-1].close));
      if(name==='table.new') {
        const columns=Math.trunc(Number(args[1])),rows=Math.trunc(Number(args[2]));
        if(!Number.isInteger(columns)||!Number.isInteger(rows)||columns<1||rows<1||columns*rows>10000)throw runtimeError('Table dimensions must be positive integers with at most 10,000 cells.',node.token);
        const id=`pine-table-${index}-${node.id}`;
        const table:PineTable={__pineTable:true,id,deleted:false,position:String(args[0]??'top_right'),columns,rows,bgColor:typeof args[3]==='string'?args[3]:undefined,frameColor:typeof args[4]==='string'?args[4]:undefined,frameWidth:Number(args[5]??0),borderColor:typeof args[6]==='string'?args[6]:undefined,borderWidth:Number(args[7]??0),cells:Array.from({length:rows},()=>Array.from({length:columns},()=>null)),merges:[],overlay:args[8]===true};
        tableRegistry.set(id,table);return table;
      }
      if(name==='table.cell') {
        const table=args[0];if(!table||typeof table!=='object'||!('__pineTable'in table))throw runtimeError('table.cell requires a table handle.',node.token);
        const col=Math.trunc(Number(args[1])),row=Math.trunc(Number(args[2]));if(col<0||row<0||col>=table.columns||row>=table.rows)throw runtimeError('Table cell coordinates are outside the table.',node.token);
        table.cells[row][col]={text:args[3]===null||args[3]===undefined?'':String(args[3]),...(typeof args[6]==='string'?{textColor:args[6]}:{}),...(typeof args[7]==='string'?{bgColor:args[7]}:{}),hAlign:['left','center','right'].includes(String(args[8]))?String(args[8]) as PineTableCell['hAlign']:'center',vAlign:['top','center','bottom'].includes(String(args[9]))?String(args[9]) as PineTableCell['vAlign']:'center',textSize:typeof args[10]==='number'?args[10]:String(args[10]??'normal'),...(typeof args[11]==='string'?{tooltip:args[11]}:{}),fontFamily:args[12]==='monospace'?'monospace':'default',bold:false,italic:false,...(typeof args[4]==='number'?{width:args[4]}:{}),...(typeof args[5]==='number'?{height:args[5]}:{})};return null;
      }
      if(name==='table.clear') {
        const table=args[0];if(!table||typeof table!=='object'||!('__pineTable'in table))throw runtimeError('table.clear requires a table handle.',node.token);
        const c1=Math.max(0,Math.trunc(Number(args[1]??0))),r1=Math.max(0,Math.trunc(Number(args[2]??0))),c2=Math.min(table.columns-1,Math.trunc(Number(args[3]??table.columns-1))),r2=Math.min(table.rows-1,Math.trunc(Number(args[4]??table.rows-1)));
        for(let row=r1;row<=r2;row++)for(let col=c1;col<=c2;col++)table.cells[row][col]=null;return null;
      }
      if(name==='table.delete') {
        const table=args[0];if(!table||typeof table!=='object'||!('__pineTable'in table))throw runtimeError('table.delete requires a table handle.',node.token);table.deleted=true;return null;
      }
      if(name==='plotcandle'){candleValues.set(node.id,args);return null;}
      if(name==='alertcondition')return null;
      if(name==='color.new') return typeof args[0]==='string' ? withTransparency(args[0],Number(args[1]??0)) : null;
      if(name==='color') return args[0]===null ? null : args[0];
      if(name==='chart.point.new') return new Map<string,Value>([['time',args[0]??null],['index',args[1]??null],['price',args[2]??null]]);
      if(['line.new','box.new','label.new'].includes(name)) {
        const kind=name.slice(0,-4) as PineDrawing['kind'];
        const fields=new Map<string,Value>();
        node.args.forEach((arg,i)=>{const key=node.names?.[i];if(key)fields.set(key,args[i]??null);});
        if(kind==='line') {
          const p1=args[0] instanceof Map?args[0]:undefined, p2=args[1] instanceof Map?args[1]:undefined;
          fields.set('xloc',p1?'bar_time':fields.get('xloc')??args[4]??'bar_index');
          fields.set('x1',p1?.get(fields.get('xloc')==='bar_time'?'time':'index')??args[0]??null);
          fields.set('y1',p1?.get('price')??args[1]??null);
          fields.set('x2',p2?.get(fields.get('xloc')==='bar_time'?'time':'index')??args[2]??null);
          fields.set('y2',p2?.get('price')??args[3]??null);
          fields.set('extend',fields.get('extend')??'none');fields.set('color',fields.get('color')??'#2196F3');fields.set('style',fields.get('style')??'solid');fields.set('width',fields.get('width')??1);
        } else if(kind==='box') {
          fields.set('left',args[0]??null);fields.set('top',args[1]??null);fields.set('right',args[2]??null);fields.set('bottom',args[3]??null);
          fields.set('xloc',fields.get('xloc')??'bar_index');fields.set('extend',fields.get('extend')??'none');
          fields.set('bgcolor',fields.get('bgcolor')??null);fields.set('border_color',fields.get('border_color')??null);
          fields.set('border_width',fields.get('border_width')??1);fields.set('border_style',fields.get('border_style')??'solid');
        } else {
          const point=args[0] instanceof Map?args[0]:undefined;
          const positional=(i:number)=>node.names?.[i]===undefined?args[i]:undefined;
          const xloc=fields.get('xloc')??(point?positional(2):positional(3))??'bar_index';
          fields.set('xloc',xloc);
          fields.set('x',point?.get(fields.get('xloc')==='bar_time'?'time':'index')??args[0]??null);fields.set('y',point?.get('price')??args[1]??null);
          fields.set('text',fields.get('text')??(point&&typeof args[1]==='string'?args[1]:typeof args[2]==='string'?args[2]:''));
          fields.set('yloc',fields.get('yloc')??(point?positional(3):positional(4))??'price');
          fields.set('color',fields.has('color')?fields.get('color')!:((point?args[4]:args[5])??'#2196F3'));
          fields.set('style',fields.get('style')??(point?args[5]:args[6])??'label_down');
          fields.set('textcolor',fields.get('textcolor')??(point?args[6]:args[7])??'#FFFFFF');
          fields.set('size',fields.get('size')??(point?args[7]:args[8])??'normal');
          if(!fields.has('textalign')&&args[point?8:9]!==undefined)fields.set('textalign',args[point?8:9]);
          if(!fields.has('tooltip')&&args[point?9:10]!==undefined)fields.set('tooltip',args[point?9:10]);
        }
        const drawing:PineDrawing={__pineDrawing:true,kind,id:`pine-${kind}-${index}-${node.id}-${drawSequence++}`,deleted:false,fields};
        drawingRegistry.set(drawing.id,drawing);
        return drawing;
      }
      const drawingCall=/^(.*)\.(delete|set_[a-z_]+)$/.exec(name);
      if(drawingCall) {
        const owner=drawingCall[1];
        const object=['line','box','label'].includes(owner)&&drawingCall[2]==='delete'?args[0]:variables.get(resolve(owner));
        if(!object||typeof object!=='object'||!('__pineDrawing'in object)) throw runtimeError('Drawing method receiver is not a drawing object.',node.token);
        const drawing=object as PineDrawing, method=drawingCall[2];
        if(method==='delete') {drawing.deleted=true;drawingRegistry.delete(drawing.id);}
        else if(['set_point','set_first_point','set_second_point','set_top_left_point','set_bottom_right_point'].includes(method)) {
          const point=args[0] instanceof Map?args[0]:new Map<string,Value>();
          const side=method==='set_first_point'||method==='set_top_left_point'?'1':method==='set_second_point'||method==='set_bottom_right_point'?'2':'';
          const xloc=drawing.fields.get('xloc')??'bar_index';
          const x=point.get(xloc==='bar_time'?'time':'index')??null, y=point.get('price')??null;
          if(drawing.kind==='line'){drawing.fields.set(side==='1'?'x1':'x2',x);drawing.fields.set(side==='1'?'y1':'y2',y);}
          else if(drawing.kind==='box'){drawing.fields.set(side==='1'?'left':'right',x);drawing.fields.set(side==='1'?'top':'bottom',y);}
          else {drawing.fields.set('x',x);drawing.fields.set('y',y);}
        } else drawing.fields.set(method.slice(4),args[0]??null);
        return null;
      }
      if (name === 'array.new') {
        const size=Math.max(0,Math.min(10000,Math.trunc(Number(args[0] ?? 0))));
        return Array.from({length:size},()=>args[1] ?? null);
      }
      const arrayCall=arrayMethodPattern.exec(name);
      if (arrayCall) {
        const owner=arrayCall[1], method=arrayCall[2];
        const array=owner==='array'?args[0]:variables.get(resolve(owner));
        if(array instanceof Map&&method==='copy')return new Map(array);
        if (!Array.isArray(array)) throw runtimeError('Array method receiver is not an array.',node.token);
        const params=owner==='array'?args.slice(1):args;
        const index=Math.trunc(Number(params[0] ?? 0));
        switch(method) {
          case 'push': array.push(params[0] ?? null); return null;
          case 'unshift': array.unshift(params[0] ?? null); return null;
          case 'pop': return array.pop() ?? null;
          case 'shift': return array.shift() ?? null;
          case 'get': return array[index] ?? null;
          case 'set': array[index]=params[1] ?? null; return null;
          case 'size': return array.length;
          case 'remove': return array.splice(index,1)[0] ?? null;
          case 'clear': array.length=0; return null;
          case 'indexof': return array.indexOf(params[0] ?? null);
          case 'includes': return array.includes(params[0] ?? null);
          case 'copy': return array.slice();
          case 'join': return array.join(String(params[0]??''));
          case 'concat': {
            if(!Array.isArray(params[0]))throw runtimeError('array.concat requires another array.',node.token);
            array.push(...params[0]);return array;
          }
          case 'max': return array.length ? Math.max(...array.map(Number)) : null;
          case 'min': return array.length ? Math.min(...array.map(Number)) : null;
          case 'slice': return array.slice(index,Math.trunc(Number(params[1] ?? array.length)));
          case 'sort':
          case 'sort_indices': {
            const direction=params[0]==='descending'?-1:1;
            const compare=(a:Value,b:Value)=>a===null ? (b===null?0:direction) : b===null ? -direction : direction*(typeof a==='string'&&typeof b==='string'?a.localeCompare(b):Number(a)-Number(b));
            if(method==='sort_indices')return array.map((_,i)=>i).sort((a,b)=>compare(array[a],array[b]));
            array.sort(compare);return null;
          }
          case 'percentile_nearest_rank': {
            const ordered=array.filter((value):value is number=>typeof value==='number').sort((a,b)=>a-b);
            const percentile=Number(params[0]);
            if(percentile<0||percentile>100||!Number.isFinite(percentile))throw runtimeError('Percentile must be between 0 and 100.',node.token);
            return ordered[Math.max(0,Math.ceil(ordered.length*percentile/100)-1)]??null;
          }
        }
      }
      const fields = name.endsWith('.new') ? program.records.get(name.slice(0,-4)) : undefined;
      if (fields) {
        const record = new Map<string,Value>();
        fields.forEach((field,index)=>{
          const initial = node.args[index] ?? field.initial;
          record.set(field.name,initial ? run(initial) : null);
        });
        return record;
      }
      if (['indicator','plot','hline','plotshape'].includes(name)) { const values=node.args.map(run); if(name !== 'indicator') plotValues.set(node.args[0].id,values[0]); return null; }
      if (name === 'na') return args[0] === null;
      if (name === 'nz') return args[0] ?? args[1] ?? 0;
      const callId=cacheKey;
      let state = calls.get(callId);
      if (!state) { state = [[],[],[],[]]; calls.set(callId,state); }
      const length = Number(name==='ta.stdev'?args[1]:args[args.length-1]);
      if(name.startsWith('ta.')&&['ta.sma','ta.ema','ta.rsi','ta.atr','ta.stdev','ta.highest','ta.lowest'].includes(name)&&(!Number.isInteger(length)||length<1||length>5000))throw runtimeError('TA length must be an integer from 1 to 5000.',node.token);
      let result: Value = null;
      if(name==='ta.stdev') {
        const sample=args[0];if(sample!==null)state[0].push(sample);
        while(state[0].length>length)state[0].shift();
        if(state[0].length===length) {
          const mean=state[0].reduce<number>((sum,value)=>sum+Number(value),0)/length;
          const sumSquares=state[0].reduce<number>((sum,value)=>sum+(Number(value)-mean)**2,0);
          const biased=args[2]===undefined?true:Boolean(args[2]);
          if(biased||length>1)result=Math.sqrt(sumSquares/(biased?length:length-1));
        }
      } else if (name.includes('cross')) {
        const previous = state[0];
        result = args[0] !== null && args[1] !== null && previous.length === 2 && previous[0] !== null && previous[1] !== null &&
          (name === 'ta.crossover' ? Number(args[0]) > Number(args[1]) && Number(previous[0]) <= Number(previous[1]) : Number(args[0]) < Number(args[1]) && Number(previous[0]) >= Number(previous[1]));
        state[0] = args;
      } else if(name==='ta.cum') {
        const value=args[0];
        if(value!==null)state[0][0]=Number(state[0][0]??0)+Number(value);
        result=state[0][0]??null;
      } else if(name==='ta.change') {
        const value=args[0],previous=state[0][0];
        result=value===null||previous===undefined||previous===null?null:Number(value)-Number(previous);
        state[0][0]=value;
      } else if(name==='ta.highest'||name==='ta.lowest') {
        const implicitSource=node.args.length===1;
        const value=implicitSource?variables.get(name==='ta.highest'?'high':'low')??null:args[0];
        const window=Number(args[implicitSource?0:1]);
        if(value!==null)state[0].push(value);
        if(state[0].length>window)state[0].shift();
        if(state[0].length)result=name==='ta.highest'?Math.max(...state[0].map(Number)):Math.min(...state[0].map(Number));
      } else {
        let value = args[0];
        if (name === 'ta.atr') value = index === 0 ? bar.high-bar.low : Math.max(bar.high-bar.low,Math.abs(bar.high-bars[index-1].close),Math.abs(bar.low-bars[index-1].close));
        if (name === 'ta.sma') {
          if (value !== null) state[0].push(value);
          while (state[0].length > length) state[0].shift();
          if (state[0].length === length) result = state[0].reduce<number>((sum,v)=>sum+Number(v),0)/length;
        } else if (name === 'ta.ema') {
          if (value !== null) state[0][0] = state[0].length ? 2/(length+1)*Number(value)+(1-2/(length+1))*Number(state[0][0]) : value;
          result=state[0][0] ?? null;
        }
        else {
          const rma = (sample:Value, slot:number):Value => {
            const values = state![slot];
            if (sample === null) return values.length > length ? values[length] : null;
            if (values.length < length) values.push(sample);
            if (values.length === length) values.push(values.reduce<number>((sum,v)=>sum+Number(v),0)/length);
            else if (values.length > length) values[length] = (Number(sample)+(length-1)*Number(values[length]))/length;
            return values.length > length ? values[length] : null;
          };
          if (name === 'ta.atr') result = rma(value,0);
          else if (name === 'ta.rsi') {
            const previous = state[2][0];
            if (value !== null) {
              if (previous !== undefined && previous !== null) {
                const change = Number(value)-Number(previous);
                const gain = rma(Math.max(change,0),0), loss = rma(Math.max(-change,0),1);
                if (gain !== null && loss !== null) result = loss === 0 ? (gain === 0 ? null : 100) : 100-100/(1+Number(gain)/Number(loss));
              }
              state[2][0] = value;
            } else result = state[3][0] ?? null;
            state[3][0] = result;
          }
        }
      }
      cache.set(cacheKey,result); return result;
    }
    function scopedStatements(list:Statement[],key:string,names:string[]=[],values:Value[]=[]):Value|undefined {
      const parent=scopeStack[scopeStack.length-1]?.key??'';
      scopeStack.push({key:parent+':'+key,bindings:new Map()});
      try {
        names.forEach((name,i)=>variables.set(define(name),values[i]??null));
        return statements(list);
      } finally {
        scopeStack.pop();
      }
    }
    function statements(list:Statement[]):Value|undefined {
      let returned:Value|undefined;
      for (const statement of list) {
        if(statement.kind==='break'||statement.kind==='continue')throw new LoopControl(statement.kind);
        if (statement.kind === 'if') {
          const yes=Boolean(run(statement.expr));
          returned=scopedStatements(yes ? statement.yes! : statement.no!,`if:${statement.token.start.offset}:${yes}`);
        }
        else if (statement.kind === 'for-range' || statement.kind === 'for-each' || statement.kind==='while') {
          const loopNames=statement.loopNames??[];
          let count=0;
          const executeBody=(values:Value[]):'break'|'continue'|undefined=>{
            if (++count>10000) throw runtimeError('DeplyzeView loop execution limit exceeded 10,000 iterations on this bar.',statement.token);
            try {scopedStatements(statement.body!,`loop:${statement.token.start.offset}`,loopNames,values);return undefined;}
            catch(error){if(error instanceof LoopControl)return error.kind;throw error;}
          };
          if(statement.kind==='for-range') {
            const from=Number(run(statement.expr)), to=Number(run(statement.end!));
            const step=Number(statement.step ? run(statement.step) : 1);
            if(!Number.isFinite(from)||!Number.isFinite(to)||!Number.isFinite(step)||step<=0) throw runtimeError('For-loop bounds must be finite and step positive.',statement.token);
            for(let value=from;value<=to;value+=step)if(executeBody([value])==='break')break;
          } else if(statement.kind==='for-each') {
            const target=run(statement.expr);
            if(!Array.isArray(target)) throw runtimeError('For-in loop value is not an array.',statement.token);
            for(let i=0;i<target.length;i++)if(executeBody([i,target[i]])==='break')break;
          } else {
            while(Boolean(run(statement.expr)))if(executeBody([])==='break')break;
          }
        }
        else if (statement.kind === 'expression') returned=run(statement.expr);
        else if (statement.kind==='assign' && statement.name!.includes('.')) {
          const [owner,field]=statement.name!.split('.');
          const record=variables.get(resolve(owner));
            if (!(record instanceof Map)) throw runtimeError('Cannot assign a field on a missing record.',statement.token);
          record.set(field,run(statement.expr));
        }
        else if(statement.kind==='assign') variables.set(resolve(statement.name!),run(statement.expr));
        else {
          const name=statement.name!;
          const frame=scopeStack[scopeStack.length-1];
          const key=frame ? frame.key+'::'+name : name;
          if(!statement.persistent||!variables.has(key)) {
            const value=statement.immutable&&statement.expr.constant!==undefined ? statement.expr.constant : run(statement.expr);
            variables.set(define(name),value);
          } else {
            define(name);
          }
        }
      }
      return returned;
    }
    statements(program.statements);
    if(capture)capture.values.push(structuredClone(run(capture.expr)));
    output.tables=Array.from(tableRegistry.values()).filter(table=>!table.deleted).map(table=>({id:table.id,paneId:'',position:table.position,columns:table.columns,rows:table.rows,...(table.bgColor?{bgColor:table.bgColor}:{}),...(table.frameColor?{frameColor:table.frameColor}:{}),frameWidth:table.frameWidth,...(table.borderColor?{borderColor:table.borderColor}:{}),borderWidth:table.borderWidth,cells:table.cells.map(row=>row.map(cell=>cell?{...cell}:null)),merges:table.merges,overlay:table.overlay}));
    const objects=Array.from(drawingRegistry.values()).filter(drawing=>!drawing.deleted);
    const model=(d:PineDrawing):DrawModel=>{
      const get=(key:string)=>d.fields.get(key);
      const base={id:d.id,paneId:'',xloc:get('xloc')==='bar_time'?'bar_time':'bar_index'};
      if(d.kind==='line')return {...base,x1:get('x1'),y1:get('y1'),x2:get('x2'),y2:get('y2'),extend:get('extend')??'none',color:get('color')??undefined,invisible:get('color')===null,width:get('width')??1,style:get('style')??'solid',arrowLeft:false,arrowRight:false} as DrawModel;
      if(d.kind==='box')return {...base,left:get('left'),top:get('top'),right:get('right'),bottom:get('bottom'),extend:get('extend')??'none',bgColor:get('bgcolor')??undefined,borderColor:get('border_color')??undefined,borderWidth:get('border_width')??1,borderStyle:get('border_style')??'solid',text:get('text')??undefined,textColor:get('text_color')??undefined,textSize:get('text_size')??'normal',hAlign:get('text_halign')??'center',vAlign:get('text_valign')??'center',wrap:false,fontFamily:'default',bold:false,italic:false} as DrawModel;
      return {...base,x:get('x'),y:get('y'),yloc:get('yloc')??'price',text:get('text')??undefined,style:get('style')??'label_down',color:get('color')??undefined,textColor:get('textcolor')??undefined,size:get('size')??'normal',textAlign:get('textalign')??'center',fontFamily:'default',noFill:get('color')===null} as DrawModel;
    };
    output.lines=objects.filter(d=>d.kind==='line'&&['x1','y1','x2','y2'].every(k=>typeof d.fields.get(k)==='number')).map(model);
    output.boxes=objects.filter(d=>d.kind==='box'&&['left','top','right','bottom'].every(k=>typeof d.fields.get(k)==='number')).map(model);
    output.labels=objects.filter(d=>d.kind==='label'&&typeof d.fields.get('x')==='number'&&typeof d.fields.get('y')==='number').map(model);
    program.plots.forEach((plot,i) => {
      const value = plotValues.get(plot.expr.id) ?? null;
      if(plot.kind==='plotcandle') {
        const values=candleValues.get(plot.expr.id)??[];
        const n=(v:Value|undefined)=>typeof v==='number'?v:Number.NaN;
        output.plots[i].candleBars!.push({time:bar.time,open:n(values[0]),high:n(values[1]),low:n(values[2]),close:n(values[3])});
        const color=typeof values[5]==='string'?values[5]:undefined,wickColor=typeof values[6]==='string'?values[6]:undefined,borderColor=typeof values[9]==='string'?values[9]:undefined;
        output.plots[i].barColors!.push(color||wickColor||borderColor?{color,wickColor,borderColor}:null);
        return;
      }
      output.plots[i].points.push({time:bar.time,value:typeof value === 'number' && !Number.isFinite(value) ? null : value});
    });
    for (const [name,values] of history) if(variables.has(name))values[index]=variables.get(name)!;
  }
  return output;
}
