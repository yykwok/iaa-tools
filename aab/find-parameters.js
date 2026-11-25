// Only pair a known release-field label with a value of the expected shape.
const formats = [
  [/^(?:android)?(?:包名|应用包名|package(?:name)?|applicationid)$/, /^[a-zA-Z]\w*(?:\.[a-zA-Z]\w*)+$/],
  [/^(?:版本|版本名(?:称)?|版本号|version(?:name)?)$/, /^\d+(?:[.][\w-]+)*(?:[-+][\w.-]+)?$/],
  [/^(?:(?:上次(?:已上传)?|本次|当前|previous|last)?(?:构建号|内部版本号|versioncode|build(?:number|code)?))$/, /^\d{1,10}$/],
  [/^(?:googleappid|(?:默认)?firebase(?:应用id|appid)|appid)$/, /^1:\d+:android:[a-zA-Z0-9]+$/],
  [/^(?:游戏名称|游戏名|项目名称|gamename|game|游戏|环境|environment)$/, /^[\p{L}\d][\p{L}\d ._()-]{0,63}$/u],
];
function kind(text) {
  const label=text.toLowerCase().replace(/[\s_./:：()（）-]/g,"");
  return formats.find(([pattern])=>pattern.test(label))?.[1];
}
export function findParameters(book,utils) {
  const pairs=[];
  for (const [i,sheetName] of book.SheetNames.entries()) {
    if (book.Workbook?.Sheets?.[i]?.Hidden) continue;
    const sheet=book.Sheets[sheetName];
    const read=address=>String(sheet[address]?.w??sheet[address]?.v??"").trim();
    for (const address of Object.keys(sheet)) {
      if (!/^[A-Z]+\d+$/.test(address)) continue;
      const text=read(address), inline=text.match(/^(.{1,44}?)\s*[:：=]\s*(.+)$/);
      const pattern=kind(text) || (inline && kind(inline[1]));
      if (!pattern) continue;
      const label={sheet:sheetName,address,text};
      if (inline && pattern.test(inline[2])) { pairs.push([label]);continue; }
      const {r,c}=utils.decode_cell(address);
      function headerAt(row,col) { return row>=0 && col>=0 && kind(read(utils.encode_cell({r:row,c:col}))); }
      const down=headerAt(r,c+1)||headerAt(r,c-1);
      const right=headerAt(r+1,c)||headerAt(r-1,c);
      const directions=down?[[1,0]]:right?[[0,1]]:[[0,1],[1,0]];
      for (const [dr,dc] of directions) {
        let matched=false;
        for(let step=1;step<=500;step++) {
          const target=utils.encode_cell({r:r+dr*step,c:c+dc*step}), value=read(target);
          if (!value && step===1) continue;
          if (!value || kind(value) || !pattern.test(value)) break;
          pairs.push([label,{sheet:sheetName,address:target,text:value}]);matched=true;
          if (pairs.length>1500) throw Error("候选参数过多，请导入仅包含本次游戏的表格。");
          if (!down) break;
        }
        if(matched) break;
      }
    }
  }
  return pairs;
}
