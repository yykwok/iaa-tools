import {adFields} from "./ad-fields.js?v=adheaders1";
import {inspectAdLayout, normalize} from "./ad-layout.js";

// Only pair a known release-field label with a value of the expected shape.
const formats = [
  [/^(?:android)?(?:包名|应用包名|package(?:name)?|applicationid)$/, /^[a-zA-Z]\w*(?:\.[a-zA-Z]\w*)+$/],
  [/^(?:googleappid|(?:默认)?firebase(?:应用id|appid)|appid)$/, /^1:\d+:android:[a-zA-Z0-9]+$/],
  [/^(?:游戏名称|游戏名|项目名称|gamename|game|游戏|环境|environment)$/, /^[\p{L}\d][\p{L}\d ._()-]{0,63}$/u],
];
const firebaseId = /^1:\d+:android:[a-zA-Z0-9]+$/;
const admobId = adFields[0].value;
const genericAppId = /^(?:appid|应用id)$/;
function kind(text) {
  const label=normalize(text);
  const androidLabel=label.replace(/^android|android$/g,"");
  if (genericAppId.test(androidLabel)) return {test: value => firebaseId.test(value) || admobId.test(value), ad: true};
  const field=adFields.find(({header})=>header.test(androidLabel));
  if (field) return {test: value=>field.value.test(value), ad: true};
  const format=formats.find(([pattern])=>pattern.test(label));
  if (format) return {test: value=>format[1].test(value), ad: false};
}
export function findParameters(book,utils) {
  const pairs=[];
  for (const [i,sheetName] of book.SheetNames.entries()) {
    if (book.Workbook?.Sheets?.[i]?.Hidden) continue;
    const sheet=book.Sheets[sheetName];
    const read=address=>String(sheet[address]?.w??sheet[address]?.v??"").trim();
    const cells=Object.keys(sheet).filter(address=>/^[A-Z]+\d+$/.test(address) && read(address))
      .map(address=>({sheet:sheetName,address,text:read(address),...utils.decode_cell(address)}));
    const adLayout=inspectAdLayout(cells);
    for (const {address,text,r,c} of cells) {
      if (adLayout.platformAt(r,c)==="ios") continue;
      const inline=text.match(/^([\s\S]{1,64}?)\s*[:：=]\s*(.+)$/);
      const pattern=kind(text) || (inline && kind(inline[1]));
      if (!pattern) continue;
      const label={sheet:sheetName,address,text};
      if (inline && pattern.test(inline[2])) { pairs.push([label]);continue; }
      function headerAt(row,col) { return row>=0 && col>=0 && kind(read(utils.encode_cell({r:row,c:col}))); }
      const down=headerAt(r,c+1)||headerAt(r,c-1);
      const right=headerAt(r+1,c)||headerAt(r-1,c);
      const directions=down?[[1,0],[0,1]]:right?[[0,1],[1,0]]:[[0,1],[1,0]];
      for (const [dr,dc] of directions) {
        let matched=false;
        for(let step=1;step<=500;step++) {
          const targetRow=r+dr*step,targetCol=c+dc*step;
          if (adLayout.platformAt(targetRow,targetCol)==="ios") break;
          const target=utils.encode_cell({r:targetRow,c:targetCol}), value=read(target);
          if (!matched && step <= (pattern.ad ? 3 : 1) && (!value || (pattern.ad && /^android$/i.test(value)))) continue;
          if (!value || kind(value) || !pattern.test(value)) break;
          pairs.push([label,{sheet:sheetName,address:target,text:value}]);matched=true;
          if (pairs.length>1500) throw Error("候选参数过多，请导入仅包含本次游戏的表格。");
          if (!dr || !down) break;
        }
        if(matched) break;
      }
    }
    for (const pair of adLayout.pairs) {
      pairs.push(pair.map(({r,c,...cell})=>cell));
    }
    if (pairs.length>1500) throw Error("候选参数过多，请导入仅包含本次游戏的表格。");
  }
  return pairs;
}
