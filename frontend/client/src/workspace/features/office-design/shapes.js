// Pure SVG primitives and an editable example; no DOM, network, or persistence.
const officeDesignShapes = {
  room: { label: 'Ruangan', width: 240, height: 180 },
  wall: { label: 'Dinding', width: 240, height: 8 },
  door: { label: 'Pintu', width: 70, height: 70 },
  window: { label: 'Jendela', width: 100, height: 8 },
  desk: { label: 'Meja kerja', width: 110, height: 65 },
  meeting: { label: 'Meja rapat', width: 260, height: 130 },
  chair: { label: 'Kursi', width: 40, height: 40 },
  sofa: { label: 'Sofa', width: 65, height: 160 },
  toilet: { label: 'Toilet', width: 45, height: 55 },
  sink: { label: 'Wastafel', width: 45, height: 40 },
  plant: { label: 'Tanaman', width: 45, height: 45 },
  label: { label: 'Teks', width: 140, height: 30 }
};
function officeShapeSvg(node, escape) {
  const w = node.width, h = node.height;
  const rect = (x, y, width, height, fill, rx = 0, stroke = '#6e675e') => `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="1.3"/>`;
  const ellipse = (cx, cy, rx, ry, fill) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="#756c63" stroke-width="1.2"/>`;
  const text = (label, y = h / 2, size = 12) => `<text x="${w / 2}" y="${y}" text-anchor="middle" dominant-baseline="middle" font-family="Arial,sans-serif" font-size="${size}" fill="#4b453f">${escape(label)}</text>`;
  let body = '';
  switch (node.type) {
    case 'room': body = rect(0, 0, w, h, '#f1e9dc', 0, '#252525') + text(node.label, 20); break;
    case 'wall': body = rect(0, 0, w, h, '#242424', 0, '#242424'); break;
    case 'window': body = rect(0, 0, w, h, '#e6f2f7', 0, '#515151') + `<path d="M0 ${h / 2}H${w}" stroke="#919e9e"/>`; break;
    case 'door': body = rect(0, 0, w, h, '#f4efe6', 0, 'none') + `<path d="M0 0V${h}M0 0H${w}M0 ${h}A${w} ${h} 0 0 0 ${w} 0" fill="none" stroke="#80766a" stroke-width="1.5"/>`; break;
    case 'desk': body = rect(0, 0, w, h * .75, '#9a8278') + rect(w * .27, h * .76, w * .46, h * .24, '#c5b9af', 6); break;
    case 'meeting': {
      for (const fraction of [.25, .45, .65, .85]) {
        body += rect(w * fraction - w * .055, 0, w * .11, h * .22, '#cbbeb3', 5);
        body += rect(w * fraction - w * .055, h * .78, w * .11, h * .22, '#cbbeb3', 5);
      }
      body += ellipse(w / 2, h / 2, w * .49, h * .34, '#998078'); break;
    }
    case 'chair': body = rect(0, h * .15, w, h * .85, '#cbbeb3', 7) + rect(0, 0, w, h * .25, '#a39489', 4); break;
    case 'sofa': body = rect(0, 0, w, h, '#f8cf75', 6) + rect(w * .2, h * .05, w * .75, h * .9, '#ffdf91', 4) + `<path d="M${w * .2} ${h / 3}H${w * .95}M${w * .2} ${h * 2 / 3}H${w * .95}" stroke="#c9a357"/>`; break;
    case 'toilet': body = rect(w * .1, 0, w * .8, h * .3, '#fff', 3) + ellipse(w / 2, h * .61, w * .43, h * .37, '#fff') + ellipse(w / 2, h * .62, w * .25, h * .23, '#e4e8e7'); break;
    case 'sink': body = rect(0, 0, w, h, '#fff', 4) + ellipse(w / 2, h * .58, w * .35, h * .3, '#e4e8e7') + `<path d="M${w / 2} 0v${h * .35}" stroke="#646d70" stroke-width="3"/>`; break;
    case 'plant': body = ellipse(w / 2, h / 2, w * .37, h * .37, '#bba78c') + `<path d="M${w / 2} ${h / 2}Q0 0 ${w / 2} 5Q${w} 0 ${w / 2} ${h / 2}Q${w} ${h} ${w / 2} ${h - 5}Q0 ${h} ${w / 2} ${h / 2}" fill="#279c63"/>`; break;
    case 'label': body = text(node.label, h / 2, Math.min(24, h * .6)); break;
  }
  return `<g transform="translate(${node.x} ${node.y}) rotate(${node.rotation} ${w / 2} ${h / 2})"><rect width="${w}" height="${h}" fill="transparent"/>${body}</g>`;
}
function officeExampleLayout() {
  let serial = 0;
  const nodes = [];
  const add = (type, x, y, width, height, label = '', rotation = 0) => nodes.push({ id: `sample-${++serial}`, type, x, y, width, height, label, rotation });
  add('room', 380, 30, 590, 210, 'Ruang rapat');
  add('room', 30, 150, 350, 360, 'Resepsionis / lounge');
  add('room', 380, 240, 430, 270, 'Area bersama');
  add('room', 810, 240, 160, 135, 'Toilet');
  add('room', 810, 375, 160, 135, 'Toilet');
  add('room', 30, 510, 190, 260, 'Pantry');
  add('room', 220, 510, 220, 260, 'Ruang kerja 1');
  add('room', 440, 510, 220, 260, 'Ruang kerja 2');
  add('room', 660, 510, 310, 260, 'Ruang pimpinan');
  for (const [x, y, w, h] of [[380,30,590,7],[380,30,7,120],[30,150,350,7],[30,150,7,620],[30,763,940,7],[963,30,7,740],[380,233,590,7],[30,503,940,7],[803,240,7,270],[810,370,160,7],[213,510,7,260],[433,510,7,260],[653,510,7,260]]) add('wall', x, y, w, h);
  add('meeting', 540, 82, 320, 120);
  add('sofa', 50, 280, 70, 180);
  add('desk', 270, 620, 120, 80);
  add('desk', 490, 620, 120, 80);
  add('desk', 740, 615, 150, 85);
  add('desk', 70, 640, 100, 70);
  add('plant', 905, 62, 45, 45);
  add('plant', 900, 700, 45, 45);
  add('plant', 140, 430, 45, 45);
  add('toilet', 910, 300, 40, 50);
  add('toilet', 910, 430, 40, 50);
  add('sink', 910, 260, 40, 35);
  add('sink', 910, 390, 40, 35);
  for (const [x,y] of [[145,150],[600,233],[810,290],[810,420],[80,503],[240,503],[460,503],[690,503]]) add('door', x, y, 65, 65);
  for (const [x,y,w] of [[510,30,110],[760,30,110],[80,763,100],[280,763,110],[500,763,110],[770,763,130]]) add('window', x, y, w, 7);
  return { width: 1000, height: 800, nodes };
}
