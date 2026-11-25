import {adFields} from "./ad-fields.js?v=adheaders1";

const roles = {
  format: /^(广告类型|广告格式|adtype|adformat)$/,
  scene: /^(场景id|广告场景id|触发点id|sceneid|placementname|placement)$/,
  unit: /^(广告位id|广告单元id|adunitid|placementid|maxadunitid)$/,
  platform: /^(系统|平台|操作系统|platform|os)$/,
};
const formats = {
  banner: /^(横幅(?:广告)?|banner(?:ad)?)$/,
  video: /^(激励(?:视频|广告|视频广告)?|reward(?:ed)?(?:video|ad)?|rv|video)$/,
  inter: /^(插屏(?:广告)?|interstitial(?:ad)?|inter)$/,
};
const readPlatform = text => /^(?:android|and|安卓)$/.test(normalize(text)) ? "android" : /^(?:ios|iphone|苹果)$/.test(normalize(text)) ? "ios" : "";

export function normalize(text) {
  return text.normalize("NFKC").toLowerCase().replace(/[\s_./:()[\]·-]/g, "");
}

export function inspectAdLayout(cells) {
  const rows = new Map(), cols = new Map(), lookup = new Map();
  for (const cell of cells) {
    for (const [axis, index] of [[rows, cell.r], [cols, cell.c]]) {
      if (!axis.has(index)) axis.set(index, []);
      axis.get(index).push(cell);
    }
    lookup.set(cell.r + ":" + cell.c, cell);
  }

  function scan(headers, axis, across) {
    const bands = [];
    const pairs = [];
    for (const [line, cells] of headers) {
      const sorted = [...cells].sort((a,b)=>a[axis]-b[axis]);
      const anchors = sorted.filter(cell => readPlatform(cell.text));
      if (new Set(anchors.map(cell => readPlatform(cell.text))).size > 1) {
        bands.push({line, anchors});
      }
    }
    bands.sort((a,b)=>b.line-a.line);
    const orderedLines=[...headers.keys()].sort((a,b)=>a-b);

    function platformAt(line, position) {
      const band = bands.find(band=>band.line<line);
      if (!band) return "";
      const label = band.anchors.findLast(anchor=>anchor[axis]<=position);
      return label ? readPlatform(label.text) : "";
    }

    for (const [line, cells] of headers) {
      const sorted = [...cells].sort((a,b)=>a[axis]-b[axis]);
      let group = {};
      let platform = "";
      const groups=[];
      for (const cell of sorted) {
        const role=Object.keys(roles).find(key=>roles[key].test(normalize(cell.text)));
        if (!role) continue;
        const next=platformAt(line,cell[axis]);
        if (group[role] || next!==platform) {
          groups.push({group,platform});
          group={};
        }
        group[role]=cell;
        platform=next;
      }
      groups.push({group,platform});
      for (const {group,platform} of groups) {
        if (!group.format || !group.unit || platform==="ios") continue;
        for (const index of orderedLines) {
          if (index<=line) continue;
          if (bands.some(band=>band.line===index)) break;
          const get = header => header && (across
            ? lookup.get(index+":"+header.c)
            : lookup.get(header.r+":"+index));
          const format=get(group.format),unit=get(group.unit),scene=get(group.scene);
          if ([format,unit].some(cell=>cell && Object.values(roles).some(role=>role.test(normalize(cell.text))))) break;
          if (!format || !unit) continue;
          const field=adFields.find(field=>formats[field.type]?.test(normalize(format.text)));
          if (!field || !field.value.test(unit.text) || readPlatform(get(group.platform)?.text||"")==="ios") continue;
          pairs.push([
            {...format},
            ...(scene && /^[\p{L}\d_. -]{1,60}$/u.test(scene.text) ? [{...scene}] : []),
            {...unit, field:field.key, ...(platform ? {platform} : {})},
          ]);
          if (pairs.length>1500) throw Error("广告位候选过多，请导入仅包含本次游戏的表格。");
        }
      }
    }
    return {pairs,platformAt};
  }
  const across=scan(rows,"c",true),down=scan(cols,"r",false);
  return {
    pairs:[...across.pairs,...down.pairs],
    platformAt:(r,c)=>across.platformAt(r,c)||down.platformAt(c,r),
  };
}
